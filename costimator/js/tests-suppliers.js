// Tests for the supplier side: offer comparison, switch impact against sales,
// and invoice reconciliation. Run with:  node js/tests-suppliers.js

const Units = require('./units.js');
global.window = undefined;
const Costing = require('./costing.js');
const Suppliers = require('./suppliers.js');

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
function throws(name, fn, match) {
  try { fn(); ok(name, false, 'expected it to throw'); }
  catch (err) { ok(name, !match || err.message.includes(match), `message was "${err.message}"`); }
}

// ---------------------------------------------------------------------------
// The scenario from the brief: G&T's 300g schnitzel against a competitor's
// 250g. G&T is 24 x 300g at $96.00 — $4.00 a piece, $13.33/kg.
// Competitor is 30 x 250g at $105.00 — $3.50 a piece, $14.00/kg.
// The competitor's piece is cheaper. Their chicken is dearer.
// ---------------------------------------------------------------------------

const GT = {
  id: 'off-gt', supplier: 'G&T Chickens', productCode: 'GT-SCH-300',
  packSize: 24, packUnit: 'ea', packPrice: 96.0,
  unitSize: 300, unitSizeUnit: 'g', agreedPrice: 96.0,
};
const RIVAL = {
  id: 'off-rival', supplier: 'Southern Poultry', productCode: 'SP-CS-250',
  packSize: 30, packUnit: 'ea', packPrice: 105.0,
  unitSize: 250, unitSizeUnit: 'g', agreedPrice: 105.0,
};

const schnitzelItem = {
  id: 'ing-schnitzel', name: 'Crumbed chicken schnitzel', yieldPct: 100,
  isFinishedProduct: true, offers: [GT, RIVAL], preferredOfferId: 'off-gt',
};

console.log('\nOffer normalisation');
const gtNorm = Suppliers.normaliseOffer(GT, schnitzelItem);
const rivalNorm = Suppliers.normaliseOffer(RIVAL, schnitzelItem);
near('G&T cost per piece', gtNorm.perPiece, 4.0);
near('G&T cost per kg', gtNorm.perRate, 96 / 24 / 0.3);
near('competitor cost per piece', rivalNorm.perPiece, 3.5);
near('competitor cost per kg', rivalNorm.perRate, 105 / 30 / 0.25);
ok('rate unit is per kg for a piece with a known weight', gtNorm.rateUnit === 'kg');
ok('piece size is carried through', gtNorm.pieceSize === 300 && gtNorm.pieceUnit === 'g');

console.log('\nOffer comparison');
const cmp = Suppliers.compareOffers(schnitzelItem);
ok('both offers are compared', cmp.rows.length === 2);
ok('current offer is identified', cmp.current.supplier === 'G&T Chickens');
ok('cheapest per piece is the competitor', cmp.cheapestByPiece.supplier === 'Southern Poultry',
  cmp.cheapestByPiece.supplier);
ok('cheapest per kilo is G&T', cmp.cheapestByRate.supplier === 'G&T Chickens',
  cmp.cheapestByRate.supplier);
ok('the two winners disagree, and that is reported', cmp.pieceWinnerDiffers === true);
ok('different piece sizes are not treated as like-for-like', cmp.sameSpec === false);

// Same spec, genuinely cheaper — the winners should agree.
const sameSpecItem = {
  ...schnitzelItem,
  offers: [GT, { ...RIVAL, packSize: 24, unitSize: 300, packPrice: 84.0 }],
};
const cmp2 = Suppliers.compareOffers(sameSpecItem);
ok('matched piece sizes count as like-for-like', cmp2.sameSpec === true);
ok('winners agree when the spec matches', cmp2.pieceWinnerDiffers === false);
ok('the genuinely cheaper offer wins', cmp2.cheapestByRate.supplier === 'Southern Poultry');

ok('no comparison for a single offer',
  Suppliers.compareOffers({ ...schnitzelItem, offers: [GT] }) === null);

console.log('\nBulk against portioned');
// A bulk 5kg bag at $70.00 = $14.00/kg, pieces unknown.
const bulk = { id: 'off-bulk', supplier: 'Bulk Foods', packSize: 5, packUnit: 'kg', packPrice: 70.0 };
const bulkNorm = Suppliers.normaliseOffer(bulk, schnitzelItem);
near('bulk cost per kg', bulkNorm.perRate, 14.0);
ok('bulk with no piece size has no per-piece cost', bulkNorm.perPiece === null);
const bulkSized = Suppliers.normaliseOffer({ ...bulk, unitSize: 300, unitSizeUnit: 'g' }, schnitzelItem);
near('bulk with a piece size gets a per-piece cost', bulkSized.perPiece, 14.0 * 0.3);

