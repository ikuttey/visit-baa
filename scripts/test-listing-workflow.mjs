import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertInsertedDraft, categoryFallback, createListingId, listingEditAction,
  listingMediaCandidates, moveGalleryItemByKey, orderedGalleryItems,
  validateAvailabilityFields, validateListingFields
} from '../assets/js/listing-workflow.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(file)=>readFile(path.join(root,file),'utf8');

const generatedId='123e4567-e89b-42d3-a456-426614174000';
assert.equal(createListingId(()=>generatedId),generatedId);
assert.throws(()=>createListingId(()=>'not-a-uuid'),/secure listing ID/i);
assert.doesNotThrow(()=>validateListingFields({price:25,maxCapacity:8,availableSpaces:6,startTime:'09:00',endTime:'11:00',hasCover:true}));
assert.throws(()=>validateListingFields({price:0,maxCapacity:8,availableSpaces:6,hasCover:true}),/greater than zero/i);
assert.throws(()=>validateListingFields({price:25,maxCapacity:8,availableSpaces:9,hasCover:true}),/cannot exceed/i);
assert.throws(()=>validateListingFields({price:25,maxCapacity:8,availableSpaces:6,startTime:'11:00',endTime:'09:00',hasCover:true}),/later than/i);
assert.throws(()=>validateListingFields({price:25,maxCapacity:8,availableSpaces:6,hasCover:false}),/cover image/i);
assert.throws(()=>validateAvailabilityFields({maxCapacity:4,remainingSpaces:5}),/cannot exceed/i);
assert.throws(()=>validateAvailabilityFields({maxCapacity:4,remainingSpaces:3,startTime:'14:00',endTime:'13:00'}),/later than/i);

const inserted=assertInsertedDraft({id:generatedId,business_id:'business-a',status:'draft'},generatedId,'business-a');
assert.equal(inserted.status,'draft');
assert.throws(()=>assertInsertedDraft({id:generatedId,business_id:'business-b',status:'draft'},generatedId,'business-a'),/authenticated business/i);
assert.deepEqual(listingMediaCandidates({cover_image_path:'cover.jpg',business_logo_path:'logo.jpg'}).map((item)=>item.source),['listing-cover','business-logo']);
assert.deepEqual(listingMediaCandidates({business_logo_path:'logo.jpg'}).map((item)=>item.source),['business-logo']);
assert.equal(categoryFallback('diving').label,'Dive');
assert.equal(listingEditAction('pending_review'),'Withdraw for editing');
assert.equal(listingEditAction('published'),'Edit');

const gallery=[{id:'existing-a',sort_order:0},{key:'new-b',file:{},sort_order:1},{id:'existing-c',sort_order:2},{key:'removed',sort_order:3,removed:true}];
assert.equal(moveGalleryItemByKey(gallery,'new-b',-1),true);
assert.deepEqual(orderedGalleryItems(gallery).map((item)=>item.id||item.key),['new-b','existing-a','existing-c']);
assert.equal(moveGalleryItemByKey(gallery,'new-b',-1),false);

const [operator,advanced,publicListings,publicMedia,storage,detail,business,admin,migration,rollback,publicMigration,grantMigration,grantRollback]=await Promise.all([
  read('assets/js/operator-content-v2.js'),read('assets/js/operator-listing-advanced-v2.js'),read('assets/js/public-listings.js'),
  read('assets/js/public-media.js'),read('assets/js/storage.js'),read('assets/js/listing-detail.js'),read('assets/js/business-detail.js'),read('assets/js/admin-dashboard.js'),
  read('supabase/migrations/202608170006_listing_revision_workflow.sql'),read('supabase/rollbacks/202608170006_listing_revision_workflow_rollback.sql'),
  read('supabase/migrations/202608180007_public_read_models_rls.sql'),read('supabase/migrations/20260819164311_rpc_execute_grants_hardening.sql'),read('supabase/rollbacks/20260819164311_rpc_execute_grants_hardening_rollback.sql')
]);

