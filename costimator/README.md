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

**Clients & venues** — the app holds any number of clients, each a separate
business with its own library, menu, suppliers and orders; switch between them
from the header. Within a client, recipes, ingredients and supplier pricing are
shared across the whole group — a group costs one menu, not one menu per site.
What differs by site is sales: volumes are recorded per venue, and the
dashboard reads group-wide or filtered to one venue, so a dish can be a Star
across the group and a Dog at one site.

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

**Supplier prices** — an ingredient is the thing you *use*; a supplier offer is
a product you can *buy* to satisfy it. Several suppliers can compete for the
same ingredient, each with their own pack size, product code, invoice price and
**agreed price** — the figure you contracted to pay, which invoices are checked
against.

**Supplier comparison** — competing offers are normalised two ways, and the two
are never blended:

| | Piece | Pack | Per kg | Per piece |
|---|---|---|---|---|
| G&T Chickens | 300 g | $96.00 / 24 | **$13.33** | $4.000 |
| Southern Poultry | 250 g | $105.00 / 30 | $14.00 | **$3.500** |

The competitor is cheaper *per piece* and dearer *per kilo*. That is not a
contradiction — their piece is 50 g smaller. When the two measures name
different winners the app says so, because the cheaper piece is a smaller serve,
not cheaper chicken.

**What a switch is worth** — press *what if?* on any offer and the saving is
worked out across your actual sales, not per unit:

> Switching to Southern Poultry saves **$155.64**, but the piece drops from 300 g
> to 250 g (16.7% smaller) — that is a visible cut, not a free saving.
>
> **85%** of the change lands on **Schnitzel roll** — #4 of 8 by volume, 260
> sold. You are really deciding whether to put a 250 g piece on that dish to
> save $132.68 on it.

Every affected dish is listed with its volume rank, per-serve movement, period
total and share of the change — so a saving spread thinly across the menu reads
differently from one riding almost entirely on one dish.

**Purchase orders** — raise an order per venue from a supplier's products at
your **agreed prices** (the PO locks the price at order time), email it with
the PO number, and track it draft → sent → received.

**PO-to-invoice matching** — when the invoice lands, match it against its PO.
Four things can be wrong and each is kept separate:

| Bucket | Meaning | Treatment |
|---|---|---|
| Price | invoiced above the PO price | credit claimed, itemised |
| Quantity | more or fewer packs than ordered | asked about — a delivery docket, not an invoice, proves arrival |
| Never ordered | invoiced lines not on the PO | confirmation or credit requested |
| Not invoiced | ordered lines missing | chase stock, not money |

A clean match can mark the order received on the spot.

**Invoice checking** — paste or drop in a supplier invoice (CSV or tab-separated,
header optional). Every line is matched to your library by product code, then by
name, and compared against the agreed price. You get the variance per unit and
per line, what to claim, and a plain itemised adjustment email ready to send:

```
Invoice INV-88431 has been checked against our agreed pricing and 2 lines do not match.
  GT-SCH-300   Crumbed chicken schnitzel   qty 6   agreed $96.00   invoiced $99.50   variance $21.00
  GT-KIE-200   Garlic chicken kiev 200g    qty 2   agreed $88.00   invoiced $92.40   variance $8.80

Total adjustment requested: $29.80
```

Lines that can't be matched, and lines with no agreed price on file, are reported
separately rather than quietly passed.

**Stocktake** — count the shelf per venue, in packs, on a sheet grouped by
storage location. Opening balances carry over from the venue's previous count
and purchases prefill from received purchase orders, so only the closing count
is real work. Closing runs the equation that makes wastage visible:

```
actual usage      = opening + purchases − closing count
theoretical usage = what the recipes account for, at this venue's sales
variance          = actual − theoretical   →  the loss nobody planned
```

Declared yields and batch wastage are *expected* loss, so they sit in the
theoretical side — the variance is only what nothing explains: over-portioning,
prep waste, spoilage, shrinkage. Each item is valued at its current pack price
and ranked by dollar impact, and the report says it in menu terms:

> The menu says **21.1%** food cost; the stockroom says **22.2%**. The gap is
> the unexplained $235.70 — chicken breast alone carries 26% of it.

