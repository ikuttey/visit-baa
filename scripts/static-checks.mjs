import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = [
  'index.html', 'index (1).html', 'register.html', 'login.html', 'forgot-password.html',
  'reset-password.html', 'operator-dashboard.html', 'admin-dashboard.html', 'listings.html',
  'listing.html', 'business.html', 'trip-results.html', 'traveler-register.html', 'traveler-dashboard.html', '.env.example', 'config.example.js', 'config.js',
  'serve.json',
  'assets/js/facilities-config.js',
  'assets/js/facilities-ui.js',
  'assets/js/marketplace.js',
  'assets/js/route-planner.js',
  'assets/js/transfer-service.js',
  'assets/js/homepage-planner.js',
  'assets/js/trip-planner-service.js',
  'assets/js/planner-catalogs.js',
  'assets/js/pricing.js',
  'assets/js/manta-planner.js',
  'assets/css/manta-planner.css',
  'assets/js/trip-results.js',
  'assets/css/trip-results.css',
  'assets/images/manta-planner.svg',
  'assets/images/manta-planner.png',
  'assets/js/traveler-register.js',
  'assets/js/traveler-dashboard.js',
  'scripts/test-operator-media-browser.mjs',
  'supabase/migrations/202608170001_core_schema.sql',
  'supabase/migrations/202608170002_rls_and_grants.sql',
  'supabase/migrations/202608170003_storage.sql',
  'supabase/migrations/202608170004_security_hardening.sql',
  'supabase/migrations/202608170005_operator_business_onboarding.sql',
  'supabase/migrations/202608170006_listing_revision_workflow.sql',
  'supabase/migrations/202608180007_public_read_models_rls.sql',
  'supabase/migrations/20260819164311_rpc_execute_grants_hardening.sql',
  'supabase/migrations/20260821135712_marketplace_engine.sql',
  'supabase/migrations/20260821135813_marketplace_core.sql',
  'supabase/migrations/20260821152556_transfer_routes.sql',
  'supabase/migrations/20260821165102_trip_booking_payments.sql',
  'supabase/migrations/20260821182324_normalized_transport_locations.sql',
  'supabase/migrations/20260821190514_explicit_pricing_units.sql',
  'supabase/migrations/20260821190516_planner_catalogs_and_requirements.sql',
  'supabase/migrations/20260821195038_journey_location_parent_validation.sql',
  'supabase/migrations/20260822120000_authenticated_public_read_models.sql',
  'supabase/rollbacks/202608170005_operator_business_onboarding_rollback.sql',
  'supabase/rollbacks/202608170006_listing_revision_workflow_rollback.sql',
  'supabase/rollbacks/202608180007_public_read_models_rls_rollback.sql',
  'supabase/rollbacks/20260819164311_rpc_execute_grants_hardening_rollback.sql',
  'supabase/snapshots/202608170006_pre_listing_revision_workflow.sql',
  'supabase/snapshots/20260819164311_pre_rpc_execute_grants_hardening.sql'
];

const failures = [];
for (const file of expected) {
  try { await access(path.join(root, file), constants.R_OK); }
  catch { failures.push(`Missing required file: ${file}`); }
}

