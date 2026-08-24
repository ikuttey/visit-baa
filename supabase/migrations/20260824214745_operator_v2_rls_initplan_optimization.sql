-- Cache auth.uid() once per statement in the V2 content policies.
drop policy if exists listings_select_business_access on public.listings;
create policy listings_select_business_access on public.listings for select to authenticated using (
  private.is_admin((select auth.uid()))
  or private.has_business_permission(business_id,'content',(select auth.uid()))
  or private.has_business_permission(business_id,'reservations',(select auth.uid()))
  or private.has_business_permission(business_id,'finance',(select auth.uid()))
);
drop policy if exists listings_insert_content on public.listings;
create policy listings_insert_content on public.listings for insert to authenticated with check (private.has_verified_business_permission(business_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists listings_update_content on public.listings;
create policy listings_update_content on public.listings for update to authenticated using (private.has_verified_business_permission(business_id,'content',(select auth.uid())) or private.is_admin((select auth.uid()))) with check (private.has_verified_business_permission(business_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists listings_delete_editable_content on public.listings;
create policy listings_delete_editable_content on public.listings for delete to authenticated using (private.is_admin((select auth.uid())) or (private.has_verified_business_permission(business_id,'content',(select auth.uid())) and status in ('draft','changes_requested','rejected','paused')));

drop policy if exists rooms_business_content_select on public.accommodation_rooms;
create policy rooms_business_content_select on public.accommodation_rooms for select to authenticated using (private.has_listing_permission(listing_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists rooms_business_content_insert on public.accommodation_rooms;
create policy rooms_business_content_insert on public.accommodation_rooms for insert to authenticated with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists rooms_business_content_update on public.accommodation_rooms;
create policy rooms_business_content_update on public.accommodation_rooms for update to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid()))) with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists rooms_business_content_delete on public.accommodation_rooms;
create policy rooms_business_content_delete on public.accommodation_rooms for delete to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));

drop policy if exists room_images_business_content_select on public.room_images;
create policy room_images_business_content_select on public.room_images for select to authenticated using (private.has_room_permission(room_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists room_images_business_content_insert on public.room_images;
create policy room_images_business_content_insert on public.room_images for insert to authenticated with check (private.can_edit_room_content(room_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists room_images_business_content_update on public.room_images;
create policy room_images_business_content_update on public.room_images for update to authenticated using (private.can_edit_room_content(room_id,(select auth.uid())) or private.is_admin((select auth.uid()))) with check (private.can_edit_room_content(room_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists room_images_business_content_delete on public.room_images;
create policy room_images_business_content_delete on public.room_images for delete to authenticated using (private.can_edit_room_content(room_id,(select auth.uid())) or private.is_admin((select auth.uid())));

drop policy if exists room_rate_plans_business_content_select on public.room_rate_plans;
create policy room_rate_plans_business_content_select on public.room_rate_plans for select to authenticated using (private.has_room_permission(room_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists room_rate_plans_business_content_insert on public.room_rate_plans;
create policy room_rate_plans_business_content_insert on public.room_rate_plans for insert to authenticated with check (private.can_edit_room_content(room_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists room_rate_plans_business_content_update on public.room_rate_plans;
create policy room_rate_plans_business_content_update on public.room_rate_plans for update to authenticated using (private.can_edit_room_content(room_id,(select auth.uid())) or private.is_admin((select auth.uid()))) with check (private.can_edit_room_content(room_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists room_rate_plans_business_content_delete on public.room_rate_plans;
create policy room_rate_plans_business_content_delete on public.room_rate_plans for delete to authenticated using (private.can_edit_room_content(room_id,(select auth.uid())) or private.is_admin((select auth.uid())));

drop policy if exists listing_policies_business_content_select on public.listing_policies;
create policy listing_policies_business_content_select on public.listing_policies for select to authenticated using (private.has_listing_permission(listing_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists listing_policies_business_content_insert on public.listing_policies;
create policy listing_policies_business_content_insert on public.listing_policies for insert to authenticated with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists listing_policies_business_content_update on public.listing_policies;
create policy listing_policies_business_content_update on public.listing_policies for update to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid()))) with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists listing_policies_business_content_delete on public.listing_policies;
create policy listing_policies_business_content_delete on public.listing_policies for delete to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));

drop policy if exists listing_images_content_or_public_select on public.listing_images;
create policy listing_images_content_or_public_select on public.listing_images for select to authenticated using (private.is_public_listing(listing_id) or private.has_listing_permission(listing_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists listing_images_content_insert on public.listing_images;
create policy listing_images_content_insert on public.listing_images for insert to authenticated with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists listing_images_content_update on public.listing_images;
create policy listing_images_content_update on public.listing_images for update to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid()))) with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists listing_images_content_delete on public.listing_images;
create policy listing_images_content_delete on public.listing_images for delete to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));

drop policy if exists price_components_content_or_public_select on public.listing_price_components;
create policy price_components_content_or_public_select on public.listing_price_components for select to authenticated using (private.is_public_listing(listing_id) or private.has_listing_permission(listing_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists price_components_content_insert on public.listing_price_components;
create policy price_components_content_insert on public.listing_price_components for insert to authenticated with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists price_components_content_update on public.listing_price_components;
create policy price_components_content_update on public.listing_price_components for update to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid()))) with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists price_components_content_delete on public.listing_price_components;
create policy price_components_content_delete on public.listing_price_components for delete to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));

drop policy if exists price_tiers_content_or_public_select on public.listing_price_tiers;
create policy price_tiers_content_or_public_select on public.listing_price_tiers for select to authenticated using (exists(select 1 from public.listing_price_components c where c.id=component_id and (private.is_public_listing(c.listing_id) or private.has_listing_permission(c.listing_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())))));
drop policy if exists price_tiers_content_insert on public.listing_price_tiers;
create policy price_tiers_content_insert on public.listing_price_tiers for insert to authenticated with check (exists(select 1 from public.listing_price_components c where c.id=component_id and (private.can_edit_listing_content(c.listing_id,(select auth.uid())) or private.is_admin((select auth.uid())))));
drop policy if exists price_tiers_content_update on public.listing_price_tiers;
create policy price_tiers_content_update on public.listing_price_tiers for update to authenticated using (exists(select 1 from public.listing_price_components c where c.id=component_id and (private.can_edit_listing_content(c.listing_id,(select auth.uid())) or private.is_admin((select auth.uid()))))) with check (exists(select 1 from public.listing_price_components c where c.id=component_id and (private.can_edit_listing_content(c.listing_id,(select auth.uid())) or private.is_admin((select auth.uid())))));
drop policy if exists price_tiers_content_delete on public.listing_price_tiers;
create policy price_tiers_content_delete on public.listing_price_tiers for delete to authenticated using (exists(select 1 from public.listing_price_components c where c.id=component_id and (private.can_edit_listing_content(c.listing_id,(select auth.uid())) or private.is_admin((select auth.uid())))));

drop policy if exists package_details_content_select on public.listing_package_details;
create policy package_details_content_select on public.listing_package_details for select to authenticated using (private.has_listing_permission(listing_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists package_details_content_insert on public.listing_package_details;
create policy package_details_content_insert on public.listing_package_details for insert to authenticated with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists package_details_content_update on public.listing_package_details;
create policy package_details_content_update on public.listing_package_details for update to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid()))) with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists package_details_content_delete on public.listing_package_details;
create policy package_details_content_delete on public.listing_package_details for delete to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));

