// Persistence. Everything lives in localStorage — the whole app is a static
// page, so your costings never leave the machine. Export/import is the backup
// story, and the seam below is where a real API would slot in later.
//
// Shape (v2): the store holds CLIENTS. A client is one business group — its
// ingredient library, recipes, suppliers and purchase orders are shared across
// the whole group, because a group costs one menu, not one menu per site. What
// differs by site is sales: each client has VENUES, and a recipe's volumes are
// recorded per venue. Every accessor below reads through the active client, so
// the rest of the app never has to know about any client but the current one.

const Store = (() => {
  const KEY = 'costimator:v2';
  const LEGACY_KEY = 'costimator:v1';

  const uid = (prefix) =>
    `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;

  // A poultry-leaning starter set so the app is useful on first open rather
  // than an empty shell. Prices are placeholders — replace with your invoices.
  function seed() {
    const ingredients = [
      { id: 'ing-maryland', location: 'Coolroom', name: 'Chicken maryland', category: 'Poultry', supplier: 'G&T Chickens', packSize: 10, packUnit: 'kg', packPrice: 62.5, yieldPct: 100 },
      { id: 'ing-breast', location: 'Coolroom', name: 'Chicken breast fillet', category: 'Poultry', supplier: 'G&T Chickens', packSize: 5, packUnit: 'kg', packPrice: 57.5, yieldPct: 96 },
      { id: 'ing-wholebird', location: 'Coolroom', name: 'Whole bird size 16', category: 'Poultry', supplier: 'G&T Chickens', packSize: 12, packUnit: 'kg', packPrice: 63.6, yieldPct: 68 },
      { id: 'ing-thigh', location: 'Coolroom', name: 'Chicken thigh fillet', category: 'Poultry', supplier: 'G&T Chickens', packSize: 5, packUnit: 'kg', packPrice: 48.0, yieldPct: 98 },
      // Finished products — bought in ready to cook, no build required. These
      // are ordinary ingredients as far as costing goes; the flag just lets the
      // app group them and offer them as a bought-in source for a dish.
      // Two suppliers compete for this one, at different piece sizes — the
      // comparison this is here to demonstrate.
      {
        id: 'ing-gt-schnitzel', location: 'Freezer', name: 'Crumbed chicken schnitzel',
        category: 'Finished products', yieldPct: 100, isFinishedProduct: true,
        preferredOfferId: 'off-gt-sch',
        offers: [
          { id: 'off-gt-sch', supplier: 'G&T Chickens', productCode: 'GT-SCH-300',
            packSize: 24, packUnit: 'ea', packPrice: 96.0, agreedPrice: 96.0,
            unitSize: 300, unitSizeUnit: 'g' },
          { id: 'off-sp-sch', supplier: 'Southern Poultry', productCode: 'SP-CS-250',
            packSize: 30, packUnit: 'ea', packPrice: 105.0, agreedPrice: 105.0,
            unitSize: 250, unitSizeUnit: 'g' },
        ],
      },
      { id: 'ing-gt-tenders', location: 'Freezer', name: 'Crumbed chicken tenders', category: 'Finished products', supplier: 'G&T Chickens', productCode: 'GT-TEN-5K', packSize: 5, packUnit: 'kg', packPrice: 41.0, yieldPct: 100, isFinishedProduct: true },
      { id: 'ing-gt-kiev', location: 'Freezer', name: 'Garlic chicken kiev 200g', category: 'Finished products', supplier: 'G&T Chickens', productCode: 'GT-KIE-200', packSize: 20, packUnit: 'ea', packPrice: 88.0, yieldPct: 100, isFinishedProduct: true },

      { id: 'ing-flour', location: 'Dry store', name: 'Plain flour', category: 'Dry goods', supplier: 'Bidfood', packSize: 12.5, packUnit: 'kg', packPrice: 18.75, yieldPct: 100 },
      { id: 'ing-crumb', location: 'Dry store', name: 'Panko breadcrumb', category: 'Dry goods', supplier: 'Bidfood', packSize: 10, packUnit: 'kg', packPrice: 42.0, yieldPct: 100 },
      { id: 'ing-egg', location: 'Coolroom', name: 'Eggs 55g', category: 'Dairy & eggs', supplier: 'Bidfood', packSize: 15, packUnit: 'doz', packPrice: 72.0, yieldPct: 100 },
      { id: 'ing-oil', location: 'Dry store', name: 'Vegetable oil', category: 'Oils', supplier: 'Bidfood', packSize: 20, packUnit: 'l', packPrice: 48.0, yieldPct: 100, density: 0.92 },
      { id: 'ing-salt', location: 'Dry store', name: 'Fine salt', category: 'Dry goods', supplier: 'Bidfood', packSize: 2, packUnit: 'kg', packPrice: 3.2, yieldPct: 100 },
      { id: 'ing-pepper', location: 'Dry store', name: 'Cracked pepper', category: 'Dry goods', supplier: 'Bidfood', packSize: 500, packUnit: 'g', packPrice: 14.5, yieldPct: 100 },
      { id: 'ing-paprika', location: 'Dry store', name: 'Smoked paprika', category: 'Dry goods', supplier: 'Bidfood', packSize: 500, packUnit: 'g', packPrice: 16.8, yieldPct: 100 },
      { id: 'ing-napoli', location: 'Dry store', name: 'Napoli sauce', category: 'Wet goods', supplier: 'Bidfood', packSize: 4, packUnit: 'l', packPrice: 22.4, yieldPct: 100, density: 1.05 },
      { id: 'ing-cheese', location: 'Coolroom', name: 'Mozzarella shredded', category: 'Dairy & eggs', supplier: 'Bidfood', packSize: 2, packUnit: 'kg', packPrice: 24.6, yieldPct: 100 },
      { id: 'ing-ham', location: 'Coolroom', name: 'Sliced leg ham', category: 'Smallgoods', supplier: 'Bidfood', packSize: 1.5, packUnit: 'kg', packPrice: 21.0, yieldPct: 100 },
      { id: 'ing-potato', location: 'Freezer', name: 'Frozen chips 10mm', category: 'Frozen', supplier: 'Bidfood', packSize: 10, packUnit: 'kg', packPrice: 26.0, yieldPct: 100 },
      // Bought by the head but used by weight, so the pack is expressed in
      // grams — a whole head runs about 500g before the core and outer leaves.
      { id: 'ing-lettuce', location: 'Coolroom', name: 'Iceberg lettuce', category: 'Produce', supplier: 'Market', packSize: 500, packUnit: 'g', packPrice: 3.4, yieldPct: 74 },
      { id: 'ing-tomato', location: 'Coolroom', name: 'Tomato', category: 'Produce', supplier: 'Market', packSize: 5, packUnit: 'kg', packPrice: 21.0, yieldPct: 91 },
      { id: 'ing-bun', location: 'Dry store', name: 'Brioche bun', category: 'Bakery', supplier: 'Bidfood', packSize: 48, packUnit: 'ea', packPrice: 28.8, yieldPct: 100 },
      { id: 'ing-mayo', location: 'Dry store', name: 'Whole egg mayonnaise', category: 'Wet goods', supplier: 'Bidfood', packSize: 3, packUnit: 'l', packPrice: 19.5, yieldPct: 100, density: 0.94 },
    ];

    // Sales are per venue: the menu is costed once for the group, but each
    // site sells different volumes of it.
    const recipes = [
      {
        id: 'rec-crumbmix', name: 'Seasoned crumb mix', type: 'sub', onMenu: false,
        batchYieldQty: 5, batchYieldUnit: 'kg', portions: 1, wastagePct: 0,
        sellPrice: 0, taxRate: 10, targetGpPct: 70, salesByVenue: {},
        method: 'Combine dry, mix through until evenly coloured. Store sealed, use within 7 days.',
        lines: [
          { kind: 'ingredient', refId: 'ing-crumb', qty: 4, unit: 'kg' },
          { kind: 'ingredient', refId: 'ing-flour', qty: 800, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-salt', qty: 120, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-paprika', qty: 60, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-pepper', qty: 20, unit: 'g' },
        ],
      },
      {
        // The crumbed cutlet on its own, so the dishes built on it can be
        // switched between crumbing it here and buying G&T's premade.
        id: 'rec-house-schnitzel', name: 'House crumbed schnitzel', type: 'sub', onMenu: false,
        batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 0,
        sellPrice: 0, taxRate: 10, targetGpPct: 70, salesByVenue: {},
        method: 'Flatten breast to 10mm, flour, egg wash, crumb. Rest 20 min before service.',
        lines: [
          { kind: 'ingredient', refId: 'ing-breast', qty: 220, unit: 'g' },
          { kind: 'recipe', refId: 'rec-crumbmix', qty: 85, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-egg', qty: 1, unit: 'ea' },
        ],
      },
      {
        id: 'rec-schnitzel', name: 'Chicken schnitzel', type: 'menu', onMenu: true,
        batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 3,
        sellPrice: 26.0, taxRate: 10, targetGpPct: 70,
        salesByVenue: { 'ven-flem': 110, 'ven-kens': 70 },
        method: 'Fry 4 min each side. Serve with chips and lemon.',
        lines: [
          // Made here by default; flip useAlt to cost it on G&T's premade
          // instead. The chips below stay on the plate either way.
          {
            kind: 'recipe', refId: 'rec-house-schnitzel', qty: 1, unit: 'ea',
            alt: { refId: 'ing-gt-schnitzel', qty: 1, unit: 'ea' }, useAlt: false,
          },
          { kind: 'ingredient', refId: 'ing-oil', qty: 40, unit: 'ml' },
          { kind: 'ingredient', refId: 'ing-potato', qty: 200, unit: 'g' },
        ],
      },
      {
        id: 'rec-parma', name: 'Chicken parmigiana', type: 'menu', onMenu: true,
        batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 3,
        sellPrice: 29.5, taxRate: 10, targetGpPct: 70,
        salesByVenue: { 'ven-flem': 240, 'ven-kens': 140 },
        method: 'Cook schnitzel, top with napoli, ham and mozzarella. Grill to melt.',
        lines: [
          {
            kind: 'recipe', refId: 'rec-house-schnitzel', qty: 1, unit: 'ea',
            alt: { refId: 'ing-gt-schnitzel', qty: 1, unit: 'ea' }, useAlt: false,
          },
          { kind: 'ingredient', refId: 'ing-oil', qty: 40, unit: 'ml' },
          { kind: 'ingredient', refId: 'ing-napoli', qty: 80, unit: 'ml' },
          { kind: 'ingredient', refId: 'ing-ham', qty: 45, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-cheese', qty: 70, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-potato', qty: 200, unit: 'g' },
        ],
      },
      {
        id: 'rec-burger', name: 'Crispy chicken burger', type: 'menu', onMenu: true,
        batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 2,
        sellPrice: 22.0, taxRate: 10, targetGpPct: 70,
        salesByVenue: { 'ven-flem': 190, 'ven-kens': 120 },
        method: 'Crumb thigh fillet, fry. Build on toasted bun with mayo, lettuce, tomato.',
        lines: [
          { kind: 'ingredient', refId: 'ing-thigh', qty: 180, unit: 'g' },
          { kind: 'recipe', refId: 'rec-crumbmix', qty: 70, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-egg', qty: 1, unit: 'ea' },
          { kind: 'ingredient', refId: 'ing-oil', qty: 35, unit: 'ml' },
          { kind: 'ingredient', refId: 'ing-bun', qty: 1, unit: 'ea' },
          { kind: 'ingredient', refId: 'ing-mayo', qty: 25, unit: 'ml' },
          { kind: 'ingredient', refId: 'ing-lettuce', qty: 30, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-tomato', qty: 40, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-potato', qty: 180, unit: 'g' },
        ],
      },
      {
        id: 'rec-roast', name: 'Half roast chicken', type: 'menu', onMenu: true,
        batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 4,
        sellPrice: 27.0, taxRate: 10, targetGpPct: 70,
        salesByVenue: { 'ven-flem': 60, 'ven-kens': 35 },
        method: 'Season, roast 45 min at 190C, rest 10 min, halve.',
        lines: [
          { kind: 'ingredient', refId: 'ing-wholebird', qty: 700, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-oil', qty: 20, unit: 'ml' },
          { kind: 'ingredient', refId: 'ing-salt', qty: 8, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-pepper', qty: 3, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-potato', qty: 200, unit: 'g' },
        ],
      },
      {
        // Uses the bought-in schnitzel straight, which is what makes the
        // supplier comparison on that item worth running.
        id: 'rec-schnitzelroll', name: 'Schnitzel roll', type: 'menu', onMenu: true,
        batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 2,
        sellPrice: 18.5, taxRate: 10, targetGpPct: 70,
        salesByVenue: { 'ven-flem': 160, 'ven-kens': 100 },
        method: 'Fry from frozen, build on a toasted bun with slaw and aioli.',
        lines: [
          { kind: 'ingredient', refId: 'ing-gt-schnitzel', qty: 1, unit: 'ea' },
          { kind: 'ingredient', refId: 'ing-bun', qty: 1, unit: 'ea' },
          { kind: 'ingredient', refId: 'ing-mayo', qty: 25, unit: 'ml' },
          { kind: 'ingredient', refId: 'ing-potato', qty: 150, unit: 'g' },
        ],
      },
      {
        // Same product, a fraction of the volume — the contrast that makes
        // "where does the saving actually land?" answerable.
        id: 'rec-kids-schnitty', name: 'Kids schnitzel', type: 'menu', onMenu: true,
        batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 2,
        sellPrice: 12.0, taxRate: 10, targetGpPct: 70,
        salesByVenue: { 'ven-flem': 25, 'ven-kens': 20 },
        method: 'Fry from frozen, halve, serve with chips.',
        lines: [
          { kind: 'ingredient', refId: 'ing-gt-schnitzel', qty: 1, unit: 'ea' },
          { kind: 'ingredient', refId: 'ing-potato', qty: 120, unit: 'g' },
        ],
      },
      {
        // Nothing is made here — the dish is the supplier's product plus chips.
        id: 'rec-tenders', name: 'Chicken tenders & chips', type: 'menu', onMenu: true,
        batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 2,
        sellPrice: 19.5, taxRate: 10, targetGpPct: 70,
        salesByVenue: { 'ven-flem': 90, 'ven-kens': 55 },
        method: 'Fry from frozen, 4 min at 180C. Serve with chips and aioli.',
        lines: [
          { kind: 'ingredient', refId: 'ing-gt-tenders', qty: 200, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-potato', qty: 200, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-mayo', qty: 25, unit: 'ml' },
        ],
      },
      {
        id: 'rec-chips', name: 'Bowl of chips', type: 'menu', onMenu: true,
        batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 2,
        sellPrice: 10.0, taxRate: 10, targetGpPct: 75,
        salesByVenue: { 'ven-flem': 260, 'ven-kens': 160 },
        method: 'Fry 3.5 min at 180C, salt immediately.',
        lines: [
          { kind: 'ingredient', refId: 'ing-potato', qty: 250, unit: 'g' },
          { kind: 'ingredient', refId: 'ing-oil', qty: 25, unit: 'ml' },
          { kind: 'ingredient', refId: 'ing-salt', qty: 3, unit: 'g' },
        ],
      },
    ];

    const suppliers = [
      { id: 'sup-gt', name: 'G&T Chickens', email: 'accounts@gtchickens.com' },
      { id: 'sup-sp', name: 'Southern Poultry', email: '' },
      { id: 'sup-bid', name: 'Bidfood', email: '' },
      { id: 'sup-mkt', name: 'Market', email: '' },
    ];

    // A sent order waiting on its invoice, so PO matching has something to
    // demonstrate on first open.
    const orders = [
      {
        id: 'ord-sample', ref: 'PO-0001', supplier: 'G&T Chickens',
        venueId: 'ven-flem', status: 'sent', createdAt: '2026-08-12',
        lines: [
          { ingredientId: 'ing-gt-schnitzel', offerId: 'off-gt-sch', qty: 4, packPrice: 96.0 },
          { ingredientId: 'ing-gt-tenders', offerId: null, qty: 2, packPrice: 41.0 },
          { ingredientId: 'ing-gt-kiev', offerId: null, qty: 1, packPrice: 88.0 },
        ],
      },
    ];

    // A closed July stocktake for Flemington. The counts are chosen so the
    // variance report has something true to say: most loss sits in chips,
    // breast and the premade schnitzel — waste, over-portioning, shrinkage.
    const stocktakes = [
      {
        id: 'st-sample', venueId: 'ven-flem', status: 'closed',
        periodStart: '2026-07-01', periodEnd: '2026-07-31',
        lines: [
          { ingredientId: 'ing-potato', openQty: 6, purchasedQty: 22, countedQty: 3.1 },
          { ingredientId: 'ing-breast', openQty: 4, purchasedQty: 16, countedQty: 2.4 },
          { ingredientId: 'ing-gt-schnitzel', openQty: 2, purchasedQty: 8, countedQty: 1.7 },
          { ingredientId: 'ing-wholebird', openQty: 2, purchasedQty: 5, countedQty: 1.5 },
          { ingredientId: 'ing-thigh', openQty: 2, purchasedQty: 7, countedQty: 1.9 },
          { ingredientId: 'ing-cheese', openQty: 3, purchasedQty: 9, countedQty: 2.6 },
          { ingredientId: 'ing-oil', openQty: 1, purchasedQty: 1.5, countedQty: 0.65 },
          { ingredientId: 'ing-crumb', openQty: 1, purchasedQty: 3.5, countedQty: 0.8 },
          { ingredientId: 'ing-napoli', openQty: 2, purchasedQty: 5, countedQty: 1.95 },
          { ingredientId: 'ing-ham', openQty: 2, purchasedQty: 7, countedQty: 1.5 },
          { ingredientId: 'ing-mayo', openQty: 1, purchasedQty: 3.6, countedQty: 0.8 },
          { ingredientId: 'ing-gt-tenders', openQty: 1, purchasedQty: 3.5, countedQty: 0.75 },
          { ingredientId: 'ing-bun', openQty: 2, purchasedQty: 8, countedQty: 2.1 },
          { ingredientId: 'ing-egg', openQty: 1, purchasedQty: 3, countedQty: 0.8 },
          { ingredientId: 'ing-lettuce', openQty: 4, purchasedQty: 16, countedQty: 3 },
          { ingredientId: 'ing-tomato', openQty: 1, purchasedQty: 1.5, countedQty: 0.75 },
          { ingredientId: 'ing-flour', openQty: 1, purchasedQty: 0, countedQty: 0.4 },
          { ingredientId: 'ing-salt', openQty: 1, purchasedQty: 0.5, countedQty: 0.3 },
          { ingredientId: 'ing-pepper', openQty: 1, purchasedQty: 0, countedQty: 0.25 },
          { ingredientId: 'ing-paprika', openQty: 1, purchasedQty: 0.5, countedQty: 0.42 },
        ],
      },
    ];

    return {
      activeClientId: 'cli-sample',
      clients: [{
        id: 'cli-sample',
        name: 'The Local Hotel Group',
        venues: [
          { id: 'ven-flem', name: 'Flemington' },
          { id: 'ven-kens', name: 'Kensington' },
        ],
        ingredients, recipes, suppliers, orders, stocktakes,
        settings: { ...defaultSettings(), business: 'The Local Hotel Group' },
      }],
    };
  }

  function defaultSettings() {
    return { taxRate: 10, targetGpPct: 70, currency: '$', business: '', priceTolerance: 0.005 };
  }

  function newClient(name) {
    return {
      id: uid('cli'),
      name: name || 'New client',
      venues: [{ id: uid('ven'), name: 'Main venue' }],
      ingredients: [], recipes: [], suppliers: [], orders: [], stocktakes: [],
      settings: { ...defaultSettings(), business: name || '' },
    };
  }

  /**
   * Bring one client's data up to the current shape. Idempotent — runs on
   * every load.
   *
   * - Pack size and price used to live on the ingredient; they now live on a
   *   supplier offer, so more than one supplier can compete for the same item.
   * - A flat `unitsSold` becomes per-venue sales, attributed to the client's
   *   first venue — the only defensible guess for a business that was a single
   *   site until now.
   */
  function migrateClient(client) {
    let changed = false;

    if (!Array.isArray(client.venues) || !client.venues.length) {
      client.venues = [{ id: uid('ven'), name: 'Main venue' }];
      changed = true;
    }
    if (!Array.isArray(client.orders)) { client.orders = []; changed = true; }
    if (!Array.isArray(client.stocktakes)) { client.stocktakes = []; changed = true; }

    for (const ing of client.ingredients || []) {
      if (!Array.isArray(ing.offers) || !ing.offers.length) {
        const offer = {
          id: uid('off'),
          supplier: ing.supplier || '',
          productCode: ing.productCode || '',
          packSize: ing.packSize,
          packUnit: ing.packUnit,
          packPrice: ing.packPrice,
          // Nothing was ever agreed for legacy items, so the price being paid
          // becomes the agreed price. It is the only defensible starting point,
          // and it means reconciliation raises nothing until you change it.
          agreedPrice: ing.agreedPrice != null ? ing.agreedPrice : ing.packPrice,
          unitSize: ing.unitSize,
          unitSizeUnit: ing.unitSizeUnit,
        };
        ing.offers = [offer];
        ing.preferredOfferId = offer.id;
        // Remove the old fields so there is only ever one source of truth.
        delete ing.packSize; delete ing.packUnit; delete ing.packPrice;
        delete ing.supplier; delete ing.productCode; delete ing.agreedPrice;
        delete ing.unitSize; delete ing.unitSizeUnit;
        changed = true;
      }
      for (const o of ing.offers) {
        if (!o.id) { o.id = uid('off'); changed = true; }
      }
      if (!ing.preferredOfferId || !ing.offers.some((o) => o.id === ing.preferredOfferId)) {
        ing.preferredOfferId = ing.offers[0].id;
        changed = true;
      }
    }

    for (const rec of client.recipes || []) {
      if (rec.salesByVenue == null) {
        const sold = Number(rec.unitsSold) || 0;
        rec.salesByVenue = sold > 0 ? { [client.venues[0].id]: sold } : {};
        delete rec.unitsSold;
        changed = true;
      }
    }

    // Every supplier named on an offer should have a record to hang an email
    // address off, so invoices and orders can be sent.
    if (!Array.isArray(client.suppliers)) { client.suppliers = []; changed = true; }
    const known = new Set(client.suppliers.map((s) => s.name.toLowerCase()));
    for (const ing of client.ingredients || []) {
      for (const o of ing.offers || []) {
        const name = (o.supplier || '').trim();
        if (name && !known.has(name.toLowerCase())) {
          client.suppliers.push({ id: uid('sup'), name, email: '' });
          known.add(name.toLowerCase());
          changed = true;
        }
      }
    }

    client.settings = { ...defaultSettings(), ...(client.settings || {}) };
    return changed;
  }

  /** Top-level shape: a v1 single-business dataset becomes one client. */
  function migrate(st) {
    let changed = false;

    if (!Array.isArray(st.clients)) {
      const client = {
        id: uid('cli'),
        name: (st.settings && st.settings.business) || 'My business',
        venues: [],
        ingredients: st.ingredients || [],
        recipes: st.recipes || [],
        suppliers: st.suppliers || [],
        orders: [],
        settings: st.settings || defaultSettings(),
      };
      st.clients = [client];
      st.activeClientId = client.id;
      delete st.ingredients; delete st.recipes; delete st.suppliers; delete st.settings;
      changed = true;
    }

    if (!st.clients.length) {
      st.clients.push(newClient('My business'));
      changed = true;
    }
    for (const c of st.clients) {
      if (!c.id) { c.id = uid('cli'); changed = true; }
      if (migrateClient(c)) changed = true;
    }
    if (!st.activeClientId || !st.clients.some((c) => c.id === st.activeClientId)) {
      st.activeClientId = st.clients[0].id;
      changed = true;
    }
    return changed;
  }

  let state = null;

  function load() {
    if (state) return state;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        state = JSON.parse(raw);
      } else {
        // First run on v2: pick up a v1 dataset if one exists rather than
        // dropping the user back to sample data.
        const legacy = localStorage.getItem(LEGACY_KEY);
        state = legacy ? JSON.parse(legacy) : seed();
      }
    } catch (err) {
      console.warn('Could not read saved data, starting from the sample set.', err);
      state = seed();
    }
    if (migrate(state)) save();
    return state;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Could not save — storage may be full or blocked.', err);
      return false;
    }
    return true;
  }

  // ---- clients & venues ----

  function clients() { return load().clients; }

  function activeClient() {
    const st = load();
    return st.clients.find((c) => c.id === st.activeClientId) || st.clients[0];
  }

  function setActiveClient(id) {
    const st = load();
    if (st.clients.some((c) => c.id === id)) {
      st.activeClientId = id;
      save();
    }
    return activeClient();
  }

  function addClient(name) {
    const client = newClient(name);
    load().clients.push(client);
    load().activeClientId = client.id;
    save();
    return client;
  }

  function renameClient(id, name) {
    const client = clients().find((c) => c.id === id);
    if (client && name.trim()) { client.name = name.trim(); save(); }
  }

  function deleteClient(id) {
    const st = load();
    if (st.clients.length <= 1) throw new Error('At least one client is required.');
    st.clients = st.clients.filter((c) => c.id !== id);
    if (st.activeClientId === id) st.activeClientId = st.clients[0].id;
    save();
  }

  function venues() { return activeClient().venues; }

  function getVenue(id) { return venues().find((v) => v.id === id) || null; }

  function upsertVenue(data) {
    const list = venues();
    if (data.id) {
      const idx = list.findIndex((v) => v.id === data.id);
      if (idx >= 0) { list[idx] = { ...list[idx], ...data }; save(); return list[idx]; }
    }
    const created = { id: uid('ven'), name: 'New venue', ...data };
    list.push(created);
    save();
    return created;
  }

  function deleteVenue(id) {
    const list = venues();
    if (list.length <= 1) throw new Error('A client needs at least one venue.');
    const idx = list.findIndex((v) => v.id === id);
    if (idx < 0) return;
    list.splice(idx, 1);
    // Sales recorded against the removed venue go with it — the caller is
    // expected to have warned about that.
    for (const rec of recipes()) {
      if (rec.salesByVenue && rec.salesByVenue[id] != null) delete rec.salesByVenue[id];
    }
    save();
  }

  // ---- per-client accessors (everything below reads the active client) ----

  const ingredients = () => activeClient().ingredients;
  const recipes = () => activeClient().recipes;
  const suppliers = () => activeClient().suppliers;
  const settings = () => activeClient().settings;
  const ctx = () => ({ ingredients: ingredients(), recipes: recipes() });

  /**
   * Recipes with `unitsSold` resolved from per-venue sales — the whole group
   * when venueId is null, one site otherwise. The costing engine only ever
   * sees the resolved number.
   */
  function recipesWithSales(venueId = null) {
    return recipes().map((r) => {
      const sales = r.salesByVenue || {};
      const unitsSold = venueId != null
        ? Number(sales[venueId]) || 0
        : Object.values(sales).reduce((sum, n) => sum + (Number(n) || 0), 0);
      return { ...r, unitsSold };
    });
  }

  const salesCtx = (venueId = null) =>
    ({ ingredients: ingredients(), recipes: recipesWithSales(venueId) });

  // ---- suppliers ----

  function upsertSupplier(data) {
    const list = suppliers();
    if (data.id) {
      const idx = list.findIndex((s) => s.id === data.id);
      if (idx >= 0) { list[idx] = { ...list[idx], ...data }; save(); return list[idx]; }
    }
    const created = { id: uid('sup'), name: '', email: '', ...data };
    list.push(created);
    save();
    return created;
  }

  function supplierByName(name) {
    const n = String(name || '').trim().toLowerCase();
    return suppliers().find((s) => s.name.toLowerCase() === n) || null;
  }

  /** Suppliers can't be deleted while offers still name them. */
  function supplierUsage(name) {
    const n = String(name || '').trim().toLowerCase();
    return ingredients()
      .filter((i) => (i.offers || []).some((o) => (o.supplier || '').toLowerCase() === n))
      .map((i) => i.name);
  }

  function deleteSupplier(id) {
    const list = suppliers();
    const idx = list.findIndex((s) => s.id === id);
    if (idx >= 0) { list.splice(idx, 1); save(); }
  }

  // ---- supplier offers on an ingredient ----

  function addOffer(ingredientId, data = {}) {
    const ing = getIngredient(ingredientId);
    if (!ing) return null;
    const from = Costing.activeOffer(ing);
    // Seed a new offer from the current one so only what differs needs typing.
    const offer = {
      id: uid('off'),
      supplier: '', productCode: '',
      packSize: from.packSize, packUnit: from.packUnit, packPrice: from.packPrice,
      agreedPrice: null, unitSize: from.unitSize, unitSizeUnit: from.unitSizeUnit,
      ...data,
    };
    ing.offers = ing.offers || [];
    ing.offers.push(offer);
    save();
    return offer;
  }

  function deleteOffer(ingredientId, offerId) {
    const ing = getIngredient(ingredientId);
    if (!ing || !ing.offers) return;
    // Never leave an ingredient with no way of being priced.
    if (ing.offers.length <= 1) throw new Error('An ingredient needs at least one supplier price.');
    ing.offers = ing.offers.filter((o) => o.id !== offerId);
    if (ing.preferredOfferId === offerId) ing.preferredOfferId = ing.offers[0].id;
    save();
  }

  function setPreferredOffer(ingredientId, offerId) {
    const ing = getIngredient(ingredientId);
    if (!ing) return;
    ing.preferredOfferId = offerId;
    save();
  }

  // ---- purchase orders ----

  function orders() { return activeClient().orders; }

  function getOrder(id) { return orders().find((o) => o.id === id) || null; }

  /** PO-0001, PO-0002… per client, counting from the highest existing ref. */
  function nextOrderRef() {
    const max = orders().reduce((best, o) => {
      const m = /^PO-(\d+)$/.exec(o.ref || '');
      return m ? Math.max(best, Number(m[1])) : best;
    }, 0);
    return `PO-${String(max + 1).padStart(4, '0')}`;
  }

  function upsertOrder(data) {
    const list = orders();
    if (data.id) {
      const idx = list.findIndex((o) => o.id === data.id);
      if (idx >= 0) { list[idx] = { ...list[idx], ...data }; save(); return list[idx]; }
    }
    const created = {
      id: uid('ord'),
      ref: nextOrderRef(),
      supplier: '',
      venueId: venues()[0].id,
      status: 'draft',
      createdAt: new Date().toISOString().slice(0, 10),
      lines: [],
      ...data,
    };
    list.push(created);
    save();
    return created;
  }

  function deleteOrder(id) {
    const list = orders();
    const idx = list.findIndex((o) => o.id === id);
    if (idx >= 0) { list.splice(idx, 1); save(); }
  }

  // ---- stocktakes ----

  function stocktakes() { return activeClient().stocktakes; }

  function getStocktake(id) { return stocktakes().find((s) => s.id === id) || null; }

  /**
   * Start a count for a venue. Opening balances carry over from the venue's
   * most recent closed stocktake; purchases prefill from received orders in
   * the period. Both stay editable — prefills are a head start, not gospel.
   */
  function createStocktake(venueId, periodStart, periodEnd) {
    const prev = stocktakes()
      .filter((s) => s.venueId === venueId && s.status === 'closed')
      .sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || ''))[0] || null;
    const openBy = {};
    if (prev) for (const l of prev.lines || []) openBy[l.ingredientId] = Number(l.countedQty) || 0;

    const purchases = Stocktake.purchasesFromOrders(
      orders(), ingredients(), venueId, periodStart, periodEnd);

    const st = {
      id: uid('st'),
      venueId, periodStart, periodEnd,
      status: 'open',
      lines: ingredients().map((i) => ({
        ingredientId: i.id,
        openQty: openBy[i.id] != null ? openBy[i.id] : 0,
        purchasedQty: purchases[i.id] != null ? purchases[i.id] : 0,
        countedQty: null,
      })),
    };
    stocktakes().push(st);
    save();
    return st;
  }

  function upsertStocktake(data) {
    const list = stocktakes();
    const idx = list.findIndex((s) => s.id === data.id);
    if (idx >= 0) { list[idx] = { ...list[idx], ...data }; save(); return list[idx]; }
    return null;
  }

  function deleteStocktake(id) {
    const list = stocktakes();
    const idx = list.findIndex((s) => s.id === id);
    if (idx >= 0) { list.splice(idx, 1); save(); }
  }

  /** Storage locations already in use, for the ingredient editor's datalist. */
  function locations() {
    return [...new Set(ingredients().map((i) => (i.location || '').trim()).filter(Boolean))].sort();
  }

  // ---- ingredients & recipes ----

  function getIngredient(id) { return ingredients().find((i) => i.id === id) || null; }
  function getRecipe(id) { return recipes().find((r) => r.id === id) || null; }

  function upsertIngredient(data) {
    const list = ingredients();
    if (data.id) {
      const idx = list.findIndex((i) => i.id === data.id);
      if (idx >= 0) { list[idx] = { ...list[idx], ...data }; save(); return list[idx]; }
    }
    const created = { id: uid('ing'), yieldPct: 100, ...data };
    list.push(created);
    // A brand new ingredient may arrive in the flat shape from an import; fold
    // it into an offer the same way stored data is folded.
    migrateClient(activeClient());
    save();
    return created;
  }

  function upsertRecipe(data) {
    const list = recipes();
    if (data.id) {
      const idx = list.findIndex((r) => r.id === data.id);
      if (idx >= 0) { list[idx] = { ...list[idx], ...data }; save(); return list[idx]; }
    }
    const s = settings();
    const created = {
      id: uid('rec'), type: 'menu', onMenu: true, lines: [],
      batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 0,
      sellPrice: 0, taxRate: s.taxRate, targetGpPct: s.targetGpPct,
      salesByVenue: {}, method: '',
      ...data,
    };
    list.push(created);
    save();
    return created;
  }

  // Deleting an ingredient that recipes still reference would leave those
  // recipes quietly wrong, so callers get told who depends on it first.
  function ingredientUsage(id) {
    return recipes()
      .filter((r) => (r.lines || []).some((l) => l.kind === 'ingredient' && l.refId === id))
      .map((r) => r.name);
  }

  function recipeUsage(id) {
    return recipes()
      .filter((r) => (r.lines || []).some((l) => l.kind === 'recipe' && l.refId === id))
      .map((r) => r.name);
  }

  function deleteIngredient(id) {
    const list = ingredients();
    const idx = list.findIndex((i) => i.id === id);
    if (idx >= 0) { list.splice(idx, 1); save(); }
  }

  function deleteRecipe(id) {
    const list = recipes();
    const idx = list.findIndex((r) => r.id === id);
    if (idx >= 0) { list.splice(idx, 1); save(); }
  }

  function duplicateRecipe(id) {
    const src = getRecipe(id);
    if (!src) return null;
    const copy = { ...structuredClone(src), id: uid('rec'), name: `${src.name} (copy)` };
    recipes().push(copy);
    save();
    return copy;
  }

  function updateSettings(patch) {
    Object.assign(activeClient().settings, patch);
    save();
  }

  // ---- backup ----

  function exportJson() {
    return JSON.stringify({ ...load(), exportedAt: new Date().toISOString(), version: 2 }, null, 2);
  }

  function importJson(text) {
    const parsed = JSON.parse(text);
    const isV2 = parsed && Array.isArray(parsed.clients);
    const isV1 = parsed && Array.isArray(parsed.ingredients) && Array.isArray(parsed.recipes);
    if (!isV2 && !isV1) {
      throw new Error('That file does not look like a Costimator export.');
    }
    state = isV2
      ? { activeClientId: parsed.activeClientId, clients: parsed.clients }
      : {
          // A v1 export is a single business; migrate() wraps it as one client.
          ingredients: parsed.ingredients,
          recipes: parsed.recipes,
          suppliers: parsed.suppliers || [],
          settings: parsed.settings || defaultSettings(),
        };
    migrate(state);
    save();
    return state;
  }

  function resetToSample() { state = seed(); migrate(state); save(); return state; }

  /** Clears the ACTIVE client only — other clients are untouched. */
  function clearAll() {
    const client = activeClient();
    client.ingredients = [];
    client.recipes = [];
    client.suppliers = [];
    client.orders = [];
    client.stocktakes = [];
    client.venues = [{ id: uid('ven'), name: 'Main venue' }];
    save();
    return state;
  }

  return {
    uid, load, save, migrate,
    clients, activeClient, setActiveClient, addClient, renameClient, deleteClient,
    venues, getVenue, upsertVenue, deleteVenue,
    ingredients, recipes, suppliers, settings, ctx,
    recipesWithSales, salesCtx,
    orders, getOrder, nextOrderRef, upsertOrder, deleteOrder,
    stocktakes, getStocktake, createStocktake, upsertStocktake, deleteStocktake, locations,
    upsertSupplier, supplierByName, supplierUsage, deleteSupplier,
    addOffer, deleteOffer, setPreferredOffer,
    getIngredient, getRecipe, upsertIngredient, upsertRecipe,
    ingredientUsage, recipeUsage, deleteIngredient, deleteRecipe, duplicateRecipe,
    updateSettings, exportJson, importJson, resetToSample, clearAll,
  };
})();

if (typeof window !== 'undefined') window.Store = Store;
