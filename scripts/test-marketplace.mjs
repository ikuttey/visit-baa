import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { availabilityLabel, datesInStay, distanceKilometres, nightsBetween, quoteSummary } from '../assets/js/marketplace.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await readFile(path.join(root, 'supabase/migrations/20260821135813_marketplace_core.sql'), 'utf8');
const locationMigration = await readFile(path.join(root, 'supabase/migrations/20260821182324_normalized_transport_locations.sql'), 'utf8');
const priceUnitMigration = await readFile(path.join(root, 'supabase/migrations/20260821190514_explicit_pricing_units.sql'), 'utf8');
const plannerMigration = await readFile(path.join(root, 'supabase/migrations/20260821190516_planner_catalogs_and_requirements.sql'), 'utf8');
const journeyParentMigration = await readFile(path.join(root, 'supabase/migrations/20260821195038_journey_location_parent_validation.sql'), 'utf8');

assert.equal(nightsBetween('2026-09-15', '2026-09-18'), 3);
assert.deepEqual(datesInStay('2026-09-15', '2026-09-18'), ['2026-09-15','2026-09-16','2026-09-17']);
assert.equal(availabilityLabel(0, 1), 'Sold out');
assert.equal(availabilityLabel(2, 2), 'Limited availability');
assert.equal(availabilityLabel(9, 2), 'Available');
assert.deepEqual(quoteSummary({ category:'accommodation', price:90, taxes_amount:12, fees_amount:5 }, { nights:3, rooms:2 }), { subtotal:540, taxes:12, fees:5, total:557 });
assert.ok(Math.abs(distanceKilometres(5.1561, 73.1302, 5.1590, 73.1310) - 0.33) < 0.1);

const tables = ['traveler_profiles','accommodation_rooms','room_images','room_availability','room_rate_plans','listing_policies','promotions','saved_listings','trips','trip_items','enquiry_messages','reviews','review_responses'];
for (const table of tables) {
  assert.match(migration, new RegExp(`create table public\\.${table}\\b`), `${table} must be created`);
  assert.ok(migration.includes(`alter table public.${table} enable row level security`), `${table} must use RLS`);
}

for (const functionName of ['create_booking_request','operator_update_booking','traveler_cancel_booking','operator_report_review']) {
  assert.match(migration, new RegExp(`create or replace function public\\.${functionName}[\\s\\S]*?security definer set search_path = ''`), `${functionName} must use a fixed empty search_path`);
  assert.match(migration, new RegExp(`revoke all on function public\\.${functionName}`), `${functionName} must not retain default execute rights`);
}

assert.ok(migration.includes('for update;'), 'confirmation must lock the reservation');
assert.ok(migration.includes('available_quantity>=v_enquiry.rooms_requested'), 'room confirmation must use a guarded inventory decrement');
assert.ok(migration.includes('remaining_spaces>=v_enquiry.guest_count'), 'session confirmation must use a guarded capacity decrement');
assert.ok(migration.includes("e.status='completed'"), 'reviews must require a completed reservation');
assert.ok(migration.includes("raise exception 'Review scores and content cannot be edited'"), 'review content must be immutable during moderation');
assert.ok(migration.includes('private.can_access_enquiry(enquiry_id)'), 'message RLS must bind access to reservation participants');
assert.ok(migration.includes('v_unit_price := v_room.base_price'), 'server pricing must use stored room prices');
assert.ok(!/listing_sessions/.test(migration), 'the existing availability session architecture must be reused');
assert.ok(!/alter\s+column\s+amenities/i.test(migration), 'the established facilities storage must remain unchanged');
assert.match(locationMigration,/create table public\.transport_locations/, 'transport locations must have one normalized source table');
assert.match(locationMigration,/alter table public\.transport_locations enable row level security/, 'transport locations must use RLS');
assert.match(locationMigration,/security_barrier=true,\s*security_invoker=true/, 'the public transport view must enforce invoker permissions');
assert.match(locationMigration,/grant select \(id,slug,name,location_type,island_name,aliases,is_permanent,is_active\)/, 'public transport grants must exclude ownership metadata');
assert.match(locationMigration,/Velana International Airport \(MLE\)[\s\S]*?'Malé'/, 'Velana airport and Malé city must remain distinct permanent locations');
assert.match(locationMigration,/notify pgrst, 'reload schema'/, 'the completed migration must reload the PostgREST schema cache');
assert.doesNotMatch(locationMigration,/drop table public\.trips/, 'the existing trip workflow must never be replaced');
for(const unit of ['per_room_per_night','per_property_per_night','per_person_per_night','fixed_stay','price_on_request','per_vehicle','per_leg'])assert.match(priceUnitMigration,new RegExp(`'${unit}'`),`${unit} must be added by the enum-only migration`);
for(const table of ['activity_types','trip_requirements']){
  assert.match(plannerMigration,new RegExp(`create table public\\.${table}`),`${table} must be created`);
  assert.ok(plannerMigration.includes(`alter table public.${table} enable row level security`),`${table} must use RLS`);
}
assert.match(plannerMigration,/create view public\.public_activity_types with \(security_barrier=true,security_invoker=true\)/,'activity catalog view must enforce invoker permissions');
assert.match(plannerMigration,/price_unit_confirmed=false[\s\S]*?category='accommodation'[\s\S]*?price_unit not in \('per_room_per_night','per_property_per_night','per_person_per_night','fixed_stay','price_on_request'\)/,'all legacy ambiguous accommodation prices must be preserved but marked unconfirmed');
assert.match(plannerMigration,/quoted_subtotal drop not null[\s\S]*?quoted_total drop not null/,'pending operator quotes must remain null instead of zero');
assert.match(plannerMigration,/current_request_subtotal[\s\S]*?Published price changed for a selected service/,'request booking prices must be recalculated from current published data');
assert.match(plannerMigration,/operator_quote_booking[\s\S]*?require_confirmed_quote_for_acceptance/,'operators must confirm pending totals before accepting requests');
assert.match(plannerMigration,/quote_status<>'confirmed' or v_booking\.quoted_total is null/,'payment references must reject unconfirmed or unknown totals');
assert.match(plannerMigration,/grant execute on function public\.operator_quote_booking/,'operator quote RPC must use an explicit authenticated grant');
assert.match(plannerMigration,/notify pgrst, 'reload schema'/,'the planner migration must reload the PostgREST schema cache');
assert.match(journeyParentMigration,/location_type not in \('airport','island'\)[\s\S]*?island_name/,'airport and island catalog rows must retain a parent location');
assert.match(journeyParentMigration,/notify pgrst, 'reload schema'/,'the location-parent migration must reload the PostgREST schema cache');

console.log('Marketplace unit and migration security-contract tests passed.');
