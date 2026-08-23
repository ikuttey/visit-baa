import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateListingPrice } from '../assets/js/pricing.js';
import { listingGroup, listingKindLabel, normalizeServiceCategories } from '../assets/js/service-catalogs.js';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [migration,pricingMigration,operator,operatorHtml,registration,publicListings,businessDetail,listingDetail,admin,planner,results]=await Promise.all([
  read('supabase/migrations/20260823174513_multi_business_services_and_excursion_packages.sql'),
  read('supabase/migrations/20260823185212_listing_price_components_and_snapshots.sql'),read('assets/js/operator-dashboard.js'),read('operator-dashboard.html'),read('assets/js/register.js'),read('assets/js/public-listings.js'),
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

assert.match(operator,/from\('businesses'\)\.select\('\*'\)\.eq\('owner_id', state\.user\.id\)\.order/,'the dashboard must load all businesses owned by User A');
assert.match(operator,/eq\('business_id',state\.business\.id\)/,'bookings must be scoped to the selected business');
assert.match(operator,/business_id: state\.business\.id/,'new listings must bind to the selected owned business');
assert.match(operator,/business_service_categories/,'the operator must persist multiple service capabilities');
assert.match(operator,/listing_package_details/,'the package builder must persist structured package details');
assert.match(operator,/duplicateListing\(listing\)/,'operators must be able to duplicate an existing listing as a new draft');
for(const requirement of ['listingTypeChooser','listingWorkflowProgress','activityDuration','activityOperatingDays','activityPickupLocations','componentPricingFields'])assert.match(operatorHtml,new RegExp(requirement),`the simplified activity workflow is missing ${requirement}`);
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
for(const requirement of ['listing_price_components','listing_price_tiers','listing_service_pickup_locations','selected_price_component_ids','price_snapshot','create_priced_booking_request'])assert.match(pricingMigration,new RegExp(requirement),`the reusable pricing migration is missing ${requirement}`);
assert.match(pricingMigration,/charge_status in \('included','required','optional'\)/,'component behavior must be constrained to included, required, or optional');
assert.match(pricingMigration,/private\.owns_listing\(listing_id\)/,'pricing and pickup writes must be protected by listing ownership');

const services=normalizeServiceCategories([]);
assert.ok(services.some((item)=>item.slug==='accommodation')&&services.some((item)=>item.slug==='transport')&&services.some((item)=>item.slug==='excursions'));
assert.equal(listingGroup({category:'excursion',listing_kind:'excursion_package'}),'Excursion Packages');
assert.equal(listingKindLabel({category:'excursion',listing_kind:'excursion_package'}),'Excursion package');
assert.equal(calculateListingPrice({price:500,price_unit:'per_boat',currency:'USD'},{adults:6,children:0}).total,500,'a six-guest private boat package must not become USD 3,000');
assert.equal(calculateListingPrice({price:500,price_unit:'per_package',currency:'USD'},{adults:6,children:0}).total,500,'an explicit per-package price must be charged once');

console.log('Multi-business, multi-service, and excursion-package regression checks passed.');
