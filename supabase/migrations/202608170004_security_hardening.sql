-- Additional defense-in-depth for media ownership and verified-business scope.

create or replace function private.owns_verified_listing(p_listing_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings l
    join public.businesses b on b.id = l.business_id
    where l.id = p_listing_id
      and b.owner_id = coalesce(p_user_id, auth.uid())
      and b.status = 'verified'
      and b.is_active
  );
$$;

revoke all on function private.owns_verified_listing(uuid, uuid) from public;
grant execute on function private.is_admin(uuid) to anon, authenticated;
grant execute on function private.owns_business(uuid, uuid) to anon, authenticated;
grant execute on function private.owns_listing(uuid, uuid) to anon, authenticated;
grant execute on function private.owns_verified_listing(uuid, uuid) to authenticated;

create or replace function private.is_public_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.status = 'verified' and b.is_active
  );
$$;

revoke all on function private.is_public_business(uuid) from public;
grant execute on function private.is_public_business(uuid) to anon, authenticated;

drop policy if exists "business_images_select_own_admin_or_public" on public.business_images;
create policy "business_images_select_own_admin_or_public"
on public.business_images for select to anon, authenticated
using (
  (select private.is_public_business(business_id))
  or (select private.owns_business(business_id))
  or (select private.is_admin())
);

create or replace function private.is_public_storage_asset(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_bucket
    when 'business-logos' then exists (
      select 1 from public.businesses b
      where b.logo_path = p_name and b.status = 'verified' and b.is_active
    )
    when 'business-gallery' then exists (
      select 1 from public.business_images bi
      join public.businesses b on b.id = bi.business_id
      where bi.storage_path = p_name and b.status = 'verified' and b.is_active
    )
    when 'listing-covers' then exists (
      select 1 from public.listings l
      join public.businesses b on b.id = l.business_id
      where l.cover_image_path = p_name
        and l.status = 'published' and l.is_active
        and b.status = 'verified' and b.is_active
    )
    when 'listing-gallery' then exists (
      select 1 from public.listing_images li
      join public.listings l on l.id = li.listing_id
      join public.businesses b on b.id = l.business_id
      where li.storage_path = p_name
        and l.status = 'published' and l.is_active
        and b.status = 'verified' and b.is_active
    )
    else false
  end;
$$;

revoke all on function private.is_public_storage_asset(text, text) from public;
grant execute on function private.is_public_storage_asset(text, text) to anon, authenticated;

drop policy if exists "storage_read_authorized_assets" on storage.objects;
create policy "storage_read_authorized_assets"
on storage.objects for select to anon, authenticated
using (
  (
    bucket_id in ('business-logos','business-gallery','listing-covers','listing-gallery')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  or (select private.is_admin())
  or (select private.is_public_storage_asset(bucket_id, name))
);

create or replace function private.protect_business_review_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_admin(auth.uid()) then
    return new;
  end if;

  -- submit_business() sets this transaction-local flag immediately before its
  -- narrow resubmission update. Operators cannot update the status column.
  if current_setting('app.business_resubmit', true) = 'true'
    and old.owner_id = auth.uid()
    and old.status in ('changes_requested', 'rejected')
    and new.status = 'pending_review'
    and new.owner_id is not distinct from old.owner_id
    and new.review_note is not distinct from old.review_note
    and new.reviewed_by is not distinct from old.reviewed_by
    and new.reviewed_at is not distinct from old.reviewed_at
    and new.is_active is not distinct from old.is_active then
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
    or new.status is distinct from old.status
    or new.review_note is distinct from old.review_note
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.is_active is distinct from old.is_active then
    raise exception 'Business approval fields can only be changed by an administrator';
  end if;

  return new;
end;
$$;

create or replace function private.owns_editable_listing(p_listing_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings l
    join public.businesses b on b.id = l.business_id
    where l.id = p_listing_id
      and b.owner_id = coalesce(p_user_id, auth.uid())
      and b.status = 'verified'
      and b.is_active
      and l.status in ('draft', 'changes_requested', 'rejected', 'paused')
  );
$$;

revoke all on function private.owns_editable_listing(uuid, uuid) from public;
grant execute on function private.owns_editable_listing(uuid, uuid) to authenticated;

create or replace function private.validate_business_logo_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid())
    and new.logo_path is not null
    and split_part(new.logo_path, '/', 1) <> auth.uid()::text then
    raise exception 'Business logo path must belong to the signed-in operator';
  end if;
  return new;
end;
$$;

create trigger businesses_05_validate_logo_path
before insert or update of logo_path on public.businesses
for each row execute function private.validate_business_logo_path();

create or replace function private.validate_business_image_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_owner uuid;
begin
  if private.is_admin(auth.uid()) then return new; end if;
  select owner_id into v_owner from public.businesses where id = new.business_id;
  if v_owner is distinct from auth.uid() or split_part(new.storage_path, '/', 1) <> auth.uid()::text then
    raise exception 'Business image path must belong to the signed-in operator';
  end if;
  return new;
end;
$$;

create trigger business_images_05_validate_path
before insert or update on public.business_images
for each row execute function private.validate_business_image_path();

create or replace function private.validate_listing_cover_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_owner uuid;
begin
  if private.is_admin(auth.uid()) or new.cover_image_path is null then return new; end if;
  select b.owner_id into v_owner
  from public.businesses b where b.id = new.business_id;
  if v_owner is distinct from auth.uid() or split_part(new.cover_image_path, '/', 1) <> auth.uid()::text then
    raise exception 'Listing cover path must belong to the signed-in operator';
  end if;
  return new;
end;
$$;

create trigger listings_05_validate_cover_path
before insert or update of cover_image_path on public.listings
for each row execute function private.validate_listing_cover_path();

create or replace function private.validate_listing_image_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_owner uuid;
begin
  if private.is_admin(auth.uid()) then return new; end if;
  select b.owner_id into v_owner
  from public.listings l
  join public.businesses b on b.id = l.business_id
  where l.id = new.listing_id;
  if v_owner is distinct from auth.uid() or split_part(new.storage_path, '/', 1) <> auth.uid()::text then
    raise exception 'Listing image path must belong to the signed-in operator';
  end if;
  return new;
end;
$$;

create trigger listing_images_05_validate_path
before insert or update on public.listing_images
for each row execute function private.validate_listing_image_path();

drop policy if exists "listing_images_update_owner" on public.listing_images;
create policy "listing_images_update_verified_owner"
on public.listing_images for update to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));

