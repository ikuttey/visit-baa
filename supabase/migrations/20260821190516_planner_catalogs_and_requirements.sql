-- Complete customer catalogs, explicit pricing metadata and unmet trip needs.

alter table public.transport_locations
  add column customer_selectable boolean not null default true,
  add column sort_order integer not null default 100;

update public.transport_locations set sort_order=case
  when slug='velana-international-airport' then 10
  when slug='male' then 20
  when slug='dharavandhoo-airport' then 30
  when location_type='island' then 100
  else 200 end;

create or replace view public.public_transport_locations
with (security_barrier=true,security_invoker=true)
as select id,slug,name,location_type,island_name,aliases,is_permanent,customer_selectable,sort_order
from public.transport_locations where is_active and customer_selectable;

create table public.activity_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug=private.normalize_transport_location(slug)),
  name text not null unique check (char_length(trim(name)) between 3 and 120),
  description text,
  listing_categories public.listing_category[] not null default '{}',
  match_terms text[] not null default '{}',
  requires_term_match boolean not null default false,
  customer_selectable boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activity_types_public_order_idx on public.activity_types(sort_order,name) where is_active and customer_selectable;
create trigger activity_types_90_set_updated_at before update on public.activity_types for each row execute function private.set_updated_at();

insert into public.activity_types(slug,name,listing_categories,match_terms,requires_term_match,sort_order) values
  ('snorkelling','Snorkelling',array['snorkelling']::public.listing_category[],array['snorkel','reef'],false,10),
  ('diving','Diving',array['diving']::public.listing_category[],array['dive','diving'],false,20),
  ('marine-life','Manta and marine-life experiences',array['excursion','snorkelling','diving']::public.listing_category[],array['manta','marine life','whale shark','turtle'],true,30),
  ('fishing','Fishing',array['fishing']::public.listing_category[],array['fishing','line fishing','big game'],false,40),
  ('watersports','Watersports',array['watersports']::public.listing_category[],array['kayak','paddle','jet ski','watersport'],false,50),
  ('boat-excursions','Boat excursions',array['excursion']::public.listing_category[],array['boat','cruise','excursion'],false,60),
  ('island-hopping','Island hopping',array['excursion']::public.listing_category[],array['island hopping','island tour'],true,70),
  ('sandbank-trips','Sandbank trips',array['excursion']::public.listing_category[],array['sandbank'],true,80),
  ('sunset-cruises','Sunset cruises',array['excursion']::public.listing_category[],array['sunset','sunset cruise'],true,90),
  ('dolphin-watching','Dolphin watching',array['excursion']::public.listing_category[],array['dolphin'],true,100),
  ('conservation','Conservation experiences',array['conservation_experience']::public.listing_category[],array['conservation','restoration','research'],false,110),
  ('community','Community experiences',array['community_experience']::public.listing_category[],array['community'],false,120),
  ('local-culture','Local culture',array['community_experience']::public.listing_category[],array['culture','heritage','craft'],true,130),
  ('local-food','Local food and dining',array['food_dining']::public.listing_category[],array['local food','dining','cooking'],false,140),
  ('beach-relaxation','Beach and relaxation',array['other','excursion']::public.listing_category[],array['beach','relaxation','picnic'],true,150);

alter table public.activity_types enable row level security;
create policy "activity_types_public_read" on public.activity_types for select to anon,authenticated
using (is_active and customer_selectable);
create policy "activity_types_admin_all" on public.activity_types for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create view public.public_activity_types with (security_barrier=true,security_invoker=true) as
select id,slug,name,description,listing_categories,match_terms,requires_term_match,sort_order
from public.activity_types where is_active and customer_selectable;

alter table public.listings
  alter column price drop not null,
  alter column price drop default,
  add column price_unit_confirmed boolean not null default true,
  add column group_capacity integer check (group_capacity is null or group_capacity > 0),
  add column activity_type_slugs text[] not null default '{}';

-- Existing per-room and generic per-night accommodation values are preserved,
-- but are not treated as deterministic until an operator selects a new unit.
-- Run this production backfill through the existing trusted admin workflow so
-- published rows remain protected by the normal listing trigger.
do $$
declare v_admin_id uuid;
begin
  select user_id into v_admin_id
  from public.user_roles
  where role='admin'
  order by created_at
  limit 1;
  if v_admin_id is null then
    raise exception 'An administrator role is required for the legacy listing price-unit backfill';
  end if;
  perform set_config('request.jwt.claim.sub',v_admin_id::text,true);
  update public.listings set price_unit_confirmed=false
  where category='accommodation'
    and price_unit not in ('per_room_per_night','per_property_per_night','per_person_per_night','fixed_stay','price_on_request');
  perform set_config('request.jwt.claim.sub','',true);
