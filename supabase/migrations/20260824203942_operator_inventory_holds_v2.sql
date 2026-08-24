create extension if not exists pg_cron;

alter table public.listing_policies
  add column if not exists booking_hold_hours integer not null default 24;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_policies_booking_hold_hours_check'
      and conrelid = 'public.listing_policies'::regclass
  ) then
    alter table public.listing_policies
      add constraint listing_policies_booking_hold_hours_check
      check (booking_hold_hours between 1 and 168);
  end if;
end $$;

alter table public.room_availability
  add column if not exists sellable_quantity integer,
  add column if not exists held_quantity integer not null default 0,
  add column if not exists booked_quantity integer not null default 0,
  add column if not exists external_booked_quantity integer not null default 0,
  add column if not exists minimum_stay integer,
  add column if not exists maximum_stay integer,
  add column if not exists min_advance_hours integer,
  add column if not exists max_advance_days integer,
  add column if not exists closed_to_arrival boolean not null default false,
  add column if not exists closed_to_departure boolean not null default false,
  add column if not exists stop_sell boolean not null default false;

update public.room_availability
set sellable_quantity = coalesce(sellable_quantity, total_quantity)
where sellable_quantity is null;

alter table public.room_availability
  alter column sellable_quantity set not null;

alter table public.availability
  add column if not exists sellable_capacity integer,
  add column if not exists held_spaces integer not null default 0,
  add column if not exists booked_spaces integer not null default 0,
  add column if not exists minimum_stay integer,
  add column if not exists maximum_stay integer,
  add column if not exists min_advance_hours integer,
  add column if not exists max_advance_days integer,
  add column if not exists closed_to_arrival boolean not null default false,
  add column if not exists closed_to_departure boolean not null default false,
  add column if not exists stop_sell boolean not null default false;

update public.availability
set sellable_capacity = coalesce(sellable_capacity, max_capacity)
where sellable_capacity is null;

alter table public.availability
  alter column sellable_capacity set not null;

alter table public.listings
  add column if not exists sellable_spaces integer,
  add column if not exists held_spaces integer not null default 0,
  add column if not exists booked_spaces integer not null default 0;

select set_config('app.booking_capacity_rpc','true',true);
update public.listings
set sellable_spaces = coalesce(sellable_spaces, max_capacity)
where sellable_spaces is null;

alter table public.listings
  alter column sellable_spaces set not null;

alter table public.booking_enquiries
  add column if not exists hold_expires_at timestamptz,
  add column if not exists hold_status text not null default 'none',
  add column if not exists internal_note text,
  add column if not exists payment_due_at timestamptz,
  add column if not exists operator_payment_confirmed_at timestamptz,
  add column if not exists operator_payment_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='booking_enquiries_hold_status_check'
      and conrelid='public.booking_enquiries'::regclass
  ) then
    alter table public.booking_enquiries
      add constraint booking_enquiries_hold_status_check
      check (hold_status in ('none','active','released','converted','expired'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='booking_enquiries_internal_note_check'
      and conrelid='public.booking_enquiries'::regclass
  ) then
    alter table public.booking_enquiries
      add constraint booking_enquiries_internal_note_check
      check (internal_note is null or char_length(internal_note) <= 4000);
  end if;
end $$;

create table if not exists public.booking_inventory_holds (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null unique references public.booking_enquiries(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  room_id uuid references public.accommodation_rooms(id) on delete cascade,
  availability_id uuid references public.availability(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  start_date date not null,
  end_date date,
  status text not null default 'active'
    check (status in ('active','released','converted','expired')),
  expires_at timestamptz not null,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date > start_date)
);

create index if not exists booking_inventory_holds_active_idx
  on public.booking_inventory_holds(status, expires_at)
  where status='active';
create index if not exists booking_inventory_holds_room_dates_idx
  on public.booking_inventory_holds(room_id, start_date, end_date)
  where room_id is not null;
create index if not exists booking_inventory_holds_availability_idx
  on public.booking_inventory_holds(availability_id)
  where availability_id is not null;
create index if not exists booking_inventory_holds_business_idx
  on public.booking_inventory_holds(business_id, created_at desc);

alter table public.booking_inventory_holds enable row level security;

drop policy if exists booking_inventory_holds_select on public.booking_inventory_holds;
create policy booking_inventory_holds_select
on public.booking_inventory_holds for select
to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1 from public.businesses b
    where b.id=booking_inventory_holds.business_id
      and b.owner_id=(select auth.uid())
  )
  or exists (
    select 1 from public.booking_enquiries be
    where be.id=booking_inventory_holds.enquiry_id
      and be.traveler_id=(select auth.uid())
  )
);

