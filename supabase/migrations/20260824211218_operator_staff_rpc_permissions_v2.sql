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
declare v_enquiry public.booking_enquiries;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform private.expire_booking_holds();
  select * into v_enquiry from public.booking_enquiries where id=p_enquiry_id for update;
  if v_enquiry.id is null then raise exception 'Booking request not found'; end if;
  if not private.has_business_permission(v_enquiry.business_id,'reservations',auth.uid()) then raise exception 'Booking access denied'; end if;
  if not (
    (v_enquiry.status='new' and p_status in ('accepted','declined','changes_requested','cancelled'))
    or (v_enquiry.status in ('accepted','changes_requested') and p_status in ('confirmed','declined','changes_requested','cancelled','accepted'))
    or (v_enquiry.status='confirmed' and p_status in ('completed','cancelled','no_show'))
  ) then raise exception 'Invalid booking status transition'; end if;
  if p_status='accepted' and v_enquiry.status<>'accepted' then
    perform private.create_booking_hold(p_enquiry_id);
  elsif p_status in ('changes_requested','declined','cancelled') and v_enquiry.status='accepted' then
    perform private.release_booking_hold(p_enquiry_id,'released','Booking moved from accepted to '||p_status::text);
  elsif p_status='confirmed' then
    perform private.convert_booking_hold(p_enquiry_id);
  elsif p_status='cancelled' and v_enquiry.status='confirmed' then
    perform private.release_confirmed_booking_inventory(p_enquiry_id,'Confirmed booking cancelled');
  end if;
  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries
  set status=p_status,
      operator_response=nullif(trim(coalesce(p_response,'')),''),
      confirmed_at=case when p_status='confirmed' then coalesce(confirmed_at,now()) else confirmed_at end,
      hold_status=case when p_status='confirmed' then 'converted' when p_status in ('declined','cancelled','changes_requested') and hold_status='active' then 'released' else hold_status end
  where id=p_enquiry_id returning * into v_enquiry;
  return v_enquiry;
end;
$$;

create or replace function public.operator_quote_booking(p_enquiry_id uuid,p_subtotal numeric,p_taxes numeric default 0,p_fees numeric default 0,p_response text default null)
returns public.booking_enquiries
language plpgsql security definer set search_path='' as $$
declare v_enquiry public.booking_enquiries; v_policy public.listing_policies; v_deposit numeric(5,2); v_total numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_enquiry from public.booking_enquiries where id=p_enquiry_id for update;
  if v_enquiry.id is null or not private.has_business_permission(v_enquiry.business_id,'reservations',auth.uid()) then raise exception 'Booking access denied'; end if;
  if v_enquiry.quote_status<>'availability_confirmation_required' or v_enquiry.status::text not in ('new','changes_requested') then raise exception 'This booking is not awaiting an operator quote'; end if;
  if p_subtotal is null or p_subtotal<0 or coalesce(p_taxes,0)<0 or coalesce(p_fees,0)<0 then raise exception 'Quote amounts must be zero or greater'; end if;
  select * into v_policy from public.listing_policies where listing_id=v_enquiry.listing_id;
  v_deposit:=case v_policy.payment_condition when 'prepayment_required' then 100 when 'deposit_required' then coalesce(v_policy.deposit_percentage,50) else 0 end;
  v_total:=round(p_subtotal+coalesce(p_taxes,0)+coalesce(p_fees,0),2);
  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries set quoted_subtotal=p_subtotal,taxes_amount=coalesce(p_taxes,0),fees_amount=coalesce(p_fees,0),quoted_total=v_total,quote_status='confirmed',operator_response=coalesce(nullif(trim(p_response),''),operator_response),deposit_percentage=v_deposit,deposit_amount=round(v_total*v_deposit/100,2),balance_due=v_total,payment_status=case when v_deposit=0 then 'not_required' else 'unpaid' end
  where id=p_enquiry_id returning * into v_enquiry;
  return v_enquiry;
end;
$$;