end;
$$;

alter table public.listings add constraint listings_explicit_price_check check (
  (price_unit='price_on_request' and price is null)
  or (price_unit<>'price_on_request' and price is not null and price>=0)
);
alter table public.listings add constraint listings_confirmed_unit_category_check check (
  not price_unit_confirmed
  or (category='accommodation' and price_unit in ('per_room_per_night','per_property_per_night','per_person_per_night','fixed_stay','price_on_request'))
  or (category='transfer' and price_unit in ('per_person','per_trip','per_boat','per_vehicle','per_leg','price_on_request'))
  or (category not in ('accommodation','transfer') and price_unit in ('per_person','per_child','per_group','per_trip','fixed','price_on_request'))
);
alter table public.listings add constraint listings_group_price_capacity_check check (price_unit<>'per_group' or group_capacity is not null);

create or replace function private.enforce_new_listing_price_unit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' and not private.is_admin(auth.uid()) and not new.price_unit_confirmed then
    raise exception 'Choose an explicit price unit before creating a listing';
  end if;
  if tg_op='UPDATE' and not new.price_unit_confirmed
    and (new.price is distinct from old.price or new.price_unit is distinct from old.price_unit) then
    raise exception 'Confirm an explicit price unit before changing this listing price';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_new_listing_price_unit() from public,anon,authenticated;
create trigger listings_15_enforce_price_unit before insert or update of price,price_unit,price_unit_confirmed
on public.listings for each row execute function private.enforce_new_listing_price_unit();

create or replace view public.public_listings with (security_barrier=true,security_invoker=true) as
select l.id,l.business_id,b.business_name,b.logo_path business_logo_path,l.title,l.category,l.island,l.summary,l.description,
  l.price,l.currency,l.price_unit,l.start_time,l.end_time,l.max_capacity,l.available_spaces,l.included_items,l.excluded_items,
  l.meeting_point,l.requirements,l.cancellation_information,l.cover_image_path,l.property_type,l.room_type,l.maximum_guests,
  l.number_of_rooms,l.amenities,l.check_in_time,l.check_out_time,l.price_per_night,
  c.contact->>'email' contact_email,c.contact->>'phone' contact_phone,c.contact->>'website_url' website_url,l.updated_at,
  coalesce(l.latitude,b.latitude) latitude,coalesce(l.longitude,b.longitude) longitude,l.child_price,l.taxes_amount,l.fees_amount,true as is_verified,
  l.price_unit_confirmed,l.group_capacity,l.activity_type_slugs
from public.listings l join public.businesses b on b.id=l.business_id
cross join lateral (select private.public_business_contact(b.id) contact) c
where l.status='published' and l.is_active and b.status='verified' and b.is_active;

create table public.trip_requirements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  requirement_kind text not null check (requirement_kind in ('accommodation','activity','transfer')),
  label text not null check (char_length(trim(label)) between 3 and 300),
  island_name text,
  origin_name text,
  destination_name text,
  planned_date date,
  planned_end_date date,
  activity_type_slug text,
  status text not null default 'unmet' check (status in ('unmet','matched','removed')),
  matched_listing_id uuid references public.listings(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_requirements_dates_check check (planned_end_date is null or planned_date is null or planned_end_date>planned_date)
);
create index trip_requirements_trip_order_idx on public.trip_requirements(trip_id,sort_order,id);
create trigger trip_requirements_90_set_updated_at before update on public.trip_requirements for each row execute function private.set_updated_at();
alter table public.trip_requirements enable row level security;
create policy "trip_requirements_owner_all" on public.trip_requirements for all to authenticated
using (exists(select 1 from public.trips trip where trip.id=trip_id and trip.user_id=auth.uid() and (select private.is_traveler())))
with check (exists(select 1 from public.trips trip where trip.id=trip_id and trip.user_id=auth.uid() and (select private.is_traveler())));

revoke all on public.activity_types,public.trip_requirements from anon,authenticated;
grant select (id,slug,name,description,listing_categories,match_terms,requires_term_match,customer_selectable,is_active,sort_order) on public.activity_types to anon,authenticated;
grant insert,update on public.activity_types to authenticated;
grant select on public.public_activity_types to anon,authenticated;
grant select (customer_selectable,sort_order) on public.transport_locations to anon,authenticated;
grant select on public.public_transport_locations to anon,authenticated;
grant select (price_unit_confirmed,group_capacity,activity_type_slugs) on public.listings to anon,authenticated;
grant select,insert,update,delete on public.trip_requirements to authenticated;
grant select on public.public_listings to anon,authenticated;

