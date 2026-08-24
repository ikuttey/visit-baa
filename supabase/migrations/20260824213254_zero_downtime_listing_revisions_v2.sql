alter table public.listings
  add column if not exists revision_of_listing_id uuid references public.listings(id) on delete cascade,
  add column if not exists revision_number integer;

alter table public.accommodation_rooms
  add column if not exists revision_source_room_id uuid references public.accommodation_rooms(id) on delete set null;

alter table public.room_rate_plans
  add column if not exists revision_source_rate_plan_id uuid references public.room_rate_plans(id) on delete set null;

alter table public.listing_price_components
  add column if not exists revision_source_component_id uuid references public.listing_price_components(id) on delete set null;

create index if not exists listings_revision_source_idx on public.listings(revision_of_listing_id);
create index if not exists accommodation_rooms_revision_source_idx on public.accommodation_rooms(revision_source_room_id);
create index if not exists room_rate_plans_revision_source_idx on public.room_rate_plans(revision_source_rate_plan_id);
create index if not exists listing_price_components_revision_source_idx on public.listing_price_components(revision_source_component_id);
create unique index if not exists listings_one_open_revision_per_source_idx
  on public.listings(revision_of_listing_id)
  where revision_of_listing_id is not null and status in ('draft','pending_review','changes_requested');

