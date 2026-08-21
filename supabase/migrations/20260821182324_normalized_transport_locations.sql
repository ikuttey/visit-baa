-- One normalized source for planner and operator transport locations.
-- Legacy route strings remain intact; matching IDs are added alongside them.

create or replace function private.normalize_transport_location(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    lower(translate(coalesce(value, ''), 'éÉ', 'eE')),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;
revoke all on function private.normalize_transport_location(text) from public, anon, authenticated;

create or replace function private.is_operator(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_roles where user_id=coalesce(p_user_id,auth.uid()) and role='operator');
$$;
revoke all on function private.is_operator(uuid) from public,anon,authenticated;
grant execute on function private.is_operator(uuid) to authenticated;

create table public.transport_locations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = private.normalize_transport_location(slug)),
  name text not null check (char_length(trim(name)) between 2 and 160),
  location_type text not null check (location_type in ('airport','city','island','route_point','meeting_point','accommodation')),
  island_name text,
  aliases text[] not null default '{}',
  is_permanent boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index transport_locations_normalized_name_idx
on public.transport_locations (private.normalize_transport_location(name));
create index transport_locations_type_name_idx on public.transport_locations(location_type, name) where is_active;

create trigger transport_locations_90_set_updated_at
before update on public.transport_locations
for each row execute function private.set_updated_at();

insert into public.transport_locations (slug,name,location_type,island_name,aliases,is_permanent) values
  ('velana-international-airport','Velana International Airport (MLE)','airport','Malé',array['Velana International Airport','Velana Airport','MLE','Male Airport','Malé Airport'],true),
  ('male','Malé','city','Malé',array['Male','Male City','Malé City'],true),
  ('dharavandhoo-airport','Dharavandhoo Airport','airport','Dharavandhoo',array['DRV','Dharavandhoo Domestic Airport'],true),
  ('dharavandhoo','Dharavandhoo','island','Dharavandhoo',array[]::text[],true),
  ('dhonfanu','Dhonfanu','island','Dhonfanu',array['Dhonfan'],true),
  ('eydhafushi','Eydhafushi','island','Eydhafushi',array[]::text[],true),
  ('fehendhoo','Fehendhoo','island','Fehendhoo',array[]::text[],true),
  ('fulhadhoo','Fulhadhoo','island','Fulhadhoo',array[]::text[],true),
  ('goidhoo','Goidhoo','island','Goidhoo',array[]::text[],true),
  ('hithaadhoo','Hithaadhoo','island','Hithaadhoo',array[]::text[],true),
  ('kamadhoo','Kamadhoo','island','Kamadhoo',array[]::text[],true),
  ('kendhoo','Kendhoo','island','Kendhoo',array[]::text[],true),
  ('kihaadhoo','Kihaadhoo','island','Kihaadhoo',array[]::text[],true),
  ('kudarikilu','Kudarikilu','island','Kudarikilu',array[]::text[],true),
  ('maalhos','Maalhos','island','Maalhos',array[]::text[],true),
  ('thulhaadhoo','Thulhaadhoo','island','Thulhaadhoo',array[]::text[],true);

alter table public.transport_locations enable row level security;
create policy "transport_locations_public_read"
on public.transport_locations for select to anon, authenticated using (is_active);
create policy "transport_locations_admin_all"
on public.transport_locations for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "transport_locations_operator_insert_dynamic"
on public.transport_locations for insert to authenticated
with check ((select private.is_operator()) and not is_permanent and location_type in ('route_point','meeting_point','accommodation') and created_by=auth.uid());
create policy "transport_locations_operator_update_own_dynamic"
on public.transport_locations for update to authenticated
using ((select private.is_operator()) and not is_permanent and created_by=auth.uid())
with check ((select private.is_operator()) and not is_permanent and created_by=auth.uid());

create view public.public_transport_locations
with (security_barrier=true, security_invoker=true)
as select id,slug,name,location_type,island_name,aliases,is_permanent
from public.transport_locations where is_active;

alter table public.transfer_route_details
  add column origin_location_id uuid references public.transport_locations(id) on delete set null,
  add column destination_location_id uuid references public.transport_locations(id) on delete set null;
create index transfer_route_origin_location_idx on public.transfer_route_details(origin_location_id) where is_active;
create index transfer_route_destination_location_idx on public.transfer_route_details(destination_location_id) where is_active;

