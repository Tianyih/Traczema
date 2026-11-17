/**
 * Phase 2 end-to-end check: drives the BUILT app in headless Chromium.
 *
 *   npm run build && npx vite preview --port 4173 --strictPort &
 *   SHOTS=/some/dir NODE_PATH=$(npm root -g) node e2e/phase2.cjs
 *
 * Open-Meteo is mocked with a response shaped exactly like the live API, so the test is
 * deterministic and does not consume the free tier's rate limit.
 */
const { chromium } = require('playwright');
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const SHOTS = process.env.SHOTS || path.join(process.cwd(), 'e2e-shots');
fs.mkdirSync(SHOTS, { recursive: true });

// ---------- helpers ----------
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
const iso = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
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
/** A real PNG (gradient) generated without dependencies. */
function makePng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = (x * 255) / w; raw[o + 1] = (y * 255) / h; raw[o + 2] = 160;
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

const ramp = (a, b) => Array.from({ length: 24 }, (_, i) => a + ((b - a) * i) / 23);

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    geolocation: { latitude: 51.507351, longitude: -0.127758 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  // ---- mock Open-Meteo (real response shape) ----
  const weatherRequests = [];
  let weatherMode = 'ok';
  await page.route(/open-meteo\.com/, (route) => {
    const url = new URL(route.request().url());
    weatherRequests.push(url);
    if (weatherMode === 'limited') {
      return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: true, reason: 'Daily API request limit exceeded. Please try again tomorrow.' }) });
    }
    const date = url.searchParams.get('start_date');
    const time = Array.from({ length: 24 }, (_, h) => `${date}T${pad(h)}:00`);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ latitude: 51.5, longitude: -0.13, utc_offset_seconds: 0, timezone: 'Europe/London', hourly: { time, temperature_2m: ramp(10, 20), relative_humidity_2m: ramp(60, 80) } }),
    });
  });

  const today = iso(0);
  const cell = (d) => page.locator(`[data-testid="day-cell"][data-date="${d}"]`);
  const drawer = page.getByTestId('daily-log-drawer');
  const setSlider = async (name, value, min = 0) => {
    const thumb = page.getByRole('slider', { name });
    await thumb.focus();
    await page.keyboard.press('Enter'); // from "not rated" -> min
    for (let i = min; i < value; i++) await page.keyboard.press('ArrowRight');
  };
  const openDay = async (d) => {
    await cell(d).click();
    await drawer.waitFor();
    await page.getByTestId('log-save').waitFor();
  };
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

  await page.goto(BASE);
  await page.getByTestId('calendar-grid').waitFor();

  // ===================== 1. calendar basics =====================
  await step('1.1 empty real database shows the empty state and a month grid with today highlighted', async () => {
    await page.getByTestId('empty-state').waitFor();
    truthy((await page.getByTestId('day-cell').count()) >= 28, 'month grid has at least 28 cells');
    eq(await cell(today).getAttribute('aria-current'), 'date');
    eq(await page.locator('[role=columnheader]').first().textContent(), 'Sun', 'English weeks start on Sunday');
    await shot('01-empty-calendar');
  });

  await step('1.2 future days are not openable', async () => {
    const future = iso(1);
    if ((await cell(future).count()) > 0) {
      eq(await cell(future).getAttribute('aria-disabled'), 'true');
      await cell(future).click({ force: true });
      eq(await drawer.count(), 0, 'drawer must not open for a future day');
    }
  });

  // ===================== 2. bedding counter (derived) =====================
  const washDay = iso(-3);
  await step('2.1 log a wash 3 days ago (bedding toggle only)', async () => {
    await openDay(washDay);
    await page.getByTestId('bedding-washed').click();
    eq(await page.getByTestId('bedding-days').getAttribute('data-days'), '0', 'wash day counts as 0');
    await page.getByTestId('log-save').click();
    await drawer.waitFor({ state: 'detached' });
    eq(await cell(washDay).getByTestId('badge-bedding').count(), 1, 'bedding badge on the wash day');
    eq(await cell(washDay).getAttribute('data-severity'), '', 'no severity recorded for that day');
  });

  // ===================== 3. full daily log =====================
  await step('3.1 drawer opens with the full date and all ten sections', async () => {
    await openDay(today);
    const title = await page.getByTestId('log-title').textContent();
    truthy(title.includes(String(new Date().getFullYear())), `title has the year: ${title}`);
    for (const name of ['Photos', 'Notes', 'Eczema severity', 'Diet', 'Weather & environment', 'Exercise & sweat', 'Shower / bathing', 'Clothing', 'Bedding hygiene', 'Stress & sleep']) {
      eq(await drawer.getByRole('region', { name, exact: true }).count(), 1, `section ${name}`);
    }
    await shot('02-drawer-top');
  });

  await step('3.2 bedding counter is DERIVED from the earlier wash (3 days) and no manual override is offered', async () => {
    eq(await page.getByTestId('bedding-days').getAttribute('data-days'), '3');
    eq(await page.locator('#bedding-override').count(), 0, 'override hidden once an explicit wash exists');
  });

  await step('3.3 toggling "washed today" resets the counter to 0 immediately; toggling off restores 3', async () => {
    await page.getByTestId('bedding-washed').click();
    eq(await page.getByTestId('bedding-days').getAttribute('data-days'), '0');
    await page.getByTestId('bedding-washed').click();
    eq(await page.getByTestId('bedding-days').getAttribute('data-days'), '3');
  });

  await step('3.4 sliders expose an accessible name on the thumb; start as "Not rated"', async () => {
    eq(await page.getByTestId('severity-value').textContent(), 'Not rated');
    eq(await page.getByRole('slider', { name: /Overall severity/ }).count(), 1);
    eq(await page.getByRole('slider', { name: /Itch intensity/ }).count(), 1);
    eq(await page.getByRole('slider', { name: /Stress level/ }).count(), 1);
  });

  await step('3.5 severity / itch / stress via keyboard', async () => {
    await setSlider(/Overall severity/, 6, 0);
    await setSlider(/Itch intensity/, 4, 0);
    await setSlider(/Stress level/, 7, 1);
    eq(await page.getByTestId('severity-value').textContent(), '6');
    eq(await page.getByTestId('itch-value').textContent(), '4');
    eq(await page.getByTestId('stress-value').textContent(), '7');
  });

  await step('3.6 notes: bold toolbar wraps the selection; preview renders it (and escapes HTML)', async () => {
    const box = page.getByTestId('notes-input');
    await box.fill('very itchy <b>x</b>');
    await box.evaluate((el) => el.setSelectionRange(5, 10));
    await page.getByRole('button', { name: 'Bold' }).click();
    eq(await box.inputValue(), 'very **itchy** <b>x</b>');
    await page.getByRole('button', { name: 'Preview' }).click();
    const html = await page.getByTestId('notes-preview').innerHTML();
    truthy(/<strong>itchy<\/strong>/.test(html), 'bold rendered');
    truthy(html.includes('&lt;b&gt;x&lt;/b&gt;'), 'raw HTML is shown as text, not injected');
    await page.getByRole('button', { name: 'Edit' }).click();
  });

  await step('3.7 diet: preset chips toggle, "none" chip, and a custom tag is created and selected', async () => {
    await page.getByTestId('diet-dairy').click();
    await page.getByTestId('diet-spicy').click();
    eq(await page.getByTestId('diet-dairy').getAttribute('aria-pressed'), 'true');
    await page.getByTestId('diet-custom-input').fill('Mango');
    await page.getByTestId('diet-custom-input').press('Enter');
    await page.getByRole('button', { name: 'Mango' }).waitFor();
    eq(await page.getByRole('button', { name: 'Mango' }).getAttribute('aria-pressed'), 'true');
  });

  await step('3.8 weather: auto-fill uses rounded coordinates, fills the fields, marks the source', async () => {
    await page.getByTestId('weather-autofill').click();
    await page.getByTestId('weather-status').waitFor();
    eq(await page.locator('#weather-temp').inputValue(), '15');
    eq(await page.locator('#weather-humidity').inputValue(), '70');
    eq(await page.getByTestId('weather-status').textContent(), 'Filled from Open-Meteo. You can edit the values.');
    const u = weatherRequests.at(-1);
    eq(u.hostname, 'api.open-meteo.com', "today can only come from the forecast service");
    eq(u.searchParams.get('latitude'), '51.51', 'latitude rounded to 2 dp');
    eq(u.searchParams.get('longitude'), '-0.13', 'longitude rounded to 2 dp');
    eq(u.searchParams.get('start_date'), today);
  });

  await step('3.9 weather: manual override flips the source to "Entered manually"', async () => {
    await page.locator('#weather-temp').fill('16.5');
    eq(await page.getByTestId('weather-source').textContent(), 'Entered manually');
  });

  await step('3.10 weather: a rate-limit response shows a helpful message and keeps manual values', async () => {
    weatherMode = 'limited';
    await page.getByTestId('weather-autofill').click();
    await page.getByTestId('weather-status').getByText(/busy/).waitFor();
    eq(await page.locator('#weather-temp').inputValue(), '16.5', 'manual value preserved');
    weatherMode = 'ok';
  });

  await step('3.11 exercise & sweat', async () => {
    await page.locator('#exercise-duration').fill('45');
    await page.getByTestId('exercise-activity').selectOption('running');
    await page.getByTestId('sweat').getByRole('radio', { name: 'Heavy' }).click();
    eq(await page.getByTestId('sweat').getByRole('radio', { name: 'Heavy' }).getAttribute('aria-checked'), 'true');
  });

  await step('3.12 shower: three-state, then duration / water temperature / scrubbing / moisturizer', async () => {
    eq(await page.getByTestId('shower-temp').count(), 0, 'details hidden until "Showered"');
    await page.getByTestId('shower-state').getByRole('radio', { name: 'Showered' }).click();
    await page.locator('#shower-duration').fill('12');
    await page.getByTestId('shower-temp').getByRole('radio', { name: /Hot/ }).click();
    await page.getByTestId('shower-cleansing').getByRole('radio', { name: 'Moderate' }).click();
    await page.getByTestId('shower-moisturizer').click();
    eq(await page.getByTestId('shower-moisturizer').getAttribute('aria-checked'), 'true');
  });

  await step('3.13 clothing, stress/sleep hours + quality', async () => {
    await page.getByTestId('clothing-cotton').click();
    await page.getByTestId('clothing-tight_friction').click();
    await page.locator('#sleep-hours').fill('7.5');
    await page.getByTestId('sleep-quality').getByRole('radio', { name: '4', exact: true }).click();
    eq(await page.locator('#sleep-hours').inputValue(), '7.5');
  });

  await step('3.14 photos: upload a real image -> resized JPEG preview, tag it', async () => {
    await page.getByTestId('photo-input').setInputFiles({ name: 'rash.png', mimeType: 'image/png', buffer: makePng(640, 480) });
    await page.getByTestId('photo-card').waitFor();
    eq(await page.getByTestId('photo-card').count(), 1);
    await page.getByRole('button', { name: 'Tags' }).click();
    await page.getByRole('button', { name: 'Flare', exact: true }).click();
    const img = page.getByTestId('photo-card').locator('img');
    await img.waitFor();
    truthy((await img.evaluate((i) => i.naturalWidth)) > 0, 'preview image decoded');
  });

  await step('3.15 a non-image file is rejected with a message', async () => {
    await page.getByTestId('photo-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await page.getByTestId('photo-error').waitFor();
    eq(await page.getByTestId('photo-card').count(), 1, 'still just one photo');
  });

  await step('3.16 dirty indicator, then Save closes the drawer', async () => {
    eq(await page.getByTestId('log-dirty').textContent(), 'Unsaved changes');
    await shot('03-drawer-filled');
    await page.getByTestId('log-save').click();
    await drawer.waitFor({ state: 'detached' });
  });

  await step('3.17 the calendar cell now shows severity, heat colour, photo badge', async () => {
    const c = cell(today);
    eq(await c.getAttribute('data-severity'), '6');
    const bg = await c.evaluate((el) => getComputedStyle(el).backgroundColor);
    truthy(bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)', `heat colour applied: ${bg}`);
    eq((await c.getByTestId('badge-photos').textContent()).trim(), '1');
    eq(await page.getByTestId('empty-state').count(), 0, 'empty state gone');
    await shot('04-calendar-with-entry');
  });

  // ===================== 4. persistence & dirty guard =====================
  await step('4.1 reopening restores every value (persisted in IndexedDB, incl. the photo Blob)', async () => {
    await openDay(today);
    eq(await page.getByTestId('severity-value').textContent(), '6');
    eq(await page.getByTestId('diet-dairy').getAttribute('aria-pressed'), 'true');
    eq(await page.locator('#weather-temp').inputValue(), '16.5');
    eq(await page.getByTestId('shower-moisturizer').getAttribute('aria-checked'), 'true');
    eq(await page.getByTestId('photo-card').count(), 1);
    eq(await page.getByTestId('bedding-days').getAttribute('data-days'), '3');
    truthy((await page.getByTestId('notes-input').inputValue()).includes('**itchy**'));
    eq(await page.getByTestId('log-dirty').textContent(), '', 'clean after load');
  });

  await step('4.2 unsaved-changes guard: Escape with edits asks first; "Keep editing" stays', async () => {
    await page.getByTestId('diet-eggs').click();
    await page.keyboard.press('Escape');
    await page.getByRole('alertdialog', { name: 'Discard your unsaved changes?' }).waitFor();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    eq(await drawer.count(), 1, 'drawer still open');
  });

  await step('4.3 ...and "Discard" closes WITHOUT saving the edit', async () => {
    await page.keyboard.press('Escape');
    await page.getByTestId('log-discard').click();
    await drawer.waitFor({ state: 'detached' });
    await openDay(today);
    eq(await page.getByTestId('diet-eggs').getAttribute('aria-pressed'), 'false', 'discarded edit was not saved');
    await page.keyboard.press('Escape'); // clean -> closes immediately, no prompt
    await drawer.waitFor({ state: 'detached' });
  });

  await step('4.4 day navigation inside the drawer (prev works, next disabled on today)', async () => {
    await openDay(today);
    eq(await page.getByTestId('log-next').isDisabled(), true);
    await page.getByTestId('log-prev').click();
    await page.waitForFunction((d) => document.querySelector('[data-testid=log-title]')?.textContent?.includes(String(Number(d.slice(8)))), iso(-1));
    eq(await page.getByTestId('severity-value').textContent(), 'Not rated', 'yesterday is blank');
    eq(await page.getByTestId('bedding-days').getAttribute('data-days'), '2', 'derived 2 days since the wash 3 days ago');
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'detached' });
  });

  await step('4.4b weather for a PAST day comes from the archive service (not the rate-limited forecast one)', async () => {
    await openDay(iso(-2));
    const before = weatherRequests.length;
    await page.getByTestId('weather-autofill').click();
    await page.getByTestId('weather-status').waitFor();
    const u = weatherRequests[before];
    eq(u.hostname, 'archive-api.open-meteo.com');
    eq(u.searchParams.get('start_date'), iso(-2));
    eq(await page.locator('#weather-temp').inputValue(), '15');
    await page.keyboard.press('Escape');
    await page.getByTestId('log-discard').click();
    await drawer.waitFor({ state: 'detached' });
  });

  await step('4.5 delete removes the entry and its photo after confirmation', async () => {
    await openDay(today);
    await page.getByTestId('log-delete').click();
    await page.getByTestId('log-delete-yes').click();
    await drawer.waitFor({ state: 'detached' });
    eq(await cell(today).getAttribute('data-severity'), '');
    eq(await cell(today).getByTestId('badge-photos').count(), 0);
  });

  // ===================== 5. calendar navigation =====================
  await step('5.1 month / week views, prev / next / today', async () => {
    const label0 = await page.getByTestId('calendar-label').textContent();
    await page.getByTestId('cal-prev').click();
    truthy((await page.getByTestId('calendar-label').textContent()) !== label0, 'label changed');
    await page.getByTestId('cal-today').click();
    eq(await page.getByTestId('calendar-label').textContent(), label0);
    await page.getByTestId('view-week').click();
    eq(await page.getByTestId('calendar-grid').getAttribute('data-view'), 'week');
    eq(await page.getByTestId('day-cell').count(), 7);
    await shot('05-week-view');
    await page.getByTestId('view-month').click();
  });

  await step('5.2 keyboard: arrows move focus, Enter opens, Escape closes and returns focus to the cell', async () => {
    await cell(today).focus();
    await page.keyboard.press('ArrowLeft');
    eq(await page.evaluate(() => document.activeElement?.getAttribute('data-date')), iso(-1));
    await page.keyboard.press('Enter');
    await drawer.waitFor();
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'detached' });
    await page.waitForFunction((d) => document.activeElement?.getAttribute('data-date') === d, iso(-1));
  });

  // ===================== 6. language =====================
  await step('6.1 EN / 中文 toggle switches the whole UI, month format, and week start', async () => {
    await page.getByTestId('lang-toggle').click();
    eq(await page.evaluate(() => document.documentElement.lang), 'zh-CN');
    const label = await page.getByTestId('calendar-label').textContent();
    truthy(/^\d{4}年\d{1,2}月$/.test(label), `zh month label: ${label}`);
    eq(await page.locator('[role=columnheader]').first().textContent(), '周一', 'Chinese weeks start on Monday');
    eq((await page.getByTestId('nav-nav_calendar').textContent()).trim(), '日历');
    await openDay(today);
    const title = await page.getByTestId('log-title').textContent();
    truthy(/\d{4}年\d{1,2}月\d{1,2}日 星期/.test(title), `zh full date: ${title}`);
    eq(await drawer.getByRole('region', { name: '照片', exact: true }).count(), 1);
    eq(await drawer.getByRole('region', { name: '床品卫生', exact: true }).count(), 1);
    await page.waitForTimeout(400); // let the slide-in animation finish
    await shot('06-drawer-zh');
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'detached' });
  });

  await step('6.2 the choice persists across a reload', async () => {
    await page.reload();
    await page.getByTestId('calendar-grid').waitFor();
    eq(await page.evaluate(() => document.documentElement.lang), 'zh-CN');
  });

  await step('6.3 stored data uses language-agnostic keys, not labels', async () => {
    // log something in zh, then inspect IndexedDB directly
    await openDay(today);
    await page.getByTestId('diet-dairy').click();
    await page.getByTestId('sweat').getByRole('radio', { name: '大量' }).click();
    await page.getByTestId('log-save').click();
    await drawer.waitFor({ state: 'detached' });
    const stored = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('traczema');
          req.onsuccess = () => {
            const tx = req.result.transaction('dailyLogs');
            const all = tx.objectStore('dailyLogs').getAll();
            all.onsuccess = () => resolve(all.result.find((l) => l.exercise));
          };
        }),
    );
    eq(stored.dietTags, ['dairy']);
    eq(stored.exercise.sweat, 'heavy');
    await page.getByTestId('lang-toggle').click(); // back to English
    eq(await page.evaluate(() => document.documentElement.lang), 'en');
  });

  // ===================== 7. demo data =====================
  await step('7.1 "Load demo data" fills a SEPARATE store, shows the banner and a heat-mapped calendar', async () => {
    await page.getByTestId('settings-trigger').click();
    await page.getByTestId('demo-load').click();
    await page.getByTestId('demo-banner').waitFor();
    await page.getByTestId('demo-message').waitFor();
    await page.getByTestId('calendar-grid').waitFor();
    const filled = await page.locator('[data-testid=day-cell]:not([data-severity=""])').count();
    truthy(filled >= 10, `demo cells with severity this month: ${filled}`);
    await page.getByTestId('view-month').click();
    await page.getByTestId('cal-prev').click();
    const filledPrev = await page.locator('[data-testid=day-cell]:not([data-severity=""])').count();
    truthy(filledPrev >= 15, `demo cells with severity last month: ${filledPrev}`);
    await shot('07-demo-calendar');
  });

  await step('7.2 demo data shows photo, active-flare and bedding-wash badges', async () => {
    let photos = 0, flares = 0, bedding = 0;
    for (let i = 0; i < 3; i++) {
      photos += await page.getByTestId('badge-photos').count();
      flares += await page.getByTestId('badge-flare').count();
      bedding += await page.getByTestId('badge-bedding').count();
      await page.getByTestId('cal-prev').click();
    }
    await page.getByTestId('cal-today').click();
    truthy(photos > 0 && flares > 0 && bedding > 0, `badges: photos=${photos} flares=${flares} bedding=${bedding}`);
  });

  await step('7.2b future days never show badges (lesion state must not be carried into the future)', async () => {
    await page.getByTestId('cal-today').click();
    const bad = await page.evaluate((t) => [...document.querySelectorAll('[data-testid=day-cell]')].filter((c) => c.getAttribute('data-date') > t && c.querySelector('[data-testid^=badge-]')).length, today);
    eq(bad, 0, 'cells after today with badges');
  });

  await step('7.2c the status toast is pinned to the VIEWPORT bottom, not inside the header', async () => {
    await page.getByTestId('settings-trigger').click();
    await page.getByTestId('demo-load').click();
    const box = await page.getByTestId('demo-message').boundingBox();
    const vh = page.viewportSize().height;
    truthy(box.y > vh * 0.7, `toast y=${box.y} should be near the bottom of a ${vh}px viewport`);
  });

  await step('7.3 the drawer works on demo data (bedding counter derived from demo washes)', async () => {
    await page.getByTestId('cal-today').click();
    await openDay(today);
    const days = Number(await page.getByTestId('bedding-days').getAttribute('data-days'));
    truthy(days >= 0 && days <= 25, `derived bedding days: ${days}`);
    eq(await page.getByTestId('log-delete').count(), 1, 'demo day has a stored entry');
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'detached' });
  });

  await step('7.4 "Back to my data": no frame ever shows demo data in real mode; the REAL entries are untouched', async () => {
    const frames = await page.evaluate(async () => {
      const out = [];
      document.querySelector('[data-testid=demo-exit]').click();
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const banner = !!document.querySelector('[data-testid=demo-banner]');
        const colored = document.querySelectorAll('[data-testid=day-cell]:not([data-severity=""])').length;
        out.push({ banner, colored });
      }
      return out;
    });
    const stale = frames.filter((f) => !f.banner && f.colored > 0);
    eq(stale, [], 'a frame in real mode showed coloured demo cells (stale live-query result)');
    await page.getByTestId('demo-banner').waitFor({ state: 'detached' });
    eq(await cell(today).getAttribute('data-severity'), '', 'real today has no severity (only diet + sweat were logged)');
    eq(await cell(washDay).getByTestId('badge-bedding').count(), 1, 'real wash-day badge still there');
  });

  await step('7.5 "Clear demo data" empties only the demo store', async () => {
    await page.getByTestId('settings-trigger').click();
    await page.getByTestId('demo-load').click();
    await page.getByTestId('demo-banner').waitFor();
    await page.getByTestId('settings-trigger').click();
    await page.getByTestId('demo-clear').click();
    await page.getByTestId('demo-banner').waitFor({ state: 'detached' });
    // The real database's rows load asynchronously (stale demo results are rejected), so wait for them.
    await cell(washDay).getByTestId('badge-bedding').waitFor({ timeout: 5000 });
    eq(await cell(washDay).getByTestId('badge-bedding').count(), 1, 'real data intact after clearing demo');
    const demoRows = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('traczema-demo');
          req.onsuccess = () => {
            const r = req.result.transaction('dailyLogs').objectStore('dailyLogs').count();
            r.onsuccess = () => resolve(r.result);
          };
        }),
    );
    eq(demoRows, 0, 'demo database emptied');
  });

  // ===================== 8. responsive + dark =====================
  await step('8.1 phone layout: no horizontal scroll; drawer is a bottom sheet', async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
    const p = await phone.newPage();
    await p.goto(BASE);
    await p.getByTestId('calendar-grid').waitFor();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    eq(overflow, 0, 'no horizontal overflow on the calendar');
    await p.getByTestId('settings-trigger').click();
    await p.getByTestId('demo-load').click();
    await p.getByTestId('demo-banner').waitFor();
    await p.screenshot({ path: path.join(SHOTS, '08-phone-calendar.png') });
    await p.locator(`[data-testid="day-cell"][data-date="${today}"]`).click();
    await p.getByTestId('daily-log-drawer').waitFor();
    await p.waitForTimeout(400);
    const overflow2 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    eq(overflow2, 0, 'no horizontal overflow with the drawer open');
    const box = await p.getByTestId('daily-log-drawer').boundingBox();
    truthy(box.y > 10 && box.width >= 380, `bottom sheet geometry: y=${box.y} w=${box.width}`);
    await p.screenshot({ path: path.join(SHOTS, '09-phone-drawer.png') });
    await phone.close();
  });

  await step('8.2 dark mode renders (screenshot)', async () => {
    const dark = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark', locale: 'en-US' });
    const p = await dark.newPage();
    await p.goto(BASE);
    await p.getByTestId('calendar-grid').waitFor();
    await p.getByTestId('settings-trigger').click();
    await p.getByTestId('demo-load').click();
    await p.getByTestId('demo-banner').waitFor();
    await p.locator(`[data-testid="day-cell"][data-date="${today}"]`).click();
    await p.getByTestId('daily-log-drawer').waitFor();
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(SHOTS, '10-dark-drawer.png') });
    await dark.close();
  });

  await step('9 no console errors or uncaught exceptions during the whole run (the one deliberate mocked 429 excluded)', async () => {
    eq(consoleErrors.filter((m) => !/status of 429/.test(m)), []);
  });

  await browser.close();
  console.log(log.join('\n'));
  console.log(`\n${log.length - failures.length}/${log.length} steps passed`);
  if (failures.length) {
    console.log('FAILED:', failures.join(' | '));
    process.exit(1);
  }
})();
