import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(request,response)=>{try{const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);if(pathname==='/favicon.ico'){response.writeHead(204);response.end();return;}const file=path.resolve(root,`.${pathname}`);if(!file.startsWith(root))throw new Error('Not found');response.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});response.end(await readFile(file));}catch{response.writeHead(404);response.end('Not found');}});
await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));

function mockModule(role='owner',twoBusinesses=false){return `
const user={id:'00000000-0000-4000-8000-000000000001',email:'operator@example.com',user_metadata:{full_name:'Test Operator'}};
const verified={id:'00000000-0000-4000-8000-000000000010',owner_id:user.id,business_name:'Verified Test Guesthouse',island:'Dharavandhoo',status:'verified',is_active:true,access_role:'${role}',category:'guesthouse_hotel'};
const pending={...verified,id:'00000000-0000-4000-8000-000000000011',business_name:'Pending Test Business',status:'pending_review',is_active:false};
const businesses=${twoBusinesses?'[pending,verified]':'[verified]'};
const rows={
 user_roles:[{user_id:user.id,role:'operator'}],businesses,
 listings:[],accommodation_rooms:[],room_rate_plans:[],room_availability:[],room_rate_calendar:[],availability:[],listing_schedule_rules:[],listing_schedule_exceptions:[],
 booking_enquiries:[],payment_references:[],enquiry_messages:[],reviews:[],review_responses:[],promotions:[],operator_notification_preferences:[],operator_audit_log:[],listing_arrival_guides:[],
 business_images:[],listing_images:[],room_images:[],listing_policies:[],transfer_route_details:[],listing_package_details:[],listing_price_components:[],
 public_transport_locations:[],public_activity_types:[
  {slug:'snorkelling',name:'Snorkelling',description:'Snorkelling activity',listing_categories:['excursion','snorkelling'],sort_order:1},
  {slug:'dolphin_cruise',name:'Dolphin cruise',description:'Cruise activity',listing_categories:['excursion'],sort_order:2},
  {slug:'sandbank',name:'Sandbank visit',description:'Sandbank activity',listing_categories:['excursion'],sort_order:3}
 ]
};
function query(table){const state={filters:[],op:'select',payload:null,count:false};const builder={
 select(_cols,opts){state.count=opts?.count==='exact';return builder},order(){return builder},limit(){return builder},range(){return builder},gte(c,v){state.filters.push(['gte',c,v]);return builder},lte(c,v){state.filters.push(['lte',c,v]);return builder},eq(c,v){state.filters.push(['eq',c,v]);return builder},in(c,v){state.filters.push(['in',c,v]);return builder},
 insert(payload){state.op='insert';state.payload=payload;return builder},update(payload){state.op='update';state.payload=payload;return builder},upsert(payload){state.op='upsert';state.payload=payload;return builder},delete(){state.op='delete';return builder},maybeSingle(){return execute(true)},single(){return execute(true)},then(resolve,reject){return execute(false).then(resolve,reject)}
};
 function matches(row){return state.filters.every(([kind,c,v])=>kind==='eq'?row[c]===v:kind==='in'?v.includes(row[c]):kind==='gte'?row[c]>=v:row[c]<=v)}
 async function execute(single){const tableRows=rows[table]||(rows[table]=[]);if(state.op==='insert'){const incoming=Array.isArray(state.payload)?state.payload:[state.payload];for(const item of incoming)tableRows.push({id:item.id||crypto.randomUUID(),created_at:new Date().toISOString(),...item});}if(state.op==='update')tableRows.filter(matches).forEach((row)=>Object.assign(row,state.payload));if(state.op==='upsert'){const incoming=Array.isArray(state.payload)?state.payload:[state.payload];for(const item of incoming){const current=tableRows.find((row)=>row.id===item.id||row.listing_id===item.listing_id);current?Object.assign(current,item):tableRows.push({id:item.id||crypto.randomUUID(),...item});}}if(state.op==='delete')for(let i=tableRows.length-1;i>=0;i--)if(matches(tableRows[i]))tableRows.splice(i,1);const data=tableRows.filter(matches).map((row)=>({...row}));return {data:single?(data[0]||null):data,error:null,count:state.count?data.length:null};}
 return builder;
}
const client={
 auth:{getUser:async()=>({data:{user},error:null}),signOut:async()=>({error:null})},from:query,
 rpc:async(name)=>{if(name==='operator_accessible_businesses')return {data:businesses,error:null};if(name==='operator_finance_payment_queue')return {data:[],error:null};if(name.includes('analytics'))return {data:{confirmed_bookings:0,confirmed_value_by_currency:{},adr_by_currency:{},listing_views:0},error:null};if(name==='owner_list_business_staff')return {data:[],error:null};return {data:null,error:null};},
 storage:{from(){return{upload:async(_path)=>({data:{path:_path},error:null}),createSignedUrl:async(path)=>({data:{signedUrl:'data:image/png;base64,iVBORw0KGgo='},error:null}),remove:async()=>({data:[],error:null})}}},
 channel(){const channel={on(){return channel},subscribe(){return channel}};return channel},removeChannel(){return Promise.resolve()}
};
export const supabase=client;export const publicSupabase=client;export const isSupabaseConfigured=true;export function requireSupabase(){return client}export function requirePublicSupabase(){return client}export function showConfigurationNotice(){return false}export function siteUrl(v=''){return v}
`;}