console.log('\nYield is applied to offers');
const lowYield = { ...schnitzelItem, yieldPct: 80, offers: [GT] };
near('yield inflates the offer rate',
  Suppliers.normaliseOffer(GT, lowYield).perPiece, 4.0 / 0.8);

// ---------------------------------------------------------------------------
// Switching, weighted by what actually sells.
// ---------------------------------------------------------------------------

const chips = { id: 'ing-chips', name: 'Frozen chips', yieldPct: 100,
  offers: [{ id: 'o-chips', supplier: 'Bidfood', productCode: 'O-CHIPS',
    packSize: 10, packUnit: 'kg', packPrice: 26.0, agreedPrice: 26.0 }] };

const parma = {
  id: 'rec-parma', name: 'Chicken parmigiana', onMenu: true, unitsSold: 380,
  batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 0,
  sellPrice: 29.5, taxRate: 10, targetGpPct: 70,
  lines: [
    { kind: 'ingredient', refId: 'ing-schnitzel', qty: 1, unit: 'ea' },
    { kind: 'ingredient', refId: 'ing-chips', qty: 200, unit: 'g' },
  ],
};
const kidsSchnitty = {
  id: 'rec-kids', name: 'Kids schnitzel', onMenu: true, unitsSold: 40,
  batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 0,
  sellPrice: 13.0, taxRate: 10, targetGpPct: 70,
  lines: [{ kind: 'ingredient', refId: 'ing-schnitzel', qty: 1, unit: 'ea' }],
};
const saladNoSchnitzel = {
  id: 'rec-salad', name: 'Garden salad', onMenu: true, unitsSold: 200,
  batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 0,
  sellPrice: 12.0, taxRate: 10, targetGpPct: 70,
  lines: [{ kind: 'ingredient', refId: 'ing-chips', qty: 50, unit: 'g' }],
};

const menuCtx = {
  ingredients: [schnitzelItem, chips],
  recipes: [parma, kidsSchnitty, saladNoSchnitzel],
};

console.log('\nSwitch impact');
const sw = Suppliers.switchImpact('ing-schnitzel', 'off-rival', menuCtx);
ok('switching from G&T is identified', sw.from.supplier === 'G&T Chickens');
ok('switching to the competitor is identified', sw.to.supplier === 'Southern Poultry');
near('each serve saves the per-piece difference', sw.dishes[0].perServe, -0.5);
ok('only dishes using the ingredient are affected',
  sw.dishes.length === 2 && !sw.dishes.some((d) => d.name === 'Garden salad'),
  sw.dishes.map((d) => d.name).join(', '));
near('period saving is the per-serve gap times volume', sw.saving, 0.5 * (380 + 40), 0.01);
ok('a saving raises the weighted GP', sw.gpAfter > sw.gpBefore);

console.log('\nSales correlation');
ok('the best seller is flagged',
  sw.dishes.find((d) => d.name === 'Chicken parmigiana').isTopSeller === true);
ok('the low-volume dish is not flagged as a top seller',
  sw.dishes.find((d) => d.name === 'Kids schnitzel').isTopSeller === false);
near('most of the saving rides on the best seller',
  sw.dishes.find((d) => d.name === 'Chicken parmigiana').shareOfChange, 90.5, 0.2);
ok('top-seller exposure is reported', sw.topSellerShare > 85, `${sw.topSellerShare}`);
ok('the top sellers are named', sw.topSellers.includes('Chicken parmigiana'));

console.log('\nSpec change');
ok('a smaller piece is detected', sw.specChange !== null);
near('the size drop is reported as a percentage', sw.specChange.deltaPct, -16.7, 0.1);
ok('the direction is recorded', sw.specChange.smaller === true);
ok('a saving that shrinks the plate is not called a straight win',
  sw.verdict === 'saves-but-smaller', sw.verdict);

// Same spec and cheaper — that is a straight win.
const cleanItem = { ...schnitzelItem, offers: [GT, { ...RIVAL, packSize: 24, unitSize: 300, packPrice: 84.0 }] };
const cleanSwitch = Suppliers.switchImpact('ing-schnitzel', 'off-rival',
  { ...menuCtx, ingredients: [cleanItem, chips] });
ok('no spec change when the pieces match', cleanSwitch.specChange === null);
ok('cheaper at the same spec is a straight win', cleanSwitch.verdict === 'saves', cleanSwitch.verdict);
ok('the saving is real', cleanSwitch.saving > 0);

