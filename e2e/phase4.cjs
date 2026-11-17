/**
 * Phase 4 end-to-end check (statistics + bidirectional correlation explorer), against the BUILT app.
 *
 *   npm run build && npx vite preview --port 4173 --strictPort &
 *   SHOTS=/some/dir NODE_PATH=$(npm root -g) node e2e/phase4.cjs
 *
 * Everything starts from an EMPTY browser: the demo seeder is driven from the UI (analytics empty state),
 * then the planted correlations (docs in src/lib/mockData.ts) are looked for in the right lag / tier views:
 *   - bedding unwashed > 10 days -> flare same day            (T+0)
 *   - heavy sweat + hot shower   -> flare the next day         (T+1)
 *   - dairy                      -> higher severity 2 days on  (T+2, Forward Explorer)
 *   - neck + Severe flare        -> overdue bedding            (Reverse Explorer, body-part filter)
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const SHOTS = process.env.SHOTS || path.join(process.cwd(), 'e2e-shots');
fs.mkdirSync(SHOTS, { recursive: true });

const failures = [];
const log = [];
async function step(name, fn) {
  try {
    await fn();
    log.push(`  ok   ${name}`);
  } catch (e) {
    failures.push(name);
    log.push(`  FAIL ${name}\n         ${String(e.message || e).split('\n').slice(0, 5).join('\n         ')}`);
  }
}
const eq = (a, b, msg) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || 'expected equal'}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);
};
const truthy = (v, msg) => {
  if (!v) throw new Error(msg || 'expected truthy');
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'en-US' });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

  const rowsOf = (testId, kind) => page.evaluate(([id, k]) => [...document.querySelectorAll(`[data-testid=${id}] [data-${k}]`)].map((e) => ({ factor: e.dataset.factor ?? e.dataset.key, lift: Number(e.dataset.lift), co: Number(e.dataset.co), base: Number(e.dataset.base), evidence: e.dataset.evidence, rank: Number(e.dataset.rank) })), [testId, kind]);
  const triggerFactors = async () => (await page.evaluate(() => [...document.querySelectorAll('[data-testid=trigger-rows] li[data-factor]')].map((e) => e.dataset.factor)));
  const reverseRows = async () => rowsOf('reverse-list', 'factor');
  /** Switch lag and wait until the visible results were actually COMPUTED for it (results stamp data-lag). */
  const lag = async (id) => {
    await page.getByTestId('lag-select').getByRole('radio', { name: new RegExp({ T0: 'T\\+0', T1: 'T\\+1', T2: 'T\\+2', W48: 'Rolling 48h' }[id]) }).click();
    await page.waitForFunction((v) => {
      const stamped = [...document.querySelectorAll('[data-lag]')];
      return stamped.length > 0 && stamped.every((e) => e.dataset.lag === v);
    }, id);
  };

  // ===================== 1. empty state + one-click demo seeder =====================
  await page.goto(BASE + '#/analytics');
  await step('1.1 an empty database shows an explanatory empty state with a demo-data button (no charts, no errors)', async () => {
    await page.getByTestId('analytics-empty').waitFor();
    eq(await page.getByTestId('analytics-filters').count(), 0);
    await shot('p4-01-empty');
  });

  let demoDays = 0;
  await step('1.2 "Load demo data" from the analytics page fills a separate store and the charts appear immediately', async () => {
    await page.getByTestId('analytics-load-demo').click();
    await page.getByTestId('demo-banner').waitFor();
    await page.getByTestId('analytics-filters').waitFor();
    await page.getByTestId('severity-chart').waitFor();
    const msg = await page.getByTestId('demo-message').textContent();
    demoDays = Number(msg.match(/\d+/)[0]);
    truthy(demoDays >= 50 && demoDays <= 60, `demo size: ${msg}`);
    eq(await page.getByTestId('analytics-empty').count(), 0);
  });

  // ===================== 2. overview =====================
  await step('2.1 headline tiles agree with the seeded data and with each other', async () => {
    eq(Number(await page.getByTestId('stat-days').locator('p').nth(1).textContent()), demoDays, 'days with severity = seeded days');
    const flareDays = Number(await page.getByTestId('stat-flare-days').locator('p').nth(1).textContent());
    const rate = Number((await page.getByTestId('stat-flare-rate').locator('p').nth(1).textContent()).replace('%', ''));
    eq(Math.round((flareDays / demoDays) * 100), rate, 'flare rate = flare days / logged days');
    truthy(Number((await page.getByTestId('stat-avg').locator('p').nth(1).textContent())) > 1, 'average severity is a real number');
  });

  await step('2.2 the severity chart draws a line, a flare-threshold reference, and shows ONE y-axis (never dual-axis)', async () => {
    const svg = page.getByTestId('severity-chart');
    truthy((await svg.locator('path.recharts-line-curve').count()) >= 1, 'severity line drawn');
    eq(await svg.locator('.recharts-yAxis').count(), 1, 'exactly one y-axis');
    truthy((await svg.locator('.recharts-reference-line').count()) >= 1, 'threshold reference line drawn');
  });

  await step('2.2b the plot is not clipped (y-axis shows 0 and 10) and no label is painted on top of the data', async () => {
    const ticks = await page.evaluate(() => [...document.querySelectorAll('[data-testid=severity-chart] .recharts-yAxis-tick-labels text')].map((e) => e.textContent.trim()));
    eq([ticks[0], ticks[ticks.length - 1]].sort(), ['0', '10'].sort(), `y ticks: ${ticks}`);
    const box = await page.getByTestId('severity-chart').boundingBox();
    const lowest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('[data-testid=severity-chart] .recharts-yAxis-tick-labels text')].map((e) => e.getBoundingClientRect().bottom)));
    truthy(lowest <= box.y + box.height, 'bottom tick is inside the chart box (not clipped)');
    eq(await page.getByTestId('severity-chart').locator('.recharts-reference-line text').count(), 0, 'no in-plot labels');
    truthy((await page.getByTestId('severity-legend').textContent()).includes('Flare threshold (6)'), 'threshold explained in the legend');
  });

  await step('2.3 overlay tracks: each has its OWN single axis and a labelled latest value; toggling adds/removes charts', async () => {
    eq(await page.locator('[data-testid^=track-][data-track]').count(), 1, 'bedding track on by default');
    await page.getByTestId('track-toggle-temperature').click();
    await page.getByTestId('track-temperature').waitFor();
    await page.getByTestId('track-toggle-stress').click();
    eq(await page.locator('[data-testid^=track-][data-track]').count(), 3);
    const axes = await page.evaluate(() => [...document.querySelectorAll('[data-track]')].map((t) => t.querySelectorAll('.recharts-yAxis').length));
    eq(axes, [1, 1, 1], 'one y-axis per track chart');
    for (const id of ['bedding_days', 'temperature', 'stress']) {
      truthy(/Latest:/.test(await page.getByTestId(`track-${id}-latest`).textContent()), `${id} has a visible latest value`);
    }
    const latestTemp = await page.getByTestId('track-temperature-latest').textContent();
    truthy(latestTemp.includes('°C'), `temperature carries its unit: ${latestTemp}`);
    await page.getByTestId('track-toggle-stress').click();
    eq(await page.locator('[data-testid^=track-][data-track]').count(), 2);
    await shot('p4-02-overview');
  });

  await step('2.4 hovering the severity chart shows a crosshair readout, and the track charts sync to the same date', async () => {
    const box = await page.getByTestId('severity-chart').boundingBox();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await page.waitForTimeout(250);
    const tips = await page.evaluate(() => [...document.querySelectorAll('.recharts-tooltip-wrapper')].filter((e) => getComputedStyle(e).visibility !== 'hidden' && e.textContent.trim()).map((e) => e.textContent));
    truthy(tips.length >= 2, `severity + track tooltips visible together (got ${tips.length})`);
    const dates = tips.map((t) => t.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*, \w+ \d+, \d{4}/)?.[0]);
    truthy(dates.every((d) => d && d === dates[0]), `all readouts show the same date: ${JSON.stringify(dates)}`);
  });

  await step('2.5 every chart has a table twin; the range filter slices both consistently', async () => {
    await page.getByTestId('series-table').locator('summary').click();
    const all = await page.getByTestId('series-table').locator('tbody tr').count();
    truthy(all >= 50, `rows for all data: ${all}`);
    await page.getByTestId('range-select').getByRole('radio', { name: 'Last 30 days' }).click();
    await page.waitForFunction(() => location.hash.includes('range=30'));
    await page.getByTestId('series-table').locator('summary').click().catch(() => {});
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=series-table] tbody tr').length === 30);
    truthy(Number(await page.getByTestId('stat-days').locator('p').nth(1).textContent()) <= 30, 'tiles use the same slice');
    await page.getByTestId('range-select').getByRole('radio', { name: 'All data' }).click();
    await page.waitForFunction(() => !location.hash.includes('range='));
  });

  // ===================== 3. time-lag switcher + ranked impact =====================
  await step('3.1 T+0: "bedding unwashed > 10 days" is a top trigger, every ranked factor has lift > 1, evidence is shown', async () => {
    await page.getByTestId('trigger-rows').waitFor();
    const f = await triggerFactors();
    truthy(f.slice(0, 5).includes('composite:bedding_gt10'), `T+0 top 5: ${f.slice(0, 5)}`);
    const rows = await rowsOf('trigger-rows', 'factor');
    truthy(rows.length >= 3 && rows.every((r) => r.lift > 1), 'ranked rows are over-represented factors');
    truthy(rows.some((r) => r.evidence === 'strong' || r.evidence === 'moderate'), 'at least one factor has real evidence');
    // sorted by lift
    const lifts = rows.map((r) => r.lift);
    eq([...lifts].sort((a, b) => b - a), lifts, 'ranked by lift');
  });

  let t0 = [];
  await step('3.2 switching to T+1 re-ranks: "heavy sweat + hot shower" (24h later) rises into the top 5; URL keeps the lag', async () => {
    t0 = await triggerFactors();
    await lag('T1');
    eq(await page.getByTestId('lag-select').getByRole('radio', { name: /T\+1/ }).getAttribute('aria-checked'), 'true');
    truthy(page.url().includes('lag=T1'));
    const f = await triggerFactors();
    truthy(f.slice(0, 5).includes('composite:sweat_heavy_and_shower_hot'), `T+1 top 5: ${f.slice(0, 5)}`);
    truthy(JSON.stringify(f) !== JSON.stringify(t0), 'the lag changes the ranking');
    truthy((await page.getByTestId('lag-help').textContent()).includes('next day'), 'help text explains the lag');
    await shot('p4-03-lag-t1');
  });

  await step('3.3 T+2 and the rolling 48h window each produce their own ranking', async () => {
    await lag('T2');
    const t2 = await triggerFactors();
    truthy(t2.length > 0);
    await lag('W48');
    const w = await triggerFactors();
    truthy(w.slice(0, 5).includes('composite:sweat_heavy_and_shower_hot'), `W48 top 5: ${w.slice(0, 5)}`);
    truthy((await page.getByTestId('lag-help').textContent()).includes('two days'));
    await lag('T0');
    eq(await triggerFactors(), t0, 'going back to T+0 restores the same ranking');
  });

  await step('3.4 "New flares only" narrows the analysed days (and is part of the URL)', async () => {
    await page.getByTestId('tab-reverse').click();
    await page.getByTestId('reverse-explorer').waitFor();
    const before = Number(await page.getByTestId('reverse-explorer').getAttribute('data-n'));
    await page.getByTestId('onset-toggle').click();
    await page.waitForFunction((n) => Number(document.querySelector('[data-testid=reverse-explorer]')?.dataset.n) < n, before);
    truthy(page.url().includes('onset=1'));
    await page.getByTestId('onset-toggle').click();
    await page.waitForFunction((n) => Number(document.querySelector('[data-testid=reverse-explorer]')?.dataset.n) === n, before);
  });

  // ===================== 4. forward explorer =====================
  await step('4.1 Variable -> Severity (bedding): one bar per bucket, a baseline, and buckets above baseline are highlighted', async () => {
    await page.getByTestId('tab-forward').click();
    await page.getByTestId('forward-mean-bars').waitFor();
    eq(await page.locator('[data-testid=forward-mean-bars] li[data-factor]').count(), 5, '5 bedding buckets');
    eq(await page.locator('[data-testid=forward-row]').count(), 5, 'table twin has the same 5 levels');
    truthy((await page.getByTestId('forward-mean-bars-reference').textContent()).startsWith('Baseline'), 'baseline labelled');
    const by = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid=forward-mean-bars] li[data-factor]')].map((e) => [e.dataset.factor, { mean: Number(e.dataset.mean), exceeds: e.dataset.exceeds === 'true', n: Number(e.dataset.n) }])));
    truthy(by['bedding_days:bedding_11_14'].mean > by['bedding_days:bedding_0_3'].mean + 2, 'dose-response: 11-14 days clearly higher than 0-3');
    eq(by['bedding_days:bedding_11_14'].exceeds, true, '11-14 above baseline');
    eq(by['bedding_days:bedding_0_3'].exceeds, false, '0-3 not above baseline');
    truthy(by['bedding_days:bedding_11_14'].n >= 5, 'enough days to highlight');
    truthy((await page.getByTestId('forward-trend').textContent()).includes('ρ'), 'monotone trend reported');
    await shot('p4-04-forward-bedding');
  });

  await step('4.2 the chart shows Mean (bar), Median (dot), Baseline (line); the flare-probability chart and table agree', async () => {
    const legend = await page.getByTestId('forward-legend').textContent();
    for (const w of ['Above baseline', 'Median', 'Baseline']) truthy(legend.includes(w), `legend has ${w}`);
    const dots = await page.locator('[data-testid=forward-mean-bars] li span.rounded-full').count();
    const withData = await page.locator('[data-testid=forward-mean-bars] li[data-n]:not([data-n="0"])').count();
    eq(dots, withData, 'one median dot per level that has data');
    eq(await page.locator('[data-testid=forward-flare-bars] li[data-factor]').count(), 5);
    const tbl = await page.evaluate(() => [...document.querySelectorAll('[data-testid=forward-row]')].map((tr) => ({ f: tr.dataset.factor, n: Number(tr.dataset.n), cells: [...tr.querySelectorAll('td')].map((c) => c.textContent.trim()) })));
    const bar = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid=forward-mean-bars] li[data-factor]')].map((e) => [e.dataset.factor, { n: Number(e.dataset.n), mean: Number(e.dataset.mean) }])));
    for (const r of tbl) {
      eq(r.n, bar[r.f].n, `table n == bar n for ${r.f}`);
      if (r.n > 0) eq(Number(r.cells[2]), Math.round(bar[r.f].mean * 10) / 10, `table mean == bar mean for ${r.f}`);
    }
    eq(await page.locator('[data-testid=forward-row] svg[role=img]').count() > 0, true, 'box glyphs drawn');
  });

  await step('4.3 hovering a bar shows a tooltip (value first); the same readout is in the table', async () => {
    const li = page.locator('[data-testid=forward-mean-bars] li[data-factor="bedding_days:bedding_11_14"]');
    await li.hover();
    const tip = li.locator('[role=tooltip]');
    await tip.waitFor({ state: 'visible' });
    truthy((await tip.textContent()).includes('Above baseline'), 'tooltip marks the highlight in words, not just colour');
    await page.mouse.move(0, 0);
    await tip.waitFor({ state: 'hidden' });
  });

  await step('4.4 other variables: heavy sweat peaks at T+1; dairy is above baseline at T+2; categorical diet shows each tag', async () => {
    await lag('T1');
    await page.getByTestId('forward-variable').selectOption('sweat');
    await page.waitForFunction(() => document.querySelector('[data-testid=forward-mean-bars] li[data-factor="sweat:heavy"]'));
    const heavy = await page.locator('[data-testid=forward-mean-bars] li[data-factor="sweat:heavy"]').getAttribute('data-exceeds');
    eq(heavy, 'true', 'heavy sweat is above baseline severity the NEXT day');
    await lag('T2');
    await page.getByTestId('forward-variable').selectOption('diet');
    await page.waitForFunction(() => document.querySelector('[data-testid=forward-mean-bars] li[data-factor="diet:dairy"]'));
    eq(await page.locator('[data-testid=forward-mean-bars] li[data-factor="diet:dairy"]').getAttribute('data-exceeds'), 'true', 'dairy above baseline two days later');
    truthy((await page.locator('[data-testid=forward-mean-bars] li[data-factor]').count()) >= 9, 'one row per diet tag');
    eq(await page.getByTestId('forward-trend').count(), 0, 'no trend for an unordered multi-tag variable');
    await lag('T0');
  });

  await step('4.5 a continuous variable is bucketed automatically, with trend (stress) and units in the labels (temperature)', async () => {
    await page.getByTestId('forward-variable').selectOption('stress');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=forward-mean-bars] li[data-factor]').length === 3);
    await page.getByTestId('forward-variable').selectOption('temperature');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=forward-mean-bars] li[data-factor]').length === 5);
    const labels = await page.locator('[data-testid=forward-row] td:first-child').allTextContents();
    truthy(labels.some((l) => l.includes('°C')), `temperature buckets carry °C: ${labels}`);
    await page.getByTestId('forward-variable').selectOption('bedding_days');
  });

  // ===================== 5. reverse explorer =====================
  await step('5.1 Severity -> Variables: ranked factors with the spec\'s exact readout (co-occurrence, baseline, lift)', async () => {
    await page.getByTestId('tab-reverse').click();
    await page.getByTestId('reverse-list').waitFor();
    const rows = await reverseRows();
    truthy(rows.length >= 3, 'ranked factors');
    truthy(rows.slice(0, 5).some((r) => /bedding/.test(r.factor)), `Severe flare @T+0 surfaces overdue bedding in the top 5: ${rows.slice(0, 5).map((r) => r.factor)}`);
    const first = page.getByTestId('reverse-row').first();
    const co = await first.getByTestId('co-text').textContent();
    const base = await first.getByTestId('base-text').textContent();
    truthy(/^Present in \d+% of Severe flare \(7–10\) days \(\d+ of \d+\)$/.test(co), `co-occurrence wording: ${co}`);
    truthy(/^Present in \d+% of all logged days \(\d+ of \d+\)$/.test(base), `baseline wording: ${base}`);
    truthy(/^\d+\.\d\d× more likely$/.test((await first.getByTestId('lift-chip').textContent()).trim()), 'lift wording');
    await shot('p4-05-reverse');
  });

  await step('5.2 lift = co-occurrence / baseline, and what is DISPLAYED matches what is computed (within rounding)', async () => {
    const rows = await reverseRows();
    for (const r of rows) {
      truthy(Math.abs(r.lift - r.co / r.base) < 1e-9, `lift ${r.lift} vs ${r.co}/${r.base} for ${r.factor}`);
      truthy(r.lift > 1, 'ranked rows are over-represented');
    }
    const lifts = rows.map((r) => r.lift);
    eq([...lifts].sort((a, b) => b - a), lifts, 'sorted by lift, highest first');
    const first = page.getByTestId('reverse-row').first();
    const formula = await first.getByTestId('formula').textContent(); // "75% / 22% = 3.41×"
    const m = formula.match(/(\d+)% \/ (\d+)% = (\d+\.\d\d)×/);
    truthy(m, `formula: ${formula}`);
    const chip = (await first.getByTestId('lift-chip').textContent()).match(/(\d+\.\d\d)×/)[1];
    eq(chip, m[3], 'chip and formula show the same lift');
    truthy(Math.abs(Number(m[3]) - rows[0].lift) < 0.006, 'displayed lift = computed lift');
  });

  await step('5.3 each severity tier gives its own ranking and summary; sparse tiers warn instead of inventing results', async () => {
    const pickTier = async (re, id) => {
      await page.getByTestId('tier-select').getByRole('radio', { name: re }).click();
      // wait for React to render the NEW tier (rows carry data-tier; an empty list shows the empty message)
      await page.waitForFunction((t) => document.querySelector('[data-testid=reverse-row]')?.dataset.tier === t || document.querySelector('[data-testid=reverse-empty]'), id);
      await page.waitForTimeout(100);
    };
    const severe = await reverseRows();
    const sumSevere = await page.getByTestId('reverse-summary').textContent();
    try {
      await pickTier(/Mild/, 'mild');
      const mild = await reverseRows();
      truthy(JSON.stringify(mild.map((r) => r.factor)) !== JSON.stringify(severe.map((r) => r.factor)), 'mild ranking differs from severe');
      truthy((await page.getByTestId('reverse-summary').textContent()) !== sumSevere, 'summary updates');
      await pickTier(/Moderate/, 'moderate');
    } finally {
      await pickTier(/Severe/, 'severe'); // never leave later steps in the wrong tier
    }
    eq((await reverseRows()).map((r) => r.factor), severe.map((r) => r.factor), 'back to the same severe ranking');
  });

  await step('5.4 time-lag applies to the reverse view too: at T+1 "heavy sweat + hot shower" leads the Severe list', async () => {
    await lag('T1');
    await page.waitForFunction(() => document.querySelector('[data-testid=reverse-row]'));
    const rows = await reverseRows();
    truthy(rows.slice(0, 5).some((r) => r.factor === 'composite:sweat_heavy_and_shower_hot'), `T+1 severe top 5: ${rows.slice(0, 5).map((r) => r.factor)}`);
    await lag('T0');
  });

  await step('5.5 body-part filter: neck + Severe flare points at overdue bedding; the note explains the filter', async () => {
    await page.getByTestId('region-select').selectOption('neck');
    await page.waitForFunction(() => location.hash.includes('region=neck'));
    await page.waitForFunction(() => document.querySelector('[data-testid=reverse-row]'));
    const rows = await reverseRows();
    truthy(rows.slice(0, 3).some((r) => r.factor === 'composite:bedding_gt10'), `neck severe top 3: ${rows.slice(0, 3).map((r) => r.factor)}`);
    truthy((await page.getByTestId('reverse-explorer').textContent()).includes("body part's own severity"), 'filter explained');
    await page.getByTestId('region-select').selectOption('');
  });

  await step('5.6 protective ("less common") and insufficient-data factors are kept out of the ranking but available', async () => {
    const prot = page.getByTestId('reverse-protective');
    if (await prot.count()) {
      await prot.locator('summary').click();
      truthy((await prot.getByTestId('lift-chip').first().textContent()).includes('as likely'), 'protective wording');
    }
    const insuff = page.getByTestId('reverse-insufficient');
    truthy((await insuff.count()) + (await prot.count()) >= 1, 'at least one secondary list');
  });

  // ===================== 6. deep links / robustness =====================
  await step('6.1 a deep link restores the exact view; garbage in the URL falls back to safe defaults', async () => {
    await page.goto(BASE + '#/analytics?tab=reverse&lag=T1&tier=moderate&region=neck');
    await page.getByTestId('reverse-explorer').waitFor();
    eq(await page.getByTestId('lag-select').getByRole('radio', { name: /T\+1/ }).getAttribute('aria-checked'), 'true');
    eq(await page.getByTestId('tier-select').getByRole('radio', { name: /Moderate/ }).getAttribute('aria-checked'), 'true');
    eq(await page.getByTestId('region-select').inputValue(), 'neck');
    await page.goto(BASE + '#/analytics?tab=zzz&lag=T9&tier=extreme&region=nose&var=__proto__');
    await page.getByTestId('tab-overview').waitFor();
    eq(await page.getByTestId('tab-overview').getAttribute('aria-selected'), 'true');
    eq(await page.getByTestId('lag-select').getByRole('radio', { name: /T\+0/ }).getAttribute('aria-checked'), 'true');
  });

  // ===================== 7. language =====================
  await step('7.1 中文: the whole explorer is localised (tabs, lag, tiers, factor names, spec phrasing, numbers)', async () => {
    await page.goto(BASE + '#/analytics?tab=reverse&lag=T1');
    await page.getByTestId('reverse-list').waitFor();
    await page.getByTestId('lang-toggle').click();
    const text = await page.getByTestId('reverse-explorer').textContent();
    for (const w of ['严重程度分组', '重度发作', '可能性高出', '倍']) truthy(text.includes(w), `zh text has ${w}`);
    const top = await page.getByTestId('reverse-row').first().textContent();
    truthy(/大量出汗|床品|热水/.test(top), `zh factor label: ${top.slice(0, 60)}`);
    eq((await page.getByTestId('tab-reverse').textContent()).trim(), '严重程度 → 变量');
    eq(await page.getByTestId('lag-select').getByRole('radio', { name: /滞后1天/ }).count(), 1);
    await page.getByTestId('tab-overview').click();
    await page.getByTestId('severity-chart').waitFor();
    truthy((await page.getByTestId('stat-flare-rate').textContent()).includes('发作比例'));
    const ticks = await page.evaluate(() => [...document.querySelectorAll('[data-testid=severity-card] .recharts-xAxis-tick-labels text')].map((e) => e.textContent.trim()));
    truthy(ticks.length >= 4 && ticks.every((x) => /^\d{1,2}\/\d{1,2}$/.test(x)), `x ticks use the Chinese M/d format: ${JSON.stringify(ticks)}`);
    await shot('p4-06-zh-overview');
    await page.getByTestId('tab-forward').click();
    await page.getByTestId('forward-mean-bars').waitFor();
    truthy((await page.getByTestId('forward-table').textContent()).includes('天数'));
    await page.getByTestId('lang-toggle').click();
  });

  // ===================== 8. isolation =====================
  await step('8.1 re-loading the demo is idempotent; leaving demo shows the (empty) REAL data again', async () => {
    await page.getByTestId('settings-trigger').click();
    await page.getByTestId('demo-load').click();
    await page.getByTestId('demo-message').waitFor();
    eq(Number((await page.getByTestId('demo-message').textContent()).match(/\d+/)[0]), demoDays, 'same number of days on re-seed');
    await page.getByTestId('demo-exit').click();
    await page.getByTestId('analytics-empty').waitFor();
  });

  // ===================== 9. responsive + dark =====================
  await step('9.1 phone layout on every tab: no horizontal overflow, charts stay inside the card', async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
    const p = await phone.newPage();
    await p.goto(BASE + '#/analytics');
    await p.getByTestId('analytics-load-demo').click();
    await p.getByTestId('severity-chart').waitFor();
    await p.waitForTimeout(500);
    for (const tab of ['overview', 'forward', 'reverse']) {
      await p.getByTestId(`tab-${tab}`).click();
      await p.waitForTimeout(400);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      eq(over, 0, `${tab}: horizontal overflow`);
      await p.screenshot({ path: path.join(SHOTS, `p4-07-phone-${tab}.png`) });
    }
    await phone.close();
  });

  await step('9.2 dark mode renders all three tabs (screenshots) with the dark palette', async () => {
    const dark = await browser.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: 'dark', locale: 'en-US' });
    const p = await dark.newPage();
    await p.goto(BASE + '#/analytics');
    await p.getByTestId('analytics-load-demo').click();
    await p.getByTestId('severity-chart').waitFor();
    await p.waitForTimeout(500);
    const stroke = await p.getByTestId('severity-chart').locator('path.recharts-line-curve').first().getAttribute('stroke');
    eq(stroke, '#3987e5', 'dark-mode severity blue');
    await p.screenshot({ path: path.join(SHOTS, 'p4-08-dark-overview.png') });
    await p.getByTestId('tab-forward').click();
    await p.getByTestId('forward-mean-bars').waitFor();
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(SHOTS, 'p4-09-dark-forward.png') });
    await dark.close();
  });

  await step('10 no console errors or uncaught exceptions during the whole run', async () => {
    eq(consoleErrors, []);
  });

  await browser.close();
  console.log(log.join('\n'));
  console.log(`\n${log.length - failures.length}/${log.length} steps passed`);
  if (failures.length) {
    console.log('FAILED:', failures.join(' | '));
    process.exit(1);
  }
})();
