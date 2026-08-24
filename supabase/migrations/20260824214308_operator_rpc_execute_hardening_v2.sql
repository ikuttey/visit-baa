revoke all on function public.operator_accessible_businesses() from public, anon;
grant execute on function public.operator_accessible_businesses() to authenticated;

revoke all on function public.operator_business_analytics(uuid,date,date) from public, anon;
grant execute on function public.operator_business_analytics(uuid,date,date) to authenticated;
revoke all on function public.operator_listing_analytics(uuid,date,date) from public, anon;
grant execute on function public.operator_listing_analytics(uuid,date,date) to authenticated;
revoke all on function public.operator_listing_analytics_v2(uuid,date,date) from public, anon;
grant execute on function public.operator_listing_analytics_v2(uuid,date,date) to authenticated;

revoke all on function public.operator_generate_listing_schedule(uuid,date,date) from public, anon;
grant execute on function public.operator_generate_listing_schedule(uuid,date,date) to authenticated;
revoke all on function public.operator_set_room_calendar_range(uuid,uuid,date,date,integer,numeric,integer,integer,integer,integer,boolean,boolean,boolean,boolean) from public, anon;
grant execute on function public.operator_set_room_calendar_range(uuid,uuid,date,date,integer,numeric,integer,integer,integer,integer,boolean,boolean,boolean,boolean) to authenticated;

revoke all on function public.operator_record_service_payment(uuid,boolean,text) from public, anon;
grant execute on function public.operator_record_service_payment(uuid,boolean,text) to authenticated;
revoke all on function public.operator_review_payment_reference(uuid,text,text) from public, anon;
grant execute on function public.operator_review_payment_reference(uuid,text,text) to authenticated;
revoke all on function public.operator_update_booking_note(uuid,text) from public, anon;
grant execute on function public.operator_update_booking_note(uuid,text) to authenticated;

revoke all on function public.owner_add_business_staff(uuid,text,text) from public, anon;
grant execute on function public.owner_add_business_staff(uuid,text,text) to authenticated;
revoke all on function public.owner_list_business_staff(uuid) from public, anon;
grant execute on function public.owner_list_business_staff(uuid) to authenticated;
revoke all on function public.owner_update_business_staff(uuid,uuid,text,boolean) from public, anon;
grant execute on function public.owner_update_business_staff(uuid,uuid,text,boolean) to authenticated;

-- Explicitly harden the remaining operator-only and admin/operator workflow RPCs.
revoke all on function public.operator_quote_booking(uuid,numeric,numeric,numeric,text) from public, anon;
grant execute on function public.operator_quote_booking(uuid,numeric,numeric,numeric,text) to authenticated;
revoke all on function public.operator_update_booking(uuid,public.enquiry_status,text) from public, anon;
grant execute on function public.operator_update_booking(uuid,public.enquiry_status,text) to authenticated;
revoke all on function public.operator_set_room_availability_range(uuid,date,date,integer,boolean,numeric) from public, anon;
grant execute on function public.operator_set_room_availability_range(uuid,date,date,integer,boolean,numeric) to authenticated;
revoke all on function public.create_external_accommodation_booking(uuid,text,date,date,integer,text,text,text) from public, anon;
grant execute on function public.create_external_accommodation_booking(uuid,text,date,date,integer,text,text,text) to authenticated;
revoke all on function public.cancel_external_accommodation_booking(uuid) from public, anon;
grant execute on function public.cancel_external_accommodation_booking(uuid) to authenticated;
revoke all on function public.create_listing_revision(uuid) from public, anon;
grant execute on function public.create_listing_revision(uuid) to authenticated;
revoke all on function public.operator_report_review(uuid) from public, anon;
grant execute on function public.operator_report_review(uuid) to authenticated;
revoke all on function public.submit_business(uuid) from public, anon;
grant execute on function public.submit_business(uuid) to authenticated;
revoke all on function public.request_trip_bookings(uuid,uuid) from public, anon;
grant execute on function public.request_trip_bookings(uuid,uuid) to authenticated;
revoke all on function public.traveler_cancel_booking(uuid) from public, anon;
grant execute on function public.traveler_cancel_booking(uuid) to authenticated;
revoke all on function public.admin_review_business(uuid,public.business_status,text) from public, anon;
grant execute on function public.admin_review_business(uuid,public.business_status,text) to authenticated;
revoke all on function public.admin_review_listing(uuid,public.listing_status,text) from public, anon;
grant execute on function public.admin_review_listing(uuid,public.listing_status,text) to authenticated;

-- These are intentionally public customer-facing endpoints. Lock the grants to only
-- the roles that need them rather than relying on PostgreSQL's default PUBLIC grant.
revoke all on function public.create_booking_request(uuid,uuid,uuid,uuid,date,date,time,integer,integer,integer,text,text,text,text) from public;
grant execute on function public.create_booking_request(uuid,uuid,uuid,uuid,date,date,time,integer,integer,integer,text,text,text,text) to anon, authenticated;
revoke all on function public.create_package_booking_request(uuid,uuid,date,time,integer,integer,text,text,text,text,uuid,uuid) from public;
grant execute on function public.create_package_booking_request(uuid,uuid,date,time,integer,integer,text,text,text,text,uuid,uuid) to anon, authenticated;
revoke all on function public.create_priced_booking_request(uuid,uuid,uuid,uuid,date,date,time,integer,integer,integer,text,text,text,text,uuid[],uuid,uuid) from public;
grant execute on function public.create_priced_booking_request(uuid,uuid,uuid,uuid,date,date,time,integer,integer,integer,text,text,text,text,uuid[],uuid,uuid) to anon, authenticated;
revoke all on function public.track_listing_view(uuid,uuid) from public;
grant execute on function public.track_listing_view(uuid,uuid) to anon, authenticated;