-- First match permanent names and aliases, including MLE/Velana variants.
update public.transfer_route_details r set origin_location_id=(
  select location.id from public.transport_locations location
  where private.normalize_transport_location(r.origin_name)=private.normalize_transport_location(location.name)
    or exists (select 1 from unnest(location.aliases) alias where private.normalize_transport_location(alias)=private.normalize_transport_location(r.origin_name))
  order by location.is_permanent desc limit 1
) where r.origin_location_id is null;

update public.transfer_route_details r set destination_location_id=(
  select location.id from public.transport_locations location
  where private.normalize_transport_location(r.destination_name)=private.normalize_transport_location(location.name)
    or exists (select 1 from unnest(location.aliases) alias where private.normalize_transport_location(alias)=private.normalize_transport_location(r.destination_name))
  order by location.is_permanent desc limit 1
) where r.destination_location_id is null;

-- Preserve unmatched legacy endpoint text and give it a normalized source row.
insert into public.transport_locations (slug,name,location_type,aliases,is_permanent)
select 'route-' || substr(md5(endpoint.normalized),1,16), endpoint.name, 'route_point', array[endpoint.name], false
from (
  select distinct on (private.normalize_transport_location(name))
    trim(name) name, private.normalize_transport_location(name) normalized
  from (
    select origin_name name from public.transfer_route_details where origin_location_id is null
    union all
    select destination_name from public.transfer_route_details where destination_location_id is null
  ) valueset
  where private.normalize_transport_location(name) <> ''
  order by private.normalize_transport_location(name), name
) endpoint
where not exists (
  select 1 from public.transport_locations location
  where private.normalize_transport_location(location.name)=endpoint.normalized
);

update public.transfer_route_details r set origin_location_id=location.id
from public.transport_locations location
where r.origin_location_id is null and private.normalize_transport_location(r.origin_name)=private.normalize_transport_location(location.name);
update public.transfer_route_details r set destination_location_id=location.id
from public.transport_locations location
where r.destination_location_id is null and private.normalize_transport_location(r.destination_name)=private.normalize_transport_location(location.name);

create or replace function private.sync_transfer_route_locations()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.origin_location_id is not null then
    select name into new.origin_name from public.transport_locations where id=new.origin_location_id and is_active;
  else
    select id into new.origin_location_id from public.transport_locations location
    where private.normalize_transport_location(new.origin_name)=private.normalize_transport_location(location.name)
      or exists (select 1 from unnest(location.aliases) alias where private.normalize_transport_location(alias)=private.normalize_transport_location(new.origin_name))
    order by location.is_permanent desc limit 1;
  end if;
  if new.destination_location_id is not null then
    select name into new.destination_name from public.transport_locations where id=new.destination_location_id and is_active;
  else
    select id into new.destination_location_id from public.transport_locations location
    where private.normalize_transport_location(new.destination_name)=private.normalize_transport_location(location.name)
      or exists (select 1 from unnest(location.aliases) alias where private.normalize_transport_location(alias)=private.normalize_transport_location(new.destination_name))
    order by location.is_permanent desc limit 1;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_transfer_route_locations() from public,anon,authenticated;
create trigger transfer_route_details_10_sync_locations
before insert or update of origin_name,destination_name,origin_location_id,destination_location_id
on public.transfer_route_details for each row execute function private.sync_transfer_route_locations();

create or replace view public.public_transfer_routes
with (security_barrier=true,security_invoker=true)
as select
  r.listing_id,l.business_id,l.business_name,l.title,l.summary,l.cover_image_path,l.available_spaces,
  coalesce(origin.name,r.origin_name) origin_name,
  coalesce(destination.name,r.destination_name) destination_name,
  r.departure_point,r.arrival_point,r.transport_type,r.service_type,r.departure_time,r.arrival_time,
  r.estimated_duration_minutes,r.operating_days,r.adult_price,r.child_price,r.infant_price,r.private_price,
  r.currency,r.pricing_model,r.minimum_passengers,least(r.maximum_passengers,l.available_spaces) available_passengers,
  r.luggage_information,r.updated_at,
  r.origin_location_id,r.destination_location_id,origin.slug origin_slug,destination.slug destination_slug
from public.transfer_route_details r
join public.public_listings l on l.id=r.listing_id and l.category='transfer'
left join public.transport_locations origin on origin.id=r.origin_location_id and origin.is_active
left join public.transport_locations destination on destination.id=r.destination_location_id and destination.is_active
where r.is_active;

alter table public.trip_items add column availability_mode text not null default 'live'
  check (availability_mode in ('live','request'));
