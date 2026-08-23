-- One operator-controlled pricing model for individual activities, packages,
-- transfers and other listings. Existing listing prices remain the main
-- charge; components add included, required or customer-selected optional
-- charges. Existing package rows and historical bookings are preserved.

alter table public.listings
  add column pricing_mode text not null default 'main_plus_components',
  add column service_duration_minutes integer,
  add column service_operating_days smallint[] not null default '{0,1,2,3,4,5,6}',
  add column service_minimum_guests integer not null default 1,
  add column service_pickup_mode text not null default 'not_available',
  add column service_pickup_notes text;

alter table public.listings
  add constraint listings_pricing_mode_check check (pricing_mode in ('main_plus_components','components_only')),
  add constraint listings_service_duration_check check (service_duration_minutes is null or service_duration_minutes between 15 and 10080),
  add constraint listings_service_days_check check (service_operating_days <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(service_operating_days)>0),
  add constraint listings_service_minimum_guests_check check (service_minimum_guests>0 and service_minimum_guests<=max_capacity),
  add constraint listings_service_pickup_check check (service_pickup_mode in ('not_available','included','extra_charge')),
  add constraint listings_service_pickup_notes_check check (service_pickup_notes is null or char_length(service_pickup_notes)<=1000);

alter table public.listings drop constraint if exists listings_explicit_price_check;
alter table public.listings add constraint listings_explicit_price_check check (
  (pricing_mode='components_only' and price is null)
  or (pricing_mode='main_plus_components' and (
    (price_unit='price_on_request' and price is null)
    or (price_unit<>'price_on_request' and price is not null and price>=0)
  ))
);

alter table public.listings drop constraint if exists listings_group_price_capacity_check;
alter table public.listings add constraint listings_group_price_capacity_check check (
  pricing_mode='components_only' or price_unit<>'per_group' or group_capacity is not null
);

alter table public.listings drop constraint if exists listings_confirmed_unit_category_check;
alter table public.listings add constraint listings_confirmed_unit_category_check check (
  not price_unit_confirmed or pricing_mode='components_only'
  or (category='accommodation' and price_unit in ('per_room_per_night','per_property_per_night','per_person_per_night','fixed_stay','per_room','per_night','per_day','price_on_request'))
  or (category='transfer' and price_unit in ('per_person','per_adult','per_child','per_infant','per_booking','per_trip','per_transfer','per_boat','per_vehicle','per_direction','per_leg','fixed','price_on_request'))
  or (category not in ('accommodation','transfer') and price_unit in (
    'per_person','per_adult','per_child','per_infant','per_group','per_booking','per_trip','per_package','per_boat','per_vehicle',
    'per_direction','per_leg','per_hour','per_day','per_night','per_session','per_dive','per_item','per_set','per_room','fixed','price_on_request'
  ))
);

create table public.listing_price_components (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  component_type text not null default 'custom' check (component_type in (
    'guide','transfer','pickup','ticket','snorkelling_equipment','diving_equipment','fishing_equipment',
    'food_drink','private_upgrade','custom'
  )),
  name text not null check (char_length(trim(name)) between 2 and 120),
  charge_status text not null check (charge_status in ('included','required','optional')),
  amount numeric(12,2),
  currency char(3) not null default 'USD' check (currency=upper(currency)),
  price_unit public.price_unit,
  group_capacity integer check (group_capacity is null or group_capacity>0),
  customer_description text check (customer_description is null or char_length(customer_description)<=500),
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_price_component_amount_check check (
    (charge_status='included' and amount is null and price_unit is null)
    or (charge_status<>'included' and price_unit='price_on_request' and amount is null)
    or (charge_status<>'included' and price_unit is not null and price_unit<>'price_on_request' and amount is not null and amount>=0)
  ),
  constraint listing_price_component_group_check check (price_unit<>'per_group' or group_capacity is not null),
  unique (listing_id,name)
);
create index listing_price_components_listing_idx on public.listing_price_components(listing_id,is_active,sort_order);

create table public.listing_price_tiers (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.listing_price_components(id) on delete cascade,
  minimum_guests integer not null check (minimum_guests>0),
  maximum_guests integer not null check (maximum_guests>=minimum_guests),
  amount numeric(12,2) not null check (amount>=0),
  calculation_kind text not null check (calculation_kind in ('per_unit','fixed_total')),
  sort_order integer not null default 0 check (sort_order>=0),
  created_at timestamptz not null default now(),
  unique (component_id,minimum_guests,maximum_guests)
);
create index listing_price_tiers_component_idx on public.listing_price_tiers(component_id,minimum_guests,maximum_guests);

