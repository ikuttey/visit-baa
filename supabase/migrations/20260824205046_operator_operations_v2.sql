create table if not exists public.booking_history (
  id bigint generated always as identity primary key,
  enquiry_id uuid not null references public.booking_enquiries(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists booking_history_enquiry_created_idx on public.booking_history(enquiry_id,created_at desc);
create index if not exists booking_history_business_created_idx on public.booking_history(business_id,created_at desc);
alter table public.booking_history enable row level security;
drop policy if exists booking_history_participants_select on public.booking_history;
create policy booking_history_participants_select
on public.booking_history for select to authenticated
using ((select private.can_access_enquiry(enquiry_id)) or (select private.is_admin()));
revoke insert,update,delete on public.booking_history from anon,authenticated;
grant select on public.booking_history to authenticated;

create or replace function private.append_booking_history(
  p_enquiry_id uuid,
  p_event_type text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v public.booking_enquiries;
begin
  select * into v from public.booking_enquiries where id=p_enquiry_id;
  if v.id is null then return; end if;
  insert into public.booking_history(enquiry_id,business_id,listing_id,event_type,actor_id,detail)
  values(v.id,v.business_id,v.listing_id,left(p_event_type,80),auth.uid(),coalesce(p_detail,'{}'::jsonb));
end;
$$;

create or replace function private.booking_history_on_insert()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.append_booking_history(new.id,'request_created',jsonb_build_object(
    'status',new.status,'guest_count',new.guest_count,'quoted_total',new.quoted_total,'currency',new.quote_currency
  ));
  return new;
end;
$$;

create or replace function private.booking_history_on_update()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    perform private.append_booking_history(new.id,'status_changed',jsonb_build_object('from',old.status,'to',new.status));
  end if;
  if new.hold_status is distinct from old.hold_status or new.hold_expires_at is distinct from old.hold_expires_at then
    perform private.append_booking_history(new.id,'inventory_hold_changed',jsonb_build_object(
      'from',old.hold_status,'to',new.hold_status,'expires_at',new.hold_expires_at
    ));
  end if;
  if new.payment_status is distinct from old.payment_status or new.balance_due is distinct from old.balance_due then
    perform private.append_booking_history(new.id,'payment_status_changed',jsonb_build_object(
      'from',old.payment_status,'to',new.payment_status,'balance_due',new.balance_due
    ));
  end if;
  if new.quote_status is distinct from old.quote_status or new.quoted_total is distinct from old.quoted_total then
    perform private.append_booking_history(new.id,'quote_changed',jsonb_build_object(
      'quote_status',new.quote_status,'quoted_total',new.quoted_total,'currency',new.quote_currency
    ));
  end if;
  if new.internal_note is distinct from old.internal_note then
    perform private.append_booking_history(new.id,'internal_note_updated','{}'::jsonb);
  end if;
  if new.operator_payment_confirmed_at is distinct from old.operator_payment_confirmed_at then
    perform private.append_booking_history(new.id,'operator_payment_recorded',jsonb_build_object(
      'confirmed_at',new.operator_payment_confirmed_at
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists booking_enquiries_history_insert on public.booking_enquiries;
create trigger booking_enquiries_history_insert after insert on public.booking_enquiries
for each row execute function private.booking_history_on_insert();
drop trigger if exists booking_enquiries_history_update on public.booking_enquiries;
create trigger booking_enquiries_history_update after update on public.booking_enquiries
for each row execute function private.booking_history_on_update();

create or replace function private.payment_reference_history()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    perform private.append_booking_history(new.booking_id,'payment_reference_submitted',jsonb_build_object(
      'payment_reference_id',new.id,'amount',new.amount,'currency',new.currency,'method',new.payment_method
    ));
  elsif new.status is distinct from old.status then
    perform private.append_booking_history(new.booking_id,'payment_reference_reviewed',jsonb_build_object(
      'payment_reference_id',new.id,'from',old.status,'to',new.status
    ));
  end if;
  return new;
end;
$$;
drop trigger if exists payment_references_history_insert on public.payment_references;
create trigger payment_references_history_insert after insert on public.payment_references
for each row execute function private.payment_reference_history();
drop trigger if exists payment_references_history_update on public.payment_references;
create trigger payment_references_history_update after update on public.payment_references
for each row execute function private.payment_reference_history();

create table if not exists public.operator_audit_log (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists operator_audit_business_created_idx on public.operator_audit_log(business_id,created_at desc);
create index if not exists operator_audit_listing_created_idx on public.operator_audit_log(listing_id,created_at desc) where listing_id is not null;
alter table public.operator_audit_log enable row level security;
drop policy if exists operator_audit_log_owner_select on public.operator_audit_log;
create policy operator_audit_log_owner_select
on public.operator_audit_log for select to authenticated
using (
  (select private.is_admin()) or exists(
    select 1 from public.businesses b where b.id=business_id and b.owner_id=(select auth.uid())
  )
);
revoke insert,update,delete on public.operator_audit_log from anon,authenticated;
grant select on public.operator_audit_log to authenticated;

create or replace function private.audit_operator_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_business_id uuid;
  v_listing_id uuid;
  v_entity_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  v_old:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;

  if tg_table_name='businesses' then
    v_business_id:=coalesce(new.id,old.id); v_entity_id:=v_business_id;
  elsif tg_table_name='listings' then
    v_business_id:=coalesce(new.business_id,old.business_id);
    v_listing_id:=coalesce(new.id,old.id); v_entity_id:=v_listing_id;
  elsif tg_table_name='accommodation_rooms' then
    v_entity_id:=coalesce(new.id,old.id);
    select l.id,l.business_id into v_listing_id,v_business_id
    from public.listings l where l.id=coalesce(new.listing_id,old.listing_id);
  elsif tg_table_name='room_rate_plans' then
    v_entity_id:=coalesce(new.id,old.id);
    select l.id,l.business_id into v_listing_id,v_business_id
    from public.accommodation_rooms r join public.listings l on l.id=r.listing_id
    where r.id=coalesce(new.room_id,old.room_id);
  elsif tg_table_name='listing_policies' then
    v_listing_id:=coalesce(new.listing_id,old.listing_id); v_entity_id:=v_listing_id;
    select business_id into v_business_id from public.listings where id=v_listing_id;
  elsif tg_table_name='promotions' then
    v_entity_id:=coalesce(new.id,old.id); v_listing_id:=coalesce(new.listing_id,old.listing_id);
    select business_id into v_business_id from public.listings where id=v_listing_id;
  else
    return coalesce(new,old);
  end if;

  if v_business_id is not null then
    insert into public.operator_audit_log(business_id,listing_id,actor_id,entity_type,entity_id,action,changes)
    values(v_business_id,v_listing_id,auth.uid(),tg_table_name,v_entity_id,lower(tg_op),jsonb_build_object('before',v_old,'after',v_new));
  end if;
  return coalesce(new,old);
end;
$$;

do $$ declare t text; begin
  foreach t in array array['businesses','listings','accommodation_rooms','room_rate_plans','listing_policies','promotions'] loop
    execute format('drop trigger if exists %I on public.%I','audit_'||t,t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_operator_change()','audit_'||t,t);
  end loop;
end $$;

create table if not exists public.listing_views (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings(id) on delete cascade,
  visitor_key uuid not null,
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique(listing_id,visitor_key,viewed_on)
);
create index if not exists listing_views_listing_date_idx on public.listing_views(listing_id,viewed_on desc);
alter table public.listing_views enable row level security;
drop policy if exists listing_views_operator_select on public.listing_views;
create policy listing_views_operator_select
on public.listing_views for select to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()));
revoke insert,update,delete on public.listing_views from anon,authenticated;
grant select on public.listing_views to authenticated;

create or replace function public.track_listing_view(p_listing_id uuid,p_visitor_key uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_visitor_key is null or not private.is_public_listing(p_listing_id) then return false; end if;
  insert into public.listing_views(listing_id,visitor_key)
  values(p_listing_id,p_visitor_key)
  on conflict(listing_id,visitor_key,viewed_on) do nothing;
  return true;
end;
$$;
revoke all on function public.track_listing_view(uuid,uuid) from public;
grant execute on function public.track_listing_view(uuid,uuid) to anon,authenticated;

create table if not exists public.operator_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  enabled_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct(operator_id,business_id)
);
alter table public.operator_notification_preferences enable row level security;
drop policy if exists operator_notification_preferences_own on public.operator_notification_preferences;
create policy operator_notification_preferences_own
on public.operator_notification_preferences for all to authenticated
using (operator_id=(select auth.uid()) or (select private.is_admin()))
with check (operator_id=(select auth.uid()) or (select private.is_admin()));
grant select,insert,update,delete on public.operator_notification_preferences to authenticated;

alter table public.operator_notifications add column if not exists in_app_visible boolean not null default true;

create or replace function private.create_operator_notification(
  p_operator_id uuid,
  p_business_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_booking_id uuid default null,
  p_listing_id uuid default null,
  p_payment_reference_id uuid default null,
  p_action_url text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_pref public.operator_notification_preferences;
  v_in_app boolean := true;
  v_email boolean := true;
  v_enabled boolean := true;
begin
  if p_operator_id is null then return null; end if;

  select * into v_pref
  from public.operator_notification_preferences
  where operator_id=p_operator_id and business_id is not distinct from p_business_id;

  if v_pref.id is null then
    select * into v_pref
    from public.operator_notification_preferences
    where operator_id=p_operator_id and business_id is null;
  end if;

  if v_pref.id is not null then
    v_in_app:=v_pref.in_app_enabled;
    v_email:=v_pref.email_enabled;
    v_enabled:=v_pref.enabled_types is null or p_type=any(v_pref.enabled_types);
  end if;

  if not v_enabled then return null; end if;

  insert into public.operator_notifications(
    operator_id,business_id,type,title,message,booking_id,listing_id,payment_reference_id,
    action_url,email_status,in_app_visible,is_read,read_at
  ) values (
    p_operator_id,p_business_id,p_type,left(p_title,180),left(p_message,2000),
    p_booking_id,p_listing_id,p_payment_reference_id,p_action_url,
    case when v_email then 'pending' else 'skipped' end,
    v_in_app,not v_in_app,case when v_in_app then null else now() end
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.dispatch_operator_notification_email()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_url text; v_enabled boolean;
begin
  if new.email_status<>'pending' then return new; end if;
  select edge_function_url,enabled into v_url,v_enabled
  from private.notification_delivery_config where singleton=true;
  if coalesce(v_enabled,false) and nullif(v_url,'') is not null then
    perform net.http_post(
      url:=v_url,
      headers:='{"Content-Type":"application/json"}'::jsonb,
      body:=jsonb_build_object('notification_id',new.id),
      timeout_milliseconds:=3000
    );
  end if;
  return new;
end;
$$;

create or replace function public.operator_update_booking_note(p_enquiry_id uuid,p_note text)
returns public.booking_enquiries
language plpgsql
security definer
set search_path=''
as $$
declare v public.booking_enquiries;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v from public.booking_enquiries where id=p_enquiry_id for update;
  if v.id is null then raise exception 'Booking not found'; end if;
  if v.operator_id<>auth.uid() and not private.is_admin(auth.uid()) then raise exception 'Booking access denied'; end if;
  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries set internal_note=nullif(trim(coalesce(p_note,'')),'') where id=p_enquiry_id returning * into v;
  return v;
end;
$$;

create or replace function public.operator_review_payment_reference(p_reference_id uuid,p_status text,p_note text default null)
returns public.payment_references
language plpgsql
security definer
set search_path=''
as $$
declare v public.payment_references;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('confirmed','rejected') then raise exception 'Payment status must be confirmed or rejected'; end if;
  select * into v from public.payment_references where id=p_reference_id for update;
  if v.id is null then raise exception 'Payment reference not found'; end if;
  if v.operator_id<>auth.uid() and not private.is_admin(auth.uid()) then raise exception 'Payment access denied'; end if;
  if v.status not in ('submitted','rejected') and p_status='confirmed' then raise exception 'This payment reference cannot be confirmed from its current state'; end if;
  update public.payment_references
  set status=p_status,operator_note=nullif(trim(coalesce(p_note,'')),''),confirmed_at=case when p_status='confirmed' then now() else null end
  where id=p_reference_id returning * into v;
  return v;
end;
$$;

create or replace function public.operator_record_service_payment(p_enquiry_id uuid,p_received boolean,p_note text default null)
returns public.booking_enquiries
language plpgsql
security definer
set search_path=''
as $$
declare v public.booking_enquiries;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v from public.booking_enquiries where id=p_enquiry_id for update;
  if v.id is null then raise exception 'Booking not found'; end if;
  if v.operator_id<>auth.uid() and not private.is_admin(auth.uid()) then raise exception 'Booking access denied'; end if;
  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries
  set operator_payment_confirmed_at=case when p_received then now() else null end,
      operator_payment_note=nullif(trim(coalesce(p_note,'')),'')
  where id=p_enquiry_id returning * into v;
  return v;
end;
$$;

revoke all on function public.operator_update_booking_note(uuid,text) from public;
revoke all on function public.operator_review_payment_reference(uuid,text,text) from public;
revoke all on function public.operator_record_service_payment(uuid,boolean,text) from public;
grant execute on function public.operator_update_booking_note(uuid,text) to authenticated;
grant execute on function public.operator_review_payment_reference(uuid,text,text) to authenticated;
grant execute on function public.operator_record_service_payment(uuid,boolean,text) to authenticated;

create or replace function public.operator_business_analytics(p_business_id uuid,p_from date,p_to date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_business public.businesses;
  v_from date:=coalesce(p_from,current_date-29);
  v_to date:=coalesce(p_to,current_date);
  v_bookings integer;
  v_confirmed integer;
  v_cancelled integer;
  v_revenue numeric;
  v_room_nights numeric;
  v_sellable_room_nights numeric;
  v_views integer;
  v_avg_stay numeric;
  v_avg_lead numeric;
  v_arrivals integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_to<v_from then raise exception 'End date must not be before start date'; end if;
  select * into v_business from public.businesses where id=p_business_id;
  if v_business.id is null then raise exception 'Business not found'; end if;
  if v_business.owner_id<>auth.uid() and not private.is_admin(auth.uid()) then raise exception 'Analytics access denied'; end if;

  select count(*),
         count(*) filter(where status in ('confirmed','completed','no_show')),
         count(*) filter(where status='cancelled'),
         coalesce(sum(quoted_total) filter(where status in ('confirmed','completed','no_show')),0),
         coalesce(sum(case when check_out_date is not null and status in ('confirmed','completed','no_show') then (check_out_date-requested_date)*rooms_requested else 0 end),0),
         coalesce(avg(case when check_out_date is not null and status in ('confirmed','completed','no_show') then check_out_date-requested_date end),0),
         coalesce(avg(greatest(0,requested_date-created_at::date)) filter(where status in ('accepted','confirmed','completed','no_show')),0),
         count(*) filter(where requested_date=current_date and status in ('accepted','confirmed'))
  into v_bookings,v_confirmed,v_cancelled,v_revenue,v_room_nights,v_avg_stay,v_avg_lead,v_arrivals
  from public.booking_enquiries
  where business_id=p_business_id and requested_date between v_from and v_to;

  select coalesce(sum(ra.sellable_quantity),0)
  into v_sellable_room_nights
  from public.room_availability ra
  join public.accommodation_rooms r on r.id=ra.room_id
  join public.listings l on l.id=r.listing_id
  where l.business_id=p_business_id and ra.available_date between v_from and v_to;

  select count(*) into v_views
  from public.listing_views lv join public.listings l on l.id=lv.listing_id
  where l.business_id=p_business_id and lv.viewed_on between v_from and v_to;

  return jsonb_build_object(
    'from',v_from,'to',v_to,'bookings',v_bookings,'confirmed_bookings',v_confirmed,
    'cancelled_bookings',v_cancelled,'confirmed_revenue',round(v_revenue,2),
    'room_nights',v_room_nights,'sellable_room_nights',v_sellable_room_nights,
    'occupancy_percent',case when v_sellable_room_nights>0 then round(100*v_room_nights/v_sellable_room_nights,1) else null end,
    'adr',case when v_room_nights>0 then round(v_revenue/v_room_nights,2) else null end,
    'cancellation_rate',case when v_bookings>0 then round(100*v_cancelled::numeric/v_bookings,1) else 0 end,
    'average_stay',round(coalesce(v_avg_stay,0),1),'average_lead_days',round(coalesce(v_avg_lead,0),1),
    'listing_views',v_views,'conversion_percent',case when v_views>0 then round(100*v_confirmed::numeric/v_views,2) else 0 end,
    'arrivals_today',v_arrivals
  );
end;
$$;

create or replace function public.operator_listing_analytics(p_business_id uuid,p_from date,p_to date)
returns table(listing_id uuid,title text,category text,views bigint,enquiries bigint,confirmed bigint,revenue numeric,conversion_percent numeric)
language plpgsql
security definer
set search_path=''
as $$
declare v_business public.businesses; v_from date:=coalesce(p_from,current_date-29); v_to date:=coalesce(p_to,current_date);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_business from public.businesses where id=p_business_id;
  if v_business.id is null then raise exception 'Business not found'; end if;
  if v_business.owner_id<>auth.uid() and not private.is_admin(auth.uid()) then raise exception 'Analytics access denied'; end if;
  return query
  select l.id,l.title,l.category::text,
    coalesce(v.cnt,0),coalesce(b.enquiries,0),coalesce(b.confirmed,0),coalesce(b.revenue,0),
    case when coalesce(v.cnt,0)>0 then round(100*coalesce(b.confirmed,0)::numeric/v.cnt,2) else 0 end
  from public.listings l
  left join lateral (select count(*) cnt from public.listing_views x where x.listing_id=l.id and x.viewed_on between v_from and v_to) v on true
  left join lateral (
    select count(*) enquiries,
      count(*) filter(where status in ('confirmed','completed','no_show')) confirmed,
      coalesce(sum(quoted_total) filter(where status in ('confirmed','completed','no_show')),0) revenue
    from public.booking_enquiries x where x.listing_id=l.id and x.requested_date between v_from and v_to
  ) b on true
  where l.business_id=p_business_id
  order by coalesce(b.revenue,0) desc,l.title;
end;
$$;
revoke all on function public.operator_business_analytics(uuid,date,date) from public;
revoke all on function public.operator_listing_analytics(uuid,date,date) from public;
grant execute on function public.operator_business_analytics(uuid,date,date) to authenticated;
grant execute on function public.operator_listing_analytics(uuid,date,date) to authenticated;