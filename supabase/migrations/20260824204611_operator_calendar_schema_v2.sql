do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='room_availability_v2_restrictions_check'
      and conrelid='public.room_availability'::regclass
  ) then
    alter table public.room_availability
      add constraint room_availability_v2_restrictions_check
      check (
        sellable_quantity between 0 and total_quantity
        and held_quantity >= 0
        and booked_quantity >= 0
        and external_booked_quantity >= 0
        and (minimum_stay is null or minimum_stay >= 1)
        and (maximum_stay is null or maximum_stay >= 1)
        and (minimum_stay is null or maximum_stay is null or maximum_stay >= minimum_stay)
        and (min_advance_hours is null or min_advance_hours >= 0)
        and (max_advance_days is null or max_advance_days >= 0)
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='availability_v2_restrictions_check'
      and conrelid='public.availability'::regclass
  ) then
    alter table public.availability
      add constraint availability_v2_restrictions_check
      check (
        sellable_capacity >= 0
        and held_spaces >= 0
        and booked_spaces >= 0
        and (minimum_stay is null or minimum_stay >= 1)
        and (maximum_stay is null or maximum_stay >= 1)
        and (minimum_stay is null or maximum_stay is null or maximum_stay >= minimum_stay)
        and (min_advance_hours is null or min_advance_hours >= 0)
        and (max_advance_days is null or max_advance_days >= 0)
      );
  end if;
end $$;

