// Stocktake: count what's on the shelf, then close the loop on COGS.
//
//   actual usage      = opening stock + purchases − closing count
//   theoretical usage = what the recipes say you should have used, given sales
//   variance          = actual − theoretical  →  unexplained loss, per item
//
// The variance is the point. Waste, over-portioning, prep errors and shrinkage
// never appear on an invoice — they appear here, as the gap between what left
// the shelf and what the menu accounts for. Everything is valued at the raw
// pack price of the offer you currently buy, so the report ties out against
// the menu's theoretical COGS to the cent (see the invariant test).
//
// Pure functions over plain data, like the other engines — see js/tests-stocktake.js.

const Stocktake = (() => {
  const U = typeof require !== 'undefined' && typeof window === 'undefined'
    ? require('./units.js') : window.Units;
  const C = typeof require !== 'undefined' && typeof window === 'undefined'
    ? require('./costing.js') : window.Costing;

  const round = C.round;

  /**
   * Convert a line quantity into base units of the ingredient AS PURCHASED.
   *
   * Recipe lines state usable quantities; yield loss (trim, bone-out) is
   * expected loss, so it belongs in theoretical usage — 700g of usable bird at
   * 68% yield consumes 1029g of the bird you actually count on the shelf.
   */
  function rawBaseQty(ingredient, qty, unit) {
    const { unit: baseUnit } = C.unitCost(ingredient); // throws if the offer is broken
    const inBase = U.convert(qty, unit, baseUnit, ingredient.density);
    const yieldPct = ingredient.yieldPct == null ? 100 : Number(ingredient.yieldPct);
    return inBase / (yieldPct / 100);
  }

  /**
   * Accumulate raw-stock usage for a fraction of one batch of a recipe.
   *
   * Batch wastage is expected loss too: delivering X sellable output from a
   * batch that loses w% consumes inputs for X/(1−w). Sub-recipes recurse with
   * the fraction of THEIR batch this recipe consumes; the make/buy switch on a
   * line routes the usage to whichever source the dish is actually costed on —
   * buy the schnitzel in and it is the bought product that leaves your shelf.
   */
  function explode(recipe, ctx, fractionOfBatch, acc, stack, errors) {
    const w = Number(recipe.wastagePct || 0);
    const wf = w > 0 && w < 100 ? 1 - w / 100 : 1;
    const f = fractionOfBatch / wf;

    for (const line of (recipe.lines || [])) {
      try {
        const useAlt = Boolean(line.useAlt && line.alt && line.alt.refId);
        if (useAlt || line.kind === 'ingredient') {
          const refId = useAlt ? line.alt.refId : line.refId;
          const qty = Number(useAlt ? line.alt.qty : line.qty);
          const unit = useAlt ? line.alt.unit : line.unit;
          const ing = ctx.ingredients.find((i) => i.id === refId);
          if (!ing || !(qty > 0)) continue;
          acc[ing.id] = (acc[ing.id] || 0) + rawBaseQty(ing, qty, unit) * f;
        } else if (line.kind === 'recipe') {
          const sub = ctx.recipes.find((r) => r.id === line.refId);
          if (!sub || stack.includes(sub.id)) continue;
          const subYield = U.toBase(Number(sub.batchYieldQty), sub.batchYieldUnit);
          if (!(subYield.qty > 0)) continue;
          const qtyBase = U.convert(Number(line.qty), line.unit, subYield.unit, sub.density);
          explode(sub, ctx, (qtyBase / subYield.qty) * f, acc, [...stack, sub.id], errors);
        }
      } catch (err) {
        errors.push(`${recipe.name}: ${err.message}`);
      }
    }
  }

  /**
   * Total raw-stock usage the menu accounts for, given sales volumes.
   * Returns base-unit quantities per ingredient id.
   */
  function theoreticalUsage(recipes, ctx) {
    const usage = {};
    const errors = [];
    for (const r of recipes) {
      if (r.onMenu === false) continue;
      const sold = Number(r.unitsSold) || 0;
      if (!(sold > 0)) continue;
      const portions = Number(r.portions) > 0 ? Number(r.portions) : 1;
      explode(r, { ...ctx, recipes }, sold / portions, usage, [r.id], errors);
    }
    return { usage, errors };
  }

  /**
   * Purchases during the period, in packs of each ingredient's ACTIVE offer.
   *
   * Prefilled from received purchase orders for the venue. An order raised on
   * a different supplier's pack is converted through base units, so 2 packs of
   * a 24-piece case still land correctly against a 30-piece active offer.
   */
  function purchasesFromOrders(orders, ingredients, venueId, from, to) {
    const packs = {};
    for (const order of orders || []) {
      if (order.status !== 'received') continue;
      if (venueId && order.venueId !== venueId) continue;
      const d = order.createdAt || '';
      if (from && d < from) continue;
      if (to && d > to) continue;
      for (const line of order.lines || []) {
        const ing = ingredients.find((i) => i.id === line.ingredientId);
        if (!ing) continue;
        try {
          const orderOffer = (ing.offers || []).find((o) => o.id === line.offerId) || C.activeOffer(ing);
          const active = C.activeOffer(ing);
          const orderPackBase = U.toBase(Number(orderOffer.packSize), orderOffer.packUnit).qty;
          const activePackBase = U.toBase(Number(active.packSize), active.packUnit).qty;
          if (!(orderPackBase > 0) || !(activePackBase > 0)) continue;
          packs[ing.id] = (packs[ing.id] || 0)
            + (Number(line.qty) || 0) * (orderPackBase / activePackBase);
        } catch (err) { /* an unpriceable line contributes nothing */ }
      }
    }
    for (const id of Object.keys(packs)) packs[id] = round(packs[id], 3);
    return packs;
  }

  /**
   * The report. Counts are in packs of the active offer; everything is valued
   * at that offer's raw pack price. `ctx.recipes` must carry the venue's
   * resolved sales, since a venue's stock only answers for that venue's menu.
   */
  function analyseStocktake(st, ctx) {
    const { usage, errors } = theoreticalUsage(ctx.recipes, ctx);

    const lines = [];
    const countedIds = new Set();

    for (const l of st.lines || []) {
      const ing = ctx.ingredients.find((i) => i.id === l.ingredientId);
      if (!ing) continue;
      countedIds.add(ing.id);

      const hasMovement = Number(l.openQty) > 0 || Number(l.purchasedQty) > 0
        || l.countedQty != null;
      const theoBaseEarly = usage[ing.id] || 0;
      // Never stocked, never counted, never used: not part of this stocktake.
      if (!hasMovement && !(theoBaseEarly > 0)) continue;

      let offer;
      let packBase;
      let rawUnitCost;
      try {
        offer = C.activeOffer(ing);
        packBase = U.toBase(Number(offer.packSize), offer.packUnit);
        if (!(packBase.qty > 0)) throw new Error(`"${ing.name}" has no pack size.`);
        rawUnitCost = Number(offer.packPrice) / packBase.qty;
      } catch (err) {
        lines.push({ ingredientId: ing.id, name: ing.name, error: err.message });
        continue;
      }

      const toBase = (packs) => (Number(packs) || 0) * packBase.qty;
      const openBase = toBase(l.openQty);
      const purchasedBase = toBase(l.purchasedQty);
      const closingBase = toBase(l.countedQty);
      const actualBase = openBase + purchasedBase - closingBase;
      const theoBase = theoBaseEarly;
      const varianceBase = actualBase - theoBase;

      lines.push({
        ingredientId: ing.id,
        name: ing.name,
        location: ing.location || 'Unassigned',
        packSize: Number(offer.packSize),
        packUnit: offer.packUnit,
        baseUnit: packBase.unit,
        openQty: Number(l.openQty) || 0,
        purchasedQty: Number(l.purchasedQty) || 0,
        countedQty: l.countedQty == null ? null : Number(l.countedQty),
        uncounted: l.countedQty == null && (openBase > 0 || purchasedBase > 0),
        openValue: round(openBase * rawUnitCost, 2),
        purchasedValue: round(purchasedBase * rawUnitCost, 2),
        closingValue: round(closingBase * rawUnitCost, 2),
        actualBase: round(actualBase, 2),
        theoBase: round(theoBase, 2),
        varianceBase: round(varianceBase, 2),
        actualValue: round(actualBase * rawUnitCost, 2),
        theoValue: round(theoBase * rawUnitCost, 2),
        varianceValue: round(varianceBase * rawUnitCost, 2),
        variancePct: theoBase > 0 ? round((varianceBase / theoBase) * 100, 1) : null,
        // More closing stock than opening+purchases can supply: a count or
        // receiving error, not a physical possibility.
        countError: actualBase < -1e-9,
        error: null,
      });
    }

    // Stock the menu consumed that this count never looked at.
    const notCounted = Object.keys(usage)
      .filter((id) => !countedIds.has(id) && usage[id] > 0)
      .map((id) => {
        const ing = ctx.ingredients.find((i) => i.id === id);
        if (!ing) return null;
        try {
          const { cost } = C.unitCost(ing);
          return { ingredientId: id, name: ing.name, theoBase: round(usage[id], 2),
            theoValue: round(usage[id] * cost, 2) };
        } catch (err) { return { ingredientId: id, name: ing.name, theoBase: round(usage[id], 2), theoValue: 0 }; }
      })
      .filter(Boolean)
      .sort((a, b) => b.theoValue - a.theoValue);

    const ok = lines.filter((l) => !l.error);
    const sum = (fn) => round(ok.reduce((s, l) => s + fn(l), 0), 2);
    const openingValue = sum((l) => l.openValue);
    const purchasesValue = sum((l) => l.purchasedValue);
    const closingValue = sum((l) => l.closingValue);
    const actualCogs = sum((l) => l.actualValue);
    const theoCogs = sum((l) => l.theoValue);
    const varianceValue = sum((l) => l.varianceValue);

    // The same variance, said in menu terms.
    const menu = C.analyseMenu(ctx.recipes, ctx);
    const revenue = menu.totalRevenue;

    const ranked = ok.filter((l) => !l.countError)
      .slice().sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue));
    const worst = ranked[0] && Math.abs(ranked[0].varianceValue) > 0.005 ? ranked[0] : null;

    return {
      lines: ok.slice().sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue)),
      broken: lines.filter((l) => l.error),
      notCounted,
      usageErrors: errors,
      openingValue,
      purchasesValue,
      closingValue,
      actualCogs,
      theoCogs,
      varianceValue,
      variancePct: theoCogs > 0 ? round((varianceValue / theoCogs) * 100, 2) : 0,
      revenue: round(revenue, 2),
      theoFoodCostPct: revenue > 0 ? round((theoCogs / revenue) * 100, 2) : 0,
      actualFoodCostPct: revenue > 0 ? round((actualCogs / revenue) * 100, 2) : 0,
      uncountedLines: ok.filter((l) => l.uncounted).length,
      countErrors: ok.filter((l) => l.countError).length,
      worst: worst ? {
        name: worst.name,
        varianceValue: worst.varianceValue,
        shareOfVariance: Math.abs(varianceValue) > 0.005
          ? round((Math.abs(worst.varianceValue) / ok.reduce((s, l) => s + Math.abs(l.varianceValue), 0)) * 100, 1)
          : 0,
      } : null,
    };
  }

  return { rawBaseQty, explode, theoreticalUsage, purchasesFromOrders, analyseStocktake };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Stocktake;
if (typeof window !== 'undefined') window.Stocktake = Stocktake;