create table public.listing_service_pickup_locations (
  listing_id uuid not null references public.listings(id) on delete cascade,
  location_id uuid not null references public.transport_locations(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order>=0),
  created_at timestamptz not null default now(),
  primary key (listing_id,location_id)
);
create index listing_service_pickup_locations_location_idx on public.listing_service_pickup_locations(location_id,listing_id);

create trigger listing_price_components_90_set_updated_at before update on public.listing_price_components
for each row execute function private.set_updated_at();

create or replace function private.enforce_listing_component_currency()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_currency char(3);
begin
  select currency into v_currency from public.listings where id=new.listing_id;
  if v_currency is null then raise exception 'Listing not found'; end if;
  if new.currency<>v_currency then raise exception 'Every price component must use the listing currency'; end if;
  return new;
end;
$$;
revoke all on function private.enforce_listing_component_currency() from public,anon,authenticated;
create trigger listing_price_components_10_currency before insert or update of listing_id,currency
on public.listing_price_components for each row execute function private.enforce_listing_component_currency();

create or replace function private.prevent_overlapping_price_tiers()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(
    select 1 from public.listing_price_tiers t
    where t.component_id=new.component_id and t.id<>new.id
      and int4range(t.minimum_guests,t.maximum_guests,'[]') && int4range(new.minimum_guests,new.maximum_guests,'[]')
  ) then raise exception 'Price tier guest ranges must not overlap'; end if;
  return new;
end;
$$;
revoke all on function private.prevent_overlapping_price_tiers() from public,anon,authenticated;
create trigger listing_price_tiers_10_no_overlap before insert or update on public.listing_price_tiers
for each row execute function private.prevent_overlapping_price_tiers();

create or replace function private.validate_listing_component_pricing()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.pricing_mode='components_only' and new.status in ('pending_review','published') and not exists(
    select 1 from public.listing_price_components c
    where c.listing_id=new.id and c.is_active and c.charge_status='required'
  ) then raise exception 'Component-only pricing needs at least one required charge before submission'; end if;
  return new;
end;
$$;
revoke all on function private.validate_listing_component_pricing() from public,anon,authenticated;
create trigger listings_14_validate_component_pricing before insert or update of status,pricing_mode
on public.listings for each row execute function private.validate_listing_component_pricing();

alter table public.listing_price_components enable row level security;
alter table public.listing_price_tiers enable row level security;
alter table public.listing_service_pickup_locations enable row level security;

create policy "price_components_public_or_owner_read" on public.listing_price_components for select to anon,authenticated
using ((select private.is_public_listing(listing_id)) or (select private.owns_listing(listing_id)) or (select private.is_admin()));
create policy "price_components_owner_all" on public.listing_price_components for all to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_listing(listing_id)) or (select private.is_admin()));
create policy "price_tiers_public_or_owner_read" on public.listing_price_tiers for select to anon,authenticated
using (exists(
  select 1 from public.listing_price_components c where c.id=component_id
    and ((select private.is_public_listing(c.listing_id)) or (select private.owns_listing(c.listing_id)) or (select private.is_admin()))
));
create policy "price_tiers_owner_all" on public.listing_price_tiers for all to authenticated
using (exists(select 1 from public.listing_price_components c where c.id=component_id and ((select private.owns_listing(c.listing_id)) or (select private.is_admin()))))
with check (exists(select 1 from public.listing_price_components c where c.id=component_id and ((select private.owns_listing(c.listing_id)) or (select private.is_admin()))));
create policy "service_pickup_locations_public_or_owner_read" on public.listing_service_pickup_locations for select to anon,authenticated
using ((select private.is_public_listing(listing_id)) or (select private.owns_listing(listing_id)) or (select private.is_admin()));
create policy "service_pickup_locations_owner_all" on public.listing_service_pickup_locations for all to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_listing(listing_id)) or (select private.is_admin()));

