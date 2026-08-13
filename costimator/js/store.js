// Persistence. Everything lives in localStorage — the whole app is a static
// page, so your costings never leave the machine. Export/import is the backup
// story, and the seam below is where a real API would slot in later.

const Store = (() => {
  const KEY = 'costimator:v1';

  const uid = (prefix) =>
    `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;

  // A poultry-leaning starter set so the app is useful on first open rather
  // than an empty shell. Prices are placeholders — replace with your invoices.
  function seed() {
    const ingredients = [
      { id: 'ing-maryland', name: 'Chicken maryland', category: 'Poultry', supplier: 'G&T Chickens', packSize: 10, packUnit: 'kg', packPrice: 62.5, yieldPct: 100 },
      { id: 'ing-breast', name: 'Chicken breast fillet', category: 'Poultry', supplier: 'G&T Chickens', packSize: 5, packUnit: 'kg', packPrice: 57.5, yieldPct: 96 },
      { id: 'ing-wholebird', name: 'Whole bird size 16', category: 'Poultry', supplier: 'G&T Chickens', packSize: 12, packUnit: 'kg', packPrice: 63.6, yieldPct: 68 },
      { id: 'ing-thigh', name: 'Chicken thigh fillet', category: 'Poultry', supplier: 'G&T Chickens', packSize: 5, packUnit: 'kg', packPrice: 48.0, yieldPct: 98 },
      // Finished products — bought in ready to cook, no build required. These
      // are ordinary ingredients as far as costing goes; the flag just lets the
      // app group them and offer them as a bought-in source for a dish.
      // Two suppliers compete for this one, at different piece sizes — the
      // comparison this is here to demonstrate.
      {
        id: 'ing-gt-schnitzel', name: 'Crumbed chicken schnitzel',
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
      { id: 'ing-gt-tenders', name: 'Crumbed chicken tenders', category: 'Finished products', supplier: 'G&T Chickens', productCode: 'GT-TEN-5K', packSize: 5, packUnit: 'kg', packPrice: 41.0, yieldPct: 100, isFinishedProduct: true },
      { id: 'ing-gt-kiev', name: 'Garlic chicken kiev 200g', category: 'Finished products', supplier: 'G&T Chickens', productCode: 'GT-KIE-200', packSize: 20, packUnit: 'ea', packPrice: 88.0, yieldPct: 100, isFinishedProduct: true },

      { id: 'ing-flour', name: 'Plain flour', category: 'Dry goods', supplier: 'Bidfood', packSize: 12.5, packUnit: 'kg', packPrice: 18.75, yieldPct: 100 },
      { id: 'ing-crumb', name: 'Panko breadcrumb', category: 'Dry goods', supplier: 'Bidfood', packSize: 10, packUnit: 'kg', packPrice: 42.0, yieldPct: 100 },
      { id: 'ing-egg', name: 'Eggs 55g', category: 'Dairy & eggs', supplier: 'Bidfood', packSize: 15, packUnit: 'doz', packPrice: 72.0, yieldPct: 100 },
      { id: 'ing-oil', name: 'Vegetable oil', category: 'Oils', supplier: 'Bidfood', packSize: 20, packUnit: 'l', packPrice: 48.0, yieldPct: 100, density: 0.92 },
      { id: 'ing-salt', name: 'Fine salt', category: 'Dry goods', supplier: 'Bidfood', packSize: 2, packUnit: 'kg', packPrice: 3.2, yieldPct: 100 },
      { id: 'ing-pepper', name: 'Cracked pepper', category: 'Dry goods', supplier: 'Bidfood', packSize: 500, packUnit: 'g', packPrice: 14.5, yieldPct: 100 },
      { id: 'ing-paprika', name: 'Smoked paprika', category: 'Dry goods', supplier: 'Bidfood', packSize: 500, packUnit: 'g', packPrice: 16.8, yieldPct: 100 },
      { id: 'ing-napoli', name: 'Napoli sauce', category: 'Wet goods', supplier: 'Bidfood', packSize: 4, packUnit: 'l', packPrice: 22.4, yieldPct: 100, density: 1.05 },
      { id: 'ing-cheese', name: 'Mozzarella shredded', category: 'Dairy & eggs', supplier: 'Bidfood', packSize: 2, packUnit: 'kg', packPrice: 24.6, yieldPct: 100 },
      { id: 'ing-ham', name: 'Sliced leg ham', category: 'Smallgoods', supplier: 'Bidfood', packSize: 1.5, packUnit: 'kg', packPrice: 21.0, yieldPct: 100 },
      { id: 'ing-potato', name: 'Frozen chips 10mm', category: 'Frozen', supplier: 'Bidfood', packSize: 10, packUnit: 'kg', packPrice: 26.0, yieldPct: 100 },
      // Bought by the head but used by weight, so the pack is expressed in
      // grams — a whole head runs about 500g before the core and outer leaves.
      { id: 'ing-lettuce', name: 'Iceberg lettuce', category: 'Produce', supplier: 'Market', packSize: 500, packUnit: 'g', packPrice: 3.4, yieldPct: 74 },
      { id: 'ing-tomato', name: 'Tomato', category: 'Produce', supplier: 'Market', packSize: 5, packUnit: 'kg', packPrice: 21.0, yieldPct: 91 },
      { id: 'ing-bun', name: 'Brioche bun', category: 'Bakery', supplier: 'Bidfood', packSize: 48, packUnit: 'ea', packPrice: 28.8, yieldPct: 100 },
      { id: 'ing-mayo', name: 'Whole egg mayonnaise', category: 'Wet goods', supplier: 'Bidfood', packSize: 3, packUnit: 'l', packPrice: 19.5, yieldPct: 100, density: 0.94 },
    ];

    const recipes = [
      {
        id: 'rec-crumbmix', name: 'Seasoned crumb mix', type: 'sub', onMenu: false,
        batchYieldQty: 5, batchYieldUnit: 'kg', portions: 1, wastagePct: 0,
        sellPrice: 0, taxRate: 10, targetGpPct: 70, unitsSold: 0,
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
        sellPrice: 0, taxRate: 10, targetGpPct: 70, unitsSold: 0,
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
        sellPrice: 26.0, taxRate: 10, targetGpPct: 70, unitsSold: 180,
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
        sellPrice: 29.5, taxRate: 10, targetGpPct: 70, unitsSold: 380,
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
        sellPrice: 22.0, taxRate: 10, targetGpPct: 70, unitsSold: 310,
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
        sellPrice: 27.0, taxRate: 10, targetGpPct: 70, unitsSold: 95,
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
        sellPrice: 18.5, taxRate: 10, targetGpPct: 70, unitsSold: 260,
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
        sellPrice: 12.0, taxRate: 10, targetGpPct: 70, unitsSold: 45,
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
        sellPrice: 19.5, taxRate: 10, targetGpPct: 70, unitsSold: 145,
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
        sellPrice: 10.0, taxRate: 10, targetGpPct: 75, unitsSold: 420,
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

    return { ingredients, recipes, suppliers, settings: defaultSettings() };
  }

  function defaultSettings() {
    return { taxRate: 10, targetGpPct: 70, currency: '$', business: '', priceTolerance: 0.005 };
  }

  function emptyState() {
    return { ingredients: [], recipes: [], suppliers: [], settings: defaultSettings() };
  }

  /**
   * Bring stored data up to the current shape.
   *
   * Pack size and price used to live on the ingredient itself. They now live on
   * a supplier offer, so more than one supplier can compete for the same item.
   * Anything still in the old shape is folded into a single offer here, so no
   * price ever needs re-entering. Idempotent — safe to run on every load.
   */
  function migrate(state) {
    let changed = false;

    for (const ing of state.ingredients || []) {
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

    // Every supplier named on an offer should have a record to hang an email
    // address off, so invoices can be answered.
    if (!Array.isArray(state.suppliers)) { state.suppliers = []; changed = true; }
    const known = new Set(state.suppliers.map((s) => s.name.toLowerCase()));
    for (const ing of state.ingredients || []) {
      for (const o of ing.offers || []) {
        const name = (o.supplier || '').trim();
        if (name && !known.has(name.toLowerCase())) {
          state.suppliers.push({ id: uid('sup'), name, email: '' });
          known.add(name.toLowerCase());
          changed = true;
        }
      }
    }

    return changed;
  }

  let state = null;

  function load() {
    if (state) return state;
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : seed();
    } catch (err) {
      console.warn('Could not read saved data, starting from the sample set.', err);
      state = seed();
    }
    state.settings = { ...defaultSettings(), ...(state.settings || {}) };
    state.ingredients = state.ingredients || [];
    state.recipes = state.recipes || [];
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

  const ingredients = () => load().ingredients;
  const recipes = () => load().recipes;
  const suppliers = () => load().suppliers;
  const settings = () => load().settings;
  const ctx = () => ({ ingredients: ingredients(), recipes: recipes() });

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
    // A brand new ingredient arrives in the flat shape from the editor; fold it
    // into an offer the same way stored data is folded.
    migrate({ ingredients: [created], suppliers: load().suppliers });
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
      sellPrice: 0, taxRate: s.taxRate, targetGpPct: s.targetGpPct, unitsSold: 0, method: '',
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
    Object.assign(load().settings, patch);
    save();
  }

  function exportJson() {
    return JSON.stringify({ ...load(), exportedAt: new Date().toISOString(), version: 1 }, null, 2);
  }

  function importJson(text) {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.ingredients) || !Array.isArray(parsed.recipes)) {
      throw new Error('That file does not look like a Costimator export.');
    }
    state = {
      ingredients: parsed.ingredients,
      recipes: parsed.recipes,
      suppliers: parsed.suppliers || [],
      settings: { ...defaultSettings(), ...(parsed.settings || {}) },
    };
    // An export from an older version comes in the old shape.
    migrate(state);
    save();
    return state;
  }

  function resetToSample() { state = seed(); save(); return state; }
  function clearAll() { state = emptyState(); save(); return state; }

  return {
    uid, load, save, migrate, ingredients, recipes, suppliers, settings, ctx,
    upsertSupplier, supplierByName, supplierUsage, deleteSupplier,
    addOffer, deleteOffer, setPreferredOffer,
    getIngredient, getRecipe, upsertIngredient, upsertRecipe,
    ingredientUsage, recipeUsage, deleteIngredient, deleteRecipe, duplicateRecipe,
    updateSettings, exportJson, importJson, resetToSample, clearAll,
  };
})();

if (typeof window !== 'undefined') window.Store = Store;