alter table public.room_rate_plans
  add column if not exists pricing_mode text not null default 'fixed',
  add column if not exists parent_rate_plan_id uuid references public.room_rate_plans(id) on delete set null,
  add column if not exists adjustment_value numeric(12,2) not null default 0,
  add column if not exists cancellation_type text,
  add column if not exists cancellation_penalty text,
  add column if not exists meal_plan_code text,
  add column if not exists benefits text[] not null default '{}',
  add column if not exists minimum_stay integer,
  add column if not exists maximum_stay integer,
  add column if not exists min_advance_hours integer,
  add column if not exists max_advance_days integer,
  add column if not exists occupancy_pricing jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='room_rate_plans_pricing_mode_check'
      and conrelid='public.room_rate_plans'::regclass
  ) then
    alter table public.room_rate_plans
      add constraint room_rate_plans_pricing_mode_check
      check (pricing_mode in ('fixed','derived_percent','derived_amount'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='room_rate_plans_stay_check'
      and conrelid='public.room_rate_plans'::regclass
  ) then
    alter table public.room_rate_plans
      add constraint room_rate_plans_stay_check
      check (
        (minimum_stay is null or minimum_stay >= 1)
        and (maximum_stay is null or maximum_stay >= 1)
        and (minimum_stay is null or maximum_stay is null or maximum_stay >= minimum_stay)
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='room_rate_plans_advance_check'
      and conrelid='public.room_rate_plans'::regclass
  ) then
    alter table public.room_rate_plans
      add constraint room_rate_plans_advance_check
      check (
        (min_advance_hours is null or min_advance_hours >= 0)
        and (max_advance_days is null or max_advance_days >= 0)
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='room_rate_plans_not_own_parent_check'
      and conrelid='public.room_rate_plans'::regclass
  ) then
    alter table public.room_rate_plans
      add constraint room_rate_plans_not_own_parent_check
      check (parent_rate_plan_id is null or parent_rate_plan_id <> id);
  end if;
end $$;

create table if not exists public.room_rate_calendar (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.accommodation_rooms(id) on delete cascade,
  rate_plan_id uuid references public.room_rate_plans(id) on delete cascade,
  available_date date not null,
  price_override numeric(12,2),
  minimum_stay integer,
  maximum_stay integer,
  min_advance_hours integer,
  max_advance_days integer,
  closed_to_arrival boolean not null default false,
  closed_to_departure boolean not null default false,
  stop_sell boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (room_id,rate_plan_id,available_date),
  check (price_override is null or price_override >= 0),
  check (minimum_stay is null or minimum_stay >= 1),
  check (maximum_stay is null or maximum_stay >= 1),
  check (minimum_stay is null or maximum_stay is null or maximum_stay >= minimum_stay),
  check (min_advance_hours is null or min_advance_hours >= 0),
  check (max_advance_days is null or max_advance_days >= 0)
);

create index if not exists room_rate_calendar_room_date_idx
  on public.room_rate_calendar(room_id,available_date);
create index if not exists room_rate_calendar_rate_date_idx
  on public.room_rate_calendar(rate_plan_id,available_date)
  where rate_plan_id is not null;

alter table public.room_rate_calendar enable row level security;

drop policy if exists room_rate_calendar_public_select on public.room_rate_calendar;
create policy room_rate_calendar_public_select
on public.room_rate_calendar for select
to anon, authenticated
using (
  exists (
    select 1
    from public.accommodation_rooms r
    where r.id=room_rate_calendar.room_id
      and r.is_active
      and (select private.is_public_listing(r.listing_id))
  )
);

drop policy if exists room_rate_calendar_owner_select on public.room_rate_calendar;
create policy room_rate_calendar_owner_select
on public.room_rate_calendar for select
to authenticated
using ((select private.owns_room(room_id)) or (select private.is_admin()));

drop policy if exists room_rate_calendar_owner_insert on public.room_rate_calendar;
create policy room_rate_calendar_owner_insert
on public.room_rate_calendar for insert
to authenticated
with check ((select private.owns_room(room_id)) or (select private.is_admin()));

drop policy if exists room_rate_calendar_owner_update on public.room_rate_calendar;
create policy room_rate_calendar_owner_update
on public.room_rate_calendar for update
to authenticated
using ((select private.owns_room(room_id)) or (select private.is_admin()))
with check ((select private.owns_room(room_id)) or (select private.is_admin()));

drop policy if exists room_rate_calendar_owner_delete on public.room_rate_calendar;
create policy room_rate_calendar_owner_delete
on public.room_rate_calendar for delete
to authenticated
using ((select private.owns_room(room_id)) or (select private.is_admin()));

grant select on public.room_rate_calendar to anon, authenticated;
grant insert,update,delete on public.room_rate_calendar to authenticated;

alter table public.promotions
  add column if not exists promotion_kind text not null default 'custom',
  add column if not exists booking_from date,
  add column if not exists booking_until date,
  add column if not exists applies_to_rate_plan_id uuid references public.room_rate_plans(id) on delete set null,
  add column if not exists minimum_lead_days integer,
  add column if not exists maximum_lead_days integer,
  add column if not exists days_of_week smallint[],
  add column if not exists stacking_mode text not null default 'best_only',
  add column if not exists priority integer not null default 100;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='promotions_kind_check'
      and conrelid='public.promotions'::regclass
  ) then
    alter table public.promotions
      add constraint promotions_kind_check
      check (promotion_kind in ('custom','early_bird','last_minute','long_stay','weekend','seasonal'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='promotions_stacking_check'
      and conrelid='public.promotions'::regclass
  ) then
    alter table public.promotions
      add constraint promotions_stacking_check
      check (stacking_mode in ('best_only','stackable'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='promotions_booking_window_check'
      and conrelid='public.promotions'::regclass
  ) then
    alter table public.promotions
      add constraint promotions_booking_window_check
      check (booking_from is null or booking_until is null or booking_until >= booking_from);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='promotions_lead_check'
      and conrelid='public.promotions'::regclass
  ) then
    alter table public.promotions
      add constraint promotions_lead_check
      check (
        (minimum_lead_days is null or minimum_lead_days >= 0)
        and (maximum_lead_days is null or maximum_lead_days >= 0)
        and (minimum_lead_days is null or maximum_lead_days is null or maximum_lead_days >= minimum_lead_days)
      );
  end if;
end $$;

alter table public.listing_service_pickup_locations
  add column if not exists direction text not null default 'pickup_dropoff',
  add column if not exists availability text not null default 'included',
  add column if not exists fee numeric(12,2),
  add column if not exists currency char(3) not null default 'USD',
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='listing_service_pickup_locations_direction_check'
      and conrelid='public.listing_service_pickup_locations'::regclass
  ) then
    alter table public.listing_service_pickup_locations
      add constraint listing_service_pickup_locations_direction_check
      check (direction in ('pickup','dropoff','pickup_dropoff'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='listing_service_pickup_locations_availability_check'
      and conrelid='public.listing_service_pickup_locations'::regclass
  ) then
    alter table public.listing_service_pickup_locations
      add constraint listing_service_pickup_locations_availability_check
      check (availability in ('included','required_extra','optional_extra','not_available'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='listing_service_pickup_locations_fee_check'
      and conrelid='public.listing_service_pickup_locations'::regclass
  ) then
    alter table public.listing_service_pickup_locations
      add constraint listing_service_pickup_locations_fee_check
      check (fee is null or fee >= 0);
  end if;
end $$;

alter table public.transfer_route_details
  add column if not exists check_in_minutes_before integer,
  add column if not exists baggage_rules text,
  add column if not exists booking_notice_hours integer,
  add column if not exists maximum_advance_days integer;

create table if not exists public.listing_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time,
  capacity integer not null check (capacity > 0),
  valid_from date not null default current_date,
  valid_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or end_time > start_time),
  check (valid_until is null or valid_until >= valid_from),
  unique (listing_id,day_of_week,start_time,valid_from)
);