create or replace function public.operator_update_booking_note(p_enquiry_id uuid,p_note text)
returns public.booking_enquiries
language plpgsql security definer set search_path='' as $$
declare v public.booking_enquiries;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v from public.booking_enquiries where id=p_enquiry_id for update;
  if v.id is null then raise exception 'Booking not found'; end if;
  if not private.has_business_permission(v.business_id,'reservations',auth.uid()) then raise exception 'Booking access denied'; end if;
  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries set internal_note=nullif(trim(coalesce(p_note,'')),'') where id=p_enquiry_id returning * into v;
  return v;
end;
$$;

create or replace function public.operator_review_payment_reference(p_reference_id uuid,p_status text,p_note text default null)
returns public.payment_references
language plpgsql security definer set search_path='' as $$
declare v public.payment_references; v_business_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('confirmed','rejected') then raise exception 'Payment status must be confirmed or rejected'; end if;
  select * into v from public.payment_references where id=p_reference_id for update;
  if v.id is null then raise exception 'Payment reference not found'; end if;
  select business_id into v_business_id from public.listings where id=v.listing_id;
  if not (private.has_business_permission(v_business_id,'finance',auth.uid()) or private.has_business_permission(v_business_id,'reservations',auth.uid())) then raise exception 'Payment access denied'; end if;
  if v.status not in ('submitted','rejected') and p_status='confirmed' then raise exception 'This payment reference cannot be confirmed from its current state'; end if;
  update public.payment_references set status=p_status,operator_note=nullif(trim(coalesce(p_note,'')),''),confirmed_at=case when p_status='confirmed' then now() else null end where id=p_reference_id returning * into v;
  return v;
end;
$$;

create or replace function public.operator_record_service_payment(p_enquiry_id uuid,p_received boolean,p_note text default null)
returns public.booking_enquiries
language plpgsql security definer set search_path='' as $$
declare v public.booking_enquiries;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v from public.booking_enquiries where id=p_enquiry_id for update;
  if v.id is null then raise exception 'Booking not found'; end if;
  if not (private.has_business_permission(v.business_id,'finance',auth.uid()) or private.has_business_permission(v.business_id,'reservations',auth.uid())) then raise exception 'Booking access denied'; end if;
  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries set operator_payment_confirmed_at=case when p_received then now() else null end,operator_payment_note=nullif(trim(coalesce(p_note,'')),'') where id=p_enquiry_id returning * into v;
  return v;
end;
$$;