revoke all on public.listing_price_components,public.listing_price_tiers,public.listing_service_pickup_locations from anon,authenticated;
grant select on public.listing_price_components,public.listing_price_tiers,public.listing_service_pickup_locations to anon,authenticated;
grant insert,update,delete on public.listing_price_components,public.listing_price_tiers,public.listing_service_pickup_locations to authenticated;
grant select (pricing_mode,service_duration_minutes,service_operating_days,service_minimum_guests,service_pickup_mode,service_pickup_notes)
  on public.listings to anon,authenticated;

-- Append normalized components and tiers to the existing public listing read
-- model. No private operator information is exposed.
create or replace view public.public_listings with (security_barrier=true,security_invoker=true) as
select l.id,l.business_id,b.business_name,b.logo_path business_logo_path,l.title,l.category,l.island,l.summary,l.description,
  l.price,l.currency,l.price_unit,l.start_time,l.end_time,l.max_capacity,l.available_spaces,l.included_items,l.excluded_items,
  l.meeting_point,l.requirements,l.cancellation_information,l.cover_image_path,l.property_type,l.room_type,l.maximum_guests,
  l.number_of_rooms,l.amenities,l.check_in_time,l.check_out_time,l.price_per_night,
  c.contact->>'email' contact_email,c.contact->>'phone' contact_phone,c.contact->>'website_url' website_url,l.updated_at,
  coalesce(l.latitude,b.latitude) latitude,coalesce(l.longitude,b.longitude) longitude,l.child_price,l.taxes_amount,l.fees_amount,true is_verified,
  l.price_unit_confirmed,l.group_capacity,l.activity_type_slugs,l.listing_kind,
  (l.listing_kind='excursion_package') is_package,coalesce(l.service_duration_minutes,pd.duration_minutes) duration_minutes,
  case when l.listing_kind='excursion_package' then pd.operating_days else l.service_operating_days end operating_days,
  case when l.listing_kind='excursion_package' then pd.minimum_guests else l.service_minimum_guests end package_minimum_guests,
  case when l.listing_kind='excursion_package' then pd.maximum_guests else l.max_capacity end package_maximum_guests,
  pd.infant_policy,pd.shared_trip_price,pd.private_trip_price,pd.equipment_included,
  pd.meal_included,pd.drinking_water_included,coalesce(pd.pickup_mode,l.service_pickup_mode) pickup_mode,
  coalesce(pd.pickup_notes,l.service_pickup_notes) pickup_notes,pd.airport_pickup,pd.dropoff_mode,pd.dropoff_notes,pd.booking_lead_hours,
  coalesce(bs.service_category_slugs,'{}'::text[]) provider_service_category_slugs,
  coalesce(pt.transfer_options,'[]'::jsonb) package_transfer_options,
  lower(concat_ws(' ',b.business_name,l.title,l.island::text,l.category::text,l.summary,array_to_string(l.activity_type_slugs,' '),array_to_string(bs.service_category_slugs,' '))) search_text,
  l.pricing_mode,coalesce(pc.price_components,'[]'::jsonb) price_components,
  array(select distinct pickup_name from unnest(coalesce(pt.pickup_locations,'{}'::text[])||coalesce(sl.pickup_locations,'{}'::text[])) as locations(pickup_name) order by pickup_name) pickup_location_names,
  coalesce(sl.pickup_options,'[]'::jsonb) service_pickup_locations
