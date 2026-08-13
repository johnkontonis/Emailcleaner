// Self-tests for the costing engine. Run with:  node js/tests.js
// These are the numbers a chef would check by hand, so they are written the
// same way — work the figure out longhand, then assert the engine agrees.

const Units = require('./units.js');
global.window = undefined;
const Costing = require('./costing.js');

let passed = 0;
let failed = 0;

function ok(name, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
    return;
  }
  console.log(`  ok    ${name}`);
}

function near(name, actual, expected, tolerance = 0.0001) {
  const diff = Math.abs(actual - expected);
  ok(name, diff <= tolerance, `expected ${expected}, got ${actual} (diff ${diff})`);
}

function throws(name, fn, match) {
  try {
    fn();
    ok(name, false, 'expected it to throw, but it returned normally');
  } catch (err) {
    ok(name, !match || err.message.includes(match), `message was "${err.message}"`);
  }
}

console.log('\nUnits');
near('kg -> g', Units.convert(2, 'kg', 'g'), 2000);
near('g -> kg', Units.convert(1500, 'g', 'kg'), 1.5);
near('L -> ml', Units.convert(1.5, 'L', 'ml'), 1500);
near('lb -> g', Units.convert(1, 'lb', 'g'), 453.59237);
near('cup -> ml (metric 250)', Units.convert(2, 'cup', 'ml'), 500);
near('tbsp -> ml (australian 20)', Units.convert(3, 'tbsp', 'ml'), 60);
near('doz -> ea', Units.convert(2, 'doz', 'ea'), 24);
near('alias "kilos" resolves', Units.convert(1, 'kilos', 'g'), 1000);
near('ml -> g with density 0.92 (oil)', Units.convert(1000, 'ml', 'g', 0.92), 920);
near('g -> ml with density 0.92', Units.convert(920, 'g', 'ml', 0.92), 1000);
throws('mass -> volume without density is refused', () => Units.convert(1, 'kg', 'L'), 'density');
throws('count -> mass is refused', () => Units.convert(1, 'ea', 'kg'), 'pack size');
throws('unknown unit is refused', () => Units.convert(1, 'furlong', 'g'), 'Unknown unit');

console.log('\nIngredient costing');
const chicken = {
  id: 'ing-chicken', name: 'Chicken maryland', packSize: 10, packUnit: 'kg',
  packPrice: 62.5, yieldPct: 100,
};
// $62.50 / 10000 g = $0.00625 per gram
near('unit cost per gram', Costing.unitCost(chicken).cost, 0.00625);
ok('unit cost reports base unit', Costing.unitCost(chicken).unit === 'g');

const wholeBird = { ...chicken, id: 'ing-bird', name: 'Whole bird', yieldPct: 68 };
// $0.00625 / 0.68 = $0.009191... per usable gram
near('yield loss inflates unit cost', Costing.yieldedUnitCost(wholeBird).cost, 0.00625 / 0.68);
ok('100% yield leaves cost unchanged',
  Costing.yieldedUnitCost(chicken).cost === Costing.unitCost(chicken).cost);
throws('zero pack size is refused', () => Costing.unitCost({ ...chicken, packSize: 0 }), 'pack size');
throws('yield above 100% is refused',
  () => Costing.yieldedUnitCost({ ...chicken, yieldPct: 120 }), 'invalid yield');

console.log('\nRecipe costing');
const oil = { id: 'ing-oil', name: 'Vegetable oil', packSize: 20, packUnit: 'l', packPrice: 48, yieldPct: 100 };
const flour = { id: 'ing-flour', name: 'Plain flour', packSize: 12.5, packUnit: 'kg', packPrice: 18.75, yieldPct: 100 };
const salt = { id: 'ing-salt', name: 'Salt', packSize: 2, packUnit: 'kg', packPrice: 3.2, yieldPct: 100 };
const ingredients = [chicken, wholeBird, oil, flour, salt];

const schnitzel = {
  id: 'rec-schnitzel', name: 'Chicken schnitzel', onMenu: true,
  batchYieldQty: 10, batchYieldUnit: 'ea', portions: 10,
  wastagePct: 0, sellPrice: 0, taxRate: 0, targetGpPct: 70,
  lines: [
    { kind: 'ingredient', refId: 'ing-chicken', qty: 1.8, unit: 'kg' }, // 1800g * 0.00625 = 11.25
    { kind: 'ingredient', refId: 'ing-flour', qty: 400, unit: 'g' },    // 400 * 0.0015   =  0.60
    { kind: 'ingredient', refId: 'ing-oil', qty: 250, unit: 'ml' },     // 250 * 0.0024   =  0.60
  ],
};
const ctx = { ingredients, recipes: [schnitzel] };
let costed = Costing.costRecipe(schnitzel, ctx);
ok('no line errors', costed.errors.length === 0, costed.errors.join('; '));
near('batch cost', costed.ingredientCost, 11.25 + 0.6 + 0.6);
near('portion cost', costed.portionCost, 12.45 / 10);