create or replace function public.operator_set_room_availability_range(p_room_id uuid,p_start_date date,p_end_date date,p_available_quantity integer default null,p_is_blocked boolean default false,p_price_override numeric default null)
returns integer language plpgsql security definer set search_path='' as $$
declare v_room public.accommodation_rooms; v_listing public.listings; v_business public.businesses; v_day date; v_requested integer; v_row public.room_availability; v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'Choose a valid date range'; end if;
  if p_start_date<current_date then raise exception 'Availability can only be changed for today or future dates'; end if;
  if p_price_override is not null and p_price_override<0 then raise exception 'Price override cannot be negative'; end if;
  select * into v_room from public.accommodation_rooms where id=p_room_id and is_active;
  if v_room.id is null then raise exception 'Room type not found'; end if;
  select * into v_listing from public.listings where id=v_room.listing_id and category='accommodation';
  select * into v_business from public.businesses where id=v_listing.business_id;
  if not private.has_business_permission(v_business.id,'calendar',auth.uid()) then raise exception 'Room availability access denied'; end if;
  v_requested:=coalesce(p_available_quantity,v_room.quantity);
  if v_requested<0 or v_requested>v_room.quantity then raise exception 'Rooms for sale must be between 0 and the room quantity'; end if;
  for v_day in select generate_series(p_start_date,p_end_date,interval '1 day')::date loop
    insert into public.room_availability(room_id,available_date,total_quantity,available_quantity,sellable_quantity,price_override,is_blocked)
    values(p_room_id,v_day,v_room.quantity,v_requested,v_requested,p_price_override,p_is_blocked)
    on conflict(room_id,available_date) do update set total_quantity=excluded.total_quantity,sellable_quantity=excluded.sellable_quantity,price_override=excluded.price_override,is_blocked=excluded.is_blocked,updated_at=now();
    v_row:=private.recalculate_room_inventory(p_room_id,v_day);
    perform private.log_inventory_movement(v_business.id,v_listing.id,v_room.id,null,null,null,'sellable_inventory_changed',0,v_row.available_quantity,'Sellable rooms set to '||v_requested::text||case when p_is_blocked then ' (blocked)' else '' end);
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.operator_set_room_calendar_range(p_room_id uuid,p_rate_plan_id uuid,p_start_date date,p_end_date date,p_sellable_quantity integer default null,p_price_override numeric default null,p_minimum_stay integer default null,p_maximum_stay integer default null,p_min_advance_hours integer default null,p_max_advance_days integer default null,p_closed_to_arrival boolean default false,p_closed_to_departure boolean default false,p_stop_sell boolean default false,p_is_blocked boolean default false)
returns integer language plpgsql security definer set search_path='' as $$
declare v_room public.accommodation_rooms; v_plan public.room_rate_plans; v_listing public.listings; v_business public.businesses; v_day date; v_count integer:=0; v_sellable integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'Choose a valid date range'; end if;
  if p_start_date<current_date then raise exception 'Calendar changes can only apply to today or future dates'; end if;
  if p_price_override is not null and p_price_override<0 then raise exception 'Price override cannot be negative'; end if;
  if p_minimum_stay is not null and p_minimum_stay<1 then raise exception 'Minimum stay must be at least 1'; end if;
  if p_maximum_stay is not null and p_maximum_stay<1 then raise exception 'Maximum stay must be at least 1'; end if;
  if p_minimum_stay is not null and p_maximum_stay is not null and p_maximum_stay<p_minimum_stay then raise exception 'Maximum stay cannot be lower than minimum stay'; end if;
  select * into v_room from public.accommodation_rooms where id=p_room_id and is_active;
  if v_room.id is null then raise exception 'Room type not found'; end if;
  select * into v_listing from public.listings where id=v_room.listing_id;
  select * into v_business from public.businesses where id=v_listing.business_id;
  if not private.has_business_permission(v_business.id,'calendar',auth.uid()) then raise exception 'Calendar access denied'; end if;
  if p_rate_plan_id is not null then select * into v_plan from public.room_rate_plans where id=p_rate_plan_id and room_id=p_room_id and is_active; if v_plan.id is null then raise exception 'Rate plan not found for this room'; end if; end if;
  v_sellable:=coalesce(p_sellable_quantity,v_room.quantity);
  if v_sellable<0 or v_sellable>v_room.quantity then raise exception 'Rooms for sale must be between 0 and the room quantity'; end if;
  for v_day in select generate_series(p_start_date,p_end_date,interval '1 day')::date loop
    if p_rate_plan_id is null then
      insert into public.room_availability(room_id,available_date,total_quantity,available_quantity,sellable_quantity,price_override,is_blocked,minimum_stay,maximum_stay,min_advance_hours,max_advance_days,closed_to_arrival,closed_to_departure,stop_sell)
      values(p_room_id,v_day,v_room.quantity,v_sellable,v_sellable,p_price_override,p_is_blocked,p_minimum_stay,p_maximum_stay,p_min_advance_hours,p_max_advance_days,p_closed_to_arrival,p_closed_to_departure,p_stop_sell)
      on conflict(room_id,available_date) do update set total_quantity=excluded.total_quantity,sellable_quantity=excluded.sellable_quantity,price_override=excluded.price_override,is_blocked=excluded.is_blocked,minimum_stay=excluded.minimum_stay,maximum_stay=excluded.maximum_stay,min_advance_hours=excluded.min_advance_hours,max_advance_days=excluded.max_advance_days,closed_to_arrival=excluded.closed_to_arrival,closed_to_departure=excluded.closed_to_departure,stop_sell=excluded.stop_sell,updated_at=now();
      perform private.recalculate_room_inventory(p_room_id,v_day);
    else
      insert into public.room_rate_calendar(room_id,rate_plan_id,available_date,price_override,minimum_stay,maximum_stay,min_advance_hours,max_advance_days,closed_to_arrival,closed_to_departure,stop_sell)
      values(p_room_id,p_rate_plan_id,v_day,p_price_override,p_minimum_stay,p_maximum_stay,p_min_advance_hours,p_max_advance_days,p_closed_to_arrival,p_closed_to_departure,p_stop_sell)
      on conflict(room_id,rate_plan_id,available_date) do update set price_override=excluded.price_override,minimum_stay=excluded.minimum_stay,maximum_stay=excluded.maximum_stay,min_advance_hours=excluded.min_advance_hours,max_advance_days=excluded.max_advance_days,closed_to_arrival=excluded.closed_to_arrival,closed_to_departure=excluded.closed_to_departure,stop_sell=excluded.stop_sell,updated_at=now();
    end if;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.operator_generate_listing_schedule(p_listing_id uuid,p_start_date date default current_date,p_end_date date default (current_date+365))