comment on table public.activity_types is 'Administrator-maintained customer activity catalog and non-commercial listing matching rules.';
comment on column public.listings.price_unit_confirmed is 'False preserves a legacy ambiguous unit until the operator explicitly selects a deterministic unit.';
comment on table public.trip_requirements is 'Unmet customer requirements retained with a draft trip without inventing a listing or price.';

-- Pending-price enquiries retain NULL until the operator publishes a quote.
-- This also revalidates the current listing unit and price rather than trusting
-- the draft subtotal supplied by the browser.
alter table public.booking_enquiries
  alter column quoted_subtotal drop not null,
  alter column quoted_subtotal drop default,
  alter column quoted_total drop not null,
  alter column quoted_total drop default;

create or replace function private.current_request_subtotal(
  p_item public.trip_items,
  p_listing public.listings
) returns numeric language plpgsql stable security definer set search_path = '' as $$
declare
  v_people integer := p_item.adult_count+p_item.child_count;
  v_nights integer;
begin
  if not p_listing.price_unit_confirmed or p_listing.price_unit='price_on_request' or p_listing.price is null then return null; end if;
  if p_listing.category='accommodation' then
    if p_item.planned_date is null or p_item.planned_end_date is null or p_item.planned_end_date<=p_item.planned_date then
      raise exception 'Valid stay dates are required';
    end if;
    v_nights:=p_item.planned_end_date-p_item.planned_date;
    return case p_listing.price_unit
      when 'per_room_per_night' then p_listing.price*p_item.rooms_requested*v_nights
      when 'per_property_per_night' then p_listing.price*v_nights
      when 'per_person_per_night' then (p_listing.price*p_item.adult_count+coalesce(p_listing.child_price,0)*p_item.child_count)*v_nights
      when 'fixed_stay' then p_listing.price
      else null end;
  elsif p_listing.category='transfer' then
    return case p_listing.price_unit
      when 'per_person' then p_listing.price*v_people
      when 'per_trip' then p_listing.price when 'per_boat' then p_listing.price
      when 'per_vehicle' then p_listing.price when 'per_leg' then p_listing.price
      else null end;
  end if;
  return case p_listing.price_unit
    when 'per_person' then p_listing.price*p_item.adult_count+coalesce(p_listing.child_price,p_listing.price)*p_item.child_count
    when 'per_child' then p_listing.price*p_item.child_count
    when 'per_group' then p_listing.price*ceil(v_people::numeric/p_listing.group_capacity)
    when 'per_trip' then p_listing.price when 'fixed' then p_listing.price
    else null end;
end;
$$;
revoke all on function private.current_request_subtotal(public.trip_items,public.listings) from public,anon,authenticated;

create or replace function private.create_availability_request(
  p_item public.trip_items,p_name text,p_email text,p_phone text
) returns public.booking_enquiries language plpgsql security definer set search_path = '' as $$
declare v_listing public.listings; v_result public.booking_enquiries; v_published numeric(12,2);
begin
  select l.* into v_listing from public.listings l join public.businesses b on b.id=l.business_id
  where l.id=p_item.listing_id and l.status='published' and l.is_active and b.status='verified' and b.is_active;
  if v_listing.id is null then raise exception 'This listing is not available'; end if;
  if p_item.price_unit is distinct from v_listing.price_unit or p_item.quote_currency is distinct from v_listing.currency then
    raise exception 'Published price unit or currency changed for a selected service';
  end if;
  v_published:=private.current_request_subtotal(p_item,v_listing);
  if v_published is distinct from p_item.draft_subtotal then raise exception 'Published price changed for a selected service'; end if;
  insert into public.booking_enquiries(
    listing_id,availability_id,traveler_id,room_id,rate_plan_id,requested_date,check_out_date,requested_time,
    guest_count,adult_count,child_count,rooms_requested,guest_full_name,guest_email,guest_phone,guest_message,
    quoted_subtotal,discount_amount,taxes_amount,fees_amount,quoted_total,quote_currency,quote_status
  ) values (
    p_item.listing_id,null,auth.uid(),null,null,p_item.planned_date,p_item.planned_end_date,p_item.planned_time,
    p_item.adult_count+p_item.child_count,p_item.adult_count,p_item.child_count,p_item.rooms_requested,p_name,p_email,p_phone,
    'Availability request from My Baa Trip. The operator must confirm availability and any pending final total.',
    v_published,0,0,0,v_published,v_listing.currency,'availability_confirmation_required'
  ) returning * into v_result;
  return v_result;
