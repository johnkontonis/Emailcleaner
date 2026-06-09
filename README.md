# 82-0

A fan recreation of the viral **82-0** NBA team-builder game. The slot machine
deals you a random franchise and decade each round; you pick one player and slot
him at an open court position he actually played. Fill all five spots — PG, SG,
SF, PF, C — each from a different era, then watch the engine simulate your season
into a record somewhere between **0–82 and 82–0**.

## Play it

It's a static site with no build step. Either:

```bash
# open directly
open index.html            # macOS  (xdg-open on Linux)

# …or serve it (recommended, avoids file:// quirks)
python3 -m http.server 8000
# then visit http://localhost:8000
```

## How the game works

- **Slot machine** — each round locks in a random *unused* decade and a random
  franchise from that decade.
- **Pick & place** — choose one player from the rolled roster and place him at an
  open position he's eligible for.
- **Era diversity** — five rounds, five different decades (1960s–2020s).
- **Skips** — one **team skip** (re-roll the franchise, keep the decade) and one
  **era skip** (re-roll the decade) per game.
- **Modes**
  - **Classic** — career stats are shown on every player card.
  - **Hoop IQ** — stats are hidden; pick on knowledge alone.
- **Simulation** — combined PPG / RPG / APG / SPG / BPG are normalized against an
  "elite lineup" baseline into a strength rating, mapped onto a 0–82 win curve.
  A perfect **82–0** requires an elite, *balanced* roster — strong in every
  category, not just one. You also get a letter grade, your best pick, and your
  roster's biggest weakness.

## Project layout

```
index.html                      # screens: start, game, result
css/styles.css                  # styling
js/data.js                      # curated player dataset + DataProvider seam
js/game.js                      # slot machine, round flow, simulation, rendering
scripts/build_dataset.py        # regenerate js/data.js with verified stats (nba_api)
.github/workflows/refresh-stats.yml  # run the build script from CI
```

## Player data

Players are a curated set of stars by franchise and decade with **approximate
career per-game averages**. Steals and blocks weren't officially tracked before
the 1973–74 season, so for earlier players those values are fair estimates.

All data is accessed through the async `DataProvider` interface in `js/data.js`
(`getDecades`, `getTeams`, `getRoster`). To swap in a live stats API later,
reimplement those three methods to `fetch()` and return the same shapes — no
game logic needs to change.

### Upgrading to verified stats

`scripts/build_dataset.py` replaces the approximate averages with **real career
numbers** from stats.nba.com (via [`nba_api`](https://github.com/swar/nba_api)),
keeping the curated structure (each player's franchise/decade and eligible
positions — which `nba_api` doesn't expose). It must run somewhere
stats.nba.com is reachable (your machine or a GitHub Actions runner — not every
sandbox can reach it):

```bash
pip install nba_api
python scripts/build_dataset.py            # rewrite js/data.js in place
python scripts/build_dataset.py --dry-run  # report only, write nothing
```

Or trigger the **Refresh player stats** workflow from the Actions tab. Players
that can't be resolved keep their curated numbers and are reported.

> This is an independent fan project and is not affiliated with 82-0.com or the NBA.
