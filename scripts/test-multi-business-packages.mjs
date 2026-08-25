import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateListingPrice } from '../assets/js/pricing.js';
import { listingGroup, listingKindLabel, normalizeServiceCategories } from '../assets/js/service-catalogs.js';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [
  migration,pricingMigration,operator,operatorHtml,advanced,enhancements,shell,
  registration,publicListings,businessDetail,listingDetail,admin,planner,results
]=await Promise.all([
  read('supabase/migrations/20260823174513_multi_business_services_and_excursion_packages.sql'),
  read('supabase/migrations/20260823185212_listing_price_components_and_snapshots.sql'),
  read('assets/js/operator-content-v2.js'),read('operator-content.html'),
  read('assets/js/operator-listing-advanced-v2.js'),read('assets/js/operator-content-enhancements.js'),
  read('assets/js/operator-shell.js'),read('assets/js/register.js'),read('assets/js/public-listings.js'),
  read('assets/js/business-detail.js'),read('assets/js/listing-detail.js'),read('assets/js/admin-dashboard.js'),
  read('assets/js/trip-planner-service.js'),read('assets/js/trip-results.js')
]);

assert.match(migration,/drop constraint if exists businesses_owner_id_key/,'the old one-business owner constraint must be removed forward-only');
assert.match(migration,/primary key \(business_id,service_category_id\)/,'business capabilities must be normalized as a many-to-many relation');
assert.match(migration,/insert into public\.business_service_categories[\s\S]+from public\.businesses/,'legacy business categories must be backfilled');
assert.match(migration,/insert into public\.business_service_categories[\s\S]+from public\.listings/,'existing cross-service listings must retain eligibility');
assert.match(migration,/business_services_owner_insert[\s\S]+private\.owns_business\(business_id\)/,'User B must be rejected by the ownership-backed service-category policy');
assert.match(migration,/package_details_owner_all[\s\S]+private\.owns_listing\(listing_id\)/,'package writes must be restricted through listing ownership');
assert.match(migration,/where l\.status='published' and l\.is_active and b\.status='verified' and b\.is_active/,'public package data must retain the publication boundary');
assert.match(migration,/cardinality\(new\.activity_type_slugs\)<2/,'a submitted package must contain multiple structured activities');
assert.match(migration,/when 'per_boat' then p_listing\.price/,'a private-boat package must remain one fixed price');
assert.match(migration,/create or replace function public\.create_package_booking_request/,'package pickup and drop-off must be saved through a validated booking RPC');
assert.match(migration,/activity_type_slugs_snapshot/,'package booking records must retain the structured activities the customer selected');

assert.match(shell,/operator_accessible_businesses/,'the V2 shell must load all businesses accessible to the signed-in operator');
assert.match(shell,/fillBusinessSwitcher/,'the V2 shell must support switching among multiple businesses');
assert.match(shell,/rememberBusiness/,'the selected business must be remembered between operator workspaces');
assert.match(operator,/eq\('business_id',state\.business\.id\)/,'V2 Listings must scope content to the selected business');
assert.match(operator,/business_id:state\.business\.id/,'new V2 listings must bind to the selected business');
assert.match(operator,/listing_package_details/,'the V2 package builder must persist structured package details');
assert.match(operator,/persistAdvancedListingDetails/,'V2 must explicitly persist advanced pricing and package details');
assert.match(operator,/businessVerified\(\)/,'V2 listing creation must remain gated by business verification');
assert.match(enhancements,/duplicate_operator_listing/,'operators must be able to duplicate an existing listing as a new draft');

for(const requirement of ['businessSwitcher','listingCategory','listingKind','listingPricingMode','transferFields','packageFields','roomsTable']){
  assert.match(operatorHtml,new RegExp(`id="${requirement}"`),`the V2 listing workspace is missing ${requirement}`);
}
for(const requirement of ['listingActivity','priceComponentPanel','routeOperatingDays','packageOperatingDays','validateAdvancedListingForSubmit','persistAdvancedListingDetails']){
  assert.match(advanced,new RegExp(requirement),`the V2 advanced listing workflow is missing ${requirement}`);
}
assert.doesNotMatch(advanced,/client\.from\s*=|client\['from'\]\s*=/,'advanced listing helpers must not monkey-patch the Supabase client');

assert.doesNotMatch(registration,/business_service_slugs|business_name|registration_number/,'account registration must not ask for or submit business data');
assert.match(registration,/full_name:document\.getElementById\('fullName'\)[\s\S]*phone:document\.getElementById\('phone'\)/,'account registration must remain a short identity-only flow');
assert.match(publicListings,/contains\('activity_type_slugs',\[search\.activity\]\)/,'activity filters must find individual listings and packages through structured data');
assert.match(publicListings,/Add to My Baa Trip/,'every public package card must support trip selection');
assert.match(businessDetail,/listingGroup\(listing\)/,'business pages must group packages instead of mixing every service');
assert.match(listingDetail,/More from this provider/,'listing pages must support cross-service provider discovery');
assert.match(admin,/listing_package_details/,'administrators must load package details for moderation');
assert.match(planner,/matchCount:matched\.length/,'Manta must rank package overlap using structured activity slugs');
assert.match(results,/Providers matching several parts of your trip/,'Manta must expose useful provider bundling without forcing it');
assert.match(results,/Cancel to remove the duplicated individual service/,'package duplication must remain a customer choice');
for(const requirement of ['listing_price_components','listing_price_tiers','listing_service_pickup_locations','selected_price_component_ids','price_snapshot','create_priced_booking_request']){
  assert.match(pricingMigration,new RegExp(requirement),`the reusable pricing migration is missing ${requirement}`);
}
assert.match(pricingMigration,/charge_status in \('included','required','optional'\)/,'component behavior must be constrained to included, required, or optional');
assert.match(pricingMigration,/private\.owns_listing\(listing_id\)/,'pricing and pickup writes must be protected by listing ownership');

const services=normalizeServiceCategories([]);
assert.ok(services.some((item)=>item.slug==='accommodation')&&services.some((item)=>item.slug==='transport')&&services.some((item)=>item.slug==='excursions'));
assert.equal(listingGroup({category:'excursion',listing_kind:'excursion_package'}),'Excursion Packages');
assert.equal(listingKindLabel({category:'excursion',listing_kind:'excursion_package'}),'Excursion package');
assert.equal(calculateListingPrice({price:500,price_unit:'per_boat',currency:'USD'},{adults:6,children:0}).total,500,'a six-guest private boat package must not become USD 3,000');
assert.equal(calculateListingPrice({price:500,price_unit:'per_package',currency:'USD'},{adults:6,children:0}).total,500,'an explicit per-package price must be charged once');

console.log('Multi-business, multi-service, and excursion-package V2 regression checks passed.');
