# Costimator

Recipe and menu costing for hospitality kitchens. Build an ingredient library
from what you actually buy, assemble recipes and sub-recipes from it, and see
portion cost, gross profit and menu performance update as you type.

An independent build — not affiliated with, or derived from the code of, any
commercial costing product.

## Run it

Static site, no build step:

```bash
# open directly
open index.html            # macOS  (xdg-open on Linux)

# …or serve it (recommended — service worker and export need http://)
npm start                  # python3 -m http.server 8000
# then visit http://localhost:8000
```

It ships with a sample poultry-and-pub-menu dataset so there's something to look
at on first open. **Data** → *Delete everything* clears it when you're ready to
put your own numbers in.

## What it does

**Ingredients** — what you buy, at the pack size you buy it in. Enter a 10 kg
box at $62.50 and it works out the cost per gram. A **yield %** covers what you
lose to trim, peel or bone-out: a whole bird at 68% usable costs you 1/0.68 more
per usable gram than the invoice suggests, and that's the figure recipes are
costed on. Optional **density (g/ml)** lets an item bought by volume be used by
weight, or the reverse.

**Recipes** — lines of ingredients *and other recipes*. A crumb mix costed once
as a 5 kg batch becomes a per-gram component of every dish that uses it, so a
flour price rise flows through automatically. Set portions per batch and a
**batch wastage %** for cooking loss.

**Bought-in finished products** — things you buy ready to cook rather than make,
like a premade crumbed schnitzel from G&T Chickens. Tick *finished product* on
the ingredient, give it the supplier's product code, and it costs like anything
else. Use it as a plain recipe line for a dish you never make yourself.

**Make or buy** — where you could do either, put both on the same line: press
**⇄** and pick the bought-in equivalent. The line then carries a *make / buy*
switch, and the recipe shows what each way costs per serve and across your
volumes:

> Making it here is **$0.46** a serve cheaper (11.1%) — **$82.49** across 180 serves.

The swap lives on the line, not the dish, because a plate is rarely only the
swapped item — buy the schnitzel in and you still serve the chips. Both sides
count everything else on the plate, so you're comparing whole plates. The
dashboard flags any dish currently costed on the dearer of its two sources.

**Pricing** — enter the menu price inc GST; GP is worked on the ex-GST price,
since the GST was never yours. You get GP $, GP %, food cost % and the price
that would hit your target GP. Dishes below target are flagged.

**Dashboard** — weighted GP across the menu (weighted by units sold, so it
reflects what actually leaves the pass), revenue, COGS, and menu-engineering
quadrants:

| | Sells well | Sells poorly |
|---|---|---|
| **High margin** | Star — protect it | Puzzle — push it |
| **Low margin** | Plowhorse — trim cost or raise price | Dog — rework or cut |

**Price impact** — put a supplier increase through the whole menu before it
lands on your invoice. Enter `12` against chicken breast and you get every
affected dish, the cost movement, the GP before and after, and which dishes drop
below target.

**Scaling** — rescale a recipe to any portion count; quantities and batch yield
move with it, portion cost stays put.

## Where the data lives

In your browser's `localStorage`, on the machine you're using. Nothing is sent
anywhere — the app works offline once loaded (it registers a service worker).

That also means **clearing site data wipes it**. Use **Data → Export JSON** for
backups, and Import to restore or move between machines.

## Project layout

```
index.html                # screens: dashboard, recipes, ingredients, impact, data
css/styles.css            # styling
js/units.js               # unit conversion — mass/volume/count, density-aware
js/costing.js             # the costing engine (pure functions, no DOM)
js/store.js               # localStorage persistence, sample data, import/export
js/app.js                 # rendering and interaction
js/tests.js               # engine tests
tests/smoke.js            # browser test — drives the real UI
scripts/make_icons.py     # regenerate app icons
sw.js                     # offline cache
```

## Tests

```bash
npm test              # costing engine — 86 assertions, no dependencies
npm run test:browser  # drives the real UI in Chromium (needs: npm install)
```

The engine tests are worked longhand — a chef's check of the arithmetic — and
cover unit conversion, yield inflation, sub-recipe roll-up, wastage, GP and
target pricing, scaling, menu roll-up, make-or-buy and price impact, plus the
guard rails (circular sub-recipe references, missing items, impossible unit
conversions, broken bought-in references).

If Playwright's bundled Chromium isn't the one you want:

```bash
CHROMIUM_PATH=/path/to/chrome npm run test:browser
```

## Deliberate choices

- **Unit conversions refuse to guess.** Converting grams to millilitres without
  a density, or grams to "each", raises an error on the line rather than
  producing a number. A silently wrong conversion is a silently wrong food cost.
- **Yield is separate from wastage.** Yield is loss on the ingredient (trim,
  peel, bone-out); wastage is loss on the batch (cooking loss, spills). They
  compound differently and mixing them hides where money goes.
- **GP on the ex-GST price.** Costing against the tax-inclusive price overstates
  margin by the GST rate.
- **Sub-recipe faults propagate.** A broken line three levels down surfaces on
  the dish that depends on it, instead of quietly costing as zero.
- **Make-or-buy swaps a line, not a dish.** Swapping the whole recipe would drop
  the sides from the cost the moment you switched to the bought-in product. The
  line-level swap keeps the rest of the plate on both sides of the comparison.
- **A broken bought-in reference falls back to making it.** The dish stays
  costed and the fault is reported, rather than the menu quietly reading zero.
