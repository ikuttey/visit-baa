-- Multi-business operators, normalized business capabilities, and structured
-- excursion packages. This migration is forward-only and preserves every
-- existing business and listing.

-- One operator may own many independently reviewed businesses.
alter table public.businesses
  drop constraint if exists businesses_owner_id_key;

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null unique check (char_length(trim(name)) between 3 and 120),
  description text,
  listing_categories public.listing_category[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.service_categories(slug,name,listing_categories,sort_order) values
  ('accommodation','Accommodation / Guesthouse',array['accommodation']::public.listing_category[],10),
  ('excursions','Excursion Centre',array['excursion','snorkelling']::public.listing_category[],20),
  ('diving','Dive Centre',array['diving','excursion']::public.listing_category[],30),
  ('transport','Speedboat / Transport',array['transfer','excursion']::public.listing_category[],40),
  ('private-charter','Private Charter',array['transfer','excursion','fishing']::public.listing_category[],50),
  ('fishing','Fishing Operator',array['fishing','excursion']::public.listing_category[],60),
  ('watersports','Watersports',array['watersports','excursion']::public.listing_category[],70),
  ('local-experiences','Local Experiences',array['community_experience','food_dining','other']::public.listing_category[],80),
  ('conservation','Conservation Experiences',array['conservation_experience','community_experience']::public.listing_category[],90),
  ('food-dining','Food / Dining',array['food_dining']::public.listing_category[],100),
  ('other','Other eligible Visit Baa services',array['other']::public.listing_category[],110)
on conflict (slug) do update set
  name=excluded.name,listing_categories=excluded.listing_categories,sort_order=excluded.sort_order;

create table public.business_service_categories (
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_category_id uuid not null references public.service_categories(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (business_id,service_category_id)
);
create index business_service_categories_category_idx
  on public.business_service_categories(service_category_id,business_id);

-- Existing businesses retain their legacy primary category and receive the
-- equivalent normalized service capability without re-registration.
insert into public.business_service_categories(business_id,service_category_id)
select b.id,sc.id
from public.businesses b
join public.service_categories sc on sc.slug=case b.category::text
  when 'guesthouse_hotel' then 'accommodation'
  when 'dive_centre' then 'diving'
  when 'snorkelling_excursion' then 'excursions'
  when 'fishing_operator' then 'fishing'
  when 'watersports_provider' then 'watersports'
  when 'restaurant_cafe' then 'food-dining'
  when 'speedboat_transfer' then 'transport'
  when 'conservation_community' then 'conservation'
  else 'other' end
on conflict do nothing;

-- Preserve every cross-service listing that already exists, even when the
-- legacy primary business category did not describe it.
insert into public.business_service_categories(business_id,service_category_id)
select distinct l.business_id,sc.id from public.listings l
join public.service_categories sc on sc.slug=case l.category::text
  when 'accommodation' then 'accommodation' when 'transfer' then 'transport'
  when 'diving' then 'diving' when 'fishing' then 'fishing' when 'watersports' then 'watersports'
  when 'food_dining' then 'food-dining' when 'conservation_experience' then 'conservation'
  when 'community_experience' then 'local-experiences' when 'excursion' then 'excursions'
  when 'snorkelling' then 'excursions' else 'other' end
on conflict do nothing;

alter table public.listings
  add column listing_kind text not null default 'standard',
  add constraint listings_kind_check check (listing_kind in ('standard','excursion_package')),
  add constraint listings_package_category_check check (listing_kind<>'excursion_package' or category='excursion');
create index listings_kind_public_idx on public.listings(listing_kind,status,is_active);

create table public.listing_package_details (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  duration_minutes integer not null check (duration_minutes between 15 and 10080),
  operating_days smallint[] not null default '{0,1,2,3,4,5,6}',
  minimum_guests integer not null default 1 check (minimum_guests > 0),
  maximum_guests integer not null check (maximum_guests > 0),
  infant_policy text check (infant_policy is null or char_length(infant_policy)<=1000),
  shared_trip_price numeric(12,2) check (shared_trip_price is null or shared_trip_price>=0),
  private_trip_price numeric(12,2) check (private_trip_price is null or private_trip_price>=0),
  equipment_included boolean not null default false,
  meal_included boolean not null default false,
  drinking_water_included boolean not null default false,
  pickup_mode text not null default 'meet_at_provider' check (pickup_mode in ('included','extra_charge','meet_at_provider','not_available')),
  pickup_notes text check (pickup_notes is null or char_length(pickup_notes)<=1000),
  airport_pickup boolean not null default false,
  dropoff_mode text not null default 'same_as_pickup' check (dropoff_mode in ('included','extra_charge','same_as_pickup','not_available')),
  dropoff_notes text check (dropoff_notes is null or char_length(dropoff_notes)<=1000),
  booking_lead_hours integer not null default 24 check (booking_lead_hours between 0 and 8760),
  updated_at timestamptz not null default now(),
  constraint package_guest_range_check check (maximum_guests is null or maximum_guests>=minimum_guests),
  constraint package_operating_days_check check (operating_days <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(operating_days)>0)
);

create table public.package_transfer_options (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listing_package_details(listing_id) on delete cascade,
  direction text not null check (direction in ('pickup','dropoff')),
  location_id uuid not null references public.transport_locations(id) on delete restrict,
  availability text not null check (availability in ('included','extra_charge','not_available')),
  fee numeric(12,2) check (fee is null or fee>=0),
  currency char(3) not null default 'USD' check (currency=upper(currency)),
  notes text check (notes is null or char_length(notes)<=500),
  created_at timestamptz not null default now(),
  unique (listing_id,direction,location_id),
  constraint package_transfer_fee_check check (
    (availability='extra_charge' and fee is not null) or
    (availability<>'extra_charge' and fee is null)
  )
);

alter table public.trip_items drop constraint if exists trip_items_kind_check;
alter table public.trip_items add constraint trip_items_kind_check
  check (item_kind in ('accommodation','activity','package','transfer','service'));

alter table public.booking_enquiries
  add column listing_title_snapshot text,
  add column listing_kind_snapshot text check (listing_kind_snapshot is null or listing_kind_snapshot in ('standard','excursion_package')),
  add column activity_type_slugs_snapshot text[] not null default '{}',
  add column provider_business_name_snapshot text,
  add column pickup_point_snapshot text,
  add column dropoff_point_snapshot text;

-- Private boat/package prices are fixed per boat, never multiplied by guests.
alter table public.listings drop constraint if exists listings_confirmed_unit_category_check;
alter table public.listings add constraint listings_confirmed_unit_category_check check (
  not price_unit_confirmed
  or (category='accommodation' and price_unit in ('per_room_per_night','per_property_per_night','per_person_per_night','fixed_stay','price_on_request'))
  or (category='transfer' and price_unit in ('per_person','per_trip','per_boat','per_vehicle','per_leg','price_on_request'))
  or (category not in ('accommodation','transfer') and price_unit in ('per_person','per_child','per_group','per_trip','per_boat','fixed','price_on_request'))
);

create trigger service_categories_90_set_updated_at before update on public.service_categories
for each row execute function private.set_updated_at();
create trigger listing_package_details_90_set_updated_at before update on public.listing_package_details
for each row execute function private.set_updated_at();

create or replace function private.validate_listing_business_service()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists (
    select 1 from public.business_service_categories bsc
    join public.service_categories sc on sc.id=bsc.service_category_id and sc.is_active
    where bsc.business_id=new.business_id and new.category=any(sc.listing_categories)
  ) then
    raise exception 'This business is not registered for the selected service category';
  end if;
  if new.listing_kind='excursion_package' and new.category<>'excursion' then
    raise exception 'Excursion packages must use the excursion category';
  end if;
  if new.listing_kind='excursion_package' and new.status in ('pending_review','published')
    and cardinality(new.activity_type_slugs)<2 then
    raise exception 'An excursion package must include at least two structured activities';
  end if;
  if new.listing_kind='excursion_package' and new.status in ('pending_review','published')
    and not exists(select 1 from public.listing_package_details pd where pd.listing_id=new.id) then
    raise exception 'Package details are required before submitting an excursion package';
  end if;
  if cardinality(new.activity_type_slugs)<>(select count(distinct requested.slug) from unnest(new.activity_type_slugs) as requested(slug)) then
    raise exception 'Activity types must not contain duplicates';
  end if;
  if exists (
    select 1 from unnest(new.activity_type_slugs) requested(slug)
    left join public.activity_types a on a.slug=requested.slug and a.is_active
    where a.id is null
  ) then
    raise exception 'Every selected activity must exist in the active activity catalog';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_listing_business_service() from public,anon,authenticated;
create trigger listings_12_validate_business_service
before insert or update of business_id,category,listing_kind,activity_type_slugs,status on public.listings
for each row execute function private.validate_listing_business_service();

create or replace function private.validate_package_details_parent()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists (
    select 1 from public.listings l
    where l.id=new.listing_id and l.listing_kind='excursion_package' and l.category='excursion'
  ) then
    raise exception 'Package details require an excursion package listing';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_package_details_parent() from public,anon,authenticated;
create trigger listing_package_details_10_validate_parent
before insert or update of listing_id on public.listing_package_details
for each row execute function private.validate_package_details_parent();

create or replace function private.protect_business_service_removal()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (select count(*) from public.business_service_categories bsc where bsc.business_id=old.business_id)<=1 then
    raise exception 'A business must retain at least one service category';
  end if;
  if exists (
    select 1 from public.listings l
    join public.service_categories removed on removed.id=old.service_category_id
    where l.business_id=old.business_id and l.category=any(removed.listing_categories)
      and not exists (
        select 1 from public.business_service_categories remaining
        join public.service_categories sc on sc.id=remaining.service_category_id and sc.is_active
        where remaining.business_id=old.business_id and remaining.service_category_id<>old.service_category_id
          and l.category=any(sc.listing_categories)
      )
  ) then
    raise exception 'This service category is still required by one or more business listings';
  end if;
  return old;
end;
$$;
revoke all on function private.protect_business_service_removal() from public,anon,authenticated;
create trigger business_service_categories_10_protect_delete
before delete on public.business_service_categories
for each row execute function private.protect_business_service_removal();

-- The initial Auth signup can supply several normalized services. Authorization
-- continues to come from user_roles and table ownership, never user metadata.
create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_category public.operator_category;
  v_island public.baa_island;
  v_is_traveler boolean := coalesce(new.raw_user_meta_data ->> 'account_type', '') = 'traveler';
  v_name text := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'New traveler');
  v_business_id uuid;
  v_default_service text;
begin
  insert into public.profiles (id,full_name,phone)
  values (new.id,v_name,nullif(new.raw_user_meta_data ->> 'phone',''));
  if v_is_traveler then
    insert into public.user_roles(user_id,role) values(new.id,'traveler');
    insert into public.traveler_profiles(user_id,display_name,phone)
    values(new.id,v_name,nullif(new.raw_user_meta_data ->> 'phone',''));
    return new;
  end if;
  begin v_category := (new.raw_user_meta_data ->> 'operator_category')::public.operator_category;
  exception when others then v_category := 'other_tourism_service'; end;
  begin v_island := (new.raw_user_meta_data ->> 'island')::public.baa_island;
  exception when others then v_island := 'Dharavandhoo'; end;
  insert into public.user_roles(user_id,role) values(new.id,'operator');
  if nullif(new.raw_user_meta_data ->> 'business_name','') is not null then
    insert into public.businesses(
      owner_id,contact_person_name,business_name,registration_number,category,island,email,phone,
      business_address,website_url,description,accuracy_confirmed,terms_accepted
    ) values (
      new.id,v_name,new.raw_user_meta_data ->> 'business_name',
      coalesce(nullif(new.raw_user_meta_data ->> 'registration_number',''),'PENDING-'||new.id::text),
      v_category,v_island,coalesce(new.email,''),coalesce(new.raw_user_meta_data ->> 'phone',''),
      coalesce(new.raw_user_meta_data ->> 'business_address',''),nullif(new.raw_user_meta_data ->> 'website_url',''),
      coalesce(nullif(new.raw_user_meta_data ->> 'description',''),'Business profile awaiting completion.'),
      coalesce((new.raw_user_meta_data ->> 'accuracy_confirmed')::boolean,false),
      coalesce((new.raw_user_meta_data ->> 'terms_accepted')::boolean,false)
    ) returning id into v_business_id;

    if jsonb_typeof(new.raw_user_meta_data -> 'business_service_slugs')='array' then
      insert into public.business_service_categories(business_id,service_category_id)
      select v_business_id,sc.id from public.service_categories sc
      join jsonb_array_elements_text(new.raw_user_meta_data -> 'business_service_slugs') requested(slug)
        on requested.slug=sc.slug
      where sc.is_active on conflict do nothing;
    end if;
    if not exists(select 1 from public.business_service_categories where business_id=v_business_id) then
      v_default_service:=case v_category::text
        when 'guesthouse_hotel' then 'accommodation' when 'dive_centre' then 'diving'
        when 'snorkelling_excursion' then 'excursions' when 'fishing_operator' then 'fishing'
        when 'watersports_provider' then 'watersports' when 'restaurant_cafe' then 'food-dining'
        when 'speedboat_transfer' then 'transport' when 'conservation_community' then 'conservation'
        else 'other' end;
      insert into public.business_service_categories(business_id,service_category_id)
      select v_business_id,id from public.service_categories where slug=v_default_service;
    end if;
  end if;
  return new;
end;
$$;

-- RLS and Data API grants for every newly exposed table.
alter table public.service_categories enable row level security;
alter table public.business_service_categories enable row level security;
alter table public.listing_package_details enable row level security;
alter table public.package_transfer_options enable row level security;

create policy "service_categories_public_read" on public.service_categories for select to anon,authenticated
using (is_active or (select private.is_admin()));
create policy "service_categories_admin_all" on public.service_categories for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "business_services_read" on public.business_service_categories for select to anon,authenticated
using ((select private.owns_business(business_id)) or (select private.is_admin()) or exists(
  select 1 from public.businesses b where b.id=business_id and b.status='verified' and b.is_active
));
create policy "business_services_owner_insert" on public.business_service_categories for insert to authenticated
with check ((select private.owns_business(business_id)) or (select private.is_admin()));
create policy "business_services_owner_delete" on public.business_service_categories for delete to authenticated
using ((select private.owns_business(business_id)) or (select private.is_admin()));
create policy "package_details_public_read" on public.listing_package_details for select to anon,authenticated
using ((select private.is_public_listing(listing_id)) or (select private.owns_listing(listing_id)) or (select private.is_admin()));
create policy "package_details_owner_all" on public.listing_package_details for all to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_listing(listing_id)) or (select private.is_admin()));
create policy "package_transfers_public_read" on public.package_transfer_options for select to anon,authenticated
using ((select private.is_public_listing(listing_id)) or (select private.owns_listing(listing_id)) or (select private.is_admin()));
create policy "package_transfers_owner_all" on public.package_transfer_options for all to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_listing(listing_id)) or (select private.is_admin()));

