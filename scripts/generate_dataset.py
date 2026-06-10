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
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "data" / "curated_seed.json"
OUT = ROOT / "js" / "data.js"

# Don't serve a team-decade with fewer than this many players.
MIN_ROSTER = 10

CSV_URL = (
    "https://raw.githubusercontent.com/fivethirtyeight/"
    "nba-player-advanced-metrics/master/nba-data-historical.csv"
)
CSV_CACHE = ROOT / "data" / "nba-data-historical.csv"

# Player box scores (2010-2024) with real, separate steals & blocks. Used to
# build current (2020s) rosters, which the 538 set (ends 2020) doesn't cover.
BOX_BASE = (
    "https://raw.githubusercontent.com/NocturneBear/NBA-Data-2010-2024/main/"
)
BOX_FILES = [
    "regular_season_box_scores_2010_2024_part_1.csv",
    "regular_season_box_scores_2010_2024_part_2.csv",
    "regular_season_box_scores_2010_2024_part_3.csv",
]

# Box-score short team name -> franchise display name (current identities;
# we only read 2021+ rows, so names are unambiguous).
BOX_TEAMS = {
    "76ers": "Philadelphia 76ers", "Bucks": "Milwaukee Bucks",
    "Bulls": "Chicago Bulls", "Cavaliers": "Cleveland Cavaliers",
    "Celtics": "Boston Celtics", "Clippers": "Los Angeles Clippers",
    "Grizzlies": "Memphis Grizzlies", "Hawks": "Atlanta Hawks",
    "Heat": "Miami Heat", "Hornets": "Charlotte Hornets", "Jazz": "Utah Jazz",
    "Kings": "Sacramento Kings", "Knicks": "New York Knicks",
    "Lakers": "Los Angeles Lakers", "Magic": "Orlando Magic",
    "Mavericks": "Dallas Mavericks", "Nets": "Brooklyn Nets",
    "Nuggets": "Denver Nuggets", "Pacers": "Indiana Pacers",
    "Pelicans": "New Orleans Pelicans", "Pistons": "Detroit Pistons",
    "Raptors": "Toronto Raptors", "Rockets": "Houston Rockets",
    "Spurs": "San Antonio Spurs", "Suns": "Phoenix Suns",
    "Thunder": "Oklahoma City Thunder", "Timberwolves": "Minnesota Timberwolves",
    "Trail Blazers": "Portland Trail Blazers", "Warriors": "Golden State Warriors",
    "Wizards": "Washington Wizards",
}

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


def played(minutes: str) -> bool:
    """True if the player actually logged time (box scores include DNP rows)."""
    m = (minutes or "").strip()
    if not m:
        return False
    if ":" in m:
        mm, _, ss = m.partition(":")
        return (num(mm) or 0) > 0 or (num(ss) or 0) > 0
    return (num(m) or 0) > 0


def infer_positions(coarse, ppg, rpg, apg, bpg):
    """Map the box score's coarse G/F/C (often blank) to finer eligibility."""
    if coarse == "G":
        return ["PG", "SG"]
    if coarse == "F":
        return ["SF", "PF"]
    if coarse == "C":
        return ["C", "PF"]
    # Blank -> infer from production.
    if rpg >= 7 or bpg >= 0.9:
        return ["PF", "C"]
    if apg >= 4:
        return ["PG", "SG"]
    return ["SF", "SG"]


def load_box_rows():
    rows = []
    for fname in BOX_FILES:
        cache = ROOT / "data" / fname
        if cache.exists():
            text = cache.read_text(encoding="utf-8", errors="replace")
        else:
            print(f"Downloading {fname} ...")
            with urllib.request.urlopen(BOX_BASE + fname, timeout=180) as resp:
                text = resp.read().decode("utf-8", errors="replace")
            cache.write_text(text, encoding="utf-8")
        rows.extend(csv.DictReader(io.StringIO(text)))
    return rows


def build_from_boxscores(min_end_year=2021):
    """Aggregate real per-game stats for current (2020s) players, by team."""
    rows = load_box_rows()
    agg: dict = defaultdict(lambda: {
        "gp": 0, "pts": 0.0, "reb": 0.0, "ast": 0.0, "stl": 0.0, "blk": 0.0,
        "pos": Counter(),
    })
    for r in rows:
        end_year = int(r["season_year"][:4]) + 1
        if end_year < min_end_year:
            continue
        if not played(r.get("minutes")):
            continue
        team = BOX_TEAMS.get((r.get("teamName") or "").strip())
        if not team:
            continue
        key = (team, r["personName"])
        a = agg[key]
        a["gp"] += 1
        a["pts"] += num(r["points"]) or 0
        a["reb"] += num(r["reboundsTotal"]) or 0
        a["ast"] += num(r["assists"]) or 0
        a["stl"] += num(r["steals"]) or 0
        a["blk"] += num(r["blocks"]) or 0
        pos = (r.get("position") or "").strip()
        if pos:
            a["pos"][pos] += 1

    roster = defaultdict(list)
    for (team, name), a in agg.items():
        gp = a["gp"]
        if gp < 20:  # drop deep-bench cups of coffee
            continue
        ppg = round(a["pts"] / gp, 1)
        rpg = round(a["reb"] / gp, 1)
        apg = round(a["ast"] / gp, 1)
        spg = round(a["stl"] / gp, 1)
        bpg = round(a["blk"] / gp, 1)
        coarse = a["pos"].most_common(1)[0][0] if a["pos"] else None
        roster[team].append({
            "name": name, "pos": infer_positions(coarse, ppg, rpg, apg, bpg),
            "ppg": ppg, "rpg": rpg, "apg": apg, "spg": spg, "bpg": bpg,
        })
    return roster


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

    # Current era (2020s) from real box scores — the 538 set ends at 2020.
    box_2020s = build_from_boxscores(min_end_year=2021)
    rosters["2020s"] = box_2020s
    print(f"Built 2020s from box scores: "
          f"{sum(len(v) for v in box_2020s.values())} players")

    seed = json.loads(SEED.read_text(encoding="utf-8")) if SEED.exists() else {}
    added = merge_curated(rosters, seed)
    print(f"Merged {added} curated players into the gaps")

    # Drop team-decade combos that are too thin to be fun to roll. This also
    # clears redundant historical-name duplicates (e.g. a sparse "Seattle
    # SuperSonics" alongside the deep "Oklahoma City Thunder" franchise).
    dropped = 0
    for decade in list(rosters.keys()):
        for team in list(rosters[decade].keys()):
            if len(rosters[decade][team]) < MIN_ROSTER:
                del rosters[decade][team]
                dropped += 1
    print(f"Dropped {dropped} combos with fewer than {MIN_ROSTER} players")

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