revoke insert, update, delete on public.booking_inventory_holds from anon, authenticated;
grant select on public.booking_inventory_holds to authenticated;

create table if not exists public.inventory_ledger (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  room_id uuid references public.accommodation_rooms(id) on delete set null,
  availability_id uuid references public.availability(id) on delete set null,
  enquiry_id uuid references public.booking_enquiries(id) on delete set null,
  external_booking_id uuid references public.external_accommodation_bookings(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  movement_type text not null check (
    movement_type in (
      'hold_created','hold_released','hold_expired','hold_converted',
      'booking_cancelled','external_booking_created','external_booking_cancelled',
      'sellable_inventory_changed','manual_reconciliation'
    )
  ),
  quantity_delta integer not null,
  balance_after integer,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_ledger_business_created_idx
  on public.inventory_ledger(business_id, created_at desc);
create index if not exists inventory_ledger_listing_created_idx
  on public.inventory_ledger(listing_id, created_at desc);
create index if not exists inventory_ledger_enquiry_idx
  on public.inventory_ledger(enquiry_id)
  where enquiry_id is not null;

alter table public.inventory_ledger enable row level security;

drop policy if exists inventory_ledger_select on public.inventory_ledger;
create policy inventory_ledger_select
on public.inventory_ledger for select
to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1 from public.businesses b
    where b.id=inventory_ledger.business_id
      and b.owner_id=(select auth.uid())
  )
);

revoke insert, update, delete on public.inventory_ledger from anon, authenticated;
grant select on public.inventory_ledger to authenticated;

create or replace function private.owns_editable_room(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.accommodation_rooms r
    where r.id=p_room_id
      and private.owns_editable_listing(r.listing_id,p_user_id)
  );
$$;