create table if not exists public.listing_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  available_date date not null,
  start_time time not null,
  is_cancelled boolean not null default false,
  override_start_time time,
  override_end_time time,
  override_capacity integer,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id,available_date,start_time),
  check (override_capacity is null or override_capacity > 0),
  check (override_end_time is null or override_start_time is null or override_end_time > override_start_time)
);

alter table public.listing_schedule_rules enable row level security;
alter table public.listing_schedule_exceptions enable row level security;

drop policy if exists listing_schedule_rules_public_select on public.listing_schedule_rules;
create policy listing_schedule_rules_public_select
on public.listing_schedule_rules for select to anon,authenticated
using (is_active and (select private.is_public_listing(listing_id)));

drop policy if exists listing_schedule_rules_owner_all on public.listing_schedule_rules;
create policy listing_schedule_rules_owner_all
on public.listing_schedule_rules for all to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_listing(listing_id)) or (select private.is_admin()));

drop policy if exists listing_schedule_exceptions_public_select on public.listing_schedule_exceptions;
create policy listing_schedule_exceptions_public_select
on public.listing_schedule_exceptions for select to anon,authenticated
using ((select private.is_public_listing(listing_id)));

drop policy if exists listing_schedule_exceptions_owner_all on public.listing_schedule_exceptions;
create policy listing_schedule_exceptions_owner_all
on public.listing_schedule_exceptions for all to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_listing(listing_id)) or (select private.is_admin()));

grant select on public.listing_schedule_rules,public.listing_schedule_exceptions to anon,authenticated;
grant insert,update,delete on public.listing_schedule_rules,public.listing_schedule_exceptions to authenticated;

create table if not exists public.listing_arrival_guides (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  reception_hours text,
  check_in_instructions text,
  early_check_in text,
  late_check_in text,
  key_collection text,
  airport_name text,
  airport_pickup_available boolean not null default false,
  airport_pickup_fee numeric(12,2),
  airport_pickup_currency char(3) not null default 'USD',
  airport_meeting_point text,
  jetty_pickup text,
  luggage_information text,
  directions text,
  emergency_contact text,
  house_rules text,
  updated_at timestamptz not null default now(),
  check (airport_pickup_fee is null or airport_pickup_fee >= 0)
);

alter table public.listing_arrival_guides enable row level security;

drop policy if exists listing_arrival_guides_public_select on public.listing_arrival_guides;
create policy listing_arrival_guides_public_select
on public.listing_arrival_guides for select to anon,authenticated
using ((select private.is_public_listing(listing_id)));

drop policy if exists listing_arrival_guides_owner_select on public.listing_arrival_guides;
create policy listing_arrival_guides_owner_select
on public.listing_arrival_guides for select to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()));

drop policy if exists listing_arrival_guides_owner_insert on public.listing_arrival_guides;
create policy listing_arrival_guides_owner_insert
on public.listing_arrival_guides for insert to authenticated
with check ((select private.owns_listing(listing_id)) or (select private.is_admin()));

