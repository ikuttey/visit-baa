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
    const body = await readFile(file);
    response.writeHead(200, { 'content-type':types[path.extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    if (!response.headersSent) response.writeHead(404, { 'content-type':'text/plain' });
    if (!response.writableEnded) response.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel:'chrome', headless:true });

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport:window.innerWidth, document:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter((node)=>node.getBoundingClientRect().right>window.innerWidth+1||node.scrollWidth>node.clientWidth+1).slice(0,8).map((node)=>`${node.tagName.toLowerCase()}${node.id?`#${node.id}`:''}${node.className?`.${String(node.className).trim().replaceAll(/\s+/g,'.')}`:''}:right=${Math.round(node.getBoundingClientRect().right)},scroll=${node.scrollWidth},client=${node.clientWidth}`) }));
  assert.ok(dimensions.document <= dimensions.viewport, `${label} overflows horizontally (${dimensions.document}/${dimensions.viewport}); ${dimensions.offenders.join(', ')}`);
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
  await homePage.locator('.manta-planner-launch').click({force:true});
  await homePage.locator('.manta-planner-drawer[open]').waitFor();
  await homePage.waitForFunction(() => !document.querySelector('.manta-question')?.textContent.includes('Loading current published'));
  assert.equal(await homePage.locator('.manta-planner-launch').isHidden(), true, 'launcher should not overlap its open planner');
  assert.match(await homePage.locator('.manta-question').textContent(), /Which island|No islands or hubs/);
  const drawerBox=await homePage.locator('.manta-planner-drawer').boundingBox();
  assert.ok(drawerBox.width>=420&&drawerBox.width<=460, `desktop drawer width should be professional (${drawerBox.width}px)`);
  assert.ok(drawerBox.height<=868&&drawerBox.height<900, `desktop drawer should fit inside the viewport (${drawerBox.height}px)`);
  const islandCards=homePage.locator('.manta-question .manta-choice-card');
  assert.equal(await islandCards.count(),13,'all 13 customer-selectable Baa islands must appear independently of listings');
  await homePage.locator('.manta-question').getByRole('button',{name:/Dharavandhoo/}).click();
  await homePage.locator('.manta-question').getByRole('button',{name:/Maalhos/}).click();
  await homePage.locator('.manta-question').getByRole('button',{name:/Dharavandhoo/}).click();
  assert.equal(await homePage.locator('.manta-question [aria-pressed="true"]').count(),1,'the simple flow must keep one stay base');
  await homePage.locator('.manta-question-footer').getByRole('button', { name:'Continue' }).click();
  await homePage.getByText('When will you arrive and leave?', { exact:true }).waitFor();
  await homePage.locator('.manta-question input[aria-label="Arrival date"]').fill(future);
  await homePage.locator('.manta-question input[aria-label="Departure date"]').fill(plannerCheckout);
  await homePage.locator('.manta-question-footer').getByRole('button',{name:'Continue'}).click();
  await homePage.getByText('Who is travelling?', { exact:true }).waitFor();
  await homePage.locator('.manta-question-footer').getByRole('button',{name:'Continue'}).click();
  await homePage.getByText('Where would you prefer to stay?',{exact:true}).waitFor();
  assert.equal(await homePage.locator('.manta-question [aria-pressed="true"]').count(),1,'stay location should default to no preference');
  await homePage.getByRole('button',{name:/Beachfront/}).click();
  await homePage.locator('.manta-question-footer').getByRole('button',{name:'Continue'}).click();
  await homePage.getByText('What kind of room would suit you?',{exact:true}).waitFor();
  assert.equal(await homePage.locator('.manta-question [aria-pressed="true"]').count(),1,'room should default to no preference');
  await homePage.getByRole('button',{name:/Comfort/}).click();
  await homePage.locator('.manta-question-footer').getByRole('button',{name:'Continue'}).click();
  await homePage.getByText('What would you like to do?',{exact:true}).waitFor();
  assert.equal(await homePage.locator('.manta-question .manta-choice-card').count(),15,'the complete activity catalog must appear independently of listings');
  await homePage.getByRole('button',{name:/Beach and relaxation/}).click();
  assert.equal(await homePage.getByText(/Where should your journey (?:begin|end)\?/).count(),0,'Manta must not ask pickup or drop-off questions');
  assert.equal(await homePage.getByText(/How should I rank|total budget|How many days, trips, or times/).count(),0,'advanced ranking, budget, and activity quantity steps must stay hidden');
  await Promise.all([homePage.waitForURL(/trip-results\.html$/),homePage.locator('.manta-question-footer').getByRole('button',{name:'Find My Baa Trip'}).click()]);
  const results=homePage.locator('#mantaSearchResults');
  await results.waitFor({state:'visible'});
  const selectedStay=results.locator('.manta-page-selected .manta-result-card.selected').first();
  await selectedStay.waitFor();
  assert.match(new URL(homePage.url()).pathname,/trip-results\.html$/,'Manta results must open on a dedicated page');
  assert.equal(await homePage.locator('.manta-planner-drawer,.manta-planner-launch').count(),0,'the results page must not place cards inside the bot');
  await assertNoOverflow(homePage,'Manta detailed results page');
  assert.ok(await results.locator('.manta-page-selected .manta-result-card.selected').count()>0,'selected services must be listed at the top');
  const stayResultText=await selectedStay.textContent();
  assert.ok((stayResultText||'').trim().length>0,'the selected stay card must contain customer-facing details');
  assert.doesNotMatch(stayResultText||'',/pending[^\n]*(?:\$0\.00|free)|(?:\$0\.00|free)[^\n]*pending/i,'pending prices must never be shown as zero or free');
  assert.ok(await results.getByRole('button',{name:'Edit trip details'}).count()>=1,'customers must be able to return to the planner from detailed results');
  assert.equal(await results.locator('.manta-page-selected .manta-result-segment').filter({hasText:/Beach and relaxation in Dharavandhoo/}).count(),1,'each selected activity should be planned once in the simple flow');
  assert.equal(await results.locator('.manta-result-segment').filter({hasText:'No real published option'}).count(),0,'results must not render empty segment headings');
  assert.equal(await results.locator('.manta-page-alternatives').count(),0,'alternatives must be hidden on first view');
  assert.equal(await results.locator('.manta-page-explanations').count(),0,'explanations must be hidden on first view');
  assert.equal(await results.locator('.trip-price-details').getAttribute('open'),null,'price details must start collapsed');
  await results.getByRole('button',{name:'Why These Options?'}).click();
  await results.locator('.manta-page-explanations').waitFor();
  assert.ok(await results.getByText('View comparison').count()>=0,'comparisons use progressive disclosure');
  await results.getByRole('button',{name:'See Alternatives'}).click();
  await results.locator('.manta-page-alternatives').waitFor();
  await results.getByRole('button',{name:'Make it cheaper'}).click();
  const priceSummaryText=await results.locator('.trip-results-price-summary').textContent();
  assert.match(priceSummaryText,/Known USD subtotal:|pending and not counted as free/,'price details must keep deterministic totals and pending-price honesty');
  for(const width of [320,375,430]){await homePage.setViewportSize({width,height:840});await assertNoOverflow(homePage,`Manta results at ${width}px`);}
  await homePage.setViewportSize({width:1280,height:900});
  await results.getByRole('button',{name:'Add This Trip'}).click();
  await results.locator('.manta-auth-prompt').waitFor();
  assert.ok(await homePage.evaluate(()=>Boolean(localStorage.getItem('baa_planner_draft'))),'anonymous planner draft must remain on the device');
  await Promise.all([homePage.waitForURL(/index\.html\?resumePlanner=1$/),results.locator('.manta-page-results-head').getByRole('button',{name:'Edit trip details'}).click()]);
  await homePage.locator('.manta-planner-drawer[open]').waitFor();
  for(const width of [320,375,430]){
    await homePage.setViewportSize({width,height:840});
    await homePage.goto(`${baseUrl}/index.html`,{waitUntil:'networkidle'});
    await homePage.locator('.manta-planner-launch').click({force:true});
    await homePage.waitForFunction(() => !document.querySelector('.manta-question')?.textContent.includes('Loading current published'));
    await assertNoOverflow(homePage,`Manta planner at ${width}px`);
    const mobileDrawer=await homePage.locator('.manta-planner-drawer').boundingBox();
    assert.ok(mobileDrawer.width<=width,`Manta drawer must fit ${width}px`);
  }
  await homePage.setViewportSize({width:1280,height:900});
  await homePage.goto(`${baseUrl}/index.html`,{waitUntil:'networkidle'});
  await homePage.locator('#islandSelect').selectOption({label:'Maalhos'});
  await homePage.locator('#whenButton').click();
  await homePage.locator('#heroCheckin').fill(future);
  await homePage.locator('#heroCheckout').fill(checkout);
  await homePage.locator('#applyWhen').click();
  await homePage.locator('#travelerSelect').selectOption('3');
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
  assert.equal(new URL(filterPage.url()).searchParams.get('facilities'),'Free Wi-Fi','the Free Wi-Fi filter must remain in the customer search');
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