returns integer language plpgsql security definer set search_path='' as $$
declare v_listing public.listings; v_rule public.listing_schedule_rules; v_exception public.listing_schedule_exceptions; v_day date; v_start time; v_end time; v_capacity integer; v_cancelled boolean; v_count integer:=0; v_availability_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'Choose a valid date range'; end if;
  if p_end_date>p_start_date+366 then raise exception 'Generate at most 12 months at a time'; end if;
  select * into v_listing from public.listings where id=p_listing_id;
  if v_listing.id is null then raise exception 'Listing not found'; end if;
  if v_listing.category='accommodation' then raise exception 'Accommodation uses the room calendar'; end if;
  if not private.has_business_permission(v_listing.business_id,'calendar',auth.uid()) then raise exception 'Schedule access denied'; end if;
  for v_day in select generate_series(p_start_date,p_end_date,interval '1 day')::date loop
    for v_rule in select * from public.listing_schedule_rules where listing_id=p_listing_id and is_active and day_of_week=extract(dow from v_day)::smallint and v_day>=valid_from and (valid_until is null or v_day<=valid_until) order by start_time loop
      v_start:=v_rule.start_time;v_end:=v_rule.end_time;v_capacity:=v_rule.capacity;v_cancelled:=false;
      select * into v_exception from public.listing_schedule_exceptions where listing_id=p_listing_id and available_date=v_day and start_time=v_rule.start_time;
      if v_exception.id is not null then v_cancelled:=v_exception.is_cancelled;v_start:=coalesce(v_exception.override_start_time,v_start);v_end:=coalesce(v_exception.override_end_time,v_end);v_capacity:=coalesce(v_exception.override_capacity,v_capacity);end if;
      insert into public.availability(listing_id,available_date,start_time,end_time,max_capacity,remaining_spaces,sellable_capacity,is_blocked,stop_sell)
      values(p_listing_id,v_day,v_start,v_end,v_capacity,case when v_cancelled then 0 else v_capacity end,v_capacity,v_cancelled,v_cancelled)
      on conflict(listing_id,available_date,start_time) do update set end_time=excluded.end_time,max_capacity=excluded.max_capacity,sellable_capacity=excluded.sellable_capacity,is_blocked=excluded.is_blocked,stop_sell=excluded.stop_sell,updated_at=now()
      returning id into v_availability_id;
      perform private.recalculate_availability_inventory(v_availability_id);v_count:=v_count+1;
    end loop;
  end loop;
  return v_count;
end;
$$;

