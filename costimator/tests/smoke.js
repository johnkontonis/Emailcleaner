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