// Current V2 Listings owns the complete save/revision workflow.
assert.match(operator,/initializeOperatorPage\('listings'\)/);
assert.match(operator,/create_listing_revision/);
assert.match(operator,/withdraw_listing_for_edit/);
assert.match(operator,/submit_listing/);
assert.match(operator,/status:'draft'/);
assert.match(operator,/validateAdvancedListingForSubmit/);
assert.match(operator,/persistAdvancedListingDetails/);
assert.match(operator,/augmentListingPayload/);
assert.match(operator,/augmentRoutePayload/);
assert.match(operator,/augmentPackagePayload/);
assert.match(operator,/import '\.\/operator-room-media-v2\.js'/);
assert.match(operator,/Listings unlock after verification/);
assert.match(operator,/business\.status==='verified'/);
assert.match(operator,/business\.is_active===true/);
assert.doesNotMatch(operator,/operator-dashboard\.js/);
assert.doesNotMatch(operator,/client\.from\s*=/);

// Advanced fields are explicit helpers, not a Supabase monkey patch.
for(const helper of ['initAdvancedListingEditor','loadAdvancedListingDetails','augmentListingPayload','augmentRoutePayload','augmentPackagePayload','validateAdvancedListingForSubmit','persistAdvancedListingDetails'])assert.ok(advanced.includes(`function ${helper}`)||advanced.includes(`function ${helper}(`)||advanced.includes(`export async function ${helper}`)||advanced.includes(`export function ${helper}`),`advanced listing helper missing ${helper}`);
assert.doesNotMatch(advanced,/originalFrom/);
assert.doesNotMatch(advanced,/client\.from\s*=/);
assert.match(advanced,/listing_price_components/);
assert.match(advanced,/listingActivity/);
assert.match(advanced,/routeOperatingDays/);
assert.match(advanced,/packageOperatingDays/);

assert.match(publicListings,/renderPublicListingMedia/);
assert.match(publicMedia,/signedPublicImageUrl/);
assert.match(storage,/requirePublicSupabase/);
assert.match(publicListings,/business\.html\?id=/);
assert.match(detail,/business\.html\?id=/);
assert.match(detail,/figcaption/);
assert.match(business,/public_businesses/);
assert.match(business,/public_listings/);
assert.match(business,/Services offered/);
assert.match(admin,/review_history/);
assert.match(admin,/remaining_spaces/);
assert.match(admin,/button\('Suspend'/);

for(const required of ['security invoker','auth.uid() is null','private.owns_listing(p_listing_id, auth.uid())',"old.status = 'pending_review'","new.status = 'draft'","revoke all on function public.withdraw_listing_for_edit(uuid) from public, anon, authenticated",'grant execute on function public.withdraw_listing_for_edit(uuid) to authenticated'])assert.ok(migration.toLowerCase().includes(required.toLowerCase()),`migration missing ${required}`);
assert.match(rollback,/drop function if exists public\.withdraw_listing_for_edit\(uuid\)/);
assert.doesNotMatch(migration,/alter table public\.listings.*unique/is);
for(const required of ['security_invoker = true','to anon','public_business_contact','grant select (id,business_name','grant select (id,business_id,title'])assert.ok(publicMigration.includes(required),`public read migration missing ${required}`);
assert.doesNotMatch(publicMigration,/grant select on public\.(?:businesses|listings|availability) to anon/i);
for(const routine of ['submit_listing','submit_business','admin_review_business','admin_review_listing']){assert.match(grantMigration,new RegExp(`revoke execute on function public\\.${routine}`));assert.match(grantMigration,new RegExp(`grant execute on function public\\.${routine}`));assert.match(grantRollback,new RegExp(`grant execute on function public\\.${routine}`));}

console.log('Listing V2 workflow, advanced pricing, media, public presentation, and migration tests passed.');
