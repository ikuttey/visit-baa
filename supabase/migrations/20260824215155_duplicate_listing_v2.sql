create or replace function public.duplicate_operator_listing(p_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source public.listings;
  v_new public.listings;
  v_new_id uuid:=gen_random_uuid();
  v_new_room_id uuid;
  v_room record;
  v_component record;
  v_new_component uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_source from public.listings where id=p_listing_id;
  if v_source.id is null then raise exception 'Listing not found'; end if;
  if v_source.revision_of_listing_id is not null then
    select * into v_source from public.listings where id=v_source.revision_of_listing_id;
  end if;
  if not private.has_verified_business_permission(v_source.business_id,'content',auth.uid()) then raise exception 'Listing content access denied'; end if;

  perform set_config('app.listing_revision_clone','true',true);
  v_new:=v_source;
  v_new.id:=v_new_id; v_new.title:=left(v_source.title||' (Copy)',180); v_new.status:='draft';
  v_new.review_note:=null;v_new.reviewed_by:=null;v_new.reviewed_at:=null;v_new.revision_of_listing_id:=null;v_new.revision_number:=null;
  v_new.cover_image_path:=null;v_new.created_at:=now();v_new.updated_at:=now();v_new.held_spaces:=0;v_new.booked_spaces:=0;
  insert into public.listings select (v_new).*;

  for v_room in select * from public.accommodation_rooms where listing_id=v_source.id order by sort_order loop
    v_new_room_id:=gen_random_uuid();
    insert into public.accommodation_rooms(id,listing_id,name,description,maximum_guests,adult_capacity,child_capacity,bed_configuration,room_size_sqm,view_type,quantity,base_price,currency,amenities,is_active,sort_order,created_at,updated_at)
    values(v_new_room_id,v_new_id,v_room.name,v_room.description,v_room.maximum_guests,v_room.adult_capacity,v_room.child_capacity,v_room.bed_configuration,v_room.room_size_sqm,v_room.view_type,v_room.quantity,v_room.base_price,v_room.currency,v_room.amenities,v_room.is_active,v_room.sort_order,now(),now());
    insert into public.room_rate_plans(id,room_id,name,nightly_price,meal_plan,free_cancellation,cancellation_deadline_hours,is_refundable,is_active,sort_order,created_at,updated_at,pricing_mode,parent_rate_plan_id,adjustment_value,cancellation_type,cancellation_penalty,meal_plan_code,benefits,minimum_stay,maximum_stay,min_advance_hours,max_advance_days,occupancy_pricing)
    select gen_random_uuid(),v_new_room_id,name,nightly_price,meal_plan,free_cancellation,cancellation_deadline_hours,is_refundable,is_active,sort_order,now(),now(),pricing_mode,null,adjustment_value,cancellation_type,cancellation_penalty,meal_plan_code,benefits,minimum_stay,maximum_stay,min_advance_hours,max_advance_days,occupancy_pricing
    from public.room_rate_plans where room_id=v_room.id;
  end loop;

  insert into public.listing_policies(listing_id,cancellation_type,cancellation_deadline_hours,cancellation_penalty,check_in_from,check_in_until,check_out_from,check_out_until,children_allowed,minimum_child_age,child_pricing_notes,pets_policy,smoking_policy,payment_condition,updated_at,deposit_percentage,booking_hold_hours)
  select v_new_id,cancellation_type,cancellation_deadline_hours,cancellation_penalty,check_in_from,check_in_until,check_out_from,check_out_until,children_allowed,minimum_child_age,child_pricing_notes,pets_policy,smoking_policy,payment_condition,now(),deposit_percentage,booking_hold_hours from public.listing_policies where listing_id=v_source.id;

  for v_component in select * from public.listing_price_components where listing_id=v_source.id order by sort_order loop
    v_new_component:=gen_random_uuid();
    insert into public.listing_price_components(id,listing_id,component_type,name,charge_status,amount,currency,price_unit,group_capacity,customer_description,is_active,sort_order,created_at,updated_at)
    values(v_new_component,v_new_id,v_component.component_type,v_component.name,v_component.charge_status,v_component.amount,v_component.currency,v_component.price_unit,v_component.group_capacity,v_component.customer_description,v_component.is_active,v_component.sort_order,now(),now());
    insert into public.listing_price_tiers(id,component_id,minimum_guests,maximum_guests,amount,calculation_kind,sort_order,created_at)
    select gen_random_uuid(),v_new_component,minimum_guests,maximum_guests,amount,calculation_kind,sort_order,now() from public.listing_price_tiers where component_id=v_component.id;
  end loop;

  insert into public.listing_package_details(listing_id,duration_minutes,operating_days,minimum_guests,maximum_guests,infant_policy,shared_trip_price,private_trip_price,equipment_included,meal_included,drinking_water_included,pickup_mode,pickup_notes,airport_pickup,dropoff_mode,dropoff_notes,booking_lead_hours,updated_at)
  select v_new_id,duration_minutes,operating_days,minimum_guests,maximum_guests,infant_policy,shared_trip_price,private_trip_price,equipment_included,meal_included,drinking_water_included,pickup_mode,pickup_notes,airport_pickup,dropoff_mode,dropoff_notes,booking_lead_hours,now() from public.listing_package_details where listing_id=v_source.id;
  insert into public.package_transfer_options(id,listing_id,direction,location_id,availability,fee,currency,notes,created_at)
  select gen_random_uuid(),v_new_id,direction,location_id,availability,fee,currency,notes,now() from public.package_transfer_options where listing_id=v_source.id;
  insert into public.listing_service_pickup_locations(listing_id,location_id,sort_order,created_at,direction,availability,fee,currency,notes)
  select v_new_id,location_id,sort_order,now(),direction,availability,fee,currency,notes from public.listing_service_pickup_locations where listing_id=v_source.id;
  insert into public.transfer_route_details(listing_id,origin_name,destination_name,departure_point,arrival_point,transport_type,service_type,departure_time,arrival_time,estimated_duration_minutes,operating_days,adult_price,child_price,infant_price,private_price,currency,pricing_model,minimum_passengers,maximum_passengers,luggage_information,is_active,updated_at,origin_location_id,destination_location_id,check_in_minutes_before,baggage_rules,booking_notice_hours,maximum_advance_days)
  select v_new_id,origin_name,destination_name,departure_point,arrival_point,transport_type,service_type,departure_time,arrival_time,estimated_duration_minutes,operating_days,adult_price,child_price,infant_price,private_price,currency,pricing_model,minimum_passengers,maximum_passengers,luggage_information,is_active,now(),origin_location_id,destination_location_id,check_in_minutes_before,baggage_rules,booking_notice_hours,maximum_advance_days from public.transfer_route_details where listing_id=v_source.id;

  select * into v_new from public.listings where id=v_new_id;
  return v_new;
end;
$$;
revoke all on function public.duplicate_operator_listing(uuid) from public,anon;
grant execute on function public.duplicate_operator_listing(uuid) to authenticated;