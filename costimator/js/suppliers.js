// Supplier side of the app: comparing competing offers, working out what a
// switch is really worth once sales volumes are taken into account, and
// checking supplier invoices against the prices you agreed.
//
// Pure functions over plain data, like the costing engine — see js/tests.js.

const Suppliers = (() => {
  const U = typeof require !== 'undefined' && typeof window === 'undefined'
    ? require('./units.js') : window.Units;
  const C = typeof require !== 'undefined' && typeof window === 'undefined'
    ? require('./costing.js') : window.Costing;

  const round = C.round;

  // ---------------------------------------------------------------- comparing

  /**
   * Put one offer on a common footing: what it costs per kilo (or litre, or
   * each) and what it costs per piece.
   *
   * Both matter and they answer different questions. Cost per kilo is the true
   * material rate. Cost per piece is what it costs to put one on a plate — and
   * if the pieces are different sizes, a cheaper piece is a smaller serve, not
   * a better deal. Keeping them apart is the whole point of this function.
   */
  function normaliseOffer(offer, ingredient) {
    const yieldPct = ingredient && ingredient.yieldPct != null ? Number(ingredient.yieldPct) : 100;
    const result = {
      id: offer.id,
      supplier: offer.supplier || '',
      productCode: offer.productCode || '',
      packSize: Number(offer.packSize),
      packUnit: offer.packUnit,
      packPrice: Number(offer.packPrice),
      agreedPrice: offer.agreedPrice == null ? null : Number(offer.agreedPrice),
      perBase: null, baseUnit: null, perRate: null, rateUnit: null,
      perPiece: null, pieceSize: null, pieceUnit: null, pieceInBase: null,
      error: null,
    };

    try {
      const raw = C.offerUnitCost(offer, (ingredient && ingredient.name) || 'This item');
      const yielded = raw.cost / (yieldPct / 100);
      result.perBase = yielded;
      result.baseUnit = raw.unit;

      const dimension = U.dimensionOf(offer.packUnit);
      // Quote the rate in the unit a buyer thinks in.
      const rateUnit = dimension === 'mass' ? 'kg' : dimension === 'volume' ? 'l' : 'ea';
      result.rateUnit = rateUnit;
      result.perRate = yielded * U.toBase(1, rateUnit).qty;

      // A piece size lets a bulk pack and a portioned pack be compared.
      const hasPieceSize = offer.unitSize != null && Number(offer.unitSize) > 0;
      if (dimension === 'count') {
        result.perPiece = yielded; // one "each" is one piece
        if (hasPieceSize) {
          result.pieceSize = Number(offer.unitSize);
          result.pieceUnit = offer.unitSizeUnit;
          result.pieceInBase = U.toBase(Number(offer.unitSize), offer.unitSizeUnit).qty;
          // Per-kilo needs to know how heavy a piece is.
          result.perRate = yielded / U.convert(Number(offer.unitSize), offer.unitSizeUnit, 'kg', ingredient && ingredient.density);
          result.rateUnit = 'kg';
        } else {
          result.perRate = null; // cannot express an "each" as a rate per kilo
        }
      } else if (hasPieceSize) {
        result.pieceSize = Number(offer.unitSize);
        result.pieceUnit = offer.unitSizeUnit;
        result.pieceInBase = U.toBase(Number(offer.unitSize), offer.unitSizeUnit).qty;
        result.perPiece = yielded * U.convert(
          Number(offer.unitSize), offer.unitSizeUnit, raw.unit, ingredient && ingredient.density);
      }
    } catch (err) {
      result.error = err.message;
    }
    return result;
  }

  /**
   * Compare every offer on an ingredient.
   *
   * `cheapestByRate` is the honest like-for-like winner. `cheapestByPiece` can
   * disagree with it whenever the pieces are different sizes — that gap is the
   * thing worth looking at, so it is reported rather than resolved.
   */
  function compareOffers(ingredient) {
    const offers = (ingredient.offers || []).filter((o) => o && !o.discontinued);
    if (offers.length < 2) return null;

    const rows = offers.map((o) => normaliseOffer(o, ingredient));
    const usable = rows.filter((r) => !r.error);
    if (usable.length < 2) return null;

    const byRate = usable.filter((r) => r.perRate != null).sort((a, b) => a.perRate - b.perRate);
    const byPiece = usable.filter((r) => r.perPiece != null).sort((a, b) => a.perPiece - b.perPiece);

    const sizes = usable.map((r) => r.pieceInBase).filter((s) => s != null);
    const sameSpec = sizes.length < 2
      || sizes.every((s) => Math.abs(s - sizes[0]) / sizes[0] < 0.005);

    const activeId = C.activeOffer(ingredient).id;
    const current = rows.find((r) => r.id === activeId) || rows[0];

    return {
      rows,
      current,
      cheapestByRate: byRate[0] || null,
      cheapestByPiece: byPiece[0] || null,
      sameSpec,
      // The trap: the cheapest piece is only the cheapest food if the pieces
      // are the same size.
      pieceWinnerDiffers: Boolean(
        byRate[0] && byPiece[0] && byRate[0].id !== byPiece[0].id),
    };
  }

  // ------------------------------------------------- what a switch is worth

  /**
   * What switching an ingredient to another offer actually does, once sales
   * volumes are taken into account.
   *
   * The saving is only half the answer. A cheaper piece that is 50g lighter is
   * a visible cut, and if most of the saving rides on your best-selling dish
   * that is exactly where customers will notice it. Both halves are reported.
   */
  function switchImpact(ingredientId, toOfferId, ctx) {
    const ingredient = ctx.ingredients.find((i) => i.id === ingredientId);
    if (!ingredient) throw new Error('Ingredient not found.');

    const from = C.activeOffer(ingredient);
    const to = (ingredient.offers || []).find((o) => o.id === toOfferId);
    if (!to) throw new Error('That supplier offer no longer exists.');

    const after = ctx.ingredients.map((i) =>
      i.id === ingredientId ? C.switchOffer(i, toOfferId) : i);

    const before = C.analyseMenu(ctx.recipes, ctx);
    const afterMenu = C.analyseMenu(ctx.recipes, { ...ctx, ingredients: after });
    const byId = new Map(before.items.map((i) => [i.id, i]));

    const dishes = afterMenu.items
      .map((a) => {
        const b = byId.get(a.id);
        if (!b) return null;
        const perServe = a.portionCost - b.portionCost;
        return {
          id: a.id,
          name: a.name,
          unitsSold: a.unitsSold,
          costBefore: b.portionCost,
          costAfter: a.portionCost,
          perServe: round(perServe),
          periodDelta: round(perServe * a.unitsSold, 2),
          gpBefore: b.gpPct,
          gpAfter: a.gpPct,
        };
      })
      .filter((d) => d && Math.abs(d.perServe) > 0.00005)
      .sort((a, b) => a.periodDelta - b.periodDelta);

    const periodDelta = round(dishes.reduce((s, d) => s + d.periodDelta, 0), 2);
    const saving = -periodDelta; // positive when the switch saves money

    // Rank every menu item by volume, so a dish can be placed on the menu it
    // actually belongs to rather than against an arbitrary cut-off.
    const ranked = before.items.slice().sort((a, b) => b.unitsSold - a.unitsSold);
    const rankOf = new Map(ranked.map((i, idx) => [i.id, idx + 1]));
    const menuSize = ranked.length;
    const topThird = Math.max(1, Math.ceil(menuSize / 3));

    const withShare = dishes.map((d) => ({
      ...d,
      shareOfChange: Math.abs(periodDelta) > 0
        ? round((Math.abs(d.periodDelta) / Math.abs(periodDelta)) * 100, 1) : 0,
      volumeRank: rankOf.get(d.id) || null,
      menuSize,
      isTopSeller: d.unitsSold > 0 && (rankOf.get(d.id) || Infinity) <= topThird,
    }));

    const topSellerShare = round(
      withShare.filter((d) => d.isTopSeller).reduce((s, d) => s + d.shareOfChange, 0), 1);

    // Where the change actually lands. A saving spread thinly across the menu
    // is a different decision from one riding almost entirely on a single
    // dish — that dish is the one whose spec you are really changing.
    const biggest = withShare.slice()
      .sort((a, b) => b.shareOfChange - a.shareOfChange)[0] || null;

    const fromSpec = normaliseOffer(from, ingredient);
    const toSpec = normaliseOffer(to, ingredient);
    const specChange = fromSpec.pieceInBase != null && toSpec.pieceInBase != null
      && Math.abs(toSpec.pieceInBase - fromSpec.pieceInBase) / fromSpec.pieceInBase >= 0.005
      ? {
          fromSize: fromSpec.pieceSize, fromUnit: fromSpec.pieceUnit,
          toSize: toSpec.pieceSize, toUnit: toSpec.pieceUnit,
          deltaPct: round(((toSpec.pieceInBase - fromSpec.pieceInBase) / fromSpec.pieceInBase) * 100, 1),
          smaller: toSpec.pieceInBase < fromSpec.pieceInBase,
        }
      : null;

    return {
      ingredientId, ingredientName: ingredient.name,
      from: fromSpec, to: toSpec,
      dishes: withShare,
      periodDelta, saving,
      gpBefore: before.weightedGpPct, gpAfter: afterMenu.weightedGpPct,
      specChange,
      topSellerShare,
      topSellers: withShare.filter((d) => d.isTopSeller).map((d) => d.name),
      concentratedOn: biggest,
      concentration: biggest ? biggest.shareOfChange : 0,
      menuSize,
      // Cheaper food and a smaller piece are different things. When both are
      // true the decision is a judgement call, so say so rather than pick.
      verdict: saving <= 0 ? 'costs-more'
        : specChange && specChange.smaller ? 'saves-but-smaller'
        : 'saves',
    };
  }

  // ----------------------------------------------------------- reconciliation

  const NUM = /-?[\d,]+\.?\d*/;

  function toNumber(raw) {
    if (raw == null) return NaN;
    const m = String(raw).replace(/\$/g, '').match(NUM);
    return m ? Number(m[0].replace(/,/g, '')) : NaN;
  }

  function splitRow(line) {
    // Tabs win when present; otherwise commas, respecting simple quoting.
    if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
    const cells = [];
    let cur = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  const HEADERS = {
    code: ['code', 'product code', 'productcode', 'item', 'item code', 'sku', 'product'],
    description: ['description', 'desc', 'product name', 'name', 'details'],
    qty: ['qty', 'quantity', 'units', 'cases', 'ordered'],
    unitPrice: ['unit price', 'unitprice', 'price', 'rate', 'each', 'price ea', 'unit cost'],
    lineTotal: ['total', 'line total', 'amount', 'ext', 'extended', 'value'],
  };

  function matchHeader(cell) {
    const c = cell.toLowerCase().replace(/[^a-z ]/g, '').trim();
    for (const [field, names] of Object.entries(HEADERS)) {
      if (names.includes(c)) return field;
    }
    return null;
  }

  /**
   * Parse a pasted invoice. Handles CSV and tab-separated text, with or without
   * a header row. Without a header the columns are guessed from their shape,
   * which is why every parsed line is shown for checking before anything is
   * claimed from a supplier.
   */
  function parseInvoice(text) {
    const rows = String(text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^[-=_\s]+$/.test(l))
      .map(splitRow)
      .filter((cells) => cells.length >= 2);

    if (!rows.length) return { lines: [], columns: null, skipped: 0 };

    let columns = null;
    let start = 0;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const mapped = rows[i].map(matchHeader);
      if (mapped.filter(Boolean).length >= 2) {
        columns = mapped;
        start = i + 1;
        break;
      }
    }

    const lines = [];
    let skipped = 0;

    for (let i = start; i < rows.length; i++) {
      const cells = rows[i];
      const line = { code: '', description: '', qty: null, unitPrice: null, lineTotal: null, raw: cells.join(' | ') };

      if (columns) {
        columns.forEach((field, idx) => {
          if (!field || cells[idx] == null) return;
          if (field === 'code' || field === 'description') line[field] = cells[idx];
          else line[field] = toNumber(cells[idx]);
        });
      } else {
        // No header: text columns are code then description, numbers are
        // quantity, unit price and total in the order they appear.
        const texts = [];
        const nums = [];
        cells.forEach((c) => {
          const n = toNumber(c);
          if (c !== '' && !isNaN(n) && /^[\s$-]*[\d,.]+\s*$/.test(c)) nums.push(n);
          else if (c) texts.push(c);
        });
        line.code = texts[0] || '';
        line.description = texts.slice(1).join(' ') || texts[0] || '';
        if (nums.length >= 3) { [line.qty, line.unitPrice, line.lineTotal] = nums; }
        else if (nums.length === 2) { [line.qty, line.unitPrice] = nums; }
        else if (nums.length === 1) { [line.unitPrice] = nums; }
      }

      // A unit price we can derive is the minimum for a line to be checkable.
      if (line.unitPrice == null || isNaN(line.unitPrice)) {
        if (line.lineTotal && line.qty) line.unitPrice = line.lineTotal / line.qty;
        else { skipped++; continue; }
      }
      if (!line.code && !line.description) { skipped++; continue; }
      lines.push(line);
    }

    return { lines, columns, skipped };
  }

  /** Every offer across the library, indexed for matching. */
  function offerIndex(ingredients) {
    const out = [];
    for (const ing of ingredients) {
      const offers = (ing.offers || []).length
        ? ing.offers
        : [C.activeOffer(ing)];
      for (const o of offers) out.push({ ingredient: ing, offer: o });
    }
    return out;
  }

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  function findOffer(line, index, supplier) {
    const code = norm(line.code);
    const desc = norm(line.description);
    const sameSupplier = (e) => !supplier || norm(e.offer.supplier) === norm(supplier);

    // A supplier's own product code is the only reliable key.
    if (code) {
      const hit = index.find((e) => sameSupplier(e) && norm(e.offer.productCode) && norm(e.offer.productCode) === code);
      if (hit) return { ...hit, matchedOn: 'code' };
    }
    // Then an exact name, then a containment match.
    if (desc) {
      const exact = index.find((e) => sameSupplier(e) && norm(e.ingredient.name) === desc);
      if (exact) return { ...exact, matchedOn: 'name' };
      const loose = index.find((e) => sameSupplier(e)
        && norm(e.ingredient.name).length > 4
        && (desc.includes(norm(e.ingredient.name)) || norm(e.ingredient.name).includes(desc)));
      if (loose) return { ...loose, matchedOn: 'description' };
    }
    return null;
  }

  /**
   * Check an invoice against the prices you agreed.
   *
   * The comparison is on the pack price, which is what a supplier invoices.
   * Lines with no agreed price are reported separately rather than passed —
   * "we never agreed a price for this" is itself worth seeing.
   */
  function reconcileInvoice(text, ctx, options = {}) {
    const supplier = options.supplier || '';
    const tolerance = options.tolerance == null ? 0.005 : Number(options.tolerance);
    const { lines, skipped } = parseInvoice(text);
    const index = offerIndex(ctx.ingredients);

    const checked = [];
    const unmatched = [];
    const noAgreedPrice = [];

    for (const line of lines) {
      const hit = findOffer(line, index, supplier);
      if (!hit) { unmatched.push(line); continue; }

      const agreed = hit.offer.agreedPrice;
      if (agreed == null || !(Number(agreed) > 0)) {
        noAgreedPrice.push({ ...line, ingredient: hit.ingredient, offer: hit.offer });
        continue;
      }

      const invoiced = Number(line.unitPrice);
      const variance = invoiced - Number(agreed);
      const qty = Number(line.qty) > 0 ? Number(line.qty) : 1;

      checked.push({
        ...line,
        qty,
        ingredientId: hit.ingredient.id,
        ingredientName: hit.ingredient.name,
        supplier: hit.offer.supplier,
        productCode: hit.offer.productCode,
        matchedOn: hit.matchedOn,
        agreedPrice: round(Number(agreed), 2),
        invoicedPrice: round(invoiced, 2),
        variance: round(variance, 2),
        variancePct: Number(agreed) > 0 ? round((variance / Number(agreed)) * 100, 2) : 0,
        varianceTotal: round(variance * qty, 2),
        status: Math.abs(variance) <= tolerance ? 'ok' : variance > 0 ? 'overcharged' : 'undercharged',
      });
    }

    const overcharged = checked.filter((l) => l.status === 'overcharged');
    const undercharged = checked.filter((l) => l.status === 'undercharged');

    return {
      supplier,
      lines: checked,
      overcharged,
      undercharged,
      unmatched,
      noAgreedPrice,
      skipped,
      overchargedTotal: round(overcharged.reduce((s, l) => s + l.varianceTotal, 0), 2),
      underchargedTotal: round(undercharged.reduce((s, l) => s + l.varianceTotal, 0), 2),
      netVariance: round(checked.reduce((s, l) => s + l.varianceTotal, 0), 2),
      okCount: checked.filter((l) => l.status === 'ok').length,
    };
  }

  /**
   * The price-adjustment claim to send back. Deliberately plain and itemised:
   * it has to survive being forwarded to a supplier's accounts department.
   */
  function adjustmentEmail(result, options = {}) {
    const ref = options.invoiceRef ? ` ${options.invoiceRef}` : '';
    const business = options.business || '';
    const money = (n) => `$${Number(n).toFixed(2)}`;

    if (!result.overcharged.length) {
      return {
        subject: `Invoice${ref} — prices confirmed`,
        body: `All ${result.okCount} priced lines on invoice${ref} match our agreed pricing. No adjustment required.`,
        empty: true,
      };
    }

    const pad = (s, n) => String(s).padEnd(n);
    const rows = result.overcharged.map((l) =>
      `  ${pad(l.productCode || l.code || '-', 14)}${pad(l.ingredientName, 34)}`
      + `${pad(`qty ${l.qty}`, 10)}agreed ${pad(money(l.agreedPrice), 10)}`
      + `invoiced ${pad(money(l.invoicedPrice), 10)}variance ${money(l.varianceTotal)}`);

    const body = [
      `Invoice${ref} has been checked against our agreed pricing and ${result.overcharged.length} `
      + `line${result.overcharged.length > 1 ? 's do' : ' does'} not match.`,
      '',
      ...rows,
      '',
      `Total adjustment requested: ${money(result.overchargedTotal)}`,
      '',
      result.undercharged.length
        ? `For completeness, ${result.undercharged.length} line${result.undercharged.length > 1 ? 's were' : ' was'} `
          + `invoiced below the agreed price (${money(Math.abs(result.underchargedTotal))}). `
          + `Net adjustment requested: ${money(result.netVariance)}.`
        : '',
      result.undercharged.length ? '' : null,
      'Could you please issue a credit for the difference, or confirm the pricing we should be working to.',
      '',
      'Thanks,',
      business,
    ].filter((l) => l !== null && l !== '').join('\n').replace(/\n{3,}/g, '\n\n');

    return {
      subject: `Price adjustment — invoice${ref} (${money(result.overchargedTotal)})`,
      body,
      empty: false,
    };
  }

  // ------------------------------------------------------- purchase orders

  /** Order value at the prices locked when the order was raised. */
  function orderTotal(order) {
    return round((order.lines || []).reduce(
      (sum, l) => sum + (Number(l.qty) || 0) * (Number(l.packPrice) || 0), 0), 2);
  }

  /**
   * The purchase order as an email a supplier's sales desk can key straight
   * in: code, product, packs, the agreed price, and where to deliver.
   */
  function orderEmail(order, ctx, options = {}) {
    const money = (n) => `$${Number(n).toFixed(2)}`;
    const pad = (s, n) => String(s).padEnd(n);
    const lines = (order.lines || []).map((l) => {
      const ing = ctx.ingredients.find((i) => i.id === l.ingredientId);
      const offer = ing && ((ing.offers || []).find((o) => o.id === l.offerId) || C.activeOffer(ing));
      return `  ${pad(offer && offer.productCode ? offer.productCode : '-', 14)}`
        + `${pad(ing ? ing.name : '(unknown item)', 34)}`
        + `${pad(`${l.qty} pack${Number(l.qty) === 1 ? '' : 's'}`, 12)}`
        + `@ ${money(l.packPrice)}  =  ${money((Number(l.qty) || 0) * (Number(l.packPrice) || 0))}`;
    });

    const body = [
      `Please supply the following against purchase order ${order.ref}:`,
      '',
      ...lines,
      '',
      `Order total: ${money(orderTotal(order))} (at our agreed pricing)`,
      options.venueName ? `Deliver to: ${options.venueName}` : null,
      '',
      'Please reference the PO number on the delivery docket and invoice.',
      '',
      'Thanks,',
      options.business || '',
    ].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');

    return { subject: `Purchase order ${order.ref}${options.business ? ` — ${options.business}` : ''}`, body };
  }

  /**
   * Match a supplier invoice against the purchase order it should be billing.
   *
   * This is a harder check than the price-list one: the PO says what was
   * ordered, in what quantity, at what price. The invoice has to agree on all
   * three. Four things can be wrong, and each is reported in its own bucket:
   *
   *   price     invoiced above (or below) the price locked on the PO
   *   quantity  invoiced more or fewer packs than were ordered
   *   notOnOrder   invoiced lines the PO never asked for
   *   notInvoiced  ordered lines the invoice doesn't bill — short-supplied
   *                or back-ordered; chase stock, not money
   *
   * Money is only claimed for price variances and not-ordered lines; quantity
   * gaps are supply questions until a delivery docket says otherwise, so the
   * claim email asks rather than asserts.
   */
  function matchInvoiceToOrder(text, order, ctx, options = {}) {
    const tolerance = options.tolerance == null ? 0.005 : Number(options.tolerance);
    const { lines, skipped } = parseInvoice(text);
    const index = offerIndex(ctx.ingredients);

    const poLines = (order.lines || []).map((l) => {
      const ingredient = ctx.ingredients.find((i) => i.id === l.ingredientId) || null;
      const offer = ingredient
        ? ((ingredient.offers || []).find((o) => o.id === l.offerId) || C.activeOffer(ingredient))
        : null;
      return { ...l, ingredient, offer, matched: false };
    });

    const checked = [];
    const notOnOrder = [];

    for (const line of lines) {
      const hit = findOffer(line, index, order.supplier);
      const po = hit && poLines.find((p) => !p.matched && p.ingredient && p.ingredient.id === hit.ingredient.id);
      if (!po) {
        notOnOrder.push({
          ...line,
          ingredientName: hit ? hit.ingredient.name : null,
          value: round((Number(line.qty) > 0 ? Number(line.qty) : 1) * Number(line.unitPrice), 2),
        });
        continue;
      }
      po.matched = true;

      const invoiced = Number(line.unitPrice);
      const qty = Number(line.qty) > 0 ? Number(line.qty) : 1;
      const priceVariance = invoiced - Number(po.packPrice);
      const qtyVariance = qty - Number(po.qty);

      checked.push({
        ...line,
        qty,
        ingredientId: po.ingredient.id,
        ingredientName: po.ingredient.name,
        productCode: (po.offer && po.offer.productCode) || '',
        orderedQty: Number(po.qty),
        orderedPrice: round(Number(po.packPrice), 2),
        invoicedPrice: round(invoiced, 2),
        priceVariance: round(priceVariance, 2),
        priceVarianceTotal: round(priceVariance * qty, 2),
        qtyVariance: round(qtyVariance, 3),
        qtyVarianceValue: round(qtyVariance * Number(po.packPrice), 2),
        priceStatus: Math.abs(priceVariance) <= tolerance ? 'ok' : priceVariance > 0 ? 'over' : 'under',
        qtyStatus: Math.abs(qtyVariance) < 1e-9 ? 'ok' : qtyVariance > 0 ? 'over' : 'short',
      });
    }

    const notInvoiced = poLines.filter((p) => !p.matched).map((p) => ({
      ingredientName: p.ingredient ? p.ingredient.name : '(item no longer exists)',
      productCode: (p.offer && p.offer.productCode) || '',
      orderedQty: Number(p.qty),
      orderedPrice: round(Number(p.packPrice), 2),
      value: round(Number(p.qty) * Number(p.packPrice), 2),
    }));

    const priceOver = checked.filter((l) => l.priceStatus === 'over');
    const qtyShort = checked.filter((l) => l.qtyStatus === 'short');
    const qtyOver = checked.filter((l) => l.qtyStatus === 'over');

    return {
      order,
      lines: checked,
      priceOver,
      qtyShort,
      qtyOver,
      notOnOrder,
      notInvoiced,
      skipped,
      priceOverTotal: round(priceOver.reduce((s, l) => s + l.priceVarianceTotal, 0), 2),
      notOnOrderTotal: round(notOnOrder.reduce((s, l) => s + l.value, 0), 2),
      shortValue: round(qtyShort.reduce((s, l) => s + Math.abs(l.qtyVarianceValue), 0), 2),
      cleanCount: checked.filter((l) => l.priceStatus === 'ok' && l.qtyStatus === 'ok').length,
      clean: !priceOver.length && !qtyShort.length && !qtyOver.length
        && !notOnOrder.length && !notInvoiced.length
        && checked.every((l) => l.priceStatus !== 'under'),
    };
  }

  /**
   * The reply when an invoice doesn't match its PO. Price variances and
   * not-ordered lines are money; quantity gaps are questions. Written to
   * survive being forwarded to a supplier's accounts department.
   */
  function orderAdjustmentEmail(result, options = {}) {
    const money = (n) => `$${Number(n).toFixed(2)}`;
    const pad = (s, n) => String(s).padEnd(n);
    const ref = options.invoiceRef ? ` ${options.invoiceRef}` : '';
    const po = result.order.ref;

    if (result.clean) {
      return {
        subject: `Invoice${ref} matched to ${po}`,
        body: `Invoice${ref} matches purchase order ${po} on price and quantity for all `
          + `${result.cleanCount} lines. No adjustment required.`,
        empty: true,
      };
    }

    const sections = [];

    if (result.priceOver.length) {
      sections.push(
        `Priced above the order (credit requested — ${money(result.priceOverTotal)}):`,
        ...result.priceOver.map((l) =>
          `  ${pad(l.productCode || l.code || '-', 14)}${pad(l.ingredientName, 34)}`
          + `qty ${pad(l.qty, 6)}PO ${pad(money(l.orderedPrice), 10)}`
          + `invoiced ${pad(money(l.invoicedPrice), 10)}variance ${money(l.priceVarianceTotal)}`),
        '');
    }

    if (result.notOnOrder.length) {
      sections.push(
        `On the invoice but not on our order (please confirm or credit — ${money(result.notOnOrderTotal)}):`,
        ...result.notOnOrder.map((l) =>
          `  ${pad(l.code || '-', 14)}${l.ingredientName || l.description || '(unrecognised)'}`
          + ` — ${money(l.value)}`),
        '');
    }

    if (result.qtyShort.length) {
      sections.push(
        'Invoiced below the ordered quantity — please advise delivery or back-order:',
        ...result.qtyShort.map((l) =>
          `  ${pad(l.productCode || '-', 14)}${pad(l.ingredientName, 34)}`
          + `ordered ${l.orderedQty}, invoiced ${l.qty}`),
        '');
    }

    if (result.qtyOver.length) {
      sections.push(
        'Invoiced above the ordered quantity — please confirm delivery:',
        ...result.qtyOver.map((l) =>
          `  ${pad(l.productCode || '-', 14)}${pad(l.ingredientName, 34)}`
          + `ordered ${l.orderedQty}, invoiced ${l.qty}`),
        '');
    }

    if (result.notInvoiced.length) {
      sections.push(
        'On our order but not on this invoice — please advise if back-ordered:',
        ...result.notInvoiced.map((l) =>
          `  ${pad(l.productCode || '-', 14)}${pad(l.ingredientName, 34)}ordered ${l.orderedQty}`),
        '');
    }

    const claimTotal = round(result.priceOverTotal, 2);
    const body = [
      `Invoice${ref} has been checked against purchase order ${po} and does not match.`,
      '',
      ...sections,
      claimTotal > 0 ? `Credit requested for price variances: ${money(claimTotal)}` : null,
      '',
      'Could you please issue the credit and confirm the items queried above.',
      '',
      'Thanks,',
      options.business || '',
    ].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');

    return {
      subject: `${po} / invoice${ref} — discrepancies${claimTotal > 0 ? ` (${money(claimTotal)})` : ''}`,
      body,
      empty: false,
    };
  }

  return {
    normaliseOffer, compareOffers, switchImpact,
    parseInvoice, reconcileInvoice, adjustmentEmail, offerIndex,
    orderTotal, orderEmail, matchInvoiceToOrder, orderAdjustmentEmail,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Suppliers;
if (typeof window !== 'undefined') window.Suppliers = Suppliers;