drop policy if exists listing_arrival_guides_owner_update on public.listing_arrival_guides;
create policy listing_arrival_guides_owner_update
on public.listing_arrival_guides for update to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_listing(listing_id)) or (select private.is_admin()));

drop policy if exists listing_arrival_guides_owner_delete on public.listing_arrival_guides;
create policy listing_arrival_guides_owner_delete
on public.listing_arrival_guides for delete to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()));

grant select on public.listing_arrival_guides to anon,authenticated;
grant insert,update,delete on public.listing_arrival_guides to authenticated;

create or replace function private.effective_room_rate(
  p_rate_plan_id uuid,
  p_room_id uuid,
  p_day date,
  p_party_size integer default null
)
returns numeric
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_room public.accommodation_rooms;
  v_plan public.room_rate_plans;
  v_parent public.room_rate_plans;
  v_calendar public.room_rate_calendar;
  v_price numeric;
  v_occ_key text;
  v_occ numeric;
begin
  select * into v_room from public.accommodation_rooms where id=p_room_id;
  if v_room.id is null then raise exception 'Room type not found'; end if;

  if p_rate_plan_id is null then
    v_price := v_room.base_price;
  else
    select * into v_plan
    from public.room_rate_plans
    where id=p_rate_plan_id and room_id=p_room_id and is_active;

    if v_plan.id is null then raise exception 'Rate plan is not available'; end if;

    if v_plan.pricing_mode='fixed' then
      v_price := v_plan.nightly_price;
    else
      if v_plan.parent_rate_plan_id is not null then
        select * into v_parent
        from public.room_rate_plans
        where id=v_plan.parent_rate_plan_id
          and room_id=p_room_id
          and is_active;
      end if;
      v_price := coalesce(v_parent.nightly_price,v_room.base_price);
      if v_plan.pricing_mode='derived_percent' then
        v_price := round(v_price*(1+v_plan.adjustment_value/100),2);
      elsif v_plan.pricing_mode='derived_amount' then
        v_price := v_price+v_plan.adjustment_value;
      end if;
      v_price := greatest(0,v_price);
    end if;

    if p_party_size is not null and jsonb_typeof(v_plan.occupancy_pricing)='object' then
      v_occ_key := least(v_room.maximum_guests,greatest(1,p_party_size))::text;
      if v_plan.occupancy_pricing ? v_occ_key then
        begin
          v_occ := (v_plan.occupancy_pricing->>v_occ_key)::numeric;
          if v_occ>=0 then v_price:=v_occ; end if;
        exception when others then null;
        end;
      end if;
    end if;
  end if;

  select * into v_calendar
  from public.room_rate_calendar
  where room_id=p_room_id
    and rate_plan_id is not distinct from p_rate_plan_id
    and available_date=p_day;

  if v_calendar.id is not null and v_calendar.price_override is not null then
    v_price := v_calendar.price_override;
  else
    select * into v_calendar
    from public.room_rate_calendar
    where room_id=p_room_id
      and rate_plan_id is null
      and available_date=p_day;
    if v_calendar.id is not null and v_calendar.price_override is not null then
      v_price := v_calendar.price_override;
    end if;
  end if;

  return greatest(0,coalesce(v_price,v_room.base_price));
end;
$$;

create or replace function private.calculate_promotion_discount(
  p_listing_id uuid,
  p_rate_plan_id uuid,
  p_stay_date date,
  p_nights integer,
  p_subtotal numeric
)
returns numeric
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_best numeric := 0;
  v_stack numeric := 0;
  v_discount numeric;
  v record;
  v_lead integer := greatest(0,p_stay_date-current_date);
