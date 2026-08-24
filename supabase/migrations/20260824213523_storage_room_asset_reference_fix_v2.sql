drop policy if exists storage_room_read_authorized on storage.objects;
create policy storage_room_read_authorized on storage.objects for select to authenticated
using (
  bucket_id='room-gallery'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or private.is_admin(auth.uid())
    or exists(
      select 1
      from public.room_images ri
      join public.accommodation_rooms r on r.id=ri.room_id
      where ri.storage_path=storage.objects.name
        and (
          private.is_public_listing(r.listing_id)
          or private.has_listing_permission(r.listing_id,'content',auth.uid())
        )
    )
  )
);