revoke all on public.service_categories,public.business_service_categories,public.listing_package_details,public.package_transfer_options from anon,authenticated;
grant select on public.service_categories,public.business_service_categories,public.listing_package_details,public.package_transfer_options to anon,authenticated;
grant insert,update,delete on public.service_categories to authenticated;
grant insert,delete on public.business_service_categories to authenticated;
grant insert,update,delete on public.listing_package_details,public.package_transfer_options to authenticated;
grant select (listing_kind) on public.listings to anon,authenticated;

-- Public read models expose capabilities and structured package information,
-- but no private operator contact data beyond the existing consent function.
create or replace view public.public_businesses with (security_barrier=true,security_invoker=true) as
select b.id,b.business_name,b.category,b.island,b.description,b.logo_path,
  c.contact->>'email' contact_email,c.contact->>'phone' contact_phone,c.contact->>'website_url' website_url,
  c.contact->>'business_address' business_address,b.updated_at,b.latitude,b.longitude,true as is_verified,
  coalesce(s.service_category_slugs,'{}'::text[]) service_category_slugs,
  coalesce(s.service_category_names,'{}'::text[]) service_category_names
from public.businesses b
cross join lateral (select private.public_business_contact(b.id) contact) c
left join lateral (
  select array_agg(sc.slug order by sc.sort_order,sc.name) service_category_slugs,
    array_agg(sc.name order by sc.sort_order,sc.name) service_category_names
  from public.business_service_categories bsc join public.service_categories sc on sc.id=bsc.service_category_id
  where bsc.business_id=b.id and sc.is_active
) s on true
where b.status='verified' and b.is_active;

