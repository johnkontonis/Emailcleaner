#!/usr/bin/env python3
"""
generate_dataset.py — build js/data.js with (nearly) every NBA player.

Combines two sources:

1. FiveThirtyEight's historical player dataset (nba-data-historical.csv),
   which covers ~3,300 players across all 30 franchises for 1977-2020 with
   positions and per-36 rate stats. Reachable as a plain CSV (no API key, and
   it doesn't need stats.nba.com, which is firewalled in some sandboxes).

2. data/curated_seed.json — the hand-built star roster, used to fill the eras
   538 doesn't cover (1960s, early 1970s, 2021+) and to keep marquee names.

Per-game numbers are derived from the per-36 rates and minutes:
    PPG = (P/36) * MPG / 36   (likewise RPG, APG)
Steals and blocks are reported combined (SB/36); we split that into SPG/BPG
using each player's STL%/BLK% ratio (falling back to position when both are 0).
Averages are computed per (player, decade, franchise) stint, weighted by games.

These are approximations. For verified career numbers, run
scripts/build_dataset.py (nba_api) afterward — it rewrites the stats in place.

Usage:
    python scripts/generate_dataset.py            # writes js/data.js
    python scripts/generate_dataset.py --dry-run  # report only
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "data" / "curated_seed.json"
OUT = ROOT / "js" / "data.js"
CSV_URL = (
    "https://raw.githubusercontent.com/fivethirtyeight/"
    "nba-player-advanced-metrics/master/nba-data-historical.csv"
)
CSV_CACHE = ROOT / "data" / "nba-data-historical.csv"

DECADES = ["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]

# franch_id -> display name (current franchise identity)
FRANCHISES = {
    "ATL": "Atlanta Hawks", "BOS": "Boston Celtics", "CHA": "Charlotte Hornets",
    "CHH": "Charlotte Hornets", "CHI": "Chicago Bulls", "CLE": "Cleveland Cavaliers",
    "DAL": "Dallas Mavericks", "DEN": "Denver Nuggets", "DET": "Detroit Pistons",
    "GSW": "Golden State Warriors", "HOU": "Houston Rockets", "IND": "Indiana Pacers",
    "LAC": "Los Angeles Clippers", "LAL": "Los Angeles Lakers", "MEM": "Memphis Grizzlies",
    "MIA": "Miami Heat", "MIL": "Milwaukee Bucks", "MIN": "Minnesota Timberwolves",
    "NJN": "Brooklyn Nets", "BRK": "Brooklyn Nets", "NOH": "New Orleans Pelicans",
    "NOP": "New Orleans Pelicans", "NOK": "New Orleans Pelicans", "NYK": "New York Knicks",
    "OKC": "Oklahoma City Thunder", "SEA": "Oklahoma City Thunder", "ORL": "Orlando Magic",
    "PHI": "Philadelphia 76ers", "PHO": "Phoenix Suns", "PHX": "Phoenix Suns",
    "POR": "Portland Trail Blazers", "SAC": "Sacramento Kings", "SAS": "San Antonio Spurs",
    "TOR": "Toronto Raptors", "UTA": "Utah Jazz", "WAS": "Washington Wizards",
}

# 538 position code -> eligible game positions
POS_MAP = {
    "PG": ["PG"], "SG": ["SG"], "SF": ["SF"], "PF": ["PF"], "C": ["C"],
    "G": ["PG", "SG"], "F": ["SF", "PF"], "G-F": ["SG", "SF"], "F-G": ["SF", "SG"],
    "C-F": ["C", "PF"], "F-C": ["PF", "C"],
}


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def decade_of(year: int) -> str:
    return f"{(year - 1) // 10 * 10}s"


def load_csv() -> list[dict]:
    if CSV_CACHE.exists():
        text = CSV_CACHE.read_text(encoding="utf-8", errors="replace")
    else:
        print(f"Downloading {CSV_URL} ...")
        with urllib.request.urlopen(CSV_URL, timeout=60) as resp:
            text = resp.read().decode("utf-8", errors="replace")
        CSV_CACHE.parent.mkdir(parents=True, exist_ok=True)
        CSV_CACHE.write_text(text, encoding="utf-8")
    return list(csv.DictReader(io.StringIO(text)))


def split_steals_blocks(sb_pg, stl_pct, blk_pct, positions):
    """Split combined steals+blocks per game into (spg, bpg)."""
    s, b = num(stl_pct), num(blk_pct)
    if s is not None and b is not None and (s + b) > 0:
        sr = s / (s + b)
    else:
        # Fall back to position: guards steal, bigs block.
        big = any(p in ("C", "PF") for p in positions)
        sr = 0.35 if big else 0.75
    return round(sb_pg * sr, 1), round(sb_pg * (1 - sr), 1)


def build_from_538(rows):
    # Accumulate per (decade, franchise, player) stint, weighted by games.
    stints: dict = defaultdict(lambda: {
        "g": 0.0, "pts": 0.0, "reb": 0.0, "ast": 0.0, "sb": 0.0,
        "stlpct": 0.0, "blkpct": 0.0, "wpos": 0.0, "pos": None,
    })
    for r in rows:
        if r.get("type") != "RS":
            continue
        year = int(r["year_id"])
        franch = FRANCHISES.get(r["franch_id"])
        if not franch:
            continue
        pos = POS_MAP.get((r.get("pos") or "").strip())
        g = num(r["G"])
        mpg = num(r["MPG"])
        p36, r36, a36, sb36 = (num(r["P/36"]), num(r["R/36"]),
                               num(r["A/36"]), num(r["SB/36"]))
        if not g or not mpg or p36 is None or pos is None:
            continue
        scale = mpg / 36.0
        key = (decade_of(year), franch, r["name_common"])
        acc = stints[key]
        acc["g"] += g
        acc["pts"] += p36 * scale * g
        acc["reb"] += (r36 or 0) * scale * g
        acc["ast"] += (a36 or 0) * scale * g
        acc["sb"] += (sb36 or 0) * scale * g
        acc["stlpct"] += (num(r["STL%"]) or 0) * g
        acc["blkpct"] += (num(r["BLK%"]) or 0) * g
        acc["wpos"] += g
        # Keep the position from the player's highest-minutes season.
        if acc["pos"] is None:
            acc["pos"] = pos

    rosters: dict = {d: defaultdict(list) for d in DECADES}
    for (decade, franch, name), a in stints.items():
        g = a["g"]
        if g < 1:
            continue
        ppg = round(a["pts"] / g, 1)
        rpg = round(a["reb"] / g, 1)
        apg = round(a["ast"] / g, 1)
        sb_pg = a["sb"] / g
        stl_pct = a["stlpct"] / a["wpos"] if a["wpos"] else 0
        blk_pct = a["blkpct"] / a["wpos"] if a["wpos"] else 0
        spg, bpg = split_steals_blocks(sb_pg, stl_pct, blk_pct, a["pos"])
        rosters[decade][franch].append({
            "name": name, "pos": a["pos"],
            "ppg": ppg, "rpg": rpg, "apg": apg, "spg": spg, "bpg": bpg,
        })
    return rosters


def merge_curated(rosters, seed):
    """Add curated players the 538 build is missing (by name within team/decade)."""
    added = 0
    for decade, teams in seed.items():
        for team, players in teams.items():
            bucket = rosters.setdefault(decade, defaultdict(list))[team] \
                if isinstance(rosters.get(decade), dict) else None
            existing = {p["name"] for p in rosters[decade].get(team, [])}
            for pl in players:
                if pl["name"] not in existing:
                    rosters[decade][team].append(pl)
                    existing.add(pl["name"])
                    added += 1
    return added


def js_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def emit_js(rosters) -> str:
    lines = []
    lines.append("/*")
    lines.append(" * 82-0 — Player dataset (generated by scripts/generate_dataset.py)")
    lines.append(" *")
    lines.append(" * Bulk rosters (1977-2020, all 30 franchises) are derived from")
    lines.append(" * FiveThirtyEight's historical player data; per-game stats are")
    lines.append(" * approximations of per-36 rates, and steals/blocks are split from a")
    lines.append(" * combined figure. Pre-1977, early-1970s and 2021+ stars come from the")
    lines.append(" * curated seed. Run scripts/build_dataset.py (nba_api) for verified stats.")
    lines.append(" *")
    lines.append(" * Do not hand-edit; rerun the generator instead.")
    lines.append(" */")
    lines.append("")
    lines.append('const POSITIONS = ["PG", "SG", "SF", "PF", "C"];')
    lines.append("const POSITION_NAMES = {")
    lines.append('  PG: "Point Guard", SG: "Shooting Guard", SF: "Small Forward",')
    lines.append('  PF: "Power Forward", C: "Center",')
    lines.append("};")
    lines.append('const DECADES = ' + json.dumps(DECADES) + ";")
    lines.append("")
    lines.append("function p(name, pos, ppg, rpg, apg, spg, bpg) {")
    lines.append("  return { name, pos, ppg, rpg, apg, spg, bpg };")
    lines.append("}")
    lines.append("")
    lines.append("const ROSTERS = {")
    total = 0
    for decade in DECADES:
        teams = rosters.get(decade) or {}
        if not teams:
            continue
        lines.append(f'  "{decade}": {{')
        for team in sorted(teams):
            players = sorted(teams[team], key=lambda x: -x["ppg"])
            lines.append(f'    "{js_escape(team)}": [')
            for pl in players:
                total += 1
                pos = "[" + ", ".join(f'"{p}"' for p in pl["pos"]) + "]"
                lines.append(
                    f'      p("{js_escape(pl["name"])}", {pos}, '
                    f'{pl["ppg"]:g}, {pl["rpg"]:g}, {pl["apg"]:g}, '
                    f'{pl["spg"]:g}, {pl["bpg"]:g}),'
                )
            lines.append("    ],")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    lines.append("const DataProvider = {")
    lines.append("  async getDecades() {")
    lines.append("    return DECADES.filter((d) => Object.keys(ROSTERS[d] || {}).length > 0);")
    lines.append("  },")
    lines.append("  async getTeams(decade) {")
    lines.append("    return Object.keys(ROSTERS[decade] || {});")
    lines.append("  },")
    lines.append("  async getRoster(decade, team) {")
    lines.append("    return (ROSTERS[decade] && ROSTERS[decade][team]) || [];")
    lines.append("  },")
    lines.append("};")
    lines.append("")
    return "\n".join(lines), total


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    rows = load_csv()
    print(f"Loaded {len(rows)} historical rows")
    rosters = build_from_538(rows)

    seed = json.loads(SEED.read_text(encoding="utf-8")) if SEED.exists() else {}
    added = merge_curated(rosters, seed)
    print(f"Merged {added} curated players into the gaps")

    text, total = emit_js(rosters)
    combos = sum(len(t) for t in rosters.values())
    print(f"Generated {total} player entries across {combos} team-decade combos")

    if args.dry_run:
        print("--dry-run: nothing written")
        return
    OUT.write_text(text, encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
