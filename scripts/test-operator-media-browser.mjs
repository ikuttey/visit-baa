import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root)) throw new Error('Not found');
    response.writeHead(200, { 'content-type':types[path.extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const mockClientModule = `
const user={id:'ba9f5c77-8702-4539-bce7-ae479bab65f0',email:'operator@example.com'};
const business={id:'1c872d15-b48f-464c-8bfa-678de9a7c67c',owner_id:user.id,status:'verified',is_active:true,island:'Dharavandhoo',business_name:'Media Test Guesthouse',category:'guesthouse_hotel',contact_person_name:'Test Operator',registration_number:'TEST-1',email:user.email,phone:'+960 7000000',business_address:'Dharavandhoo',description:'A verified test business used only by the browser test.',public_contact:true};
const business2={...business,id:'8afbd61d-25cd-4b73-8d79-60bcbd062eba',business_name:'Media Test Speedboat',category:'speedboat_transfer',registration_number:'TEST-2'};
const rows={user_roles:[{user_id:user.id,role:'operator'}],businesses:[business,business2],profiles:[{id:user.id,full_name:'Test Operator',phone:business.phone}],service_categories:[{id:'service-accommodation',slug:'accommodation',name:'Accommodation / Guesthouse',listing_categories:['accommodation'],sort_order:10,is_active:true},{id:'service-excursions',slug:'excursions',name:'Excursion Centre',listing_categories:['excursion','snorkelling'],sort_order:20,is_active:true},{id:'service-transport',slug:'transport',name:'Speedboat / Transport',listing_categories:['transfer','excursion'],sort_order:30,is_active:true}],business_service_categories:[{business_id:business.id,service_category_id:'service-accommodation'},{business_id:business.id,service_category_id:'service-excursions'},{business_id:business2.id,service_category_id:'service-transport'}],listings:[],business_images:[],listing_images:[],booking_enquiries:[],payment_references:[],availability:[],reviews:[],review_responses:[],promotions:[],public_transport_locations:[],public_transfer_routes:[]};
window.__mockUploads=[];
function query(table){
  const state={filters:[],op:'select',payload:null};
  const builder={
    select(){return builder},order(){return builder},gte(column,value){state.filters.push(['gte',column,value]);return builder},
    eq(column,value){state.filters.push(['eq',column,value]);return builder},
    in(column,values){state.filters.push(['in',column,values]);return builder},
    insert(payload){state.op='insert';state.payload=payload;return builder},
    update(payload){state.op='update';state.payload=payload;return builder},
    upsert(payload){state.op='upsert';state.payload=payload;return builder},
    delete(){state.op='delete';return builder},
    maybeSingle(){return execute(true)},single(){return execute(true)},
    then(resolve,reject){return execute(false).then(resolve,reject)}
  };
  function matches(row){return state.filters.every(([kind,column,value])=>kind==='eq'?row[column]===value:kind==='in'?value.includes(row[column]):row[column]>=value)}
  async function execute(single){
    const tableRows=rows[table]||(rows[table]=[]);
    if(state.op==='insert'){const incoming=Array.isArray(state.payload)?state.payload:[state.payload];tableRows.push(...incoming.map((row)=>({...row})));}
    if(state.op==='update')tableRows.filter(matches).forEach((row)=>Object.assign(row,state.payload));
    if(state.op==='upsert'){const incoming=Array.isArray(state.payload)?state.payload:[state.payload];for(const row of incoming){const current=tableRows.find((item)=>item.id===row.id||item.listing_id===row.listing_id);current?Object.assign(current,row):tableRows.push({...row});}}
    if(state.op==='delete')for(let index=tableRows.length-1;index>=0;index--)if(matches(tableRows[index]))tableRows.splice(index,1);
    const data=tableRows.filter(matches).map((row)=>({...row}));
    return {data:single?(data[0]||null):data,error:null};
  }
  return builder;
}
const client={
  auth:{getUser:async()=>({data:{user},error:null}),signOut:async()=>({error:null})},
  from:query,
  rpc:async()=>({data:null,error:null}),
  storage:{from(bucket){return {
    upload:async(path,file)=>{window.__mockUploads.push({bucket,path,name:file.name});return {data:{path},error:null}},
    createSignedUrl:async(path)=>({data:{signedUrl:'data:image/png;base64,iVBORw0KGgo='},error:null}),
    remove:async()=>({data:[],error:null})
  }}}
};
export const supabase=client;export const publicSupabase=client;export const isSupabaseConfigured=true;
export function requireSupabase(){return client} export function requirePublicSupabase(){return client}
export function showConfigurationNotice(){return false} export function siteUrl(value=''){return value}
`;

const browser = await chromium.launch({ channel:'chrome', headless:true });
try {
  const page = await browser.newPage({ viewport:{ width:1280, height:900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/\/assets\/js\/supabase-client\.js$/, (route) => route.fulfill({ contentType:'text/javascript', body:mockClientModule }));
  const response = await page.goto(`http://127.0.0.1:${server.address().port}/operator-dashboard.html`, { waitUntil:'networkidle' });
  assert.equal(response.status(), 200, 'operator dashboard should load from the test server');
  assert.match(page.url(), /operator-dashboard\.html$/, 'mock operator session should remain on the dashboard');
  assert.equal(await page.locator('.tab[data-tab="listings"]').count(), 1, `dashboard tabs missing; title=${await page.title()} body=${(await page.locator('body').innerText()).slice(0,120)}`);
  await page.locator('.tab[data-tab="listings"]').click();
  await page.getByRole('button', { name:'Add service or listing' }).click();
  await page.locator('#listingEditor').waitFor({ state:'visible' });
  await page.getByRole('button',{name:/Activity \/ Excursion/}).click();
  await page.locator('#listingTitle').fill('Operator media upload test');
  await page.locator('#listingSummary').fill('A browser-tested island excursion.');
  await page.locator('#listingDescription').fill('A complete browser-tested island excursion description for operator media uploads.');
  await page.locator('[data-listing-step="1"]').click();
  await page.locator('#listingMaxCapacity').fill('10');
  await page.locator('#listingAvailableSpaces').fill('10');
  await page.locator('[data-listing-step="2"]').click();
  await page.locator('#listingPrice').fill('25');
  await page.locator('#listingPriceUnit').selectOption('per_person');
  await page.locator('[data-listing-step="4"]').click();
  const mediaGroups = page.locator('#listingMediaEditor .media-group');
  assert.equal(await mediaGroups.nth(0).locator('label[for="listingCover"]', { hasText:'Choose cover image' }).count(), 1, 'cover chooser belongs inside the cover panel');
  assert.equal(await mediaGroups.nth(1).locator('label[for="listingGallery"]', { hasText:'Add gallery images' }).count(), 1, 'gallery chooser belongs inside the gallery panel');

  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await page.locator('#listingCover').setInputFiles({ name:'cover.png', mimeType:'image/png', buffer:pixel });
  await page.getByText('cover.png selected. Save the draft to upload it.', { exact:true }).waitFor();
  assert.equal(await page.locator('#listingMediaEditor .media-card.cover img').count(), 1, 'cover selection should render a preview');

  await page.locator('#listingGallery').setInputFiles([
    { name:'gallery-one.png', mimeType:'image/png', buffer:pixel },
    { name:'gallery-two.png', mimeType:'image/png', buffer:pixel }
  ]);
  await page.getByText('2 new gallery images selected. Save the draft to upload them.', { exact:true }).waitFor();
  assert.equal(await page.locator('#listingMediaEditor .media-group').nth(1).locator('.media-card').count(), 2, 'all selected gallery images should render');

  await page.locator('#listingGallery').setInputFiles({ name:'gallery-three.png', mimeType:'image/png', buffer:pixel });
  await page.getByText('3 new gallery images selected. Save the draft to upload them.', { exact:true }).waitFor();

  await page.locator('#listingForm button[type="submit"]').click();
  await page.getByText('Listing draft saved.', { exact:true }).waitFor();
  const uploads = await page.evaluate(() => window.__mockUploads);
  assert.equal(uploads.filter((item) => item.bucket === 'listing-covers').length, 1, 'cover should upload on save');
  assert.equal(uploads.filter((item) => item.bucket === 'listing-gallery').length, 3, 'all accumulated gallery images should upload on save');
  assert.equal(await page.locator('#businessSwitcher option').count(),2,'one operator account should see both owned businesses');
  await page.locator('#businessSwitcher').selectOption('8afbd61d-25cd-4b73-8d79-60bcbd062eba');
  await page.waitForFunction(()=>document.querySelector('#businessSwitcher').value==='8afbd61d-25cd-4b73-8d79-60bcbd062eba');
  assert.equal(await page.locator('#listingsTable').getByText('Operator media upload test',{exact:true}).count(),0,'switching businesses must not leak the first business listing');
  await page.locator('#businessSwitcher').selectOption('1c872d15-b48f-464c-8bfa-678de9a7c67c');
  await page.locator('#listingsTable').getByText('Operator media upload test',{exact:true}).waitFor();
  await page.setViewportSize({width:375,height:840});
  await page.getByRole('button',{name:'Add service or listing'}).click();
  await page.getByRole('button',{name:/Activity \/ Excursion/}).click();
  await page.locator('#listingCategory').selectOption('excursion');
  await page.locator('#listingKind').selectOption('excursion_package');
  await page.locator('#packageFields').waitFor({state:'visible'});
  assert.ok(await page.locator('[name="listingActivity"]').count()>=2,'the package builder must use the shared structured activity catalog');
  const dimensions=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
  assert.ok(dimensions.document<=dimensions.viewport,`mobile package builder overflows (${dimensions.document}/${dimensions.viewport})`);
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('Operator cover and gallery picker browser test passed through draft upload.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
