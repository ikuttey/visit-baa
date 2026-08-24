drop policy if exists listing_arrival_guides_owner_select on public.listing_arrival_guides;
create policy listing_arrival_guides_arrival_select on public.listing_arrival_guides for select to authenticated
using (private.has_listing_permission(listing_id,'arrival',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists listing_arrival_guides_owner_insert on public.listing_arrival_guides;
create policy listing_arrival_guides_arrival_insert on public.listing_arrival_guides for insert to authenticated
with check (private.has_listing_permission(listing_id,'arrival',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists listing_arrival_guides_owner_update on public.listing_arrival_guides;
create policy listing_arrival_guides_arrival_update on public.listing_arrival_guides for update to authenticated
using (private.has_listing_permission(listing_id,'arrival',(select auth.uid())) or private.is_admin((select auth.uid())))
with check (private.has_listing_permission(listing_id,'arrival',(select auth.uid())) or private.is_admin((select auth.uid())));
drop policy if exists listing_arrival_guides_owner_delete on public.listing_arrival_guides;
create policy listing_arrival_guides_arrival_delete on public.listing_arrival_guides for delete to authenticated
using (private.has_listing_permission(listing_id,'arrival',(select auth.uid())) or private.is_admin((select auth.uid())));