from public.listings l join public.businesses b on b.id=l.business_id
cross join lateral (select private.public_business_contact(b.id) contact) c
left join public.listing_package_details pd on pd.listing_id=l.id
left join lateral (
  select array_agg(sc.slug order by sc.sort_order,sc.name) service_category_slugs
  from public.business_service_categories bsc join public.service_categories sc on sc.id=bsc.service_category_id
  where bsc.business_id=b.id and sc.is_active
) bs on true
left join lateral (
  select jsonb_agg(jsonb_build_object('direction',pto.direction,'location_id',pto.location_id,'location',tl.name,
    'availability',pto.availability,'fee',pto.fee,'currency',pto.currency,'notes',pto.notes)
    order by pto.direction,tl.sort_order,tl.name) transfer_options,
    array_agg(tl.name order by tl.sort_order,tl.name) filter (where pto.direction='pickup' and pto.availability<>'not_available') pickup_locations
  from public.package_transfer_options pto join public.transport_locations tl on tl.id=pto.location_id
  where pto.listing_id=l.id
) pt on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'id',component.id,'component_type',component.component_type,'name',component.name,'charge_status',component.charge_status,
    'amount',component.amount,'currency',component.currency,'price_unit',component.price_unit,'group_capacity',component.group_capacity,
    'customer_description',component.customer_description,'sort_order',component.sort_order,
    'tiers',coalesce((select jsonb_agg(jsonb_build_object('id',tier.id,'minimum_guests',tier.minimum_guests,
      'maximum_guests',tier.maximum_guests,'amount',tier.amount,'calculation_kind',tier.calculation_kind,'sort_order',tier.sort_order)
      order by tier.sort_order,tier.minimum_guests) from public.listing_price_tiers tier where tier.component_id=component.id),'[]'::jsonb)
  ) order by component.sort_order,component.name) price_components
  from public.listing_price_components component where component.listing_id=l.id and component.is_active
) pc on true
left join lateral (
  select array_agg(tl.name order by location.sort_order,tl.name) pickup_locations,
    jsonb_agg(jsonb_build_object('location_id',location.location_id,'location',tl.name)
      order by location.sort_order,tl.name) pickup_options
  from public.listing_service_pickup_locations location join public.transport_locations tl on tl.id=location.location_id
  where location.listing_id=l.id
) sl on true
where l.status='published' and l.is_active and b.status='verified' and b.is_active
  and exists (
    select 1 from public.business_service_categories eligible
    join public.service_categories sc on sc.id=eligible.service_category_id and sc.is_active
    where eligible.business_id=l.business_id and l.category=any(sc.listing_categories)
  );
grant select on public.public_listings to anon,authenticated;

alter table public.trip_items
  add column selected_price_component_ids uuid[] not null default '{}',
  add column price_snapshot jsonb;
alter table public.booking_enquiries
  add column selected_price_component_ids uuid[] not null default '{}',
  add column price_snapshot jsonb,
  add column price_snapshot_created_at timestamptz;

