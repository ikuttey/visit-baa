-- Pre-change snapshot captured from project hwllwtnqehtsoiwzkskk on 2026-08-17.
-- This is an audit/rollback reference, not an ordered migration.

-- Affected trigger function (the rollback file restores this exact body).
create or replace function private.enforce_listing_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verified boolean;
begin
  if private.is_admin(auth.uid()) then return new; end if;
  if tg_op = 'INSERT' then
    if not private.owns_verified_business(new.business_id, auth.uid()) then raise exception 'A verified business is required to create listings'; end if;
    if new.status <> 'draft' then raise exception 'New operator listings must start as drafts'; end if;
    new.review_note := null; new.reviewed_by := null; new.reviewed_at := null; return new;
  end if;
  if new.business_id is distinct from old.business_id then raise exception 'A listing cannot be moved to another business'; end if;
  if new.review_note is distinct from old.review_note or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Listing review fields can only be changed by an administrator';
  end if;
  if old.status in ('pending_review', 'published') and new.status = old.status and new is distinct from old then
    raise exception 'Listings cannot be edited while pending review or published';
  end if;
  if new.status is distinct from old.status then
    v_verified := private.owns_verified_business(new.business_id, auth.uid());
    if old.status in ('draft', 'changes_requested', 'rejected', 'paused') and new.status = 'pending_review' and v_verified then return new;
    elsif old.status = 'published' and new.status = 'paused' then return new;
    elsif old.status in ('changes_requested', 'rejected', 'paused') and new.status = 'draft' then return new;
    else raise exception 'This listing status transition is not allowed for operators'; end if;
  end if;
  return new;
end;
$$;

-- Related ownership/review functions saved from the live database.
create or replace function private.is_admin(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = coalesce(p_user_id, auth.uid()) and role = 'admin');
$$;

create or replace function private.owns_listing(p_listing_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.listings l join public.businesses b on b.id = l.business_id where l.id = p_listing_id and b.owner_id = coalesce(p_user_id, auth.uid()));
$$;

create or replace function private.is_public_listing(p_listing_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.listings l join public.businesses b on b.id=l.business_id where l.id=p_listing_id and l.status='published' and l.is_active and b.status='verified' and b.is_active);
$$;

create or replace function private.validate_listing_cover_path()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if private.is_admin(auth.uid()) or new.cover_image_path is null then return new; end if;
  select b.owner_id into v_owner from public.businesses b where b.id=new.business_id;
  if v_owner is distinct from auth.uid() or split_part(new.cover_image_path,'/',1) <> auth.uid()::text then raise exception 'Listing cover path must belong to the signed-in operator'; end if;
  return new;
end;
$$;

create or replace function private.validate_listing_image_path()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if private.is_admin(auth.uid()) then return new; end if;
  select b.owner_id into v_owner from public.listings l join public.businesses b on b.id=l.business_id where l.id=new.listing_id;
  if v_owner is distinct from auth.uid() or split_part(new.storage_path,'/',1) <> auth.uid()::text then raise exception 'Listing image path must belong to the signed-in operator'; end if;
  return new;
end;
$$;

create or replace function private.owns_verified_business(p_business_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.businesses where id = p_business_id and owner_id = coalesce(p_user_id, auth.uid()) and status = 'verified' and is_active);
$$;

create or replace function private.owns_verified_listing(p_listing_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.listings l join public.businesses b on b.id = l.business_id where l.id = p_listing_id and b.owner_id = coalesce(p_user_id, auth.uid()) and b.status = 'verified' and b.is_active);
$$;

create or replace function private.owns_editable_listing(p_listing_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.listings l join public.businesses b on b.id = l.business_id where l.id = p_listing_id and b.owner_id = coalesce(p_user_id, auth.uid()) and b.status = 'verified' and b.is_active and l.status in ('draft', 'changes_requested', 'rejected', 'paused'));
$$;

create or replace function public.submit_listing(p_listing_id uuid)
returns public.listings language plpgsql security invoker set search_path = '' as $$
declare v_listing public.listings;
begin
  update public.listings set status = 'pending_review' where id = p_listing_id returning * into v_listing;
  if v_listing.id is null then raise exception 'Listing not found or not accessible'; end if;
  return v_listing;
end;
$$;

create or replace function public.admin_review_listing(p_listing_id uuid, p_status public.listing_status, p_note text default null)
returns public.listings language plpgsql security definer set search_path = '' as $$
declare v_previous public.listing_status; v_listing public.listings;
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if p_status not in ('published', 'changes_requested', 'rejected', 'paused') then raise exception 'Invalid administrator listing decision'; end if;
  select status into v_previous from public.listings where id = p_listing_id for update;
  if v_previous is null then raise exception 'Listing not found'; end if;
  if p_status in ('published', 'changes_requested', 'rejected') and v_previous <> 'pending_review' then raise exception 'Only pending listings can receive a review decision'; end if;
  if p_status = 'paused' and v_previous <> 'published' then raise exception 'Only published listings can be paused'; end if;
  if p_status = 'published' and not exists (select 1 from public.listings l join public.businesses b on b.id=l.business_id where l.id=p_listing_id and b.status='verified' and b.is_active) then raise exception 'Only listings from verified businesses can be published'; end if;
  update public.listings set status=p_status, review_note=nullif(trim(p_note),''), reviewed_by=auth.uid(), reviewed_at=now(), is_active=p_status <> 'paused' where id=p_listing_id returning * into v_listing;
  insert into public.review_history(target_type,target_id,previous_status,new_status,note,reviewed_by) values ('listing',p_listing_id,v_previous::text,p_status::text,nullif(trim(p_note),''),auth.uid());
  return v_listing;
end;
$$;

-- Affected trigger and grants at capture time.
-- CREATE TRIGGER listings_10_enforce_workflow BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION private.enforce_listing_workflow();
-- CREATE TRIGGER listings_05_validate_cover_path BEFORE INSERT OR UPDATE OF cover_image_path ON public.listings FOR EACH ROW EXECUTE FUNCTION private.validate_listing_cover_path();
-- CREATE TRIGGER listing_images_05_validate_path BEFORE INSERT OR UPDATE ON public.listing_images FOR EACH ROW EXECUTE FUNCTION private.validate_listing_image_path();
-- private.enforce_listing_workflow(): EXECUTE to PUBLIC/postgres (trigger use only)
-- private.owns_listing(uuid,uuid): EXECUTE to postgres, anon, authenticated
-- private.owns_verified_business(uuid,uuid): EXECUTE to postgres, authenticated
-- private.owns_verified_listing(uuid,uuid): EXECUTE to postgres, authenticated
-- private.owns_editable_listing(uuid,uuid): EXECUTE to postgres, authenticated
-- public.submit_listing(uuid): EXECUTE to PUBLIC, postgres, service_role, authenticated
-- public.admin_review_listing(uuid,listing_status,text): EXECUTE to PUBLIC, postgres, service_role, authenticated