// Switching to something dearer.
const dearer = Suppliers.switchImpact('ing-schnitzel', 'off-rival', {
  ...menuCtx,
  ingredients: [{ ...schnitzelItem, offers: [GT, { ...RIVAL, packPrice: 150.0 }] }, chips],
});
ok('a dearer switch is reported as costing more', dearer.verdict === 'costs-more', dearer.verdict);
ok('a dearer switch has a negative saving', dearer.saving < 0);
ok('a dearer switch lowers the weighted GP', dearer.gpAfter < dearer.gpBefore);

throws('switching to an unknown offer is refused',
  () => Suppliers.switchImpact('ing-schnitzel', 'nope', menuCtx), 'no longer exists');
throws('switching an unknown ingredient is refused',
  () => Suppliers.switchImpact('nope', 'off-rival', menuCtx), 'not found');

// ---------------------------------------------------------------------------
// Invoice reconciliation.
// ---------------------------------------------------------------------------

console.log('\nInvoice parsing');
const csv = `Product Code,Description,Qty,Unit Price,Total
GT-SCH-300,Crumbed chicken schnitzel 300g,4,96.00,384.00
O-CHIPS,Frozen chips 10kg,2,26.00,52.00`;
const parsedCsv = Suppliers.parseInvoice(csv);
ok('a header row is detected', parsedCsv.columns !== null);
ok('both lines are parsed', parsedCsv.lines.length === 2, `${parsedCsv.lines.length}`);
ok('the code column is read', parsedCsv.lines[0].code === 'GT-SCH-300');
near('the unit price is read', parsedCsv.lines[0].unitPrice, 96.0);
near('the quantity is read', parsedCsv.lines[0].qty, 4);

const tabbed = 'GT-SCH-300\tCrumbed chicken schnitzel\t4\t99.50\t398.00';
ok('tab separated lines parse without a header',
  Suppliers.parseInvoice(tabbed).lines.length === 1);
near('and still find the unit price',
  Suppliers.parseInvoice(tabbed).lines[0].unitPrice, 99.5);

const noUnitPrice = 'Code,Description,Qty,Total\nGT-SCH-300,Schnitzel,4,398.00';
near('a missing unit price is derived from the total',
  Suppliers.parseInvoice(noUnitPrice).lines[0].unitPrice, 99.5);

const messy = `INVOICE 12345
Date: 01/08/2026

Product Code,Description,Qty,Unit Price,Total
GT-SCH-300,"Crumbed chicken schnitzel, 300g",4,$99.50,$398.00
--------
`;
const parsedMessy = Suppliers.parseInvoice(messy);
ok('preamble and rules are ignored', parsedMessy.lines.length === 1,
  JSON.stringify(parsedMessy.lines.map((l) => l.code)));
near('quoted commas and dollar signs survive', parsedMessy.lines[0].unitPrice, 99.5);
ok('empty input is handled', Suppliers.parseInvoice('').lines.length === 0);

console.log('\nReconciliation');
const recCtx = { ingredients: [schnitzelItem, chips], recipes: [] };
const overcharge = `Product Code,Description,Qty,Unit Price
GT-SCH-300,Crumbed chicken schnitzel,4,99.50
O-CHIPS,Frozen chips,2,26.00`;
const rec = Suppliers.reconcileInvoice(overcharge, recCtx);
ok('the overcharged line is found', rec.overcharged.length === 1, `${rec.overcharged.length}`);
near('the per-unit variance is right', rec.overcharged[0].variance, 3.5);
near('the variance is multiplied by the quantity', rec.overcharged[0].varianceTotal, 14.0);
near('the claim total is right', rec.overchargedTotal, 14.0);
ok('the matching line is passed', rec.okCount === 1, `${rec.okCount}`);
ok('matching by product code is recorded', rec.overcharged[0].matchedOn === 'code');

const clean = `Product Code,Qty,Unit Price\nGT-SCH-300,4,96.00`;
ok('an invoice at the agreed price raises nothing',
  Suppliers.reconcileInvoice(clean, recCtx).overcharged.length === 0);

const under = `Product Code,Qty,Unit Price\nGT-SCH-300,4,90.00`;
const underRec = Suppliers.reconcileInvoice(under, recCtx);
ok('an undercharge is recorded separately', underRec.undercharged.length === 1);
near('and does not count as a claim', underRec.overchargedTotal, 0);
near('but does move the net variance', underRec.netVariance, -24.0);