begin
  for v in
    select p.*
    from public.promotions p
    where p.listing_id=p_listing_id
      and p.is_active
      and p_stay_date between p.valid_from and p.valid_until
      and (p.booking_from is null or current_date>=p.booking_from)
      and (p.booking_until is null or current_date<=p.booking_until)
      and (p.minimum_nights is null or p_nights>=p.minimum_nights)
      and (p.minimum_lead_days is null or v_lead>=p.minimum_lead_days)
      and (p.maximum_lead_days is null or v_lead<=p.maximum_lead_days)
      and (p.applies_to_rate_plan_id is null or p.applies_to_rate_plan_id=p_rate_plan_id)
      and (
        p.days_of_week is null
        or extract(isodow from p_stay_date)::smallint=any(p.days_of_week)
      )
    order by p.priority,p.created_at
  loop
    v_discount := case
      when v.discount_type='percent'
        then round(p_subtotal*v.discount_value/100,2)
      else v.discount_value
    end;
    v_discount := least(p_subtotal,greatest(0,v_discount));

    if v.stacking_mode='stackable' then
      v_stack := v_stack+v_discount;
    else
      v_best := greatest(v_best,v_discount);
    end if;
  end loop;

  return least(p_subtotal,greatest(v_best,v_stack));
end;
$$;