create or replace view public.public_listings with (security_barrier=true,security_invoker=true) as
select l.id,l.business_id,b.business_name,b.logo_path business_logo_path,l.title,l.category,l.island,l.summary,l.description,
  l.price,l.currency,l.price_unit,l.start_time,l.end_time,l.max_capacity,l.available_spaces,l.included_items,l.excluded_items,
  l.meeting_point,l.requirements,l.cancellation_information,l.cover_image_path,l.property_type,l.room_type,l.maximum_guests,
  l.number_of_rooms,l.amenities,l.check_in_time,l.check_out_time,l.price_per_night,
  c.contact->>'email' contact_email,c.contact->>'phone' contact_phone,c.contact->>'website_url' website_url,l.updated_at,
  coalesce(l.latitude,b.latitude) latitude,coalesce(l.longitude,b.longitude) longitude,l.child_price,l.taxes_amount,l.fees_amount,true is_verified,
  l.price_unit_confirmed,l.group_capacity,l.activity_type_slugs,l.listing_kind,
  (l.listing_kind='excursion_package') is_package,pd.duration_minutes,pd.operating_days,pd.minimum_guests package_minimum_guests,
  pd.maximum_guests package_maximum_guests,pd.infant_policy,pd.shared_trip_price,pd.private_trip_price,pd.equipment_included,
  pd.meal_included,pd.drinking_water_included,pd.pickup_mode,pd.pickup_notes,pd.airport_pickup,pd.dropoff_mode,pd.dropoff_notes,pd.booking_lead_hours,
  coalesce(bs.service_category_slugs,'{}'::text[]) provider_service_category_slugs,
  coalesce(pt.transfer_options,'[]'::jsonb) package_transfer_options,
  lower(concat_ws(' ',b.business_name,l.title,l.island::text,l.category::text,l.summary,array_to_string(l.activity_type_slugs,' '),array_to_string(bs.service_category_slugs,' '))) search_text
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
    order by pto.direction,tl.sort_order,tl.name) transfer_options
  from public.package_transfer_options pto join public.transport_locations tl on tl.id=pto.location_id
  where pto.listing_id=l.id
) pt on true
where l.status='published' and l.is_active and b.status='verified' and b.is_active
  and exists (
    select 1 from public.business_service_categories eligible
    join public.service_categories sc on sc.id=eligible.service_category_id and sc.is_active
    where eligible.business_id=l.business_id and l.category=any(sc.listing_categories)
  );

