create table public.transfer_route_details (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  origin_name text not null check (char_length(trim(origin_name)) between 2 and 120),
  destination_name text not null check (char_length(trim(destination_name)) between 2 and 120),
  departure_point text not null check (char_length(trim(departure_point)) between 2 and 200),
  arrival_point text not null check (char_length(trim(arrival_point)) between 2 and 200),
  transport_type text not null check (transport_type in ('speedboat','domestic_flight','ferry','private_boat','seaplane','other')),
  service_type text not null check (service_type in ('shared','private')),
  departure_time time not null,
  arrival_time time,
  estimated_duration_minutes integer not null check (estimated_duration_minutes between 5 and 1440),
  operating_days integer[] not null default array[0,1,2,3,4,5,6],
  adult_price numeric(12,2),
  child_price numeric(12,2),
  infant_price numeric(12,2),
  private_price numeric(12,2),
  currency char(3) not null default 'USD' check (currency in ('USD','MVR')),
  pricing_model text not null check (pricing_model in ('per_person','private_fixed')),
  minimum_passengers integer not null default 1 check (minimum_passengers > 0),
  maximum_passengers integer not null check (maximum_passengers > 0),
  luggage_information text check (luggage_information is null or char_length(luggage_information) <= 1000),
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint transfer_route_direction_check check (lower(trim(origin_name)) <> lower(trim(destination_name))),
  constraint transfer_route_days_check check (cardinality(operating_days) > 0 and operating_days <@ array[0,1,2,3,4,5,6]),
  constraint transfer_route_capacity_check check (maximum_passengers >= minimum_passengers),
  constraint transfer_route_prices_check check (
    (adult_price is null or adult_price >= 0) and
    (child_price is null or child_price >= 0) and
    (infant_price is null or infant_price >= 0) and
    (private_price is null or private_price >= 0) and
    ((pricing_model = 'per_person' and adult_price is not null) or
     (pricing_model = 'private_fixed' and private_price is not null))
  )
);

create index transfer_route_origin_destination_idx
on public.transfer_route_details(lower(origin_name),lower(destination_name))
where is_active;

create trigger transfer_route_details_90_set_updated_at
before update on public.transfer_route_details
for each row execute function private.set_updated_at();

alter table public.transfer_route_details enable row level security;

create policy "transfer_routes_public_select"
on public.transfer_route_details for select to anon,authenticated
using (is_active and (select private.is_public_listing(listing_id)));

create policy "transfer_routes_owner_admin_all"
on public.transfer_route_details for all to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));

create view public.public_transfer_routes
with (security_barrier=true,security_invoker=true)
as
select
  r.listing_id,
  l.business_id,
  l.business_name,
  l.title,
  l.summary,
  l.cover_image_path,
  l.available_spaces,
  r.origin_name,
  r.destination_name,
  r.departure_point,
  r.arrival_point,
  r.transport_type,
  r.service_type,
  r.departure_time,
  r.arrival_time,
  r.estimated_duration_minutes,
  r.operating_days,
  r.adult_price,
  r.child_price,
  r.infant_price,
  r.private_price,
  r.currency,
  r.pricing_model,
  r.minimum_passengers,
  least(r.maximum_passengers,l.available_spaces) as available_passengers,
  r.luggage_information,
  r.updated_at
from public.transfer_route_details r
join public.public_listings l on l.id=r.listing_id and l.category='transfer'
where r.is_active;

revoke all on public.transfer_route_details from anon,authenticated;
grant select on public.transfer_route_details to anon,authenticated;
grant insert,update,delete on public.transfer_route_details to authenticated;
grant select on public.public_transfer_routes to anon,authenticated;

comment on table public.transfer_route_details is 'Directional, operator-maintained schedule and pricing for a published transfer listing.';
comment on view public.public_transfer_routes is 'Public directional route legs sourced only from active, published transfer listings owned by verified businesses.';
