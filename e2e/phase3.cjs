/**
 * Phase 3 end-to-end check (body map + lesion lifecycle), against the BUILT app in headless Chromium.
 *
 *   npm run build && npx vite preview --port 4173 --strictPort &
 *   SHOTS=/some/dir NODE_PATH=$(npm root -g) node e2e/phase3.cjs
 *
 * The lifecycle numbers below are computed BY HAND (not by the code under test):
 *
 *   neck:  D1 = today-20 active 6   D2 = today-14 healing 3   D3 = today-10 healed   D4 = today-3 active 5
 *   episode 1: [D1, D3) -> 10 days affected = 6 active (D1..D2-1) + 4 healing (D2..D3-1)
 *   episode 2: starts D4 (a recurrence), still open -> today - D4 + 1 = 4 days
 *   cumulative = 14, recurrences = 1, remission before episode 2 = D4 - D3 = 7 -> average 7
 */
const { chromium } = require('playwright');
const zlib = require('node:zlib');
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
    log.push(`  FAIL ${name}\n         ${String(e.message || e).split('\n').slice(0, 4).join('\n         ')}`);
  }
}
const eq = (a, b, msg) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || 'expected equal'}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);
};
const truthy = (v, msg) => {
  if (!v) throw new Error(msg || 'expected truthy');
};
const pad = (n) => String(n).padStart(2, '0');
const iso = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function makePng(w, h, seed) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = (x * 255) / w; raw[o + 1] = (y * 255) / h; raw[o + 2] = seed;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'en-US' });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  const today = iso(0);
  const D1 = iso(-20), D2 = iso(-14), D3 = iso(-10), D4 = iso(-3);
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  const metric = async (id) => page.getByTestId(`metric-${id}`).getAttribute('data-value');
  const region = (r, view) => page.locator(`[data-testid=body-map-${view || 'anterior'}] [data-region="${r}"]`);

  const selectRegion = async (r) => {
    await page.getByTestId(`region-btn-${r}`).click();
    await page.locator(`[data-testid=region-panel][data-region="${r}"]`).waitFor();
    await page.getByTestId('obs-save').waitFor();
  };
  const setSliderTo = async (name, value) => {
    const thumb = page.getByRole('slider', { name });
    await thumb.focus();
    await page.keyboard.press('Home');
    const min = Number(await thumb.getAttribute('aria-valuemin'));
    for (let i = min; i < value; i++) await page.keyboard.press('ArrowRight');
  };
  /** Log one observation through the real form. */
  const logObs = async ({ date, status, severity, skin = [] }) => {
    await page.getByTestId('obs-date').fill(date);
    await page.waitForFunction((v) => document.querySelector('[data-testid=obs-date]')?.value === v, date);
    await page.getByTestId('obs-save').waitFor();
    if (status) await page.getByTestId('obs-status').getByRole('radio', { name: status, exact: true }).click();
    if (severity != null) await setSliderTo(/Local severity/, severity);
    for (const s of skin) await page.getByTestId(`skin-${s}`).click();
    await page.getByTestId('obs-save').click();
    await page.getByTestId('obs-saved').waitFor();
  };

  await page.goto(BASE + '#/body');
  await page.getByTestId('body-map-anterior').waitFor();

  // ===================== 1. the map =====================
  await step('1.1 front view has 13 clickable regions, back view has 10; together all 15 are reachable', async () => {
    eq(await page.locator('[data-testid=body-map-anterior] [data-region]').count(), 13);
    eq(await page.locator('[data-testid=body-map-posterior] [data-region]').count(), 10);
    const all = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-region]')].map((e) => e.dataset.region))].sort());
    eq(all.length, 15);
    await shot('p3-01-empty-body');
  });

  await step('1.2 every region (both limbs) is genuinely hit-testable: no shape is hidden under another', async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const failures2 = await page.evaluate(() => {
      const bad = [];
      for (const g of document.querySelectorAll('[data-region]')) {
        const view = g.closest('svg').dataset.testid;
        for (const path of g.querySelectorAll('path.body-region-shape')) {
          const bb = path.getBBox();
          let best = null;
          for (let y = bb.y + 1; y < bb.y + bb.height; y += 1) {
            for (let x = bb.x + 1; x < bb.x + bb.width; x += 1) {
              if (!path.isPointInFill(new DOMPoint(x, y))) continue;
              const d = Math.hypot(x - (bb.x + bb.width / 2), y - (bb.y + bb.height / 2));
              if (!best || d < best.d) best = { x, y, d };
            }
          }
          if (!best) { bad.push(`${view}/${g.dataset.region}: no interior point`); continue; }
          const p = new DOMPoint(best.x, best.y).matrixTransform(path.getScreenCTM());
          const hit = document.elementFromPoint(p.x, p.y)?.closest('[data-region]')?.dataset.region;
          if (hit !== g.dataset.region) bad.push(`${view}/${g.dataset.region} -> hit ${hit} at (${Math.round(p.x)},${Math.round(p.y)})`);
        }
      }
      return bad;
    });
    eq(failures2, []);
  });

  await step('1.3 each region is large enough to tap (>= 24 CSS px each way on a desktop screen)', async () => {
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('[data-region]')]
        .map((g) => { const r = g.getBoundingClientRect(); return { id: g.dataset.region, v: g.closest('svg').dataset.testid, w: Math.round(r.width), h: Math.round(r.height) }; })
        .filter((r) => r.w < 24 || r.h < 24),
    );
    eq(small, []);
  });

  await step('1.4 clicking a region on the map opens its panel; the back view neck selects the same (bilateral) region', async () => {
    await region('forearms').first().locator('path.body-region-shape').first().click(); // click a limb, not the centre of a <g> spanning both arms
    await page.locator('[data-testid=region-panel][data-region=forearms]').waitFor();
    eq(await page.getByTestId('region-name').textContent(), 'Forearms');
    truthy(page.url().includes('region=forearms'), 'selection is in the URL');
    await region('neck', 'posterior').click();
    await page.locator('[data-testid=region-panel][data-region=neck]').waitFor();
    eq(await region('neck', 'anterior').getAttribute('aria-pressed'), 'true', 'front neck is shown selected too');
  });

  await step('1.5 keyboard: a region is focusable and Enter / Space select it; list buttons work too', async () => {
    await region('face').focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-testid=region-panel][data-region=face]').waitFor();
    await region('hands_wrists').first().focus();
    await page.keyboard.press('Space');
    await page.locator('[data-testid=region-panel][data-region=hands_wrists]').waitFor();
    eq(await region('hands_wrists').first().getAttribute('role'), 'button');
    truthy((await region('hands_wrists').first().getAttribute('aria-label')).startsWith('Hands / wrists'), 'has an accessible name');
  });

  // ===================== 2. lifecycle through the real form =====================
  await step('2.1 a never-logged body part: no episodes, metrics are "—" / 0, first-observation hint', async () => {
    await selectRegion('neck');
    eq(await page.getByTestId('region-status').getAttribute('data-status'), 'clear');
    eq(await metric('episodes'), '0');
    eq(await metric('days-affected'), '');
    eq(await metric('recurrences'), '0');
    eq(await page.getByTestId('observation-form').getByText('First observation for this body part.').count(), 1);
  });

  await step('2.2 form rules: skin chips only while healing/healed; severity hidden when healed; normal skin is exclusive', async () => {
    eq(await page.getByTestId('obs-skin').count(), 0, 'no skin chips for an active flare');
    await page.getByTestId('obs-status').getByRole('radio', { name: 'Healing', exact: true }).click();
    await page.getByTestId('obs-skin').waitFor();
    await page.getByTestId('skin-hyperpigmentation').click();
    await page.getByTestId('skin-xerosis').click();
    eq(await page.getByTestId('skin-hyperpigmentation').getAttribute('aria-pressed'), 'true');
    await page.getByTestId('skin-normal_skin').click();
    eq(await page.getByTestId('skin-hyperpigmentation').getAttribute('aria-pressed'), 'false', 'normal skin cleared the others');
    eq(await page.getByTestId('skin-xerosis').getAttribute('aria-pressed'), 'false');
    await page.getByTestId('skin-xerosis').click();
    eq(await page.getByTestId('skin-normal_skin').getAttribute('aria-pressed'), 'false', 'choosing another cleared normal skin');
    await page.getByTestId('obs-status').getByRole('radio', { name: 'Healed', exact: true }).click();
    eq(await page.getByRole('slider', { name: /Local severity/ }).count(), 0, 'no severity slider once healed');
    await page.getByTestId('obs-status').getByRole('radio', { name: 'Active flare', exact: true }).click();
    eq(await page.getByTestId('obs-skin').count(), 0, 'skin chips gone again for an active flare');
  });

  await step('2.3 log the four neck observations (active -> healing -> healed -> recurrence)', async () => {
    await logObs({ date: D1, status: 'Active flare', severity: 6 });
    await logObs({ date: D2, status: 'Healing', severity: 3, skin: ['hyperpigmentation'] });
    await logObs({ date: D3, status: 'Healed', skin: [] });
    await logObs({ date: D4, status: 'Active flare', severity: 5 });
  });

  await step('2.4 days affected, recurrences and remission are DERIVED and match the hand calculation', async () => {
    eq(await metric('days-affected'), '4', 'current episode: D4..today inclusive');
    eq(await metric('cumulative'), '14', '10 (episode 1) + 4 (episode 2)');
    eq(await metric('recurrences'), '1');
    eq(await metric('avg-remission'), '7', 'D3 -> D4');
    eq(await metric('episodes'), '2');
    eq(await metric('in-remission'), '', 'not in remission: an episode is open');
    eq((await page.getByTestId('episode-badge').textContent()).trim(), 'Recurrence #1');
    eq(await page.getByTestId('region-status').getAttribute('data-status'), 'active');
    truthy((await page.getByTestId('region-panel').textContent()).includes('5/10'), 'local severity shown');
    await shot('p3-02-neck-panel');
  });

  await step('2.5 the two episodes are listed newest first with the right split of active vs healing days', async () => {
    const cards = page.getByTestId('episode-card');
    eq(await cards.count(), 2);
    eq([await cards.nth(0).getAttribute('data-index'), await cards.nth(0).getAttribute('data-days'), await cards.nth(0).getAttribute('data-recurrence')], ['2', '4', 'true']);
    eq([await cards.nth(1).getAttribute('data-index'), await cards.nth(1).getAttribute('data-days'), await cards.nth(1).getAttribute('data-active-days'), await cards.nth(1).getAttribute('data-healing-days'), await cards.nth(1).getAttribute('data-recurrence')], ['1', '10', '6', '4', 'false']);
    truthy((await cards.nth(1).getByTestId('episode-skin').textContent()).includes('Post-inflammatory hyperpigmentation'));
  });

  await step('2.6 post-healing skin state: recorded states are tracked over time', async () => {
    const rows = page.getByTestId('skin-history').locator('li');
    eq(await rows.count(), 2, 'D2 (healing) and D3 (healed): a follow-up inherits the previous skin state');
    eq(await page.getByTestId('skin-now-empty').count(), 1, 'currently active, so no "current" skin state yet');
  });

  await step('2.7 the map now colours the neck as an active flare, in BOTH views, with the severity colour', async () => {
    for (const view of ['anterior', 'posterior']) {
      eq(await region('neck', view).getAttribute('data-status'), 'active');
      eq(await region('neck', view).getAttribute('data-severity'), '5');
    }
    const fillFront = await region('neck').locator('path.body-region-shape').first().evaluate((p) => getComputedStyle(p).fill);
    const fillBack = await region('neck', 'posterior').locator('path.body-region-shape').first().evaluate((p) => getComputedStyle(p).fill);
    eq(fillFront, fillBack);
    truthy(fillFront !== 'rgb(240, 242, 245)' && !/var\(/.test(fillFront), `heat colour applied: ${fillFront}`);
  });

  await step('2.8 an unusual change warns but never blocks; changing date with edits asks before discarding', async () => {
    const D8 = iso(-8); // the latest observation before it is D3 = healed
    await page.getByTestId('obs-date').fill(D8);
    await page.waitForFunction((v) => document.querySelector('[data-testid=obs-date]')?.value === v, D8);
    await page.getByTestId('obs-save').waitFor();
    await page.getByTestId('obs-status').getByRole('radio', { name: 'Healing', exact: true }).click();
    const warn = await page.getByTestId('obs-unusual').textContent();
    truthy(warn.includes('Healed') && warn.includes('Healing') && warn.includes('still be saved'), `warning text: ${warn}`);
    eq(await page.getByTestId('obs-save').isEnabled(), true, 'not blocked');
    await page.getByTestId('obs-date').fill(D4);
    await page.getByTestId('obs-discard').waitFor();
    await page.getByTestId('obs-discard').click();
    await page.waitForFunction((v) => document.querySelector('[data-testid=obs-date]')?.value === v, D4);
    eq(await page.locator('[data-testid=history-row]').count(), 4, 'nothing was saved for D8');
  });

  // ===================== 3. calendar integration =====================
  await step('3.1 the calendar shows an active-flare badge exactly while the body part is active', async () => {
    await page.getByRole('link', { name: 'Calendar' }).click();
    await page.getByTestId('calendar-grid').waitFor();
    const badge = (d) => page.locator(`[data-testid=day-cell][data-date="${d}"] [data-testid=badge-flare]`);
    await badge(today).waitFor();
    eq((await badge(today).textContent()).trim(), '1');
    eq(await badge(iso(-3)).count(), 1, 'D4 itself');
    eq(await badge(iso(-5)).count(), 0, 'healed on D3, so no flare badge on D3+2');
    eq(await badge(iso(-12)).count(), 0, 'healing is not an active flare-up');
    await shot('p3-03-calendar-flare-badges');
    await page.getByRole('link', { name: 'Body map' }).click();
    await page.getByTestId('body-map-anterior').waitFor();
  });

  // ===================== 4. edit / delete =====================
  await step('4.1 editing an observation from the history updates the metrics and the map', async () => {
    await selectRegion('neck');
    await page.locator(`[data-testid=history-row][data-date="${D4}"] [data-testid=history-edit]`).click();
    await page.waitForFunction((v) => document.querySelector('[data-testid=obs-date]')?.value === v, D4);
    await page.getByTestId('obs-save').waitFor();
    eq(await page.getByRole('slider', { name: /Local severity/ }).getAttribute('aria-valuenow'), '5');
    await setSliderTo(/Local severity/, 8);
    await page.getByTestId('obs-save').click();
    await page.getByTestId('obs-saved').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid=region-panel]')?.textContent?.includes('8/10'));
    eq(await region('neck').getAttribute('data-severity'), '8');
    eq(await metric('days-affected'), '4', 'dates unchanged, so days affected unchanged');
    truthy((await page.getByTestId('episode-card').first().textContent()).includes('Peak severity 8/10'));
  });

  // ===================== 5. a second region: healing, hatching, stale nudge =====================
  await step('5.1 an open episode that nobody updated for 14+ days shows the "still active?" nudge', async () => {
    await selectRegion('forearms');
    await logObs({ date: iso(-30), status: 'Active flare', severity: 6 });
    await logObs({ date: iso(-25), status: 'Healing', severity: 3, skin: ['xerosis'] });
    eq(await page.getByTestId('region-status').getAttribute('data-status'), 'healing');
    await page.getByTestId('stale-nudge').waitFor();
    truthy((await page.getByTestId('stale-nudge').textContent()).includes('25 days'));
    eq(await metric('days-affected'), '31', 'open episode runs through today: -30..today inclusive');
    truthy((await page.getByTestId('metric-days-affected').textContent()).includes('Active 5 · Healing 26'), 'split: -30..-26 active, -25..today healing');
    eq(await page.getByTestId('skin-now').count(), 1, 'healing sites show their current skin state');
    truthy((await page.getByTestId('skin-now').textContent()).includes('Residual xerosis / scaling'));
  });

  await step('5.2 healing regions are drawn hatched (status is never colour alone); regions list reflects state', async () => {
    eq(await region('forearms').first().locator('path[fill^="url(#hatch"]').count() > 0, true);
    eq(await page.getByTestId('region-btn-forearms').textContent().then((t) => t.includes('Healing')), true);
    truthy((await page.getByTestId('body-summary').textContent()).includes('1 active flare-up'), 'summary counts active');
    truthy((await page.getByTestId('body-summary').textContent()).includes('1 healing'), 'summary counts healing');
  });

  // ===================== 6. photos =====================
  await step('6.1 photos belong to a body part and a date; the timeline orders them and shows the status on that day', async () => {
    await selectRegion('neck');
    await page.getByTestId('obs-date').fill(D1);
    await page.waitForFunction((v) => document.querySelector('[data-testid=obs-date]')?.value === v, D1);
    await page.getByTestId('obs-save').waitFor();
    await page.getByTestId('photo-input').setInputFiles({ name: 'before.png', mimeType: 'image/png', buffer: makePng(640, 480, 40) });
    await page.getByTestId('photo-card').waitFor();
    await page.getByTestId('obs-save').click();
    await page.getByTestId('obs-saved').waitFor();

    await page.getByTestId('obs-date').fill(D3);
    await page.waitForFunction((v) => document.querySelector('[data-testid=obs-date]')?.value === v, D3);
    await page.getByTestId('obs-save').waitFor();
    await page.getByTestId('photo-input').setInputFiles({ name: 'after.png', mimeType: 'image/png', buffer: makePng(640, 480, 200) });
    await page.getByTestId('photo-card').waitFor();
    await page.getByRole('button', { name: 'Tags' }).click();
    await page.getByRole('button', { name: 'After', exact: true }).click();
    await page.getByTestId('obs-save').click();
    await page.getByTestId('obs-saved').waitFor();

    const items = page.getByTestId('timeline-photo');
    await items.nth(1).waitFor();
    eq(await items.count(), 2);
    eq([await items.nth(0).getAttribute('data-date'), await items.nth(1).getAttribute('data-date')], [D1, D3]);
    eq([await items.nth(0).locator('[data-status]').getAttribute('data-status'), await items.nth(1).locator('[data-status]').getAttribute('data-status')], ['active', 'healed']);
    await shot('p3-04-photo-timeline');
  });

  await step('6.2 the photo viewer opens full size, steps through photos, and closes with Escape', async () => {
    await page.getByTestId('timeline-photo').first().locator('button').click();
    await page.getByTestId('photo-viewer').waitFor();
    truthy((await page.getByTestId('photo-viewer').locator('[data-status]').first().getAttribute('data-status')) === 'active');
    await page.getByRole('button', { name: 'Next' }).click();
    truthy((await page.getByTestId('photo-viewer').locator('[data-status]').first().getAttribute('data-status')) === 'healed');
    truthy((await page.getByTestId('photo-viewer').textContent()).includes('After'), 'tags are shown');
    await page.keyboard.press('Escape');
    await page.getByTestId('photo-viewer').waitFor({ state: 'detached' });
  });

  await step('6.3 before / after: defaults to first vs last, shows days apart, side-by-side and slider modes', async () => {
    eq(await page.getByTestId('compare-apart').getAttribute('data-days'), '10', 'D1 -> D3');
    eq(await page.getByTestId('compare-side').locator('img').count(), 2);
    await page.getByTestId('compare-mode').getByRole('radio', { name: 'Slider' }).click();
    await page.getByTestId('compare-slider-view').waitFor();
    await page.getByTestId('compare-range').fill('25');
    const clip = await page.getByTestId('compare-slider-view').locator('div[style*="clip-path"]').getAttribute('style');
    truthy(/inset\(0(px)? 75%/.test(clip), `clip follows the slider: ${clip}`);
    await page.getByTestId('compare-mode').getByRole('radio', { name: 'Side by side' }).click();
    // swapping the "before" photo changes the distance
    await page.getByTestId('compare-before').selectOption({ index: 1 });
    eq(await page.getByTestId('compare-apart').getAttribute('data-days'), '0');
    await page.getByTestId('compare-before').selectOption({ index: 0 });
    await shot('p3-05-compare');
  });

  await step('6.4 region photos also show on the calendar day, but NOT as whole-day photos in the daily drawer', async () => {
    await page.getByRole('link', { name: 'Calendar' }).click();
    await page.getByTestId('calendar-grid').waitFor();
    await page.getByTestId('cal-prev').click(); // D1 (20 days ago) is in the previous month
    await page.locator(`[data-testid=day-cell][data-date="${D1}"] [data-testid=badge-photos]`).waitFor();
    await page.locator(`[data-testid=day-cell][data-date="${D1}"]`).click();
    await page.getByTestId('daily-log-drawer').waitFor();
    await page.getByTestId('log-save').waitFor();
    eq(await page.getByTestId('photo-card').count(), 0, 'daily log only lists whole-day photos');
    await page.keyboard.press('Escape');
    await page.getByTestId('daily-log-drawer').waitFor({ state: 'detached' });
    await page.getByRole('link', { name: 'Body map' }).click();
    await page.getByTestId('body-map-anterior').waitFor();
  });

  // ===================== 7. persistence, delete =====================
  await step('7.1 everything persists across a reload (URL keeps the selected region)', async () => {
    await selectRegion('neck');
    await page.reload();
    await page.locator('[data-testid=region-panel][data-region=neck]').waitFor();
    await page.getByTestId('metric-cumulative').waitFor();
    eq(await metric('cumulative'), '14');
    eq(await metric('recurrences'), '1');
    eq(await page.getByTestId('timeline-photo').count(), 2);
  });

  await step('7.2 deleting the recurrence observation recomputes everything (and removes the flare badge)', async () => {
    await page.locator(`[data-testid=history-row][data-date="${D4}"] [data-testid=history-edit]`).click();
    await page.waitForFunction((v) => document.querySelector('[data-testid=obs-date]')?.value === v, D4);
    await page.getByTestId('obs-delete').click();
    await page.getByTestId('obs-delete-yes').click();
    await page.waitForFunction(() => document.querySelector('[data-testid=metric-episodes]')?.dataset.value === '1');
    eq(await metric('recurrences'), '0');
    eq(await metric('cumulative'), '10');
    eq(await metric('days-affected'), '');
    eq(await metric('in-remission'), '10', 'healed on D3 = 10 days ago');
    eq(await metric('avg-remission'), '', 'no recurrence -> no remission gap');
    eq(await page.getByTestId('region-status').getAttribute('data-status'), 'healed');
    eq(await page.getByTestId('obs-date').inputValue(), today, 'form reset to a clean "today" entry');
    eq(await region('neck').getAttribute('data-status'), 'healed');
    eq(await page.getByTestId('history-row').count(), 3);
    truthy((await page.getByTestId('skin-now').textContent()).includes('Post-inflammatory hyperpigmentation'), 'healed region shows its post-healing skin state');
  });

  // ===================== 8. language =====================
  await step('8.1 中文: metric labels use the spec terms, region names and dates are localised, map labels too', async () => {
    await page.getByTestId('lang-toggle').click();
    const panel = await page.getByTestId('region-panel').textContent();
    for (const term of ['已患病天数', '复发次数', '愈合后皮肤状态', '颈部']) truthy(panel.includes(term), `missing ${term}`);
    truthy(/\d{4}年\d{1,2}月\d{1,2}日/.test(await page.getByTestId('history-list').textContent()), 'localised dates');
    truthy((await region('neck').getAttribute('aria-label')).startsWith('颈部'), 'map aria-label is Chinese');
    eq((await page.getByTestId('body-legend').textContent()).includes('活动性发作'), true);
    await shot('p3-06-body-zh');
    await page.getByTestId('lang-toggle').click();
    eq(await region('neck').getAttribute('aria-label').then((s) => s.startsWith('Neck')), true);
  });

  // ===================== 9. demo data =====================
  await step('9.1 demo data fills the body map and its metrics; real data is untouched; leaving demo restores it', async () => {
    await page.getByTestId('settings-trigger').click();
    await page.getByTestId('demo-load').click();
    await page.getByTestId('demo-banner').waitFor();
    await page.getByTestId('body-map-anterior').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-region=hands_wrists]')?.dataset.status === 'active');
    eq(await region('hands_wrists').first().getAttribute('data-status'), 'active', 'demo: hands still active');
    await region('neck').first().click();
    await page.locator('[data-testid=region-panel][data-region=neck]').waitFor();
    await page.waitForFunction(() => Number(document.querySelector('[data-testid=metric-episodes]')?.dataset.value) >= 2);
    truthy(Number(await metric('recurrences')) >= 1, 'demo neck recurs');
    truthy((await metric('avg-remission')) !== '', 'demo neck has an average remission');
    await shot('p3-07-demo-neck');
    await page.getByTestId('demo-exit').click();
    await page.getByTestId('demo-banner').waitFor({ state: 'detached' });
    await page.waitForFunction((n) => document.querySelector('[data-testid=metric-cumulative]')?.dataset.value === n, '10');
    eq(await region('neck').getAttribute('data-status'), 'healed', 'real neck is back (healed)');
    eq(await region('hands_wrists').first().getAttribute('data-status'), 'clear', 'real hands untouched');
  });

  // ===================== 10. responsive / dark =====================
  await step('10.1 phone layout: map, list and panel stack without horizontal scroll', async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
    const p = await phone.newPage();
    await p.goto(BASE + '#/body');
    await p.getByTestId('body-map-anterior').waitFor();
    await p.getByTestId('settings-trigger').click();
    await p.getByTestId('demo-load').click();
    await p.getByTestId('demo-banner').waitFor();
    await p.waitForFunction(() => document.querySelector('[data-region=hands_wrists]')?.dataset.status === 'active');
    eq(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, 'no overflow (map)');
    await p.screenshot({ path: path.join(SHOTS, 'p3-08-phone-body.png') });
    await p.getByTestId('region-btn-neck').click();
    await p.locator('[data-testid=region-panel]').waitFor();
    await p.waitForTimeout(700);
    eq(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, 'no overflow (panel)');
    const top = await p.getByTestId('region-panel').evaluate((e) => e.getBoundingClientRect().top);
    truthy(top < 300, `panel scrolled into view on a phone (top=${top})`);
    await p.screenshot({ path: path.join(SHOTS, 'p3-09-phone-panel.png') });
    await phone.close();
  });

  await step('10.2 dark mode (screenshot)', async () => {
    const dark = await browser.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: 'dark', locale: 'en-US' });
    const p = await dark.newPage();
    await p.goto(BASE + '#/body?region=neck');
    await p.getByTestId('body-map-anterior').waitFor();
    await p.getByTestId('settings-trigger').click();
    await p.getByTestId('demo-load').click();
    await p.getByTestId('demo-banner').waitFor();
    await p.waitForFunction(() => Number(document.querySelector('[data-testid=metric-episodes]')?.dataset.value) >= 2);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(SHOTS, 'p3-10-dark-body.png') });
    await dark.close();
  });

  await step('11 no console errors or uncaught exceptions during the whole run', async () => {
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
