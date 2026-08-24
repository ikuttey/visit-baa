create or replace view public.public_room_availability
with (security_invoker=true,security_barrier=true)
as
select
  id,room_id,available_date,total_quantity,available_quantity,price_override,
  sellable_quantity,booked_quantity,external_booked_quantity,held_quantity,
  minimum_stay,maximum_stay,min_advance_hours,max_advance_days,
  closed_to_arrival,closed_to_departure
from public.room_availability
where available_date>=current_date and not is_blocked and not stop_sell;

create or replace view public.public_availability
with (security_invoker=true,security_barrier=true)
as
select
  a.id,a.listing_id,a.available_date,a.start_time,a.end_time,a.max_capacity,
  a.remaining_spaces,a.sellable_capacity,a.minimum_stay,a.maximum_stay,
  a.min_advance_hours,a.max_advance_days,a.closed_to_arrival,a.closed_to_departure
from public.availability a
join public.listings l on l.id=a.listing_id
join public.businesses b on b.id=l.business_id
where a.available_date>=current_date
  and not a.is_blocked
  and not a.stop_sell
  and l.status='published' and l.is_active
  and b.status='verified' and b.is_active;

create or replace view public.public_room_rate_plans
with (security_invoker=true,security_barrier=true)
as
select
  id,room_id,name,nightly_price,meal_plan,free_cancellation,
  cancellation_deadline_hours,is_refundable,sort_order,
  pricing_mode,parent_rate_plan_id,adjustment_value,cancellation_type,
  cancellation_penalty,meal_plan_code,benefits,minimum_stay,maximum_stay,
  min_advance_hours,max_advance_days,occupancy_pricing
from public.room_rate_plans
where is_active;

create or replace view public.public_listing_policies
with (security_invoker=true,security_barrier=true)
as
select
  listing_id,cancellation_type,cancellation_deadline_hours,cancellation_penalty,
  check_in_from,check_in_until,check_out_from,check_out_until,children_allowed,
  minimum_child_age,child_pricing_notes,pets_policy,smoking_policy,payment_condition,
  updated_at,deposit_percentage,booking_hold_hours
from public.listing_policies;

create or replace view public.public_promotions
with (security_invoker=true,security_barrier=true)
as
select
  id,listing_id,name,description,discount_type,discount_value,valid_from,valid_until,
  minimum_nights,promotion_kind,booking_from,booking_until,applies_to_rate_plan_id,
  minimum_lead_days,maximum_lead_days,days_of_week,stacking_mode,priority
from public.promotions
where is_active
  and valid_until>=current_date
  and (booking_from is null or current_date>=booking_from)
  and (booking_until is null or current_date<=booking_until);

grant select on public.public_room_availability,public.public_availability,
  public.public_room_rate_plans,public.public_listing_policies,public.public_promotions
to anon,authenticated;

create or replace function public.create_booking_request(
  p_listing_id uuid,
  p_availability_id uuid default null,
  p_room_id uuid default null,
  p_rate_plan_id uuid default null,
  p_requested_date date default null,
  p_check_out_date date default null,
  p_requested_time time default null,
  p_adults integer default 1,
  p_children integer default 0,
  p_rooms integer default 1,
  p_guest_full_name text default null,
  p_guest_email text default null,
  p_guest_phone text default null,
  p_guest_message text default null
)
returns public.booking_enquiries
language plpgsql
security definer
set search_path=''
as $$
declare
  v_listing public.listings;
  v_room public.accommodation_rooms;
  v_rate public.room_rate_plans;
  v_slot public.availability;
  v_room_day public.room_availability;
  v_rate_day public.room_rate_calendar;
  v_checkout_room public.room_availability;
  v_checkout_rate public.room_rate_calendar;
  v_result public.booking_enquiries;
  v_nights integer := 1;
  v_guest_count integer := coalesce(p_adults,0)+coalesce(p_children,0);
  v_party_per_room integer;
  v_unit_price numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_inventory_days integer;
  v_day date;
  v_min_stay integer;
  v_max_stay integer;
  v_min_advance integer;
  v_max_advance integer;
  v_hours_ahead numeric;