end;
$$;
revoke all on function private.create_availability_request(public.trip_items,text,text,text) from public,anon,authenticated;

create or replace function public.operator_quote_booking(
  p_enquiry_id uuid,p_subtotal numeric,p_taxes numeric default 0,p_fees numeric default 0,p_response text default null
) returns public.booking_enquiries language plpgsql security definer set search_path = '' as $$
declare v_enquiry public.booking_enquiries; v_policy public.listing_policies; v_deposit numeric(5,2); v_total numeric(12,2);
begin
  select * into v_enquiry from public.booking_enquiries where id=p_enquiry_id for update;
  if v_enquiry.id is null or (v_enquiry.operator_id<>auth.uid() and not private.is_admin(auth.uid())) then raise exception 'Booking access denied'; end if;
  if v_enquiry.quote_status<>'availability_confirmation_required' or v_enquiry.status::text not in ('new','changes_requested') then raise exception 'This booking is not awaiting an operator quote'; end if;
  if p_subtotal is null or p_subtotal<0 or coalesce(p_taxes,0)<0 or coalesce(p_fees,0)<0 then raise exception 'Quote amounts must be zero or greater'; end if;
  select * into v_policy from public.listing_policies where listing_id=v_enquiry.listing_id;
  v_deposit:=case v_policy.payment_condition when 'prepayment_required' then 100 when 'deposit_required' then coalesce(v_policy.deposit_percentage,50) else 0 end;
  v_total:=round(p_subtotal+coalesce(p_taxes,0)+coalesce(p_fees,0),2);
  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries set quoted_subtotal=p_subtotal,taxes_amount=coalesce(p_taxes,0),fees_amount=coalesce(p_fees,0),
    quoted_total=v_total,quote_status='confirmed',operator_response=coalesce(nullif(trim(p_response),''),operator_response),
    deposit_percentage=v_deposit,deposit_amount=round(v_total*v_deposit/100,2),balance_due=v_total,
    payment_status=case when v_deposit=0 then 'not_required' else 'unpaid' end
  where id=p_enquiry_id returning * into v_enquiry;
  return v_enquiry;
end;
$$;
revoke all on function public.operator_quote_booking(uuid,numeric,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.operator_quote_booking(uuid,numeric,numeric,numeric,text) to authenticated;

create or replace function private.require_confirmed_quote_for_acceptance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status::text in ('accepted','confirmed') and (new.quote_status<>'confirmed' or new.quoted_total is null) then
    raise exception 'Confirm the booking price before accepting this request';
  end if;
  return new;
end;
$$;
revoke all on function private.require_confirmed_quote_for_acceptance() from public,anon,authenticated;
create trigger booking_enquiries_15_require_quote before update of status on public.booking_enquiries
for each row execute function private.require_confirmed_quote_for_acceptance();

create or replace function private.set_payment_reference_ownership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_booking public.booking_enquiries; v_existing numeric(12,2);
begin
  select * into v_booking from public.booking_enquiries where id=new.booking_id;
  if v_booking.id is null or v_booking.traveler_id<>auth.uid() then raise exception 'Payment reference access denied'; end if;
  if v_booking.trip_id is null or v_booking.trip_item_id is null then raise exception 'Payment references require a trip booking'; end if;
  if v_booking.status::text not in ('accepted','confirmed') then raise exception 'The operator must accept the booking before payment is referenced'; end if;
  if v_booking.quote_status<>'confirmed' or v_booking.quoted_total is null then raise exception 'The operator must confirm the total before payment is referenced'; end if;
  if new.payment_date>current_date then raise exception 'Payment date cannot be in the future'; end if;
  if new.proof_path is not null and split_part(new.proof_path,'/',1)<>auth.uid()::text then raise exception 'Payment proof path is invalid'; end if;
  select coalesce(sum(amount),0) into v_existing from public.payment_references where booking_id=v_booking.id and status in ('submitted','confirmed');
  if v_existing+new.amount>v_booking.quoted_total then raise exception 'Payment references exceed the operator booking total'; end if;
  new.trip_id:=v_booking.trip_id;new.trip_item_id:=v_booking.trip_item_id;new.listing_id:=v_booking.listing_id;
  new.traveler_id:=v_booking.traveler_id;new.operator_id:=v_booking.operator_id;new.currency:=v_booking.quote_currency;
  new.status:='submitted';new.operator_note:=null;new.confirmed_at:=null;
  return new;
end;
$$;
revoke all on function private.set_payment_reference_ownership() from public,anon,authenticated;

notify pgrst, 'reload schema';