const browser=await chromium.launch({headless:true});
const base=`http://127.0.0.1:${server.address().port}`;
async function openWorkspace(pageName,role){const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',(e)=>errors.push(e.message));await page.route(/\/assets\/js\/supabase-client\.js$/,route=>route.fulfill({contentType:'text/javascript',body:mockModule(role,false)}));await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'text/javascript',body:'window.supabase=window.supabase||{};'}));const response=await page.goto(`${base}/${pageName}`,{waitUntil:'networkidle'});assert.equal(response.status(),200,`${pageName} should load`);assert.equal(await page.locator('.operator-v2-shell').count(),1,`${pageName} must render the V2 shell`);assert.deepEqual(errors,[],`${pageName} page errors:\n${errors.join('\n')}`);await page.close();}

try{
  const ownerPages=['operator-overview.html','operator-dashboard.html','operator-content.html','operator-calendar.html','operator-reservations.html','operator-rates.html','operator-inbox.html','operator-reviews.html','operator-analytics.html','operator-settings.html','operator-availability.html','operator-payments.html','operator-more.html'];
  for(const page of ownerPages)await openWorkspace(page,'owner');
  for(const page of ['operator-overview.html','operator-calendar.html','operator-reservations.html','operator-inbox.html','operator-availability.html','operator-analytics.html'])await openWorkspace(page,'reservations');
  for(const page of ['operator-overview.html','operator-content.html','operator-rates.html','operator-settings.html'])await openWorkspace(page,'content');
  for(const page of ['operator-overview.html','operator-payments.html','operator-analytics.html','operator-settings.html'])await openWorkspace(page,'finance');

  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',(e)=>errors.push(e.message));await page.route(/\/assets\/js\/supabase-client\.js$/,route=>route.fulfill({contentType:'text/javascript',body:mockModule('owner',true)}));await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'text/javascript',body:'window.supabase=window.supabase||{};'}));await page.addInitScript(()=>localStorage.setItem('baa_operator_business_id','00000000-0000-4000-8000-000000000011'));await page.goto(`${base}/operator-content.html`,{waitUntil:'networkidle'});assert.equal(await page.locator('#newListing').isDisabled(),true,'pending business must keep New listing disabled');await page.locator('#businessSwitcher').selectOption('00000000-0000-4000-8000-000000000010');await page.waitForFunction(()=>!document.querySelector('#newListing').disabled);assert.equal(await page.locator('#advancedListingActivityPanel').count(),1,'advanced listing UI must stay loaded after business switch');await page.locator('#newListing').click();await page.locator('#listingCategory').selectOption('excursion');await page.locator('#listingKind').selectOption('excursion_package');assert.ok(await page.locator('[name="listingActivity"]').count()>=2,'excursion package must expose structured activity choices');assert.equal(await page.locator('#priceComponentPanel').count(),1,'separate-charge editor must be available');const dims=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));assert.ok(dims.document<=dims.viewport+2,`mobile Listings overflows (${dims.document}/${dims.viewport})`);assert.deepEqual(errors,[],errors.join('\n'));await page.close();
  console.log('Operator V2 browser smoke tests passed for Owner, Reservations, Content and Finance roles.');
}finally{await browser.close();await new Promise((resolve)=>server.close(resolve));}
