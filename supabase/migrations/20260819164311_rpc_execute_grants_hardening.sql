-- Restrict browser workflow RPCs to signed-in users. Function bodies,
-- ownership checks, RLS policies, triggers, and table data are unchanged.

revoke execute on function public.submit_listing(uuid) from public, anon;
revoke execute on function public.submit_business(uuid) from public, anon;
revoke execute on function public.admin_review_business(uuid, public.business_status, text) from public, anon;
revoke execute on function public.admin_review_listing(uuid, public.listing_status, text) from public, anon;

grant execute on function public.submit_listing(uuid) to authenticated;
grant execute on function public.submit_business(uuid) to authenticated;
grant execute on function public.admin_review_business(uuid, public.business_status, text) to authenticated;
grant execute on function public.admin_review_listing(uuid, public.listing_status, text) to authenticated;