Closed stocktakes freeze their report, so later price changes don't rewrite
history. Impossible counts (more closing stock than opening + purchases can
supply) are flagged as count errors, not booked as gains; movements left
uncounted are warned about before closing, because counting-to-zero books all
of that stock as used.

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
index.html                # screens: dashboard, recipes, ingredients, suppliers, orders, invoices, data
css/styles.css            # styling
js/units.js               # unit conversion — mass/volume/count, density-aware
js/costing.js             # the costing engine (pure functions, no DOM)
js/suppliers.js           # offer comparison, switch impact, invoice reconciliation
js/store.js               # clients/venues, orders, localStorage persistence, migrations
js/app.js                 # rendering and interaction
js/tests.js               # costing engine tests
js/stocktake.js           # usage explosion, variance-to-COGS analysis
js/tests-suppliers.js     # supplier and reconciliation tests
js/tests-stocktake.js     # stocktake tests, incl. the usage=COGS invariant
tests/smoke.js            # browser test — drives the real UI
scripts/make_icons.py     # regenerate app icons
sw.js                     # offline cache
```

## Tests

```bash
npm test              # costing + supplier + stocktake engines — 225 assertions
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
- **Cost per kilo and cost per piece are never blended.** Averaging them would
  hide the only thing that matters when pieces differ in size.
- **Savings are reported against sales, not per unit.** A cent a serve on a dish
  nobody orders is noise; the same cent on a big seller is the decision. Where
  the saving concentrates is shown, because that is the dish whose spec you are
  really changing.
- **Invoice lines that can't be matched are reported, not skipped.** So are lines
  with no agreed price. A reconciliation that quietly ignores what it doesn't
  understand is worse than none.
- **Nothing is emailed automatically.** Orders and claims are drafted for you to
  read and send. See below.
- **The PO locks the agreed price at order time.** A later price-list change
  doesn't rewrite history — the invoice is matched against what was actually
  ordered.
- **Theoretical usage and menu COGS are one calculation.** The stocktake's
  "should have used", valued at raw pack prices, equals the menu's theoretical
  COGS to the cent — tested as an invariant. If the two ever disagreed, one of
  them would be lying.
- **Quantity gaps are questions, not claims.** An invoice shows what was billed,
  not what arrived; only a delivery docket proves receipt, so short and over
  deliveries are queried rather than deducted.

## Feature map against commercial kitchen platforms

Commercial products in this space (e.g. My Local Foodie's Costimator) bundle
costing with operations. Where this build stands:

| Capability | Here | Notes |
|---|---|---|
| Recipe / sub-recipe costing, yields, GP | ✔ | |
| Multi-venue groups | ✔ | shared menu, per-venue sales |
| Supplier price lists & agreed prices | ✔ | |
| Ordering with PO → invoice cross-match | ✔ | manual paste/CSV for the invoice |
| Live distributor price feeds | ✖ | needs supplier integrations or a server |
| POS sales sync | ✖ | volumes are keyed in; a POS export could be imported |
| Stocktake with variance-to-COGS | ✔ | count sheets by location; unexplained loss valued per item |
| Accounting sync (Xero etc.) | ✖ | needs a server and OAuth |
| Automatic invoice ingestion from email | ✖ | see below |

## Automatic invoice email — what's missing

Invoices are checked from text you paste or a file you drop in, and the
adjustment claim opens in your mail client for you to send. **Reading a mailbox
and replying on its own is not something this app can do**, and no amount of
work on these files would change that: a static page in a browser has no way to
poll IMAP, and no credentials to send mail as you.

Doing it end to end needs a small always-on service:

1. **Mailbox access** — an IMAP connection or a Gmail/Microsoft Graph API app
   registration, watching a nominated inbox for supplier invoices.
2. **Attachment extraction** — most suppliers send PDF. `parseInvoice()` in
   `js/suppliers.js` already handles CSV and tab-separated text, so a PDF text
   layer feeds straight into it; scanned invoices would need OCR.
3. **The reconciliation itself** — unchanged. `reconcileInvoice()` and
   `adjustmentEmail()` are pure functions with no browser dependency and run as-is
   under Node.
4. **Outbound mail** — an SMTP account or transactional sender to deliver the
   claim, plus somewhere to record what was claimed and what came back.

The costing side stays exactly as it is. What a service would add is the
plumbing at either end — fetching the invoice and sending the reply — around the
same engine this app already uses. Worth deciding deliberately: automatic claims
go to real suppliers, so a review step before sending is usually wanted anyway.
