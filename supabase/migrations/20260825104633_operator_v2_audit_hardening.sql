-- Operator V2 audit hardening.
-- Finance privacy, safe external-booking edits, and recurring-schedule state controls.

drop policy if exists enquiries_staff_select on public.booking_enquiries;
create policy enquiries_staff_select
on public.booking_enquiries for select to authenticated
using (
  private.has_business_permission(business_id,'reservations',auth.uid())
  or private.is_admin(auth.uid())
);

create or replace function public.operator_finance_payment_queue(p_business_id uuid)
returns table(
  payment_id uuid,booking_id uuid,booking_reference text,listing_title text,requested_date date,
  booking_status public.enquiry_status,booking_payment_status text,quoted_total numeric,quote_currency character(3),
  amount numeric,currency character(3),payment_method text,payment_date date,payment_reference text,proof_path text,
  customer_note text,reference_status text,operator_note text,reference_created_at timestamptz,
  service_payment_received_at timestamptz,service_payment_note text
)
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    private.has_business_permission(p_business_id,'finance',auth.uid())
    or private.has_business_permission(p_business_id,'reservations',auth.uid())
    or private.is_admin(auth.uid())
  ) then raise exception 'Finance access denied'; end if;
  return query
  select p.id,e.id,e.booking_reference,coalesce(e.listing_title_snapshot,l.title,'Booking')::text,
         e.requested_date,e.status,e.payment_status,e.quoted_total,e.quote_currency,p.amount,p.currency,
         p.payment_method,p.payment_date,p.payment_reference,p.proof_path,p.customer_note,p.status,
         p.operator_note,p.created_at,e.operator_payment_confirmed_at,e.operator_payment_note
  from public.payment_references p
  join public.booking_enquiries e on e.id=p.booking_id
  left join public.listings l on l.id=e.listing_id
  where e.business_id=p_business_id
  order by p.created_at desc;
end;
$$;
revoke all on function public.operator_finance_payment_queue(uuid) from public,anon;
grant execute on function public.operator_finance_payment_queue(uuid) to authenticated;

create or replace function public.operator_update_external_accommodation_booking(
  p_booking_id uuid,p_room_id uuid,p_source text,p_check_in_date date,p_check_out_date date,p_rooms integer,
  p_external_reference text default null,p_guest_name text default null,p_notes text default null
)
returns public.external_accommodation_bookings
language plpgsql security definer set search_path=''
as $$
declare
  v_booking public.external_accommodation_bookings;v_room public.accommodation_rooms;v_listing public.listings;
  v_day date;v_row public.room_availability;v_result public.external_accommodation_bookings;
  v_old_start date;v_old_end date;v_old_room uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_booking from public.external_accommodation_bookings where id=p_booking_id for update;
  if v_booking.id is null then raise exception 'External booking not found'; end if;
  if v_booking.status<>'active' then raise exception 'Only active external bookings can be edited'; end if;
  if not private.has_business_permission(v_booking.business_id,'reservations',auth.uid()) then raise exception 'External booking access denied'; end if;
  if p_source not in ('booking_com','agoda','direct','walk_in','other') then raise exception 'Choose a valid booking source'; end if;
  if p_check_in_date is null or p_check_out_date is null or p_check_out_date<=p_check_in_date then raise exception 'Check-out must be after check-in'; end if;
  if p_check_in_date<current_date then raise exception 'External bookings can only be changed to current or future stays'; end if;
  if coalesce(p_rooms,0)<1 then raise exception 'Rooms booked must be at least 1'; end if;
  select * into v_room from public.accommodation_rooms where id=p_room_id and is_active;
  if v_room.id is null then raise exception 'Room type not found'; end if;
  if p_rooms>v_room.quantity then raise exception 'Rooms booked exceed this room type quantity'; end if;
  select * into v_listing from public.listings where id=v_room.listing_id and category='accommodation';
  if v_listing.id is null or v_listing.business_id<>v_booking.business_id then raise exception 'Choose a room from the same business'; end if;
  if nullif(trim(coalesce(p_external_reference,'')),'') is not null and exists(
    select 1 from public.external_accommodation_bookings x
    where x.business_id=v_booking.business_id and x.id<>v_booking.id and x.source=p_source
      and lower(x.external_reference)=lower(trim(p_external_reference)) and x.status='active'
  ) then raise exception 'This external booking reference is already recorded'; end if;

  v_old_start:=v_booking.check_in_date;v_old_end:=v_booking.check_out_date;v_old_room:=v_booking.room_id;
  update public.external_accommodation_bookings set status='cancelled',updated_at=now() where id=v_booking.id;
  for v_day in select generate_series(v_old_start,v_old_end-1,interval '1 day')::date loop perform private.recalculate_room_inventory(v_old_room,v_day); end loop;
  for v_day in select generate_series(p_check_in_date,p_check_out_date-1,interval '1 day')::date loop
    v_row:=private.recalculate_room_inventory(p_room_id,v_day);
    if v_row.is_blocked or v_row.stop_sell or v_row.available_quantity<p_rooms then raise exception 'Not enough room inventory is available for the full updated stay'; end if;
  end loop;
  update public.external_accommodation_bookings
  set listing_id=v_listing.id,room_id=p_room_id,source=p_source,
      external_reference=nullif(trim(coalesce(p_external_reference,'')),''),guest_name=nullif(trim(coalesce(p_guest_name,'')),''),
      check_in_date=p_check_in_date,check_out_date=p_check_out_date,rooms_booked=p_rooms,notes=nullif(trim(coalesce(p_notes,'')),''),
      status='active',cancelled_at=null,updated_at=now()
  where id=v_booking.id returning * into v_result;
  for v_day in select generate_series(least(v_old_start,p_check_in_date),greatest(v_old_end,p_check_out_date)-1,interval '1 day')::date loop
    if v_old_room=p_room_id then perform private.recalculate_room_inventory(p_room_id,v_day);
    else
      if v_day>=v_old_start and v_day<v_old_end then perform private.recalculate_room_inventory(v_old_room,v_day); end if;
      if v_day>=p_check_in_date and v_day<p_check_out_date then perform private.recalculate_room_inventory(p_room_id,v_day); end if;
    end if;
  end loop;
  perform private.log_inventory_movement(v_booking.business_id,v_listing.id,p_room_id,null,null,v_result.id,'external_booking_updated',0,null,p_source||coalesce(' · '||nullif(trim(coalesce(p_external_reference,'')),''),''));
  return v_result;