const unknown = `Product Code,Qty,Unit Price\nZZ-999,1,10.00`;
ok('an unrecognised line is reported, not silently dropped',
  Suppliers.reconcileInvoice(unknown, recCtx).unmatched.length === 1);

const noAgreed = {
  id: 'ing-new', name: 'New item', yieldPct: 100,
  offers: [{ id: 'o-new', supplier: 'G&T Chickens', productCode: 'GT-NEW', packSize: 1, packUnit: 'kg', packPrice: 10 }],
};
const noAgreedRec = Suppliers.reconcileInvoice(
  'Product Code,Qty,Unit Price\nGT-NEW,1,12.00',
  { ingredients: [noAgreed], recipes: [] });
ok('a line with no agreed price is called out separately',
  noAgreedRec.noAgreedPrice.length === 1 && noAgreedRec.overcharged.length === 0);

// Filtering by supplier scopes matching to that supplier's own products, so a
// code belonging to someone else stops matching.
const codeOnly = 'Product Code,Qty,Unit Price\nGT-SCH-300,4,99.50';
ok('supplier filtering rejects another supplier\'s product code',
  Suppliers.reconcileInvoice(codeOnly, recCtx, { supplier: 'Southern Poultry' }).unmatched.length === 1);
ok('and still matches the right supplier',
  Suppliers.reconcileInvoice(codeOnly, recCtx, { supplier: 'G&T Chickens' }).overcharged.length === 1);

const tolerant = Suppliers.reconcileInvoice(
  'Product Code,Qty,Unit Price\nGT-SCH-300,4,96.004', recCtx);
ok('rounding noise is inside tolerance', tolerant.overcharged.length === 0);

console.log('\nAdjustment email');
const email = Suppliers.adjustmentEmail(rec, { invoiceRef: 'INV-12345', business: 'The Local Hotel' });
ok('the subject names the invoice and the amount',
  email.subject.includes('INV-12345') && email.subject.includes('14.00'), email.subject);
ok('the body itemises the overcharged line', email.body.includes('GT-SCH-300'));
ok('the body states both prices',
  email.body.includes('96.00') && email.body.includes('99.50'));
ok('the body totals the claim', email.body.includes('Total adjustment requested: $14.00'));
ok('the body is signed', email.body.includes('The Local Hotel'));
ok('it is not marked empty', email.empty === false);

const cleanEmail = Suppliers.adjustmentEmail(
  Suppliers.reconcileInvoice(clean, recCtx), { invoiceRef: 'INV-1' });
ok('a clean invoice produces a confirmation, not a claim', cleanEmail.empty === true);
ok('and says nothing is required', cleanEmail.body.includes('No adjustment required'));

const bothWays = Suppliers.adjustmentEmail(
  Suppliers.reconcileInvoice(
    `Product Code,Qty,Unit Price\nGT-SCH-300,4,99.50\nSP-CS-250,2,100.00`, recCtx),
  { invoiceRef: 'INV-2' });
ok('undercharges are disclosed in the claim too',
  bothWays.body.includes('below the agreed price'), bothWays.body);

// ---------------------------------------------------------------------------
// Purchase orders: place at agreed prices, then match the invoice to the PO.
// ---------------------------------------------------------------------------

console.log('\nPurchase orders');
const kiev = {
  id: 'ing-kiev', name: 'Garlic chicken kiev', yieldPct: 100,
  offers: [{ id: 'off-kiev', supplier: 'G&T Chickens', productCode: 'GT-KIE-200',
    packSize: 20, packUnit: 'ea', packPrice: 88.0, agreedPrice: 88.0 }],
};
const poCtx = { ingredients: [schnitzelItem, chips, kiev], recipes: [] };
const po = {
  id: 'ord-1', ref: 'PO-0042', supplier: 'G&T Chickens', venueId: 'ven-1',
  status: 'sent', createdAt: '2026-08-12',
  lines: [
    { ingredientId: 'ing-schnitzel', offerId: 'off-gt', qty: 4, packPrice: 96.0 },
    { ingredientId: 'ing-kiev', offerId: 'off-kiev', qty: 2, packPrice: 88.0 },
  ],
};
near('order total is priced at the locked agreed prices', Suppliers.orderTotal(po), 4 * 96 + 2 * 88);

