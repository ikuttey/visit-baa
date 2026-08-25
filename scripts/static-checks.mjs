import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const jsDir=path.join(root,'assets','js');
const failures=[];

const required=[
  'index.html','register.html','login.html','forgot-password.html','reset-password.html',
  'admin-dashboard.html','listings.html','listing.html','business.html','trip-results.html',
  'traveler-register.html','traveler-dashboard.html','operator-overview.html','operator-dashboard.html',
  'operator-calendar.html','operator-reservations.html','operator-content.html','operator-rates.html',
  'operator-reviews.html','operator-analytics.html','operator-settings.html','operator-inbox.html',
  'operator-availability.html','.env.example','config.example.js','config.js','serve.json',
  'assets/css/operator-v2.css','assets/css/operator-partner-extranet.css',
  'assets/js/auth.js','assets/js/operator-shell.js','assets/js/operator-header-layout-v2.js',
  'assets/js/operator-property-v2.js','assets/js/operator-overview-page-v2.js','assets/js/operator-calendar-v2.js',
  'assets/js/operator-reservations-v2.js','assets/js/operator-content-v2.js','assets/js/operator-rates-v2.js',
  'assets/js/operator-reviews-v2.js','assets/js/operator-analytics-v2.js','assets/js/operator-settings-v2.js',
  'assets/js/operator-inbox-v2.js','assets/js/operator-availability.js','assets/js/operator-notifications.js',
  'assets/js/operator-content-enhancements.js','assets/js/operator-content-compat-v2.js',
  'assets/js/manta-planner.js','assets/js/trip-planner-service.js','assets/js/trip-results.js',
  'assets/js/pricing.js','assets/js/storage.js','assets/js/supabase-client.js',
  'assets/css/manta-planner.css','assets/css/trip-results.css','assets/images/manta-planner.png',
  'supabase/migrations/20260825072700_retire_operator_v1_duplicate_rpcs.sql'
];

for(const file of required){
  try{await access(path.join(root,file),constants.R_OK);}catch{failures.push(`Missing required file: ${file}`);}
}

const retiredModules=[
  'operator-dashboard.js','operator-dashboard-retire-legacy-v2.js','operator-onboarding-simple.js',
  'operator-overview-v2.js','operator-external-bookings-compat-v2.js','operator-category-unlock-v2.js',
  'operator-listing-enhancements-v2.js','operator-home-partner-v3.js','operator-calendar-submit-guard-v2.js'
];
for(const file of retiredModules){
  try{await access(path.join(jsDir,file),constants.R_OK);failures.push(`${file}: retired duplicate module still exists`);}catch{}
}

