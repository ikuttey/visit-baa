-- Restore the pre-change default PUBLIC execution grants. No function bodies,
-- policies, triggers, or data are changed by this rollback.

grant execute on function public.submit_listing(uuid) to public;
grant execute on function public.submit_business(uuid) to public;
grant execute on function public.admin_review_business(uuid, public.business_status, text) to public;
grant execute on function public.admin_review_listing(uuid, public.listing_status, text) to public;
