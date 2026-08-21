-- Extends the existing trips, trip_items and booking_enquiries workflow.
-- No parallel booking or route system is introduced.

alter table public.listing_policies
  add column deposit_percentage numeric(5,2),
  add constraint listing_policies_deposit_percentage_check
    check (deposit_percentage is null or deposit_percentage between 0 and 100);

drop view if exists public.public_listing_policies;
create view public.public_listing_policies
with (security_barrier = true, security_invoker = true) as
select * from public.listing_policies;
grant select on public.public_listing_policies to anon, authenticated;

alter table public.trips
  add column status text not null default 'draft',
  add column planner_answers jsonb not null default '{}'::jsonb,
  add column pickup_point text,
  add column dropoff_point text,
  add column adult_count integer not null default 1,
  add column child_count integer not null default 0,
  add column rooms_requested integer not null default 1,
  add column budget_amount numeric(12,2),
  add column budget_currency char(3) not null default 'USD',
  add column draft_total numeric(12,2),
  add column missing_services text[] not null default '{}',
  add constraint trips_status_check check (status in ('draft','requests_sent','partially_confirmed','fully_confirmed','changes_needed','partially_cancelled','completed','cancelled')),
  add constraint trips_party_check check (adult_count > 0 and child_count >= 0 and rooms_requested > 0),
  add constraint trips_budget_check check (budget_amount is null or budget_amount >= 0),
  add constraint trips_draft_total_check check (draft_total is null or draft_total >= 0);

alter table public.trip_items
  add column item_kind text not null default 'service',
  add column planned_end_date date,
  add column availability_id uuid references public.availability(id) on delete set null,
  add column room_id uuid references public.accommodation_rooms(id) on delete set null,
  add column rate_plan_id uuid references public.room_rate_plans(id) on delete set null,
  add column adult_count integer not null default 1,
  add column child_count integer not null default 0,
  add column rooms_requested integer not null default 1,
  add column pickup_point text,
  add column dropoff_point text,
  add column selected boolean not null default true,
  add column draft_subtotal numeric(12,2),
  add column quote_currency char(3),
  add column price_unit public.price_unit,
  add column deposit_percentage numeric(5,2),
  add column booking_status text not null default 'not_requested',
  add column payment_status text not null default 'not_required',
  add column updated_at timestamptz not null default now(),
  add constraint trip_items_kind_check check (item_kind in ('accommodation','activity','transfer','service')),
  add constraint trip_items_dates_check check (planned_end_date is null or planned_date is null or planned_end_date > planned_date),
  add constraint trip_items_party_check check (adult_count > 0 and child_count >= 0 and rooms_requested > 0),
  add constraint trip_items_price_check check (draft_subtotal is null or draft_subtotal >= 0),
  add constraint trip_items_deposit_check check (deposit_percentage is null or deposit_percentage between 0 and 100),
  add constraint trip_items_booking_status_check check (booking_status in ('not_requested','awaiting_operator','accepted','alternative_offered','declined','confirmed','completed','cancelled')),
  add constraint trip_items_payment_status_check check (payment_status in ('not_required','unpaid','submitted','partially_paid','paid','rejected'));

create trigger trip_items_90_set_updated_at before update on public.trip_items
for each row execute function private.set_updated_at();

alter table public.booking_enquiries
  add column trip_id uuid references public.trips(id) on delete set null,
  add column trip_item_id uuid unique references public.trip_items(id) on delete set null,
  add column booking_request_key uuid,
  add column deposit_percentage numeric(5,2) not null default 0,
  add column deposit_amount numeric(12,2) not null default 0,
  add column balance_due numeric(12,2) not null default 0,
  add column payment_status text not null default 'not_required',
  add constraint booking_enquiries_deposit_percentage_check check (deposit_percentage between 0 and 100),
  add constraint booking_enquiries_payment_amounts_check check (deposit_amount >= 0 and balance_due >= 0),
  add constraint booking_enquiries_payment_status_check check (payment_status in ('not_required','unpaid','submitted','partially_paid','paid','rejected'));
create unique index booking_enquiries_trip_request_key_idx on public.booking_enquiries(trip_id,trip_item_id,booking_request_key)
where trip_id is not null and trip_item_id is not null and booking_request_key is not null;

create table public.trip_booking_batches (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  traveler_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (trip_id,traveler_id,idempotency_key)
);

