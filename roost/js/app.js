// UI layer. Renders views from Store data through the Costing engine and
// writes edits back. Deliberately framework-free — this stays a static page you
// can open from a USB stick in a kitchen office with no internet.

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const view = $('#view');

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const money = (n, dp = 2) => `$${(Number(n) || 0).toFixed(dp)}`;
  const pct = (n, dp = 1) => `${(Number(n) || 0).toFixed(dp)}%`;

  let currentView = 'dashboard';
  let dashVenue = ''; // '' = whole group
  let toastTimer = null;

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // GP against target, expressed as a colour the eye can scan down a column.
  function gpClass(gpPct, target) {
    if (gpPct >= target) return 'good';
    if (gpPct >= target - 8) return 'warn';
    return 'bad';
  }

  // ---------- modal ----------

  let modalOnSave = null;

  function openModal(title, bodyHtml, footHtml, onMount) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = bodyHtml;
    $('#modal-foot').innerHTML = footHtml;
    $('#modal').hidden = false;
    if (onMount) onMount($('#modal-body'), $('#modal-foot'));
  }

  function closeModal() {
    $('.modal-panel').classList.remove('wide');
    $('#modal').hidden = true;
    $('#modal-body').innerHTML = '';
    $('#modal-foot').innerHTML = '';
    modalOnSave = null;
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  });

  // ---------- unit pickers ----------

  const UNIT_GROUPS = [
    ['Weight', ['g', 'kg', 'oz', 'lb']],
    ['Volume', ['ml', 'l', 'tsp', 'tbsp', 'cup']],
    ['Count', ['ea', 'doz']],
  ];

  function unitOptions(selected) {
    return UNIT_GROUPS.map(([label, units]) =>
      `<optgroup label="${label}">${units.map((u) =>
        `<option value="${u}"${u === selected ? ' selected' : ''}>${esc(Units.unitLabel(u))}</option>`
      ).join('')}</optgroup>`
    ).join('');
  }

  // ================= DASHBOARD =================

  /**
   * Dishes currently costed on the dearer of their two sources. This is money
   * already on the table, so it belongs on the dashboard rather than buried in
   * each recipe.
   */
  function swapNote(analysis) {
    const swaps = analysis.items.filter((i) => {
      const m = i.makeVsBuy;
      if (!m || m.cheaper === 'level') return false;
      return (m.cheaper === 'buy' && i.sourcing === 'inhouse')
        || (m.cheaper === 'make' && i.sourcing === 'boughtin');
    });
    if (!swaps.length) return '';

    const saving = swaps.reduce((sum, i) =>
      sum + Math.abs(i.makeVsBuy.difference) * (i.unitsSold || 0), 0);
    const names = swaps.map((i) => esc(i.name)).join(', ');

    return `<div class="banner warn">
      ${swaps.length} dish${swaps.length > 1 ? 'es are' : ' is'} costed on the dearer
      source — ${names}.${saving > 0 ? ` Switching would save ${money(saving)} across current volumes.` : ''}
    </div>`;
  }

  function renderDashboard() {
    const venues = Store.venues();
    if (dashVenue && !venues.some((v) => v.id === dashVenue)) dashVenue = '';
    const ctx = Store.salesCtx(dashVenue || null);
    const a = Costing.analyseMenu(ctx.recipes, ctx);
    const scopeName = dashVenue
      ? (Store.getVenue(dashVenue) || {}).name
      : 'whole group';

    if (a.itemCount === 0) {
      view.innerHTML = `
        <div class="view-head"><div><h2>Dashboard</h2>
        <p>Menu performance across every costed dish.</p></div></div>
        <div class="empty card">
          <p>No priced menu items yet. Add a recipe with a sell price to see margins here.</p>
          <button class="btn primary" data-act="new-recipe">Add a recipe</button>
        </div>`;
      return;
    }

    const target = Store.settings().targetGpPct;
    const rows = a.items
      .slice()
      .sort((x, y) => y.gpPct - x.gpPct)
      .map((i) => `
        <tr class="clickable" data-recipe="${esc(i.id)}">
          <td class="name-cell">${esc(i.name)}
            ${i.errors.length ? `<span class="sub-note" style="color:var(--bad)">${i.errors.length} issue${i.errors.length > 1 ? 's' : ''}</span>` : ''}
          </td>
          <td><span class="pill ${i.category === 'Star' ? 'good' : i.category === 'Dog' ? 'bad' : 'neutral'}">${i.category}</span></td>
          <td class="num">${money(i.portionCost)}</td>
          <td class="num">${money(i.sellPrice)}</td>
          <td class="num">${money(i.grossProfit)}</td>
          <td class="num"><span class="pill ${gpClass(i.gpPct, i.targetGpPct)}">${pct(i.gpPct)}</span></td>
          <td class="num">${i.unitsSold || '—'}</td>
          <td class="num">${money(i.suggestedPrice)}</td>
        </tr>`).join('');

    const quads = ['Star', 'Plowhorse', 'Puzzle', 'Dog'].map((cat) => {
      const desc = {
        Star: 'Popular and profitable. Protect these — keep quality and availability tight.',
        Plowhorse: 'Sells well but earns little. Trim cost or nudge the price.',
        Puzzle: 'Good margin, few sales. Push it — placement, specials, staff mentions.',
        Dog: 'Low sales, low margin. Rework or cut it from the menu.',
      }[cat];
      const items = a.items.filter((i) => i.category === cat);
      return `
        <div class="quadrant">
          <h3><span class="dot ${cat.toLowerCase()}"></span>${cat}s <span class="tag">${items.length}</span></h3>
          <p class="qdesc">${desc}</p>
          ${items.length
            ? `<ul>${items.map((i) => `<li>${esc(i.name)} — ${pct(i.gpPct)} GP</li>`).join('')}</ul>`
            : '<p class="none">Nothing here.</p>'}
        </div>`;
    }).join('');

    view.innerHTML = `
      <div class="view-head">
        <div><h2>${esc(Store.activeClient().name)}</h2>
          <p>Menu performance across every costed dish — ${esc(scopeName)}, ex-GST.</p></div>
        <div class="row">
          ${venues.length > 1 ? `
          <select id="dash-venue" aria-label="Venue">
            <option value="">All venues</option>
            ${venues.map((v) => `<option value="${esc(v.id)}"${v.id === dashVenue ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}
          </select>` : ''}
          <button class="btn primary" data-act="new-recipe">New recipe</button>
        </div>
      </div>

      ${a.belowTarget > 0 ? `<div class="banner warn">${a.belowTarget} of ${a.itemCount} dishes sit below their target GP.</div>` : ''}
      ${swapNote(a)}

      <div class="stat-grid">
        <div class="stat"><div class="stat-label">Weighted GP</div>
          <div class="stat-value ${gpClass(a.weightedGpPct, target)}">${pct(a.weightedGpPct)}</div>
          <div class="stat-note">target ${pct(target, 0)}</div></div>
        <div class="stat"><div class="stat-label">Revenue (ex GST)</div>
          <div class="stat-value">${money(a.totalRevenue)}</div>
          <div class="stat-note">at current volumes</div></div>
        <div class="stat"><div class="stat-label">COGS</div>
          <div class="stat-value">${money(a.totalCogs)}</div>
          <div class="stat-note">${a.totalRevenue > 0 ? pct((a.totalCogs / a.totalRevenue) * 100) : '—'} of revenue</div></div>
        <div class="stat"><div class="stat-label">Gross profit</div>
          <div class="stat-value good">${money(a.totalGrossProfit)}</div>
          <div class="stat-note">${a.itemCount} menu items</div></div>
      </div>

      <div class="section-title">Menu items</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Dish</th><th>Class</th><th class="num">Portion cost</th><th class="num">Sell</th>
            <th class="num">GP $</th><th class="num">GP %</th><th class="num">Sold</th><th class="num">At target</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="section-title">Menu engineering</div>
      <div class="quadrant-grid">${quads}</div>`;

    const venueSel = $('#dash-venue');
    if (venueSel) venueSel.addEventListener('change', (e) => {
      dashVenue = e.target.value;
      renderDashboard();
    });
  }

  // ================= RECIPES =================

  let recipeSearch = '';

  function renderRecipes() {
    const ctx = Store.ctx();
    const term = recipeSearch.trim().toLowerCase();
    const list = ctx.recipes.filter((r) => !term || r.name.toLowerCase().includes(term));

    const body = list.length
      ? list.map((r) => {
          const c = Costing.costRecipe(r, ctx);
          const isSub = r.type === 'sub' || r.onMenu === false;
          return `
            <tr class="clickable" data-recipe="${esc(r.id)}">
              <td class="name-cell">${esc(r.name)}
                <span class="sub-note">${(r.lines || []).length} line${(r.lines || []).length === 1 ? '' : 's'}${
                  c.errors.length ? ` · <span style="color:var(--bad)">${c.errors.length} issue${c.errors.length > 1 ? 's' : ''}</span>` : ''}</span></td>
              <td>${isSub ? '<span class="tag">sub-recipe</span>' : '<span class="tag">menu</span>'}</td>
              <td class="num">${c.portions}</td>
              <td class="num">${money(c.portionCost)}</td>
              <td class="num">${isSub ? '—' : money(c.sellPrice)}</td>
              <td class="num">${isSub ? '—' : `<span class="pill ${gpClass(c.gpPct, c.targetGpPct)}">${pct(c.gpPct)}</span>`}</td>
              <td class="num">
                <button class="icon-btn" data-act="dup-recipe" data-id="${esc(r.id)}" title="Duplicate">⧉</button>
                <button class="icon-btn" data-act="del-recipe" data-id="${esc(r.id)}" title="Delete">✕</button>
              </td>
            </tr>`;
        }).join('')
      : `<tr><td colspan="7" class="empty" style="padding:34px">No recipes match “${esc(recipeSearch)}”.</td></tr>`;

    view.innerHTML = `
      <div class="view-head">
        <div><h2>Recipes</h2><p>Menu dishes and the sub-recipes that feed them.</p></div>
        <div class="row">
          <input type="search" id="recipe-search" placeholder="Search recipes…" value="${esc(recipeSearch)}">
          <button class="btn primary" data-act="new-recipe">New recipe</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Recipe</th><th>Type</th><th class="num">Portions</th><th class="num">Portion cost</th>
            <th class="num">Sell</th><th class="num">GP %</th><th class="num"></th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;

    const search = $('#recipe-search');
    search.addEventListener('input', (e) => {
      recipeSearch = e.target.value;
      const pos = e.target.selectionStart;
      renderRecipes();
      const next = $('#recipe-search');
      next.focus();
      next.setSelectionRange(pos, pos);
    });
  }

  // ---------- recipe editor ----------

  let draft = null;

  function openRecipeEditor(id) {
    const s = Store.settings();
    draft = id
      ? structuredClone(Store.getRecipe(id))
      : {
          id: null, name: '', type: 'menu', onMenu: true, lines: [],
          batchYieldQty: 1, batchYieldUnit: 'ea', portions: 1, wastagePct: 0,
          sellPrice: 0, taxRate: s.taxRate, targetGpPct: s.targetGpPct, salesByVenue: {}, method: '',
        };
    if (!draft) return;

    openModal(
      id ? 'Edit recipe' : 'New recipe',
      '<div id="editor"></div>',
      `<button class="btn" data-act="scale">Scale…</button>
       <div class="spacer"></div>
       <button class="btn" data-close>Cancel</button>
       <button class="btn primary" data-act="save-recipe">Save recipe</button>`,
      () => renderEditor()
    );
  }

  function renderEditor() {
    const ctx = Store.ctx();
    // Cost the draft against a recipe list where the draft replaces its saved
    // version, so sub-recipe references reflect unsaved edits.
    const recipesForCtx = ctx.recipes.some((r) => r.id === draft.id)
      ? ctx.recipes.map((r) => (r.id === draft.id ? draft : r))
      : [...ctx.recipes, { ...draft, id: draft.id || '__draft__' }];
    const costed = Costing.costRecipe({ ...draft, id: draft.id || '__draft__' },
      { ingredients: ctx.ingredients, recipes: recipesForCtx });

    const isSub = draft.type === 'sub';

    const sortedIngredients = ctx.ingredients.slice().sort((a, b) => a.name.localeCompare(b.name));
    // A recipe must not be offered as a component of itself.
    const sortedSubs = ctx.recipes
      .filter((r) => r.id !== draft.id)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Built per line so the current selection is marked on the right option.
    const refOptions = (line) => {
      const opt = (kind, item) => {
        const value = `${kind}:${item.id}`;
        const isSelected = line.kind === kind && line.refId === item.id;
        return `<option value="${esc(value)}"${isSelected ? ' selected' : ''}>${esc(item.name)}</option>`;
      };
      return `<optgroup label="Ingredients">${sortedIngredients.map((i) => opt('ingredient', i)).join('')}</optgroup>
              <optgroup label="Sub-recipes">${sortedSubs.map((r) => opt('recipe', r)).join('')}</optgroup>`;
    };

    // Anything can be a bought-in alternative, but finished products are what
    // you almost always want, so they sort to the top.
    const altOptions = (alt) => {
      const opt = (i) =>
        `<option value="${esc(i.id)}"${alt && alt.refId === i.id ? ' selected' : ''}>${esc(i.name)}</option>`;
      const finished = sortedIngredients.filter((i) => i.isFinishedProduct);
      const rest = sortedIngredients.filter((i) => !i.isFinishedProduct);
      return (finished.length ? `<optgroup label="Finished products">${finished.map(opt).join('')}</optgroup>` : '')
        + `<optgroup label="Other ingredients">${rest.map(opt).join('')}</optgroup>`;
    };

    const lineRows = (draft.lines || []).map((line, idx) => {
      const c = costed.lines[idx] || {};
      const primary = c.primary || c;
      const alt = line.alt;
      const altCost = c.alt || {};

      const altBlock = alt ? `
        <div class="alt-row">
          <span class="alt-tag" title="Bought in from a supplier instead of made here">buy in</span>
          <select data-line="${idx}" data-f="alt-ref">${altOptions(alt)}</select>
          <input type="number" step="any" min="0" data-line="${idx}" data-f="alt-qty" value="${esc(alt.qty)}">
          <select data-line="${idx}" data-f="alt-unit">${unitOptions(Units.normaliseUnit(alt.unit))}</select>
          <span class="line-cost">${altCost.error ? '—' : money(altCost.cost, 3)}</span>
          <div class="source-toggle" role="group" aria-label="Cost this line on">
            <button type="button" class="${line.useAlt ? '' : 'on'}" data-act="use-make" data-line="${idx}">make</button>
            <button type="button" class="${line.useAlt ? 'on' : ''}" data-act="use-buy" data-line="${idx}">buy</button>
          </div>
          <button class="icon-btn" data-act="del-alt" data-line="${idx}" title="Remove the bought-in option">✕</button>
        </div>
        ${altCost.error ? `<div class="line-error">${esc(altCost.error)}</div>` : ''}` : '';

      return `
        <div class="line-row${alt ? ' has-alt' : ''}">
          <select data-line="${idx}" data-f="ref">${refOptions(line)}</select>
          <input type="number" step="any" min="0" data-line="${idx}" data-f="qty" value="${esc(line.qty)}">
          <select data-line="${idx}" data-f="unit">${unitOptions(Units.normaliseUnit(line.unit))}</select>
          <span class="line-cost">${primary.error ? '—' : money(primary.cost, 3)}</span>
          ${alt ? '' : `<button class="icon-btn" data-act="add-alt" data-line="${idx}" title="Add a bought-in alternative">⇄</button>`}
          <button class="icon-btn" data-act="del-line" data-line="${idx}" title="Remove">✕</button>
        </div>
        ${primary.error ? `<div class="line-error">${esc(primary.error)}</div>` : ''}
        ${altBlock}`;
    }).join('');

    $('#editor').innerHTML = `
      <div class="field">
        <label for="f-name">Recipe name</label>
        <input id="f-name" data-f="name" value="${esc(draft.name)}" placeholder="e.g. Chicken parmigiana">
      </div>

      <div class="field-row">
        <div class="field">
          <label for="f-type">Type</label>
          <select id="f-type" data-f="type">
            <option value="menu"${!isSub ? ' selected' : ''}>Menu item</option>
            <option value="sub"${isSub ? ' selected' : ''}>Sub-recipe</option>
          </select>
        </div>
        <div class="field">
          <label for="f-portions">Portions per batch</label>
          <input id="f-portions" type="number" step="any" min="0.01" data-f="portions" value="${esc(draft.portions)}">
        </div>
        <div class="field">
          <label for="f-yieldqty">Batch yield</label>
          <input id="f-yieldqty" type="number" step="any" min="0" data-f="batchYieldQty" value="${esc(draft.batchYieldQty)}">
        </div>
        <div class="field">
          <label for="f-yieldunit">Yield unit</label>
          <select id="f-yieldunit" data-f="batchYieldUnit">${unitOptions(Units.normaliseUnit(draft.batchYieldUnit))}</select>
        </div>
      </div>
      <p class="field-hint" style="margin:-6px 0 14px">Batch yield is what the finished batch weighs or counts — it sets the unit cost when this recipe is used inside another.</p>

      <div class="section-title">Ingredients</div>
      ${lineRows || '<p class="field-hint" style="margin-bottom:10px">No lines yet.</p>'}
      <button class="btn small" data-act="add-line">+ Add line</button>

      <div class="section-title">Losses &amp; pricing</div>
      <div class="field-row">
        <div class="field">
          <label for="f-wastage">Batch wastage %</label>
          <input id="f-wastage" type="number" step="any" min="0" max="99" data-f="wastagePct" value="${esc(draft.wastagePct)}">
        </div>
        ${isSub ? '' : `
        <div class="field">
          <label for="f-sell">Sell price (inc GST)</label>
          <input id="f-sell" type="number" step="0.01" min="0" data-f="sellPrice" value="${esc(draft.sellPrice)}">
        </div>
        <div class="field">
          <label for="f-tax">GST %</label>
          <input id="f-tax" type="number" step="any" min="0" data-f="taxRate" value="${esc(draft.taxRate)}">
        </div>
        <div class="field">
          <label for="f-target">Target GP %</label>
          <input id="f-target" type="number" step="any" min="0" max="99" data-f="targetGpPct" value="${esc(draft.targetGpPct)}">
        </div>
        ${Store.venues().map((v) => `
        <div class="field">
          <label for="f-sold-${esc(v.id)}">Sold — ${esc(v.name)}</label>
          <input id="f-sold-${esc(v.id)}" type="number" step="1" min="0" data-vsales="${esc(v.id)}"
                 value="${esc((draft.salesByVenue || {})[v.id] || 0)}">
        </div>`).join('')}`}
      </div>

      <div class="section-title">Costing</div>
      <div class="summary-grid">
        <div class="summary-cell"><div class="k">Batch cost</div><div class="v">${money(costed.batchCost)}</div></div>
        <div class="summary-cell"><div class="k">Portion cost</div><div class="v">${money(costed.portionCost)}</div></div>
        ${isSub ? '' : `
        <div class="summary-cell"><div class="k">GP $</div><div class="v">${money(costed.grossProfit)}</div></div>
        <div class="summary-cell"><div class="k">GP %</div><div class="v ${gpClass(costed.gpPct, costed.targetGpPct)}">${pct(costed.gpPct)}</div></div>
        <div class="summary-cell"><div class="k">Food cost</div><div class="v">${pct(costed.foodCostPct)}</div></div>
        <div class="summary-cell"><div class="k">Price at target</div><div class="v">${money(costed.suggestedPrice)}</div></div>`}
      </div>
      ${!isSub && costed.sellPrice > 0 && !costed.onTarget
        ? `<div class="banner warn" style="margin-top:14px">Below the ${pct(costed.targetGpPct, 0)} target — ${money(costed.suggestedPrice)} would hit it.</div>` : ''}

      ${costed.makeVsBuy ? makeVsBuyPanel(costed, draft) : ''}

      <div class="section-title">Method</div>
      <div class="field">
        <textarea data-f="method" placeholder="Prep and cooking notes…">${esc(draft.method || '')}</textarea>
      </div>`;

    wireEditor();
  }

  /**
   * Make-or-buy. The per-serve gap is the honest number, but a couple of cents
   * a serve is easy to wave away — so it is also shown across the period's
   * volume, which is where the decision actually gets made.
   */
  function makeVsBuyPanel(costed, recipe) {
    const m = costed.makeVsBuy;
    const gap = Math.abs(m.difference);
    const sold = Object.values(recipe.salesByVenue || {})
      .reduce((s, n) => s + (Number(n) || 0), 0);
    const swapped = m.swappedLines
      .map((s) => `${esc(s.made)} vs ${esc(s.bought)}`)
      .join('; ');

    const verdict = m.cheaper === 'level'
      ? 'Line ball — the two come out the same, so decide on labour and consistency.'
      : `${m.cheaper === 'make' ? 'Making it here' : 'Buying it in'} is
         <strong>${money(gap)}</strong> a serve cheaper${
           Math.abs(m.savingPct) >= 0.5 ? ` (${pct(Math.abs(m.savingPct))})` : ''}${
           sold > 0 ? ` — <strong>${money(gap * sold)}</strong> across ${sold} serves` : ''}.`;

    return `
      <div class="section-title">Make or buy</div>
      <div class="mvb">
        <div class="mvb-options">
          <div class="mvb-side${m.cheaper === 'make' ? ' win' : ''}${costed.sourcing === 'inhouse' ? ' active' : ''}">
            <div class="k">Make in-house</div>
            <div class="v">${money(m.makeCost)}</div>
            <div class="mvb-note">${costed.sourcing === 'inhouse' ? 'currently costed on this' : ''}</div>
          </div>
          <div class="mvb-side${m.cheaper === 'buy' ? ' win' : ''}${costed.sourcing === 'boughtin' ? ' active' : ''}">
            <div class="k">Buy in finished</div>
            <div class="v">${money(m.buyCost)}</div>
            <div class="mvb-note">${costed.sourcing === 'boughtin' ? 'currently costed on this' : ''}</div>
          </div>
        </div>
        <p class="mvb-verdict">${verdict}</p>
        <p class="field-hint">Comparing ${swapped}. Everything else on the plate is counted both ways.</p>
      </div>`;
  }

  function wireEditor() {
    const editor = $('#editor');

    // Header/pricing fields: re-render on change so the costing panel keeps up.
    $$('[data-f]', editor).forEach((el) => {
      if (el.dataset.line !== undefined) return;
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        const f = el.dataset.f;
        const numeric = ['portions', 'batchYieldQty', 'wastagePct', 'sellPrice', 'taxRate', 'targetGpPct'];
        draft[f] = numeric.includes(f) ? Number(el.value) : el.value;
        if (f === 'type') draft.onMenu = el.value !== 'sub';
        // Text fields would lose the caret on a full re-render; only structural
        // and numeric changes need the costing panel redrawn.
        if (f === 'name' || f === 'method') return;
        renderEditor();
      });
    });

    $$('[data-vsales]', editor).forEach((el) => {
      el.addEventListener('change', () => {
        draft.salesByVenue = draft.salesByVenue || {};
        draft.salesByVenue[el.dataset.vsales] = Number(el.value) || 0;
        renderEditor();
      });
    });

    $$('[data-line]', editor).forEach((el) => {
      const idx = Number(el.dataset.line);
      if (el.dataset.act === 'del-line' || el.tagName === 'BUTTON') return;
      el.addEventListener('change', () => {
        const line = draft.lines[idx];
        switch (el.dataset.f) {
          case 'ref': {
            const [kind, refId] = el.value.split(':');
            line.kind = kind;
            line.refId = refId;
            break;
          }
          case 'qty': line.qty = Number(el.value); break;
          case 'unit': line.unit = el.value; break;
          // The alternative is always an ingredient, so it only needs an id.
          case 'alt-ref': line.alt.refId = el.value; break;
          case 'alt-qty': line.alt.qty = Number(el.value); break;
          case 'alt-unit': line.alt.unit = el.value; break;
        }
        renderEditor();
      });
    });

    // Assigned rather than added: #editor survives every re-render, so
    // addEventListener here would stack a fresh handler on each pass and one
    // click would fire N times.
    editor.onclick = (e) => {
      const del = e.target.closest('[data-act="del-line"]');
      if (del) {
        draft.lines.splice(Number(del.dataset.line), 1);
        renderEditor();
        return;
      }
      if (e.target.closest('[data-act="add-line"]')) {
        const first = Store.ingredients()[0];
        if (!first) { toast('Add an ingredient first.'); return; }
        draft.lines.push({ kind: 'ingredient', refId: first.id, qty: 100, unit: 'g' });
        renderEditor();
        return;
      }

      const lineOf = (sel) => {
        const el = e.target.closest(sel);
        return el ? draft.lines[Number(el.dataset.line)] : null;
      };

      const addAlt = lineOf('[data-act="add-alt"]');
      if (addAlt) {
        // Default to a finished product if there is one — that is what a
        // bought-in alternative almost always is.
        const pick = Store.ingredients().find((i) => i.isFinishedProduct) || Store.ingredients()[0];
        if (!pick) { toast('Add an ingredient first.'); return; }
        addAlt.alt = { refId: pick.id, qty: addAlt.qty, unit: addAlt.unit };
        addAlt.useAlt = false;
        renderEditor();
        return;
      }

      const delAlt = lineOf('[data-act="del-alt"]');
      if (delAlt) {
        delete delAlt.alt;
        delete delAlt.useAlt;
        renderEditor();
        return;
      }

      const useMake = lineOf('[data-act="use-make"]');
      if (useMake) { useMake.useAlt = false; renderEditor(); return; }

      const useBuy = lineOf('[data-act="use-buy"]');
      if (useBuy) { useBuy.useAlt = true; renderEditor(); }
    };
  }

  function saveRecipe() {
    if (!draft.name.trim()) { toast('Give the recipe a name.'); return; }
    if (!(Number(draft.portions) > 0)) { toast('Portions must be greater than zero.'); return; }
    draft.onMenu = draft.type !== 'sub';
    Store.upsertRecipe(draft.id ? draft : { ...draft, id: undefined });
    closeModal();
    toast('Recipe saved.');
    render();
  }

  function openScaleDialog() {
    const current = Number(draft.portions) || 1;
    const next = prompt(`Scale “${draft.name || 'this recipe'}” from ${current} portions to how many?`, current * 2);
    if (next == null) return;
    try {
      const scaled = Costing.scaleRecipe(draft, Number(next));
      draft.lines = scaled.lines;
      draft.portions = scaled.portions;
      draft.batchYieldQty = scaled.batchYieldQty;
      renderEditor();
      toast(`Scaled to ${scaled.portions} portions.`);
    } catch (err) {
      toast(err.message);
    }
  }

  // ================= INGREDIENTS =================

  let ingSearch = '';

  function renderIngredients() {
    const term = ingSearch.trim().toLowerCase();
    const list = Store.ingredients()
      .filter((i) => !term
        || i.name.toLowerCase().includes(term)
        || (i.offers || []).some((o) =>
          (o.supplier || '').toLowerCase().includes(term)
          || (o.productCode || '').toLowerCase().includes(term)))
      .slice().sort((a, b) => a.name.localeCompare(b.name));

    const rows = list.map((i) => {
      const offer = Costing.activeOffer(i);
      const offerCount = (i.offers || []).length;
      let costCell = '<span style="color:var(--bad)">—</span>';
      let perUnit = '';
      try {
        const y = Costing.yieldedUnitCost(i);
        // Show the rate in the unit people buy in, not raw base units.
        const dim = Units.dimensionOf(offer.packUnit);
        const showUnit = dim === 'mass' ? 'kg' : dim === 'volume' ? 'l' : 'ea';
        costCell = money(y.cost * Units.toBase(1, showUnit).qty, 3);
        perUnit = `per ${Units.unitLabel(showUnit)}`;
      } catch (err) {
        perUnit = err.message;
      }
      const yieldPct = i.yieldPct == null ? 100 : i.yieldPct;
      // Paying something other than what was agreed is worth seeing in the list.
      const offAgreed = offer.agreedPrice != null
        && Math.abs(Number(offer.agreedPrice) - Number(offer.packPrice)) > 0.005;
      return `
        <tr class="clickable" data-ingredient="${esc(i.id)}">
          <td class="name-cell">${esc(i.name)}
            ${i.isFinishedProduct ? '<span class="tag product">finished product</span>' : ''}
            ${offerCount > 1 ? `<span class="tag">${offerCount} suppliers</span>` : ''}
            <span class="sub-note">${esc(offer.supplier || 'No supplier')}${
              offer.productCode ? ` · ${esc(offer.productCode)}` : ''}${
              i.category ? ` · ${esc(i.category)}` : ''}</span></td>
          <td class="num">${esc(offer.packSize)} ${esc(Units.unitLabel(offer.packUnit))}</td>
          <td class="num">${money(offer.packPrice)}${offAgreed
            ? `<span class="sub-note" style="color:var(--warn)">agreed ${money(offer.agreedPrice)}</span>` : ''}</td>
          <td class="num">${yieldPct < 100 ? `<span class="pill warn">${pct(yieldPct, 0)}</span>` : `${pct(yieldPct, 0)}`}</td>
          <td class="num">${costCell}<span class="sub-note">${esc(perUnit)}</span></td>
          <td class="num"><button class="icon-btn" data-act="del-ingredient" data-id="${esc(i.id)}" title="Delete">✕</button></td>
        </tr>`;
    }).join('');

    view.innerHTML = `
      <div class="view-head">
        <div><h2>Ingredients</h2><p>What you buy, what it costs, and how much of it survives prep.</p></div>
        <div class="row">
          <input type="search" id="ing-search" placeholder="Search ingredients…" value="${esc(ingSearch)}">
          <button class="btn primary" data-act="new-ingredient">New ingredient</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Ingredient</th><th class="num">Pack</th><th class="num">Pack price</th>
            <th class="num">Yield</th><th class="num">Yielded cost</th><th class="num"></th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="empty" style="padding:34px">No ingredients yet.</td></tr>'}</tbody>
        </table>
      </div>`;

    const search = $('#ing-search');
    search.addEventListener('input', (e) => {
      ingSearch = e.target.value;
      const pos = e.target.selectionStart;
      renderIngredients();
      const next = $('#ing-search');
      next.focus();
      next.setSelectionRange(pos, pos);
    });
  }

  // ---------- ingredient editor ----------

  let ingDraft = null;

  function openIngredientEditor(id) {
    ingDraft = id ? structuredClone(Store.getIngredient(id)) : {
      id: null, name: '', category: '', yieldPct: 100,
      offers: [{
        id: Store.uid('off'), supplier: '', productCode: '',
        packSize: 1, packUnit: 'kg', packPrice: 0, agreedPrice: null,
      }],
    };
    if (!ingDraft) return;
    if (!ingDraft.offers || !ingDraft.offers.length) {
      // Shouldn't happen post-migration, but never open an unpriceable editor.
      ingDraft.offers = [{ id: Store.uid('off'), supplier: '', productCode: '', packSize: 1, packUnit: 'kg', packPrice: 0 }];
    }
    if (!ingDraft.preferredOfferId) ingDraft.preferredOfferId = ingDraft.offers[0].id;

    openModal(
      id ? 'Edit ingredient' : 'New ingredient',
      '<div id="ing-editor"></div>',
      `<button class="btn" data-close>Cancel</button>
       <button class="btn primary" data-act="save-ingredient">Save ingredient</button>`,
      () => renderIngredientEditor()
    );
  }

  function renderIngredientEditor() {
    const d = ingDraft;
    const supplierList = Store.suppliers().map((s) => esc(s.name));

    const offerRows = d.offers.map((o, idx) => {
      const norm = Suppliers.normaliseOffer(o, d);
      const isActive = o.id === d.preferredOfferId;
      return `
        <div class="offer${isActive ? ' active' : ''}">
          <div class="offer-head">
            <input list="supplier-names" data-offer="${idx}" data-f="supplier"
                   value="${esc(o.supplier || '')}" placeholder="Supplier">
            <input data-offer="${idx}" data-f="productCode"
                   value="${esc(o.productCode || '')}" placeholder="Product code">
            <button type="button" class="btn small ${isActive ? 'primary' : ''}"
                    data-act="use-offer" data-offer="${idx}">
              ${isActive ? 'buying this' : 'use this'}
            </button>
            <button class="icon-btn" data-act="del-offer" data-offer="${idx}" title="Remove">✕</button>
          </div>
          <div class="offer-grid">
            <label>Pack size
              <input type="number" step="any" min="0" data-offer="${idx}" data-f="packSize" value="${esc(o.packSize)}"></label>
            <label>Unit
              <select data-offer="${idx}" data-f="packUnit">${unitOptions(Units.normaliseUnit(o.packUnit))}</select></label>
            <label>Pack price
              <input type="number" step="0.01" min="0" data-offer="${idx}" data-f="packPrice" value="${esc(o.packPrice)}"></label>
            <label>Agreed price
              <input type="number" step="0.01" min="0" data-offer="${idx}" data-f="agreedPrice"
                     value="${o.agreedPrice == null ? '' : esc(o.agreedPrice)}" placeholder="none"></label>
            <label>Piece size
              <input type="number" step="any" min="0" data-offer="${idx}" data-f="unitSize"
                     value="${o.unitSize == null ? '' : esc(o.unitSize)}" placeholder="optional"></label>
            <label>Piece unit
              <select data-offer="${idx}" data-f="unitSizeUnit">${unitOptions(Units.normaliseUnit(o.unitSizeUnit) || 'g')}</select></label>
          </div>
          <div class="offer-rates">
            ${norm.error
              ? `<span style="color:var(--bad)">${esc(norm.error)}</span>`
              : `${norm.perRate != null ? `<span><b>${money(norm.perRate, 2)}</b> per ${esc(Units.unitLabel(norm.rateUnit))}</span>` : ''}
                 ${norm.perPiece != null ? `<span><b>${money(norm.perPiece, 3)}</b> per piece</span>` : ''}
                 ${o.agreedPrice != null && Number(o.agreedPrice) !== Number(o.packPrice)
                   ? `<span class="pill warn">invoice price differs from agreed</span>` : ''}`}
          </div>
        </div>`;
    }).join('');

    const cmp = Suppliers.compareOffers(d);

    $('#ing-editor').innerHTML = `
      <datalist id="supplier-names">${supplierList.map((n) => `<option value="${n}">`).join('')}</datalist>

      <div class="field">
        <label for="i-name">Name</label>
        <input id="i-name" data-i="name" value="${esc(d.name)}" placeholder="e.g. Crumbed chicken schnitzel">
      </div>
      <datalist id="location-names">${Store.locations().map((l) => `<option value="${esc(l)}">`).join('')}</datalist>
      <div class="field-row">
        <div class="field"><label for="i-category">Category</label>
          <input id="i-category" data-i="category" value="${esc(d.category || '')}"></div>
        <div class="field"><label for="i-location">Storage location</label>
          <input id="i-location" data-i="location" list="location-names"
                 value="${esc(d.location || '')}" placeholder="e.g. Coolroom">
          <span class="field-hint">Groups the stocktake count sheet.</span></div>
        <div class="field"><label for="i-yield">Yield %</label>
          <input id="i-yield" type="number" step="any" min="1" max="100" data-i="yieldPct"
                 value="${esc(d.yieldPct == null ? 100 : d.yieldPct)}">
          <span class="field-hint">Usable after trim or bone-out.</span></div>
        <div class="field"><label for="i-density">Density g/ml</label>
          <input id="i-density" type="number" step="any" min="0" data-i="density"
                 value="${esc(d.density || '')}" placeholder="optional"></div>
      </div>
      <label class="checkline">
        <input type="checkbox" id="i-finished" data-i="isFinishedProduct" ${d.isFinishedProduct ? 'checked' : ''}>
        Finished product — bought in ready to serve or cook
      </label>

      <div class="section-title">Supplier prices</div>
      <p class="field-hint" style="margin:-4px 0 12px">
        One entry per supplier who can supply this. <strong>Agreed price</strong> is what
        you contracted to pay — invoices are checked against it. <strong>Piece size</strong>
        lets a 300g piece be compared honestly against a 250g one.
      </p>
      ${offerRows}
      <button class="btn small" data-act="add-offer">+ Add supplier price</button>

      ${cmp ? offerComparisonPanel(cmp, d) : ''}`;

    wireIngredientEditor();
  }

  /**
   * Side-by-side comparison, plus what switching would actually be worth.
   *
   * Cost per kilo and cost per piece are shown separately and never blended:
   * when the pieces are different sizes they can name different winners, and
   * that disagreement is the whole decision.
   */
  function offerComparisonPanel(cmp, ingredient) {
    const rows = cmp.rows.filter((r) => !r.error).map((r) => {
      const isCurrent = r.id === cmp.current.id;
      const bestRate = cmp.cheapestByRate && r.id === cmp.cheapestByRate.id;
      const bestPiece = cmp.cheapestByPiece && r.id === cmp.cheapestByPiece.id;
      return `
        <tr${isCurrent ? ' class="current"' : ''}>
          <td class="name-cell">${esc(r.supplier || '—')}
            <span class="sub-note">${esc(r.productCode || '')}${isCurrent ? ' · currently buying' : ''}</span></td>
          <td class="num">${r.pieceSize != null ? `${r.pieceSize}${esc(Units.unitLabel(r.pieceUnit))}` : '—'}</td>
          <td class="num">${money(r.packPrice)}</td>
          <td class="num">${r.perRate != null
            ? `${money(r.perRate, 2)}${bestRate ? ' <span class="pill good">best</span>' : ''}` : '—'}</td>
          <td class="num">${r.perPiece != null
            ? `${money(r.perPiece, 3)}${bestPiece ? ' <span class="pill good">best</span>' : ''}` : '—'}</td>
          <td class="num">${isCurrent ? '' :
            `<button class="btn small" data-act="switch-preview" data-offer-id="${esc(r.id)}">what if?</button>`}</td>
        </tr>`;
    }).join('');

    const warning = cmp.pieceWinnerDiffers ? `
      <div class="banner warn" style="margin:12px 0 0">
        <strong>${esc(cmp.cheapestByPiece.supplier)}</strong> is cheaper per piece but
        <strong>${esc(cmp.cheapestByRate.supplier)}</strong> is cheaper per kilo — the pieces
        are different sizes, so the cheaper piece is a smaller serve, not cheaper chicken.
      </div>` : '';

    return `
      <div class="section-title">Supplier comparison</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Supplier</th><th class="num">Piece</th><th class="num">Pack price</th>
            <th class="num">Per unit</th><th class="num">Per piece</th><th class="num"></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${warning}
      <div id="switch-preview"></div>`;
  }

  /**
   * What a switch is worth once volumes are counted. A cent a serve on a dish
   * nobody orders is noise; the same cent on the best seller is the decision.
   */
  function renderSwitchPreview(offerId) {
    const target = $('#switch-preview');
    if (!target) return;

    let impact;
    try {
      // Group-total sales: switching a supplier is a group decision.
      const ctx = Store.salesCtx(null);
      // Cost against the unsaved draft, so edits in this modal are reflected.
      const ingredients = ctx.ingredients.some((i) => i.id === ingDraft.id)
        ? ctx.ingredients.map((i) => (i.id === ingDraft.id ? ingDraft : i))
        : [...ctx.ingredients, ingDraft];
      impact = Suppliers.switchImpact(ingDraft.id, offerId, { ...ctx, ingredients });
    } catch (err) {
      target.innerHTML = `<div class="banner bad">${esc(err.message)}</div>`;
      return;
    }

    if (!impact.dishes.length) {
      target.innerHTML = `<div class="banner warn">
        Nothing on the menu uses this yet, so switching changes no dish cost.
      </div>`;
      return;
    }

    const saving = impact.saving;
    const dishRows = impact.dishes.map((dish) => `
      <tr>
        <td class="name-cell">${esc(dish.name)}
          ${dish.isTopSeller ? '<span class="tag seller">best seller</span>' : ''}
          ${impact.concentratedOn && dish.id === impact.concentratedOn.id && !dish.isTopSeller
            ? '<span class="tag seller">carries most of it</span>' : ''}
          <span class="sub-note">#${dish.volumeRank} of ${dish.menuSize} by volume</span></td>
        <td class="num">${dish.unitsSold || '—'}</td>
        <td class="num">${money(dish.costBefore)}</td>
        <td class="num">${money(dish.costAfter)}</td>
        <td class="num" style="color:${dish.perServe < 0 ? 'var(--good)' : 'var(--bad)'}">
          ${dish.perServe > 0 ? '+' : ''}${money(dish.perServe, 3)}</td>
        <td class="num" style="color:${dish.periodDelta < 0 ? 'var(--good)' : 'var(--bad)'}">
          ${dish.periodDelta > 0 ? '+' : ''}${money(dish.periodDelta)}</td>
        <td class="num">${pct(dish.shareOfChange, 0)}</td>
      </tr>`).join('');

    const spec = impact.specChange;
    const verdict = {
      'costs-more': `Switching to ${esc(impact.to.supplier)} <strong>costs ${money(-saving)} more</strong>
                     across current volumes.`,
      saves: `Switching to ${esc(impact.to.supplier)} saves <strong>${money(saving)}</strong>
              across current volumes, at the same piece size.`,
      'saves-but-smaller': `Switching to ${esc(impact.to.supplier)} saves <strong>${money(saving)}</strong>,
              but the piece drops from ${spec ? `${spec.fromSize}${esc(Units.unitLabel(spec.fromUnit))}` : ''}
              to ${spec ? `${spec.toSize}${esc(Units.unitLabel(spec.toUnit))}` : ''}
              (${spec ? pct(Math.abs(spec.deltaPct)) : ''} smaller) — that is a visible cut, not a free saving.`,
    }[impact.verdict];

    // Where the change lands matters as much as its size: a saving riding on
    // one dish is a spec change to that dish, whatever the total says.
    const c = impact.concentratedOn;
    const exposure = c && impact.concentration >= 40 ? `
      <div class="banner ${impact.verdict === 'saves-but-smaller' ? 'bad' : 'warn'}" style="margin:12px 0 0">
        <strong>${pct(impact.concentration, 0)}</strong> of the change lands on
        <strong>${esc(c.name)}</strong> — #${c.volumeRank} of ${c.menuSize} by volume,
        ${c.unitsSold} sold.
        ${impact.verdict === 'saves-but-smaller'
          ? ` You are really deciding whether to put a ${
              impact.specChange ? `${impact.specChange.toSize}${esc(Units.unitLabel(impact.specChange.toUnit))}` : 'smaller'
            } piece on that dish to save ${money(Math.abs(c.periodDelta))} on it.`
          : ''}
      </div>` : '';

    target.innerHTML = `
      <div class="section-title">If you switched to ${esc(impact.to.supplier || 'this supplier')}</div>
      <div class="stat-grid" style="margin-bottom:12px">
        <div class="stat"><div class="stat-label">Across current volumes</div>
          <div class="stat-value ${saving > 0 ? 'good' : 'bad'}">${saving > 0 ? '' : '−'}${money(Math.abs(saving))}</div>
          <div class="stat-note">${saving > 0 ? 'saved' : 'extra cost'}</div></div>
        <div class="stat"><div class="stat-label">Weighted GP</div>
          <div class="stat-value">${pct(impact.gpAfter)}</div>
          <div class="stat-note">from ${pct(impact.gpBefore)}</div></div>
        <div class="stat"><div class="stat-label">Piece size</div>
          <div class="stat-value ${spec && spec.smaller ? 'warn' : ''}">${
            impact.to.pieceSize != null ? `${impact.to.pieceSize}${esc(Units.unitLabel(impact.to.pieceUnit))}` : '—'}</div>
          <div class="stat-note">${spec ? `was ${spec.fromSize}${esc(Units.unitLabel(spec.fromUnit))}` : 'unchanged'}</div></div>
      </div>
      <p class="mvb-verdict">${verdict}</p>
      ${exposure}
      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead><tr><th>Dish</th><th class="num">Sold</th><th class="num">Cost now</th>
            <th class="num">After</th><th class="num">Per serve</th><th class="num">Period</th>
            <th class="num">Share</th></tr></thead>
          <tbody>${dishRows}</tbody>
        </table>
      </div>`;
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function wireIngredientEditor() {
    const editor = $('#ing-editor');

    $$('[data-i]', editor).forEach((el) => {
      const evt = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        const f = el.dataset.i;
        if (el.type === 'checkbox') ingDraft[f] = el.checked;
        else if (f === 'yieldPct') ingDraft[f] = Number(el.value);
        else if (f === 'density') ingDraft[f] = el.value ? Number(el.value) : undefined;
        else ingDraft[f] = el.value;
        // Names are typed a character at a time; re-rendering would eat the caret.
        if (f === 'name' || f === 'category' || f === 'location') return;
        renderIngredientEditor();
      });
    });

    $$('[data-offer]', editor).forEach((el) => {
      if (el.tagName === 'BUTTON') return;
      el.addEventListener('change', () => {
        const offer = ingDraft.offers[Number(el.dataset.offer)];
        const f = el.dataset.f;
        const numeric = ['packSize', 'packPrice', 'agreedPrice', 'unitSize'];
        if (numeric.includes(f)) offer[f] = el.value === '' ? null : Number(el.value);
        else offer[f] = el.value;
        renderIngredientEditor();
      });
    });

    editor.onclick = (e) => {
      const offerBtn = (sel) => {
        const el = e.target.closest(sel);
        return el ? Number(el.dataset.offer) : null;
      };

      if (e.target.closest('[data-act="add-offer"]')) {
        const from = ingDraft.offers[0];
        ingDraft.offers.push({
          id: Store.uid('off'), supplier: '', productCode: '',
          packSize: from.packSize, packUnit: from.packUnit, packPrice: from.packPrice,
          agreedPrice: null, unitSize: from.unitSize, unitSizeUnit: from.unitSizeUnit,
        });
        renderIngredientEditor();
        return;
      }

      const use = offerBtn('[data-act="use-offer"]');
      if (use !== null) {
        ingDraft.preferredOfferId = ingDraft.offers[use].id;
        renderIngredientEditor();
        return;
      }

      const del = offerBtn('[data-act="del-offer"]');
      if (del !== null) {
        if (ingDraft.offers.length <= 1) { toast('An ingredient needs at least one supplier price.'); return; }
        const [removed] = ingDraft.offers.splice(del, 1);
        if (ingDraft.preferredOfferId === removed.id) ingDraft.preferredOfferId = ingDraft.offers[0].id;
        renderIngredientEditor();
        return;
      }

      const preview = e.target.closest('[data-act="switch-preview"]');
      if (preview) renderSwitchPreview(preview.dataset.offerId);
    };

    modalOnSave = () => {
      if (!ingDraft.name.trim()) { toast('Give the ingredient a name.'); return; }
      if (!(Number(ingDraft.yieldPct) > 0 && Number(ingDraft.yieldPct) <= 100)) {
        toast('Yield must be between 1 and 100%.'); return;
      }
      for (const o of ingDraft.offers) {
        if (!(Number(o.packSize) > 0)) {
          toast(`Pack size for ${o.supplier || 'a supplier price'} must be greater than zero.`);
          return;
        }
      }
      Store.upsertIngredient(ingDraft.id ? ingDraft : { ...ingDraft, id: undefined });
      // Any supplier typed in here should exist as a record to email later.
      for (const o of ingDraft.offers) {
        if (o.supplier && !Store.supplierByName(o.supplier)) {
          Store.upsertSupplier({ name: o.supplier.trim(), email: '' });
        }
      }
      closeModal();
      toast('Ingredient saved.');
      render();
    };
  }

  // ================= SUPPLIERS =================

  let impactChanges = {};

  function renderSuppliers() {
    const ctx = Store.salesCtx(null);
    const result = Costing.priceImpact(impactChanges, ctx);
    const changed = Object.keys(impactChanges).filter((k) => Number(impactChanges[k]) !== 0);

    // Who supplies what, and how much of your spend sits with each of them.
    const spend = new Map();
    for (const ing of ctx.ingredients) {
      const offer = Costing.activeOffer(ing);
      const name = (offer.supplier || 'Unassigned').trim() || 'Unassigned';
      spend.set(name, (spend.get(name) || 0) + 1);
    }

    const supplierRows = Store.suppliers()
      .slice().sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => {
        const lines = spend.get(s.name) || 0;
        const missingAgreed = ctx.ingredients.filter((i) =>
          (i.offers || []).some((o) => o.supplier === s.name && o.agreedPrice == null)).length;
        return `
          <tr>
            <td class="name-cell">${esc(s.name)}
              ${missingAgreed ? `<span class="sub-note" style="color:var(--warn)">${missingAgreed} product${
                missingAgreed > 1 ? 's' : ''} with no agreed price</span>` : ''}</td>
            <td><input type="email" data-supplier="${esc(s.id)}" value="${esc(s.email || '')}"
                       placeholder="accounts@supplier.com"></td>
            <td class="num">${lines}</td>
            <td class="num"><button class="icon-btn" data-act="del-supplier" data-id="${esc(s.id)}" title="Remove">✕</button></td>
          </tr>`;
      }).join('');

    const inputs = ctx.ingredients
      .slice().sort((a, b) => a.name.localeCompare(b.name))
      .map((i) => {
        const o = Costing.activeOffer(i);
        return `
          <div class="line-row" style="grid-template-columns:1fr 110px">
            <label for="ch-${esc(i.id)}" style="font-size:14px">${esc(i.name)}
              <span class="sub-note">${esc(o.supplier || '')} · ${money(o.packPrice)} / ${
                esc(o.packSize)}${esc(Units.unitLabel(o.packUnit))}</span></label>
            <input id="ch-${esc(i.id)}" type="number" step="any" data-change="${esc(i.id)}"
                   value="${esc(impactChanges[i.id] ?? '')}" placeholder="0%">
          </div>`;
      }).join('');

    const rows = result.affected.map((a) => `
      <tr>
        <td class="name-cell">${esc(a.name)}</td>
        <td class="num">${money(a.costBefore)}</td>
        <td class="num">${money(a.costAfter)}</td>
        <td class="num" style="color:${a.costDelta > 0 ? 'var(--bad)' : 'var(--good)'}">${
          a.costDelta > 0 ? '+' : ''}${money(a.costDelta)}</td>
        <td class="num">${pct(a.gpBefore)}</td>
        <td class="num">${pct(a.gpAfter)}</td>
        <td class="num">${a.brokeTarget ? '<span class="pill bad">breaks target</span>' : ''}</td>
      </tr>`).join('');

    view.innerHTML = `
      <div class="view-head">
        <div><h2>Suppliers</h2><p>Who you buy from, and what their price movements do to the menu.</p></div>
        <button class="btn" data-act="add-supplier">Add supplier</button>
      </div>

      <div class="section-title">Supplier list</div>
      <p class="field-hint" style="margin:-4px 0 10px">
        Email addresses are used to send price-adjustment claims from the Invoices tab.
      </p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Supplier</th><th>Accounts email</th><th class="num">Products</th><th class="num"></th></tr></thead>
          <tbody>${supplierRows || '<tr><td colspan="4" class="empty" style="padding:28px">No suppliers yet.</td></tr>'}</tbody>
        </table>
      </div>

      <div class="section-title">Model a price movement</div>
      ${changed.length ? `
        <div class="stat-grid">
          <div class="stat"><div class="stat-label">Weighted GP before</div><div class="stat-value">${pct(result.gpBefore)}</div></div>
          <div class="stat"><div class="stat-label">Weighted GP after</div>
            <div class="stat-value ${result.gpAfter < result.gpBefore ? 'bad' : 'good'}">${pct(result.gpAfter)}</div>
            <div class="stat-note">${(result.gpAfter - result.gpBefore).toFixed(2)} pts</div></div>
          <div class="stat"><div class="stat-label">COGS change</div>
            <div class="stat-value">${money(result.cogsAfter - result.cogsBefore)}</div>
            <div class="stat-note">over the period</div></div>
          <div class="stat"><div class="stat-label">Dishes broken</div>
            <div class="stat-value ${result.brokeCount ? 'bad' : 'good'}">${result.brokeCount}</div>
            <div class="stat-note">fall below target GP</div></div>
        </div>` : `<div class="banner warn">Enter a percentage against any item below — 12 for a 12% rise, -5 for a drop.
          It applies to whichever supplier you currently buy that item from.</div>`}

      <div style="display:grid;gap:20px;grid-template-columns:minmax(260px,1fr) minmax(320px,1.6fr)" class="impact-layout">
        <div>
          <div class="section-title">Price movements</div>
          <div class="card">${inputs || '<p class="field-hint">No ingredients yet.</p>'}</div>
        </div>
        <div>
          <div class="section-title">Affected dishes</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Dish</th><th class="num">Cost now</th><th class="num">Cost after</th>
                <th class="num">Δ</th><th class="num">GP now</th><th class="num">GP after</th><th></th></tr></thead>
              <tbody>${rows || '<tr><td colspan="7" class="empty" style="padding:30px">Nothing affected yet.</td></tr>'}</tbody>
            </table>
          </div>
          ${changed.length ? '<div class="row" style="margin-top:10px"><button class="btn" data-act="clear-impact">Clear</button></div>' : ''}
        </div>
      </div>`;

    $$('[data-change]').forEach((el) => {
      el.addEventListener('change', () => {
        const id = el.dataset.change;
        const val = el.value.trim();
        if (val === '' || Number(val) === 0) delete impactChanges[id];
        else impactChanges[id] = Number(val);
        renderSuppliers();
      });
    });

    $$('[data-supplier]').forEach((el) => {
      el.addEventListener('change', () => {
        Store.upsertSupplier({ id: el.dataset.supplier, email: el.value.trim() });
        toast('Supplier saved.');
      });
    });
  }

  // ================= ORDERS =================

  let orderDraft = null;

  function venueName(id) {
    const v = Store.getVenue(id);
    return v ? v.name : '—';
  }

  function renderOrders() {
    const list = Store.orders().slice()
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || (b.ref || '').localeCompare(a.ref || ''));

    const rows = list.map((o) => {
      const pill = { draft: 'neutral', sent: 'warn', received: 'good' }[o.status] || 'neutral';
      const actions = {
        draft: `<button class="btn small" data-act="order-sent" data-id="${esc(o.id)}">Mark sent</button>`,
        sent: `<button class="btn small primary" data-act="match-order" data-id="${esc(o.id)}">Match invoice</button>
               <button class="btn small" data-act="order-received" data-id="${esc(o.id)}">Received</button>`,
      }[o.status] || '';
      return `
        <tr class="clickable" data-order="${esc(o.id)}">
          <td class="name-cell">${esc(o.ref)}<span class="sub-note">${esc(o.createdAt || '')}</span></td>
          <td>${esc(o.supplier || '—')}</td>
          <td>${esc(venueName(o.venueId))}</td>
          <td class="num">${(o.lines || []).length}</td>
          <td class="num">${money(Suppliers.orderTotal(o))}</td>
          <td><span class="pill ${pill}">${esc(o.status)}</span></td>
          <td class="num">${actions}
            <button class="icon-btn" data-act="del-order" data-id="${esc(o.id)}" title="Delete">✕</button></td>
        </tr>`;
    }).join('');

    view.innerHTML = `
      <div class="view-head">
        <div><h2>Orders</h2>
          <p>Purchase orders at your agreed prices. The supplier's invoice gets matched against them line by line.</p></div>
        <button class="btn primary" data-act="new-order">New order</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>PO</th><th>Supplier</th><th>Deliver to</th><th class="num">Lines</th>
            <th class="num">Total</th><th>Status</th><th class="num"></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="7" class="empty" style="padding:34px">
            No orders yet. Raise one, email it to the supplier, and match their invoice against it when it lands.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  /** Everything this supplier can sell you: ingredients carrying one of their offers. */
  function supplierProducts(supplierName) {
    const n = String(supplierName || '').trim().toLowerCase();
    return Store.ingredients()
      .map((i) => ({ ingredient: i, offer: (i.offers || []).find((o) => (o.supplier || '').trim().toLowerCase() === n) }))
      .filter((x) => x.offer)
      .sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name));
  }

  function openOrderEditor(id) {
    const supplierList = Store.suppliers();
    if (!supplierList.length) { toast('Add a supplier first.'); return; }
    orderDraft = id ? structuredClone(Store.getOrder(id)) : {
      id: null, ref: Store.nextOrderRef(), supplier: supplierList[0].name,
      venueId: Store.venues()[0].id, status: 'draft',
      createdAt: new Date().toISOString().slice(0, 10), lines: [],
    };
    if (!orderDraft) return;

    openModal(
      id ? `Edit ${orderDraft.ref}` : `New order ${orderDraft.ref}`,
      '<div id="order-editor"></div>',
      `<button class="btn" data-act="copy-order">Copy order text</button>
       <button class="btn" data-act="email-order">Email order</button>
       <div class="spacer"></div>
       <button class="btn" data-close>Cancel</button>
       <button class="btn primary" data-act="save-order">Save order</button>`,
      () => renderOrderEditor()
    );
  }

  function renderOrderEditor() {
    const d = orderDraft;
    const products = supplierProducts(d.supplier);
    const venues = Store.venues();

    const lineRows = (d.lines || []).map((l, idx) => {
      const options = products.map((pr) =>
        `<option value="${esc(pr.ingredient.id)}"${pr.ingredient.id === l.ingredientId ? ' selected' : ''}>${
          esc(pr.ingredient.name)}${pr.offer.productCode ? ` (${esc(pr.offer.productCode)})` : ''}</option>`).join('');
      return `
        <div class="line-row" style="grid-template-columns:1fr 78px 100px 92px auto">
          <select data-oline="${idx}" data-f="product">${options}</select>
          <input type="number" step="any" min="0" data-oline="${idx}" data-f="qty" value="${esc(l.qty)}"
                 aria-label="Packs">
          <span class="line-cost">@ ${money(l.packPrice)}</span>
          <span class="line-cost">${money((Number(l.qty) || 0) * (Number(l.packPrice) || 0))}</span>
          <button class="icon-btn" data-act="del-oline" data-oline="${idx}" title="Remove">✕</button>
        </div>`;
    }).join('');

    $('#order-editor').innerHTML = `
      <div class="field-row">
        <div class="field"><label for="o-supplier">Supplier</label>
          <select id="o-supplier">${Store.suppliers().map((s) =>
            `<option${s.name === d.supplier ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
          <span class="field-hint">Changing supplier clears the lines — pricing is per supplier.</span></div>
        <div class="field"><label for="o-venue">Deliver to</label>
          <select id="o-venue">${venues.map((v) =>
            `<option value="${esc(v.id)}"${v.id === d.venueId ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="o-date">Date</label>
          <input id="o-date" type="date" value="${esc(d.createdAt || '')}"></div>
      </div>

      <div class="section-title">Lines — at your agreed prices</div>
      ${lineRows || '<p class="field-hint" style="margin-bottom:10px">Nothing on the order yet.</p>'}
      <button class="btn small" data-act="add-oline">+ Add product</button>
      ${products.length ? '' : `<p class="field-hint" style="margin-top:8px;color:var(--warn)">
        ${esc(d.supplier)} has no products in this client's library — add a supplier price on an ingredient first.</p>`}

      <div class="summary-grid" style="margin-top:16px">
        <div class="summary-cell"><div class="k">Order total</div><div class="v">${money(Suppliers.orderTotal(d))}</div></div>
        <div class="summary-cell"><div class="k">Lines</div><div class="v">${(d.lines || []).length}</div></div>
      </div>`;

    $('#o-supplier').addEventListener('change', (e) => {
      orderDraft.supplier = e.target.value;
      orderDraft.lines = [];
      renderOrderEditor();
    });
    $('#o-venue').addEventListener('change', (e) => { orderDraft.venueId = e.target.value; });
    $('#o-date').addEventListener('change', (e) => { orderDraft.createdAt = e.target.value; });

    $$('[data-oline]', $('#order-editor')).forEach((el) => {
      if (el.tagName === 'BUTTON') return;
      el.addEventListener('change', () => {
        const line = orderDraft.lines[Number(el.dataset.oline)];
        if (el.dataset.f === 'qty') {
          line.qty = Number(el.value) || 0;
        } else {
          const pr = supplierProducts(orderDraft.supplier).find((x) => x.ingredient.id === el.value);
          if (pr) {
            line.ingredientId = pr.ingredient.id;
            line.offerId = pr.offer.id;
            // The PO locks the price you agreed, not whatever is being invoiced.
            line.packPrice = pr.offer.agreedPrice != null ? Number(pr.offer.agreedPrice) : Number(pr.offer.packPrice);
          }
        }
        renderOrderEditor();
      });
    });

    $('#order-editor').onclick = (e) => {
      if (e.target.closest('[data-act="add-oline"]')) {
        const pr = supplierProducts(orderDraft.supplier)[0];
        if (!pr) { toast(`No products on file for ${orderDraft.supplier}.`); return; }
        orderDraft.lines.push({
          ingredientId: pr.ingredient.id, offerId: pr.offer.id, qty: 1,
          packPrice: pr.offer.agreedPrice != null ? Number(pr.offer.agreedPrice) : Number(pr.offer.packPrice),
        });
        renderOrderEditor();
        return;
      }
      const del = e.target.closest('[data-act="del-oline"]');
      if (del) { orderDraft.lines.splice(Number(del.dataset.oline), 1); renderOrderEditor(); }
    };
  }

  function saveOrder() {
    if (!orderDraft.supplier) { toast('Pick a supplier.'); return; }
    if (!orderDraft.lines.length) { toast('Add at least one product.'); return; }
    Store.upsertOrder(orderDraft.id ? orderDraft : { ...orderDraft, id: undefined });
    closeModal();
    toast('Order saved.');
    render();
  }

  function orderEmailFor(order) {
    return Suppliers.orderEmail(order, Store.ctx(), {
      business: Store.settings().business || '',
      venueName: venueName(order.venueId),
    });
  }

  // ================= INVOICES =================

  let invoiceText = '';
  let invoiceSupplier = '';
  let invoiceRef = '';
  let invoiceResult = null;
  let invoiceOrderId = null; // set = matching against a PO, not the price list

  function renderInvoices() {
    const suppliers = Store.suppliers().slice().sort((a, b) => a.name.localeCompare(b.name));
    const matchOrder = invoiceOrderId ? Store.getOrder(invoiceOrderId) : null;
    if (invoiceOrderId && !matchOrder) invoiceOrderId = null;

    view.innerHTML = `
      <div class="view-head">
        <div><h2>Invoices</h2>
          <p>${matchOrder
            ? `Match the supplier's invoice against ${esc(matchOrder.ref)} — price and quantity, line by line.`
            : 'Check what a supplier billed against what you agreed, and claim the difference.'}</p></div>
      </div>

      ${matchOrder ? `
      <div class="banner warn">
        Matching against <strong>${esc(matchOrder.ref)}</strong> — ${esc(matchOrder.supplier)},
        ${esc(venueName(matchOrder.venueId))}, ordered ${money(Suppliers.orderTotal(matchOrder))}
        on ${esc(matchOrder.createdAt || '')}.
        <button class="btn small" data-act="clear-order-match" style="margin-left:10px">Match against the price list instead</button>
      </div>` : `
      <div class="banner warn">
        Paste the invoice below, or drop in the CSV your supplier emails. Reading mailboxes
        automatically needs a mail server — see the README for what that would take.
      </div>`}

      <div class="field-row" style="max-width:720px">
        ${matchOrder ? '' : `
        <div class="field"><label for="inv-supplier">Supplier</label>
          <select id="inv-supplier">
            <option value="">Any supplier</option>
            ${suppliers.map((s) => `<option value="${esc(s.name)}"${
              s.name === invoiceSupplier ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
          </select>
          <span class="field-hint">Scopes matching to that supplier's product codes.</span></div>`}
        <div class="field"><label for="inv-ref">Invoice number</label>
          <input id="inv-ref" value="${esc(invoiceRef)}" placeholder="e.g. INV-12345"></div>
      </div>

      <div class="field">
        <label for="inv-text">Invoice lines</label>
        <textarea id="inv-text" rows="8" placeholder="Product Code,Description,Qty,Unit Price&#10;GT-SCH-300,Crumbed chicken schnitzel,4,99.50"
          style="font-family:var(--mono);font-size:13px">${esc(invoiceText)}</textarea>
        <span class="field-hint">CSV or tab-separated. A header row helps but is not required.</span>
      </div>
      <div class="row">
        <button class="btn primary" data-act="reconcile">${matchOrder
          ? `Match against ${esc(matchOrder.ref)}` : 'Check against agreed prices'}</button>
        <button class="btn" data-act="load-invoice">Load a file…</button>
        <input type="file" id="invoice-file" accept=".csv,.txt,text/csv,text/plain" hidden>
        ${invoiceResult ? '<button class="btn" data-act="clear-invoice">Clear</button>' : ''}
      </div>

      <div id="inv-result">${invoiceResult
        ? (invoiceOrderId ? poResultHtml(invoiceResult) : invoiceResultHtml(invoiceResult))
        : ''}</div>`;

    $('#inv-text').addEventListener('input', (e) => { invoiceText = e.target.value; });
    $('#inv-ref').addEventListener('input', (e) => { invoiceRef = e.target.value; });
    const supSel = $('#inv-supplier');
    if (supSel) supSel.addEventListener('change', (e) => { invoiceSupplier = e.target.value; });
  }

  /**
   * A PO match has more ways to be wrong than a price-list check, so the
   * result keeps the four buckets separate: price, quantity, invoiced but
   * never ordered, ordered but never invoiced.
   */
  function poResultHtml(r) {
    const rows = r.lines.map((l) => `
      <tr>
        <td class="name-cell">${esc(l.ingredientName)}
          <span class="sub-note">${esc(l.productCode || l.code || '')}</span></td>
        <td class="num">${l.orderedQty}</td>
        <td class="num" style="color:${l.qtyStatus !== 'ok' ? 'var(--warn)' : 'inherit'}">${l.qty}</td>
        <td class="num">${money(l.orderedPrice)}</td>
        <td class="num">${money(l.invoicedPrice)}</td>
        <td class="num" style="color:${l.priceVariance > 0 ? 'var(--bad)' : l.priceVariance < 0 ? 'var(--warn)' : 'inherit'}">
          ${l.priceVariance > 0 ? '+' : ''}${money(l.priceVarianceTotal)}</td>
        <td class="num">
          ${l.priceStatus === 'over' ? '<span class="pill bad">price</span>' : ''}
          ${l.priceStatus === 'under' ? '<span class="pill warn">under</span>' : ''}
          ${l.qtyStatus === 'short' ? '<span class="pill warn">short</span>' : ''}
          ${l.qtyStatus === 'over' ? '<span class="pill warn">extra qty</span>' : ''}
          ${l.priceStatus === 'ok' && l.qtyStatus === 'ok' ? '<span class="pill good">ok</span>' : ''}
        </td>
      </tr>`).join('');

    const problems = [];
    if (r.notInvoiced.length) {
      problems.push(`<div class="banner warn"><strong>${r.notInvoiced.length}</strong> ordered line${
        r.notInvoiced.length > 1 ? 's are' : ' is'} not on this invoice —
        ${r.notInvoiced.map((l) => `${esc(l.ingredientName)} (${l.orderedQty})`).join(', ')}.
        Short-supplied or back-ordered: chase stock, not money.</div>`);
    }
    if (r.notOnOrder.length) {
      problems.push(`<div class="banner bad"><strong>${r.notOnOrder.length}</strong> invoiced line${
        r.notOnOrder.length > 1 ? 's were' : ' was'} never on the order —
        ${r.notOnOrder.map((l) => esc(l.ingredientName || l.description || l.code)).join(', ')}
        (${money(r.notOnOrderTotal)}).</div>`);
    }
    if (r.skipped) {
      problems.push(`<div class="banner warn">${r.skipped} row${r.skipped > 1 ? 's were' : ' was'}
        skipped — no usable price could be read.</div>`);
    }

    const claim = poClaimEmail(r);

    return `
      <div class="section-title">Result — against ${esc(r.order.ref)}</div>
      <div class="stat-grid">
        <div class="stat"><div class="stat-label">Price credit to claim</div>
          <div class="stat-value ${r.priceOverTotal > 0 ? 'bad' : 'good'}">${money(r.priceOverTotal)}</div>
          <div class="stat-note">${r.priceOver.length} line${r.priceOver.length === 1 ? '' : 's'} over PO price</div></div>
        <div class="stat"><div class="stat-label">Clean lines</div>
          <div class="stat-value">${r.cleanCount}</div>
          <div class="stat-note">of ${r.lines.length} matched</div></div>
        <div class="stat"><div class="stat-label">Short-supplied</div>
          <div class="stat-value ${r.qtyShort.length || r.notInvoiced.length ? 'warn' : 'good'}">${
            r.qtyShort.length + r.notInvoiced.length}</div>
          <div class="stat-note">${money(r.shortValue + r.notInvoiced.reduce((s, l) => s + l.value, 0))} of stock</div></div>
        <div class="stat"><div class="stat-label">Never ordered</div>
          <div class="stat-value ${r.notOnOrder.length ? 'bad' : 'good'}">${r.notOnOrder.length}</div>
          <div class="stat-note">${money(r.notOnOrderTotal)} invoiced</div></div>
      </div>

      ${problems.join('')}

      ${r.lines.length ? `<div class="table-wrap">
        <table>
          <thead><tr><th>Item</th><th class="num">Ordered</th><th class="num">Invoiced</th>
            <th class="num">PO price</th><th class="num">Invoiced</th><th class="num">Δ line</th><th class="num"></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : '<div class="empty card">No invoice lines matched this order.</div>'}

      ${r.clean ? `
        <div class="banner warn" style="background:rgba(126,195,80,0.09);border-color:rgba(126,195,80,0.35);color:var(--good)">
          Invoice matches ${esc(r.order.ref)} on price and quantity.
          <button class="btn small" data-act="order-received" data-id="${esc(r.order.id)}" style="margin-left:10px">Mark order received</button>
        </div>` : `
        <div class="section-title">Reply to the supplier</div>
        <div class="card">
          <div class="field"><label for="claim-subject">Subject</label>
            <input id="claim-subject" readonly value="${esc(claim.subject)}"></div>
          <div class="field"><label for="claim-body">Message</label>
            <textarea id="claim-body" rows="14" style="font-family:var(--mono);font-size:12.5px">${esc(claim.body)}</textarea></div>
          <div class="row">
            <button class="btn primary" data-act="email-claim">Open in email</button>
            <button class="btn" data-act="copy-claim">Copy message</button>
            <button class="btn" data-act="order-received" data-id="${esc(r.order.id)}">Mark order received anyway</button>
          </div>
          <p class="field-hint" style="margin-top:8px">
            Price variances are claimed; quantity gaps are asked about — a delivery docket, not an
            invoice, is what proves what actually arrived.
          </p>
        </div>`}`;
  }

  function invoiceResultHtml(r) {
    const statusPill = (l) => ({
      overcharged: '<span class="pill bad">over</span>',
      undercharged: '<span class="pill warn">under</span>',
      ok: '<span class="pill good">ok</span>',
    }[l.status]);

    const rows = r.lines.map((l) => `
      <tr>
        <td class="name-cell">${esc(l.ingredientName)}
          <span class="sub-note">${esc(l.productCode || l.code || '')}${
            l.matchedOn !== 'code' ? ` · matched on ${esc(l.matchedOn)}` : ''}</span></td>
        <td class="num">${l.qty}</td>
        <td class="num">${money(l.agreedPrice)}</td>
        <td class="num">${money(l.invoicedPrice)}</td>
        <td class="num" style="color:${l.variance > 0 ? 'var(--bad)' : l.variance < 0 ? 'var(--warn)' : 'inherit'}">
          ${l.variance > 0 ? '+' : ''}${money(l.variance)}</td>
        <td class="num">${l.varianceTotal > 0 ? '+' : ''}${money(l.varianceTotal)}</td>
        <td class="num">${statusPill(l)}</td>
      </tr>`).join('');

    const problems = [];
    if (r.unmatched.length) {
      problems.push(`<div class="banner warn"><strong>${r.unmatched.length}</strong> line${
        r.unmatched.length > 1 ? 's' : ''} could not be matched to anything in your library:
        ${r.unmatched.slice(0, 6).map((l) => esc(l.description || l.code)).join(', ')}${
        r.unmatched.length > 6 ? '…' : ''}. Add them as ingredients, or set the supplier's product code.</div>`);
    }
    if (r.noAgreedPrice.length) {
      problems.push(`<div class="banner warn"><strong>${r.noAgreedPrice.length}</strong> line${
        r.noAgreedPrice.length > 1 ? 's have' : ' has'} no agreed price on file, so nothing was checked:
        ${r.noAgreedPrice.slice(0, 6).map((l) => esc(l.ingredient.name)).join(', ')}.</div>`);
    }
    if (r.skipped) {
      problems.push(`<div class="banner warn">${r.skipped} row${
        r.skipped > 1 ? 's were' : ' was'} skipped — no usable price could be read.</div>`);
    }

    return `
      <div class="section-title">Result</div>
      <div class="stat-grid">
        <div class="stat"><div class="stat-label">To claim</div>
          <div class="stat-value ${r.overchargedTotal > 0 ? 'bad' : 'good'}">${money(r.overchargedTotal)}</div>
          <div class="stat-note">${r.overcharged.length} line${r.overcharged.length === 1 ? '' : 's'} over</div></div>
        <div class="stat"><div class="stat-label">Lines checked</div>
          <div class="stat-value">${r.lines.length}</div>
          <div class="stat-note">${r.okCount} at the agreed price</div></div>
        <div class="stat"><div class="stat-label">Net variance</div>
          <div class="stat-value">${money(r.netVariance)}</div>
          <div class="stat-note">after undercharges</div></div>
        <div class="stat"><div class="stat-label">Not checked</div>
          <div class="stat-value ${r.unmatched.length + r.noAgreedPrice.length ? 'warn' : ''}">${
            r.unmatched.length + r.noAgreedPrice.length}</div>
          <div class="stat-note">unmatched or no agreed price</div></div>
      </div>

      ${problems.join('')}

      ${r.lines.length ? `<div class="table-wrap">
        <table>
          <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Agreed</th>
            <th class="num">Invoiced</th><th class="num">Per unit</th><th class="num">Line</th><th class="num"></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : '<div class="empty card">Nothing matched — check the supplier filter and the product codes.</div>'}

      ${r.overcharged.length ? `
        <div class="section-title">Price adjustment claim</div>
        <div class="card">
          <div class="field"><label for="claim-subject">Subject</label>
            <input id="claim-subject" readonly value="${esc(claimEmail(r).subject)}"></div>
          <div class="field"><label for="claim-body">Message</label>
            <textarea id="claim-body" rows="12" style="font-family:var(--mono);font-size:12.5px">${esc(claimEmail(r).body)}</textarea></div>
          <div class="row">
            <button class="btn primary" data-act="email-claim">Open in email</button>
            <button class="btn" data-act="copy-claim">Copy message</button>
          </div>
          <p class="field-hint" style="margin-top:8px">
            Edit the message before sending — it is yours, not an automatic send.
          </p>
        </div>` : ''}`;
  }

  function claimEmail(r) {
    return Suppliers.adjustmentEmail(r, {
      invoiceRef,
      business: Store.settings().business || '',
    });
  }

  function poClaimEmail(r) {
    return Suppliers.orderAdjustmentEmail(r, {
      invoiceRef,
      business: Store.settings().business || '',
    });
  }

  function runReconcile() {
    const text = $('#inv-text').value;
    if (!text.trim()) { toast('Paste the invoice lines first.'); return; }
    invoiceText = text;

    const order = invoiceOrderId ? Store.getOrder(invoiceOrderId) : null;
    if (order) {
      invoiceResult = Suppliers.matchInvoiceToOrder(text, order, Store.ctx());
      $('#inv-result').innerHTML = poResultHtml(invoiceResult);
      toast(invoiceResult.clean
        ? `Invoice matches ${order.ref}.`
        : `Discrepancies against ${order.ref}.`);
      return;
    }

    invoiceResult = Suppliers.reconcileInvoice(text, Store.ctx(), { supplier: invoiceSupplier });
    $('#inv-result').innerHTML = invoiceResultHtml(invoiceResult);
    const n = invoiceResult.overcharged.length;
    toast(n ? `${n} line${n > 1 ? 's' : ''} over the agreed price.` : 'Everything matches the agreed prices.');
  }

  // ================= STOCKTAKE =================

  let countDraft = null; // the stocktake being counted, edited in place

  const fmtBase = (qty, baseUnit) => {
    if (baseUnit === 'g') return `${(qty / 1000).toFixed(qty >= 100 ? 1 : 2)} kg`;
    if (baseUnit === 'ml') return `${(qty / 1000).toFixed(qty >= 100 ? 1 : 2)} L`;
    return `${Math.round(qty * 10) / 10} ea`;
  };

  function stocktakeCtx(st) {
    return { ingredients: Store.ingredients(), recipes: Store.recipesWithSales(st.venueId) };
  }

  function stocktakeReport(st) {
    // Closed stocktakes keep the report they were closed with, so later price
    // changes don't rewrite history. Open ones are computed live.
    return st.report || Stocktake.analyseStocktake(st, stocktakeCtx(st));
  }

  function renderStocktakeView() {
    const list = Store.stocktakes().slice()
      .sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || ''));

    const rows = list.map((st) => {
      const rep = stocktakeReport(st);
      const counted = (st.lines || []).filter((l) => l.countedQty != null).length;
      return `
        <tr class="clickable" data-stocktake="${esc(st.id)}">
          <td class="name-cell">${esc(st.periodStart || '')} → ${esc(st.periodEnd || '')}
            <span class="sub-note">${counted} of ${(st.lines || []).length} lines counted</span></td>
          <td>${esc(venueName(st.venueId))}</td>
          <td><span class="pill ${st.status === 'closed' ? 'good' : 'warn'}">${esc(st.status)}</span></td>
          <td class="num">${money(rep.closingValue)}</td>
          <td class="num">${st.status === 'closed'
            ? `<span class="pill ${rep.varianceValue > 0 ? 'bad' : 'good'}">${rep.varianceValue > 0 ? '+' : ''}${money(rep.varianceValue)}</span>`
            : '—'}</td>
          <td class="num">
            ${st.status === 'open' ? `<button class="btn small primary" data-act="count-stocktake" data-id="${esc(st.id)}">Count</button>` : ''}
            <button class="icon-btn" data-act="del-stocktake" data-id="${esc(st.id)}" title="Delete">✕</button></td>
        </tr>`;
    }).join('');

    view.innerHTML = `
      <div class="view-head">
        <div><h2>Stocktake</h2>
          <p>Count the shelf, then see what the menu can't explain — waste, over-portioning and shrinkage, valued per item.</p></div>
        <button class="btn primary" data-act="new-stocktake">New stocktake</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Period</th><th>Venue</th><th>Status</th>
            <th class="num">Closing stock</th><th class="num">Unexplained</th><th class="num"></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6" class="empty" style="padding:34px">
            No stocktakes yet. Opening balances carry over from the previous count, and purchases
            prefill from received orders — the first one is the only slow one.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function openNewStocktakeDialog() {
    const venues = Store.venues();
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 8)}01`;

    openModal('New stocktake',
      `<div class="field-row">
        <div class="field"><label for="stk-venue">Venue</label>
          <select id="stk-venue">${venues.map((v) =>
            `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('')}</select>
          <span class="field-hint">Stock is physical — one count per site.</span></div>
        <div class="field"><label for="stk-start">Period start</label>
          <input id="stk-start" type="date" value="${esc(monthStart)}"></div>
        <div class="field"><label for="stk-end">Period end (count date)</label>
          <input id="stk-end" type="date" value="${esc(today)}"></div>
      </div>
      <p class="field-hint">
        Opening balances come from this venue's last closed stocktake; purchases come from
        received orders dated inside the period. Both stay editable on the sheet.
      </p>`,
      `<button class="btn" data-close>Cancel</button>
       <button class="btn primary" data-act="create-stocktake">Start counting</button>`,
      () => {
        // Default the start to the day after the venue's last close.
        const wire = () => {
          const prev = Store.stocktakes()
            .filter((s) => s.venueId === $('#stk-venue').value && s.status === 'closed')
            .sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || ''))[0];
          if (prev && prev.periodEnd) {
            const d = new Date(prev.periodEnd + 'T00:00:00Z');
            d.setUTCDate(d.getUTCDate() + 1);
            $('#stk-start').value = d.toISOString().slice(0, 10);
          }
        };
        $('#stk-venue').addEventListener('change', wire);
        wire();
      });
  }

  function openCountSheet(id) {
    countDraft = Store.getStocktake(id);
    if (!countDraft) return;

    openModal(
      `Stocktake — ${venueName(countDraft.venueId)}, ${countDraft.periodStart} → ${countDraft.periodEnd}`,
      '<div id="count-sheet"></div>',
      `<span class="field-hint" id="count-progress"></span>
       <div class="spacer"></div>
       <button class="btn" data-act="save-count">Save & finish later</button>
       <button class="btn primary" data-act="close-stocktake">Close stocktake</button>`,
      () => renderCountSheet()
    );
    $('.modal-panel').classList.add('wide');
  }

  function renderCountSheet() {
    const st = countDraft;
    const ings = new Map(Store.ingredients().map((i) => [i.id, i]));

    // Group by storage location — the sheet should read in the order you walk.
    const groups = new Map();
    st.lines.forEach((l, idx) => {
      const ing = ings.get(l.ingredientId);
      if (!ing) return;
      const loc = (ing.location || 'Unassigned').trim() || 'Unassigned';
      if (!groups.has(loc)) groups.set(loc, []);
      groups.get(loc).push({ line: l, idx, ing });
    });

    const sections = [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([loc, rows]) => `
        <div class="section-title">${esc(loc)}</div>
        <div class="count-row count-head">
          <span>Item</span><span style="text-align:right">Opening</span>
          <span style="text-align:right">Purchased</span><span style="text-align:right">Counted</span>
          <span style="text-align:right">Value</span>
        </div>
        ${rows.map(({ line, idx, ing }) => {
          const offer = Costing.activeOffer(ing);
          const value = (Number(line.countedQty) || 0) * Number(offer.packPrice);
          return `
            <div class="count-row">
              <span class="item">${esc(ing.name)}
                <span class="sub-note">packs of ${esc(offer.packSize)} ${esc(Units.unitLabel(offer.packUnit))} · ${money(offer.packPrice)}</span></span>
              <input type="number" step="any" min="0" data-count="${idx}" data-f="openQty" value="${esc(line.openQty ?? 0)}">
              <input type="number" step="any" min="0" data-count="${idx}" data-f="purchasedQty" value="${esc(line.purchasedQty ?? 0)}">
              <input type="number" step="any" min="0" data-count="${idx}" data-f="countedQty"
                     value="${line.countedQty == null ? '' : esc(line.countedQty)}" placeholder="—">
              <span class="line-cost">${line.countedQty == null ? '—' : money(value)}</span>
            </div>`;
        }).join('')}`).join('');

    $('#count-sheet').innerHTML = `
      <p class="field-hint" style="margin:0 0 8px">
        Count in <strong>packs</strong> — decimals are fine (0.4 of a box). Leave a line blank if
        you didn't count it; closing treats blanks with movements as counted to zero, and warns first.
      </p>
      ${sections}`;

    updateCountProgress();

    $$('[data-count]', $('#count-sheet')).forEach((el) => {
      el.addEventListener('change', () => {
        const line = countDraft.lines[Number(el.dataset.count)];
        line[el.dataset.f] = el.value === '' ? (el.dataset.f === 'countedQty' ? null : 0) : Number(el.value);
        // Update just this row's value + the progress line; a full re-render
        // would steal focus mid-count.
        const row = el.closest('.count-row');
        const ing = Store.getIngredient(line.ingredientId);
        const offer = Costing.activeOffer(ing);
        row.querySelector('.line-cost').textContent =
          line.countedQty == null ? '—' : money((Number(line.countedQty) || 0) * Number(offer.packPrice));
        updateCountProgress();
      });
    });
  }

  function updateCountProgress() {
    const el = $('#count-progress');
    if (!el || !countDraft) return;
    const counted = countDraft.lines.filter((l) => l.countedQty != null).length;
    const value = countDraft.lines.reduce((sum, l) => {
      const ing = Store.getIngredient(l.ingredientId);
      if (!ing || l.countedQty == null) return sum;
      try { return sum + Number(l.countedQty) * Number(Costing.activeOffer(ing).packPrice); }
      catch (err) { return sum; }
    }, 0);
    el.textContent = `${counted} of ${countDraft.lines.length} counted · ${money(value)} on the shelf so far`;
  }

  function closeStocktake() {
    const st = countDraft;
    const rep = Stocktake.analyseStocktake(st, stocktakeCtx(st));
    if (rep.uncountedLines > 0) {
      const goOn = confirm(
        `${rep.uncountedLines} line${rep.uncountedLines > 1 ? 's have' : ' has'} stock movements but no count — `
        + 'closing treats them as counted to zero, which books ALL of that stock as used.\n\nClose anyway?');
      if (!goOn) return;
    }
    Store.upsertStocktake({ id: st.id, lines: st.lines, status: 'closed', report: rep });
    closeModal();
    toast('Stocktake closed.');
    openStocktakeReport(st.id);
    render();
  }

  function openStocktakeReport(id) {
    const st = Store.getStocktake(id);
    if (!st) return;
    const r = stocktakeReport(st);

    const banners = [];
    if (r.worst) {
      banners.push(`<div class="banner ${r.varianceValue > 0 ? 'bad' : 'warn'}">
        <strong>${money(Math.abs(r.varianceValue))}</strong> of stock movement the menu can't explain —
        ${pct(Math.abs(r.variancePct))} of theoretical usage.
        <strong>${esc(r.worst.name)}</strong> alone carries ${pct(r.worst.shareOfVariance, 0)} of it
        (${r.worst.varianceValue > 0 ? '+' : ''}${money(r.worst.varianceValue)}).</div>`);
    } else if (st.status === 'closed') {
      banners.push('<div class="banner warn" style="background:rgba(126,195,80,0.09);border-color:rgba(126,195,80,0.35);color:var(--good)">Stock movements match the menu — nothing unexplained.</div>');
    }
    if (r.uncountedLines) {
      banners.push(`<div class="banner warn">${r.uncountedLines} line${r.uncountedLines > 1 ? 's' : ''} had
        movements but no count and were treated as counted to zero — their variance may be a counting gap, not waste.</div>`);
    }
    if (r.countErrors) {
      banners.push(`<div class="banner bad">${r.countErrors} line${r.countErrors > 1 ? 's show' : ' shows'} more
        closing stock than opening + purchases can supply — recheck the count or a missed delivery.</div>`);
    }
    if (r.notCounted.length) {
      banners.push(`<div class="banner warn">The menu used ${r.notCounted.length} item${r.notCounted.length > 1 ? 's' : ''}
        this count never looked at (${money(r.notCounted.reduce((s, n) => s + n.theoValue, 0))} theoretical):
        ${r.notCounted.slice(0, 6).map((n) => esc(n.name)).join(', ')}${r.notCounted.length > 6 ? '…' : ''}.</div>`);
    }
    if (r.broken.length) {
      banners.push(`<div class="banner bad">${r.broken.length} line${r.broken.length > 1 ? 's' : ''} could not be
        valued: ${r.broken.map((b) => `${esc(b.name)} — ${esc(b.error)}`).join('; ')}</div>`);
    }

    const rows = r.lines.map((l) => {
      const pill = l.countError
        ? '<span class="pill bad">count error</span>'
        : l.uncounted
          ? '<span class="pill warn">no count</span>'
          : Math.abs(l.varianceValue) < 0.5
            ? '<span class="pill good">ok</span>'
            : l.varianceValue > 0
              ? '<span class="pill bad">waste</span>'
              : '<span class="pill warn">gain</span>';
      return `
        <tr>
          <td class="name-cell">${esc(l.name)}<span class="sub-note">${esc(l.location)}</span></td>
          <td class="num">${fmtBase(l.actualBase, l.baseUnit)}</td>
          <td class="num">${fmtBase(l.theoBase, l.baseUnit)}</td>
          <td class="num">${l.varianceBase > 0 ? '+' : ''}${fmtBase(l.varianceBase, l.baseUnit)}</td>
          <td class="num" style="color:${l.varianceValue > 0.5 ? 'var(--bad)' : l.varianceValue < -0.5 ? 'var(--warn)' : 'inherit'}">
            ${l.varianceValue > 0 ? '+' : ''}${money(l.varianceValue)}</td>
          <td class="num">${l.variancePct == null ? '—' : `${l.variancePct > 0 ? '+' : ''}${l.variancePct}%`}</td>
          <td class="num">${pill}</td>
        </tr>`;
    }).join('');

    openModal(
      `Stocktake report — ${venueName(st.venueId)}, ${st.periodStart} → ${st.periodEnd}`,
      `<div class="stat-grid">
        <div class="stat"><div class="stat-label">Unexplained</div>
          <div class="stat-value ${r.varianceValue > 0 ? 'bad' : 'good'}">${r.varianceValue > 0 ? '+' : ''}${money(r.varianceValue)}</div>
          <div class="stat-note">${pct(Math.abs(r.variancePct))} of theoretical usage</div></div>
        <div class="stat"><div class="stat-label">Actual COGS</div>
          <div class="stat-value">${money(r.actualCogs)}</div>
          <div class="stat-note">open + purchases − close</div></div>
        <div class="stat"><div class="stat-label">Theoretical COGS</div>
          <div class="stat-value">${money(r.theoCogs)}</div>
          <div class="stat-note">recipes × sales</div></div>
        <div class="stat"><div class="stat-label">Closing stock</div>
          <div class="stat-value">${money(r.closingValue)}</div>
          <div class="stat-note">on the shelf, at cost</div></div>
      </div>

      <p class="mvb-verdict" style="margin:0 0 12px">
        The menu says <strong>${pct(r.theoFoodCostPct)}</strong> food cost; the stockroom says
        <strong>${pct(r.actualFoodCostPct)}</strong>. The gap is the unexplained
        ${money(Math.abs(r.varianceValue))} above.
      </p>

      ${banners.join('')}

      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead><tr><th>Item</th><th class="num">Used</th><th class="num">Should have</th>
            <th class="num">Δ qty</th><th class="num">Δ $</th><th class="num">Δ %</th><th class="num"></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="field-hint" style="margin-top:10px">
        "Used" is opening + purchases − closing. "Should have" is what the recipes account for at this
        venue's sales, including declared yields and batch wastage — so the variance is only the loss
        nobody has planned for. Valued at current pack prices${st.report ? ', frozen when the stocktake was closed' : ''}.
      </p>`,
      `<button class="btn" data-close>Close</button>
       ${st.status === 'open' ? `<button class="btn primary" data-act="count-stocktake" data-id="${esc(st.id)}">Back to counting</button>` : ''}`,
      () => {}
    );
    $('.modal-panel').classList.add('wide');
  }

  // ================= DATA =================

  function renderData() {
    const s = Store.settings();
    view.innerHTML = `
      <div class="view-head"><div><h2>Data</h2>
        <p>Everything is stored in this browser. Export regularly — clearing site data wipes it.</p></div></div>

      <div class="section-title">Client &amp; venues</div>
      <div class="card">
        <div class="field" style="max-width:340px"><label for="cl-name">Client (group) name</label>
          <input id="cl-name" value="${esc(Store.activeClient().name)}"></div>
        <div class="section-title" style="margin-top:4px">Venues</div>
        ${Store.venues().map((v) => `
          <div class="line-row" style="grid-template-columns:minmax(180px,340px) auto">
            <input data-venue-name="${esc(v.id)}" value="${esc(v.name)}" aria-label="Venue name">
            <button class="icon-btn" data-act="del-venue" data-id="${esc(v.id)}" title="Remove venue">✕</button>
          </div>`).join('')}
        <button class="btn small" data-act="add-venue">+ Add venue</button>
        <p class="field-hint" style="margin:10px 0 0">
          Recipes, ingredients, suppliers and orders are shared across the whole group.
          Sales volumes are recorded per venue, so the dashboard can read group-wide or one site.
        </p>
      </div>

      <div class="section-title">Clients</div>
      <div class="card">
        <p class="field-hint" style="margin:0 0 10px">
          Each client is a separate business with its own library, menu, suppliers and orders.
          Switch clients from the selector in the header — ${Store.clients().length} on file.
        </p>
        <div class="row">
          <button class="btn" data-act="add-client-btn">New client</button>
          <button class="btn danger" data-act="del-client">Delete this client</button>
        </div>
      </div>

      <div class="section-title">Defaults for new recipes</div>
      <div class="card">
        <div class="field-row">
          <div class="field"><label for="s-tax">GST %</label>
            <input id="s-tax" type="number" step="any" min="0" value="${esc(s.taxRate)}"></div>
          <div class="field"><label for="s-target">Target GP %</label>
            <input id="s-target" type="number" step="any" min="0" max="99" value="${esc(s.targetGpPct)}"></div>
          <div class="field"><label for="s-business">Business name</label>
            <input id="s-business" value="${esc(s.business || '')}" placeholder="signs price-adjustment claims"></div>
        </div>
        <button class="btn primary" data-act="save-settings">Save defaults</button>
      </div>

      <div class="section-title">Backup</div>
      <div class="card">
        <p class="field-hint" style="margin:0 0 12px">
          ${esc(Store.activeClient().name)}: ${Store.ingredients().length} ingredients ·
          ${Store.recipes().length} recipes · ${Store.suppliers().length} suppliers ·
          ${Store.orders().length} orders. Export includes every client.
        </p>
        <div class="row">
          <button class="btn" data-act="export">Export JSON</button>
          <button class="btn" data-act="import">Import JSON…</button>
          <input type="file" id="import-file" accept="application/json,.json" hidden>
        </div>
      </div>

      <div class="section-title">Danger zone</div>
      <div class="card">
        <div class="row">
          <button class="btn" data-act="reset-sample">Reload sample data</button>
          <button class="btn danger" data-act="clear-all">Clear this client's data</button>
        </div>
        <p class="field-hint" style="margin:10px 0 0">Both replace what is currently stored. Export first.</p>
      </div>`;

    $('#cl-name').addEventListener('change', (e) => {
      Store.renameClient(Store.activeClient().id, e.target.value);
      renderClientSwitch();
      toast('Client renamed.');
    });
    $$('[data-venue-name]').forEach((el) => {
      el.addEventListener('change', () => {
        Store.upsertVenue({ id: el.dataset.venueName, name: el.value.trim() || 'Venue' });
        toast('Venue renamed.');
      });
    });
  }

  function doExport() {
    const blob = new Blob([Store.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roost-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Exported.');
  }

  function doImport(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        Store.importJson(String(reader.result));
        toast('Imported.');
        render();
      } catch (err) {
        toast(err.message);
      }
    };
    reader.readAsText(file);
  }

  // ================= routing & global actions =================

  function renderClientSwitch() {
    const sel = $('#client-select');
    if (!sel) return;
    const active = Store.activeClient();
    sel.innerHTML = Store.clients().map((c) =>
      `<option value="${esc(c.id)}"${c.id === active.id ? ' selected' : ''}>${esc(c.name)}</option>`
    ).join('') + '<option value="__new">＋ New client…</option>';
  }

  /** Per-client view state that must not leak between clients. */
  function resetClientState() {
    dashVenue = '';
    impactChanges = {};
    invoiceOrderId = null;
    invoiceResult = null;
    invoiceText = '';
    invoiceSupplier = '';
    recipeSearch = '';
    ingSearch = '';
  }

  function render() {
    renderClientSwitch();
    $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === currentView)));
    ({
      dashboard: renderDashboard,
      recipes: renderRecipes,
      ingredients: renderIngredients,
      suppliers: renderSuppliers,
      orders: renderOrders,
      invoices: renderInvoices,
      stocktake: renderStocktakeView,
      data: renderData,
    }[currentView] || renderDashboard)();
  }

  $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
    currentView = tab.dataset.view;
    location.hash = currentView;
    render();
  }));

  document.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const el = e.target.closest('[data-act]');

    if (act === 'new-recipe') return openRecipeEditor(null);
    if (act === 'new-ingredient') return openIngredientEditor(null);
    if (act === 'save-recipe') return saveRecipe();
    if (act === 'save-ingredient') return modalOnSave && modalOnSave();
    if (act === 'scale') return openScaleDialog();

    if (act === 'dup-recipe') {
      e.stopPropagation();
      const copy = Store.duplicateRecipe(el.dataset.id);
      toast(`Duplicated as “${copy.name}”.`);
      return render();
    }

    if (act === 'del-recipe') {
      e.stopPropagation();
      const r = Store.getRecipe(el.dataset.id);
      const used = Store.recipeUsage(r.id);
      const warning = used.length
        ? `\n\nIt is used as a sub-recipe in: ${used.join(', ')}. Those costings will break.`
        : '';
      if (confirm(`Delete “${r.name}”?${warning}`)) {
        Store.deleteRecipe(r.id);
        toast('Recipe deleted.');
        render();
      }
      return;
    }

    if (act === 'del-ingredient') {
      e.stopPropagation();
      const i = Store.getIngredient(el.dataset.id);
      const used = Store.ingredientUsage(i.id);
      const warning = used.length
        ? `\n\nIt is used in: ${used.join(', ')}. Those costings will break.`
        : '';
      if (confirm(`Delete “${i.name}”?${warning}`)) {
        Store.deleteIngredient(i.id);
        toast('Ingredient deleted.');
        render();
      }
      return;
    }

    if (act === 'clear-impact') { impactChanges = {}; return renderSuppliers(); }

    if (act === 'add-supplier') {
      const name = prompt('Supplier name');
      if (!name || !name.trim()) return;
      if (Store.supplierByName(name)) { toast('That supplier already exists.'); return; }
      Store.upsertSupplier({ name: name.trim(), email: '' });
      toast('Supplier added.');
      return renderSuppliers();
    }

    if (act === 'del-supplier') {
      const s = Store.suppliers().find((x) => x.id === el.dataset.id);
      const used = Store.supplierUsage(s.name);
      if (used.length) {
        alert(`"${s.name}" still supplies ${used.length} item${used.length > 1 ? 's' : ''}: `
          + `${used.slice(0, 8).join(', ')}${used.length > 8 ? '…' : ''}.\n\n`
          + 'Point those at another supplier first.');
        return;
      }
      if (confirm(`Remove ${s.name}?`)) {
        Store.deleteSupplier(s.id);
        toast('Supplier removed.');
        renderSuppliers();
      }
      return;
    }

    if (act === 'new-order') return openOrderEditor(null);
    if (act === 'save-order') return saveOrder();

    if (act === 'copy-order') {
      const mail = orderEmailFor(orderDraft);
      navigator.clipboard.writeText(`${mail.subject}\n\n${mail.body}`)
        .then(() => toast('Order copied.'))
        .catch(() => toast('Could not copy — check clipboard permissions.'));
      return;
    }

    if (act === 'email-order') {
      const supplier = Store.supplierByName(orderDraft.supplier);
      const to = supplier && supplier.email ? supplier.email : '';
      if (!to) toast(`No email on file for ${orderDraft.supplier} — add one under Suppliers.`);
      const mail = orderEmailFor(orderDraft);
      window.location.href = `mailto:${encodeURIComponent(to)}`
        + `?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
      return;
    }

    if (act === 'order-sent') {
      e.stopPropagation();
      Store.upsertOrder({ id: el.dataset.id, status: 'sent' });
      toast('Marked sent.');
      return render();
    }

    if (act === 'order-received') {
      e.stopPropagation();
      Store.upsertOrder({ id: el.dataset.id, status: 'received' });
      if (invoiceOrderId === el.dataset.id) { invoiceOrderId = null; invoiceResult = null; }
      toast('Order received.');
      return render();
    }

    if (act === 'match-order') {
      e.stopPropagation();
      invoiceOrderId = el.dataset.id;
      invoiceResult = null;
      currentView = 'invoices';
      location.hash = 'invoices';
      return render();
    }

    if (act === 'clear-order-match') {
      invoiceOrderId = null;
      invoiceResult = null;
      return renderInvoices();
    }

    if (act === 'del-order') {
      e.stopPropagation();
      const order = Store.getOrder(el.dataset.id);
      if (confirm(`Delete ${order.ref}?`)) {
        Store.deleteOrder(order.id);
        if (invoiceOrderId === order.id) { invoiceOrderId = null; invoiceResult = null; }
        toast('Order deleted.');
        render();
      }
      return;
    }

    if (act === 'add-venue') {
      const name = prompt('Venue name:');
      if (name && name.trim()) {
        Store.upsertVenue({ name: name.trim() });
        toast('Venue added.');
        render();
      }
      return;
    }

    if (act === 'del-venue') {
      const venue = Store.getVenue(el.dataset.id);
      try {
        if (confirm(`Remove ${venue.name}? Sales recorded against it are removed from every recipe.`)) {
          Store.deleteVenue(venue.id);
          toast('Venue removed.');
          render();
        }
      } catch (err) { toast(err.message); }
      return;
    }

    if (act === 'add-client-btn') {
      const name = prompt('Client name — the business or group this menu belongs to:');
      if (name && name.trim()) {
        Store.addClient(name.trim());
        resetClientState();
        toast(`Started ${name.trim()}.`);
        render();
      }
      return;
    }

    if (act === 'del-client') {
      const client = Store.activeClient();
      try {
        if (confirm(`Delete ${client.name} entirely — menu, library, suppliers and orders? This cannot be undone.`)) {
          Store.deleteClient(client.id);
          resetClientState();
          toast('Client deleted.');
          render();
        }
      } catch (err) { toast(err.message); }
      return;
    }

    if (act === 'new-stocktake') return openNewStocktakeDialog();

    if (act === 'create-stocktake') {
      const venueId = $('#stk-venue').value;
      const start = $('#stk-start').value;
      const end = $('#stk-end').value;
      if (!start || !end || end < start) { toast('Check the period dates.'); return; }
      const st = Store.createStocktake(venueId, start, end);
      closeModal();
      openCountSheet(st.id);
      return;
    }

    if (act === 'count-stocktake') {
      e.stopPropagation();
      closeModal();
      return openCountSheet(el.dataset.id);
    }

    if (act === 'save-count') {
      Store.upsertStocktake({ id: countDraft.id, lines: countDraft.lines });
      closeModal();
      toast('Counts saved.');
      return render();
    }

    if (act === 'close-stocktake') return closeStocktake();

    if (act === 'del-stocktake') {
      e.stopPropagation();
      const st = Store.getStocktake(el.dataset.id);
      if (confirm(`Delete the ${venueName(st.venueId)} stocktake for ${st.periodStart} → ${st.periodEnd}?`)) {
        Store.deleteStocktake(st.id);
        toast('Stocktake deleted.');
        render();
      }
      return;
    }

    if (act === 'reconcile') return runReconcile();
    if (act === 'load-invoice') return $('#invoice-file').click();
    if (act === 'clear-invoice') {
      invoiceText = ''; invoiceResult = null;
      return renderInvoices();
    }

    if (act === 'copy-claim') {
      const body = $('#claim-body').value;
      navigator.clipboard.writeText(body)
        .then(() => toast('Message copied.'))
        .catch(() => toast('Could not copy — select the text and copy manually.'));
      return;
    }

    if (act === 'email-claim') {
      const matchOrder = invoiceOrderId ? Store.getOrder(invoiceOrderId) : null;
      const supplier = Store.supplierByName(matchOrder ? matchOrder.supplier : invoiceSupplier)
        || Store.supplierByName(invoiceResult && invoiceResult.overcharged
          && invoiceResult.overcharged[0] && invoiceResult.overcharged[0].supplier);
      const to = supplier && supplier.email ? supplier.email : '';
      if (!to) toast('No email on file for that supplier — add one under Suppliers.');
      const url = `mailto:${encodeURIComponent(to)}`
        + `?subject=${encodeURIComponent($('#claim-subject').value)}`
        + `&body=${encodeURIComponent($('#claim-body').value)}`;
      window.location.href = url;
      return;
    }
    if (act === 'export') return doExport();
    if (act === 'import') return $('#import-file').click();

    if (act === 'save-settings') {
      Store.updateSettings({
        taxRate: Number($('#s-tax').value),
        targetGpPct: Number($('#s-target').value),
        business: $('#s-business').value.trim(),
      });
      toast('Defaults saved.');
      return;
    }

    if (act === 'reset-sample') {
      if (confirm('Replace ALL clients with the sample data?')) {
        Store.resetToSample();
        toast('Sample data loaded.');
        render();
      }
      return;
    }

    if (act === 'clear-all') {
      if (confirm(`Clear every ingredient, recipe, supplier and order for ${Store.activeClient().name}? Other clients are untouched. This cannot be undone.`)) {
        Store.clearAll();
        resetClientState();
        toast('Client data cleared.');
        render();
      }
      return;
    }

    // Row clicks open the editor, but not when a row button was the target.
    const stRow = e.target.closest('[data-stocktake]');
    if (stRow && !e.target.closest('button')) {
      const st = Store.getStocktake(stRow.dataset.stocktake);
      return st.status === 'closed' ? openStocktakeReport(st.id) : openCountSheet(st.id);
    }
    const orderRow = e.target.closest('[data-order]');
    if (orderRow && !e.target.closest('button')) return openOrderEditor(orderRow.dataset.order);
    const recipeRow = e.target.closest('[data-recipe]');
    if (recipeRow && !e.target.closest('button')) return openRecipeEditor(recipeRow.dataset.recipe);
    const ingRow = e.target.closest('[data-ingredient]');
    if (ingRow && !e.target.closest('button')) return openIngredientEditor(ingRow.dataset.ingredient);
  });

  $('#client-select').addEventListener('change', (e) => {
    if (e.target.value === '__new') {
      const name = prompt('Client name — the business or group this menu belongs to:');
      if (name && name.trim()) {
        Store.addClient(name.trim());
        resetClientState();
        toast(`Started ${name.trim()}. It begins empty — add ingredients or import a backup.`);
      }
      render(); // also resets the select if the prompt was cancelled
      return;
    }
    Store.setActiveClient(e.target.value);
    resetClientState();
    render();
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'import-file' && e.target.files[0]) doImport(e.target.files[0]);
    if (e.target.id === 'invoice-file' && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        invoiceText = String(reader.result);
        $('#inv-text').value = invoiceText;
        runReconcile();
      };
      reader.readAsText(e.target.files[0]);
    }
  });

  const hash = location.hash.replace('#', '');
  if (['dashboard', 'recipes', 'ingredients', 'suppliers', 'orders', 'invoices', 'stocktake', 'data'].includes(hash)) currentView = hash;
  render();
})();