console.log('\nWastage');
const withWastage = { ...schnitzel, wastagePct: 5 };
// 5% loss means usable output carries 1/0.95 of the input cost
near('wastage inflates batch cost', Costing.costRecipe(withWastage, ctx).batchCost, 12.45 / 0.95);

console.log('\nGP and pricing');
const priced = { ...schnitzel, sellPrice: 26.0, taxRate: 10, targetGpPct: 70 };
costed = Costing.costRecipe(priced, ctx);
near('net price strips GST', costed.netPrice, 26 / 1.1);
near('gross profit', costed.grossProfit, 26 / 1.1 - 1.245);
near('GP%', costed.gpPct, ((26 / 1.1 - 1.245) / (26 / 1.1)) * 100, 0.01);
near('food cost %', costed.foodCostPct, (1.245 / (26 / 1.1)) * 100, 0.01);
ok('GP% and food cost % sum to 100', Math.abs(costed.gpPct + costed.foodCostPct - 100) < 0.01);
// Price to hit exactly 70% GP: cost / 0.30, then add GST back
near('suggested price hits target GP', costed.suggestedPrice, (1.245 / 0.7) * 1.1 * 0 + (1.245 / 0.3) * 1.1, 0.01);
ok('flags on-target when GP clears the target', costed.onTarget === true);

const thin = Costing.costRecipe({ ...priced, sellPrice: 4.0 }, ctx);
ok('flags below-target when GP misses', thin.onTarget === false);

// Feeding the suggested price back in should land on the target exactly.
const repriced = Costing.costRecipe({ ...priced, sellPrice: costed.suggestedPrice }, ctx);
near('re-costing at suggested price yields the target GP', repriced.gpPct, 70, 0.05);

console.log('\nSub-recipes');
const crumbMix = {
  id: 'rec-crumb', name: 'Seasoned crumb', onMenu: false,
  batchYieldQty: 5, batchYieldUnit: 'kg', portions: 1,
  wastagePct: 0, sellPrice: 0, taxRate: 0, targetGpPct: 70,
  lines: [
    { kind: 'ingredient', refId: 'ing-flour', qty: 4.5, unit: 'kg' }, // 4500 * 0.0015 = 6.75
    { kind: 'ingredient', refId: 'ing-salt', qty: 500, unit: 'g' },   //  500 * 0.0016 = 0.80
  ],
};
// batch = 7.55 over 5kg = $0.00151 per gram
const parma = {
  id: 'rec-parma', name: 'Chicken parma', onMenu: true,
  batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1,
  wastagePct: 0, sellPrice: 28, taxRate: 10, targetGpPct: 68,
  lines: [
    { kind: 'ingredient', refId: 'ing-chicken', qty: 220, unit: 'g' }, // 220 * 0.00625 = 1.375
    { kind: 'recipe', refId: 'rec-crumb', qty: 90, unit: 'g' },        // 90 * 0.00151  = 0.1359
  ],
};
const ctx2 = { ingredients, recipes: [crumbMix, parma] };
near('sub-recipe unit cost', Costing.recipeUnitCost(crumbMix, ctx2).cost, 7.55 / 5000);
const parmaCost = Costing.costRecipe(parma, ctx2);
ok('sub-recipe line costs cleanly', parmaCost.errors.length === 0, parmaCost.errors.join('; '));
near('recipe using a sub-recipe', parmaCost.portionCost, 1.375 + (7.55 / 5000) * 90);

console.log('\nGuard rails');
const selfRef = {
  id: 'rec-loop', name: 'Loop', batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1,
  lines: [{ kind: 'recipe', refId: 'rec-loop', qty: 1, unit: 'ea' }],
};
const looped = Costing.costRecipe(selfRef, { ingredients, recipes: [selfRef] });
ok('self-reference is caught, not stack-overflowed',
  looped.errors.some((e) => e.includes('Circular')), looped.errors.join('; '));

