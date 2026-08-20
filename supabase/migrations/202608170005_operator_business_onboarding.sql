-- Restore secure onboarding for authenticated operators who do not yet own a
-- business. This migration preserves the existing administrator review flow.

-- Browser inserts omit ownership and review fields. PostgreSQL supplies the
-- authenticated owner, and all new businesses begin inactive and pending.
alter table public.businesses
  alter column owner_id set default auth.uid(),
  alter column is_active set default false;

create or replace function private.enforce_new_business_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Browser requests receive owner_id from the auth.uid() column default.
  -- Auth's trusted user-creation trigger continues to supply new.id directly.
  if new.owner_id is null then
    raise exception 'A business owner is required';
  end if;

  new.status := 'pending_review';
  new.is_active := false;
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.review_note := null;
  return new;
end;
$$;

revoke all on function private.enforce_new_business_workflow()
from public, anon, authenticated;

drop trigger if exists businesses_00_enforce_new_workflow
on public.businesses;

create trigger businesses_00_enforce_new_workflow
before insert on public.businesses
for each row execute function private.enforce_new_business_workflow();

-- The current schema already has UNIQUE (owner_id). That constraint is the
-- race-safe guarantee that one Auth user cannot own two business rows.
alter table public.businesses enable row level security;

drop policy if exists "businesses_insert_own_operator"
on public.businesses;

create policy "businesses_insert_own_operator"
on public.businesses for insert to authenticated
with check (
  (select auth.uid()) is not null
  and owner_id = (select auth.uid())
  and exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'operator'
  )
  and status = 'pending_review'
  and not is_active
  and reviewed_by is null
  and reviewed_at is null
  and review_note is null
);

-- Remove any broad INSERT privilege, then grant only operator-editable input
-- columns. owner_id, status, activation, review, and audit columns are omitted.
revoke insert on public.businesses from anon, authenticated;
revoke insert (
  id,
  owner_id,
  logo_path,
  status,
  review_note,
  reviewed_by,
  reviewed_at,
  is_active,
  created_at,
  updated_at
) on public.businesses from authenticated;

grant insert (
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
  public_contact,
  accuracy_confirmed,
  terms_accepted
) on public.businesses to authenticated;
