-- Visit Baa row-level security, API grants, and access policies.

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_images enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.availability enable row level security;
alter table public.booking_enquiries enable row level security;
alter table public.review_history enable row level security;

-- Remove broad defaults before granting the minimum browser permissions.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant usage on schema private to anon, authenticated;

grant select on public.public_businesses, public.public_listings, public.public_availability to anon, authenticated;
grant select on public.business_images, public.listing_images to anon;

grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;

grant select on public.businesses to authenticated;
grant update (
  contact_person_name,
  business_name,
  registration_number,
  category,
  island,
  email,
  phone,
  business_address,
  website_url,
  description,
  logo_path,
  public_contact,
  accuracy_confirmed,
  terms_accepted
) on public.businesses to authenticated;

grant select, insert, update, delete on public.business_images to authenticated;
grant select, insert, update, delete on public.listings to authenticated;
grant select, insert, update, delete on public.listing_images to authenticated;
grant select, insert, update, delete on public.availability to authenticated;
grant insert on public.booking_enquiries to anon, authenticated;
grant select on public.booking_enquiries to authenticated;
grant update (status, operator_response) on public.booking_enquiries to authenticated;
grant select on public.review_history to authenticated;
grant usage, select on sequence public.review_history_id_seq to authenticated;

grant execute on function public.submit_listing(uuid) to authenticated;
grant execute on function public.submit_business(uuid) to authenticated;
grant execute on function public.admin_review_business(uuid, public.business_status, text) to authenticated;
grant execute on function public.admin_review_listing(uuid, public.listing_status, text) to authenticated;

revoke all on function private.is_admin(uuid) from public;
revoke all on function private.owns_business(uuid, uuid) from public;
revoke all on function private.owns_listing(uuid, uuid) from public;
revoke all on function private.owns_verified_business(uuid, uuid) from public;
revoke all on function private.is_public_listing(uuid) from public;
grant execute on function private.is_admin(uuid) to authenticated;
grant execute on function private.owns_business(uuid, uuid) to authenticated;
grant execute on function private.owns_listing(uuid, uuid) to authenticated;
grant execute on function private.owns_verified_business(uuid, uuid) to authenticated;
grant execute on function private.is_public_listing(uuid) to anon, authenticated;

-- Profiles and roles --------------------------------------------------------

create policy "profiles_select_own_or_admin"
on public.profiles for select to authenticated
using ((select auth.uid()) = id or (select private.is_admin()));

create policy "profiles_update_own"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "roles_select_own_or_admin"
on public.user_roles for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));

-- Businesses ---------------------------------------------------------------

create policy "businesses_select_own_or_admin"
on public.businesses for select to authenticated
using (owner_id = (select auth.uid()) or (select private.is_admin()));

create policy "businesses_update_own_or_admin"
on public.businesses for update to authenticated
using (owner_id = (select auth.uid()) or (select private.is_admin()))
with check (owner_id = (select auth.uid()) or (select private.is_admin()));

create policy "business_images_select_own_admin_or_public"
on public.business_images for select to anon, authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = business_id
      and b.status = 'verified'
      and b.is_active
  )
  or exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
  or (select private.is_admin())
);

create policy "business_images_insert_own"
on public.business_images for insert to authenticated
with check ((select private.owns_business(business_id)) or (select private.is_admin()));

create policy "business_images_update_own"
on public.business_images for update to authenticated
using ((select private.owns_business(business_id)) or (select private.is_admin()))
with check ((select private.owns_business(business_id)) or (select private.is_admin()));

create policy "business_images_delete_own"
on public.business_images for delete to authenticated
using ((select private.owns_business(business_id)) or (select private.is_admin()));

-- Listings and media -------------------------------------------------------

create policy "listings_select_own_or_admin"
on public.listings for select to authenticated
using ((select private.owns_listing(id)) or (select private.is_admin()));

create policy "listings_insert_verified_owner"
on public.listings for insert to authenticated
with check ((select private.owns_verified_business(business_id)) or (select private.is_admin()));

create policy "listings_update_verified_owner_or_admin"
on public.listings for update to authenticated
using ((select private.owns_verified_business(business_id)) or (select private.is_admin()))
with check ((select private.owns_verified_business(business_id)) or (select private.is_admin()));

create policy "listings_delete_verified_owner_or_admin"
on public.listings for delete to authenticated
using ((select private.owns_verified_business(business_id)) or (select private.is_admin()));

create policy "listing_images_select_owner_admin_or_public"
on public.listing_images for select to anon, authenticated
using (
  (select private.is_public_listing(listing_id))
  or (select private.owns_listing(listing_id))
  or (select private.is_admin())
);

create policy "listing_images_insert_owner"
on public.listing_images for insert to authenticated
with check (
  exists (
    select 1 from public.listings l
    where l.id = listing_id
      and (select private.owns_verified_business(l.business_id))
  )
  or (select private.is_admin())
);

create policy "listing_images_update_owner"
on public.listing_images for update to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_listing(listing_id)) or (select private.is_admin()));

create policy "listing_images_delete_owner"
on public.listing_images for delete to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()));

-- Availability -------------------------------------------------------------

create policy "availability_select_owner_or_admin"
on public.availability for select to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()));

create policy "availability_insert_owner"
on public.availability for insert to authenticated
with check ((select private.owns_listing(listing_id)) or (select private.is_admin()));

create policy "availability_update_owner"
on public.availability for update to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_listing(listing_id)) or (select private.is_admin()));

create policy "availability_delete_owner"
on public.availability for delete to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()));

-- Booking enquiries --------------------------------------------------------

create policy "enquiries_public_insert_published_listing"
on public.booking_enquiries for insert to anon, authenticated
with check ((select private.is_public_listing(listing_id)));

create policy "enquiries_operator_or_admin_select"
on public.booking_enquiries for select to authenticated
using (operator_id = (select auth.uid()) or (select private.is_admin()));

create policy "enquiries_operator_or_admin_update"
on public.booking_enquiries for update to authenticated
using (operator_id = (select auth.uid()) or (select private.is_admin()))
with check (operator_id = (select auth.uid()) or (select private.is_admin()));

-- Review history -----------------------------------------------------------

create policy "review_history_admin_select"
on public.review_history for select to authenticated
using ((select private.is_admin()));