const mutualA = {
  id: 'rec-a', name: 'A', batchYieldQty: 1, batchYieldUnit: 'kg', portions: 1,
  lines: [{ kind: 'recipe', refId: 'rec-b', qty: 100, unit: 'g' }],
};
const mutualB = {
  id: 'rec-b', name: 'B', batchYieldQty: 1, batchYieldUnit: 'kg', portions: 1,
  lines: [{ kind: 'recipe', refId: 'rec-a', qty: 100, unit: 'g' }],
};
const mutual = Costing.costRecipe(mutualA, { ingredients, recipes: [mutualA, mutualB] });
ok('mutual recursion is caught',
  JSON.stringify(mutual).includes('Circular'), 'no circular error surfaced');

const missing = Costing.costRecipe(
  { id: 'r', name: 'R', batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1,
    lines: [{ kind: 'ingredient', refId: 'nope', qty: 1, unit: 'kg' }] },
  { ingredients, recipes: [] }
);
ok('missing ingredient reports instead of crashing', missing.errors.length === 1);
near('missing ingredient contributes zero cost', missing.portionCost, 0);

const badUnit = Costing.costRecipe(
  { id: 'r2', name: 'R2', batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1,
    lines: [{ kind: 'ingredient', refId: 'ing-chicken', qty: 1, unit: 'L' }] },
  { ingredients, recipes: [] }
);
ok('mass/volume mismatch is reported on the line',
  badUnit.errors.some((e) => e.includes('density')), badUnit.errors.join('; '));

console.log('\nScaling');
const scaled = Costing.scaleRecipe(schnitzel, 25);
near('scaled line quantity', scaled.lines[0].qty, 4.5);
near('scaled batch yield', scaled.batchYieldQty, 25);
near('portion cost is unchanged by scaling',
  Costing.costRecipe(scaled, { ...ctx, recipes: [scaled] }).portionCost,
  Costing.costRecipe(schnitzel, ctx).portionCost, 0.0005);
near('scaled batch cost is 2.5x', Costing.costRecipe(scaled, { ...ctx, recipes: [scaled] }).batchCost,
  12.45 * 2.5, 0.005);
throws('scaling to zero portions is refused', () => Costing.scaleRecipe(schnitzel, 0), 'greater than zero');

console.log('\nMenu analysis');
const menu = [
  { ...parma, unitsSold: 200 },
  { ...priced, id: 'rec-schnitzel', unitsSold: 150 },
  { id: 'rec-chips', name: 'Chips', onMenu: true, unitsSold: 400,
    batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, sellPrice: 9, taxRate: 10, targetGpPct: 70,
    lines: [{ kind: 'ingredient', refId: 'ing-oil', qty: 30, unit: 'ml' }] },
  crumbMix, // not on menu, no sell price — must be excluded
];
const analysis = Costing.analyseMenu(menu, { ingredients, recipes: menu });
ok('excludes items that are not on the menu', analysis.itemCount === 3);
ok('classifies every item', analysis.items.every((i) =>
  ['Star', 'Plowhorse', 'Puzzle', 'Dog'].includes(i.category)));
near('total revenue is net of GST',
  analysis.totalRevenue,
  (28 / 1.1) * 200 + (26 / 1.1) * 150 + (9 / 1.1) * 400, 0.02);
ok('weighted GP% sits between the best and worst item',
  analysis.weightedGpPct > 0 && analysis.weightedGpPct < 100, `got ${analysis.weightedGpPct}`);
near('gross profit is revenue minus COGS',
  analysis.totalGrossProfit, analysis.totalRevenue - analysis.totalCogs, 0.01);

console.log('\nPrice impact');
const impact = Costing.priceImpact({ 'ing-chicken': 12 }, { ingredients, recipes: menu });
ok('reports only dishes that use the changed item',
  impact.affected.every((a) => ['Chicken parma', 'Chicken schnitzel'].includes(a.name)),
  impact.affected.map((a) => a.name).join(', '));
ok('chips are unaffected by a chicken rise',
  !impact.affected.some((a) => a.name === 'Chips'));
ok('a price rise lowers weighted GP', impact.gpAfter < impact.gpBefore);
ok('a price rise raises COGS', impact.cogsAfter > impact.cogsBefore);
near('12% on chicken moves parma cost by 12% of its chicken content',
  impact.affected.find((a) => a.name === 'Chicken parma').costDelta, 1.375 * 0.12, 0.0005);