-- Builds an immutable, readable calculation from current operator rules. It is
-- private and is called only by trusted booking functions/triggers.
create or replace function private.build_listing_price_snapshot(
  p_listing_id uuid,p_adults integer,p_children integer,p_infants integer default 0,p_rooms integer default 1,
  p_nights integer default 1,p_optional_component_ids uuid[] default '{}'
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_listing public.listings; v_component public.listing_price_components;
  v_provider_name text; v_tier_id uuid; v_tier_amount numeric(12,2); v_tier_kind text;
  v_people integer:=greatest(0,coalesce(p_adults,0))+greatest(0,coalesce(p_children,0))+greatest(0,coalesce(p_infants,0));
  v_lines jsonb:='[]'::jsonb; v_required numeric(12,2):=0; v_optional numeric(12,2):=0;
  v_quantity numeric; v_rate numeric(12,2); v_amount numeric(12,2); v_required_pending boolean:=false; v_optional_pending boolean:=false; v_selected boolean;
begin
  select * into v_listing from public.listings where id=p_listing_id;
  if v_listing.id is null then raise exception 'Listing not found'; end if;
  select business_name into v_provider_name from public.businesses where id=v_listing.business_id;

  if v_listing.pricing_mode='main_plus_components' then
    v_quantity:=case v_listing.price_unit
      when 'per_person' then v_people when 'per_adult' then p_adults when 'per_child' then p_children when 'per_infant' then p_infants
      when 'per_group' then ceil(v_people::numeric/v_listing.group_capacity) when 'per_room_per_night' then p_rooms*p_nights
      when 'per_property_per_night' then p_nights when 'per_person_per_night' then v_people*p_nights
      when 'per_room' then p_rooms when 'per_night' then p_nights when 'per_day' then p_nights
      else 1 end;
    if v_listing.price_unit='per_person_per_night' and v_listing.child_price is not null then
      v_amount:=(v_listing.price*p_adults+v_listing.child_price*p_children)*p_nights;
    elsif v_listing.price_unit='per_adult' and v_listing.child_price is not null then
      v_amount:=v_listing.price*p_adults+v_listing.child_price*p_children;
    elsif v_listing.price_unit='per_person' and v_listing.child_price is not null then
      v_amount:=v_listing.price*p_adults+v_listing.child_price*p_children+v_listing.price*p_infants;
    elsif v_listing.price_unit='price_on_request' or v_listing.price is null or not v_listing.price_unit_confirmed then
      v_amount:=null;v_required_pending:=true;
    else v_amount:=v_listing.price*v_quantity; end if;
    if v_amount is not null then v_required:=v_required+v_amount; end if;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('component_id',null,'name','Main service charge','status','required',
      'operator_price',v_listing.price,'currency',v_listing.currency,'unit',v_listing.price_unit,'quantity',v_quantity,'calculated_amount',v_amount,'selected',true));
  end if;

  for v_component in select * from public.listing_price_components where listing_id=p_listing_id and is_active order by sort_order,name loop
    v_selected:=v_component.charge_status<>'optional' or v_component.id=any(coalesce(p_optional_component_ids,'{}'::uuid[]));
    v_quantity:=case v_component.price_unit
      when 'per_person' then v_people when 'per_adult' then p_adults when 'per_child' then p_children when 'per_infant' then p_infants
      when 'per_group' then ceil(v_people::numeric/v_component.group_capacity) when 'per_room_per_night' then p_rooms*p_nights
      when 'per_property_per_night' then p_nights when 'per_person_per_night' then v_people*p_nights
      when 'per_room' then p_rooms when 'per_night' then p_nights when 'per_day' then p_nights
      else 1 end;
    v_rate:=v_component.amount;v_amount:=null;v_tier_id:=null;v_tier_amount:=null;v_tier_kind:=null;
    select id,amount,calculation_kind into v_tier_id,v_tier_amount,v_tier_kind from public.listing_price_tiers
      where component_id=v_component.id and v_people between minimum_guests and maximum_guests
      order by sort_order,minimum_guests limit 1;
    if v_component.charge_status='included' then v_quantity:=0;v_amount:=0;
    elsif v_component.price_unit='price_on_request' then
      if v_component.charge_status='required' then v_required_pending:=true;
      elsif v_component.charge_status='optional' and v_selected then v_optional_pending:=true; end if;
    elsif v_tier_id is not null then
      v_rate:=v_tier_amount;v_amount:=case when v_tier_kind='fixed_total' then v_rate else v_rate*v_quantity end;
    else v_amount:=v_rate*v_quantity; end if;
    if v_component.charge_status='required' and v_amount is not null then v_required:=v_required+v_amount; end if;
    if v_component.charge_status='optional' and v_selected and v_amount is not null then v_optional:=v_optional+v_amount; end if;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('component_id',v_component.id,'name',v_component.name,
      'component_type',v_component.component_type,'status',v_component.charge_status,'operator_price',v_rate,
      'currency',v_component.currency,'unit',v_component.price_unit,'quantity',v_quantity,'calculated_amount',v_amount,
      'selected',v_selected,'tier_id',v_tier_id,'tier_calculation',v_tier_kind));
  end loop;
  return jsonb_build_object('version',1,'listing_id',v_listing.id,'listing_title',v_listing.title,'provider_business_id',v_listing.business_id,'provider_business_name',v_provider_name,
    'currency',v_listing.currency,'party',jsonb_build_object('adults',p_adults,'children',p_children,'infants',p_infants,'rooms',p_rooms,'nights',p_nights),
    'lines',v_lines,'required_total',case when v_required_pending then null else v_required end,
    'selected_optional_total',case when v_optional_pending then null else v_optional end,
    'final_total',case when v_required_pending or v_optional_pending then null else v_required+v_optional end,
    'price_pending',v_required_pending or v_optional_pending);
end;
$$;
revoke all on function private.build_listing_price_snapshot(uuid,integer,integer,integer,integer,integer,uuid[]) from public,anon,authenticated;

create or replace function private.current_request_subtotal(p_item public.trip_items,p_listing public.listings)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_snapshot jsonb; v_nights integer:=1;
begin
  if p_listing.category='accommodation' then
    if p_item.planned_date is null or p_item.planned_end_date is null or p_item.planned_end_date<=p_item.planned_date then raise exception 'Valid stay dates are required'; end if;
    v_nights:=p_item.planned_end_date-p_item.planned_date;
  end if;
  v_snapshot:=private.build_listing_price_snapshot(p_listing.id,p_item.adult_count,p_item.child_count,0,p_item.rooms_requested,v_nights,p_item.selected_price_component_ids);
  return (v_snapshot->>'final_total')::numeric;
end;
$$;
revoke all on function private.current_request_subtotal(public.trip_items,public.listings) from public,anon,authenticated;

