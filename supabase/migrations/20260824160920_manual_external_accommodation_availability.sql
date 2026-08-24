create table if not exists public.external_accommodation_bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  room_id uuid not null references public.accommodation_rooms(id) on delete cascade,
  source text not null,
  external_reference text,
  guest_name text,
  check_in_date date not null,
  check_out_date date not null,
  rooms_booked integer not null,
  status text not null default 'active',
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint external_accommodation_bookings_source_check check (source in ('booking_com','agoda','direct','walk_in','other')),
  constraint external_accommodation_bookings_status_check check (status in ('active','cancelled')),
  constraint external_accommodation_bookings_dates_check check (check_out_date > check_in_date),
  constraint external_accommodation_bookings_rooms_check check (rooms_booked > 0)
);

create index if not exists external_accommodation_bookings_room_dates_idx
  on public.external_accommodation_bookings(room_id, check_in_date, check_out_date)
  where status = 'active';
create index if not exists external_accommodation_bookings_business_idx
  on public.external_accommodation_bookings(business_id, check_in_date);
create unique index if not exists external_accommodation_bookings_reference_uidx
  on public.external_accommodation_bookings(business_id, source, external_reference)
  where external_reference is not null and status = 'active';

alter table public.external_accommodation_bookings enable row level security;
revoke all on table public.external_accommodation_bookings from anon, authenticated;
grant select on table public.external_accommodation_bookings to authenticated;

drop policy if exists "Operators can view their external accommodation bookings" on public.external_accommodation_bookings;
create policy "Operators can view their external accommodation bookings"
on public.external_accommodation_bookings
for select
to authenticated
using (
  exists (
    select 1
    from public.businesses b
    where b.id = external_accommodation_bookings.business_id
      and b.owner_id = (select auth.uid())
  )
  or private.is_admin((select auth.uid()))
);

