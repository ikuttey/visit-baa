import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root)) throw new Error('Not found');
    response.writeHead(200, { 'content-type':types[path.extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel:'chrome', headless:true });

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport:window.innerWidth, document:document.documentElement.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport, `${label} overflows horizontally (${dimensions.document}/${dimensions.viewport})`);
}

try {
  const homeContext = await browser.newContext({ viewport:{ width:1280, height:900 } });
  const homePage = await homeContext.newPage();
  await homePage.goto(`${baseUrl}/index.html`, { waitUntil:'networkidle' });
  const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const checkout = new Date(Date.parse(`${future}T12:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
  const plannerCheckout = new Date(Date.parse(`${future}T12:00:00Z`) + 4 * 86400000).toISOString().slice(0, 10);
  await homePage.locator('#islandSelect').selectOption({ label:'Maalhos' });
  await homePage.locator('#whenButton').click();
  await homePage.locator('#heroCheckin').fill(future);
  await homePage.locator('#heroCheckout').fill(checkout);
  await homePage.locator('#applyWhen').click();
  assert.match(await homePage.locator('#whenButton').textContent(), /2 nights/);
  await homePage.locator('#travelerSelect').selectOption('3');
  assert.equal(await homePage.locator('.manta-planner-launch').count(), 1, 'customer pages should load one manta launcher');
  assert.equal(await homePage.locator('.manta-launch-hand,.manta-launch-bubble').count(), 0, 'manta must not include a separate hand or permanent bubble');
  assert.equal(await homePage.locator('.manta-planner-launch').getAttribute('aria-label'), 'Open Visit Baa Trip Planner');
  await homePage.locator('.manta-planner-launch').click();
  await homePage.locator('.manta-planner-drawer[open]').waitFor();
  await homePage.waitForFunction(() => !document.querySelector('.manta-question')?.textContent.includes('Loading current published'));
  assert.equal(await homePage.locator('.manta-planner-launch').isHidden(), true, 'launcher should not overlap its open planner');
  assert.match(await homePage.locator('.manta-question').textContent(), /Which island|No islands or hubs/);
  const drawerBox=await homePage.locator('.manta-planner-drawer').boundingBox();
  assert.ok(drawerBox.width>=420&&drawerBox.width<=460, `desktop drawer width should be professional (${drawerBox.width}px)`);
  const islandCards=homePage.locator('.manta-question .option-card');
  assert.equal(await islandCards.count(),13,'all 13 customer-selectable Baa islands must appear independently of listings');
  assert.ok(await homePage.locator('.manta-question .manta-option-track').evaluate((node)=>node.scrollWidth>node.clientWidth),'island choices must scroll horizontally');
  assert.equal(await homePage.getByRole('button',{name:'Next options'}).isVisible(),true,'desktop carousel needs a next arrow');
  await homePage.locator('.manta-question .manta-chip', { hasText:/^Dharavandhoo$/ }).click();
  assert.equal(await homePage.locator('.manta-question .manta-chip',{hasText:/Dharavandhoo$/}).getAttribute('aria-pressed'),'true');
  await homePage.locator('.manta-question .manta-chip', { hasText:/^Maalhos$/ }).click();
  assert.equal(await homePage.locator('.manta-question [aria-pressed="true"]').count(),2,'customers must be able to select multiple islands');
  await homePage.locator('.manta-question-footer').getByRole('button', { name:'Continue' }).click();
  await homePage.getByText('What would you like to do there?',{exact:true}).waitFor();
  assert.equal(await homePage.locator('.manta-question .option-card').count(),15,'the complete activity catalog must appear independently of listings');
  await homePage.getByRole('button',{name:'Manta and marine-life experiences',exact:true}).waitFor();
  const activityTrack=homePage.locator('.manta-question .manta-option-track');
  await activityTrack.evaluate((node)=>{node.scrollLeft=node.scrollWidth;});
  const activityScrollBefore=await activityTrack.evaluate((node)=>node.scrollLeft);
  assert.ok(activityScrollBefore>0,'activity carousel must be horizontally scrollable');
  await homePage.getByRole('button',{name:'Beach and relaxation',exact:true}).click();
  assert.equal(await homePage.getByRole('button',{name:/Beach and relaxation/}).getAttribute('aria-pressed'),'true');
  await homePage.waitForTimeout(50);
  assert.ok(await activityTrack.evaluate((node)=>node.scrollLeft)>0,'selecting an activity must not reset the carousel to the start');
  await homePage.locator('.manta-question-footer').getByRole('button',{name:'Continue'}).click();
  await homePage.getByText('How many people are travelling?', { exact:true }).waitFor();
  await homePage.locator('.manta-question-footer').getByRole('button',{name:'Continue'}).click();
  await homePage.getByText('When will you arrive and leave?', { exact:true }).waitFor();
  await homePage.locator('.manta-question input[aria-label="Arrival date"]').fill(future);
  await homePage.locator('.manta-question input[aria-label="Departure date"]').fill(plannerCheckout);
  await homePage.locator('.manta-question-footer').getByRole('button',{name:'Continue'}).click();
  await homePage.getByText(/How should I split your 4 nights between the islands\?/).waitFor();
  assert.equal(await homePage.locator('.manta-night-allocation .manta-counter').count(),2,'every selected island needs a night allocation');
  await homePage.locator('.manta-question-footer').getByRole('button',{name:'Continue'}).click();
  await homePage.getByText('Which island should each activity come from, and for how many days?',{exact:true}).waitFor();
  assert.equal(await homePage.locator('.manta-activity-plan-card').count(),1,'every selected activity needs a customizable plan');
  await homePage.getByLabel('Beach and relaxation island').selectOption('Dharavandhoo');
  await homePage.getByLabel('Beach and relaxation activity days').fill('2');
  await homePage.locator('.manta-question-footer').getByRole('button',{name:'Continue'}).click();
  await homePage.getByText('Would you like to set a total budget?',{exact:true}).waitFor();
  assert.equal(await homePage.getByText(/Where should your journey (?:begin|end)\?/).count(),0,'Manta must not ask pickup or drop-off questions');
  await homePage.locator('.manta-question-footer').getByRole('button',{name:'Skip'}).click();
  assert.match(await homePage.locator('.manta-transport-note').textContent(),/guesthouse will arrange arrival and departure transportation/i);
  assert.doesNotMatch(await homePage.locator('.manta-confirm').textContent(),/Pickup|Final drop-off/);
  assert.match(await homePage.locator('.manta-confirm').textContent(),/Beach and relaxation: Dharavandhoo · 2 days/);
  await homePage.locator('.manta-question-footer').getByRole('button',{name:'Search Visit Baa'}).click();
  await homePage.getByText('binfalhaa guest house',{exact:true}).waitFor();
  assert.match(await homePage.locator('.manta-result-card',{hasText:'binfalhaa guest house'}).textContent(),/Availability (?:and price )?confirmation required/);
  assert.match(await homePage.locator('.manta-result-card',{hasText:'binfalhaa guest house'}).textContent(),/\$50\.00 per room .* total pending/);
  assert.match(await homePage.locator('.manta-transport-note').textContent(),/Transportation is arranged directly by your selected guesthouse/i);
  assert.equal(await homePage.getByRole('button',{name:'Customize activity islands and days'}).count(),1,'customers must be able to reopen activity customization from results');
  assert.equal(await homePage.locator('.manta-result-segment').filter({hasText:/Beach and relaxation in Dharavandhoo · Day/}).count(),2,'the customized number of activity days must be planned separately');
  assert.equal(await homePage.locator('.manta-result-segment').filter({hasText:/Transport:|LOCAL PICKUP|LOCAL DROP-OFF/}).count(),0,'transport must not appear in Manta results');
  assert.equal(await homePage.locator('.manta-result-segment').filter({hasText:'No real published option'}).count(),0,'results must not render empty segment headings');
  await homePage.locator('.manta-question-footer').getByRole('button',{name:'Add selected services to My Baa Trip'}).click();
  await homePage.locator('.manta-auth-prompt').waitFor();
  assert.ok(await homePage.evaluate(()=>Boolean(localStorage.getItem('baa_planner_draft'))),'anonymous planner draft must remain on the device');
  await homePage.locator('.manta-planner-close').click();
  await homePage.locator('.manta-planner-launch').waitFor({state:'visible'});
  await Promise.all([homePage.waitForURL(/listings\.html\?/), homePage.locator('#heroSearch .searchbtn').click()]);
  const homeSearch = new URL(homePage.url()).searchParams;
  assert.equal(homeSearch.get('island'), 'Maalhos'); assert.equal(homeSearch.get('category'), 'accommodation'); assert.equal(homeSearch.get('checkin'), future); assert.equal(homeSearch.get('checkout'), checkout); assert.equal(homeSearch.get('adults'), '3');
  await homeContext.close();

  const filterContext = await browser.newContext({ viewport:{ width:1280, height:900 } });
  const filterPage = await filterContext.newPage();
  await filterPage.goto(`${baseUrl}/listings.html`, { waitUntil:'networkidle' });
  await filterPage.locator('#categoryFilter').selectOption('accommodation');
  await filterPage.waitForFunction(() => document.querySelector('#listingsMessage').hidden && new URL(location.href).searchParams.get('category') === 'accommodation');
  await filterPage.locator('#toggleFilters').click();
  await filterPage.getByLabel('Free Wi-Fi').check();
  await filterPage.locator('#applyFilters').click();
  await filterPage.waitForFunction(() => document.querySelector('#listingsMessage').hidden && new URL(location.href).searchParams.has('facilities'));
  assert.ok(await filterPage.locator('.listing-card').count() >= 1, 'legacy WiFi aliases should match the Free Wi-Fi filter');
  await filterPage.locator('#clearFilters').click();
  await filterPage.waitForFunction(() => document.querySelector('#listingsMessage').hidden && !new URL(location.href).searchParams.has('facilities'));
  await filterPage.locator('#categoryFilter').selectOption('transfer');
  assert.equal(await filterPage.locator('label[for="adultsFilter"]').textContent(), 'Passengers');
  await filterPage.locator('#categoryFilter').selectOption('accommodation');
  await filterPage.locator('#checkinFilter').fill(future);
  await filterPage.locator('#checkoutFilter').fill(checkout);
  await filterPage.locator('#applyFilters').click();
  await filterPage.waitForFunction(() => document.querySelector('#listingsMessage').hidden);
  assert.equal(await filterPage.locator('#listingsMessage.message.error').count(), 0, 'legacy projects must fall back when room views are not migrated');
  await filterContext.close();

  let listingId = '';
  for (const width of [320,375,430,768,1280]) {
    const context = await browser.newContext({ viewport:{ width, height:width < 700 ? 840 : 900 } });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (entry) => { if (entry.type() === 'error' && !entry.text().startsWith('Failed to load resource:')) errors.push(entry.text()); });
    await page.goto(`${baseUrl}/listings.html?island=Dharavandhoo&category=accommodation&adults=2&rooms=1`, { waitUntil:'networkidle' });
    await page.locator('#listingGrid').waitFor();
    assert.equal(await page.locator('#islandFilter').inputValue(), 'Dharavandhoo');
    assert.equal(await page.locator('#categoryFilter').inputValue(), 'accommodation');
    await page.locator('#toggleFilters').click();
    await page.locator('#advancedFilters').waitFor({ state:'visible' });
    assert.equal(await page.locator('.activity-search-field').first().isHidden(), true);
    await assertNoOverflow(page, `Listings page at ${width}px`);
    if (!listingId) listingId = await page.locator('.listing-card .button').first().getAttribute('href').then((href) => href ? new URL(href, baseUrl).searchParams.get('id') : '').catch(() => '');
    assert.deepEqual(errors, [], `Browser errors at ${width}px:\n${errors.join('\n')}`);
    await context.close();
  }

  const context = await browser.newContext({ viewport:{ width:375, height:840 } });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (listingId) {
    await page.goto(`${baseUrl}/listing.html?id=${encodeURIComponent(listingId)}`, { waitUntil:'networkidle' });
    await page.locator('.detail-grid').waitFor();
    await page.getByRole('button', { name:'Send booking enquiry' }).waitFor();
    await assertNoOverflow(page, 'Listing detail at 375px');
  }
  await page.goto(`${baseUrl}/traveler-register.html`, { waitUntil:'networkidle' });
  await page.getByRole('button', { name:'Create account' }).waitFor();
  await assertNoOverflow(page, 'Traveler registration at 375px');
  assert.deepEqual(errors, [], errors.join('\n'));
  await context.close();
  console.log(`Marketplace browser checks passed at 320, 375, 430, 768, and 1280px${listingId ? ' with a live listing detail' : ''}.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