const poMail = Suppliers.orderEmail(po, poCtx, { business: 'The Local Hotel', venueName: 'Flemington' });
ok('the order email names the PO', poMail.subject.includes('PO-0042'), poMail.subject);
ok('the order email itemises product codes', poMail.body.includes('GT-SCH-300') && poMail.body.includes('GT-KIE-200'));
ok('the order email totals the order', poMail.body.includes('$560.00'), poMail.body);
ok('the order email says where to deliver', poMail.body.includes('Flemington'));
ok('the order email asks for the PO on the invoice', poMail.body.includes('reference the PO number'));

console.log('\nMatching an invoice to its PO');
// Schnitzel: right qty, wrong price. Kiev: right price, one pack short.
// Tenders: never ordered. One PO line (none here) fully missing is tested later.
const poInvoice = `Product Code,Description,Qty,Unit Price
GT-SCH-300,Crumbed chicken schnitzel,4,99.50
GT-KIE-200,Garlic chicken kiev,1,88.00
GT-TEN-5K,Crumbed chicken tenders,1,41.00`;
const tendersItem = {
  id: 'ing-tenders', name: 'Crumbed chicken tenders', yieldPct: 100,
  offers: [{ id: 'off-ten', supplier: 'G&T Chickens', productCode: 'GT-TEN-5K',
    packSize: 5, packUnit: 'kg', packPrice: 41.0, agreedPrice: 41.0 }],
};
const matchCtx = { ingredients: [schnitzelItem, chips, kiev, tendersItem], recipes: [] };
const m = Suppliers.matchInvoiceToOrder(poInvoice, po, matchCtx);

near('price variance is against the PO price, times invoiced qty', m.priceOverTotal, 3.5 * 4);
ok('the overpriced line is identified', m.priceOver.length === 1 && m.priceOver[0].productCode === 'GT-SCH-300');
ok('the short-delivered line is identified',
  m.qtyShort.length === 1 && m.qtyShort[0].ingredientName.includes('kiev'),
  JSON.stringify(m.qtyShort.map((l) => l.ingredientName)));
near('short value is the missing packs at PO price', m.shortValue, 88.0);
ok('the never-ordered line is reported, not silently priced',
  m.notOnOrder.length === 1 && m.notOnOrder[0].ingredientName === 'Crumbed chicken tenders');
near('not-on-order value is totalled', m.notOnOrderTotal, 41.0);
ok('nothing on the PO is missing from this invoice', m.notInvoiced.length === 0);
ok('a mismatched invoice is not clean', m.clean === false);

const cleanInvoice = `Product Code,Qty,Unit Price
GT-SCH-300,4,96.00
GT-KIE-200,2,88.00`;
const mc = Suppliers.matchInvoiceToOrder(cleanInvoice, po, matchCtx);
ok('a correct invoice matches clean', mc.clean === true, JSON.stringify({
  po: mc.priceOver.length, short: mc.qtyShort.length, extra: mc.notOnOrder.length, missing: mc.notInvoiced.length }));
ok('clean lines are counted', mc.cleanCount === 2);

const partialInvoice = `Product Code,Qty,Unit Price\nGT-SCH-300,4,96.00`;
const mp = Suppliers.matchInvoiceToOrder(partialInvoice, po, matchCtx);
ok('an ordered line missing from the invoice is reported as not invoiced',
  mp.notInvoiced.length === 1 && mp.notInvoiced[0].ingredientName.includes('kiev'));
ok('a partial invoice is not clean', mp.clean === false);

const overDelivered = Suppliers.matchInvoiceToOrder(
  `Product Code,Qty,Unit Price\nGT-SCH-300,6,96.00\nGT-KIE-200,2,88.00`, po, matchCtx);
ok('invoicing above the ordered quantity is flagged',
  overDelivered.qtyOver.length === 1 && overDelivered.qtyOver[0].qty === 6);

console.log('\nPO claim email');
const poClaim = Suppliers.orderAdjustmentEmail(m, { invoiceRef: 'INV-9001', business: 'The Local Hotel' });
ok('the claim names PO and invoice', poClaim.subject.includes('PO-0042') && poClaim.subject.includes('INV-9001'));
ok('price credit is requested with a figure', poClaim.body.includes('Credit requested for price variances: $14.00'));
ok('the short delivery is a question, not a claim',
  poClaim.body.includes('please advise delivery or back-order'));
ok('the not-ordered line asks for confirmation',
  poClaim.body.includes('not on our order'));
ok('a discrepancy claim is not empty', poClaim.empty === false);

const cleanPoMail = Suppliers.orderAdjustmentEmail(mc, { invoiceRef: 'INV-9002' });
ok('a clean match produces a confirmation', cleanPoMail.empty === true);
ok('and says both price and quantity matched', cleanPoMail.body.includes('price and quantity'));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