drop policy if exists package_transfers_content_select on public.package_transfer_options;
create policy package_transfers_content_select on public.package_transfer_options for select to authenticated using (private.has_listing_permission(listing_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists package_transfers_content_insert on public.package_transfer_options;
create policy package_transfers_content_insert on public.package_transfer_options for insert to authenticated with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists package_transfers_content_update on public.package_transfer_options;
create policy package_transfers_content_update on public.package_transfer_options for update to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid()))) with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists package_transfers_content_delete on public.package_transfer_options;
create policy package_transfers_content_delete on public.package_transfer_options for delete to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));

drop policy if exists service_pickup_locations_content_select on public.listing_service_pickup_locations;
create policy service_pickup_locations_content_select on public.listing_service_pickup_locations for select to authenticated using (private.has_listing_permission(listing_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists service_pickup_locations_content_insert on public.listing_service_pickup_locations;
create policy service_pickup_locations_content_insert on public.listing_service_pickup_locations for insert to authenticated with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists service_pickup_locations_content_update on public.listing_service_pickup_locations;
create policy service_pickup_locations_content_update on public.listing_service_pickup_locations for update to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid()))) with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists service_pickup_locations_content_delete on public.listing_service_pickup_locations;
create policy service_pickup_locations_content_delete on public.listing_service_pickup_locations for delete to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));

drop policy if exists transfer_routes_content_select on public.transfer_route_details;
create policy transfer_routes_content_select on public.transfer_route_details for select to authenticated using (private.has_listing_permission(listing_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists transfer_routes_content_insert on public.transfer_route_details;
create policy transfer_routes_content_insert on public.transfer_route_details for insert to authenticated with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists transfer_routes_content_update on public.transfer_route_details;
create policy transfer_routes_content_update on public.transfer_route_details for update to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid()))) with check (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists transfer_routes_content_delete on public.transfer_route_details;
create policy transfer_routes_content_delete on public.transfer_route_details for delete to authenticated using (private.can_edit_listing_content(listing_id,(select auth.uid())) or private.is_admin((select auth.uid())));