create or replace function public.operator_set_room_calendar_range(
  p_room_id uuid,
  p_rate_plan_id uuid,
  p_start_date date,
  p_end_date date,
  p_sellable_quantity integer default null,
  p_price_override numeric default null,
  p_minimum_stay integer default null,
  p_maximum_stay integer default null,
  p_min_advance_hours integer default null,
  p_max_advance_days integer default null,
  p_closed_to_arrival boolean default false,
  p_closed_to_departure boolean default false,
  p_stop_sell boolean default false,
  p_is_blocked boolean default false
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_room public.accommodation_rooms;
  v_plan public.room_rate_plans;
  v_listing public.listings;
  v_business public.businesses;
  v_day date;
  v_count integer := 0;
  v_sellable integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'Choose a valid date range';
  end if;
  if p_start_date<current_date then
    raise exception 'Calendar changes can only apply to today or future dates';
  end if;
  if p_price_override is not null and p_price_override<0 then
    raise exception 'Price override cannot be negative';
  end if;
  if p_minimum_stay is not null and p_minimum_stay<1 then raise exception 'Minimum stay must be at least 1'; end if;
  if p_maximum_stay is not null and p_maximum_stay<1 then raise exception 'Maximum stay must be at least 1'; end if;
  if p_minimum_stay is not null and p_maximum_stay is not null and p_maximum_stay<p_minimum_stay then
    raise exception 'Maximum stay cannot be lower than minimum stay';
  end if;

  select * into v_room from public.accommodation_rooms where id=p_room_id and is_active;
  if v_room.id is null then raise exception 'Room type not found'; end if;

  select * into v_listing from public.listings where id=v_room.listing_id;
  select * into v_business from public.businesses where id=v_listing.business_id;
  if v_business.owner_id<>auth.uid() and not private.is_admin(auth.uid()) then
    raise exception 'Calendar access denied';
  end if;

  if p_rate_plan_id is not null then
    select * into v_plan
    from public.room_rate_plans
    where id=p_rate_plan_id and room_id=p_room_id and is_active;
    if v_plan.id is null then raise exception 'Rate plan not found for this room'; end if;
  end if;

  v_sellable := coalesce(p_sellable_quantity,v_room.quantity);
  if v_sellable<0 or v_sellable>v_room.quantity then
    raise exception 'Rooms for sale must be between 0 and the room quantity';
  end if;

  for v_day in
    select generate_series(p_start_date,p_end_date,interval '1 day')::date
  loop
    if p_rate_plan_id is null then
      insert into public.room_availability(
        room_id,available_date,total_quantity,available_quantity,sellable_quantity,
        price_override,is_blocked,minimum_stay,maximum_stay,min_advance_hours,
        max_advance_days,closed_to_arrival,closed_to_departure,stop_sell
      ) values (
        p_room_id,v_day,v_room.quantity,v_sellable,v_sellable,p_price_override,p_is_blocked,
        p_minimum_stay,p_maximum_stay,p_min_advance_hours,p_max_advance_days,
        p_closed_to_arrival,p_closed_to_departure,p_stop_sell
      )
      on conflict (room_id,available_date) do update
      set total_quantity=excluded.total_quantity,
          sellable_quantity=excluded.sellable_quantity,
          price_override=excluded.price_override,
          is_blocked=excluded.is_blocked,
          minimum_stay=excluded.minimum_stay,
          maximum_stay=excluded.maximum_stay,
          min_advance_hours=excluded.min_advance_hours,
          max_advance_days=excluded.max_advance_days,
          closed_to_arrival=excluded.closed_to_arrival,
          closed_to_departure=excluded.closed_to_departure,
          stop_sell=excluded.stop_sell,
          updated_at=now();

      perform private.recalculate_room_inventory(p_room_id,v_day);
    else
      insert into public.room_rate_calendar(
        room_id,rate_plan_id,available_date,price_override,minimum_stay,maximum_stay,
        min_advance_hours,max_advance_days,closed_to_arrival,closed_to_departure,stop_sell
      ) values (
        p_room_id,p_rate_plan_id,v_day,p_price_override,p_minimum_stay,p_maximum_stay,
        p_min_advance_hours,p_max_advance_days,p_closed_to_arrival,p_closed_to_departure,p_stop_sell
      )
      on conflict (room_id,rate_plan_id,available_date) do update
      set price_override=excluded.price_override,
          minimum_stay=excluded.minimum_stay,
          maximum_stay=excluded.maximum_stay,
          min_advance_hours=excluded.min_advance_hours,
          max_advance_days=excluded.max_advance_days,
          closed_to_arrival=excluded.closed_to_arrival,
          closed_to_departure=excluded.closed_to_departure,
          stop_sell=excluded.stop_sell,
          updated_at=now();
    end if;
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.operator_generate_listing_schedule(
  p_listing_id uuid,
  p_start_date date default current_date,
  p_end_date date default (current_date+365)
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_listing public.listings;
  v_business public.businesses;
  v_rule public.listing_schedule_rules;
  v_exception public.listing_schedule_exceptions;
  v_day date;
  v_start time;
  v_end time;
  v_capacity integer;
  v_cancelled boolean;
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'Choose a valid date range'; end if;
  if p_end_date>p_start_date+366 then raise exception 'Generate at most 12 months at a time'; end if;

  select * into v_listing from public.listings where id=p_listing_id;
  if v_listing.id is null then raise exception 'Listing not found'; end if;
  if v_listing.category='accommodation' then raise exception 'Accommodation uses the room calendar'; end if;
  select * into v_business from public.businesses where id=v_listing.business_id;
  if v_business.owner_id<>auth.uid() and not private.is_admin(auth.uid()) then raise exception 'Schedule access denied'; end if;

  for v_day in select generate_series(p_start_date,p_end_date,interval '1 day')::date loop
    for v_rule in
      select *
      from public.listing_schedule_rules
      where listing_id=p_listing_id
        and is_active
        and day_of_week=extract(dow from v_day)::smallint
        and v_day>=valid_from
        and (valid_until is null or v_day<=valid_until)
      order by start_time
    loop
      v_start:=v_rule.start_time;
      v_end:=v_rule.end_time;
      v_capacity:=v_rule.capacity;
      v_cancelled:=false;

      select * into v_exception
      from public.listing_schedule_exceptions
      where listing_id=p_listing_id
        and available_date=v_day
        and start_time=v_rule.start_time;

      if v_exception.id is not null then
        v_cancelled:=v_exception.is_cancelled;
        v_start:=coalesce(v_exception.override_start_time,v_start);
        v_end:=coalesce(v_exception.override_end_time,v_end);
        v_capacity:=coalesce(v_exception.override_capacity,v_capacity);
      end if;

      insert into public.availability(
        listing_id,available_date,start_time,end_time,max_capacity,remaining_spaces,
        sellable_capacity,is_blocked,stop_sell
      ) values (
        p_listing_id,v_day,v_start,v_end,v_capacity,
        case when v_cancelled then 0 else v_capacity end,
        v_capacity,v_cancelled,v_cancelled
      )
      on conflict (listing_id,available_date,start_time) do update
      set end_time=excluded.end_time,
          max_capacity=excluded.max_capacity,
          sellable_capacity=excluded.sellable_capacity,
          is_blocked=excluded.is_blocked,
          stop_sell=excluded.stop_sell,
          updated_at=now();

      perform private.recalculate_availability_inventory(
        (select id from public.availability
         where listing_id=p_listing_id and available_date=v_day and start_time=v_start)
      );
      v_count:=v_count+1;
    end loop;
  end loop;

  return v_count;
end;
$$;