alter table public.booking_enquiries add column quote_status text not null default 'confirmed'
  check (quote_status in ('confirmed','availability_confirmation_required'));

create or replace function private.create_availability_request(
  p_item public.trip_items,p_name text,p_email text,p_phone text
) returns public.booking_enquiries language plpgsql security definer set search_path = '' as $$
declare v_listing public.listings; v_result public.booking_enquiries; v_published numeric(12,2);
begin
  select l.* into v_listing from public.listings l join public.businesses b on b.id=l.business_id
  where l.id=p_item.listing_id and l.status='published' and l.is_active and b.status='verified' and b.is_active;
  if v_listing.id is null then raise exception 'This listing is not available'; end if;
  v_published:=coalesce(p_item.draft_subtotal,v_listing.price);
  insert into public.booking_enquiries(
    listing_id,availability_id,traveler_id,room_id,rate_plan_id,requested_date,check_out_date,requested_time,
    guest_count,adult_count,child_count,rooms_requested,guest_full_name,guest_email,guest_phone,guest_message,
    quoted_subtotal,discount_amount,taxes_amount,fees_amount,quoted_total,quote_currency,quote_status
  ) values (
    p_item.listing_id,null,auth.uid(),null,null,p_item.planned_date,p_item.planned_end_date,p_item.planned_time,
    p_item.adult_count+p_item.child_count,p_item.adult_count,p_item.child_count,p_item.rooms_requested,p_name,p_email,p_phone,
    'Availability request from My Baa Trip. Published unit price shown; operator must confirm availability and the final total.',
    v_published,0,0,0,v_published,v_listing.currency,'availability_confirmation_required'
  ) returning * into v_result;
  return v_result;
end;
$$;
revoke all on function private.create_availability_request(public.trip_items,text,text,text) from public,anon,authenticated;

