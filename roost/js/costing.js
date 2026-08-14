// The costing engine. Pure functions over plain data — no DOM, no storage — so
// the numbers can be tested on their own (see js/tests.js).
//
// Model
//   Ingredient  a purchased item: a pack of a given size at a given price,
//               with a yield % covering trim/peel/bone-out loss.
//   Recipe      a list of lines (ingredients and/or other recipes), producing a
//               batch yield that divides into portions.
//
// Costs flow: pack price -> unit cost -> yielded unit cost -> line cost ->
// batch cost -> portion cost -> GP.

const Costing = (() => {
  const U = typeof require !== 'undefined' && typeof window === 'undefined'
    ? require('./units.js')
    : window.Units;

  const round = (n, dp = 4) => {
    if (!isFinite(n)) return 0;
    const f = 10 ** dp;
    return Math.round((n + Number.EPSILON) * f) / f;
  };

  /**
   * The supplier offer an ingredient is currently bought on.
   *
   * An ingredient is the thing you use; an offer is a product you can buy to
   * satisfy it. Several suppliers may compete for the same ingredient, so the
   * pack configuration and price live on the offer, not the ingredient.
   *
   * Ingredients saved before offers existed keep their pack fields inline, and
   * are read here as a single unnamed offer so nothing needs re-entering.
   */
  function activeOffer(ingredient) {
    const offers = (ingredient.offers || []).filter((o) => o && !o.discontinued);
    if (!offers.length) {
      return {
        id: null,
        supplier: ingredient.supplier || '',
        productCode: ingredient.productCode || '',
        packSize: ingredient.packSize,
        packUnit: ingredient.packUnit,
        packPrice: ingredient.packPrice,
        unitSize: ingredient.unitSize,
        unitSizeUnit: ingredient.unitSizeUnit,
        agreedPrice: ingredient.agreedPrice,
      };
    }
    return offers.find((o) => o.id === ingredient.preferredOfferId) || offers[0];
  }

  /**
   * Cost of one base unit (g / ml / ea) of a supplier offer, before yield loss.
   * `label` only shapes the error message.
   */
  function offerUnitCost(offer, label = 'This item') {
    const packQty = Number(offer && offer.packSize);
    const packPrice = Number(offer && offer.packPrice);
    if (!(packQty > 0)) throw new Error(`"${label}" has no pack size.`);
    const base = U.toBase(packQty, offer.packUnit);
    return { cost: packPrice / base.qty, unit: base.unit };
  }

  /**
   * Cost of one base unit (g / ml / ea) of an ingredient, before yield loss.
   */
  function unitCost(ingredient) {
    return offerUnitCost(activeOffer(ingredient), ingredient.name);
  }

  /**
   * Unit cost adjusted for yield. A 5kg box of whole birds at 68% usable costs
   * you 1/0.68 more per usable gram than the invoice suggests — this is where
   * most hand-built costing spreadsheets quietly go wrong.
   */
  function yieldedUnitCost(ingredient) {
    const { cost, unit } = unitCost(ingredient);
    const yieldPct = ingredient.yieldPct == null ? 100 : Number(ingredient.yieldPct);
    if (!(yieldPct > 0) || yieldPct > 100) {
      throw new Error(`"${ingredient.name}" has an invalid yield of ${yieldPct}%.`);
    }
    return { cost: cost / (yieldPct / 100), unit };
  }

  /**
   * What one base unit of a finished recipe costs — used when a recipe is
   * consumed as a component of another recipe.
   */
  function recipeUnitCost(recipe, ctx) {
    const costed = costRecipe(recipe, ctx);
    const yieldQty = Number(recipe.batchYieldQty);
    if (!(yieldQty > 0)) throw new Error(`"${recipe.name}" has no batch yield.`);
    const base = U.toBase(yieldQty, recipe.batchYieldUnit);
    // `costed` rides along so the caller can surface problems found inside the
    // sub-recipe — a fault buried three levels down still ruins this cost.
    return { cost: costed.batchCost / base.qty, unit: base.unit, costed };
  }

  function lookup(collection, id) {
    return collection.find((x) => x.id === id) || null;
  }

  /**
   * Cost one reference — a quantity of an ingredient or of another recipe.
   * Returns enough detail to show the user *why* it costs that, which is the
   * whole point of a costing tool.
   */
  function costRef(line, ctx) {
    const qty = Number(line.qty);
    const result = {
      kind: line.kind,
      refId: line.refId,
      qty,
      unit: line.unit,
      name: '(missing item)',
      cost: 0,
      unitCost: 0,
      error: null,
    };

    if (!(qty > 0)) {
      result.error = 'Quantity must be greater than zero.';
      return result;
    }

    try {
      if (line.kind === 'ingredient') {
        const ing = lookup(ctx.ingredients, line.refId);
        if (!ing) {
          result.error = 'Ingredient no longer exists.';
          return result;
        }
        result.name = ing.name;
        const { cost, unit } = yieldedUnitCost(ing);
        const qtyInBase = U.convert(qty, line.unit, unit, ing.density);
        result.unitCost = cost;
        result.baseUnit = unit;
        result.cost = qtyInBase * cost;
        result.yieldPct = ing.yieldPct == null ? 100 : Number(ing.yieldPct);
      } else if (line.kind === 'recipe') {
        const sub = lookup(ctx.recipes, line.refId);
        if (!sub) {
          result.error = 'Sub-recipe no longer exists.';
          return result;
        }
        result.name = sub.name;
        if (ctx.stack.includes(sub.id)) {
          result.error = `Circular reference — "${sub.name}" already appears further up this recipe.`;
          return result;
        }
        const { cost, unit, costed } = recipeUnitCost(sub, { ...ctx, stack: [...ctx.stack, sub.id] });
        const qtyInBase = U.convert(qty, line.unit, unit, sub.density);
        result.unitCost = cost;
        result.baseUnit = unit;
        result.cost = qtyInBase * cost;
        // Carry faults up rather than reporting a confident number built on one.
        result.nestedErrors = costed.errors.map((e) => `${sub.name} → ${e}`);
      } else {
        result.error = `Unknown line type "${line.kind}".`;
      }
    } catch (err) {
      result.error = err.message;
    }
    return result;
  }

  /**
   * Cost a recipe line, including its alternative source if it has one.
   *
   * A line can be sourced two ways: made from what it names (house-crumbed
   * schnitzel) or bought in finished from a supplier (G&T's premade). Both are
   * always costed so the make-or-buy comparison is available; `useAlt` decides
   * which one the dish is actually costed on.
   *
   * The swap lives on the line rather than the recipe because a dish is rarely
   * only the swapped item — buy the schnitzel in and you still plate the chips.
   */
  function costLine(line, ctx) {
    const primary = costRef(line, ctx);
    const alt = line.alt && line.alt.refId
      ? costRef({ kind: 'ingredient', ...line.alt }, ctx)
      : null;

    // Never silently cost a dish on a broken alternative: fall back to the
    // primary, but keep `wantsAlt` so the caller can still report the fault.
    const wantsAlt = Boolean(line.useAlt);
    const useAlt = wantsAlt && alt !== null && !alt.error;
    const active = useAlt ? alt : primary;

    return { ...active, primary, alt, useAlt, wantsAlt, hasAlt: alt !== null };
  }

  /**
   * Cost a whole recipe.
   *
   * batchCost   ingredient cost inflated by batch wastage (cooking loss, spills,
   *             the pan that gets dropped) — wastage of 5% means the usable
   *             output costs 1/0.95 of the raw inputs.
   * portionCost batchCost divided across the portions the batch yields.
   */
  function costRecipe(recipe, ctx = {}) {
    const context = {
      ingredients: ctx.ingredients || [],
      recipes: ctx.recipes || [],
      stack: ctx.stack || [recipe.id],
    };
    if (!context.stack.includes(recipe.id)) context.stack = [...context.stack, recipe.id];

    const lines = (recipe.lines || []).map((line) => costLine(line, context));
    const ingredientCost = lines.reduce((sum, l) => sum + (l.error ? 0 : l.cost), 0);

    const wastagePct = Number(recipe.wastagePct || 0);
    const wastageFactor = wastagePct > 0 && wastagePct < 100 ? 1 - wastagePct / 100 : 1;
    const batchCost = ingredientCost / wastageFactor;

    const portions = Number(recipe.portions) > 0 ? Number(recipe.portions) : 1;
    const portionCost = batchCost / portions;

    // Make or buy, rolled up across every line that offers both. Lines with no
    // alternative are counted identically on both sides, so the comparison is
    // of whole plates — the chips stay on the plate either way.
    const swappable = lines.filter((l) => l.hasAlt && !l.alt.error && !l.primary.error);
    const makeVsBuy = swappable.length
      ? (() => {
          const total = (pick) => lines.reduce((sum, l) => {
            const side = l.hasAlt && !l.alt.error && !l.primary.error ? pick(l) : l;
            return sum + (side.error ? 0 : side.cost);
          }, 0) / wastageFactor / portions;
          const make = total((l) => l.primary);
          const buy = total((l) => l.alt);
          return {
            makeCost: round(make),
            buyCost: round(buy),
            difference: round(buy - make),
            cheaper: Math.abs(buy - make) < 0.005 ? 'level' : buy < make ? 'buy' : 'make',
            savingPct: make > 0 ? round(((make - buy) / make) * 100, 2) : 0,
            swappedLines: swappable.map((l) => ({
              made: l.primary.name, makeCost: round(l.primary.cost),
              bought: l.alt.name, buyCost: round(l.alt.cost),
              using: l.useAlt ? 'buy' : 'make',
            })),
          };
        })()
      : null;

    // What the dish is currently costed on, for display.
    const sourcing = swappable.length
      ? (lines.some((l) => l.useAlt) ? 'boughtin' : 'inhouse')
      : 'inhouse';

    const sellPrice = Number(recipe.sellPrice || 0);
    const taxRate = Number(recipe.taxRate == null ? 0 : recipe.taxRate);
    // Menu prices are quoted tax-inclusive in Australian venues; GP is worked
    // on the ex-GST price, since the GST was never yours.
    const netPrice = taxRate > 0 ? sellPrice / (1 + taxRate / 100) : sellPrice;

    const grossProfit = netPrice - portionCost;
    const gpPct = netPrice > 0 ? (grossProfit / netPrice) * 100 : 0;
    const foodCostPct = netPrice > 0 ? (portionCost / netPrice) * 100 : 0;

    const targetGpPct = Number(recipe.targetGpPct == null ? 70 : recipe.targetGpPct);
    const suggestedNet = targetGpPct < 100 ? portionCost / (1 - targetGpPct / 100) : 0;
    const suggestedPrice = taxRate > 0 ? suggestedNet * (1 + taxRate / 100) : suggestedNet;

    const errors = [
      ...lines.filter((l) => l.error).map((l) => `${l.name}: ${l.error}`),
      ...lines.flatMap((l) => l.nestedErrors || []),
      // A broken alternative is only a fault if the dish is trying to use it.
      ...lines.filter((l) => l.hasAlt && l.alt.error && l.wantsAlt)
        .map((l) => `${l.alt.name}: ${l.alt.error}`),
    ];

    return {
      id: recipe.id,
      name: recipe.name,
      lines,
      errors,
      sourcing,
      makeVsBuy,
      ingredientCost: round(ingredientCost),
      wastagePct,
      batchCost: round(batchCost),
      portions,
      portionCost: round(portionCost),
      sellPrice: round(sellPrice, 2),
      netPrice: round(netPrice),
      grossProfit: round(grossProfit),
      gpPct: round(gpPct, 2),
      foodCostPct: round(foodCostPct, 2),
      targetGpPct,
      suggestedPrice: round(suggestedPrice, 2),
      onTarget: gpPct >= targetGpPct,
    };
  }

  /**
   * Scale a recipe to a new portion count, returning scaled line quantities.
   * Costs move with it — that is the point of scaling in a costing tool.
   */
  function scaleRecipe(recipe, newPortions) {
    const current = Number(recipe.portions) > 0 ? Number(recipe.portions) : 1;
    const target = Number(newPortions);
    if (!(target > 0)) throw new Error('Portion count must be greater than zero.');
    const factor = target / current;
    return {
      ...recipe,
      portions: target,
      batchYieldQty: round(Number(recipe.batchYieldQty || 0) * factor, 3),
      lines: (recipe.lines || []).map((l) => ({
        ...l,
        qty: round(Number(l.qty) * factor, 4),
        // The alternative source has to scale in step, or a scaled recipe would
        // compare a batch of one against a single portion of the other.
        ...(l.alt ? { alt: { ...l.alt, qty: round(Number(l.alt.qty) * factor, 4) } } : {}),
      })),
    };
  }

  /**
   * Menu-wide roll-up. Weighted by units sold where that is known, so the
   * headline GP% reflects what actually leaves the pass rather than a flat
   * average of the menu.
   */
  function analyseMenu(recipes, ctx) {
    const menuItems = recipes.filter((r) => r.onMenu !== false && Number(r.sellPrice) > 0);
    const costed = menuItems.map((r) => {
      const c = costRecipe(r, ctx);
      const sold = Number(r.unitsSold || 0);
      return { ...c, unitsSold: sold, revenue: c.netPrice * sold, cogs: c.portionCost * sold };
    });

    const totalRevenue = costed.reduce((s, c) => s + c.revenue, 0);
    const totalCogs = costed.reduce((s, c) => s + c.cogs, 0);
    const totalSold = costed.reduce((s, c) => s + c.unitsSold, 0);
    const weightedGpPct = totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0;

    // Menu engineering: compare each dish against the menu's own averages.
    const avgSold = costed.length ? totalSold / costed.length : 0;
    const avgGp = costed.length ? costed.reduce((s, c) => s + c.grossProfit, 0) / costed.length : 0;

    const classified = costed.map((c) => {
      const popular = c.unitsSold >= avgSold;
      const profitable = c.grossProfit >= avgGp;
      let category = 'Dog';
      if (popular && profitable) category = 'Star';
      else if (popular && !profitable) category = 'Plowhorse';
      else if (!popular && profitable) category = 'Puzzle';
      return { ...c, category, popular, profitable };
    });

    return {
      items: classified,
      totalRevenue: round(totalRevenue, 2),
      totalCogs: round(totalCogs, 2),
      totalGrossProfit: round(totalRevenue - totalCogs, 2),
      weightedGpPct: round(weightedGpPct, 2),
      avgGrossProfit: round(avgGp),
      avgUnitsSold: round(avgSold, 1),
      itemCount: classified.length,
      belowTarget: classified.filter((c) => !c.onTarget).length,
    };
  }

  /** Move an ingredient's price by a factor, on whichever offer it is bought on. */
  function repriceIngredient(ingredient, factor) {
    const offers = ingredient.offers || [];
    if (!offers.length) {
      return { ...ingredient, packPrice: Number(ingredient.packPrice) * factor };
    }
    const active = activeOffer(ingredient);
    return {
      ...ingredient,
      offers: offers.map((o) =>
        o.id === active.id ? { ...o, packPrice: Number(o.packPrice) * factor } : o),
    };
  }

  /** The same ingredient, bought on a different offer. */
  function switchOffer(ingredient, offerId) {
    return { ...ingredient, preferredOfferId: offerId };
  }

  /**
   * Apply a supplier price movement across the ingredient library and report
   * which dishes fall through their target GP as a result. This is the
   * "the chicken went up 12%, what breaks?" question.
   */
  function priceImpact(changes, ctx) {
    const updated = ctx.ingredients.map((ing) => {
      const change = changes[ing.id];
      if (change == null) return ing;
      return repriceIngredient(ing, 1 + Number(change) / 100);
    });

    const before = analyseMenu(ctx.recipes, ctx);
    const after = analyseMenu(ctx.recipes, { ...ctx, ingredients: updated });

    const byId = new Map(before.items.map((i) => [i.id, i]));
    const affected = after.items
      .map((a) => {
        const b = byId.get(a.id);
        if (!b) return null;
        return {
          id: a.id,
          name: a.name,
          costBefore: b.portionCost,
          costAfter: a.portionCost,
          costDelta: round(a.portionCost - b.portionCost),
          gpBefore: b.gpPct,
          gpAfter: a.gpPct,
          gpDelta: round(a.gpPct - b.gpPct, 2),
          brokeTarget: b.onTarget && !a.onTarget,
        };
      })
      .filter((x) => x && Math.abs(x.costDelta) > 0.0001)
      .sort((a, b) => b.costDelta - a.costDelta);

    return {
      affected,
      gpBefore: before.weightedGpPct,
      gpAfter: after.weightedGpPct,
      cogsBefore: before.totalCogs,
      cogsAfter: after.totalCogs,
      brokeCount: affected.filter((a) => a.brokeTarget).length,
    };
  }

  return {
    round, activeOffer, offerUnitCost, unitCost, yieldedUnitCost, recipeUnitCost,
    repriceIngredient, switchOffer,
    costRef, costLine, costRecipe, scaleRecipe, analyseMenu, priceImpact,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Costing;
if (typeof window !== 'undefined') window.Costing = Costing;