create or replace function public.operator_set_room_availability_range(
  p_room_id uuid,
  p_start_date date,
  p_end_date date,
  p_available_quantity integer default null,
  p_is_blocked boolean default false,
  p_price_override numeric default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room public.accommodation_rooms;
  v_listing public.listings;
  v_business public.businesses;
  v_day date;
  v_requested integer;
  v_reserved integer;
  v_safe_available integer;
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then raise exception 'Choose a valid date range'; end if;
  if p_start_date < current_date then raise exception 'Availability can only be changed for today or future dates'; end if;
  if p_price_override is not null and p_price_override < 0 then raise exception 'Price override cannot be negative'; end if;

  select r.* into v_room from public.accommodation_rooms r where r.id = p_room_id and r.is_active;
  if v_room.id is null then raise exception 'Room type not found'; end if;
  select l.* into v_listing from public.listings l where l.id = v_room.listing_id and l.category = 'accommodation';
  if v_listing.id is null then raise exception 'Accommodation listing not found'; end if;
  select b.* into v_business from public.businesses b where b.id = v_listing.business_id;
  if v_business.owner_id <> auth.uid() and not private.is_admin(auth.uid()) then raise exception 'Room availability access denied'; end if;

  v_requested := coalesce(p_available_quantity, v_room.quantity);
  if v_requested < 0 or v_requested > v_room.quantity then raise exception 'Available rooms must be between 0 and the room quantity'; end if;

  for v_day in select generate_series(p_start_date, p_end_date, interval '1 day')::date loop
    select
      coalesce((select sum(be.rooms_requested)
        from public.booking_enquiries be
        where be.room_id = p_room_id
          and be.inventory_committed
          and be.requested_date <= v_day
          and be.check_out_date > v_day), 0)
      + coalesce((select sum(eb.rooms_booked)
        from public.external_accommodation_bookings eb
        where eb.room_id = p_room_id
          and eb.status = 'active'
          and eb.check_in_date <= v_day
          and eb.check_out_date > v_day), 0)
      into v_reserved;

    v_safe_available := case when p_is_blocked then 0 else least(v_requested, greatest(0, v_room.quantity - v_reserved)) end;

    insert into public.room_availability(room_id, available_date, total_quantity, available_quantity, price_override, is_blocked)
    values (p_room_id, v_day, v_room.quantity, v_safe_available, p_price_override, p_is_blocked)
    on conflict (room_id, available_date) do update
      set total_quantity = excluded.total_quantity,
          available_quantity = excluded.available_quantity,
          price_override = excluded.price_override,
          is_blocked = excluded.is_blocked,
          updated_at = now();
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

create or replace function public.create_external_accommodation_booking(
  p_room_id uuid,
  p_source text,
  p_check_in_date date,
  p_check_out_date date,
  p_rooms integer default 1,
  p_external_reference text default null,
  p_guest_name text default null,
  p_notes text default null
)
returns public.external_accommodation_bookings
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room public.accommodation_rooms;
  v_listing public.listings;
  v_business public.businesses;
  v_days integer;
  v_updated integer;
  v_result public.external_accommodation_bookings;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_source not in ('booking_com','agoda','direct','walk_in','other') then raise exception 'Choose a valid booking source'; end if;
  if p_check_in_date is null or p_check_out_date is null or p_check_out_date <= p_check_in_date then raise exception 'Check-out must be after check-in'; end if;
  if p_check_in_date < current_date then raise exception 'External bookings can only be added for current or future stays'; end if;
  if coalesce(p_rooms, 0) < 1 then raise exception 'Rooms booked must be at least 1'; end if;

  select r.* into v_room from public.accommodation_rooms r where r.id = p_room_id and r.is_active;
  if v_room.id is null then raise exception 'Room type not found'; end if;
  if p_rooms > v_room.quantity then raise exception 'Rooms booked exceed this room type quantity'; end if;
  select l.* into v_listing from public.listings l where l.id = v_room.listing_id and l.category = 'accommodation';
  if v_listing.id is null then raise exception 'Accommodation listing not found'; end if;
  select b.* into v_business from public.businesses b where b.id = v_listing.business_id;
  if v_business.owner_id <> auth.uid() and not private.is_admin(auth.uid()) then raise exception 'External booking access denied'; end if;

  v_days := p_check_out_date - p_check_in_date;

  insert into public.room_availability(room_id, available_date, total_quantity, available_quantity, is_blocked)
  select p_room_id, d::date, v_room.quantity, v_room.quantity, false
  from generate_series(p_check_in_date, p_check_out_date - 1, interval '1 day') d
  on conflict (room_id, available_date) do nothing;

  perform 1
  from public.room_availability
  where room_id = p_room_id
    and available_date >= p_check_in_date
    and available_date < p_check_out_date
  order by available_date
  for update;

  update public.room_availability
  set available_quantity = available_quantity - p_rooms,
      updated_at = now()
  where room_id = p_room_id
    and available_date >= p_check_in_date
    and available_date < p_check_out_date
    and not is_blocked
    and available_quantity >= p_rooms;
  get diagnostics v_updated = row_count;
  if v_updated <> v_days then raise exception 'Not enough room inventory is available for the full external stay'; end if;

  insert into public.external_accommodation_bookings(
    business_id, listing_id, room_id, source, external_reference, guest_name,
    check_in_date, check_out_date, rooms_booked, notes, created_by
  ) values (
    v_business.id, v_listing.id, v_room.id, p_source,
    nullif(trim(coalesce(p_external_reference, '')), ''),
    nullif(trim(coalesce(p_guest_name, '')), ''),
    p_check_in_date, p_check_out_date, p_rooms,
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning * into v_result;
  return v_result;
end;
$function$;

create or replace function public.cancel_external_accommodation_booking(p_booking_id uuid)
returns public.external_accommodation_bookings
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_booking public.external_accommodation_bookings;
  v_business public.businesses;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_booking from public.external_accommodation_bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'External booking not found'; end if;
  select * into v_business from public.businesses where id = v_booking.business_id;
  if v_business.owner_id <> auth.uid() and not private.is_admin(auth.uid()) then raise exception 'External booking access denied'; end if;
  if v_booking.status = 'cancelled' then return v_booking; end if;

  update public.room_availability
  set available_quantity = case when is_blocked then 0 else least(total_quantity, available_quantity + v_booking.rooms_booked) end,
      updated_at = now()
  where room_id = v_booking.room_id
    and available_date >= v_booking.check_in_date
    and available_date < v_booking.check_out_date;

  update public.external_accommodation_bookings
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = v_booking.id
  returning * into v_booking;
  return v_booking;
end;
$function$;

revoke all on function public.operator_set_room_availability_range(uuid,date,date,integer,boolean,numeric) from public, anon;
revoke all on function public.create_external_accommodation_booking(uuid,text,date,date,integer,text,text,text) from public, anon;
revoke all on function public.cancel_external_accommodation_booking(uuid) from public, anon;
grant execute on function public.operator_set_room_availability_range(uuid,date,date,integer,boolean,numeric) to authenticated;
grant execute on function public.create_external_accommodation_booking(uuid,text,date,date,integer,text,text,text) to authenticated;
grant execute on function public.cancel_external_accommodation_booking(uuid) to authenticated;