const noChange = Costing.priceImpact({}, { ingredients, recipes: menu });
ok('an empty change set affects nothing', noChange.affected.length === 0);

console.log('\nBought-in finished products');
// A premade schnitzel from the supplier: 24 x 180g in a case at $92.00,
// so $3.8333 each. It is an ordinary ingredient as far as costing goes.
const premade = {
  id: 'ing-premade-schnitzel', name: 'Premade crumbed schnitzel 180g',
  packSize: 24, packUnit: 'ea', packPrice: 92.0, yieldPct: 100,
  isFinishedProduct: true, supplier: 'G&T Chickens', productCode: 'GT-SCH-180',
};
const houseSchnitzel = {
  id: 'rec-house-schnitzel', name: 'House crumbed schnitzel', onMenu: false,
  batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 0,
  lines: [
    { kind: 'ingredient', refId: 'ing-chicken', qty: 220, unit: 'g' }, // 1.375
    { kind: 'ingredient', refId: 'ing-flour', qty: 40, unit: 'g' },    // 0.060
  ],
};
// The side that stays on the plate whichever way the schnitzel is sourced.
const potato = {
  id: 'ing-potato', name: 'Frozen chips 10mm',
  packSize: 10, packUnit: 'kg', packPrice: 26.0, yieldPct: 100,
};
const ingredientsWithProduct = [...ingredients, premade, potato];
const HOUSE = 1.435;
const BOUGHT = 92 / 24;
const CHIPS = 0.52; // 200g at $2.60/kg

// The plated dish: a schnitzel (made or bought) plus chips.
const platedRecipe = (useAlt) => ({
  id: 'rec-plated', name: 'Chicken schnitzel', onMenu: true,
  batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 0,
  sellPrice: 26, taxRate: 10, targetGpPct: 70, unitsSold: 100,
  lines: [
    {
      kind: 'recipe', refId: 'rec-house-schnitzel', qty: 1, unit: 'ea',
      alt: { refId: 'ing-premade-schnitzel', qty: 1, unit: 'ea' },
      useAlt,
    },
    { kind: 'ingredient', refId: 'ing-potato', qty: 200, unit: 'g' },
  ],
});
const platedCtx = (r) => ({
  ingredients: ingredientsWithProduct,
  recipes: [houseSchnitzel, r],
});

const made = Costing.costRecipe(platedRecipe(false), platedCtx(platedRecipe(false)));
ok('made dish has no errors', made.errors.length === 0, made.errors.join('; '));
near('made in-house costs the build plus the sides', made.portionCost, HOUSE + CHIPS);
ok('in-house sourcing is reported', made.sourcing === 'inhouse');

const bought = Costing.costRecipe(platedRecipe(true), platedCtx(platedRecipe(true)));
near('bought in costs the supplier product plus the sides', bought.portionCost, BOUGHT + CHIPS);
ok('bought-in sourcing is reported', bought.sourcing === 'boughtin');

// The regression that prompted this model: the sides must survive the swap.
ok('the chips are still costed when the schnitzel is bought in',
  bought.portionCost > BOUGHT, `${bought.portionCost} should exceed ${BOUGHT}`);
near('swapping source moves the cost by exactly the swapped item',
  bought.portionCost - made.portionCost, BOUGHT - HOUSE);

console.log('\nMake or buy');
const mvb = made.makeVsBuy;
ok('comparison is offered when a line has both sources', mvb !== null);
near('make cost includes the sides', mvb.makeCost, HOUSE + CHIPS);
near('buy cost includes the sides', mvb.buyCost, BOUGHT + CHIPS);
ok('cheaper option is identified', mvb.cheaper === 'make', mvb.cheaper);
ok('saving % is negative when buying costs more', mvb.savingPct < 0, `${mvb.savingPct}`);
ok('the comparison names both sources', mvb.swappedLines.length === 1
  && mvb.swappedLines[0].made === 'House crumbed schnitzel'
  && mvb.swappedLines[0].bought === 'Premade crumbed schnitzel 180g',
  JSON.stringify(mvb.swappedLines));
ok('comparison is identical whichever source is active',
  Math.abs(bought.makeVsBuy.makeCost - mvb.makeCost) < 0.0001
  && Math.abs(bought.makeVsBuy.buyCost - mvb.buyCost) < 0.0001);

