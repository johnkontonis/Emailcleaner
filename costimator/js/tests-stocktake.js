// Tests for the stocktake engine. Run with:  node js/tests-stocktake.js
//
// The centrepiece is the invariant: theoretical usage valued at raw pack
// prices must equal the menu's theoretical COGS to the cent. If those two
// figures ever drift, either the costing or the usage explosion is lying.

const Units = require('./units.js');
global.window = undefined;
const Costing = require('./costing.js');
const Stocktake = require('./stocktake.js');

let passed = 0;
let failed = 0;

function ok(name, condition, detail) {
  if (condition) { passed++; console.log(`  ok    ${name}`); return; }
  failed++;
  console.error(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
}
function near(name, actual, expected, tolerance = 0.0001) {
  ok(name, Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`);
}

// ---------------------------------------------------------------------------
// Fixtures: a small library with every wrinkle — yield loss, density, a
// sub-recipe, batch wastage, and a make/buy line.
// ---------------------------------------------------------------------------

const ING = [
  { id: 'i-breast', name: 'Chicken breast', yieldPct: 96,
    offers: [{ id: 'o-breast', supplier: 'G&T', packSize: 5, packUnit: 'kg', packPrice: 57.5, agreedPrice: 57.5 }] },
  { id: 'i-bird', name: 'Whole bird', yieldPct: 68,
    offers: [{ id: 'o-bird', supplier: 'G&T', packSize: 12, packUnit: 'kg', packPrice: 63.6, agreedPrice: 63.6 }] },
  { id: 'i-flour', name: 'Flour', yieldPct: 100,
    offers: [{ id: 'o-flour', supplier: 'Bid', packSize: 12.5, packUnit: 'kg', packPrice: 18.75, agreedPrice: 18.75 }] },
  { id: 'i-oil', name: 'Oil', yieldPct: 100, density: 0.92,
    offers: [{ id: 'o-oil', supplier: 'Bid', packSize: 20, packUnit: 'l', packPrice: 48.0, agreedPrice: 48.0 }] },
  { id: 'i-premade', name: 'Premade schnitzel', yieldPct: 100, isFinishedProduct: true,
    offers: [{ id: 'o-premade', supplier: 'G&T', productCode: 'GT-SCH', packSize: 24, packUnit: 'ea', packPrice: 96.0, agreedPrice: 96.0, unitSize: 300, unitSizeUnit: 'g' }] },
];

const CRUMB = {
  id: 'r-crumb', name: 'Crumb mix', onMenu: false, type: 'sub',
  batchYieldQty: 5, batchYieldUnit: 'kg', portions: 1, wastagePct: 0, unitsSold: 0,
  lines: [{ kind: 'ingredient', refId: 'i-flour', qty: 5, unit: 'kg' }],
};

const SCHNITZEL = {
  id: 'r-schnitzel', name: 'Schnitzel', onMenu: true,
  batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 0,
  sellPrice: 26, taxRate: 10, targetGpPct: 70, unitsSold: 100,
  lines: [
    { kind: 'ingredient', refId: 'i-breast', qty: 240, unit: 'g' }, // usable
    { kind: 'recipe', refId: 'r-crumb', qty: 100, unit: 'g' },
    { kind: 'ingredient', refId: 'i-oil', qty: 40, unit: 'ml' },
  ],
};

const ctxOf = (recipes) => ({ ingredients: ING, recipes });

console.log('\nUsage explosion');
let { usage, errors } = Stocktake.theoreticalUsage([CRUMB, SCHNITZEL], ctxOf([CRUMB, SCHNITZEL]));
ok('no explosion errors', errors.length === 0, errors.join('; '));
// 240g usable at 96% yield = 250g raw, × 100 sold
near('yield loss is part of theoretical usage', usage['i-breast'], (240 / 0.96) * 100);
// 100g of a 5kg batch that is 100% flour → 100g flour each
near('sub-recipes explode into their ingredients', usage['i-flour'], 100 * 100);
near('volume lines stay in ml', usage['i-oil'], 40 * 100);
ok('sub-recipes are not double counted as themselves', usage['r-crumb'] === undefined);
ok('recipes with no sales contribute nothing',
  Stocktake.theoreticalUsage([CRUMB], ctxOf([CRUMB])).usage['i-flour'] === undefined);

console.log('\nBatch wastage inflates usage');
const wasted = { ...SCHNITZEL, wastagePct: 10 };
const wu = Stocktake.theoreticalUsage([CRUMB, wasted], ctxOf([CRUMB, wasted])).usage;
near('10% batch wastage means 1/0.9 the input',
  wu['i-breast'], ((240 / 0.96) * 100) / 0.9);

console.log('\nMake/buy routes usage to the source in use');
const dual = {
  ...SCHNITZEL,
  lines: [
    { kind: 'ingredient', refId: 'i-breast', qty: 240, unit: 'g',
      alt: { refId: 'i-premade', qty: 1, unit: 'ea' }, useAlt: false },
    { kind: 'ingredient', refId: 'i-oil', qty: 40, unit: 'ml' },
  ],
};
const madeUsage = Stocktake.theoreticalUsage([dual], ctxOf([dual])).usage;
ok('making in-house consumes the raw ingredient',
  madeUsage['i-breast'] > 0 && madeUsage['i-premade'] === undefined);
const boughtLine = { ...dual, lines: [{ ...dual.lines[0], useAlt: true }, dual.lines[1]] };
const boughtUsage = Stocktake.theoreticalUsage([boughtLine], ctxOf([boughtLine])).usage;
ok('buying in consumes the supplier product instead',
  boughtUsage['i-premade'] === 100 && boughtUsage['i-breast'] === undefined,
  JSON.stringify(boughtUsage));

console.log('\nThe invariant: usage valued at raw cost = menu COGS');
const menuCtx = ctxOf([CRUMB, SCHNITZEL]);
const analysis = Costing.analyseMenu([CRUMB, SCHNITZEL], menuCtx);
const u2 = Stocktake.theoreticalUsage([CRUMB, SCHNITZEL], menuCtx).usage;
const usageValue = Object.entries(u2).reduce((sum, [id, qty]) => {
  const ing = ING.find((i) => i.id === id);
  return sum + qty * Costing.unitCost(ing).cost;
}, 0);
near('usage × raw unit cost equals theoretical COGS', usageValue, analysis.totalCogs, 0.01);

// Same invariant with wastage and the bought-in source active — the two
// hardest paths through both engines must still agree.
const hardMenu = [CRUMB, { ...boughtLine, wastagePct: 7 }];
const hardCtx = ctxOf(hardMenu);
const hardAnalysis = Costing.analyseMenu(hardMenu, hardCtx);
const hardUsage = Stocktake.theoreticalUsage(hardMenu, hardCtx).usage;
const hardValue = Object.entries(hardUsage).reduce((sum, [id, qty]) => {
  const ing = ING.find((i) => i.id === id);
  return sum + qty * Costing.unitCost(ing).cost;
}, 0);
near('the invariant holds through wastage and bought-in sourcing',
  hardValue, hardAnalysis.totalCogs, 0.01);

console.log('\nPurchases from received orders');
const orders = [
  { id: 'o1', status: 'received', venueId: 'v1', createdAt: '2026-08-05',
    lines: [{ ingredientId: 'i-premade', offerId: 'o-premade', qty: 4, packPrice: 96 }] },
  { id: 'o2', status: 'sent', venueId: 'v1', createdAt: '2026-08-06',
    lines: [{ ingredientId: 'i-premade', offerId: 'o-premade', qty: 9, packPrice: 96 }] },
  { id: 'o3', status: 'received', venueId: 'v2', createdAt: '2026-08-07',
    lines: [{ ingredientId: 'i-premade', offerId: 'o-premade', qty: 7, packPrice: 96 }] },
  { id: 'o4', status: 'received', venueId: 'v1', createdAt: '2026-07-02',
    lines: [{ ingredientId: 'i-premade', offerId: 'o-premade', qty: 5, packPrice: 96 }] },
];
const bought = Stocktake.purchasesFromOrders(orders, ING, 'v1', '2026-08-01', '2026-08-31');
near('only received orders for the venue in the period count', bought['i-premade'], 4);
ok('sent orders are not stock', bought['i-premade'] !== 13);
const anyVenue = Stocktake.purchasesFromOrders(orders, ING, null, '2026-08-01', '2026-08-31');
near('no venue filter sums every venue', anyVenue['i-premade'], 11);

// An order raised on a different pack converts through base units.
const twoOffer = [{
  id: 'i-two', name: 'Two-pack item', yieldPct: 100, preferredOfferId: 'o-a',
  offers: [
    { id: 'o-a', supplier: 'A', packSize: 30, packUnit: 'ea', packPrice: 105 },
    { id: 'o-b', supplier: 'B', packSize: 24, packUnit: 'ea', packPrice: 96 },
  ],
}];
const crossPack = Stocktake.purchasesFromOrders(
  [{ id: 'o5', status: 'received', venueId: 'v1', createdAt: '2026-08-05',
     lines: [{ ingredientId: 'i-two', offerId: 'o-b', qty: 5, packPrice: 96 }] }],
  twoOffer, 'v1', null, null);
near('packs bought on another offer convert to active-offer packs',
  crossPack['i-two'], (5 * 24) / 30);

console.log('\nStocktake analysis');
// 100 schnitzels sold. Theoretical: breast 25kg raw, flour 10kg, oil 4L.
// Counts (packs): breast open 8, bought 2, closed 4.6  → used 27kg, waste 2kg
//                 flour  open 1, bought 0, closed 0.16 → used 10.5kg, waste .5kg
//                 oil    open 1, bought 0, closed 0.8  → used 4L, clean
const st = {
  id: 'st1', venueId: 'v1', periodStart: '2026-08-01', periodEnd: '2026-08-31',
  lines: [
    { ingredientId: 'i-breast', openQty: 8, purchasedQty: 2, countedQty: 4.6 },
    { ingredientId: 'i-flour', openQty: 1, purchasedQty: 0, countedQty: 0.16 },
    { ingredientId: 'i-oil', openQty: 1, purchasedQty: 0, countedQty: 0.8 },
  ],
};
const rep = Stocktake.analyseStocktake(st, menuCtx);
ok('every counted line reports', rep.lines.length === 3);

const breast = rep.lines.find((l) => l.name === 'Chicken breast');
near('actual usage from the stock equation', breast.actualBase, (8 + 2 - 4.6) * 5000);
near('theoretical usage carried in', breast.theoBase, 25000);
near('variance is the unexplained 2kg', breast.varianceBase, 2000);
near('variance valued at the raw pack price', breast.varianceValue, 2 * (57.5 / 5), 0.01);

const oil = rep.lines.find((l) => l.name === 'Oil');
near('a clean line shows no variance', oil.varianceValue, 0, 0.01);

near('closing stock is valued', rep.closingValue,
  4.6 * 57.5 + 0.16 * 18.75 + 0.8 * 48, 0.01);
near('actual COGS = opening + purchases − closing',
  rep.actualCogs, rep.openingValue + rep.purchasesValue - rep.closingValue, 0.01);
near('theoretical COGS ties to the menu', rep.theoCogs, analysis.totalCogs, 0.01);
near('the variance is the gap between the two',
  rep.varianceValue, rep.actualCogs - rep.theoCogs, 0.01);
ok('variance % of theoretical is reported', rep.variancePct > 0);
ok('food cost is shown both ways',
  rep.actualFoodCostPct > rep.theoFoodCostPct, `${rep.theoFoodCostPct} vs ${rep.actualFoodCostPct}`);
ok('the worst offender is named', rep.worst && rep.worst.name === 'Chicken breast',
  JSON.stringify(rep.worst));

console.log('\nGuard rails');
// Counting MORE stock than opening+purchases can supply is an error, not a gain.
const impossible = Stocktake.analyseStocktake({
  ...st, lines: [{ ingredientId: 'i-oil', openQty: 1, purchasedQty: 0, countedQty: 3 }],
}, menuCtx);
ok('an impossible count is flagged, not reported as savings',
  impossible.lines[0].countError === true && impossible.countErrors === 1);

// Movements with no count: flagged, treated as counted-to-zero.
const uncounted = Stocktake.analyseStocktake({
  ...st, lines: [{ ingredientId: 'i-breast', openQty: 8, purchasedQty: 2, countedQty: null }],
}, menuCtx);
ok('movements with no count are flagged', uncounted.lines[0].uncounted === true);
near('and treated as counted to zero', uncounted.lines[0].actualBase, 10 * 5000);

// Ingredients the menu used but nobody counted get their own bucket.
const partial = Stocktake.analyseStocktake({
  ...st, lines: [{ ingredientId: 'i-breast', openQty: 8, purchasedQty: 2, countedQty: 4.6 }],
}, menuCtx);
ok('consumed-but-not-counted stock is reported',
  partial.notCounted.length === 2
  && partial.notCounted.some((n) => n.name === 'Flour')
  && partial.notCounted.some((n) => n.name === 'Oil'),
  JSON.stringify(partial.notCounted.map((n) => n.name)));
ok('not-counted stock is valued',
  partial.notCounted.every((n) => n.theoValue > 0));

// A line that was never stocked, never counted and never used stays out.
const irrelevant = Stocktake.analyseStocktake({
  ...st,
  lines: [...st.lines, { ingredientId: 'i-bird', openQty: 0, purchasedQty: 0, countedQty: null }],
}, menuCtx);
ok('an untouched ingredient does not pad the report', irrelevant.lines.length === 3);

// A broken offer is reported, not silently valued at zero.
const brokenIng = [...ING.filter((i) => i.id !== 'i-oil'),
  { id: 'i-oil', name: 'Oil', yieldPct: 100, offers: [{ id: 'o-oil', supplier: 'Bid', packSize: 0, packUnit: 'l', packPrice: 48 }] }];
const broken = Stocktake.analyseStocktake(st, { ingredients: brokenIng, recipes: menuCtx.recipes });
ok('a broken pack config lands in its own bucket',
  broken.broken.length === 1 && broken.broken[0].name === 'Oil',
  JSON.stringify(broken.broken));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
