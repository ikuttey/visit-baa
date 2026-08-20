import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = [
  'index.html', 'index (1).html', 'register.html', 'login.html', 'forgot-password.html',
  'reset-password.html', 'operator-dashboard.html', 'admin-dashboard.html', 'listings.html',
  'listing.html', 'business.html', '.env.example', 'config.example.js', 'config.js',
  'serve.json',
  'supabase/migrations/202608170001_core_schema.sql',
  'supabase/migrations/202608170002_rls_and_grants.sql',
  'supabase/migrations/202608170003_storage.sql',
  'supabase/migrations/202608170004_security_hardening.sql',
  'supabase/migrations/202608170005_operator_business_onboarding.sql',
  'supabase/migrations/202608170006_listing_revision_workflow.sql',
  'supabase/migrations/202608180007_public_read_models_rls.sql',
  'supabase/migrations/20260819164311_rpc_execute_grants_hardening.sql',
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
for (const table of ['profiles','user_roles','businesses','business_images','listings','listing_images','availability','booking_enquiries','review_history']) {
  if (!sql.includes(`alter table public.${table} enable row level security`)) failures.push(`RLS is not enabled for ${table}`);
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
