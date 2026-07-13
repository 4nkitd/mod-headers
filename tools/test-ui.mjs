// Visual smoke test for the side panel UI.
// Mocks chrome.* APIs and drives the sidepanel.html via Playwright.
//
// Usage: NODE_PATH=/opt/homebrew/lib/node_modules node tools/test-ui.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const shotsDir = resolve(root, 'tools/shots');
mkdirSync(shotsDir, { recursive: true });

// 1. Spin up a static server
const port = 8765;
const server = spawn('python3', ['-m', 'http.server', String(port)], {
  cwd: root,
  stdio: 'pipe'
});
process.on('exit', () => server.kill());
await sleep(500);

// 2. Mock chrome.* in the page before any script runs
const initScript = `
  (() => {
    const _data = {};
    const _listeners = [];
    window.chrome = {
      storage: {
        local: {
          async get(keys) {
            const list = Array.isArray(keys) ? keys
              : typeof keys === 'string' ? [keys]
              : keys && typeof keys === 'object' ? Object.keys(keys)
              : Object.keys(_data);
            const out = {};
            for (const k of list) if (k in _data) out[k] = JSON.parse(JSON.stringify(_data[k]));
            return out;
          },
          async set(items) {
            const changes = {};
            for (const [k, v] of Object.entries(items)) {
              changes[k] = { oldValue: _data[k], newValue: v };
              _data[k] = JSON.parse(JSON.stringify(v));
            }
            _listeners.slice().forEach(l => l(changes, 'local'));
          },
          async clear() {
            for (const k of Object.keys(_data)) delete _data[k];
          }
        },
        onChanged: {
          addListener(fn) { _listeners.push(fn); },
          removeListener(fn) {
            const i = _listeners.indexOf(fn);
            if (i >= 0) _listeners.splice(i, 1);
          }
        }
      }
    };
  })();
`;

// 3. Launch + drive
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 420, height: 900 },
  colorScheme: 'dark',
  deviceScaleFactor: 2
});
await context.addInitScript(initScript);

const page = await context.newPage();
const url = `http://localhost:${port}/src/sidepanel/sidepanel.html`;

const fail = (msg) => { console.error('❌', msg); process.exitCode = 1; };
const ok = (msg) => console.log('✓', msg);

async function snap(name) {
  await page.screenshot({ path: resolve(shotsDir, `${name}.png`), fullPage: false });
  console.log(`  📸 ${name}.png`);
}

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('#app');
await sleep(400); // allow fonts

// ---------- empty state ----------
{
  const emptyVisible = await page.isVisible('#emptyState');
  const listVisible = await page.isVisible('#ruleList');
  if (emptyVisible && !listVisible) ok('empty state shows when no rules');
  else fail(`empty state visibility wrong: empty=${emptyVisible} list=${listVisible}`);
  await snap('01-empty');
}

// ---------- create a rule via UI ----------
await page.click('#emptyAddBtn');
await page.waitForSelector('#ruleName');
await page.fill('#ruleName', 'inject auth on api');
await page.fill('#rulePattern', '*://api.example.com/*');
await page.click('[data-add-header="request"]');
await page.fill('.header-row .header-name', 'X-Auth-Token');
await page.fill('.header-row .header-value', 'eyJhbGciOiJIUzI1NiJ9.test');
await snap('02-edit-with-preview');
await page.click('#saveBtn');
await page.waitForSelector('#ruleList .rule-card');
await sleep(150);

{
  const cards = await page.$$('#ruleList .rule-card');
  const emptyVisible = await page.isVisible('#emptyState');
  if (cards.length === 1) ok('one rule card present after save');
  else fail(`expected 1 card, got ${cards.length}`);
  if (!emptyVisible) ok('empty state hidden when rules exist (FIX VERIFIED)');
  else fail('empty state still visible alongside rule — bug NOT fixed');
  await snap('03-list-one-rule');
}

// ---------- menu open / close ----------
await page.click('#menuBtn');
await sleep(150);
{
  const open = await page.isVisible('#menuPopover');
  if (open) ok('menu opens on trigger click');
  else fail('menu did not open');
  await snap('04-menu-open');
}

// click outside the menu — should close
await page.mouse.click(60, 600); // click somewhere safely outside
await sleep(150);
{
  const open = await page.isVisible('#menuPopover');
  if (!open) ok('menu closes on outside click (FIX VERIFIED)');
  else fail('menu still open after outside click — bug NOT fixed');
  await snap('05-menu-closed');
}

// re-open + Escape
await page.click('#menuBtn');
await sleep(120);
await page.keyboard.press('Escape');
await sleep(120);
{
  const open = await page.isVisible('#menuPopover');
  if (!open) ok('menu closes on Escape');
  else fail('menu did not close on Escape');
}

// re-open + click on trigger — should close
await page.click('#menuBtn');
await sleep(120);
await page.click('#menuBtn');
await sleep(120);
{
  const open = await page.isVisible('#menuPopover');
  if (!open) ok('menu toggles closed on second trigger click');
  else fail('menu did not toggle closed');
}

// ---------- master toggle status text ----------
{
  await page.click('#masterToggle');
  await sleep(100);
  const txt = (await page.textContent('#statusPill')) || '';
  if (txt.toLowerCase().includes('paused')) ok(`status reflects paused: "${txt.trim()}"`);
  else fail(`status text wrong when paused: "${txt.trim()}"`);
  await page.click('#masterToggle'); // restore
  await sleep(100);
}

// ---------- toggle rule off ----------
{
  await page.click('.rule-card .rule-toggle + .track');
  await sleep(120);
  const txt = (await page.textContent('#statusPill')) || '';
  if (txt.toLowerCase().includes('off') || txt.includes('0/')) ok(`status reflects all-off: "${txt.trim()}"`);
  else fail(`status wrong when rule disabled: "${txt.trim()}"`);
  await snap('06-rule-disabled');
}

// ---------- search padding visual ----------
await page.click('.rule-card .rule-toggle + .track'); // re-enable
await sleep(80);
await page.fill('#search', 'api');
await sleep(120);
await snap('07-search-active');

await browser.close();
server.kill();

if (process.exitCode) console.error('\n--- FAILED ---');
else console.log('\n--- ALL CHECKS PASSED ---');
