-- Reservations staff can operate the accommodation calendar end-to-end.

drop policy if exists rooms_business_content_select on public.accommodation_rooms;
create policy rooms_business_content_select
on public.accommodation_rooms for select to authenticated
using (
  private.has_listing_permission(listing_id,'content',auth.uid())
  or private.has_listing_permission(listing_id,'calendar',auth.uid())
  or private.is_admin(auth.uid())
);

drop policy if exists room_rate_plans_business_content_select on public.room_rate_plans;
create policy room_rate_plans_business_content_select
on public.room_rate_plans for select to authenticated
using (
  private.has_room_permission(room_id,'content',auth.uid())
  or private.has_room_permission(room_id,'calendar',auth.uid())
  or private.is_admin(auth.uid())
);