create or replace function private.refresh_enquiry_price_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_listing public.listings; v_snapshot jsonb; v_nights integer:=1; v_subtotal numeric(12,2); v_discount numeric(12,2);
begin
  select * into v_listing from public.listings where id=new.listing_id;
  if v_listing.id is null then return new; end if;
  if v_listing.category='accommodation' and new.check_out_date is not null then v_nights:=new.check_out_date-new.requested_date; end if;
  v_snapshot:=private.build_listing_price_snapshot(new.listing_id,new.adult_count,new.child_count,0,new.rooms_requested,v_nights,new.selected_price_component_ids);
  if v_listing.category='accommodation' and v_listing.pricing_mode='main_plus_components'
    and not exists(select 1 from public.listing_price_components where listing_id=new.listing_id and is_active)
    and new.quoted_subtotal is not null then
    v_snapshot:=v_snapshot||jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('component_id',null,'name','Accommodation booking quote',
      'status','required','operator_price',null,'currency',new.quote_currency,'unit','fixed_stay','quantity',1,
      'calculated_amount',new.quoted_subtotal,'selected',true)),'required_total',new.quoted_subtotal,
      'selected_optional_total',0,'final_total',new.quoted_subtotal,'price_pending',false);
  end if;
  new.price_snapshot:=v_snapshot;new.price_snapshot_created_at:=now();
  v_subtotal:=(v_snapshot->>'final_total')::numeric;
  if v_subtotal is null then
    new.quoted_subtotal:=null;new.discount_amount:=0;new.quoted_total:=null;new.quote_status:='availability_confirmation_required';
  elsif v_listing.category<>'accommodation' or v_listing.pricing_mode='components_only' or exists(select 1 from public.listing_price_components where listing_id=new.listing_id and is_active) then
    select case when p.discount_type='percent' then round(v_subtotal*p.discount_value/100,2) else p.discount_value end into v_discount
    from public.promotions p where p.listing_id=new.listing_id and p.is_active and new.requested_date between p.valid_from and p.valid_until
      and (p.minimum_nights is null or v_nights>=p.minimum_nights)
    order by case when p.discount_type='percent' then v_subtotal*p.discount_value/100 else p.discount_value end desc limit 1;
    v_discount:=least(v_subtotal,coalesce(v_discount,0));new.quoted_subtotal:=v_subtotal;new.discount_amount:=v_discount;
    new.quoted_total:=greatest(0,v_subtotal-v_discount+coalesce(new.taxes_amount,0)+coalesce(new.fees_amount,0));
  end if;
  new.price_snapshot:=new.price_snapshot||jsonb_build_object('discount_amount',new.discount_amount,'taxes_amount',new.taxes_amount,
    'fees_amount',new.fees_amount,'quoted_total',new.quoted_total);
  return new;
end;
$$;
revoke all on function private.refresh_enquiry_price_snapshot() from public,anon,authenticated;
create trigger booking_enquiries_13_price_snapshot before insert or update of selected_price_component_ids
on public.booking_enquiries for each row execute function private.refresh_enquiry_price_snapshot();

create or replace function private.snapshot_trip_item_locations()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_item public.trip_items; v_listing public.listings; v_snapshot jsonb; v_nights integer:=1;
begin
  if new.trip_item_id is distinct from old.trip_item_id and new.trip_item_id is not null then
    select * into v_item from public.trip_items where id=new.trip_item_id;
    select * into v_listing from public.listings where id=v_item.listing_id;
    new.pickup_point_snapshot:=v_item.pickup_point;new.dropoff_point_snapshot:=v_item.dropoff_point;
    new.selected_price_component_ids:=v_item.selected_price_component_ids;
    if v_listing.category='accommodation' and v_item.planned_end_date is not null then v_nights:=v_item.planned_end_date-v_item.planned_date; end if;
    v_snapshot:=private.build_listing_price_snapshot(v_listing.id,v_item.adult_count,v_item.child_count,0,v_item.rooms_requested,v_nights,v_item.selected_price_component_ids);
    new.price_snapshot:=v_snapshot;new.price_snapshot_created_at:=now();new.quoted_subtotal:=(v_snapshot->>'final_total')::numeric;
    new.quoted_total:=case when new.quoted_subtotal is null then null else greatest(0,new.quoted_subtotal-coalesce(new.discount_amount,0)+coalesce(new.taxes_amount,0)+coalesce(new.fees_amount,0)) end;
    if new.quoted_subtotal is null then new.quote_status:='availability_confirmation_required'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.snapshot_trip_item_locations() from public,anon,authenticated;