begin
  perform private.expire_booking_holds();

  if p_requested_date is null or p_requested_date<current_date then
    raise exception 'Choose a current or future date';
  end if;
  if coalesce(p_adults,0)<1 or coalesce(p_children,0)<0 or coalesce(p_rooms,0)<1 then
    raise exception 'Invalid traveler quantities';
  end if;
  if char_length(trim(coalesce(p_guest_full_name,'')))<2
    or trim(coalesce(p_guest_email,''))=''
    or trim(coalesce(p_guest_phone,''))='' then
    raise exception 'Traveler name, email and phone are required';
  end if;

  select l.* into v_listing
  from public.listings l
  join public.businesses b on b.id=l.business_id
  where l.id=p_listing_id
    and l.status='published'
    and l.is_active
    and b.status='verified'
    and b.is_active;

  if v_listing.id is null then raise exception 'This listing is not available'; end if;

  if v_listing.category='accommodation' then
    if p_availability_id is not null then
      raise exception 'Accommodation requests use date-range inventory, not an activity session';
    end if;
    if p_room_id is null and p_rate_plan_id is not null then
      raise exception 'A rate plan requires a room type';
    end if;
    if p_check_out_date is null or p_check_out_date<=p_requested_date then
      raise exception 'Check-out must be after check-in';
    end if;

    v_nights:=p_check_out_date-p_requested_date;

    if p_room_id is not null then
      select * into v_room
      from public.accommodation_rooms
      where id=p_room_id and listing_id=p_listing_id and is_active;

      if v_room.id is null then raise exception 'The selected room is not available'; end if;

      if p_adults>v_room.adult_capacity*p_rooms
        or p_children>v_room.child_capacity*p_rooms
        or v_guest_count>v_room.maximum_guests*p_rooms then
        raise exception 'The selected rooms cannot accommodate this party';
      end if;

      if p_rate_plan_id is not null then
        select * into v_rate
        from public.room_rate_plans
        where id=p_rate_plan_id and room_id=v_room.id and is_active;
        if v_rate.id is null then raise exception 'The selected rate plan is not available'; end if;
      end if;

      select count(*) into v_inventory_days
      from public.room_availability
      where room_id=v_room.id
        and available_date>=p_requested_date
        and available_date<p_check_out_date;

      if v_inventory_days<>v_nights then
        raise exception 'The room is not open for the full stay';
      end if;

      v_party_per_room:=greatest(1,ceil(v_guest_count::numeric/p_rooms)::integer);

      for v_day in
        select generate_series(p_requested_date,p_check_out_date-1,interval '1 day')::date
      loop
        perform private.recalculate_room_inventory(v_room.id,v_day);

        select * into v_room_day
        from public.room_availability
        where room_id=v_room.id and available_date=v_day;

        select * into v_rate_day
        from public.room_rate_calendar
        where room_id=v_room.id
          and rate_plan_id is not distinct from p_rate_plan_id
          and available_date=v_day;

        if v_room_day.is_blocked
          or v_room_day.stop_sell
          or coalesce(v_rate_day.stop_sell,false)
          or v_room_day.available_quantity<p_rooms then
          raise exception 'The room is not available for the full stay';
        end if;

        if v_day=p_requested_date then
          v_min_stay:=coalesce(v_rate_day.minimum_stay,v_room_day.minimum_stay,v_rate.minimum_stay);
          v_max_stay:=coalesce(v_rate_day.maximum_stay,v_room_day.maximum_stay,v_rate.maximum_stay);
          v_min_advance:=coalesce(v_rate_day.min_advance_hours,v_room_day.min_advance_hours,v_rate.min_advance_hours);
          v_max_advance:=coalesce(v_rate_day.max_advance_days,v_room_day.max_advance_days,v_rate.max_advance_days);

          if v_min_stay is not null and v_nights<v_min_stay then
            raise exception 'This rate requires a minimum stay of % nights',v_min_stay;
          end if;
          if v_max_stay is not null and v_nights>v_max_stay then
            raise exception 'This rate allows a maximum stay of % nights',v_max_stay;
          end if;
          if v_room_day.closed_to_arrival or coalesce(v_rate_day.closed_to_arrival,false) then
            raise exception 'Check-in is not available on the selected arrival date';
          end if;

          v_hours_ahead:=extract(epoch from (p_requested_date::timestamp-now()))/3600;
          if v_min_advance is not null and v_hours_ahead<v_min_advance then
            raise exception 'This rate requires at least % hours advance booking',v_min_advance;
          end if;
          if v_max_advance is not null and (p_requested_date-current_date)>v_max_advance then
            raise exception 'This rate can only be booked up to % days ahead',v_max_advance;
          end if;
        end if;

        v_subtotal:=v_subtotal
          + private.effective_room_rate(p_rate_plan_id,v_room.id,v_day,v_party_per_room)*p_rooms;
      end loop;

      select * into v_checkout_room
      from public.room_availability
      where room_id=v_room.id and available_date=p_check_out_date;

      select * into v_checkout_rate
      from public.room_rate_calendar
      where room_id=v_room.id
        and rate_plan_id is not distinct from p_rate_plan_id
        and available_date=p_check_out_date;

      if coalesce(v_checkout_room.closed_to_departure,false)
        or coalesce(v_checkout_rate.closed_to_departure,false) then
        raise exception 'Check-out is not available on the selected departure date';
      end if;

      v_unit_price:=round(v_subtotal/greatest(1,v_nights*p_rooms),2);
    else
      if v_guest_count>coalesce(v_listing.maximum_guests,1)*p_rooms then
        raise exception 'The listing cannot accommodate this party';
      end if;

      select count(*) into v_inventory_days
      from public.availability
      where listing_id=p_listing_id
        and available_date>=p_requested_date
        and available_date<p_check_out_date
        and start_time is null;

      if v_inventory_days<>v_nights then
        raise exception 'Availability is not configured for the full stay';
      end if;

      for v_day in
        select generate_series(p_requested_date,p_check_out_date-1,interval '1 day')::date
      loop
        select * into v_slot
        from public.availability
        where listing_id=p_listing_id
          and available_date=v_day
          and start_time is null;

        perform private.recalculate_availability_inventory(v_slot.id);
        select * into v_slot from public.availability where id=v_slot.id;

        if v_slot.is_blocked or v_slot.stop_sell or v_slot.remaining_spaces<p_rooms then
          raise exception 'Availability is not configured for the full stay';
        end if;

        if v_day=p_requested_date then
          if v_slot.minimum_stay is not null and v_nights<v_slot.minimum_stay then
            raise exception 'This stay requires at least % nights',v_slot.minimum_stay;
          end if;
          if v_slot.maximum_stay is not null and v_nights>v_slot.maximum_stay then
            raise exception 'This stay allows at most % nights',v_slot.maximum_stay;
          end if;
          if v_slot.min_advance_hours is not null
            and extract(epoch from (p_requested_date::timestamp-now()))/3600<v_slot.min_advance_hours then
            raise exception 'This stay requires more advance notice';
          end if;
          if v_slot.max_advance_days is not null
            and (p_requested_date-current_date)>v_slot.max_advance_days then
            raise exception 'This stay cannot be booked that far ahead';
          end if;
        end if;
      end loop;

      v_unit_price:=coalesce(v_listing.price_per_night,v_listing.price);
      v_subtotal:=v_unit_price*v_nights*p_rooms;
    end if;
  else
    if p_room_id is not null or p_rate_plan_id is not null or p_check_out_date is not null then
      raise exception 'Room details only apply to accommodation bookings';
    end if;

    if p_availability_id is not null then
      select * into v_slot
      from public.availability
      where id=p_availability_id
        and listing_id=p_listing_id
        and available_date=p_requested_date;

      if v_slot.id is null then raise exception 'The selected session is not available'; end if;

      perform private.recalculate_availability_inventory(v_slot.id);
      select * into v_slot from public.availability where id=v_slot.id;

      if v_slot.is_blocked or v_slot.stop_sell or v_slot.remaining_spaces<v_guest_count then
        raise exception 'The selected session is not available';
      end if;

      if v_slot.min_advance_hours is not null
        and extract(epoch from (p_requested_date::timestamp-now()))/3600<v_slot.min_advance_hours then
        raise exception 'This session requires more advance notice';
      end if;
      if v_slot.max_advance_days is not null
        and (p_requested_date-current_date)>v_slot.max_advance_days then
        raise exception 'This session cannot be booked that far ahead';
      end if;
    elsif exists (
      select 1 from public.availability
      where listing_id=p_listing_id and available_date=p_requested_date
    ) then
      raise exception 'Choose an available session';
    elsif v_guest_count>v_listing.available_spaces then
      raise exception 'Guest count exceeds available capacity';
    end if;

    v_unit_price:=v_listing.price;
    v_subtotal:=case v_listing.price_unit
      when 'per_person' then v_listing.price*p_adults+coalesce(v_listing.child_price,v_listing.price)*p_children
      when 'per_adult' then v_listing.price*p_adults+coalesce(v_listing.child_price,0)*p_children
      when 'per_child' then v_listing.price*p_children
      else v_listing.price
    end;
  end if;

  v_discount:=private.calculate_promotion_discount(
    p_listing_id,p_rate_plan_id,p_requested_date,v_nights,v_subtotal
  );

  insert into public.booking_enquiries(
    listing_id,availability_id,traveler_id,room_id,rate_plan_id,requested_date,
    check_out_date,requested_time,guest_count,adult_count,child_count,rooms_requested,
    guest_full_name,guest_email,guest_phone,guest_message,quoted_subtotal,discount_amount,
    taxes_amount,fees_amount,quoted_total,quote_currency
  ) values (
    p_listing_id,p_availability_id,
    case when private.is_traveler(auth.uid()) then auth.uid() else null end,
    p_room_id,p_rate_plan_id,p_requested_date,p_check_out_date,p_requested_time,
    v_guest_count,p_adults,p_children,p_rooms,trim(p_guest_full_name),trim(p_guest_email),
    trim(p_guest_phone),nullif(trim(p_guest_message),''),
    v_subtotal,v_discount,v_listing.taxes_amount,v_listing.fees_amount,
    greatest(0,v_subtotal-v_discount+v_listing.taxes_amount+v_listing.fees_amount),
    coalesce(v_room.currency,v_listing.currency)
  )
  returning * into v_result;

  return v_result;
end;
$$;