create or replace function private.has_verified_business_permission(
  p_business_id uuid,
  p_permission text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.has_business_permission(p_business_id,p_permission,coalesce(p_user_id,auth.uid()))
    and exists(
      select 1 from public.businesses b
      where b.id=p_business_id and b.status='verified' and b.is_active
    );
$$;

create or replace function private.enforce_listing_workflow()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_verified boolean;
begin
  if private.is_admin(auth.uid()) then return new; end if;

  if tg_op='INSERT' then
    if not private.has_verified_business_permission(new.business_id,'content',auth.uid()) then
      raise exception 'A verified business with content access is required to create listings';
    end if;
    if new.status<>'draft' then raise exception 'New operator listings must start as drafts'; end if;
    new.review_note:=null; new.reviewed_by:=null; new.reviewed_at:=null;
    return new;
  end if;

  if new.business_id is distinct from old.business_id then raise exception 'A listing cannot be moved to another business'; end if;
  if new.revision_of_listing_id is distinct from old.revision_of_listing_id
     or new.revision_number is distinct from old.revision_number then
    raise exception 'Listing revision linkage cannot be changed directly';
  end if;
  if new.review_note is distinct from old.review_note
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Listing review fields can only be changed by an administrator';
  end if;

  if current_setting('app.listing_withdraw_for_edit',true)='true'
     and old.status='pending_review' and new.status='draft'
     and private.has_verified_business_permission(new.business_id,'content',auth.uid()) then
    return new;
  end if;

  if old.status in ('pending_review','published') and new.status=old.status and new is distinct from old then
    raise exception 'Listings cannot be edited while pending review or published';
  end if;

  if new.status is distinct from old.status then
    v_verified:=private.has_verified_business_permission(new.business_id,'content',auth.uid());
    if old.status in ('draft','changes_requested','rejected','paused') and new.status='pending_review' and v_verified then
      return new;
    elsif old.status='published' and new.status='paused' and v_verified then
      return new;
    elsif old.status in ('changes_requested','rejected','paused') and new.status='draft' and v_verified then
      return new;
    else
      raise exception 'This listing status transition is not allowed for operators';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.validate_listing_cover_path()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if private.is_admin(auth.uid()) or new.cover_image_path is null then return new; end if;
  if current_setting('app.listing_revision_clone',true)='true' then return new; end if;
  if not private.has_verified_business_permission(new.business_id,'content',auth.uid())
     or split_part(new.cover_image_path,'/',1)<>auth.uid()::text then
    raise exception 'Listing cover path must belong to a signed-in user with content access';
  end if;
  return new;
end;
$$;

create or replace function private.validate_listing_image_path()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_business_id uuid;
begin
  if private.is_admin(auth.uid()) then return new; end if;
  if current_setting('app.listing_revision_clone',true)='true' then return new; end if;
  select l.business_id into v_business_id from public.listings l where l.id=new.listing_id;
  if not private.has_verified_business_permission(v_business_id,'content',auth.uid()) then
    raise exception 'Listing image access denied';
  end if;
  if tg_op='INSERT' or new.storage_path is distinct from old.storage_path then
    if split_part(new.storage_path,'/',1)<>auth.uid()::text then
      raise exception 'New listing image paths must belong to the signed-in user';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.validate_room_image_path()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_listing_id uuid;
begin
  if private.is_admin(auth.uid()) then return new; end if;
  if current_setting('app.listing_revision_clone',true)='true' then return new; end if;
  select r.listing_id into v_listing_id from public.accommodation_rooms r where r.id=new.room_id;
  if not private.has_listing_permission(v_listing_id,'content',auth.uid()) then
    raise exception 'Room image access denied';
  end if;
  if tg_op='INSERT' or new.storage_path is distinct from old.storage_path then
    if split_part(new.storage_path,'/',1)<>auth.uid()::text then
      raise exception 'New room image paths must belong to the signed-in user';
    end if;
  end if;
  return new;
end;
$$;

-- Content staff and managers can see/edit content for their assigned business.
drop policy if exists listings_select_own_or_admin on public.listings;
create policy listings_select_business_access on public.listings for select to authenticated
using (
  private.is_admin(auth.uid())
  or private.has_business_permission(business_id,'content',auth.uid())
  or private.has_business_permission(business_id,'reservations',auth.uid())
  or private.has_business_permission(business_id,'finance',auth.uid())
);

drop policy if exists listings_insert_verified_owner on public.listings;
create policy listings_insert_content on public.listings for insert to authenticated
with check (private.has_verified_business_permission(business_id,'content',auth.uid()) or private.is_admin(auth.uid()));

drop policy if exists listings_update_verified_owner_or_admin on public.listings;
create policy listings_update_content on public.listings for update to authenticated
using (private.has_verified_business_permission(business_id,'content',auth.uid()) or private.is_admin(auth.uid()))
with check (private.has_verified_business_permission(business_id,'content',auth.uid()) or private.is_admin(auth.uid()));

drop policy if exists listings_delete_verified_owner_or_admin on public.listings;
create policy listings_delete_editable_content on public.listings for delete to authenticated
using (
  private.is_admin(auth.uid())
  or (
    private.has_verified_business_permission(business_id,'content',auth.uid())
    and status in ('draft','changes_requested','rejected','paused')
  )
);

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
  from public.room_rate_plans src_plan
  join public.room_rate_plans parent_clone on parent_clone.revision_source_rate_plan_id=src_plan.parent_rate_plan_id
  join public.accommodation_rooms parent_room on parent_room.id=parent_clone.room_id and parent_room.listing_id=v_revision_id
  join public.accommodation_rooms child_room on child_room.id=child.room_id and child_room.listing_id=v_revision_id
  where child.revision_source_rate_plan_id=src_plan.id and src_plan.parent_rate_plan_id is not null;

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

create or replace function private.apply_listing_revision(p_revision_id uuid,p_note text default null)
returns public.listings
language plpgsql
security definer
set search_path=''
as $$
declare
  v_revision public.listings;
  v_source public.listings;
  v_owner uuid;
  v_room record;
  v_date date;
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  select * into v_revision from public.listings where id=p_revision_id for update;
  if v_revision.id is null or v_revision.revision_of_listing_id is null then raise exception 'Listing revision not found'; end if;
  if v_revision.status<>'pending_review' then raise exception 'Only a pending revision can be approved'; end if;
  select * into v_source from public.listings where id=v_revision.revision_of_listing_id for update;
  if v_source.id is null then raise exception 'Live listing not found'; end if;
  if v_source.status not in ('published','paused') then raise exception 'The live listing must be published or paused before applying its revision'; end if;

  -- Capacity reductions/removals may not invalidate already held/booked/external rooms.
  if exists(
    select 1
    from public.accommodation_rooms src
    left join public.accommodation_rooms rev on rev.listing_id=v_revision.id and rev.revision_source_room_id=src.id
    where src.listing_id=v_source.id
      and exists(
        select 1 from public.room_availability ra
        where ra.room_id=src.id and ra.available_date>=current_date
          and (ra.held_quantity+ra.booked_quantity+ra.external_booked_quantity) > coalesce(case when rev.id is null or not rev.is_active then 0 else rev.quantity end,0)
      )
  ) then
    raise exception 'This revision reduces or removes a room below already held/booked/external inventory. Resolve those reservations or keep enough room capacity.';
  end if;

  perform set_config('app.listing_revision_apply','true',true);

  update public.listings s set
    title=r.title,category=r.category,island=r.island,summary=r.summary,description=r.description,price=r.price,currency=r.currency,
    price_unit=r.price_unit,start_time=r.start_time,end_time=r.end_time,max_capacity=r.max_capacity,available_spaces=r.available_spaces,
    included_items=r.included_items,excluded_items=r.excluded_items,meeting_point=r.meeting_point,requirements=r.requirements,
    cancellation_information=r.cancellation_information,cover_image_path=r.cover_image_path,property_type=r.property_type,room_type=r.room_type,
    maximum_guests=r.maximum_guests,number_of_rooms=r.number_of_rooms,amenities=r.amenities,check_in_time=r.check_in_time,
    check_out_time=r.check_out_time,price_per_night=r.price_per_night,latitude=r.latitude,longitude=r.longitude,child_price=r.child_price,
    taxes_amount=r.taxes_amount,fees_amount=r.fees_amount,price_unit_confirmed=r.price_unit_confirmed,group_capacity=r.group_capacity,
    activity_type_slugs=r.activity_type_slugs,listing_kind=r.listing_kind,pricing_mode=r.pricing_mode,
    service_duration_minutes=r.service_duration_minutes,service_operating_days=r.service_operating_days,
    service_minimum_guests=r.service_minimum_guests,service_pickup_mode=r.service_pickup_mode,service_pickup_notes=r.service_pickup_notes,
    review_note=null,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  from public.listings r where s.id=v_source.id and r.id=v_revision.id;

  -- Move listing gallery from revision to live listing.
  delete from public.listing_images where listing_id=v_source.id;
  update public.listing_images set listing_id=v_source.id where listing_id=v_revision.id;

  -- Replace one-row listing child records.
  delete from public.listing_policies where listing_id=v_source.id;
  update public.listing_policies set listing_id=v_source.id where listing_id=v_revision.id;

  delete from public.listing_package_details where listing_id=v_source.id;
  update public.listing_package_details set listing_id=v_source.id where listing_id=v_revision.id;

  delete from public.transfer_route_details where listing_id=v_source.id;
  update public.transfer_route_details set listing_id=v_source.id where listing_id=v_revision.id;

  delete from public.package_transfer_options where listing_id=v_source.id;
  update public.package_transfer_options set listing_id=v_source.id where listing_id=v_revision.id;

  delete from public.listing_service_pickup_locations where listing_id=v_source.id;
  update public.listing_service_pickup_locations set listing_id=v_source.id where listing_id=v_revision.id;

  -- Component pricing is snapshotted on bookings, so the approved revision can replace the live component set atomically.
  delete from public.listing_price_components where listing_id=v_source.id;
  update public.listing_price_components
    set listing_id=v_source.id,revision_source_component_id=null
  where listing_id=v_revision.id;

  -- Existing rooms keep their IDs so inventory and bookings remain valid.
  update public.accommodation_rooms src set
    name=rev.name,description=rev.description,maximum_guests=rev.maximum_guests,adult_capacity=rev.adult_capacity,
    child_capacity=rev.child_capacity,bed_configuration=rev.bed_configuration,room_size_sqm=rev.room_size_sqm,
    view_type=rev.view_type,quantity=rev.quantity,base_price=rev.base_price,currency=rev.currency,amenities=rev.amenities,
    is_active=rev.is_active,sort_order=rev.sort_order,updated_at=now()
  from public.accommodation_rooms rev
  where src.id=rev.revision_source_room_id and src.listing_id=v_source.id and rev.listing_id=v_revision.id;

  -- Rooms removed from the revision are deactivated rather than deleted, preserving historical/FK references.
  update public.accommodation_rooms src set is_active=false,updated_at=now()
  where src.listing_id=v_source.id
    and not exists(select 1 from public.accommodation_rooms rev where rev.listing_id=v_revision.id and rev.revision_source_room_id=src.id);

  -- Move revised room images onto the stable live room IDs.
  delete from public.room_images img
  using public.accommodation_rooms src
  where img.room_id=src.id and src.listing_id=v_source.id;

  update public.room_images img set room_id=rev.revision_source_room_id
  from public.accommodation_rooms rev
  where img.room_id=rev.id and rev.listing_id=v_revision.id and rev.revision_source_room_id is not null;

  -- Update stable rate-plan IDs from mapped revision rate plans.
  update public.room_rate_plans src set
    name=rev.name,nightly_price=rev.nightly_price,meal_plan=rev.meal_plan,free_cancellation=rev.free_cancellation,
    cancellation_deadline_hours=rev.cancellation_deadline_hours,is_refundable=rev.is_refundable,is_active=rev.is_active,
    sort_order=rev.sort_order,pricing_mode=rev.pricing_mode,adjustment_value=rev.adjustment_value,cancellation_type=rev.cancellation_type,
    cancellation_penalty=rev.cancellation_penalty,meal_plan_code=rev.meal_plan_code,benefits=rev.benefits,
    minimum_stay=rev.minimum_stay,maximum_stay=rev.maximum_stay,min_advance_hours=rev.min_advance_hours,
    max_advance_days=rev.max_advance_days,occupancy_pricing=rev.occupancy_pricing,updated_at=now()
  from public.room_rate_plans rev
  join public.accommodation_rooms rr on rr.id=rev.room_id and rr.listing_id=v_revision.id
  where src.id=rev.revision_source_rate_plan_id;

  -- Deactivate source rate plans omitted by the revision.
  update public.room_rate_plans src set is_active=false,updated_at=now()
  where exists(select 1 from public.accommodation_rooms room where room.id=src.room_id and room.listing_id=v_source.id)
    and not exists(
      select 1 from public.room_rate_plans rev
      join public.accommodation_rooms rr on rr.id=rev.room_id and rr.listing_id=v_revision.id
      where rev.revision_source_rate_plan_id=src.id
    );

  -- Map parent links for stable plans while clone rows still exist.
  update public.room_rate_plans src set parent_rate_plan_id=
    case when rev.parent_rate_plan_id is null then null else coalesce(parent_rev.revision_source_rate_plan_id,parent_rev.id) end
  from public.room_rate_plans rev
  left join public.room_rate_plans parent_rev on parent_rev.id=rev.parent_rate_plan_id
  join public.accommodation_rooms rr on rr.id=rev.room_id and rr.listing_id=v_revision.id
  where src.id=rev.revision_source_rate_plan_id;

  -- New revision rate plans keep their IDs; map them to stable/new target rooms and parent plans.
  update public.room_rate_plans rev set parent_rate_plan_id=coalesce(parent_rev.revision_source_rate_plan_id,parent_rev.id)
  from public.room_rate_plans parent_rev
  where rev.revision_source_rate_plan_id is null
    and rev.parent_rate_plan_id=parent_rev.id
    and exists(select 1 from public.accommodation_rooms rr where rr.id=rev.room_id and rr.listing_id=v_revision.id);

  update public.room_rate_plans rev set
    room_id=coalesce(rr.revision_source_room_id,rr.id),revision_source_rate_plan_id=null
  from public.accommodation_rooms rr
  where rev.room_id=rr.id and rr.listing_id=v_revision.id and rev.revision_source_rate_plan_id is null;

  -- Clone rate-plan rows that mapped to stable plans have been merged and can now be removed.
  delete from public.room_rate_plans rev
  using public.accommodation_rooms rr
  where rev.room_id=rr.id and rr.listing_id=v_revision.id and rev.revision_source_rate_plan_id is not null;

  -- New rooms keep their revision IDs and become live rooms. Mapped clone rooms are removed after images/rates are merged.
  update public.accommodation_rooms set listing_id=v_source.id,revision_source_room_id=null
  where listing_id=v_revision.id and revision_source_room_id is null;

  delete from public.accommodation_rooms where listing_id=v_revision.id and revision_source_room_id is not null;

  -- Bring live room inventory totals in line with approved room quantities without reducing below committed demand.
  for v_room in select id,quantity from public.accommodation_rooms where listing_id=v_source.id loop
    update public.room_availability
      set total_quantity=v_room.quantity,
          sellable_quantity=least(sellable_quantity,v_room.quantity),
          updated_at=now()
    where room_id=v_room.id and available_date>=current_date;
    for v_date in select available_date from public.room_availability where room_id=v_room.id and available_date>=current_date loop
      perform private.recalculate_room_inventory(v_room.id,v_date);
    end loop;
  end loop;

  select owner_id into v_owner from public.businesses where id=v_source.business_id;

  insert into public.review_history(target_type,target_id,previous_status,new_status,note,reviewed_by)
  values ('listing',v_source.id,v_source.status::text,v_source.status::text,
          coalesce(nullif(trim(p_note),''),'Published revision approved'),auth.uid());

  delete from public.listings where id=v_revision.id;

  perform private.create_operator_notification(
    v_owner,v_source.business_id,'listing_published','Listing revision approved',
    'Your approved changes to '||v_source.title||' are now live.',null,v_source.id,null,
    'operator-content.html?listing='||v_source.id::text
  );

  select * into v_source from public.listings where id=v_source.id;
  return v_source;
end;
$$;

create or replace function public.admin_review_listing(p_listing_id uuid,p_status public.listing_status,p_note text default null)
returns public.listings
language plpgsql
security definer
set search_path=''
as $$
declare
  v_previous public.listing_status;
  v_listing public.listings;
  v_source_id uuid;
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if p_status not in ('published','changes_requested','rejected','paused') then raise exception 'Invalid administrator listing decision'; end if;

  select status,revision_of_listing_id into v_previous,v_source_id from public.listings where id=p_listing_id for update;
  if v_previous is null then raise exception 'Listing not found'; end if;

  if v_source_id is not null then
    if p_status='paused' then raise exception 'A revision cannot be paused; review or reject it'; end if;
    if v_previous<>'pending_review' then raise exception 'Only pending revisions can receive a review decision'; end if;
    if p_status='published' then return private.apply_listing_revision(p_listing_id,p_note); end if;
    update public.listings set status=p_status,review_note=nullif(trim(p_note),''),reviewed_by=auth.uid(),reviewed_at=now()
    where id=p_listing_id returning * into v_listing;
    insert into public.review_history(target_type,target_id,previous_status,new_status,note,reviewed_by)
    values ('listing_revision',p_listing_id,v_previous::text,p_status::text,nullif(trim(p_note),''),auth.uid());
    return v_listing;
  end if;

  if p_status in ('published','changes_requested','rejected') and v_previous<>'pending_review' then raise exception 'Only pending listings can receive a review decision'; end if;
  if p_status='paused' and v_previous<>'published' then raise exception 'Only published listings can be paused'; end if;
  if p_status='published' and not exists(
    select 1 from public.listings l join public.businesses b on b.id=l.business_id
    where l.id=p_listing_id and b.status='verified' and b.is_active
  ) then raise exception 'Only listings from verified businesses can be published'; end if;

  update public.listings set status=p_status,review_note=nullif(trim(p_note),''),reviewed_by=auth.uid(),reviewed_at=now(),is_active=p_status<>'paused'
  where id=p_listing_id returning * into v_listing;
  insert into public.review_history(target_type,target_id,previous_status,new_status,note,reviewed_by)
  values ('listing',p_listing_id,v_previous::text,p_status::text,nullif(trim(p_note),''),auth.uid());
  return v_listing;
end;
$$;

create or replace function public.submit_listing(p_listing_id uuid)
returns public.listings
language plpgsql
security invoker
set search_path=''
as $$
declare v_listing public.listings;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.has_listing_permission(p_listing_id,'content',auth.uid()) then raise exception 'Listing content access denied'; end if;
  update public.listings set status='pending_review'
  where id=p_listing_id and status in ('draft','changes_requested','rejected','paused')
  returning * into v_listing;
  if v_listing.id is null then raise exception 'Listing is not eligible for submission'; end if;
  return v_listing;
end;
$$;

create or replace function public.withdraw_listing_for_edit(p_listing_id uuid)
returns public.listings
language plpgsql
security invoker
set search_path=''
as $$
declare v_listing public.listings;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.has_listing_permission(p_listing_id,'content',auth.uid()) then raise exception 'Listing content access denied'; end if;
  perform set_config('app.listing_withdraw_for_edit','true',true);
  update public.listings set status='draft' where id=p_listing_id and status='pending_review' returning * into v_listing;
  if v_listing.id is null then raise exception 'Only a pending listing can be withdrawn for editing'; end if;
  return v_listing;
end;
$$;

revoke all on function public.submit_listing(uuid) from public,anon,authenticated;
grant execute on function public.submit_listing(uuid) to authenticated;
revoke all on function public.withdraw_listing_for_edit(uuid) from public,anon,authenticated;
grant execute on function public.withdraw_listing_for_edit(uuid) to authenticated;