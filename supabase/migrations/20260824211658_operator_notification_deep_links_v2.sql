create or replace function private.notify_booking_created()
returns trigger
language plpgsql
security definer
set search_path=''
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
    new.id,new.listing_id,null,'operator-reservations.html?id='||new.id::text
  );
  return new;
end;
$$;

create or replace function private.notify_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status::text='cancelled' and old.status is distinct from new.status
     and (auth.uid() is null or auth.uid() is distinct from new.operator_id) then
    perform private.create_operator_notification(
      new.operator_id,new.business_id,'booking_cancelled','Booking cancelled',
      coalesce(new.guest_full_name,'A traveler') || ' cancelled the request for ' || to_char(new.requested_date,'DD Mon YYYY') || '.',
      new.id,new.listing_id,null,'operator-reservations.html?id='||new.id::text
    );
  end if;
  return new;
end;
$$;

create or replace function private.notify_payment_reference()
returns trigger
language plpgsql
security definer
set search_path=''
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
    new.booking_id,new.listing_id,new.id,'operator-reservations.html?id='||new.booking_id::text
  );
  return new;
end;
$$;

create or replace function private.notify_customer_message()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_booking public.booking_enquiries;
begin
  select * into v_booking from public.booking_enquiries where id=new.enquiry_id;
  if v_booking.id is not null and new.sender_id is distinct from v_booking.operator_id then
    perform private.create_operator_notification(
      v_booking.operator_id,v_booking.business_id,'customer_message','New customer message',
      'A traveler sent a message about ' || coalesce(v_booking.listing_title_snapshot,'their booking request') || '.',
      v_booking.id,v_booking.listing_id,null,'operator-reservations.html?id='||v_booking.id::text
    );
  end if;
  return new;
end;
$$;