create or replace function private.log_inventory_movement(
  p_business_id uuid,
  p_listing_id uuid,
  p_room_id uuid,
  p_availability_id uuid,
  p_enquiry_id uuid,
  p_external_booking_id uuid,
  p_movement_type text,
  p_quantity_delta integer,
  p_balance_after integer,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.inventory_ledger(
    business_id,listing_id,room_id,availability_id,enquiry_id,
    external_booking_id,actor_id,movement_type,quantity_delta,balance_after,note
  ) values (
    p_business_id,p_listing_id,p_room_id,p_availability_id,p_enquiry_id,
    p_external_booking_id,auth.uid(),p_movement_type,p_quantity_delta,p_balance_after,
    nullif(trim(coalesce(p_note,'')),'')
  );
end;
$$;

create or replace function private.recalculate_room_inventory(
  p_room_id uuid,
  p_day date
)
returns public.room_availability
language plpgsql
security definer
set search_path=''
as $$
declare
  v_room public.accommodation_rooms;
  v_row public.room_availability;
  v_booked integer := 0;
  v_external integer := 0;
  v_held integer := 0;
  v_sellable integer;
begin
  select * into v_room
  from public.accommodation_rooms
  where id=p_room_id;

  if v_room.id is null then
    raise exception 'Room type not found';
  end if;

  insert into public.room_availability(
    room_id,available_date,total_quantity,available_quantity,sellable_quantity,is_blocked
  ) values (
    p_room_id,p_day,v_room.quantity,v_room.quantity,v_room.quantity,false
  )
  on conflict (room_id,available_date) do nothing;

  select * into v_row
  from public.room_availability
  where room_id=p_room_id and available_date=p_day
  for update;

  select coalesce(sum(be.rooms_requested),0)::integer
  into v_booked
  from public.booking_enquiries be
  where be.room_id=p_room_id
    and be.inventory_committed
    and be.status in ('confirmed','completed','no_show')
    and be.requested_date<=p_day
    and be.check_out_date>p_day;

  select coalesce(sum(eb.rooms_booked),0)::integer
  into v_external
  from public.external_accommodation_bookings eb
  where eb.room_id=p_room_id
    and eb.status='active'
    and eb.check_in_date<=p_day
    and eb.check_out_date>p_day;

  select coalesce(sum(h.quantity),0)::integer
  into v_held
  from public.booking_inventory_holds h
  where h.room_id=p_room_id
    and h.status='active'
    and h.expires_at>now()
    and h.start_date<=p_day
    and coalesce(h.end_date,h.start_date+1)>p_day;

  v_sellable := least(
    v_room.quantity,
    greatest(0,coalesce(v_row.sellable_quantity,v_row.total_quantity,v_room.quantity))
  );

  update public.room_availability
  set total_quantity=v_room.quantity,
      sellable_quantity=v_sellable,
      booked_quantity=v_booked,
      external_booked_quantity=v_external,
      held_quantity=v_held,
      available_quantity=case
        when is_blocked or stop_sell then 0
        else greatest(0,v_sellable-v_booked-v_external-v_held)
      end,
      updated_at=now()
  where id=v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function private.recalculate_availability_inventory(
  p_availability_id uuid
)
returns public.availability
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row public.availability;
  v_booked integer := 0;
  v_held integer := 0;
  v_sellable integer;
begin
  select * into v_row
  from public.availability
  where id=p_availability_id
  for update;

  if v_row.id is null then
    raise exception 'Availability session not found';
  end if;

  select coalesce(sum(be.guest_count),0)::integer
  into v_booked
  from public.booking_enquiries be
  where be.availability_id=p_availability_id
    and be.inventory_committed
    and be.status in ('confirmed','completed','no_show');

  select coalesce(sum(h.quantity),0)::integer
  into v_held
  from public.booking_inventory_holds h
  where h.availability_id=p_availability_id
    and h.status='active'
    and h.expires_at>now();

  v_sellable := greatest(0,coalesce(v_row.sellable_capacity,v_row.max_capacity));

  update public.availability
  set sellable_capacity=v_sellable,
      booked_spaces=v_booked,
      held_spaces=v_held,
      remaining_spaces=case
        when is_blocked or stop_sell then 0
        else greatest(0,v_sellable-v_booked-v_held)
      end,
      updated_at=now()
  where id=v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function private.release_booking_hold(
  p_enquiry_id uuid,
  p_status text default 'released',
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_hold public.booking_inventory_holds;
  v_day date;
  v_row public.room_availability;
  v_slot public.availability;
  v_listing public.listings;
  v_balance integer;
begin
  select * into v_hold
  from public.booking_inventory_holds
  where enquiry_id=p_enquiry_id
  for update;

  if v_hold.id is null or v_hold.status<>'active' then
    return;
  end if;

  update public.booking_inventory_holds
  set status=case when p_status='expired' then 'expired' else 'released' end,
      released_at=now(),
      release_reason=nullif(trim(coalesce(p_reason,'')),''),
      updated_at=now()
  where id=v_hold.id;

  if v_hold.room_id is not null then
    for v_day in
      select generate_series(
        v_hold.start_date,
        coalesce(v_hold.end_date,v_hold.start_date+1)-1,
        interval '1 day'
      )::date
    loop
      v_row := private.recalculate_room_inventory(v_hold.room_id,v_day);
      v_balance := v_row.available_quantity;
    end loop;
  elsif v_hold.availability_id is not null then
    v_slot := private.recalculate_availability_inventory(v_hold.availability_id);
    v_balance := v_slot.remaining_spaces;
  else
    select * into v_listing from public.listings where id=v_hold.listing_id for update;
    perform set_config('app.booking_capacity_rpc','true',true);
    update public.listings
    set held_spaces=greatest(0,held_spaces-v_hold.quantity),
        available_spaces=least(sellable_spaces,available_spaces+v_hold.quantity),
        updated_at=now()
    where id=v_hold.listing_id
    returning * into v_listing;
    v_balance := v_listing.available_spaces;
  end if;

  perform private.log_inventory_movement(
    v_hold.business_id,v_hold.listing_id,v_hold.room_id,v_hold.availability_id,
    v_hold.enquiry_id,null,
    case when p_status='expired' then 'hold_expired' else 'hold_released' end,
    v_hold.quantity,v_balance,p_reason
  );

  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries
  set hold_status=case when p_status='expired' then 'expired' else 'released' end,
      hold_expires_at=null
  where id=p_enquiry_id;
end;
$$;

create or replace function private.create_booking_hold(
  p_enquiry_id uuid
)
returns public.booking_inventory_holds
language plpgsql
security definer
set search_path=''
as $$
declare
  v_enquiry public.booking_enquiries;
  v_listing public.listings;
  v_policy public.listing_policies;
  v_hold public.booking_inventory_holds;
  v_day date;
  v_row public.room_availability;
  v_slot public.availability;
  v_quantity integer;
  v_expires timestamptz;
  v_balance integer;
  v_nights integer;
begin
  select * into v_enquiry
  from public.booking_enquiries
  where id=p_enquiry_id
  for update;

  if v_enquiry.id is null then
    raise exception 'Booking request not found';
  end if;

  select * into v_listing
  from public.listings
  where id=v_enquiry.listing_id
  for update;

  if v_listing.id is null then
    raise exception 'Listing not found';
  end if;

  select * into v_policy
  from public.listing_policies
  where listing_id=v_enquiry.listing_id;

  v_quantity := case
    when v_listing.category='accommodation' then v_enquiry.rooms_requested
    else v_enquiry.guest_count
  end;
  v_expires := now() + make_interval(hours=>coalesce(v_policy.booking_hold_hours,24));

  select * into v_hold
  from public.booking_inventory_holds
  where enquiry_id=p_enquiry_id
  for update;

  if v_hold.id is not null and v_hold.status='active' and v_hold.expires_at>now() then
    return v_hold;
  end if;

  if v_enquiry.room_id is not null then
    if v_enquiry.check_out_date is null or v_enquiry.check_out_date<=v_enquiry.requested_date then
      raise exception 'Invalid accommodation stay dates';
    end if;
    v_nights := v_enquiry.check_out_date-v_enquiry.requested_date;

    for v_day in
      select generate_series(
        v_enquiry.requested_date,
        v_enquiry.check_out_date-1,
        interval '1 day'
      )::date
    loop
      v_row := private.recalculate_room_inventory(v_enquiry.room_id,v_day);
      if v_row.is_blocked or v_row.stop_sell or v_row.available_quantity<v_quantity then
        raise exception 'Room inventory changed; this stay can no longer be accepted';
      end if;
    end loop;

  elsif v_enquiry.availability_id is not null then
    v_slot := private.recalculate_availability_inventory(v_enquiry.availability_id);
    if v_slot.is_blocked or v_slot.stop_sell or v_slot.remaining_spaces<v_quantity then
      raise exception 'Session capacity changed; this booking can no longer be accepted';
    end if;
  else
    if v_listing.available_spaces<v_quantity then
      raise exception 'Listing capacity changed; this booking can no longer be accepted';
    end if;
  end if;

  insert into public.booking_inventory_holds(
    enquiry_id,business_id,listing_id,room_id,availability_id,quantity,
    start_date,end_date,status,expires_at,released_at,release_reason
  ) values (
    v_enquiry.id,v_enquiry.business_id,v_enquiry.listing_id,v_enquiry.room_id,
    v_enquiry.availability_id,v_quantity,v_enquiry.requested_date,
    v_enquiry.check_out_date,'active',v_expires,null,null
  )
  on conflict (enquiry_id) do update
    set business_id=excluded.business_id,
        listing_id=excluded.listing_id,
        room_id=excluded.room_id,
        availability_id=excluded.availability_id,
        quantity=excluded.quantity,
        start_date=excluded.start_date,
        end_date=excluded.end_date,
        status='active',
        expires_at=excluded.expires_at,
        released_at=null,
        release_reason=null,
        updated_at=now()
  returning * into v_hold;

  if v_enquiry.room_id is not null then
    for v_day in
      select generate_series(
        v_enquiry.requested_date,
        v_enquiry.check_out_date-1,
        interval '1 day'
      )::date
    loop
      v_row := private.recalculate_room_inventory(v_enquiry.room_id,v_day);
      v_balance := v_row.available_quantity;
    end loop;
  elsif v_enquiry.availability_id is not null then
    v_slot := private.recalculate_availability_inventory(v_enquiry.availability_id);
    v_balance := v_slot.remaining_spaces;
  else
    perform set_config('app.booking_capacity_rpc','true',true);
    update public.listings
    set held_spaces=held_spaces+v_quantity,
        available_spaces=available_spaces-v_quantity,
        updated_at=now()
    where id=v_listing.id
    returning * into v_listing;
    v_balance := v_listing.available_spaces;
  end if;

  perform private.log_inventory_movement(
    v_enquiry.business_id,v_enquiry.listing_id,v_enquiry.room_id,v_enquiry.availability_id,
    v_enquiry.id,null,'hold_created',-v_quantity,v_balance,
    'Inventory reserved after operator acceptance'
  );

  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries
  set hold_status='active',
      hold_expires_at=v_expires,
      payment_due_at=coalesce(payment_due_at,v_expires)
  where id=v_enquiry.id;

  return v_hold;
end;
$$;

create or replace function private.convert_booking_hold(
  p_enquiry_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_enquiry public.booking_enquiries;
  v_hold public.booking_inventory_holds;
  v_listing public.listings;
  v_day date;
  v_row public.room_availability;
  v_slot public.availability;
  v_balance integer;
begin
  select * into v_enquiry
  from public.booking_enquiries
  where id=p_enquiry_id
  for update;

  select * into v_hold
  from public.booking_inventory_holds
  where enquiry_id=p_enquiry_id
  for update;

  if v_hold.id is null or v_hold.status<>'active' or v_hold.expires_at<=now() then
    if v_hold.id is not null and v_hold.status='active' then
      perform private.release_booking_hold(p_enquiry_id,'expired','Hold expired before confirmation');
    end if;
    v_hold := private.create_booking_hold(p_enquiry_id);
  end if;

  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries
  set inventory_committed=true,
      hold_status='converted',
      hold_expires_at=null,
      confirmed_at=coalesce(confirmed_at,now())
  where id=p_enquiry_id
  returning * into v_enquiry;

  update public.booking_inventory_holds
  set status='converted',released_at=now(),release_reason='Converted to confirmed booking',updated_at=now()
  where enquiry_id=p_enquiry_id;

  if v_enquiry.room_id is not null then
    for v_day in
      select generate_series(v_enquiry.requested_date,v_enquiry.check_out_date-1,interval '1 day')::date
    loop
      v_row := private.recalculate_room_inventory(v_enquiry.room_id,v_day);
      v_balance := v_row.available_quantity;
    end loop;
  elsif v_enquiry.availability_id is not null then
    v_slot := private.recalculate_availability_inventory(v_enquiry.availability_id);
    v_balance := v_slot.remaining_spaces;
  else
    select * into v_listing from public.listings where id=v_enquiry.listing_id for update;
    perform set_config('app.booking_capacity_rpc','true',true);
    update public.listings
    set held_spaces=greatest(0,held_spaces-v_hold.quantity),
        booked_spaces=booked_spaces+v_hold.quantity,
        updated_at=now()
    where id=v_enquiry.listing_id
    returning * into v_listing;
    v_balance := v_listing.available_spaces;
  end if;

  perform private.log_inventory_movement(
    v_enquiry.business_id,v_enquiry.listing_id,v_enquiry.room_id,v_enquiry.availability_id,
    v_enquiry.id,null,'hold_converted',0,v_balance,
    'Accepted inventory hold converted to confirmed booking'
  );
end;
$$;

create or replace function private.release_confirmed_booking_inventory(
  p_enquiry_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_enquiry public.booking_enquiries;
  v_listing public.listings;
  v_day date;
  v_row public.room_availability;
  v_slot public.availability;
  v_quantity integer;
  v_balance integer;
begin
  select * into v_enquiry
  from public.booking_enquiries
  where id=p_enquiry_id
  for update;

  if v_enquiry.id is null or not v_enquiry.inventory_committed then
    return;
  end if;

  select * into v_listing
  from public.listings
  where id=v_enquiry.listing_id
  for update;

  v_quantity := case
    when v_listing.category='accommodation' then v_enquiry.rooms_requested
    else v_enquiry.guest_count
  end;

  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries
  set inventory_committed=false
  where id=p_enquiry_id
  returning * into v_enquiry;

  if v_enquiry.room_id is not null then
    for v_day in
      select generate_series(v_enquiry.requested_date,v_enquiry.check_out_date-1,interval '1 day')::date
    loop
      v_row := private.recalculate_room_inventory(v_enquiry.room_id,v_day);
      v_balance := v_row.available_quantity;
    end loop;
  elsif v_enquiry.availability_id is not null then
    v_slot := private.recalculate_availability_inventory(v_enquiry.availability_id);
    v_balance := v_slot.remaining_spaces;
  else
    perform set_config('app.booking_capacity_rpc','true',true);
    update public.listings
    set booked_spaces=greatest(0,booked_spaces-v_quantity),
        available_spaces=least(sellable_spaces,available_spaces+v_quantity),
        updated_at=now()
    where id=v_enquiry.listing_id
    returning * into v_listing;
    v_balance := v_listing.available_spaces;
  end if;

  perform private.log_inventory_movement(
    v_enquiry.business_id,v_enquiry.listing_id,v_enquiry.room_id,v_enquiry.availability_id,
    v_enquiry.id,null,'booking_cancelled',v_quantity,v_balance,p_reason
  );
end;
$$;

create or replace function private.expire_booking_holds()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select enquiry_id
    from public.booking_inventory_holds
    where status='active' and expires_at<=now()
    order by expires_at
    for update skip locked
  loop
    perform private.release_booking_hold(v_id,'expired','Automatic payment/acceptance hold expiry');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname='visit_baa_expire_booking_holds';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'visit_baa_expire_booking_holds',
    '*/15 * * * *',
    'select private.expire_booking_holds();'
  );
end $$;

create or replace function public.operator_update_booking(
  p_enquiry_id uuid,
  p_status public.enquiry_status,
  p_response text default null
)
returns public.booking_enquiries
language plpgsql
security definer
set search_path=''
as $$
declare
  v_enquiry public.booking_enquiries;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform private.expire_booking_holds();

  select * into v_enquiry
  from public.booking_enquiries
  where id=p_enquiry_id
  for update;

  if v_enquiry.id is null then
    raise exception 'Booking request not found';
  end if;

  if v_enquiry.operator_id<>auth.uid() and not private.is_admin(auth.uid()) then
    raise exception 'Booking access denied';
  end if;

  if not (
    (v_enquiry.status='new' and p_status in ('accepted','declined','changes_requested','cancelled'))
    or
    (v_enquiry.status in ('accepted','changes_requested') and p_status in ('confirmed','declined','changes_requested','cancelled','accepted'))
    or
    (v_enquiry.status='confirmed' and p_status in ('completed','cancelled','no_show'))
  ) then
    raise exception 'Invalid booking status transition';
  end if;

  if p_status='accepted' and v_enquiry.status<>'accepted' then
    perform private.create_booking_hold(p_enquiry_id);
  elsif p_status in ('changes_requested','declined','cancelled')
    and v_enquiry.status='accepted' then
    perform private.release_booking_hold(
      p_enquiry_id,'released',
      'Booking moved from accepted to '||p_status::text
    );
  elsif p_status='confirmed' then
    perform private.convert_booking_hold(p_enquiry_id);
  elsif p_status='cancelled' and v_enquiry.status='confirmed' then
    perform private.release_confirmed_booking_inventory(
      p_enquiry_id,'Confirmed booking cancelled'
    );
  end if;

  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries
  set status=p_status,
      operator_response=nullif(trim(coalesce(p_response,'')),''),
      confirmed_at=case when p_status='confirmed' then coalesce(confirmed_at,now()) else confirmed_at end,
      hold_status=case
        when p_status='confirmed' then 'converted'
        when p_status in ('declined','cancelled','changes_requested') and hold_status='active' then 'released'
        else hold_status
      end
  where id=p_enquiry_id
  returning * into v_enquiry;

  return v_enquiry;
end;
$$;

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
set search_path=''
as $$
declare
  v_room public.accommodation_rooms;
  v_listing public.listings;
  v_business public.businesses;
  v_day date;
  v_row public.room_availability;
  v_result public.external_accommodation_bookings;
  v_balance integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_source not in ('booking_com','agoda','direct','walk_in','other') then
    raise exception 'Choose a valid booking source';
  end if;
  if p_check_in_date is null or p_check_out_date is null or p_check_out_date<=p_check_in_date then
    raise exception 'Check-out must be after check-in';
  end if;
  if p_check_in_date<current_date then
    raise exception 'External bookings can only be added for current or future stays';
  end if;
  if coalesce(p_rooms,0)<1 then raise exception 'Rooms booked must be at least 1'; end if;

  select * into v_room
  from public.accommodation_rooms
  where id=p_room_id and is_active;

  if v_room.id is null then raise exception 'Room type not found'; end if;
  if p_rooms>v_room.quantity then raise exception 'Rooms booked exceed this room type quantity'; end if;

  select * into v_listing
  from public.listings
  where id=v_room.listing_id and category='accommodation';

  select * into v_business
  from public.businesses
  where id=v_listing.business_id;

  if v_business.owner_id<>auth.uid() and not private.is_admin(auth.uid()) then
    raise exception 'External booking access denied';
  end if;

  if nullif(trim(coalesce(p_external_reference,'')),'') is not null
    and exists (
      select 1
      from public.external_accommodation_bookings
      where business_id=v_business.id
        and source=p_source
        and lower(external_reference)=lower(trim(p_external_reference))
        and status='active'
    ) then
    raise exception 'This external booking reference is already recorded';
  end if;

  for v_day in
    select generate_series(p_check_in_date,p_check_out_date-1,interval '1 day')::date
  loop
    v_row := private.recalculate_room_inventory(p_room_id,v_day);
    if v_row.is_blocked or v_row.stop_sell or v_row.available_quantity<p_rooms then
      raise exception 'Not enough room inventory is available for the full external stay';
    end if;
  end loop;

  insert into public.external_accommodation_bookings(
    business_id,listing_id,room_id,source,external_reference,guest_name,
    check_in_date,check_out_date,rooms_booked,notes,created_by
  ) values (
    v_business.id,v_listing.id,v_room.id,p_source,
    nullif(trim(coalesce(p_external_reference,'')),''),
    nullif(trim(coalesce(p_guest_name,'')),''),
    p_check_in_date,p_check_out_date,p_rooms,
    nullif(trim(coalesce(p_notes,'')),''),
    auth.uid()
  )
  returning * into v_result;

  for v_day in
    select generate_series(p_check_in_date,p_check_out_date-1,interval '1 day')::date
  loop
    v_row := private.recalculate_room_inventory(p_room_id,v_day);
    v_balance := v_row.available_quantity;
  end loop;

  perform private.log_inventory_movement(
    v_business.id,v_listing.id,v_room.id,null,null,v_result.id,
    'external_booking_created',-p_rooms,v_balance,
    p_source||coalesce(' · '||nullif(trim(coalesce(p_external_reference,'')),''),'')
  );

  return v_result;
end;
$$;

create or replace function public.cancel_external_accommodation_booking(
  p_booking_id uuid
)
returns public.external_accommodation_bookings
language plpgsql
security definer
set search_path=''
as $$
declare
  v_booking public.external_accommodation_bookings;
  v_business public.businesses;
  v_day date;
  v_row public.room_availability;
  v_balance integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_booking
  from public.external_accommodation_bookings
  where id=p_booking_id
  for update;

  if v_booking.id is null then raise exception 'External booking not found'; end if;

  select * into v_business
  from public.businesses
  where id=v_booking.business_id;

  if v_business.owner_id<>auth.uid() and not private.is_admin(auth.uid()) then
    raise exception 'External booking access denied';
  end if;

  if v_booking.status='cancelled' then return v_booking; end if;

  update public.external_accommodation_bookings
  set status='cancelled',cancelled_at=now(),updated_at=now()
  where id=v_booking.id
  returning * into v_booking;

  for v_day in
    select generate_series(v_booking.check_in_date,v_booking.check_out_date-1,interval '1 day')::date
  loop
    v_row := private.recalculate_room_inventory(v_booking.room_id,v_day);
    v_balance := v_row.available_quantity;
  end loop;

  perform private.log_inventory_movement(
    v_booking.business_id,v_booking.listing_id,v_booking.room_id,null,null,v_booking.id,
    'external_booking_cancelled',v_booking.rooms_booked,v_balance,
    'External reservation cancelled'
  );

  return v_booking;
end;
$$;

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
set search_path=''
as $$
declare
  v_room public.accommodation_rooms;
  v_listing public.listings;
  v_business public.businesses;
  v_day date;
  v_requested integer;
  v_row public.room_availability;
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'Choose a valid date range';
  end if;
  if p_start_date<current_date then
    raise exception 'Availability can only be changed for today or future dates';
  end if;
  if p_price_override is not null and p_price_override<0 then
    raise exception 'Price override cannot be negative';
  end if;

  select * into v_room
  from public.accommodation_rooms
  where id=p_room_id and is_active;

  if v_room.id is null then raise exception 'Room type not found'; end if;

  select * into v_listing
  from public.listings
  where id=v_room.listing_id and category='accommodation';

  select * into v_business
  from public.businesses
  where id=v_listing.business_id;

  if v_business.owner_id<>auth.uid() and not private.is_admin(auth.uid()) then
    raise exception 'Room availability access denied';
  end if;

  v_requested := coalesce(p_available_quantity,v_room.quantity);
  if v_requested<0 or v_requested>v_room.quantity then
    raise exception 'Rooms for sale must be between 0 and the room quantity';
  end if;

  for v_day in
    select generate_series(p_start_date,p_end_date,interval '1 day')::date
  loop
    insert into public.room_availability(
      room_id,available_date,total_quantity,available_quantity,sellable_quantity,
      price_override,is_blocked
    ) values (
      p_room_id,v_day,v_room.quantity,v_requested,v_requested,p_price_override,p_is_blocked
    )
    on conflict (room_id,available_date) do update
      set total_quantity=excluded.total_quantity,
          sellable_quantity=excluded.sellable_quantity,
          price_override=excluded.price_override,
          is_blocked=excluded.is_blocked,
          updated_at=now();

    v_row := private.recalculate_room_inventory(p_room_id,v_day);

    perform private.log_inventory_movement(
      v_business.id,v_listing.id,v_room.id,null,null,null,
      'sellable_inventory_changed',0,v_row.available_quantity,
      'Sellable rooms set to '||v_requested::text||case when p_is_blocked then ' (blocked)' else '' end
    );

    v_count := v_count+1;
  end loop;

  return v_count;
end;
$$;

do $$
declare
  v record;
begin
  for v in
    select room_id,available_date from public.room_availability
  loop
    perform private.recalculate_room_inventory(v.room_id,v.available_date);
  end loop;

  for v in
    select id from public.availability
  loop
    perform private.recalculate_availability_inventory(v.id);
  end loop;
end $$;