const htmlFiles=(await readdir(root)).filter((name)=>name.endsWith('.html'));
for(const file of htmlFiles){
  const source=await readFile(path.join(root,file),'utf8');
  const open=(source.match(/<button(?:\s|>)/g)||[]).length;
  const close=(source.match(/<\/button>/g)||[]).length;
  if(open!==close)failures.push(`${file}: unbalanced button tags (${open}/${close})`);
  for(const match of source.matchAll(/(?:href|src)="([^"]+)"/g)){
    const ref=match[1];
    if(/^(?:https?:|mailto:|tel:|data:|#|javascript:)/i.test(ref))continue;
    const clean=decodeURIComponent(ref.split(/[?#]/)[0]);if(!clean)continue;
    try{await access(path.resolve(root,path.dirname(file),clean),constants.R_OK);}catch{failures.push(`${file}: missing local reference ${ref}`);}
  }
}

const jsFiles=(await readdir(jsDir)).filter((name)=>name.endsWith('.js'));
for(const file of jsFiles){
  try{execFileSync(process.execPath,['--check',path.join(jsDir,file)],{stdio:'pipe'});}catch(error){failures.push(`${file}: JavaScript syntax error: ${error.stderr?.toString()||error.message}`);}
}
const scriptsDir=path.join(root,'scripts');
for(const file of (await readdir(scriptsDir)).filter((name)=>name.endsWith('.mjs'))){
  try{execFileSync(process.execPath,['--check',path.join(scriptsDir,file)],{stdio:'pipe'});}catch(error){failures.push(`${file}: JavaScript syntax error: ${error.stderr?.toString()||error.message}`);}
}

const read=(relative)=>readFile(path.join(root,relative),'utf8');
const propertyHtml=await read('operator-dashboard.html');
const propertyJs=await read('assets/js/operator-property-v2.js');
const externalHtml=await read('operator-availability.html');
const externalJs=await read('assets/js/operator-availability.js');
const calendarJs=await read('assets/js/operator-calendar-v2.js');
const reservationsJs=await read('assets/js/operator-reservations-v2.js');
const analyticsJs=await read('assets/js/operator-analytics-v2.js');
const listingsJs=await read('assets/js/operator-content-v2.js');
const ratesJs=await read('assets/js/operator-rates-v2.js');
const reviewsJs=await read('assets/js/operator-reviews-v2.js');
const settingsJs=await read('assets/js/operator-settings-v2.js');
const inboxJs=await read('assets/js/operator-inbox-v2.js');
const authJs=await read('assets/js/auth.js');
const shellJs=await read('assets/js/operator-shell.js');

// One owner per operator workflow. Property must not contain retired operational forms.
if(!propertyHtml.includes('assets/js/operator-property-v2.js'))failures.push('Property page must load operator-property-v2.js');
for(const id of ['listingForm','availabilityForm','promotionForm','availabilityRangeForm']){
  if(propertyHtml.includes(`id="${id}"`))failures.push(`Property page must not contain retired ${id}`);
}
for(const tab of ['listings','availability','enquiries','reviewsOffers']){
  if(propertyHtml.includes(`data-tab-panel="${tab}"`))failures.push(`Property page must not contain retired ${tab} tab`);
}
if(!propertyJs.includes("initializeOperatorPage('property')"))failures.push('Property controller must use the shared V2 operator shell');
if(propertyJs.includes('business_service_categories'))failures.push('Property profile must not overwrite service registrations owned by V2 Listings');

// External bookings records channel/manual reservations only; Calendar owns inventory editing.
if(externalHtml.includes('availabilityRangeForm')||externalHtml.includes('roomInventoryTable'))failures.push('External bookings page must not contain a duplicate inventory editor');
if(externalJs.includes('operator_set_room_availability_range'))failures.push('External bookings must not call retired room-availability RPC');
for(const rpc of ['create_external_accommodation_booking','cancel_external_accommodation_booking'])if(!externalJs.includes(rpc))failures.push(`External bookings missing ${rpc}`);
if(!calendarJs.includes('operator_set_room_calendar_range'))failures.push('V2 Calendar must own room inventory/rate editing');
if(!calendarJs.includes('Saving schedule…')||!calendarJs.includes('23505'))failures.push('V2 Calendar recurring schedule double-submit protection is missing');

// Reservations owns every booking action, including the V1-only quote workflow that was migrated.
for(const rpc of ['operator_update_booking','operator_quote_booking','operator_update_booking_note','operator_record_service_payment','operator_review_payment_reference']){
  if(!reservationsJs.includes(rpc))failures.push(`V2 Reservations missing booking workflow RPC: ${rpc}`);
}
if(!reservationsJs.includes('Confirm price'))failures.push('V2 Reservations must expose operator price confirmation');

// Each remaining operator domain must resolve to exactly its current V2 controller.
for(const [name,source,needle] of [
  ['Listings',listingsJs,"initializeOperatorPage('listings')"],
  ['Rates',ratesJs,"initializeOperatorPage('rates')"],
  ['Reviews',reviewsJs,"initializeOperatorPage('reviews')"],
  ['Settings',settingsJs,"initializeOperatorPage('settings')"],
  ['Inbox',inboxJs,"initializeOperatorPage('inbox')"],
  ['Analytics',analyticsJs,"initializeOperatorPage('analytics')"]
])if(!source.includes(needle))failures.push(`${name} must use its V2 operator page controller`);
if(!analyticsJs.includes('operator_listing_analytics_v2'))failures.push('Analytics must use currency-safe operator_listing_analytics_v2');
if(analyticsJs.includes("rpc('operator_listing_analytics'"))failures.push('Analytics must not call retired operator_listing_analytics');

// Auth must be side-effect free; shared shell owns operator header/notification initialization once.
for(const retired of retiredModules){if(authJs.includes(retired))failures.push(`auth.js still references retired module ${retired}`);}
if(/operator-header-layout-v2\.js\?v=2/.test(authJs))failures.push('auth.js must not double-load the operator header');
if(!shellJs.includes("operator-header-layout-v2.js?v=3")||!shellJs.includes("operator-notifications.js?v=3"))failures.push('operator-shell.js must own shared header and notifications initialization');

// Public browsing must remain isolated from the authenticated operator session.
const publicClient=await read('assets/js/supabase-client.js');
const storage=await read('assets/js/storage.js');
if(!publicClient.includes('persistSession: false')||!publicClient.includes('requirePublicSupabase'))failures.push('supabase-client.js: isolated anonymous public client is missing');
if(!storage.includes('signedPublicImageUrl')||!storage.includes('requirePublicSupabase'))failures.push('storage.js: public media must use the isolated anonymous client');

// Core marketplace / Manta regression checks retained.
const manta=await read('assets/js/manta-planner.js');
const tripPlanner=await read('assets/js/trip-planner-service.js');
const tripResults=await read('assets/js/trip-results.js');
const mantaCss=await read('assets/css/manta-planner.css');
if(!manta.includes("'aria-label':'Open Visit Baa Trip Planner'"))failures.push('Manta launcher accessible name is missing');
if(!mantaCss.includes('prefers-reduced-motion'))failures.push('Manta reduced-motion handling is missing');
for(const requirement of ['trip-results.html','baa_manta_search'])if(!manta.includes(requirement))failures.push(`Manta results navigation missing ${requirement}`);
for(const requirement of ['Add This Trip','Why These Options?','See Alternatives','recalculateJourney'])if(!tripResults.includes(requirement))failures.push(`Trip results requirement missing ${requirement}`);
for(const requirement of ['recommendedActivityIsland','plannedActivityDates'])if(!tripPlanner.includes(requirement))failures.push(`Trip planner requirement missing ${requirement}`);

const serveConfig=JSON.parse(await read('serve.json'));
if(serveConfig.cleanUrls!==false)failures.push('serve.json: cleanUrls must stay disabled so query IDs are preserved');

// Basic secret scan across current HTML/JS/config/migration text files.
const scanFiles=[...htmlFiles.map((x)=>x),...jsFiles.map((x)=>`assets/js/${x}`),'config.example.js','.env.example'];
for(const file of scanFiles){
  const source=await read(file);
  if(/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/.test(source)||/sb_secret_[a-zA-Z0-9_-]{10,}/.test(source))failures.push(`${file}: possible secret key detected`);
}

if(failures.length){
  console.error(`Static checks failed (${failures.length}):`);
  failures.forEach((failure)=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Static checks passed: ${htmlFiles.length} HTML pages, ${jsFiles.length} JavaScript modules. V2 operator workflows have one owner each.`);