grant select on public.public_businesses,public.public_listings to anon,authenticated;

-- Package prices stay one listing price. The activities array is descriptive
-- matching data and is never expanded into billable trip items.
create or replace function private.current_request_subtotal(p_item public.trip_items,p_listing public.listings)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_people integer:=p_item.adult_count+p_item.child_count; v_nights integer;
begin
  if not p_listing.price_unit_confirmed or p_listing.price_unit='price_on_request' or p_listing.price is null then return null; end if;
  if p_listing.category='accommodation' then
    if p_item.planned_date is null or p_item.planned_end_date is null or p_item.planned_end_date<=p_item.planned_date then raise exception 'Valid stay dates are required'; end if;
    v_nights:=p_item.planned_end_date-p_item.planned_date;
    return case p_listing.price_unit
      when 'per_room_per_night' then p_listing.price*p_item.rooms_requested*v_nights
      when 'per_property_per_night' then p_listing.price*v_nights
      when 'per_person_per_night' then (p_listing.price*p_item.adult_count+coalesce(p_listing.child_price,0)*p_item.child_count)*v_nights
      when 'fixed_stay' then p_listing.price else null end;
  elsif p_listing.category='transfer' then
    return case p_listing.price_unit when 'per_person' then p_listing.price*v_people when 'per_trip' then p_listing.price
      when 'per_boat' then p_listing.price when 'per_vehicle' then p_listing.price when 'per_leg' then p_listing.price else null end;
  end if;
  return case p_listing.price_unit
    when 'per_person' then p_listing.price*p_item.adult_count+coalesce(p_listing.child_price,p_listing.price)*p_item.child_count
    when 'per_child' then p_listing.price*p_item.child_count
    when 'per_group' then p_listing.price*ceil(v_people::numeric/p_listing.group_capacity)
    when 'per_trip' then p_listing.price when 'per_boat' then p_listing.price when 'fixed' then p_listing.price else null end;