create or replace function public.create_external_accommodation_booking(p_room_id uuid,p_source text,p_check_in_date date,p_check_out_date date,p_rooms integer default 1,p_external_reference text default null,p_guest_name text default null,p_notes text default null)
returns public.external_accommodation_bookings language plpgsql security definer set search_path='' as $$
declare v_room public.accommodation_rooms;v_listing public.listings;v_business public.businesses;v_day date;v_row public.room_availability;v_result public.external_accommodation_bookings;v_balance integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_source not in ('booking_com','agoda','direct','walk_in','other') then raise exception 'Choose a valid booking source'; end if;
  if p_check_in_date is null or p_check_out_date is null or p_check_out_date<=p_check_in_date then raise exception 'Check-out must be after check-in'; end if;
  if p_check_in_date<current_date then raise exception 'External bookings can only be added for current or future stays'; end if;
  if coalesce(p_rooms,0)<1 then raise exception 'Rooms booked must be at least 1'; end if;
  select * into v_room from public.accommodation_rooms where id=p_room_id and is_active;if v_room.id is null then raise exception 'Room type not found';end if;if p_rooms>v_room.quantity then raise exception 'Rooms booked exceed this room type quantity';end if;
  select * into v_listing from public.listings where id=v_room.listing_id and category='accommodation';select * into v_business from public.businesses where id=v_listing.business_id;
  if not private.has_business_permission(v_business.id,'reservations',auth.uid()) then raise exception 'External booking access denied'; end if;
  if nullif(trim(coalesce(p_external_reference,'')),'') is not null and exists(select 1 from public.external_accommodation_bookings where business_id=v_business.id and source=p_source and lower(external_reference)=lower(trim(p_external_reference)) and status='active') then raise exception 'This external booking reference is already recorded'; end if;
  for v_day in select generate_series(p_check_in_date,p_check_out_date-1,interval '1 day')::date loop v_row:=private.recalculate_room_inventory(p_room_id,v_day);if v_row.is_blocked or v_row.stop_sell or v_row.available_quantity<p_rooms then raise exception 'Not enough room inventory is available for the full external stay';end if;end loop;
  insert into public.external_accommodation_bookings(business_id,listing_id,room_id,source,external_reference,guest_name,check_in_date,check_out_date,rooms_booked,notes,created_by)
  values(v_business.id,v_listing.id,v_room.id,p_source,nullif(trim(coalesce(p_external_reference,'')),''),nullif(trim(coalesce(p_guest_name,'')),''),p_check_in_date,p_check_out_date,p_rooms,nullif(trim(coalesce(p_notes,'')),''),auth.uid()) returning * into v_result;
  for v_day in select generate_series(p_check_in_date,p_check_out_date-1,interval '1 day')::date loop v_row:=private.recalculate_room_inventory(p_room_id,v_day);v_balance:=v_row.available_quantity;end loop;
  perform private.log_inventory_movement(v_business.id,v_listing.id,v_room.id,null,null,v_result.id,'external_booking_created',-p_rooms,v_balance,p_source||coalesce(' · '||nullif(trim(coalesce(p_external_reference,'')),''),''));return v_result;
end;
$$;

create or replace function public.cancel_external_accommodation_booking(p_booking_id uuid)
returns public.external_accommodation_bookings language plpgsql security definer set search_path='' as $$
declare v_booking public.external_accommodation_bookings;v_day date;v_row public.room_availability;v_balance integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_booking from public.external_accommodation_bookings where id=p_booking_id for update;if v_booking.id is null then raise exception 'External booking not found';end if;
  if not private.has_business_permission(v_booking.business_id,'reservations',auth.uid()) then raise exception 'External booking access denied'; end if;
  if v_booking.status='cancelled' then return v_booking;end if;
  update public.external_accommodation_bookings set status='cancelled',cancelled_at=now(),updated_at=now() where id=v_booking.id returning * into v_booking;
  for v_day in select generate_series(v_booking.check_in_date,v_booking.check_out_date-1,interval '1 day')::date loop v_row:=private.recalculate_room_inventory(v_booking.room_id,v_day);v_balance:=v_row.available_quantity;end loop;
  perform private.log_inventory_movement(v_booking.business_id,v_booking.listing_id,v_booking.room_id,null,null,v_booking.id,'external_booking_cancelled',v_booking.rooms_booked,v_balance,'External reservation cancelled');return v_booking;
end;
$$;

