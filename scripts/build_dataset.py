#!/usr/bin/env python3
"""
build_dataset.py — regenerate js/data.js with verified career stats via nba_api.

The game ships with a curated, hand-approximated dataset (js/data.js). This
script replaces the per-game averages in that dataset with REAL career numbers
pulled from stats.nba.com through the `nba_api` package, while keeping the
hand-curated structure (which franchise/decade each player belongs to, and the
court positions they're eligible for — neither of which nba_api exposes cleanly).

WHY IT'S A SEPARATE BUILD STEP
------------------------------
`nba_api` makes live HTTP calls to stats.nba.com. That host is unreachable from
some sandboxed/CI environments (e.g. the one this repo may have been generated
in). Run this where stats.nba.com IS reachable: your local machine, or a normal
GitHub Actions runner.

USAGE
-----
    pip install nba_api
    python scripts/build_dataset.py            # rewrites js/data.js in place
    python scripts/build_dataset.py --dry-run  # report only, write nothing
    python scripts/build_dataset.py --out js/data.generated.js

WHAT IT DOES
------------
1. Parses the player roster (names + positions + decade + team) out of the
   existing js/data.js so the curated structure is the source of truth.
2. For each unique player name, resolves their player id and pulls
   PlayerCareerStats (regular season career totals), computing per-game
   PPG / RPG / APG / SPG / BPG.
3. Writes a new js/data.js with the real averages substituted in. Players that
   can't be resolved keep their existing curated numbers (and are reported).

NOTES
-----
* Steals/blocks didn't exist before 1973-74; nba_api returns 0 for those
  seasons, so career SPG/BPG for very old players will read low/zero. The script
  preserves the curated estimate when the API returns 0 for a pre-1974-heavy
  career (see KEEP_ESTIMATE_IF_ZERO).
* A player who appears in multiple decades (e.g. LeBron) shares one career line
  in the source game, which is fine — the game treats each (decade, team) entry
  independently and the averages are career figures either way.
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_JS = ROOT / "js" / "data.js"

# If the API reports 0 steals/blocks (common for pre-1974 careers), keep the
# curated estimate rather than zeroing a Hall-of-Fame defender.
KEEP_ESTIMATE_IF_ZERO = {"spg", "bpg"}

# nba_api can rate-limit; be polite.
REQUEST_PAUSE_SECONDS = 0.6


def load_nba_api():
    try:
        from nba_api.stats.endpoints import playercareerstats  # noqa: F401
        from nba_api.stats.static import players as static_players  # noqa: F401
    except ImportError:
        sys.exit(
            "nba_api is not installed.\n"
            "  pip install nba_api\n"
            "and run this from a machine where stats.nba.com is reachable."
        )
    return playercareerstats, static_players


# --- Parsing the curated dataset -------------------------------------------
# Each player line looks like:
#   p("Wilt Chamberlain", ["C"], 39.6, 25.1, 4.6, 1.6, 3.5),
PLAYER_RE = re.compile(
    r'p\(\s*"(?P<name>[^"]+)"\s*,\s*\[(?P<pos>[^\]]*)\]\s*,'
    r"\s*(?P<ppg>[-\d.]+)\s*,\s*(?P<rpg>[-\d.]+)\s*,\s*(?P<apg>[-\d.]+)\s*,"
    r"\s*(?P<spg>[-\d.]+)\s*,\s*(?P<bpg>[-\d.]+)\s*\)"
)


def parse_players(text: str) -> list[dict]:
    out = []
    for m in PLAYER_RE.finditer(text):
        out.append(
            {
                "name": m.group("name"),
                "span": m.span(),
                "stats": {
                    "ppg": float(m.group("ppg")),
                    "rpg": float(m.group("rpg")),
                    "apg": float(m.group("apg")),
                    "spg": float(m.group("spg")),
                    "bpg": float(m.group("bpg")),
                },
            }
        )
    return out


# --- Fetching real career averages -----------------------------------------
def career_averages(name, playercareerstats, static_players, cache):
    if name in cache:
        return cache[name]

    matches = static_players.find_players_by_full_name(name)
    if not matches:
        cache[name] = None
        return None

    pid = matches[0]["id"]
    try:
        career = playercareerstats.PlayerCareerStats(player_id=pid, timeout=30)
        rows = career.get_normalized_dict().get("CareerTotalsRegularSeason", [])
    except Exception as exc:  # network/parse errors -> keep curated
        print(f"  ! {name}: API error ({exc.__class__.__name__})")
        cache[name] = None
        return None
    finally:
        time.sleep(REQUEST_PAUSE_SECONDS)

    if not rows:
        cache[name] = None
        return None

    t = rows[0]
    gp = t.get("GP") or 0
    if not gp:
        cache[name] = None
        return None

    avg = {
        "ppg": round(t.get("PTS", 0) / gp, 1),
        "rpg": round(t.get("REB", 0) / gp, 1),
        "apg": round(t.get("AST", 0) / gp, 1),
        "spg": round(t.get("STL", 0) / gp, 1),
        "bpg": round(t.get("BLK", 0) / gp, 1),
    }
    cache[name] = avg
    return avg


def fmt(v: float) -> str:
    return f"{v:g}"


def rebuild(text: str, players, fetch) -> tuple[str, dict]:
    report = {"updated": 0, "kept": 0, "unresolved": []}
    # Rewrite from the end so earlier spans stay valid.
    pieces = []
    last = len(text)
    seen = set()
    for pl in sorted(players, key=lambda x: x["span"][0], reverse=True):
        name = pl["name"]
        start, end = pl["span"]
        real = fetch(name)
        if real is None:
            if name not in seen:
                report["unresolved"].append(name)
            stats = pl["stats"]
            report["kept"] += 1
        else:
            stats = dict(pl["stats"])
            for k, v in real.items():
                if k in KEEP_ESTIMATE_IF_ZERO and v == 0:
                    continue  # preserve curated estimate
                stats[k] = v
            report["updated"] += 1
        seen.add(name)
        pos_segment = text[start:end].split("], ", 1)[0] + "], "
        new_line = (
            f'{pos_segment}{fmt(stats["ppg"])}, {fmt(stats["rpg"])}, '
            f'{fmt(stats["apg"])}, {fmt(stats["spg"])}, {fmt(stats["bpg"])})'
        )
        pieces.append(text[end:last])
        pieces.append(new_line)
        last = start
    pieces.append(text[:last])
    return "".join(reversed(pieces)), report


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="report only; write nothing")
    ap.add_argument("--out", default=str(DATA_JS), help="output path (default: js/data.js)")
    args = ap.parse_args()

    text = DATA_JS.read_text(encoding="utf-8")
    players = parse_players(text)
    print(f"Parsed {len(players)} player entries from {DATA_JS.relative_to(ROOT)}")

    playercareerstats, static_players = load_nba_api()
    cache: dict = {}

    def fetch(name):
        return career_averages(name, playercareerstats, static_players, cache)

    new_text, report = rebuild(text, players, fetch)

    print(
        f"\nUpdated with real stats: {report['updated']}  |  kept curated: {report['kept']}"
    )
    if report["unresolved"]:
        uniq = sorted(set(report["unresolved"]))
        print(f"Could not resolve ({len(uniq)}): {', '.join(uniq)}")

    if args.dry_run:
        print("\n--dry-run: no files written.")
        return

    Path(args.out).write_text(new_text, encoding="utf-8")
    print(f"\nWrote {args.out}")


if __name__ == "__main__":
    main()
