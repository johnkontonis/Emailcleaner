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
      { id: 'ing-gt-schnitzel', name: 'Crumbed chicken schnitzel 180g', category: 'Finished products', supplier: 'G&T Chickens', productCode: 'GT-SCH-180', packSize: 24, packUnit: 'ea', packPrice: 92.0, yieldPct: 100, isFinishedProduct: true },
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

    return { ingredients, recipes, settings: { taxRate: 10, targetGpPct: 70, currency: '$' } };
  }

  function emptyState() {
    return { ingredients: [], recipes: [], settings: { taxRate: 10, targetGpPct: 70, currency: '$' } };
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
    state.settings = state.settings || { taxRate: 10, targetGpPct: 70, currency: '$' };
    state.ingredients = state.ingredients || [];
    state.recipes = state.recipes || [];
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
  const settings = () => load().settings;
  const ctx = () => ({ ingredients: ingredients(), recipes: recipes() });

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
      settings: parsed.settings || { taxRate: 10, targetGpPct: 70, currency: '$' },
    };
    save();
    return state;
  }

  function resetToSample() { state = seed(); save(); return state; }
  function clearAll() { state = emptyState(); save(); return state; }

  return {
    uid, load, save, ingredients, recipes, settings, ctx,
    getIngredient, getRecipe, upsertIngredient, upsertRecipe,
    ingredientUsage, recipeUsage, deleteIngredient, deleteRecipe, duplicateRecipe,
    updateSettings, exportJson, importJson, resetToSample, clearAll,
  };
})();

if (typeof window !== 'undefined') window.Store = Store;