create table public.payment_references (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  trip_item_id uuid not null references public.trip_items(id) on delete restrict,
  booking_id uuid not null references public.booking_enquiries(id) on delete restrict,
  listing_id uuid not null references public.listings(id) on delete restrict,
  traveler_id uuid not null references auth.users(id) on delete restrict,
  operator_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null,
  payment_method text not null check (char_length(trim(payment_method)) between 2 and 80),
  payment_date date not null,
  payment_reference text not null check (char_length(trim(payment_reference)) between 2 and 180),
  proof_path text,
  customer_note text check (customer_note is null or char_length(customer_note) <= 1000),
  status text not null default 'submitted' check (status in ('submitted','confirmed','rejected')),
  operator_note text check (operator_note is null or char_length(operator_note) <= 1000),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id,payment_reference)
);
create index payment_references_traveler_idx on public.payment_references(traveler_id,created_at desc);
create index payment_references_operator_idx on public.payment_references(operator_id,status,created_at desc);
create trigger payment_references_90_set_updated_at before update on public.payment_references
for each row execute function private.set_updated_at();

create or replace function private.set_payment_reference_ownership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_booking public.booking_enquiries; v_existing numeric(12,2);
begin
  select * into v_booking from public.booking_enquiries where id=new.booking_id;
  if v_booking.id is null or v_booking.traveler_id<>auth.uid() then raise exception 'Payment reference access denied'; end if;
  if v_booking.trip_id is null or v_booking.trip_item_id is null then raise exception 'Payment references require a trip booking'; end if;
  if v_booking.status::text not in ('accepted','confirmed') then raise exception 'The operator must accept the booking before payment is referenced'; end if;
  if new.payment_date>current_date then raise exception 'Payment date cannot be in the future'; end if;
  if new.proof_path is not null and split_part(new.proof_path,'/',1)<>auth.uid()::text then raise exception 'Payment proof path is invalid'; end if;
  select coalesce(sum(amount),0) into v_existing from public.payment_references
  where booking_id=v_booking.id and status in ('submitted','confirmed');
  if v_existing+new.amount>v_booking.quoted_total then raise exception 'Payment references exceed the operator booking total'; end if;
  new.trip_id:=v_booking.trip_id; new.trip_item_id:=v_booking.trip_item_id; new.listing_id:=v_booking.listing_id;
  new.traveler_id:=v_booking.traveler_id; new.operator_id:=v_booking.operator_id; new.currency:=v_booking.quote_currency;
  new.status:='submitted'; new.operator_note:=null; new.confirmed_at:=null;
  return new;
end; $$;
create trigger payment_references_10_set_ownership before insert on public.payment_references
for each row execute function private.set_payment_reference_ownership();
revoke all on function private.set_payment_reference_ownership() from public,anon,authenticated;

create or replace function private.protect_payment_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (to_jsonb(new)-'status'-'operator_note'-'confirmed_at'-'updated_at') is distinct from (to_jsonb(old)-'status'-'operator_note'-'confirmed_at'-'updated_at') then
    raise exception 'Payment reference details cannot be changed';
  end if;
  if auth.uid()<>old.operator_id and not private.is_admin(auth.uid()) then raise exception 'Payment confirmation access denied'; end if;
  if old.status<>'submitted' and not private.is_admin(auth.uid()) then raise exception 'Payment reference has already been reviewed'; end if;
  if new.status not in ('confirmed','rejected') then raise exception 'Invalid payment confirmation status'; end if;
  new.confirmed_at:=case when new.status='confirmed' then now() else null end;
  return new;
end; $$;
create trigger payment_references_20_protect before update on public.payment_references
for each row execute function private.protect_payment_reference();
revoke all on function private.protect_payment_reference() from public,anon,authenticated;

create or replace function private.refresh_trip_booking_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text; v_payment text;
begin
  v_status:=case new.status::text when 'new' then 'awaiting_operator' when 'accepted' then 'accepted' when 'changes_requested' then 'alternative_offered' when 'declined' then 'declined' when 'confirmed' then 'confirmed' when 'completed' then 'completed' when 'cancelled' then 'cancelled' when 'no_show' then 'cancelled' else 'awaiting_operator' end;
  v_payment:=new.payment_status;
  if new.trip_item_id is not null then update public.trip_items set booking_status=v_status,payment_status=v_payment where id=new.trip_item_id; end if;
  if new.trip_id is not null then
    update public.trips set status=(select case
      when bool_and(ti.booking_status='completed') then 'completed'
      when bool_and(ti.booking_status in ('confirmed','completed')) then 'fully_confirmed'
      when bool_or(ti.booking_status='declined') then 'changes_needed'
      when bool_or(ti.booking_status in ('confirmed','completed')) then 'partially_confirmed'
      when bool_or(ti.booking_status='cancelled') then 'partially_cancelled'
      else 'requests_sent' end
      from public.trip_items ti where ti.trip_id=new.trip_id and ti.selected),
      missing_services=(select coalesce(array_agg(l.title order by ti.sort_order),'{}'::text[]) from public.trip_items ti join public.listings l on l.id=ti.listing_id where ti.trip_id=new.trip_id and ti.selected and ti.booking_status in ('declined','cancelled'))
    where id=new.trip_id;
  end if;
  return new;