end;
$$;
revoke all on function public.operator_update_external_accommodation_booking(uuid,uuid,text,date,date,integer,text,text,text) from public,anon;
grant execute on function public.operator_update_external_accommodation_booking(uuid,uuid,text,date,date,integer,text,text,text) to authenticated;

create or replace function public.operator_set_schedule_rule_state(p_rule_id uuid,p_active boolean)
returns public.listing_schedule_rules language plpgsql security definer set search_path=''
as $$
declare v_rule public.listing_schedule_rules;v_av public.availability;v_until date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_rule from public.listing_schedule_rules where id=p_rule_id for update;
  if v_rule.id is null then raise exception 'Schedule rule not found'; end if;
  if not private.has_business_permission((select business_id from public.listings where id=v_rule.listing_id),'calendar',auth.uid()) then raise exception 'Schedule access denied'; end if;
  update public.listing_schedule_rules set is_active=p_active,updated_at=now() where id=p_rule_id returning * into v_rule;
  v_until:=least(coalesce(v_rule.valid_until,current_date+365),current_date+365);
  if p_active then perform public.operator_generate_listing_schedule(v_rule.listing_id,greatest(current_date,v_rule.valid_from),v_until);
  else
    for v_av in select * from public.availability where listing_id=v_rule.listing_id and available_date>=greatest(current_date,v_rule.valid_from) and available_date<=v_until and extract(dow from available_date)::smallint=v_rule.day_of_week and start_time=v_rule.start_time for update loop
      update public.availability set stop_sell=true,is_blocked=true,updated_at=now() where id=v_av.id;perform private.recalculate_availability_inventory(v_av.id);
    end loop;
  end if;
  return v_rule;
end;
$$;
revoke all on function public.operator_set_schedule_rule_state(uuid,boolean) from public,anon;
grant execute on function public.operator_set_schedule_rule_state(uuid,boolean) to authenticated;

create or replace function public.operator_delete_schedule_rule(p_rule_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_rule public.listing_schedule_rules;v_av public.availability;v_until date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_rule from public.listing_schedule_rules where id=p_rule_id for update;
  if v_rule.id is null then return false; end if;
  if not private.has_business_permission((select business_id from public.listings where id=v_rule.listing_id),'calendar',auth.uid()) then raise exception 'Schedule access denied'; end if;
  v_until:=least(coalesce(v_rule.valid_until,current_date+365),current_date+365);
  for v_av in select * from public.availability where listing_id=v_rule.listing_id and available_date>=greatest(current_date,v_rule.valid_from) and available_date<=v_until and extract(dow from available_date)::smallint=v_rule.day_of_week and start_time=v_rule.start_time for update loop
    update public.availability set stop_sell=true,is_blocked=true,updated_at=now() where id=v_av.id;perform private.recalculate_availability_inventory(v_av.id);
  end loop;
  delete from public.listing_schedule_rules where id=p_rule_id;return true;
end;
$$;
revoke all on function public.operator_delete_schedule_rule(uuid) from public,anon;
grant execute on function public.operator_delete_schedule_rule(uuid) to authenticated;
