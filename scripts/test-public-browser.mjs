import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let localServer = null;
let baseUrl = process.env.BAA_TEST_BASE_URL?.replace(/\/$/, '');
if (!baseUrl) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.svg':'image/svg+xml' };
  localServer = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
      const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(root)) throw new Error('Not found');
      response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise((resolve) => localServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${localServer.address().port}`;
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function watchPage(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => errors.push(`request: ${request.url()} (${request.failure()?.errorText || 'failed'})`));
  page.on('response', (response) => {
    const optionalMarketplaceModel = /\/rest\/v1\/public_(?:reviews|accommodation_rooms|room_images|room_availability|room_rate_plans|listing_policies|promotions)\?/.test(response.url());
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico') && !(response.status() === 404 && optionalMarketplaceModel)) {
      errors.push(`response: HTTP ${response.status()} ${response.url()}`);
    }
  });
  return { page, errors };
}

async function firstPublicBusinessId(page) {
  return page.evaluate(async () => {
    const config = window.BAA_CONFIG;
    const response = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/public_businesses?select=id&limit=1`, {
      headers: { apikey: config.supabaseAnonKey }
    });
    if (!response.ok) throw new Error(`Public business probe failed with HTTP ${response.status}`);
    const rows = await response.json();
    return rows[0]?.id || '';
  });
}

async function assertLoadedImages(page) {
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  const failed = await page.locator('img').evaluateAll((images) => images
    .filter((image) => image.naturalWidth === 0)
    .map((image) => image.alt || image.src));
  assert.deepEqual(failed, [], `Broken public images: ${failed.join(', ')}`);
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const desktopWatch = await watchPage(desktop);
  await desktopWatch.page.goto(`${baseUrl}/listings.html`, { waitUntil: 'networkidle' });
  await desktopWatch.page.locator('#islandFilter').waitFor();
  assert.equal(await desktopWatch.page.locator('.message.error').count(), 0, 'Public listings rendered an error');

  const businessId = await firstPublicBusinessId(desktopWatch.page);
  if (businessId) {
    await desktopWatch.page.goto(`${baseUrl}/business.html?id=${encodeURIComponent(businessId)}`, { waitUntil: 'networkidle' });
    await desktopWatch.page.locator('.business-profile').waitFor();
    await desktopWatch.page.getByRole('heading', { name: 'Services offered' }).waitFor();
    await assertLoadedImages(desktopWatch.page);
  }

  await desktopWatch.page.goto(`${baseUrl}/business.html?id=00000000-0000-4000-8000-000000000001`, { waitUntil: 'networkidle' });
  await desktopWatch.page.getByText('Business unavailable').waitFor();
  assert.deepEqual(desktopWatch.errors, [], desktopWatch.errors.join('\n'));
  await desktop.close();

  if (businessId) {
    const mobile = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobileWatch = await watchPage(mobile);
    await mobileWatch.page.goto(`${baseUrl}/business.html?id=${encodeURIComponent(businessId)}`, { waitUntil: 'networkidle' });
    await mobileWatch.page.locator('.business-profile').waitFor();
    await assertLoadedImages(mobileWatch.page);
    const overflow = await mobileWatch.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, 'Public business page overflows horizontally at 375px');
    assert.deepEqual(mobileWatch.errors, [], mobileWatch.errors.join('\n'));
    await mobile.close();
  }

  console.log(`Public browser checks passed at ${baseUrl}${businessId ? ' with a verified business profile' : ''}.`);
} finally {
  await browser.close();
  if (localServer) await new Promise((resolve) => localServer.close(resolve));
}
