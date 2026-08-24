create or replace function public.create_listing_revision(p_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source public.listings;
  v_revision public.listings;
  v_revision_id uuid:=gen_random_uuid();
  v_revision_number integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_source from public.listings where id=p_listing_id for share;
  if v_source.id is null then raise exception 'Listing not found'; end if;
  if v_source.revision_of_listing_id is not null then raise exception 'Create revisions from the live listing, not from another revision'; end if;
  if v_source.status<>'published' then raise exception 'Only a published listing needs a zero-downtime revision'; end if;
  if not private.has_verified_business_permission(v_source.business_id,'content',auth.uid()) then raise exception 'Listing content access denied'; end if;

  select * into v_revision
  from public.listings
  where revision_of_listing_id=p_listing_id and status in ('draft','pending_review','changes_requested','rejected')
  order by revision_number desc nulls last, created_at desc limit 1;
  if v_revision.id is not null then return v_revision; end if;

  select coalesce(max(revision_number),0)+1 into v_revision_number
  from public.listings where revision_of_listing_id=p_listing_id;

  perform set_config('app.listing_revision_clone','true',true);
  v_revision:=v_source;
  v_revision.id:=v_revision_id;
  v_revision.status:='draft';
  v_revision.review_note:=null; v_revision.reviewed_by:=null; v_revision.reviewed_at:=null;
  v_revision.is_active:=true;
  v_revision.created_at:=now(); v_revision.updated_at:=now();
  v_revision.revision_of_listing_id:=p_listing_id;
  v_revision.revision_number:=v_revision_number;
  v_revision.sellable_spaces:=v_source.sellable_spaces;
  v_revision.held_spaces:=0; v_revision.booked_spaces:=0;
  insert into public.listings select (v_revision).*;

  insert into public.listing_images(id,listing_id,storage_path,caption,sort_order,created_at)
  select gen_random_uuid(),v_revision_id,storage_path,caption,sort_order,now()
  from public.listing_images where listing_id=p_listing_id;

  insert into public.accommodation_rooms(
    id,listing_id,name,description,maximum_guests,adult_capacity,child_capacity,bed_configuration,
    room_size_sqm,view_type,quantity,base_price,currency,amenities,is_active,sort_order,created_at,updated_at,revision_source_room_id
  )
  select gen_random_uuid(),v_revision_id,name,description,maximum_guests,adult_capacity,child_capacity,bed_configuration,
    room_size_sqm,view_type,quantity,base_price,currency,amenities,is_active,sort_order,now(),now(),id
  from public.accommodation_rooms where listing_id=p_listing_id;

  insert into public.room_images(id,room_id,storage_path,caption,sort_order,created_at)
  select gen_random_uuid(),clone.id,img.storage_path,img.caption,img.sort_order,now()
  from public.accommodation_rooms src
  join public.accommodation_rooms clone on clone.revision_source_room_id=src.id and clone.listing_id=v_revision_id
  join public.room_images img on img.room_id=src.id
  where src.listing_id=p_listing_id;

  insert into public.room_rate_plans(
    id,room_id,name,nightly_price,meal_plan,free_cancellation,cancellation_deadline_hours,is_refundable,is_active,sort_order,
    created_at,updated_at,pricing_mode,parent_rate_plan_id,adjustment_value,cancellation_type,cancellation_penalty,
    meal_plan_code,benefits,minimum_stay,maximum_stay,min_advance_hours,max_advance_days,occupancy_pricing,revision_source_rate_plan_id
  )
  select gen_random_uuid(),clone.id,rp.name,rp.nightly_price,rp.meal_plan,rp.free_cancellation,rp.cancellation_deadline_hours,
    rp.is_refundable,rp.is_active,rp.sort_order,now(),now(),rp.pricing_mode,null,rp.adjustment_value,rp.cancellation_type,
    rp.cancellation_penalty,rp.meal_plan_code,rp.benefits,rp.minimum_stay,rp.maximum_stay,rp.min_advance_hours,rp.max_advance_days,
    rp.occupancy_pricing,rp.id
  from public.accommodation_rooms src
  join public.accommodation_rooms clone on clone.revision_source_room_id=src.id and clone.listing_id=v_revision_id
  join public.room_rate_plans rp on rp.room_id=src.id
  where src.listing_id=p_listing_id;

  update public.room_rate_plans child
  set parent_rate_plan_id=parent_clone.id
  from public.room_rate_plans src_plan, public.room_rate_plans parent_clone
  where child.revision_source_rate_plan_id=src_plan.id
    and src_plan.parent_rate_plan_id is not null
    and parent_clone.revision_source_rate_plan_id=src_plan.parent_rate_plan_id
    and exists(select 1 from public.accommodation_rooms cr where cr.id=child.room_id and cr.listing_id=v_revision_id)
    and exists(select 1 from public.accommodation_rooms pr where pr.id=parent_clone.room_id and pr.listing_id=v_revision_id);

  insert into public.listing_policies(
    listing_id,cancellation_type,cancellation_deadline_hours,cancellation_penalty,check_in_from,check_in_until,
    check_out_from,check_out_until,children_allowed,minimum_child_age,child_pricing_notes,pets_policy,smoking_policy,
    payment_condition,updated_at,deposit_percentage,booking_hold_hours
  )
  select v_revision_id,cancellation_type,cancellation_deadline_hours,cancellation_penalty,check_in_from,check_in_until,
    check_out_from,check_out_until,children_allowed,minimum_child_age,child_pricing_notes,pets_policy,smoking_policy,
    payment_condition,now(),deposit_percentage,booking_hold_hours
  from public.listing_policies where listing_id=p_listing_id;

  insert into public.listing_price_components(
    id,listing_id,component_type,name,charge_status,amount,currency,price_unit,group_capacity,customer_description,is_active,
    sort_order,created_at,updated_at,revision_source_component_id
  )
  select gen_random_uuid(),v_revision_id,component_type,name,charge_status,amount,currency,price_unit,group_capacity,
    customer_description,is_active,sort_order,now(),now(),id
  from public.listing_price_components where listing_id=p_listing_id;

  insert into public.listing_price_tiers(id,component_id,minimum_guests,maximum_guests,amount,calculation_kind,sort_order,created_at)
  select gen_random_uuid(),clone.id,t.minimum_guests,t.maximum_guests,t.amount,t.calculation_kind,t.sort_order,now()
  from public.listing_price_components src
  join public.listing_price_components clone on clone.revision_source_component_id=src.id and clone.listing_id=v_revision_id
  join public.listing_price_tiers t on t.component_id=src.id
  where src.listing_id=p_listing_id;

  insert into public.listing_package_details(
    listing_id,duration_minutes,operating_days,minimum_guests,maximum_guests,infant_policy,shared_trip_price,private_trip_price,
    equipment_included,meal_included,drinking_water_included,pickup_mode,pickup_notes,airport_pickup,dropoff_mode,dropoff_notes,
    booking_lead_hours,updated_at
  )
  select v_revision_id,duration_minutes,operating_days,minimum_guests,maximum_guests,infant_policy,shared_trip_price,private_trip_price,
    equipment_included,meal_included,drinking_water_included,pickup_mode,pickup_notes,airport_pickup,dropoff_mode,dropoff_notes,
    booking_lead_hours,now()
  from public.listing_package_details where listing_id=p_listing_id;

  insert into public.package_transfer_options(id,listing_id,direction,location_id,availability,fee,currency,notes,created_at)
  select gen_random_uuid(),v_revision_id,direction,location_id,availability,fee,currency,notes,now()
  from public.package_transfer_options where listing_id=p_listing_id;

  insert into public.listing_service_pickup_locations(
    listing_id,location_id,sort_order,created_at,direction,availability,fee,currency,notes
  )
  select v_revision_id,location_id,sort_order,now(),direction,availability,fee,currency,notes
  from public.listing_service_pickup_locations where listing_id=p_listing_id;

  insert into public.transfer_route_details(
    listing_id,origin_name,destination_name,departure_point,arrival_point,transport_type,service_type,departure_time,arrival_time,
    estimated_duration_minutes,operating_days,adult_price,child_price,infant_price,private_price,currency,pricing_model,
    minimum_passengers,maximum_passengers,luggage_information,is_active,updated_at,origin_location_id,destination_location_id,
    check_in_minutes_before,baggage_rules,booking_notice_hours,maximum_advance_days
  )
  select v_revision_id,origin_name,destination_name,departure_point,arrival_point,transport_type,service_type,departure_time,arrival_time,
    estimated_duration_minutes,operating_days,adult_price,child_price,infant_price,private_price,currency,pricing_model,
    minimum_passengers,maximum_passengers,luggage_information,is_active,now(),origin_location_id,destination_location_id,
    check_in_minutes_before,baggage_rules,booking_notice_hours,maximum_advance_days
  from public.transfer_route_details where listing_id=p_listing_id;

  select * into v_revision from public.listings where id=v_revision_id;
  return v_revision;
end;
$$;

revoke all on function public.create_listing_revision(uuid) from public,anon,authenticated;
grant execute on function public.create_listing_revision(uuid) to authenticated;