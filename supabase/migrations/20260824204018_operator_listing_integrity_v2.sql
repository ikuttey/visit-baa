drop policy if exists rooms_owner_admin_all on public.accommodation_rooms;
create policy rooms_owner_admin_select
on public.accommodation_rooms for select to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()));
create policy rooms_owner_admin_insert
on public.accommodation_rooms for insert to authenticated
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));
create policy rooms_owner_admin_update
on public.accommodation_rooms for update to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));
create policy rooms_owner_admin_delete
on public.accommodation_rooms for delete to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));

drop policy if exists room_images_owner_admin_all on public.room_images;
create policy room_images_owner_admin_select
on public.room_images for select to authenticated
using ((select private.owns_room(room_id)) or (select private.is_admin()));
create policy room_images_owner_admin_insert
on public.room_images for insert to authenticated
with check ((select private.owns_editable_room(room_id)) or (select private.is_admin()));
create policy room_images_owner_admin_update
on public.room_images for update to authenticated
using ((select private.owns_editable_room(room_id)) or (select private.is_admin()))
with check ((select private.owns_editable_room(room_id)) or (select private.is_admin()));
create policy room_images_owner_admin_delete
on public.room_images for delete to authenticated
using ((select private.owns_editable_room(room_id)) or (select private.is_admin()));

drop policy if exists room_rate_plans_owner_admin_all on public.room_rate_plans;
create policy room_rate_plans_owner_admin_select
on public.room_rate_plans for select to authenticated
using ((select private.owns_room(room_id)) or (select private.is_admin()));
create policy room_rate_plans_owner_admin_insert
on public.room_rate_plans for insert to authenticated
with check ((select private.owns_editable_room(room_id)) or (select private.is_admin()));
create policy room_rate_plans_owner_admin_update
on public.room_rate_plans for update to authenticated
using ((select private.owns_editable_room(room_id)) or (select private.is_admin()))
with check ((select private.owns_editable_room(room_id)) or (select private.is_admin()));
create policy room_rate_plans_owner_admin_delete
on public.room_rate_plans for delete to authenticated
using ((select private.owns_editable_room(room_id)) or (select private.is_admin()));

drop policy if exists listing_policies_owner_admin_all on public.listing_policies;
create policy listing_policies_owner_admin_select
on public.listing_policies for select to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()));
create policy listing_policies_owner_admin_insert
on public.listing_policies for insert to authenticated
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));
create policy listing_policies_owner_admin_update
on public.listing_policies for update to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));
create policy listing_policies_owner_admin_delete
on public.listing_policies for delete to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));

drop policy if exists price_components_owner_all on public.listing_price_components;
create policy price_components_owner_select
on public.listing_price_components for select to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()));
create policy price_components_owner_insert
on public.listing_price_components for insert to authenticated
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));
create policy price_components_owner_update
on public.listing_price_components for update to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));
create policy price_components_owner_delete
on public.listing_price_components for delete to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));

drop policy if exists price_tiers_owner_all on public.listing_price_tiers;
create policy price_tiers_owner_select
on public.listing_price_tiers for select to authenticated
using (
  exists (
    select 1 from public.listing_price_components c
    where c.id=component_id
      and ((select private.owns_listing(c.listing_id)) or (select private.is_admin()))
  )
);
create policy price_tiers_owner_insert
on public.listing_price_tiers for insert to authenticated
with check (
  exists (
    select 1 from public.listing_price_components c
    where c.id=component_id
      and ((select private.owns_editable_listing(c.listing_id)) or (select private.is_admin()))
  )
);
create policy price_tiers_owner_update
on public.listing_price_tiers for update to authenticated
using (
  exists (
    select 1 from public.listing_price_components c
    where c.id=component_id
      and ((select private.owns_editable_listing(c.listing_id)) or (select private.is_admin()))
  )
)
with check (
  exists (
    select 1 from public.listing_price_components c
    where c.id=component_id
      and ((select private.owns_editable_listing(c.listing_id)) or (select private.is_admin()))
  )
);
create policy price_tiers_owner_delete
on public.listing_price_tiers for delete to authenticated
using (
  exists (
    select 1 from public.listing_price_components c
    where c.id=component_id
      and ((select private.owns_editable_listing(c.listing_id)) or (select private.is_admin()))
  )
);

drop policy if exists package_details_owner_all on public.listing_package_details;
create policy package_details_owner_select
on public.listing_package_details for select to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()));
create policy package_details_owner_insert
on public.listing_package_details for insert to authenticated
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));
create policy package_details_owner_update
on public.listing_package_details for update to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));
create policy package_details_owner_delete
on public.listing_package_details for delete to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));

drop policy if exists package_transfers_owner_all on public.package_transfer_options;
create policy package_transfers_owner_select
on public.package_transfer_options for select to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()));
create policy package_transfers_owner_insert
on public.package_transfer_options for insert to authenticated
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));
create policy package_transfers_owner_update
on public.package_transfer_options for update to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));
create policy package_transfers_owner_delete
on public.package_transfer_options for delete to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));

drop policy if exists service_pickup_locations_owner_all on public.listing_service_pickup_locations;
create policy service_pickup_locations_owner_select
on public.listing_service_pickup_locations for select to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()));
create policy service_pickup_locations_owner_insert
on public.listing_service_pickup_locations for insert to authenticated
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));
create policy service_pickup_locations_owner_update
on public.listing_service_pickup_locations for update to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));
create policy service_pickup_locations_owner_delete
on public.listing_service_pickup_locations for delete to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));

drop policy if exists transfer_routes_owner_admin_all on public.transfer_route_details;
create policy transfer_routes_owner_admin_select
on public.transfer_route_details for select to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()));
create policy transfer_routes_owner_admin_insert
on public.transfer_route_details for insert to authenticated
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));
create policy transfer_routes_owner_admin_update
on public.transfer_route_details for update to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));
create policy transfer_routes_owner_admin_delete
on public.transfer_route_details for delete to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));

create or replace function private.protect_business_review_fields()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if private.is_admin(auth.uid()) then
    return new;
  end if;

  if current_setting('app.business_resubmit',true)='true'
    and old.owner_id=auth.uid()
    and old.status in ('changes_requested','rejected')
    and new.status='pending_review'
    and new.owner_id is not distinct from old.owner_id
    and new.review_note is not distinct from old.review_note
    and new.reviewed_by is not distinct from old.reviewed_by
    and new.reviewed_at is not distinct from old.reviewed_at
    and new.is_active is not distinct from old.is_active then
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
    or new.review_note is distinct from old.review_note
    or new.is_active is distinct from old.is_active then
    raise exception 'Business approval fields can only be changed by an administrator';
  end if;

  if old.status='verified'
    and (
      new.business_name is distinct from old.business_name
      or new.registration_number is distinct from old.registration_number
      or new.category is distinct from old.category
      or new.island is distinct from old.island
      or new.business_address is distinct from old.business_address
    ) then
    new.status := 'pending_review';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  if new.status is distinct from old.status
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Business approval fields can only be changed by an administrator';
  end if;

  return new;
end;
$$;