end;
$$;
revoke all on function private.current_request_subtotal(public.trip_items,public.listings) from public,anon,authenticated;

-- Booking records retain the package/provider identity that the customer saw,
-- even if a published listing is later revised through moderation.
create or replace function private.fill_enquiry_ownership()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_business_id uuid; v_operator_id uuid; v_capacity integer;
  v_listing_title text; v_listing_kind text; v_activity_slugs text[]; v_business_name text;
  v_package_minimum integer; v_package_maximum integer;
  v_price_unit public.price_unit; v_price numeric(12,2); v_price_confirmed boolean; v_group_capacity integer; v_group_discount numeric(12,2);
begin
  if new.requested_date<current_date then raise exception 'Booking enquiries cannot request a past date'; end if;
  select l.business_id,b.owner_id,
    case when new.room_id is not null then r.maximum_guests*new.rooms_requested else coalesce(a.remaining_spaces,l.available_spaces) end,
    l.title,l.listing_kind,l.activity_type_slugs,b.business_name,pd.minimum_guests,pd.maximum_guests,l.price_unit,l.price,l.price_unit_confirmed,l.group_capacity
  into v_business_id,v_operator_id,v_capacity,v_listing_title,v_listing_kind,v_activity_slugs,v_business_name,v_package_minimum,v_package_maximum,v_price_unit,v_price,v_price_confirmed,v_group_capacity
  from public.listings l join public.businesses b on b.id=l.business_id
  left join public.availability a on a.id=new.availability_id and a.listing_id=l.id
  left join public.accommodation_rooms r on r.id=new.room_id and r.listing_id=l.id and r.is_active
  left join public.listing_package_details pd on pd.listing_id=l.id
  where l.id=new.listing_id and l.status='published' and l.is_active and b.status='verified' and b.is_active;
  if v_business_id is null then raise exception 'This listing is not available for enquiries'; end if;
  if new.availability_id is not null and not exists(
    select 1 from public.availability a where a.id=new.availability_id and a.listing_id=new.listing_id
      and not a.is_blocked and a.available_date=new.requested_date
      and (new.requested_time is null or new.requested_time=a.start_time)
  ) then raise exception 'The selected availability does not match this enquiry'; end if;
  if new.room_id is not null and v_capacity is null then raise exception 'The selected room does not belong to this listing'; end if;
  if new.guest_count>v_capacity then raise exception 'Guest count exceeds the available capacity'; end if;
  if v_listing_kind='excursion_package' and (new.guest_count<v_package_minimum or new.guest_count>v_package_maximum) then
    raise exception 'Guest count is outside this package range';
  end if;
  if not v_price_confirmed or v_price_unit='price_on_request' or v_price is null then
    new.quoted_subtotal:=null; new.discount_amount:=0; new.quoted_total:=null; new.quote_status:='availability_confirmation_required';
  end if;
  if v_price_unit='per_group' and new.quote_status='confirmed' then
    if v_group_capacity is null or v_group_capacity<1 then raise exception 'Group capacity is required for group pricing'; end if;
    new.quoted_subtotal:=v_price*ceil(new.guest_count::numeric/v_group_capacity);
    select case when p.discount_type='percent' then round(new.quoted_subtotal*p.discount_value/100,2) else p.discount_value end
      into v_group_discount from public.promotions p
      where p.listing_id=new.listing_id and p.is_active and new.requested_date between p.valid_from and p.valid_until
      order by case when p.discount_type='percent' then new.quoted_subtotal*p.discount_value/100 else p.discount_value end desc limit 1;
    new.discount_amount:=least(new.quoted_subtotal,coalesce(v_group_discount,0));
    new.quoted_total:=greatest(0,new.quoted_subtotal-new.discount_amount+coalesce(new.taxes_amount,0)+coalesce(new.fees_amount,0));
  end if;
  new.business_id:=v_business_id; new.operator_id:=v_operator_id; new.status:='new'; new.operator_response:=null;
  new.listing_title_snapshot:=v_listing_title; new.listing_kind_snapshot:=v_listing_kind;
  new.activity_type_slugs_snapshot:=coalesce(v_activity_slugs,'{}'::text[]); new.provider_business_name_snapshot:=v_business_name;
  return new;
