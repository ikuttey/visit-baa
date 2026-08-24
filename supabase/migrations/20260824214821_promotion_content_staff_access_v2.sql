drop policy if exists promotions_owner_admin_all on public.promotions;
create policy promotions_content_manage on public.promotions for all to authenticated
using (private.has_listing_permission(listing_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())))
with check (private.has_listing_permission(listing_id,'content',(select auth.uid())) or private.is_admin((select auth.uid())));