create or replace function public.request_trip_bookings(p_trip_id uuid,p_idempotency_key uuid)
returns setof public.booking_enquiries language plpgsql security definer set search_path = '' as $$
declare v_trip public.trips; v_item public.trip_items; v_profile public.profiles; v_email text; v_enquiry public.booking_enquiries; v_deposit numeric(5,2); v_policy public.listing_policies; v_route public.transfer_route_details; v_listing public.listings; v_route_subtotal numeric(12,2); v_discount numeric(12,2); v_route_total numeric(12,2); v_passengers integer; v_batch_id uuid;
begin
  if not private.is_traveler(auth.uid()) then raise exception 'Traveler access required'; end if;
  select * into v_trip from public.trips where id=p_trip_id and user_id=auth.uid() for update;
  if v_trip.id is null then raise exception 'Trip not found'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
  if exists(select 1 from public.trip_booking_batches where trip_id=p_trip_id and traveler_id=auth.uid() and idempotency_key=p_idempotency_key) then
    return query select * from public.booking_enquiries where trip_id=p_trip_id and booking_request_key=p_idempotency_key order by created_at; return;
  end if;
  insert into public.trip_booking_batches(trip_id,traveler_id,idempotency_key) values(p_trip_id,auth.uid(),p_idempotency_key)
    on conflict (trip_id,traveler_id,idempotency_key) do nothing returning id into v_batch_id;
  if v_batch_id is null then return query select * from public.booking_enquiries where trip_id=p_trip_id and booking_request_key=p_idempotency_key order by created_at; return; end if;
  select * into v_profile from public.profiles where id=auth.uid(); select email into v_email from auth.users where id=auth.uid();
  if coalesce(trim(v_profile.phone),'')='' then raise exception 'Add a phone number to your traveler profile before requesting bookings'; end if;
  for v_item in select * from public.trip_items where trip_id=p_trip_id and selected and booking_status='not_requested' order by sort_order,id loop
    select * into v_policy from public.listing_policies where listing_id=v_item.listing_id;
    v_deposit:=case v_policy.payment_condition when 'prepayment_required' then 100 when 'deposit_required' then coalesce(v_policy.deposit_percentage,50) else 0 end;
    if v_item.deposit_percentage is distinct from v_deposit then raise exception 'Payment policy changed for a selected service'; end if;
    if v_item.availability_mode='request' then
      v_enquiry:=private.create_availability_request(v_item,v_profile.full_name,v_email,v_profile.phone);
    else
      if v_item.item_kind='transfer' then
        select * into v_route from public.transfer_route_details where listing_id=v_item.listing_id and is_active
          and origin_location_id=(select id from public.transport_locations where name=v_item.pickup_point limit 1)
          and destination_location_id=(select id from public.transport_locations where name=v_item.dropoff_point limit 1);
        if v_route.listing_id is null then raise exception 'Published transfer route changed for a selected service'; end if;
        if v_item.planned_date is null or extract(dow from v_item.planned_date)::integer<>all(v_route.operating_days) then raise exception 'Transfer does not operate on the selected date'; end if;
        if v_item.planned_time is distinct from v_route.departure_time then raise exception 'Transfer departure time changed for a selected service'; end if;
        v_passengers:=v_item.adult_count+v_item.child_count;
        if v_passengers<v_route.minimum_passengers or v_passengers>v_route.maximum_passengers then raise exception 'Transfer capacity changed for a selected service'; end if;
        select * into v_listing from public.listings where id=v_item.listing_id;
        v_route_subtotal:=case when v_route.pricing_model='private_fixed' then v_route.private_price else v_route.adult_price*v_item.adult_count+coalesce(v_route.child_price,v_route.adult_price)*v_item.child_count end;
        select coalesce(max(case when p.discount_type='percent' then round(v_route_subtotal*p.discount_value/100,2) else p.discount_value end),0)
          into v_discount from public.promotions p where p.listing_id=v_item.listing_id and p.is_active and v_item.planned_date between p.valid_from and p.valid_until and (p.minimum_nights is null or p.minimum_nights<=1);
        v_discount:=least(v_route_subtotal,v_discount);v_route_total:=greatest(0,v_route_subtotal-v_discount+coalesce(v_listing.taxes_amount,0)+coalesce(v_listing.fees_amount,0));
        if v_item.quote_currency is distinct from v_route.currency or v_item.draft_subtotal is null or abs(v_route_total-v_item.draft_subtotal)>0.01 then raise exception 'Published transfer price changed for a selected service'; end if;
      end if;
      v_enquiry:=public.create_booking_request(v_item.listing_id,v_item.availability_id,v_item.room_id,v_item.rate_plan_id,v_item.planned_date,v_item.planned_end_date,v_item.planned_time,v_item.adult_count,v_item.child_count,v_item.rooms_requested,v_profile.full_name,v_email,v_profile.phone,'Requested from My Baa Trip');
      if v_item.item_kind='transfer' then
        perform set_config('app.booking_rpc','true',true);
        update public.booking_enquiries set quoted_subtotal=v_route_subtotal,discount_amount=v_discount,taxes_amount=coalesce(v_listing.taxes_amount,0),fees_amount=coalesce(v_listing.fees_amount,0),quoted_total=v_route_total,quote_currency=v_route.currency where id=v_enquiry.id returning * into v_enquiry;
      end if;
      if v_item.draft_subtotal is null or abs(v_enquiry.quoted_total-v_item.draft_subtotal)>0.01 then raise exception 'Published price changed for a selected service'; end if;
    end if;
    perform set_config('app.booking_rpc','true',true);
    update public.booking_enquiries set trip_id=p_trip_id,trip_item_id=v_item.id,booking_request_key=p_idempotency_key,
      deposit_percentage=case when v_item.availability_mode='request' then 0 else v_deposit end,
      deposit_amount=case when v_item.availability_mode='request' then 0 else round(quoted_total*v_deposit/100,2) end,
      balance_due=case when v_item.availability_mode='request' then 0 else quoted_total end,
      payment_status=case when v_item.availability_mode='request' or v_deposit=0 then 'not_required' else 'unpaid' end
    where id=v_enquiry.id returning * into v_enquiry;
    return next v_enquiry;
  end loop;
  update public.trips set status='requests_sent' where id=p_trip_id;
end;
$$;
revoke all on function public.request_trip_bookings(uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_trip_bookings(uuid,uuid) to authenticated;

revoke all on public.transport_locations from anon,authenticated;
grant select (id,slug,name,location_type,island_name,aliases,is_permanent,is_active) on public.transport_locations to anon,authenticated;
grant insert,update on public.transport_locations to authenticated;
grant select on public.public_transport_locations to anon,authenticated;
grant select on public.public_transfer_routes to anon,authenticated;
grant select,insert,update,delete on public.trip_items to authenticated;

comment on table public.transport_locations is 'Normalized transport hubs, islands, and authorized dynamic pickup/drop-off points.';
comment on column public.trip_items.availability_mode is 'live uses configured inventory; request requires operator availability and final total confirmation.';

-- PostgREST reads its schema cache after the full forward migration exists.
notify pgrst, 'reload schema';