create or replace function public.operator_business_analytics(p_business_id uuid,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_from date:=coalesce(p_from,current_date-29);v_to date:=coalesce(p_to,current_date);v_bookings integer;v_confirmed integer;v_cancelled integer;v_revenue numeric;v_room_nights numeric;v_sellable_room_nights numeric;v_views integer;v_avg_stay numeric;v_avg_lead numeric;v_arrivals integer;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;if v_to<v_from then raise exception 'End date must not be before start date';end if;
  if not private.has_business_permission(p_business_id,'analytics',auth.uid()) then raise exception 'Analytics access denied'; end if;
  select count(*),count(*) filter(where status in ('confirmed','completed','no_show')),count(*) filter(where status='cancelled'),coalesce(sum(quoted_total) filter(where status in ('confirmed','completed','no_show')),0),coalesce(sum(case when check_out_date is not null and status in ('confirmed','completed','no_show') then (check_out_date-requested_date)*rooms_requested else 0 end),0),coalesce(avg(case when check_out_date is not null and status in ('confirmed','completed','no_show') then check_out_date-requested_date end),0),coalesce(avg(greatest(0,requested_date-created_at::date)) filter(where status in ('accepted','confirmed','completed','no_show')),0),count(*) filter(where requested_date=current_date and status in ('accepted','confirmed')) into v_bookings,v_confirmed,v_cancelled,v_revenue,v_room_nights,v_avg_stay,v_avg_lead,v_arrivals from public.booking_enquiries where business_id=p_business_id and requested_date between v_from and v_to;
  select coalesce(sum(ra.sellable_quantity),0) into v_sellable_room_nights from public.room_availability ra join public.accommodation_rooms r on r.id=ra.room_id join public.listings l on l.id=r.listing_id where l.business_id=p_business_id and ra.available_date between v_from and v_to;
  select count(*) into v_views from public.listing_views lv join public.listings l on l.id=lv.listing_id where l.business_id=p_business_id and lv.viewed_on between v_from and v_to;
  return jsonb_build_object('from',v_from,'to',v_to,'bookings',v_bookings,'confirmed_bookings',v_confirmed,'cancelled_bookings',v_cancelled,'confirmed_revenue',round(v_revenue,2),'room_nights',v_room_nights,'sellable_room_nights',v_sellable_room_nights,'occupancy_percent',case when v_sellable_room_nights>0 then round(100*v_room_nights/v_sellable_room_nights,1) else null end,'adr',case when v_room_nights>0 then round(v_revenue/v_room_nights,2) else null end,'cancellation_rate',case when v_bookings>0 then round(100*v_cancelled::numeric/v_bookings,1) else 0 end,'average_stay',round(coalesce(v_avg_stay,0),1),'average_lead_days',round(coalesce(v_avg_lead,0),1),'listing_views',v_views,'conversion_percent',case when v_views>0 then round(100*v_confirmed::numeric/v_views,2) else 0 end,'arrivals_today',v_arrivals);
end;
$$;

create or replace function public.operator_listing_analytics(p_business_id uuid,p_from date,p_to date)
returns table(listing_id uuid,title text,category text,views bigint,enquiries bigint,confirmed bigint,revenue numeric,conversion_percent numeric)
language plpgsql security definer set search_path='' as $$
declare v_from date:=coalesce(p_from,current_date-29);v_to date:=coalesce(p_to,current_date);
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  if not private.has_business_permission(p_business_id,'analytics',auth.uid()) then raise exception 'Analytics access denied'; end if;
  return query select l.id,l.title,l.category::text,coalesce(v.cnt,0),coalesce(b.enquiries,0),coalesce(b.confirmed,0),coalesce(b.revenue,0),case when coalesce(v.cnt,0)>0 then round(100*coalesce(b.confirmed,0)::numeric/v.cnt,2) else 0 end from public.listings l left join lateral(select count(*) cnt from public.listing_views x where x.listing_id=l.id and x.viewed_on between v_from and v_to)v on true left join lateral(select count(*) enquiries,count(*) filter(where status in ('confirmed','completed','no_show')) confirmed,coalesce(sum(quoted_total) filter(where status in ('confirmed','completed','no_show')),0) revenue from public.booking_enquiries x where x.listing_id=l.id and x.requested_date between v_from and v_to)b on true where l.business_id=p_business_id order by coalesce(b.revenue,0) desc,l.title;
end;
$$;