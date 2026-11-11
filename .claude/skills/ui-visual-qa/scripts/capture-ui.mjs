#!/usr/bin/env node
// PriceHunt visual QA capture + measurement.
// Run from client/ (so @playwright/test and @axe-core/playwright resolve from client/node_modules):
//   node ../.claude/skills/ui-visual-qa/scripts/capture-ui.mjs --out ../docs/ui-qa/T2.4 --screens search,history
// Options: --base http://localhost:4200  --viewports phone,tablet,desktop  --screens search,history  --paths /some/route
// Exit code 1 if any automated check fails. Selectors rely on the data-testids listed in SPEC §11.1.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const tryRequire = name => { try { return require(name); } catch { return null; } };

const pw = tryRequire('@playwright/test');
const axeMod = tryRequire('@axe-core/playwright');
const AxeBuilder = axeMod ? (axeMod.default ?? axeMod.AxeBuilder ?? axeMod) : null;

// ---------- args ----------
const argv = process.argv.slice(2);
if (argv.includes('--help')) {
  console.log('Usage (from client/): node ../.claude/skills/ui-visual-qa/scripts/capture-ui.mjs --out ../docs/ui-qa/<task> ' +
    '[--screens search,history] [--viewports phone,tablet,desktop] [--paths /some/route] [--base http://localhost:4200]');
  console.log(`@playwright/test: ${pw ? 'OK' : 'MISSING'} · @axe-core/playwright: ${AxeBuilder ? 'OK' : 'MISSING'}`);
  process.exit(pw ? 0 : 1);
}
if (!pw) { console.error('[ui-qa] @playwright/test not found — run from client/ after installing it.'); process.exit(1); }
if (!AxeBuilder) console.warn('[ui-qa] @axe-core/playwright not installed — accessibility check skipped.');
const { chromium } = pw;

const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const list = v => v.split(',').map(s => s.trim()).filter(Boolean);
const BASE = arg('base', 'http://localhost:4200');
const OUT = path.resolve(arg('out', '../docs/ui-qa/latest'));
const SCREENS = list(arg('screens', 'search,history'));
const EXTRA_PATHS = list(arg('paths', ''));
const ALL_VIEWPORTS = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
};
const VIEWPORTS = list(arg('viewports', 'phone,tablet,desktop'));
fs.mkdirSync(OUT, { recursive: true });

const report = { base: BASE, createdAt: new Date().toISOString(), runs: {}, failures: [] };
const fail = (vp, msg) => report.failures.push(`[${vp}] ${msg}`);

// ---------- helpers ----------
const usDate = d => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
const daysFromNow = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const slug = p => p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-') || 'root';

