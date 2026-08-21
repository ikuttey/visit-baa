import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.css': 'text/css', '.js': 'text/javascript' };
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/css/app.css"></head><body><main class="page-wrap"><section id="selector" class="panel facilities-selector"></section><div id="views"></div></main></body></html>`;

const server = createServer(async (request, response) => {
  try {
    if (request.url === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.url === '/facility-test') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(fixture);
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root) || !['.js', '.css'].includes(path.extname(file))) throw new Error('Not found');
    response.writeHead(200, { 'content-type': types[path.extname(file)] });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${address.port}/facility-test`);
  await page.evaluate(async () => {
    const { FacilitiesSelector, renderFacilitiesView } = await import('/assets/js/facilities-ui.js');
    const selector = new FacilitiesSelector(document.getElementById('selector'));
    selector.load('fishing', ['Bait included', 'WiFi', 'Fish barbecue arrangement']);
    window.facilitiesTest = { selector, renderFacilitiesView };
  });

  await page.getByRole('heading', { name: 'Fishing Facilities & Services' }).waitFor();
  assert.equal(await page.getByLabel('Bait included').first().isChecked(), true);
  assert.equal(await page.locator('#customFacilities').inputValue(), 'WiFi, Fish barbecue arrangement');
  const optionBox = await page.getByLabel('Bait included').first().locator('..').boundingBox();
  assert.ok(optionBox.height >= 44, 'facility choices need comfortable mobile touch targets');

  await page.getByLabel('Search facilities and services').fill('life');
  assert.ok(await page.getByLabel('Life jackets').count() >= 1);
  assert.equal(await page.getByLabel('Bait included').first().locator('..').isHidden(), true);
  await page.getByLabel('Search facilities and services').fill('');

  await page.evaluate(() => window.facilitiesTest.selector.switchCategory('accommodation'));
  await page.getByRole('heading', { name: 'Facilities & Amenities' }).waitFor();
  await page.getByLabel('Free Wi-Fi').first().check();
  await page.evaluate(() => window.facilitiesTest.selector.switchCategory('fishing'));
  assert.equal(await page.getByLabel('Bait included').first().isChecked(), true, 'category switches must retain in-editor selections');

  const collected = await page.evaluate(() => window.facilitiesTest.selector.collect());
  assert.deepEqual(collected, ['Bait included', 'WiFi', 'Fish barbecue arrangement']);

  const categoryCoverage = await page.evaluate((categories) => categories.map((category) => {
    window.facilitiesTest.selector.switchCategory(category);
    const first = document.querySelector('#selector input[type="checkbox"]');
    first.checked = true;
    first.dispatchEvent(new Event('change', { bubbles: true }));
    const custom = document.getElementById('customFacilities');
    custom.value = `Custom ${category} service`;
    const values = window.facilitiesTest.selector.collect();
    return {
      category,
      optionCount: document.querySelectorAll('#selector .facility-option').length,
      hasSelected: values.includes(first.value),
      hasCustom: values.includes(`Custom ${category} service`)
    };
  }), [
    'accommodation', 'excursion', 'diving', 'snorkelling', 'fishing', 'watersports',
    'food_dining', 'transfer', 'conservation_experience', 'community_experience', 'other'
  ]);
  categoryCoverage.forEach((result) => {
    assert.ok(result.optionCount > 0, `${result.category} should render facility choices`);
    assert.equal(result.hasSelected, true, `${result.category} should collect configured facilities`);
    assert.equal(result.hasCustom, true, `${result.category} should collect custom facilities`);
  });

  await page.evaluate(() => {
    const listing = {
      title: 'Reef Fishing Charter', category: 'fishing',
      amenities: ['Fishing equipment included', 'Life jackets', 'GPS navigation', 'Fish barbecue arrangement']
    };
    const publicView = window.facilitiesTest.renderFacilitiesView(listing);
    const adminView = window.facilitiesTest.renderFacilitiesView(listing, { context: 'admin' });
    document.getElementById('views').append(publicView, adminView);
  });
  await page.getByRole('heading', { name: 'Fishing equipment & services' }).waitFor();
  await page.getByRole('heading', { name: 'Facilities & services', exact: true }).waitFor();
  const toggle = page.locator('.public-facilities-view .facilities-toggle');
  assert.equal(await toggle.textContent(), 'Show all facilities');
  await toggle.click();
  assert.equal(await toggle.textContent(), 'Show fewer');
  await toggle.click();
  assert.equal(await toggle.textContent(), 'Show all facilities');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'facilities UI must not overflow at 375px');
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Facilities browser checks passed for dynamic switching, search, edit preservation, public/admin views, and mobile overflow.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