end;
$$;
revoke all on function private.fill_enquiry_ownership() from public,anon,authenticated;

create or replace function private.snapshot_trip_item_locations()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.trip_item_id is distinct from old.trip_item_id and new.trip_item_id is not null then
    select ti.pickup_point,ti.dropoff_point into new.pickup_point_snapshot,new.dropoff_point_snapshot
    from public.trip_items ti where ti.id=new.trip_item_id;
  end if;
  return new;
end;
$$;
revoke all on function private.snapshot_trip_item_locations() from public,anon,authenticated;
create trigger booking_enquiries_12_snapshot_trip_locations
before update of trip_item_id on public.booking_enquiries
for each row execute function private.snapshot_trip_item_locations();

create or replace function public.create_package_booking_request(
  p_listing_id uuid,p_availability_id uuid,p_requested_date date,p_requested_time time,
  p_adults integer,p_children integer,p_guest_full_name text,p_guest_email text,p_guest_phone text,p_guest_message text,
  p_pickup_location_id uuid default null,p_dropoff_location_id uuid default null
) returns public.booking_enquiries language plpgsql security definer set search_path='' as $$
declare v_result public.booking_enquiries; v_pickup text; v_dropoff text;
begin
  if not exists(select 1 from public.listings l where l.id=p_listing_id and l.listing_kind='excursion_package') then
    raise exception 'This listing is not an excursion package';
  end if;
  if p_pickup_location_id is not null then
    select tl.name||' — '||replace(pto.availability,'_',' ')||case when pto.fee is not null then ' '||pto.currency||' '||pto.fee::text else '' end
      into v_pickup from public.package_transfer_options pto join public.transport_locations tl on tl.id=pto.location_id
      where pto.listing_id=p_listing_id and pto.direction='pickup' and pto.location_id=p_pickup_location_id and pto.availability<>'not_available';
    if v_pickup is null then raise exception 'The selected package pickup is not available'; end if;
  end if;
  if p_dropoff_location_id is not null then
    select tl.name||' — '||replace(pto.availability,'_',' ')||case when pto.fee is not null then ' '||pto.currency||' '||pto.fee::text else '' end
      into v_dropoff from public.package_transfer_options pto join public.transport_locations tl on tl.id=pto.location_id
      where pto.listing_id=p_listing_id and pto.direction='dropoff' and pto.location_id=p_dropoff_location_id and pto.availability<>'not_available';
    if v_dropoff is null then raise exception 'The selected package drop-off is not available'; end if;
  end if;
  v_result:=public.create_booking_request(p_listing_id,p_availability_id,null,null,p_requested_date,null,p_requested_time,
    p_adults,p_children,1,p_guest_full_name,p_guest_email,p_guest_phone,p_guest_message);
  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries set pickup_point_snapshot=v_pickup,dropoff_point_snapshot=v_dropoff where id=v_result.id returning * into v_result;
  return v_result;
end;
$$;
revoke all on function public.create_package_booking_request(uuid,uuid,date,time,integer,integer,text,text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_package_booking_request(uuid,uuid,date,time,integer,integer,text,text,text,text,uuid,uuid) to anon,authenticated;

comment on table public.business_service_categories is 'Many-to-many capabilities for independently reviewed operator businesses.';
comment on column public.listings.listing_kind is 'Distinguishes standard services from one-price excursion package products.';
comment on table public.listing_package_details is 'Structured package metadata; activity_type_slugs remain the shared activity catalog relation.';
