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
  check('editor shows all recipe lines', (await page.locator('.line-row').count()) === 8);
  check('no line errors on the sample recipe', (await page.locator('.line-error').count()) === 0);

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
  await shot(page, '03-ingredients.png');

  await page.click('tr[data-ingredient="ing-wholebird"]');
  await page.waitForSelector('#i-preview');
  const preview = await page.locator('#i-preview .v').allTextContents();
  check('ingredient preview shows raw and yielded cost', preview.length === 3, preview.join(' | '));
  const raw = parseFloat(preview[0].replace('$', ''));
  const yielded = parseFloat(preview[1].replace('$', ''));
  check('yielded cost exceeds raw cost at 68% yield', yielded > raw, `${raw} vs ${yielded}`);

  await page.fill('#i-yield', '50');
  await page.waitForTimeout(150);
  const yielded50 = parseFloat((await page.locator('#i-preview .v').nth(1).textContent()).replace('$', ''));
  check('dropping yield raises the yielded cost', yielded50 > yielded, `${yielded} -> ${yielded50}`);
  await page.click('.modal-head [data-close]');

  // ---- price impact ----
  await page.click('.tab[data-view="impact"]');
  await page.waitForSelector('[data-change]');
  await page.fill('#ch-ing-breast', '15');
  await page.press('#ch-ing-breast', 'Tab');
  await page.waitForTimeout(250);
  check('price rise reports affected dishes', (await page.locator('tbody tr').count()) >= 2);
  const gpStats = await page.locator('.stat-value').allTextContents();
  check('impact shows before/after GP', gpStats.length === 4, gpStats.join(' | '));
  check('GP after is lower than before', parseFloat(gpStats[1]) < parseFloat(gpStats[0]),
    `${gpStats[0]} -> ${gpStats[1]}`);
  await shot(page, '04-price-impact.png');

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
