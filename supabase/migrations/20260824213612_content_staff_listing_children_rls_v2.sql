create or replace function private.can_edit_listing_content(p_listing_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.listings l
    where l.id=p_listing_id
      and l.status in ('draft','changes_requested','rejected','paused')
      and private.has_verified_business_permission(l.business_id,'content',coalesce(p_user_id,auth.uid()))
  );
$$;

create or replace function private.can_edit_room_content(p_room_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.accommodation_rooms r where r.id=p_room_id and private.can_edit_listing_content(r.listing_id,coalesce(p_user_id,auth.uid())));
$$;

-- Accommodation rooms
drop policy if exists rooms_owner_admin_select on public.accommodation_rooms;
create policy rooms_business_content_select on public.accommodation_rooms for select to authenticated
using (private.has_listing_permission(listing_id,'content',auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists rooms_owner_admin_insert on public.accommodation_rooms;
create policy rooms_business_content_insert on public.accommodation_rooms for insert to authenticated
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists rooms_owner_admin_update on public.accommodation_rooms;
create policy rooms_business_content_update on public.accommodation_rooms for update to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()))
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists rooms_owner_admin_delete on public.accommodation_rooms;
create policy rooms_business_content_delete on public.accommodation_rooms for delete to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));

-- Room images
drop policy if exists room_images_owner_admin_select on public.room_images;
create policy room_images_business_content_select on public.room_images for select to authenticated
using (private.has_room_permission(room_id,'content',auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists room_images_owner_admin_insert on public.room_images;
create policy room_images_business_content_insert on public.room_images for insert to authenticated
with check (private.can_edit_room_content(room_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists room_images_owner_admin_update on public.room_images;
create policy room_images_business_content_update on public.room_images for update to authenticated
using (private.can_edit_room_content(room_id,auth.uid()) or private.is_admin(auth.uid()))
with check (private.can_edit_room_content(room_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists room_images_owner_admin_delete on public.room_images;
create policy room_images_business_content_delete on public.room_images for delete to authenticated
using (private.can_edit_room_content(room_id,auth.uid()) or private.is_admin(auth.uid()));

-- Room rate plans
drop policy if exists room_rate_plans_owner_admin_select on public.room_rate_plans;
create policy room_rate_plans_business_content_select on public.room_rate_plans for select to authenticated
using (private.has_room_permission(room_id,'content',auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists room_rate_plans_owner_admin_insert on public.room_rate_plans;
create policy room_rate_plans_business_content_insert on public.room_rate_plans for insert to authenticated
with check (private.can_edit_room_content(room_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists room_rate_plans_owner_admin_update on public.room_rate_plans;
create policy room_rate_plans_business_content_update on public.room_rate_plans for update to authenticated
using (private.can_edit_room_content(room_id,auth.uid()) or private.is_admin(auth.uid()))
with check (private.can_edit_room_content(room_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists room_rate_plans_owner_admin_delete on public.room_rate_plans;
create policy room_rate_plans_business_content_delete on public.room_rate_plans for delete to authenticated
using (private.can_edit_room_content(room_id,auth.uid()) or private.is_admin(auth.uid()));

-- Listing policies
drop policy if exists listing_policies_owner_admin_select on public.listing_policies;
create policy listing_policies_business_content_select on public.listing_policies for select to authenticated
using (private.has_listing_permission(listing_id,'content',auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists listing_policies_owner_admin_insert on public.listing_policies;
create policy listing_policies_business_content_insert on public.listing_policies for insert to authenticated
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists listing_policies_owner_admin_update on public.listing_policies;
create policy listing_policies_business_content_update on public.listing_policies for update to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()))
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists listing_policies_owner_admin_delete on public.listing_policies;
create policy listing_policies_business_content_delete on public.listing_policies for delete to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));

-- Listing gallery
drop policy if exists listing_images_select_owner_admin_or_public on public.listing_images;
create policy listing_images_content_or_public_select on public.listing_images for select to authenticated
using (private.is_public_listing(listing_id) or private.has_listing_permission(listing_id,'content',auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists listing_images_insert_editable_owner on public.listing_images;
create policy listing_images_content_insert on public.listing_images for insert to authenticated
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists listing_images_update_verified_owner on public.listing_images;
create policy listing_images_content_update on public.listing_images for update to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()))
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists listing_images_delete_verified_owner on public.listing_images;
create policy listing_images_content_delete on public.listing_images for delete to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));

-- Listing price components
drop policy if exists price_components_owner_select on public.listing_price_components;
drop policy if exists price_components_public_or_owner_read on public.listing_price_components;
create policy price_components_content_or_public_select on public.listing_price_components for select to authenticated
using (private.is_public_listing(listing_id) or private.has_listing_permission(listing_id,'content',auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists price_components_owner_insert on public.listing_price_components;
create policy price_components_content_insert on public.listing_price_components for insert to authenticated
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists price_components_owner_update on public.listing_price_components;
create policy price_components_content_update on public.listing_price_components for update to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()))
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists price_components_owner_delete on public.listing_price_components;
create policy price_components_content_delete on public.listing_price_components for delete to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));

-- Listing price tiers
drop policy if exists price_tiers_owner_select on public.listing_price_tiers;
drop policy if exists price_tiers_public_or_owner_read on public.listing_price_tiers;
create policy price_tiers_content_or_public_select on public.listing_price_tiers for select to authenticated
using (exists(select 1 from public.listing_price_components c where c.id=component_id and (private.is_public_listing(c.listing_id) or private.has_listing_permission(c.listing_id,'content',auth.uid()) or private.is_admin(auth.uid()))));
drop policy if exists price_tiers_owner_insert on public.listing_price_tiers;
create policy price_tiers_content_insert on public.listing_price_tiers for insert to authenticated
with check (exists(select 1 from public.listing_price_components c where c.id=component_id and (private.can_edit_listing_content(c.listing_id,auth.uid()) or private.is_admin(auth.uid()))));
drop policy if exists price_tiers_owner_update on public.listing_price_tiers;
create policy price_tiers_content_update on public.listing_price_tiers for update to authenticated
using (exists(select 1 from public.listing_price_components c where c.id=component_id and (private.can_edit_listing_content(c.listing_id,auth.uid()) or private.is_admin(auth.uid()))))
with check (exists(select 1 from public.listing_price_components c where c.id=component_id and (private.can_edit_listing_content(c.listing_id,auth.uid()) or private.is_admin(auth.uid()))));
drop policy if exists price_tiers_owner_delete on public.listing_price_tiers;
create policy price_tiers_content_delete on public.listing_price_tiers for delete to authenticated
using (exists(select 1 from public.listing_price_components c where c.id=component_id and (private.can_edit_listing_content(c.listing_id,auth.uid()) or private.is_admin(auth.uid()))));

-- Package details
drop policy if exists package_details_owner_select on public.listing_package_details;
create policy package_details_content_select on public.listing_package_details for select to authenticated
using (private.has_listing_permission(listing_id,'content',auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists package_details_owner_insert on public.listing_package_details;
create policy package_details_content_insert on public.listing_package_details for insert to authenticated
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists package_details_owner_update on public.listing_package_details;
create policy package_details_content_update on public.listing_package_details for update to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()))
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists package_details_owner_delete on public.listing_package_details;
create policy package_details_content_delete on public.listing_package_details for delete to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));

-- Package transfer options
drop policy if exists package_transfers_owner_select on public.package_transfer_options;
create policy package_transfers_content_select on public.package_transfer_options for select to authenticated
using (private.has_listing_permission(listing_id,'content',auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists package_transfers_owner_insert on public.package_transfer_options;
create policy package_transfers_content_insert on public.package_transfer_options for insert to authenticated
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists package_transfers_owner_update on public.package_transfer_options;
create policy package_transfers_content_update on public.package_transfer_options for update to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()))
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists package_transfers_owner_delete on public.package_transfer_options;
create policy package_transfers_content_delete on public.package_transfer_options for delete to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));

-- Pickup locations
drop policy if exists service_pickup_locations_owner_select on public.listing_service_pickup_locations;
create policy service_pickup_locations_content_select on public.listing_service_pickup_locations for select to authenticated
using (private.has_listing_permission(listing_id,'content',auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists service_pickup_locations_owner_insert on public.listing_service_pickup_locations;
create policy service_pickup_locations_content_insert on public.listing_service_pickup_locations for insert to authenticated
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists service_pickup_locations_owner_update on public.listing_service_pickup_locations;
create policy service_pickup_locations_content_update on public.listing_service_pickup_locations for update to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()))
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists service_pickup_locations_owner_delete on public.listing_service_pickup_locations;
create policy service_pickup_locations_content_delete on public.listing_service_pickup_locations for delete to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));

-- Transfer route details
drop policy if exists transfer_routes_owner_admin_select on public.transfer_route_details;
create policy transfer_routes_content_select on public.transfer_route_details for select to authenticated
using (private.has_listing_permission(listing_id,'content',auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists transfer_routes_owner_admin_insert on public.transfer_route_details;
create policy transfer_routes_content_insert on public.transfer_route_details for insert to authenticated
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists transfer_routes_owner_admin_update on public.transfer_route_details;
create policy transfer_routes_content_update on public.transfer_route_details for update to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()))
with check (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists transfer_routes_owner_admin_delete on public.transfer_route_details;
create policy transfer_routes_content_delete on public.transfer_route_details for delete to authenticated
using (private.can_edit_listing_content(listing_id,auth.uid()) or private.is_admin(auth.uid()));