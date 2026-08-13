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
    const ctx = Store.ctx();
    const a = Costing.analyseMenu(ctx.recipes, ctx);

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
        <div><h2>Dashboard</h2><p>Menu performance across every costed dish. Figures are ex-GST.</p></div>
        <button class="btn primary" data-act="new-recipe">New recipe</button>
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
          sellPrice: 0, taxRate: s.taxRate, targetGpPct: s.targetGpPct, unitsSold: 0, method: '',
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
        <div class="field">
          <label for="f-sold">Units sold (period)</label>
          <input id="f-sold" type="number" step="1" min="0" data-f="unitsSold" value="${esc(draft.unitsSold || 0)}">
        </div>`}
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
    const sold = Number(recipe.unitsSold || 0);
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
        const numeric = ['portions', 'batchYieldQty', 'wastagePct', 'sellPrice', 'taxRate', 'targetGpPct', 'unitsSold'];
        draft[f] = numeric.includes(f) ? Number(el.value) : el.value;
        if (f === 'type') draft.onMenu = el.value !== 'sub';
        // Text fields would lose the caret on a full re-render; only structural
        // and numeric changes need the costing panel redrawn.
        if (f === 'name' || f === 'method') return;
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
        || (i.supplier || '').toLowerCase().includes(term)
        || (i.productCode || '').toLowerCase().includes(term))
      .slice().sort((a, b) => a.name.localeCompare(b.name));

    const rows = list.map((i) => {
      let costCell = '<span style="color:var(--bad)">—</span>';
      let perUnit = '';
      try {
        const y = Costing.yieldedUnitCost(i);
        // Show the rate in the unit people buy in, not raw base units.
        const dim = Units.dimensionOf(i.packUnit);
        const showUnit = dim === 'mass' ? 'kg' : dim === 'volume' ? 'l' : 'ea';
        const perShow = y.cost * Units.toBase(1, showUnit).qty;
        costCell = money(perShow, 3);
        perUnit = `per ${Units.unitLabel(showUnit)}`;
      } catch (err) {
        perUnit = err.message;
      }
      const yieldPct = i.yieldPct == null ? 100 : i.yieldPct;
      return `
        <tr class="clickable" data-ingredient="${esc(i.id)}">
          <td class="name-cell">${esc(i.name)}
            ${i.isFinishedProduct ? '<span class="tag product">finished product</span>' : ''}
            <span class="sub-note">${esc(i.supplier || 'No supplier')}${
              i.productCode ? ` · ${esc(i.productCode)}` : ''}${i.category ? ` · ${esc(i.category)}` : ''}</span></td>
          <td class="num">${esc(i.packSize)} ${esc(Units.unitLabel(i.packUnit))}</td>
          <td class="num">${money(i.packPrice)}</td>
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

  function openIngredientEditor(id) {
    const ing = id ? structuredClone(Store.getIngredient(id)) : {
      id: null, name: '', category: '', supplier: '', packSize: 1, packUnit: 'kg', packPrice: 0, yieldPct: 100,
    };
    if (!ing) return;

    openModal(
      id ? 'Edit ingredient' : 'New ingredient',
      `<div class="field">
         <label for="i-name">Name</label>
         <input id="i-name" value="${esc(ing.name)}" placeholder="e.g. Chicken breast fillet">
       </div>
       <div class="field-row">
         <div class="field"><label for="i-supplier">Supplier</label>
           <input id="i-supplier" value="${esc(ing.supplier || '')}"></div>
         <div class="field"><label for="i-code">Supplier product code</label>
           <input id="i-code" value="${esc(ing.productCode || '')}" placeholder="optional"></div>
         <div class="field"><label for="i-category">Category</label>
           <input id="i-category" value="${esc(ing.category || '')}"></div>
       </div>
       <label class="checkline">
         <input type="checkbox" id="i-finished" ${ing.isFinishedProduct ? 'checked' : ''}>
         Finished product — bought in ready to serve or cook
       </label>
       <p class="field-hint" style="margin:-8px 0 14px">
         Costs exactly like any other ingredient. Marking it lets the app offer it
         as a bought-in alternative to something you make yourself.
       </p>
       <div class="field-row">
         <div class="field"><label for="i-packsize">Pack size</label>
           <input id="i-packsize" type="number" step="any" min="0" value="${esc(ing.packSize)}"></div>
         <div class="field"><label for="i-packunit">Pack unit</label>
           <select id="i-packunit">${unitOptions(Units.normaliseUnit(ing.packUnit))}</select></div>
         <div class="field"><label for="i-packprice">Pack price</label>
           <input id="i-packprice" type="number" step="0.01" min="0" value="${esc(ing.packPrice)}"></div>
       </div>
       <div class="field-row">
         <div class="field"><label for="i-yield">Yield %</label>
           <input id="i-yield" type="number" step="any" min="1" max="100" value="${esc(ing.yieldPct == null ? 100 : ing.yieldPct)}">
           <span class="field-hint">Usable portion after trim, peel or bone-out.</span></div>
         <div class="field"><label for="i-density">Density g/ml</label>
           <input id="i-density" type="number" step="any" min="0" value="${esc(ing.density || '')}" placeholder="optional">
           <span class="field-hint">Only needed to cost this by weight when bought by volume, or the reverse.</span></div>
       </div>
       <div id="i-preview" class="summary-grid"></div>`,
      `<button class="btn" data-close>Cancel</button>
       <button class="btn primary" data-act="save-ingredient">Save ingredient</button>`,
      (body) => {
        const read = () => ({
          ...ing,
          name: $('#i-name').value.trim(),
          supplier: $('#i-supplier').value.trim(),
          productCode: $('#i-code').value.trim(),
          category: $('#i-category').value.trim(),
          isFinishedProduct: $('#i-finished').checked,
          packSize: Number($('#i-packsize').value),
          packUnit: $('#i-packunit').value,
          packPrice: Number($('#i-packprice').value),
          yieldPct: Number($('#i-yield').value),
          density: $('#i-density').value ? Number($('#i-density').value) : undefined,
        });

        const preview = () => {
          const data = read();
          try {
            const raw = Costing.unitCost(data);
            const yielded = Costing.yieldedUnitCost(data);
            const dim = Units.dimensionOf(data.packUnit);
            const showUnit = dim === 'mass' ? 'kg' : dim === 'volume' ? 'l' : 'ea';
            const factor = Units.toBase(1, showUnit).qty;
            $('#i-preview').innerHTML = `
              <div class="summary-cell"><div class="k">Cost per ${Units.unitLabel(showUnit)}</div>
                <div class="v">${money(raw.cost * factor, 3)}</div></div>
              <div class="summary-cell"><div class="k">Yielded per ${Units.unitLabel(showUnit)}</div>
                <div class="v">${money(yielded.cost * factor, 3)}</div></div>
              <div class="summary-cell"><div class="k">Lost to trim</div>
                <div class="v">${pct(100 - (data.yieldPct || 100), 0)}</div></div>`;
          } catch (err) {
            $('#i-preview').innerHTML = `<div class="banner bad" style="margin:0">${esc(err.message)}</div>`;
          }
        };

        $$('input, select', body).forEach((el) =>
          el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', preview));
        preview();

        modalOnSave = () => {
          const data = read();
          if (!data.name) { toast('Give the ingredient a name.'); return; }
          if (!(data.packSize > 0)) { toast('Pack size must be greater than zero.'); return; }
          if (!(data.yieldPct > 0 && data.yieldPct <= 100)) { toast('Yield must be between 1 and 100%.'); return; }
          Store.upsertIngredient(data.id ? data : { ...data, id: undefined });
          closeModal();
          toast('Ingredient saved.');
          render();
        };
      }
    );
  }

  // ================= PRICE IMPACT =================

  let impactChanges = {};

  function renderImpact() {
    const ctx = Store.ctx();
    const result = Costing.priceImpact(impactChanges, ctx);
    const changed = Object.keys(impactChanges).filter((k) => Number(impactChanges[k]) !== 0);

    const inputs = ctx.ingredients
      .slice().sort((a, b) => a.name.localeCompare(b.name))
      .map((i) => `
        <div class="line-row" style="grid-template-columns:1fr 110px">
          <label for="ch-${esc(i.id)}" style="font-size:14px">${esc(i.name)}
            <span class="sub-note">${esc(i.supplier || '')} · ${money(i.packPrice)} / ${esc(i.packSize)}${esc(Units.unitLabel(i.packUnit))}</span></label>
          <input id="ch-${esc(i.id)}" type="number" step="any" data-change="${esc(i.id)}"
                 value="${esc(impactChanges[i.id] ?? '')}" placeholder="0%">
        </div>`).join('');

    const rows = result.affected.map((a) => `
      <tr>
        <td class="name-cell">${esc(a.name)}</td>
        <td class="num">${money(a.costBefore)}</td>
        <td class="num">${money(a.costAfter)}</td>
        <td class="num" style="color:${a.costDelta > 0 ? 'var(--bad)' : 'var(--good)'}">${a.costDelta > 0 ? '+' : ''}${money(a.costDelta)}</td>
        <td class="num">${pct(a.gpBefore)}</td>
        <td class="num">${pct(a.gpAfter)}</td>
        <td class="num">${a.brokeTarget ? '<span class="pill bad">breaks target</span>' : ''}</td>
      </tr>`).join('');

    view.innerHTML = `
      <div class="view-head">
        <div><h2>Price impact</h2><p>Put a supplier increase through the whole menu before it lands on your invoice.</p></div>
        <button class="btn" data-act="clear-impact">Clear</button>
      </div>

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
        </div>` : `<div class="banner warn">Enter a percentage against any ingredient below — for example 12 for a 12% rise, or -5 for a drop.</div>`}

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
        </div>
      </div>`;

    $$('[data-change]').forEach((el) => {
      el.addEventListener('change', () => {
        const id = el.dataset.change;
        const val = el.value.trim();
        if (val === '' || Number(val) === 0) delete impactChanges[id];
        else impactChanges[id] = Number(val);
        renderImpact();
      });
    });
  }

  // ================= DATA =================

  function renderData() {
    const s = Store.settings();
    view.innerHTML = `
      <div class="view-head"><div><h2>Data</h2>
        <p>Everything is stored in this browser. Export regularly — clearing site data wipes it.</p></div></div>

      <div class="section-title">Defaults for new recipes</div>
      <div class="card">
        <div class="field-row">
          <div class="field"><label for="s-tax">GST %</label>
            <input id="s-tax" type="number" step="any" min="0" value="${esc(s.taxRate)}"></div>
          <div class="field"><label for="s-target">Target GP %</label>
            <input id="s-target" type="number" step="any" min="0" max="99" value="${esc(s.targetGpPct)}"></div>
        </div>
        <button class="btn primary" data-act="save-settings">Save defaults</button>
      </div>

      <div class="section-title">Backup</div>
      <div class="card">
        <p class="field-hint" style="margin:0 0 12px">
          ${Store.ingredients().length} ingredients · ${Store.recipes().length} recipes
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
          <button class="btn danger" data-act="clear-all">Delete everything</button>
        </div>
        <p class="field-hint" style="margin:10px 0 0">Both replace what is currently stored. Export first.</p>
      </div>`;
  }

  function doExport() {
    const blob = new Blob([Store.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `costimator-${new Date().toISOString().slice(0, 10)}.json`;
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

  function render() {
    $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === currentView)));
    ({
      dashboard: renderDashboard,
      recipes: renderRecipes,
      ingredients: renderIngredients,
      impact: renderImpact,
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

    if (act === 'clear-impact') { impactChanges = {}; return renderImpact(); }
    if (act === 'export') return doExport();
    if (act === 'import') return $('#import-file').click();

    if (act === 'save-settings') {
      Store.updateSettings({
        taxRate: Number($('#s-tax').value),
        targetGpPct: Number($('#s-target').value),
      });
      toast('Defaults saved.');
      return;
    }

    if (act === 'reset-sample') {
      if (confirm('Replace everything with the sample data?')) {
        Store.resetToSample();
        toast('Sample data loaded.');
        render();
      }
      return;
    }

    if (act === 'clear-all') {
      if (confirm('Delete every ingredient and recipe? This cannot be undone.')) {
        Store.clearAll();
        toast('All data cleared.');
        render();
      }
      return;
    }

    // Row clicks open the editor, but not when a row button was the target.
    const recipeRow = e.target.closest('[data-recipe]');
    if (recipeRow && !e.target.closest('button')) return openRecipeEditor(recipeRow.dataset.recipe);
    const ingRow = e.target.closest('[data-ingredient]');
    if (ingRow && !e.target.closest('button')) return openIngredientEditor(ingRow.dataset.ingredient);
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'import-file' && e.target.files[0]) doImport(e.target.files[0]);
  });

  const hash = location.hash.replace('#', '');
  if (['dashboard', 'recipes', 'ingredients', 'impact', 'data'].includes(hash)) currentView = hash;
  render();
})();
