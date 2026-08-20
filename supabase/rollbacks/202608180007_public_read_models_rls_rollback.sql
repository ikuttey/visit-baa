-- Roll back 202608180007_public_read_models_rls.sql to the pre-change view and
-- privilege state. This intentionally restores the previous public-read bug.

drop policy if exists "businesses_select_verified_public" on public.businesses;
drop policy if exists "listings_select_published_public" on public.listings;
drop policy if exists "availability_select_published_public" on public.availability;

revoke select (id,business_name,category,island,description,logo_path,status,is_active,updated_at) on public.businesses from anon;
revoke select (id,business_id,title,category,island,summary,description,price,currency,price_unit,start_time,end_time,max_capacity,available_spaces,included_items,excluded_items,meeting_point,requirements,cancellation_information,cover_image_path,property_type,room_type,maximum_guests,number_of_rooms,amenities,check_in_time,check_out_time,price_per_night,status,is_active,updated_at) on public.listings from anon;
revoke select (id,listing_id,available_date,start_time,end_time,max_capacity,remaining_spaces,is_blocked) on public.availability from anon;

create or replace view public.public_businesses
with (security_barrier = true, security_invoker = true)
as
select b.id,b.business_name,b.category,b.island,b.description,b.logo_path,
  case when b.public_contact then b.email end as contact_email,
  case when b.public_contact then b.phone end as contact_phone,
  case when b.public_contact then b.website_url end as website_url,
  case when b.public_contact then b.business_address end as business_address,
  b.updated_at
from public.businesses b
where b.status='verified' and b.is_active;

create or replace view public.public_listings
with (security_barrier = true, security_invoker = true)
as
select l.id,l.business_id,b.business_name,b.logo_path as business_logo_path,l.title,l.category,l.island,l.summary,l.description,l.price,l.currency,l.price_unit,l.start_time,l.end_time,l.max_capacity,l.available_spaces,l.included_items,l.excluded_items,l.meeting_point,l.requirements,l.cancellation_information,l.cover_image_path,l.property_type,l.room_type,l.maximum_guests,l.number_of_rooms,l.amenities,l.check_in_time,l.check_out_time,l.price_per_night,
  case when b.public_contact then b.email end as contact_email,
  case when b.public_contact then b.phone end as contact_phone,
  case when b.public_contact then b.website_url end as website_url,
  l.updated_at
from public.listings l join public.businesses b on b.id=l.business_id
where l.status='published' and l.is_active and b.status='verified' and b.is_active;

drop function if exists private.public_business_contact(uuid);
