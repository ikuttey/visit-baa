create extension if not exists pg_net;

create table if not exists public.operator_notifications (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  type text not null check (type in (
    'booking_request','booking_cancelled','customer_message','payment_reference',
    'business_verified','business_changes_requested','business_rejected','business_suspended',
    'listing_published','listing_changes_requested','listing_rejected'
  )),
  title text not null,
  message text not null,
  booking_id uuid references public.booking_enquiries(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  payment_reference_id uuid references public.payment_references(id) on delete set null,
  action_url text,
  is_read boolean not null default false,
  read_at timestamptz,
  email_status text not null default 'pending' check (email_status in ('pending','sent','skipped','failed')),
  email_sent_at timestamptz,
  email_error text,
  created_at timestamptz not null default now()
);

create index if not exists operator_notifications_operator_created_idx
  on public.operator_notifications(operator_id, created_at desc);
create index if not exists operator_notifications_operator_unread_idx
  on public.operator_notifications(operator_id, is_read, created_at desc);
create index if not exists operator_notifications_business_idx
  on public.operator_notifications(business_id, created_at desc);
create index if not exists operator_notifications_booking_idx
  on public.operator_notifications(booking_id) where booking_id is not null;

alter table public.operator_notifications enable row level security;
revoke all on public.operator_notifications from anon, authenticated;
grant select on public.operator_notifications to authenticated;

drop policy if exists operator_notifications_select_own on public.operator_notifications;
create policy operator_notifications_select_own
on public.operator_notifications for select
to authenticated
using ((select auth.uid()) = operator_id or (select private.is_admin()));

create or replace function public.mark_operator_notification_read(p_notification_id uuid)
returns public.operator_notifications
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.operator_notifications;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.operator_notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where id = p_notification_id
    and (operator_id = auth.uid() or private.is_admin(auth.uid()))
  returning * into v_row;
  if v_row.id is null then raise exception 'Notification not found'; end if;
  return v_row;
end;
$$;
revoke all on function public.mark_operator_notification_read(uuid) from public, anon;
grant execute on function public.mark_operator_notification_read(uuid) to authenticated;

create or replace function public.mark_all_operator_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.operator_notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where operator_id = auth.uid() and not is_read;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.mark_all_operator_notifications_read() from public, anon;
grant execute on function public.mark_all_operator_notifications_read() to authenticated;

create table if not exists private.notification_delivery_config (
  singleton boolean primary key default true check (singleton),
  edge_function_url text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
revoke all on private.notification_delivery_config from public, anon, authenticated;
insert into private.notification_delivery_config(singleton, edge_function_url, enabled)
values (true, null, false)
on conflict (singleton) do nothing;

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
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_operator_id is null then return null; end if;
  insert into public.operator_notifications(
    operator_id,business_id,type,title,message,booking_id,listing_id,payment_reference_id,action_url
  ) values (
    p_operator_id,p_business_id,p_type,left(p_title,180),left(p_message,2000),
    p_booking_id,p_listing_id,p_payment_reference_id,p_action_url
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.create_operator_notification(uuid,uuid,text,text,text,uuid,uuid,uuid,text) from public, anon, authenticated;

create or replace function private.notify_booking_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_title text; v_message text;
begin
  v_title := case when new.check_out_date is not null then 'New availability request' else 'New booking request' end;
  v_message := case
    when new.check_out_date is not null then
      coalesce(new.guest_full_name,'A traveler') || ' requested ' || new.rooms_requested || ' room' || case when new.rooms_requested=1 then '' else 's' end ||
      ' from ' || to_char(new.requested_date,'DD Mon YYYY') || ' to ' || to_char(new.check_out_date,'DD Mon YYYY') || '.'
    else
      coalesce(new.guest_full_name,'A traveler') || ' requested ' || new.guest_count || ' guest' || case when new.guest_count=1 then '' else 's' end ||
      ' for ' || to_char(new.requested_date,'DD Mon YYYY') || '.'
  end;
  perform private.create_operator_notification(
    new.operator_id,new.business_id,'booking_request',v_title,v_message,
    new.id,new.listing_id,null,'operator-dashboard.html?tab=enquiries&booking='||new.id::text
  );
  return new;
end;
$$;

create or replace function private.notify_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status::text='cancelled' and old.status is distinct from new.status
     and (auth.uid() is null or auth.uid() is distinct from new.operator_id) then
    perform private.create_operator_notification(
      new.operator_id,new.business_id,'booking_cancelled','Booking cancelled',
      coalesce(new.guest_full_name,'A traveler') || ' cancelled the request for ' || to_char(new.requested_date,'DD Mon YYYY') || '.',
      new.id,new.listing_id,null,'operator-dashboard.html?tab=enquiries&booking='||new.id::text
    );
  end if;
  return new;
end;
$$;

create or replace function private.notify_customer_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_booking public.booking_enquiries;
begin
  select * into v_booking from public.booking_enquiries where id=new.enquiry_id;
  if v_booking.id is not null and new.sender_id is distinct from v_booking.operator_id then
    perform private.create_operator_notification(
      v_booking.operator_id,v_booking.business_id,'customer_message','New customer message',
      'A traveler sent a message about ' || coalesce(v_booking.listing_title_snapshot,'their booking request') || '.',
      v_booking.id,v_booking.listing_id,null,'operator-dashboard.html?tab=enquiries&booking='||v_booking.id::text
    );
  end if;
  return new;
end;
$$;

create or replace function private.notify_payment_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_id uuid; v_listing_title text;
begin
  select be.business_id, coalesce(be.listing_title_snapshot,l.title)
    into v_business_id,v_listing_title
  from public.booking_enquiries be
  left join public.listings l on l.id=be.listing_id
  where be.id=new.booking_id;
  perform private.create_operator_notification(
    new.operator_id,v_business_id,'payment_reference','New payment reference',
    'Payment reference '||new.payment_reference||' for '||trim(to_char(new.amount,'FM999999990.00'))||' '||trim(new.currency)||
      case when v_listing_title is not null then ' · '||v_listing_title else '' end||'.',
    new.booking_id,new.listing_id,new.id,'operator-dashboard.html?tab=enquiries&booking='||new.booking_id::text
  );
  return new;
end;
$$;

create or replace function private.notify_business_review_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_type text; v_title text; v_message text;
begin
  if old.status is not distinct from new.status or auth.uid() = new.owner_id then return new; end if;
  case new.status::text
    when 'verified' then v_type:='business_verified'; v_title:='Business approved'; v_message:=new.business_name||' is verified on Visit Baa.';
    when 'changes_requested' then v_type:='business_changes_requested'; v_title:='Business changes requested'; v_message:='Visit Baa requested changes to '||new.business_name||'.';
    when 'rejected' then v_type:='business_rejected'; v_title:='Business registration rejected'; v_message:=new.business_name||' was not approved.';
    when 'suspended' then v_type:='business_suspended'; v_title:='Business suspended'; v_message:=new.business_name||' has been suspended.';
    else return new;
  end case;
  perform private.create_operator_notification(
    new.owner_id,new.id,v_type,v_title,v_message,null,null,null,'operator-dashboard.html?tab=business&business='||new.id::text
  );
  return new;
end;
$$;

create or replace function private.notify_listing_review_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_owner uuid; v_type text; v_title text; v_message text;
begin
  if old.status is not distinct from new.status then return new; end if;
  select owner_id into v_owner from public.businesses where id=new.business_id;
  if v_owner is null or auth.uid() = v_owner then return new; end if;
  case new.status::text
    when 'published' then v_type:='listing_published'; v_title:='Listing approved'; v_message:=new.title||' is now published on Visit Baa.';
    when 'changes_requested' then v_type:='listing_changes_requested'; v_title:='Listing changes requested'; v_message:='Visit Baa requested changes to '||new.title||'.';
    when 'rejected' then v_type:='listing_rejected'; v_title:='Listing rejected'; v_message:=new.title||' was not approved.';
    else return new;
  end case;
  perform private.create_operator_notification(
    v_owner,new.business_id,v_type,v_title,v_message,null,new.id,null,'operator-dashboard.html?tab=listings&listing='||new.id::text
  );
  return new;
end;
$$;

revoke all on function private.notify_booking_created() from public, anon, authenticated;
revoke all on function private.notify_booking_status_change() from public, anon, authenticated;
revoke all on function private.notify_customer_message() from public, anon, authenticated;
revoke all on function private.notify_payment_reference() from public, anon, authenticated;
revoke all on function private.notify_business_review_change() from public, anon, authenticated;
revoke all on function private.notify_listing_review_change() from public, anon, authenticated;

drop trigger if exists booking_enquiries_notify_operator_insert on public.booking_enquiries;
create trigger booking_enquiries_notify_operator_insert
after insert on public.booking_enquiries
for each row execute function private.notify_booking_created();

drop trigger if exists booking_enquiries_notify_operator_cancel on public.booking_enquiries;
create trigger booking_enquiries_notify_operator_cancel
after update of status on public.booking_enquiries
for each row execute function private.notify_booking_status_change();

drop trigger if exists enquiry_messages_notify_operator on public.enquiry_messages;
create trigger enquiry_messages_notify_operator
after insert on public.enquiry_messages
for each row execute function private.notify_customer_message();

drop trigger if exists payment_references_notify_operator on public.payment_references;
create trigger payment_references_notify_operator
after insert on public.payment_references
for each row execute function private.notify_payment_reference();

drop trigger if exists businesses_notify_operator_review on public.businesses;
create trigger businesses_notify_operator_review
after update of status on public.businesses
for each row execute function private.notify_business_review_change();

drop trigger if exists listings_notify_operator_review on public.listings;
create trigger listings_notify_operator_review
after update of status on public.listings
for each row execute function private.notify_listing_review_change();

create or replace function private.dispatch_operator_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_url text; v_enabled boolean;
begin
  select edge_function_url,enabled into v_url,v_enabled
  from private.notification_delivery_config where singleton=true;
  if coalesce(v_enabled,false) and nullif(v_url,'') is not null then
    perform net.http_post(
      url := v_url,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('notification_id',new.id),
      timeout_milliseconds := 3000
    );
  end if;
  return new;
end;
$$;
revoke all on function private.dispatch_operator_notification_email() from public, anon, authenticated;

drop trigger if exists operator_notifications_dispatch_email on public.operator_notifications;
create trigger operator_notifications_dispatch_email
after insert on public.operator_notifications
for each row execute function private.dispatch_operator_notification_email();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='operator_notifications'
  ) then
    alter publication supabase_realtime add table public.operator_notifications;
  end if;
end $$;
