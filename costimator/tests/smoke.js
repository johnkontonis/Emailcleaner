// Browser smoke test — drives the real UI the way a user would.
//
//   npm run test:browser
//
// Serves the app on a local port, opens it in Chromium, and walks every screen.
// Set CHROMIUM_PATH if Playwright's bundled browser is not the one you want:
//   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:browser

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8765);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOT_DIR || null;

const TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

let failures = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? '  ok   ' : '  FAIL '} ${name}${cond ? '' : ` — ${detail}`}`);
  if (!cond) failures++;
};
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
};

(async () => {
  const server = await serve();
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // ---- dashboard ----
  await page.waitForSelector('.stat-value');
  check('dashboard renders a weighted GP', /%$/.test((await page.textContent('.stat-value')).trim()));
  check('dashboard lists menu items', (await page.locator('tbody tr').count()) >= 5);
  check('menu engineering shows four quadrants', (await page.locator('.quadrant').count()) === 4);
  check('sample menu costs with no errors',
    (await page.locator('tbody .sub-note').count()) === 0,
    await page.locator('tbody .sub-note').first().textContent().catch(() => ''));
  check('the client switcher shows the sample group',
    (await page.locator('#client-select').inputValue()) === 'cli-sample');

  const revAll = await page.locator('.stat-value').nth(1).textContent();
  await page.selectOption('#dash-venue', 'ven-flem');
  await page.waitForTimeout(250);
  const revFlem = await page.locator('.stat-value').nth(1).textContent();
  check('the venue filter narrows revenue to one site',
    parseFloat(revFlem.replace(/[$,]/g, '')) < parseFloat(revAll.replace(/[$,]/g, '')),
    `${revAll} -> ${revFlem}`);
  await shot(page, '11-dashboard-venue.png');
  await page.selectOption('#dash-venue', '');
  await page.waitForTimeout(250);
  await shot(page, '01-dashboard.png');

  // ---- recipes ----
  await page.click('.tab[data-view="recipes"]');
  await page.waitForSelector('#recipe-search');
  check('recipes list populated', (await page.locator('tbody tr').count()) >= 6);

  await page.fill('#recipe-search', 'parm');
  await page.waitForTimeout(150);
  check('search filters the list', (await page.locator('tbody tr').count()) === 1);
  check('search keeps focus while typing',
    (await page.evaluate(() => document.activeElement.id)) === 'recipe-search');
  await page.fill('#recipe-search', '');
  await page.waitForTimeout(150);

  // ---- recipe editor (parma uses a sub-recipe) ----
  await page.click('tr[data-recipe="rec-parma"]');
  await page.waitForSelector('#editor');
  check('editor loads the recipe', (await page.inputValue('#f-name')) === 'Chicken parmigiana');
  check('editor shows all recipe lines', (await page.locator('.line-row').count()) === 6,
    `${await page.locator('.line-row').count()} lines`);
  check('no line errors on the sample recipe', (await page.locator('.line-error').count()) === 0);
  check('sales are recorded per venue',
    (await page.locator('[data-vsales]').count()) === 2,
    `${await page.locator('[data-vsales]').count()} inputs`);

  // ---- bought-in alternative / make-or-buy ----
  check('the schnitzel line offers a bought-in alternative',
    (await page.locator('.alt-row').count()) === 1);
  check('make-or-buy panel is shown', (await page.locator('.mvb').count()) === 1);

  const mvbValues = await page.locator('.mvb-side .v').allTextContents();
  check('make-or-buy shows both figures', mvbValues.length === 2, mvbValues.join(' | '));
  check('make and buy differ', mvbValues[0] !== mvbValues[1], mvbValues.join(' | '));
  check('make-or-buy counts the whole plate, not just the swapped item',
    parseFloat(mvbValues[0].replace('$', '')) > 4, mvbValues[0]);

  const costMade = await page.locator('.summary-cell .v').nth(1).textContent();
  check('starts costed on the in-house build',
    (await page.locator('.mvb-side.active .k').textContent()) === 'Make in-house');

  await page.click('[data-act="use-buy"]');
  await page.waitForTimeout(200);
  const costBought = await page.locator('.summary-cell .v').nth(1).textContent();
  check('switching to buy changes the portion cost', costMade !== costBought,
    `${costMade} -> ${costBought}`);
  check('the active side follows the toggle',
    (await page.locator('.mvb-side.active .k').textContent()) === 'Buy in finished');
  check('the comparison itself does not move when the source changes',
    (await page.locator('.mvb-side .v').allTextContents()).join('|') === mvbValues.join('|'));
  await shot(page, '05-make-or-buy.png');

  await page.click('[data-act="use-make"]');
  await page.waitForTimeout(200);
  check('switching back restores the original cost',
    (await page.locator('.summary-cell .v').nth(1).textContent()) === costMade);

  const summary = await page.locator('.summary-cell .v').allTextContents();
  check('costing panel shows figures', summary.length === 6 && summary[1].startsWith('$'), summary.join(' | '));
  await shot(page, '02-recipe-editor.png');

  const gpBefore = await page.locator('.summary-cell .v').nth(3).textContent();
  await page.fill('#f-sell', '45');
  await page.waitForTimeout(200);
  const gpAfter = await page.locator('.summary-cell .v').nth(3).textContent();
  check('raising the sell price raises GP%', parseFloat(gpAfter) > parseFloat(gpBefore),
    `${gpBefore} -> ${gpAfter}`);

  const lineCount = await page.locator('.line-row').count();
  await page.click('[data-act="add-line"]');
  await page.waitForTimeout(150);
  check('add line adds exactly one', (await page.locator('.line-row').count()) === lineCount + 1,
    `${lineCount} -> ${await page.locator('.line-row').count()}`);

  await page.locator('[data-act="del-line"]').last().click();
  await page.waitForTimeout(150);
  check('delete line works', (await page.locator('.line-row').count()) === lineCount);

  page.once('dialog', (d) => d.accept('4'));
  await page.click('[data-act="scale"]');
  await page.waitForTimeout(250);
  check('scaling updates portions', (await page.inputValue('#f-portions')) === '4');
  await page.click('.modal-head [data-close]');
  await page.waitForTimeout(150);

  // ---- ingredients ----
  await page.click('.tab[data-view="ingredients"]');
  await page.waitForSelector('#ing-search');
  check('ingredient library populated', (await page.locator('tbody tr').count()) >= 15);
  check('low-yield items are flagged', (await page.locator('.pill.warn').count()) >= 3);
  check('finished products are tagged', (await page.locator('.tag.product').count()) === 3,
    `${await page.locator('.tag.product').count()} tagged`);

  await page.fill('#ing-search', 'GT-SCH');
  await page.waitForTimeout(150);
  check('ingredients are searchable by supplier product code',
    (await page.locator('tbody tr').count()) === 1,
    `${await page.locator('tbody tr').count()} rows`);
  await page.fill('#ing-search', '');
  await page.waitForTimeout(150);
  await shot(page, '03-ingredients.png');

  // ---- ingredient editor: competing supplier offers ----
  await page.click('tr[data-ingredient="ing-gt-schnitzel"]');
  await page.waitForSelector('#ing-editor');
  check('both supplier prices are shown', (await page.locator('.offer').count()) === 2,
    `${await page.locator('.offer').count()} offers`);
  check('the offer being bought is marked', (await page.locator('.offer.active').count()) === 1);

  const cmpRows = await page.locator('#ing-editor table tbody tr').count();
  check('the comparison lists both suppliers', cmpRows === 2, `${cmpRows} rows`);

  const bestTags = await page.locator('#ing-editor tbody .pill.good').count();
  check('a best-price flag is shown on each measure', bestTags === 2, `${bestTags} flags`);

  const warn = await page.locator('#ing-editor .banner.warn').first().textContent();
  check('differing piece sizes are called out',
    warn.includes('cheaper per piece') && warn.includes('cheaper per kilo'), warn.trim().slice(0, 90));

  // ---- what a switch is worth, weighted by sales ----
  await page.click('[data-act="switch-preview"]');
  await page.waitForSelector('#switch-preview .stat-value');
  const switchStats = await page.locator('#switch-preview .stat-value').allTextContents();
  check('the switch shows a saving across volumes', switchStats[0].includes('$'), switchStats.join(' | '));
  check('the new piece size is shown', switchStats[2].includes('250'), switchStats[2]);

  const verdict = await page.locator('#switch-preview .mvb-verdict').textContent();
  check('a saving that shrinks the piece is not sold as a free win',
    verdict.includes('visible cut'), verdict.trim().slice(0, 120));

  check('each dish is placed on the menu by volume',
    (await page.locator('#switch-preview tbody .sub-note').first().textContent()).includes('by volume'));
  check('the dish carrying the change is tagged',
    (await page.locator('#switch-preview .tag.seller').count()) >= 1);
  const exposure = await page.locator('#switch-preview .banner').first().textContent();
  check('concentration of the saving is called out',
    exposure.includes('of the change lands on'), exposure.trim().slice(0, 100));
  check('and it names the trade-off being made',
    exposure.includes('piece on that dish to save'), exposure.trim().slice(0, 160));
  await shot(page, '06-supplier-switch.png');

  // Yield still drives the rate.
  const rateBefore = await page.locator('.offer .offer-rates b').first().textContent();
  await page.fill('#i-yield', '50');
  await page.waitForTimeout(200);
  const rateAfter = await page.locator('.offer .offer-rates b').first().textContent();
  check('dropping the yield raises the offer rate',
    parseFloat(rateAfter.replace('$', '')) > parseFloat(rateBefore.replace('$', '')),
    `${rateBefore} -> ${rateAfter}`);
  await page.click('.modal-head [data-close]');
  await page.waitForTimeout(150);

  // ---- price impact (now under Suppliers) ----
  await page.click('.tab[data-view="suppliers"]');
  await page.waitForSelector('[data-change]');
  await page.fill('#ch-ing-breast', '15');
  await page.press('#ch-ing-breast', 'Tab');
  await page.waitForTimeout(250);
  check('the supplier list is shown', (await page.locator('tbody tr').count()) >= 4);
  check('price rise reports affected dishes',
    (await page.locator('.impact-layout tbody tr').count()) >= 2,
    `${await page.locator('.impact-layout tbody tr').count()} rows`);
  const gpStats = await page.locator('.stat-value').allTextContents();
  check('impact shows before/after GP', gpStats.length === 4, gpStats.join(' | '));
  check('GP after is lower than before', parseFloat(gpStats[1]) < parseFloat(gpStats[0]),
    `${gpStats[0]} -> ${gpStats[1]}`);
  await shot(page, '04-price-impact.png');

  // ---- invoice reconciliation ----
  await page.click('.tab[data-view="invoices"]');
  await page.waitForSelector('#inv-text');
  await page.selectOption('#inv-supplier', 'G&T Chickens');
  await page.fill('#inv-ref', 'INV-12345');
  await page.fill('#inv-text',
    'Product Code,Description,Qty,Unit Price\nGT-SCH-300,Crumbed chicken schnitzel,4,99.50\nGT-TEN-5K,Crumbed chicken tenders,2,41.00');
  await page.click('[data-act="reconcile"]');
  await page.waitForSelector('#inv-result .stat-value');

  const invStats = await page.locator('#inv-result .stat-value').allTextContents();
  check('the overcharge is totalled', invStats[0] === '$14.00', invStats.join(' | '));
  check('both lines were checked', invStats[1] === '2', invStats.join(' | '));

  const statuses = await page.locator('#inv-result tbody .pill').allTextContents();
  check('one line is over and one is ok',
    statuses.includes('over') && statuses.includes('ok'), statuses.join(', '));

  const subject = await page.inputValue('#claim-subject');
  check('the claim names the invoice and amount',
    subject.includes('INV-12345') && subject.includes('14.00'), subject);
  const claimBody = await page.inputValue('#claim-body');
  check('the claim itemises the line', claimBody.includes('GT-SCH-300'));
  check('the claim states both prices',
    claimBody.includes('96.00') && claimBody.includes('99.50'));
  await shot(page, '07-invoice.png');

  // A clean invoice must raise nothing.
  await page.fill('#inv-text', 'Product Code,Qty,Unit Price\nGT-SCH-300,4,96.00');
  await page.click('[data-act="reconcile"]');
  await page.waitForTimeout(300);
  check('an invoice at the agreed price raises no claim',
    (await page.locator('#claim-subject').count()) === 0);

  // An unknown code must be reported, not silently dropped.
  await page.fill('#inv-text', 'Product Code,Qty,Unit Price\nZZ-NOPE,1,10.00');
  await page.click('[data-act="reconcile"]');
  await page.waitForTimeout(300);
  check('an unrecognised line is reported',
    (await page.locator('#inv-result .banner.warn').first().textContent()).includes('could not be matched'));

  // ---- purchase orders ----
  await page.click('.tab[data-view="orders"]');
  await page.waitForSelector('tr[data-order]');
  check('the sample PO is listed', (await page.locator('tr[data-order]').count()) === 1);
  check('the PO totals at the agreed prices',
    (await page.locator('tr[data-order] td').nth(4).textContent()).includes('554.00'),
    await page.locator('tr[data-order] td').nth(4).textContent());

  await page.click('[data-act="match-order"]');
  await page.waitForSelector('#inv-text');
  check('matching mode names the PO',
    (await page.locator('.banner').first().textContent()).includes('PO-0001'));

  // Schnitzel priced over the PO, tenders one pack short, kiev clean.
  await page.fill('#inv-ref', 'INV-7401');
  await page.fill('#inv-text',
    'Product Code,Qty,Unit Price\nGT-SCH-300,4,99.50\nGT-TEN-5K,1,41.00\nGT-KIE-200,1,88.00');
  await page.click('[data-act="reconcile"]');
  await page.waitForSelector('#inv-result .stat-value');
  const poStats = await page.locator('#inv-result .stat-value').allTextContents();
  check('the price credit is against the PO price', poStats[0] === '$14.00', poStats.join(' | '));
  check('the short-supplied line is counted', poStats[2] === '1', poStats.join(' | '));

  const poSubject = await page.inputValue('#claim-subject');
  check('the claim names PO and invoice',
    poSubject.includes('PO-0001') && poSubject.includes('INV-7401'), poSubject);
  const poBody = await page.inputValue('#claim-body');
  check('the claim asks about the short line, not claims it',
    poBody.includes('below the ordered quantity'));
  await shot(page, '10-po-match.png');

  // A correct invoice matches clean and can close the order.
  await page.fill('#inv-text',
    'Product Code,Qty,Unit Price\nGT-SCH-300,4,96.00\nGT-TEN-5K,2,41.00\nGT-KIE-200,1,88.00');
  await page.click('[data-act="reconcile"]');
  await page.waitForTimeout(300);
  check('a clean invoice offers to receive the order',
    (await page.locator('[data-act="order-received"]').count()) >= 1);
  await page.click('[data-act="order-received"]');
  await page.waitForTimeout(300);
  await page.click('.tab[data-view="orders"]');
  await page.waitForSelector('tr[data-order]');
  check('the received order shows its status',
    (await page.locator('tr[data-order] .pill').first().textContent()) === 'received');

  // Raise a fresh order — lines price themselves from the agreed price.
  await page.click('[data-act="new-order"]');
  await page.waitForSelector('#order-editor');
  await page.click('[data-act="add-oline"]');
  await page.waitForTimeout(200);
  check('a new order line is priced from the agreed price',
    (await page.locator('#order-editor .line-cost').first().textContent()).includes('$'));
  await page.click('[data-act="save-order"]');
  await page.waitForTimeout(300);
  check('the new order takes the next PO number',
    (await page.locator('tr[data-order]').count()) === 2);
  await shot(page, '12-orders.png');

  // ---- clients are isolated ----
  page.once('dialog', (d) => d.accept('Crafty Chooks'));
  await page.selectOption('#client-select', '__new');
  await page.waitForTimeout(400);
  await page.click('.tab[data-view="ingredients"]');
  await page.waitForTimeout(250);
  check('a new client starts with an empty library',
    (await page.locator('tr[data-ingredient]').count()) === 0,
    `${await page.locator('tr[data-ingredient]').count()} rows`);

  await page.selectOption('#client-select', 'cli-sample');
  await page.waitForTimeout(300);
  await page.click('.tab[data-view="ingredients"]');
  await page.waitForTimeout(250);
  check('switching back restores the group library',
    (await page.locator('tr[data-ingredient]').count()) >= 20,
    `${await page.locator('tr[data-ingredient]').count()} rows`);

  // ---- stocktake ----
  await page.click('.tab[data-view="stocktake"]');
  await page.waitForSelector('tr[data-stocktake]');
  check('the sample stocktake is listed', (await page.locator('tr[data-stocktake]').count()) === 1);
  check('the closed stocktake shows its unexplained variance',
    (await page.locator('tr[data-stocktake] .pill.bad').textContent()).includes('$235.70'),
    await page.locator('tr[data-stocktake] .pill.bad').textContent());

  // Open the report from the row.
  await page.click('tr[data-stocktake]');
  await page.waitForSelector('.modal-panel.wide');
  const stStats = await page.locator('.modal-body .stat-value').allTextContents();
  check('the report leads with the unexplained figure', stStats[0] === '+$235.70', stStats.join(' | '));
  check('actual and theoretical COGS are both shown',
    stStats[1] === '$4717.29' && stStats[2] === '$4481.60', stStats.join(' | '));
  const verdictLine = await page.locator('.modal-body .mvb-verdict').textContent();
  check('food cost is stated both ways',
    verdictLine.includes('21.1%') && verdictLine.includes('22.2%'), verdictLine.trim().slice(0, 120));
  check('the worst offender is named',
    (await page.locator('.modal-body .banner').first().textContent()).includes('Chicken breast fillet'));
  const pills = await page.locator('.modal-body tbody .pill').allTextContents();
  check('waste and clean lines are told apart',
    pills.includes('waste') && pills.includes('ok'), pills.slice(0, 8).join(','));
  await shot(page, '13-stocktake-report.png');
  await page.click('.modal-head [data-close]');
  await page.waitForTimeout(150);

  // New stocktake: opening carries from July's close, purchases from the
  // received PO (the order was marked received earlier in this test).
  await page.click('[data-act="new-stocktake"]');
  await page.waitForSelector('#stk-venue');
  check('the period start follows the last close',
    (await page.inputValue('#stk-start')) === '2026-08-01',
    await page.inputValue('#stk-start'));
  await page.click('[data-act="create-stocktake"]');
  await page.waitForSelector('#count-sheet');
  check('the count sheet groups by storage location',
    (await page.locator('#count-sheet .section-title').allTextContents()).includes('Freezer'));

  const schnRow = page.locator('.count-row', { hasText: 'Crumbed chicken schnitzel' }).first();
  check('opening prefills from the previous close',
    (await schnRow.locator('[data-f="openQty"]').inputValue()) === '1.7',
    await schnRow.locator('[data-f="openQty"]').inputValue());
  check('purchases prefill from the received order',
    (await schnRow.locator('[data-f="purchasedQty"]').inputValue()) === '4',
    await schnRow.locator('[data-f="purchasedQty"]').inputValue());

  await schnRow.locator('[data-f="countedQty"]').fill('2.5');
  await schnRow.locator('[data-f="countedQty"]').blur();
  await page.waitForTimeout(150);
  check('counting values the line at the pack price',
    (await schnRow.locator('.line-cost').textContent()).includes('240.00'),
    await schnRow.locator('.line-cost').textContent());
  check('progress tracks the count',
    (await page.locator('#count-progress').textContent()).includes('1 of'),
    await page.locator('#count-progress').textContent());
  await shot(page, '14-count-sheet.png');

  // Closing with uncounted movement lines warns first; accept it.
  page.once('dialog', (d) => d.accept());
  await page.click('[data-act="close-stocktake"]');
  await page.waitForSelector('.modal-panel.wide .stat-value');
  check('closing produces the report', (await page.locator('.modal-body .stat-value').count()) === 4);
  await page.click('.modal-head [data-close]');
  await page.waitForTimeout(200);
  check('the closed stocktake joins the list',
    (await page.locator('tr[data-stocktake]').count()) === 2);

  // ---- persistence ----
  await page.click('.tab[data-view="recipes"]');
  await page.waitForSelector('#recipe-search');
  await page.click('[data-act="new-recipe"]');
  await page.waitForSelector('#f-name');
  await page.fill('#f-name', 'Smoke test dish');
  await page.fill('#f-sell', '19.5');
  await page.click('[data-act="save-recipe"]');
  await page.waitForTimeout(250);

  await page.reload({ waitUntil: 'networkidle' });
  await page.click('.tab[data-view="recipes"]');
  await page.waitForSelector('#recipe-search');
  check('new recipe survives a reload', (await page.locator('text=Smoke test dish').count()) > 0);

  // ---- export ----
  await page.click('.tab[data-view="data"]');
  await page.waitForSelector('[data-act="export"]');
  const pending = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('[data-act="export"]');
  const download = await pending;
  check('export produces a file', !!download, 'no download event');
  if (download) {
    check('export filename is dated',
      /costimator-\d{4}-\d{2}-\d{2}\.json/.test(download.suggestedFilename()),
      download.suggestedFilename());
  }

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 4).join(' ~ '));

  await browser.close();
  server.close();
  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