// Undercut the build and the verdict must flip.
const flipped = Costing.costRecipe(platedRecipe(false), {
  ingredients: [...ingredients, potato, { ...premade, packPrice: 24.0 }], // $1.00 each
  recipes: [houseSchnitzel, platedRecipe(false)],
});
ok('verdict flips when the supplier undercuts the build',
  flipped.makeVsBuy.cheaper === 'buy', flipped.makeVsBuy.cheaper);
ok('saving % is positive when buying is cheaper', flipped.makeVsBuy.savingPct > 0);

const noAlt = Costing.costRecipe(schnitzel, ctx);
ok('no comparison when no line offers an alternative', noAlt.makeVsBuy === null);

// A dish that is only ever bought in — the supplier product as a plain line.
const pureBought = {
  id: 'rec-pure', name: 'Tenders & chips', onMenu: true,
  batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 0,
  sellPrice: 19.5, taxRate: 10, targetGpPct: 70, unitsSold: 50,
  lines: [
    { kind: 'ingredient', refId: 'ing-premade-schnitzel', qty: 1, unit: 'ea' },
    { kind: 'ingredient', refId: 'ing-potato', qty: 200, unit: 'g' },
  ],
};
const pure = Costing.costRecipe(pureBought, { ingredients: ingredientsWithProduct, recipes: [pureBought] });
near('a purely bought-in dish costs with no special handling', pure.portionCost, BOUGHT + CHIPS);
ok('no comparison offered for a dish with nothing to compare', pure.makeVsBuy === null);

console.log('\nBought-in guard rails');
const brokenAlt = platedRecipe(true);
brokenAlt.lines[0].alt = { refId: 'gone', qty: 1, unit: 'ea' };
const broken = Costing.costRecipe(brokenAlt, platedCtx(brokenAlt));
ok('a broken alternative is reported',
  broken.errors.some((e) => e.includes('no longer exists')), broken.errors.join('; '));
ok('a broken alternative falls back to making it in-house', broken.sourcing === 'inhouse');
near('the fallback still costs the whole plate', broken.portionCost, HOUSE + CHIPS);

const unusedBrokenAlt = platedRecipe(false);
unusedBrokenAlt.lines[0].alt = { refId: 'gone', qty: 1, unit: 'ea' };
ok('a broken alternative the dish is not using is not an error',
  Costing.costRecipe(unusedBrokenAlt, platedCtx(unusedBrokenAlt)).errors.length === 0);

// Bought in by weight rather than by the each.
const bulk = { id: 'ing-bulk', name: 'Premade schnitzel bulk', packSize: 5, packUnit: 'kg',
  packPrice: 62.5, yieldPct: 100, isFinishedProduct: true };
const byWeight = platedRecipe(true);
byWeight.lines[0].alt = { refId: 'ing-bulk', qty: 180, unit: 'g' };
near('an alternative priced by weight costs per portion',
  Costing.costRecipe(byWeight, {
    ingredients: [...ingredientsWithProduct, bulk], recipes: [houseSchnitzel, byWeight],
  }).portionCost, 0.0125 * 180 + CHIPS);

const wasted = { ...platedRecipe(true), wastagePct: 10 };
near('batch wastage applies to bought-in lines too',
  Costing.costRecipe(wasted, platedCtx(wasted)).portionCost, (BOUGHT + CHIPS) / 0.9);

const scaledPlate = Costing.scaleRecipe(platedRecipe(true), 4);
ok('scaling scales the alternative quantity too', scaledPlate.lines[0].alt.qty === 4,
  `${scaledPlate.lines[0].alt.qty}`);
near('scaled portion cost is unchanged',
  Costing.costRecipe(scaledPlate, platedCtx(scaledPlate)).portionCost, BOUGHT + CHIPS, 0.0005);

console.log('\nPrice impact on bought-in products');
const usingBought = platedRecipe(true);
const productImpact = Costing.priceImpact({ 'ing-premade-schnitzel': 10 },
  { ingredients: ingredientsWithProduct, recipes: [houseSchnitzel, usingBought] });
ok('a supplier rise on a finished product hits the dish using it',
  productImpact.affected.length === 1, `${productImpact.affected.length} affected`);
near('the rise flows through at the right size',
  productImpact.affected[0].costDelta, BOUGHT * 0.1, 0.0005);

const usingHouse = platedRecipe(false);
ok('a rise on a product the dish is not currently sourcing does not change its cost',
  Costing.priceImpact({ 'ing-premade-schnitzel': 10 },
    { ingredients: ingredientsWithProduct, recipes: [houseSchnitzel, usingHouse] }
  ).affected.length === 0);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
