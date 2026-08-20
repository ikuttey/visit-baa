-- Visit Baa private image buckets and object-level access policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('business-logos', 'business-logos', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('business-gallery', 'business-gallery', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('listing-covers', 'listing-covers', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('listing-gallery', 'listing-gallery', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Operators can upload only below a folder named with their Auth user ID.
create policy "storage_operator_insert_own_folder"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('business-logos','business-gallery','listing-covers','listing-gallery')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "storage_operator_update_own_folder"
on storage.objects for update to authenticated
using (
  bucket_id in ('business-logos','business-gallery','listing-covers','listing-gallery')
  and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin()))
)
with check (
  bucket_id in ('business-logos','business-gallery','listing-covers','listing-gallery')
  and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin()))
);

create policy "storage_operator_delete_own_folder"
on storage.objects for delete to authenticated
using (
  bucket_id in ('business-logos','business-gallery','listing-covers','listing-gallery')
  and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin()))
);

-- Owners/admins can read private uploads. Approved assets can be signed by
-- public clients only when referenced by a verified business/published listing.
create policy "storage_read_authorized_assets"
on storage.objects for select to anon, authenticated
using (
  (
    bucket_id in ('business-logos','business-gallery','listing-covers','listing-gallery')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  or (select private.is_admin())
  or (
    bucket_id = 'business-logos'
    and exists (
      select 1 from public.businesses b
      where b.logo_path = name and b.status = 'verified' and b.is_active
    )
  )
  or (
    bucket_id = 'business-gallery'
    and exists (
      select 1
      from public.business_images bi
      join public.businesses b on b.id = bi.business_id
      where bi.storage_path = name and b.status = 'verified' and b.is_active
    )
  )
  or (
    bucket_id = 'listing-covers'
    and exists (
      select 1
      from public.listings l
      join public.businesses b on b.id = l.business_id
      where l.cover_image_path = name
        and l.status = 'published' and l.is_active
        and b.status = 'verified' and b.is_active
    )
  )
  or (
    bucket_id = 'listing-gallery'
    and exists (
      select 1
      from public.listing_images li
      join public.listings l on l.id = li.listing_id
      join public.businesses b on b.id = l.business_id
      where li.storage_path = name
        and l.status = 'published' and l.is_active
        and b.status = 'verified' and b.is_active
    )
  )
);