end; $$;
create trigger booking_enquiries_80_refresh_trip after insert or update of status,payment_status on public.booking_enquiries
for each row execute function private.refresh_trip_booking_status();
revoke all on function private.refresh_trip_booking_status() from public,anon,authenticated;

create or replace function private.refresh_booking_payment_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_paid numeric(12,2); v_booking public.booking_enquiries; v_status text;
begin
  select * into v_booking from public.booking_enquiries where id=coalesce(new.booking_id,old.booking_id);
  select coalesce(sum(amount),0) into v_paid from public.payment_references where booking_id=v_booking.id and status='confirmed';
  v_status:=case when v_booking.deposit_amount=0 then 'not_required' when v_paid>=v_booking.quoted_total then 'paid' when v_paid>=v_booking.deposit_amount then 'partially_paid' when exists(select 1 from public.payment_references where booking_id=v_booking.id and status='submitted') then 'submitted' when exists(select 1 from public.payment_references where booking_id=v_booking.id and status='rejected') then 'rejected' else 'unpaid' end;
  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries set payment_status=v_status,balance_due=greatest(0,quoted_total-v_paid) where id=v_booking.id;
  return new;
end; $$;
create trigger payment_references_80_refresh_booking after insert or update of status on public.payment_references
for each row execute function private.refresh_booking_payment_status();
revoke all on function private.refresh_booking_payment_status() from public,anon,authenticated;

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
    if v_item.item_kind='transfer' then
      select * into v_route from public.transfer_route_details where listing_id=v_item.listing_id and is_active
        and lower(trim(origin_name))=lower(trim(v_item.pickup_point)) and lower(trim(destination_name))=lower(trim(v_item.dropoff_point));
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
    perform set_config('app.booking_rpc','true',true);
    update public.booking_enquiries set trip_id=p_trip_id,trip_item_id=v_item.id,booking_request_key=p_idempotency_key,
      deposit_percentage=v_deposit,deposit_amount=round(quoted_total*v_deposit/100,2),balance_due=quoted_total,
      payment_status=case when v_deposit=0 then 'not_required' else 'unpaid' end
    where id=v_enquiry.id returning * into v_enquiry;
    return next v_enquiry;
  end loop;
  update public.trips set status='requests_sent' where id=p_trip_id;
end; $$;
revoke all on function public.request_trip_bookings(uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_trip_bookings(uuid,uuid) to authenticated;

alter table public.trip_booking_batches enable row level security;
alter table public.payment_references enable row level security;
create policy "trip_booking_batches_traveler_select" on public.trip_booking_batches for select to authenticated
using (traveler_id=auth.uid() and (select private.is_traveler()));
create policy "payment_references_traveler_select" on public.payment_references for select to authenticated using (traveler_id=auth.uid());
create policy "payment_references_traveler_insert" on public.payment_references for insert to authenticated with check (traveler_id=auth.uid());
create policy "payment_references_operator_select" on public.payment_references for select to authenticated using (operator_id=auth.uid());
create policy "payment_references_operator_update" on public.payment_references for update to authenticated using (operator_id=auth.uid()) with check (operator_id=auth.uid());
create policy "payment_references_admin_all" on public.payment_references for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

revoke all on public.trip_booking_batches,public.payment_references from anon,authenticated;
grant select on public.trip_booking_batches to authenticated;
grant select,insert on public.payment_references to authenticated;
grant update(status,operator_note,confirmed_at) on public.payment_references to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-proofs','payment-proofs',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "payment_proofs_traveler_insert" on storage.objects for insert to authenticated
with check (bucket_id='payment-proofs' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "payment_proofs_participant_select" on storage.objects for select to authenticated
using (bucket_id='payment-proofs' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.payment_references pr where pr.proof_path=name and (pr.operator_id=auth.uid() or (select private.is_admin())))));

comment on table public.payment_references is 'Customer-submitted proof/reference for a direct payment to one operator. Visit Baa never receives or holds funds.';