create or replace function public.create_priced_booking_request(
  p_listing_id uuid,p_availability_id uuid default null,p_room_id uuid default null,p_rate_plan_id uuid default null,
  p_requested_date date default null,p_check_out_date date default null,p_requested_time time default null,
  p_adults integer default 1,p_children integer default 0,p_rooms integer default 1,p_guest_full_name text default null,
  p_guest_email text default null,p_guest_phone text default null,p_guest_message text default null,
  p_optional_component_ids uuid[] default '{}',p_pickup_location_id uuid default null,p_dropoff_location_id uuid default null
) returns public.booking_enquiries language plpgsql security definer set search_path='' as $$
declare v_result public.booking_enquiries;v_pickup text;v_dropoff text;
begin
  if exists(
    select 1 from unnest(coalesce(p_optional_component_ids,'{}'::uuid[])) requested(id)
    left join public.listing_price_components c on c.id=requested.id and c.listing_id=p_listing_id and c.charge_status='optional' and c.is_active
    where c.id is null
  ) then raise exception 'One or more optional charges are not available for this listing'; end if;
  if p_pickup_location_id is not null then
    select tl.name||' — '||replace(pto.availability,'_',' ')||case when pto.fee is not null then ' '||pto.currency||' '||pto.fee::text else '' end into v_pickup
    from public.package_transfer_options pto join public.transport_locations tl on tl.id=pto.location_id
    where pto.listing_id=p_listing_id and pto.direction='pickup' and pto.location_id=p_pickup_location_id and pto.availability<>'not_available';
    if v_pickup is null then
      select tl.name||' — '||replace(l.service_pickup_mode,'_',' ') into v_pickup
      from public.listing_service_pickup_locations pickup join public.transport_locations tl on tl.id=pickup.location_id
      join public.listings l on l.id=pickup.listing_id
      where pickup.listing_id=p_listing_id and pickup.location_id=p_pickup_location_id and l.service_pickup_mode<>'not_available';
    end if;
    if v_pickup is null then raise exception 'The selected pickup is not available'; end if;
  end if;
  if p_dropoff_location_id is not null then
    select tl.name||' — '||replace(pto.availability,'_',' ')||case when pto.fee is not null then ' '||pto.currency||' '||pto.fee::text else '' end into v_dropoff
    from public.package_transfer_options pto join public.transport_locations tl on tl.id=pto.location_id
    where pto.listing_id=p_listing_id and pto.direction='dropoff' and pto.location_id=p_dropoff_location_id and pto.availability<>'not_available';
    if v_dropoff is null then raise exception 'The selected drop-off is not available'; end if;
  end if;
  v_result:=public.create_booking_request(p_listing_id,p_availability_id,p_room_id,p_rate_plan_id,p_requested_date,p_check_out_date,
    p_requested_time,p_adults,p_children,p_rooms,p_guest_full_name,p_guest_email,p_guest_phone,p_guest_message);
  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries set selected_price_component_ids=coalesce(p_optional_component_ids,'{}'::uuid[]),
    pickup_point_snapshot=coalesce(v_pickup,pickup_point_snapshot),dropoff_point_snapshot=coalesce(v_dropoff,dropoff_point_snapshot)
    where id=v_result.id returning * into v_result;
  return v_result;
end;
$$;
revoke all on function public.create_priced_booking_request(uuid,uuid,uuid,uuid,date,date,time,integer,integer,integer,text,text,text,text,uuid[],uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_priced_booking_request(uuid,uuid,uuid,uuid,date,date,time,integer,integer,integer,text,text,text,text,uuid[],uuid,uuid) to anon,authenticated;

comment on table public.listing_price_components is 'Operator-entered included, required and optional charges shared by activities and excursion packages.';
comment on table public.listing_price_tiers is 'Optional operator-entered, non-overlapping guest-count rates; no rates are generated by Visit Baa.';
comment on column public.booking_enquiries.price_snapshot is 'Immutable operator price rules and calculated quantities captured when the request is submitted.';
comment on column public.trip_items.price_snapshot is 'Draft calculation snapshot; booking_enquiries receives a fresh immutable snapshot at submission.';

notify pgrst, 'reload schema';
