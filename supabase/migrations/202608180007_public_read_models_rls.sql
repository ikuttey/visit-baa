-- Restore anonymous access to the security-invoker public views without
-- granting access to private review, registration, or non-public contact data.

create or replace function private.public_business_contact(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when b.status='verified' and b.is_active and b.public_contact then
      jsonb_build_object('email',b.email,'phone',b.phone,'website_url',b.website_url,'business_address',b.business_address)
    else '{}'::jsonb end
    from public.businesses b where b.id=p_business_id
  ), '{}'::jsonb);
$$;

revoke all on function private.public_business_contact(uuid) from public, anon, authenticated;
grant execute on function private.public_business_contact(uuid) to anon, authenticated;

drop policy if exists "businesses_select_verified_public" on public.businesses;
create policy "businesses_select_verified_public" on public.businesses for select to anon
using (status='verified' and is_active);

drop policy if exists "listings_select_published_public" on public.listings;
create policy "listings_select_published_public" on public.listings for select to anon
using (status='published' and is_active and (select private.is_public_business(business_id)));

drop policy if exists "availability_select_published_public" on public.availability;
create policy "availability_select_published_public" on public.availability for select to anon
using (available_date >= current_date and not is_blocked and (select private.is_public_listing(listing_id)));

grant select (id,business_name,category,island,description,logo_path,status,is_active,updated_at) on public.businesses to anon;
grant select (id,business_id,title,category,island,summary,description,price,currency,price_unit,start_time,end_time,max_capacity,available_spaces,included_items,excluded_items,meeting_point,requirements,cancellation_information,cover_image_path,property_type,room_type,maximum_guests,number_of_rooms,amenities,check_in_time,check_out_time,price_per_night,status,is_active,updated_at) on public.listings to anon;
grant select (id,listing_id,available_date,start_time,end_time,max_capacity,remaining_spaces,is_blocked) on public.availability to anon;

create or replace view public.public_businesses
with (security_barrier = true, security_invoker = true)
as
select b.id,b.business_name,b.category,b.island,b.description,b.logo_path,
  c.contact->>'email' as contact_email,c.contact->>'phone' as contact_phone,
  c.contact->>'website_url' as website_url,c.contact->>'business_address' as business_address,
  b.updated_at
from public.businesses b
cross join lateral (select private.public_business_contact(b.id) as contact) c
where b.status='verified' and b.is_active;

create or replace view public.public_listings
with (security_barrier = true, security_invoker = true)
as
select l.id,l.business_id,b.business_name,b.logo_path as business_logo_path,l.title,l.category,l.island,l.summary,l.description,l.price,l.currency,l.price_unit,l.start_time,l.end_time,l.max_capacity,l.available_spaces,l.included_items,l.excluded_items,l.meeting_point,l.requirements,l.cancellation_information,l.cover_image_path,l.property_type,l.room_type,l.maximum_guests,l.number_of_rooms,l.amenities,l.check_in_time,l.check_out_time,l.price_per_night,
  c.contact->>'email' as contact_email,c.contact->>'phone' as contact_phone,c.contact->>'website_url' as website_url,
  l.updated_at
from public.listings l
join public.businesses b on b.id=l.business_id
cross join lateral (select private.public_business_contact(b.id) as contact) c
where l.status='published' and l.is_active and b.status='verified' and b.is_active;

grant select on public.public_businesses,public.public_listings,public.public_availability to anon,authenticated;