drop policy if exists "listing_images_delete_owner" on public.listing_images;
create policy "listing_images_delete_verified_owner"
on public.listing_images for delete to authenticated
using ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));

drop policy if exists "listing_images_insert_owner" on public.listing_images;
create policy "listing_images_insert_editable_owner"
on public.listing_images for insert to authenticated
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));

drop policy if exists "availability_select_owner_or_admin" on public.availability;
create policy "availability_select_verified_owner_or_admin"
on public.availability for select to authenticated
using ((select private.owns_verified_listing(listing_id)) or (select private.is_admin()));

drop policy if exists "availability_insert_owner" on public.availability;
create policy "availability_insert_verified_owner"
on public.availability for insert to authenticated
with check ((select private.owns_verified_listing(listing_id)) or (select private.is_admin()));

drop policy if exists "availability_update_owner" on public.availability;
create policy "availability_update_verified_owner"
on public.availability for update to authenticated
using ((select private.owns_verified_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_verified_listing(listing_id)) or (select private.is_admin()));

drop policy if exists "availability_delete_owner" on public.availability;
create policy "availability_delete_verified_owner"
on public.availability for delete to authenticated
using ((select private.owns_verified_listing(listing_id)) or (select private.is_admin()));

-- Trigger functions are invoked by PostgreSQL, not directly by browser roles.
revoke all on function private.validate_business_logo_path() from public;
revoke all on function private.validate_business_image_path() from public;
revoke all on function private.validate_listing_cover_path() from public;
revoke all on function private.validate_listing_image_path() from public;