async function shot(page, vp, name, run) {
  const file = `${vp}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  run.screenshots.push(file);
}

async function checkOverflow(page, vp, where) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) fail(vp, `${where}: horizontal overflow of ${over}px`);
}

async function runAxe(page, vp, where, run) {
  if (!AxeBuilder) return;
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const bad = res.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  run.axe[where] = bad.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
  for (const v of bad) fail(vp, `${where}: axe ${v.impact} "${v.id}" on ${v.nodes.length} node(s) — ${v.help}`);
}

async function pickLocation(page, testId, typed, optionLabel) {
  const input = page.getByTestId(testId);
  await input.click();
  await input.fill(typed);
  await page.getByRole('option', { name: new RegExp(optionLabel) }).first().click();
}

async function fillSearchForm(page) {
  await pickLocation(page, 'from-input', 'Shanghai', 'Shanghai, CN');
  await pickLocation(page, 'to-input', 'Los Angeles', 'Los Angeles, US');
  await page.getByTestId('date-start').fill(usDate(daysFromNow(7)));
  await page.getByTestId('date-end').fill(usDate(daysFromNow(14)));
  await page.getByTestId('date-end').press('Tab');
}

// Records every animation frame: card supplier, price and page-Y position, in DOM order.
async function startFrameRecorder(page) {
  await page.evaluate(() => {
    window.__phFrames = [];
    window.__phStop = false;
    const t0 = performance.now();
    const tick = () => {
      const cards = [...document.querySelectorAll('[data-testid="result-card"]')].map(el => {
        const r = el.getBoundingClientRect();
        return { s: el.dataset.supplier, p: Number(el.dataset.price), y: r.top + window.scrollY, h: r.height };
      });
      window.__phFrames.push({ t: performance.now() - t0, cards });
      if (!window.__phStop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function analyseFrames(frames, vp, run) {
  let sortViolations = 0, jumps = 0, flickers = 0, countDrops = 0;
  for (let i = 0; i < frames.length; i++) {
    const { cards } = frames[i];
    for (let k = 1; k < cards.length; k++) if (cards[k].p < cards[k - 1].p) { sortViolations++; break; }
    if (i === 0) continue;
    const prev = frames[i - 1];
    if (cards.length < prev.cards.length) countDrops++;
    const now = new Map(cards.map(c => [c.s, c]));
    for (const c of prev.cards) {
      const n = now.get(c.s);
      if (!n) { flickers++; continue; }
      const dy = Math.abs(n.y - c.y);
      if (frames[i].t - prev.t <= 40 && c.h > 0 && dy > 0.75 * c.h) jumps++;
    }
  }
  run.motion = { frames: frames.length, sortViolations, jumps, flickers, countDrops };
  if (frames.length < 30) fail(vp, `search: only ${frames.length} animation frames recorded — recorder or page problem`);
  if (sortViolations) fail(vp, `search: list out of price order in ${sortViolations} frame(s)`);
  if (jumps) fail(vp, `search: ${jumps} card jump(s) — a card moved >75% of its height in one frame (FLIP not applied before paint?)`);
  if (flickers) fail(vp, `search: ${flickers} flicker(s) — a card vanished for a frame during the search`);
  if (countDrops) fail(vp, `search: card count decreased ${countDrops} time(s) during the search`);
}

// ---------- screens ----------
async function qaSearch(page, vp, run) {
  await page.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
  await shot(page, vp, 'search-idle', run);
  await checkOverflow(page, vp, 'search-idle');

  await fillSearchForm(page);
  // Let the form settle before the shot: change detection renders on the next frame and floating labels /
  // the Search button's enabled state animate for ~200 ms. Shooting earlier captures half-floated labels.
  await page.waitForFunction(() => !document.querySelector('[data-testid="search-btn"]')?.disabled, null, { timeout: 5_000 })
    .catch(() => fail(vp, 'search: Search button still disabled after filling a valid form'));
  await page.waitForTimeout(400);
  await shot(page, vp, 'search-filled', run);

  await startFrameRecorder(page);
  const t0 = Date.now();
  await page.getByTestId('search-btn').click();
  await page.waitForTimeout(1500);
  await shot(page, vp, 'search-running', run);

  const badge = page.getByTestId('final-badge');
  try {
    await badge.waitFor({ state: 'visible', timeout: 10_000 });
    run.finalBadge = (await badge.innerText()).trim();
    run.searchMs = Date.now() - t0;
  } catch {
    fail(vp, 'search: no final-badge within 10 s');
  }
  await page.waitForTimeout(400); // let the last FLIP finish
  const frames = await page.evaluate(() => { window.__phStop = true; return window.__phFrames; });
  analyseFrames(frames, vp, run);

  await shot(page, vp, 'search-finished', run);
  await checkOverflow(page, vp, 'search-finished');
  await runAxe(page, vp, 'search-finished', run);
}

async function qaHistory(page, vp, run) {
  const histResponse = page.waitForResponse(r => r.url().includes('/api/history'), { timeout: 10_000 }).catch(() => null);
  await page.goto(`${BASE}/history`, { waitUntil: 'networkidle' });
  await histResponse;
  const content = page.locator('[data-testid="history-table"], [data-testid="history-card"]').first();
  try { await content.waitFor({ state: 'visible', timeout: 10_000 }); }
  catch { fail(vp, 'history: neither history-table nor history-card became visible'); }
  await shot(page, vp, 'history-default', run);
  await checkOverflow(page, vp, 'history-default');
  await runAxe(page, vp, 'history-default', run);

  if (vp !== 'phone') {
    const priceHeader = page.getByRole('columnheader', { name: /price/i }).first();
    if (await priceHeader.count()) {
      const resp = page.waitForResponse(r => r.url().includes('sortBy=price'), { timeout: 10_000 }).catch(() => null);
      await priceHeader.click();
      await resp;
      await page.waitForTimeout(300);
      await shot(page, vp, 'history-sorted-price', run);
    } else {
      fail(vp, 'history: no Price column header found');
    }
  } else {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await shot(page, vp, 'history-bottom', run);
  }
}

async function qaExtraPath(page, vp, run, p) {
  await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
  await shot(page, vp, `page-${slug(p)}`, run);
  await checkOverflow(page, vp, p);
}

// ---------- main ----------
const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    const cfg = ALL_VIEWPORTS[vp];
    if (!cfg) { fail(vp, 'unknown viewport'); continue; }
    const { width, height, ...rest } = cfg;
    const context = await browser.newContext({ viewport: { width, height }, ...rest, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const run = { screenshots: [], console: [], axe: {} };
    report.runs[vp] = run;
    page.on('console', m => { if (m.type() === 'error') { run.console.push(m.text()); fail(vp, `console error: ${m.text()}`); } });
    page.on('pageerror', e => { run.console.push(String(e)); fail(vp, `page error: ${e}`); });

    for (const step of [
      ...EXTRA_PATHS.map(p => ['path ' + p, () => qaExtraPath(page, vp, run, p)]),
      ...(SCREENS.includes('search') ? [['search', () => qaSearch(page, vp, run)]] : []),
      ...(SCREENS.includes('history') ? [['history', () => qaHistory(page, vp, run)]] : []),
    ]) {
      try { await step[1](); }
      catch (e) {
        fail(vp, `${step[0]}: script error: ${e.message.split('\n')[0]}`);
        await page.screenshot({ path: path.join(OUT, `${vp}-${slug(step[0])}-error.png`), fullPage: true }).catch(() => {});
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

// ---------- report ----------
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
const lines = [
  `# UI QA report`, ``,
  `- Base: ${BASE}`, `- Created: ${report.createdAt}`,
  `- Automated checks: **${report.failures.length ? 'FAIL' : 'PASS'}**`, ``,
  `## Automated results`,
];
for (const [vp, run] of Object.entries(report.runs)) {
  lines.push(``, `### ${vp}`);
  if (run.finalBadge) lines.push(`- Final badge: "${run.finalBadge}" after ${run.searchMs} ms`);
  if (run.motion) lines.push(`- Motion: ${JSON.stringify(run.motion)}`);
  lines.push(`- Console errors: ${run.console.length}`);
  for (const [where, v] of Object.entries(run.axe)) lines.push(`- Axe ${where}: ${v.length} serious/critical`);
  lines.push(`- Screenshots: ${run.screenshots.map(s => `\`${s}\``).join(', ')}`);
}
lines.push(``, `## Failures`, ...(report.failures.length ? report.failures.map(f => `- ${f}`) : ['- none']));
lines.push(``, `## Rubric verdict`, ``, `_Agent: view every screenshot, fill the table from references/design-rubric.md, list issues, then PASS/FAIL._`, ``);
fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n'));

console.log(`[ui-qa] ${report.failures.length ? 'FAIL' : 'PASS'} — ${report.failures.length} failure(s). Report: ${path.join(OUT, 'report.md')}`);
for (const f of report.failures) console.log(`  - ${f}`);
process.exit(report.failures.length ? 1 : 0);