const htmlFiles = (await readdir(root)).filter((name) => name.endsWith('.html'));
for (const file of htmlFiles) {
  const source = await readFile(path.join(root, file), 'utf8');
  const buttonOpen = (source.match(/<button(?:\s|>)/g) || []).length;
  const buttonClose = (source.match(/<\/button>/g) || []).length;
  if (buttonOpen !== buttonClose) failures.push(`${file}: unbalanced button tags (${buttonOpen}/${buttonClose})`);
  const refs = [...source.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const ref of refs) {
    if (/^(?:https?:|mailto:|tel:|data:|#|javascript:)/i.test(ref)) continue;
    const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
    if (!clean) continue;
    try { await access(path.resolve(root, path.dirname(file), clean), constants.R_OK); }
    catch { failures.push(`${file}: missing local reference ${ref}`); }
  }
}

const jsDir = path.join(root, 'assets', 'js');
for (const file of (await readdir(jsDir)).filter((name) => name.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--check', path.join(jsDir, file)], { stdio: 'pipe' }); }
  catch (error) { failures.push(`${file}: JavaScript syntax error: ${error.stderr?.toString() || error.message}`); }
  const source = await readFile(path.join(jsDir, file), 'utf8');
  if (/\.innerHTML\s*=/.test(source)) failures.push(`${file}: unsafe innerHTML assignment detected`);
}

const operatorDashboardSource = await readFile(path.join(jsDir, 'operator-dashboard.js'), 'utf8');
const operatorDashboardHtml = await readFile(path.join(root, 'operator-dashboard.html'), 'utf8');
if (!/from\('businesses'\)[\s\S]*?\.eq\('owner_id',[\s\S]*?\.maybeSingle\(\)/.test(operatorDashboardSource)) {
  failures.push('operator-dashboard.js: owner business lookup must use maybeSingle()');
}
if (!operatorDashboardSource.includes('Complete business registration')) {
  failures.push('operator-dashboard.js: missing-business onboarding state is missing');
}
for (const requirement of [
  '.auth.getUser()',
  ".select('id,owner_id,status,is_active,island')",
  ".eq('owner_id', user.id)",
  '.maybeSingle()',
  'validateListingSubmissionContext(user, business)',
  'bindListingToBusiness({'
]) {
  if (!operatorDashboardSource.includes(requirement)) failures.push(`operator-dashboard.js: listing ownership guard is missing: ${requirement}`);
}
if (/business[_-]?id/i.test(operatorDashboardHtml)) {
  failures.push('operator-dashboard.html: business_id must not come from a form field');
}
if (!/id="newListingButton"[^>]*\bdisabled\b/.test(operatorDashboardHtml)) {
  failures.push('operator-dashboard.html: create-listing control must start disabled');
}
if (!/<button class="button aqua" type="submit" disabled>Save draft<\/button>/.test(operatorDashboardHtml)) {
  failures.push('operator-dashboard.html: listing submit control must start disabled');
}
if (!operatorDashboardHtml.includes('Add service or listing')) failures.push('operator-dashboard.html: updated listing action wording is missing');
for (const requirement of ['file-picker-input','listingCover','listingGallery']) {
  if (!operatorDashboardHtml.includes(requirement)) failures.push(`operator-dashboard.html: resilient media picker is missing: ${requirement}`);
}
if (operatorDashboardSource.indexOf('bindEvents();') > operatorDashboardSource.indexOf('await requireOperator()')) failures.push('operator-dashboard.js: controls must bind before dashboard network loading');
for (const requirement of ['setFilePickerStatus','Save the draft to upload it','state.listingEditor.newGallery.push','listingMediaPicker','Choose cover image','Add gallery images']) {
  if (!operatorDashboardSource.includes(requirement)) failures.push(`operator-dashboard.js: media selection feedback is missing: ${requirement}`);
}
if (!operatorDashboardSource.includes(".from('listings').insert({ ...payload, id, status: 'draft' })")) failures.push('operator-dashboard.js: listing insert must use a pre-generated draft ID');
if (operatorDashboardSource.includes(".from('listings').insert(payload).select()")) failures.push('operator-dashboard.js: listing insert must not request RETURNING rows');
if (!operatorDashboardSource.includes('assertInsertedDraft(await loadOwnedListing')) failures.push('operator-dashboard.js: separate post-insert owner SELECT is missing');
if (!operatorDashboardSource.includes('orderedGalleryItems')) failures.push('operator-dashboard.js: unified existing/new gallery ordering is missing');

const publicClientSource = await readFile(path.join(jsDir, 'supabase-client.js'), 'utf8');
if (!publicClientSource.includes('persistSession: false') || !publicClientSource.includes('requirePublicSupabase')) {
  failures.push('supabase-client.js: isolated anonymous public client is missing');
}
const storageSource = await readFile(path.join(jsDir, 'storage.js'), 'utf8');
if (!storageSource.includes('signedPublicImageUrl') || !storageSource.includes('requirePublicSupabase')) {
  failures.push('storage.js: public media must use the isolated anonymous client');
}

const serveConfig = JSON.parse(await readFile(path.join(root, 'serve.json'), 'utf8'));
if (serveConfig.cleanUrls !== false) failures.push('serve.json: cleanUrls must stay disabled so detail-page query IDs are preserved');

const scriptsDir = path.join(root, 'scripts');
for (const file of (await readdir(scriptsDir)).filter((name) => name.endsWith('.mjs'))) {
  try { execFileSync(process.execPath, ['--check', path.join(scriptsDir, file)], { stdio: 'pipe' }); }
  catch (error) { failures.push(`${file}: JavaScript syntax error: ${error.stderr?.toString() || error.message}`); }
}

const migrationFiles = expected.filter((file) => file.startsWith('supabase/migrations/') && file.endsWith('.sql'));
const migrations = await Promise.all(migrationFiles.map((file) => readFile(path.join(root, file), 'utf8')));
const sql = migrations.join('\n');
for (const table of ['profiles','user_roles','businesses','business_images','listings','listing_images','availability','booking_enquiries','review_history','traveler_profiles','accommodation_rooms','room_images','room_availability','room_rate_plans','listing_policies','promotions','saved_listings','trips','trip_items','trip_requirements','enquiry_messages','reviews','review_responses','transfer_route_details','trip_booking_batches','payment_references','activity_types']) {
  if (!sql.includes(`alter table public.${table} enable row level security`)) failures.push(`RLS is not enabled for ${table}`);
}
const mantaSource = await readFile(path.join(jsDir, 'manta-planner.js'), 'utf8');
const tripPlannerSource = await readFile(path.join(jsDir, 'trip-planner-service.js'), 'utf8');
const mantaCss = await readFile(path.join(root, 'assets/css/manta-planner.css'), 'utf8');
if (!mantaSource.includes("'aria-label':'Open Visit Baa Trip Planner'")) failures.push('manta-planner.js: launcher accessible name is missing');
if (new RegExp(`\\u{1F44B}|manta-launch-hand|manta-launch-bubble`, 'u').test(`${mantaSource}\n${mantaCss}`)) failures.push('Manta launcher must not contain a separate hand or permanent speech bubble');
if (!mantaCss.includes('prefers-reduced-motion')) failures.push('manta-planner.css: reduced-motion handling is missing');
for (const requirement of ['manta-option-track','aria-pressed','Previous ${label}','Next ${label}','trip_requirements','crypto.randomUUID()']) {
  if (!mantaSource.includes(requirement) && !mantaCss.includes(requirement)) failures.push(`Manta planner requirement is missing: ${requirement}`);
}
for(const requirement of ['Manta budget pick','lowest known estimate','recalculateJourney'])if(!mantaSource.includes(requirement))failures.push(`manta-planner.js: budget-selection behavior is missing: ${requirement}`);
for(const requirement of ['activityPlan','How many days, trips, or times would you like to enjoy each activity?','frequency unit','How many?'])if(!mantaSource.includes(requirement))failures.push(`manta-planner.js: customizable activity frequency planning is missing: ${requirement}`);
if(mantaSource.includes("step==='activityPlan'&&(state.answers.islands.length<2"))failures.push('manta-planner.js: activity frequency selection must also appear for single-island trips');
const tripResultsSource = await readFile(path.join(jsDir, 'trip-results.js'), 'utf8');
for(const requirement of ['trip-results.html','baa_manta_search'])if(!mantaSource.includes(requirement))failures.push(`Manta separate-results navigation is missing: ${requirement}`);
for(const requirement of ["Manta's budget-friendly pick",'lowest known suitable option','manta-page-selected','manta-page-alternatives','recalculateJourney'])if(!tripResultsSource.includes(requirement))failures.push(`Manta detailed results requirement is missing: ${requirement}`);
for(const requirement of ['recommendedActivityIsland','plannedActivityDates','activityFrequency:frequency','activityQuantity:quantity'])if(!tripPlannerSource.includes(requirement))failures.push(`trip-planner-service.js: activity frequency scheduling is missing: ${requirement}`);
if (!tripPlannerSource.includes(".neq('category','transfer')")) failures.push('trip-planner-service.js: published transfer listings must be excluded from Manta searches');
if (/routeCandidates\(|kind:'transfer'/.test(tripPlannerSource)) failures.push('trip-planner-service.js: Manta must not create transport route segments');
if (/renderRoutePoint|Where should your journey (?:begin|end)\?/.test(mantaSource)) failures.push('manta-planner.js: pickup and drop-off questions must be removed');
if (!mantaSource.includes('Transportation is arranged directly by your selected guesthouse')) failures.push('manta-planner.js: guesthouse-arranged transportation message is missing');
if (mantaSource.includes(".from('trips').insert({id,user_id:auth.data.user.id,...payload.trip}).select(")) failures.push('manta-planner.js: trip insert must not request RETURNING rows');
if (!mantaSource.includes("const created=await client.from('trips').insert") || !mantaSource.includes("const fetched=await client.from('trips').select('id').eq('id',id).eq('user_id',auth.data.user.id)")) failures.push('manta-planner.js: separate post-insert owner SELECT is missing');
for (const requirement of ['request_trip_bookings','p_idempotency_key','payment_references','Payment references require a trip booking','Visit Baa never receives or holds funds']) {
  if (!sql.includes(requirement)) failures.push(`Trip booking/payment migration is missing: ${requirement}`);
}
for (const status of ['pending_review','verified','changes_requested','rejected','suspended','draft','published','paused','new','accepted','declined','completed','cancelled']) {
  if (!sql.includes(`'${status}'`)) failures.push(`Required status missing from migrations: ${status}`);
}
const onboardingSql = await readFile(path.join(root, 'supabase/migrations/202608170005_operator_business_onboarding.sql'), 'utf8');
for (const requirement of [
  "alter column owner_id set default auth.uid()",
  "new.status := 'pending_review'",
  'new.is_active := false',
  'new.reviewed_by := null',
  'new.reviewed_at := null',
  'new.review_note := null',
  'businesses_insert_own_operator',
  "role = 'operator'"
]) {
  if (!onboardingSql.includes(requirement)) failures.push(`Operator onboarding migration is missing: ${requirement}`);
}

const allTextFiles = [...htmlFiles, ...expected.filter((file) => /\.(?:js|sql|example)$/.test(file))];
for (const file of new Set(allTextFiles)) {
  const source = await readFile(path.join(root, file), 'utf8');
  if (/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/.test(source) || /sb_secret_[a-zA-Z0-9_-]{10,}/.test(source)) {
    failures.push(`${file}: possible secret key detected`);
  }
}

if (failures.length) {
  console.error(`Static checks failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Static checks passed: ${htmlFiles.length} HTML pages, ${(await readdir(jsDir)).filter((name) => name.endsWith('.js')).length} JavaScript modules, ${migrationFiles.length} SQL migrations.`);
