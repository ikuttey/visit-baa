-- Roll back 202608170006_listing_revision_workflow.sql.

drop function if exists public.withdraw_listing_for_edit(uuid);

create or replace function private.enforce_listing_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verified boolean;
begin
  if private.is_admin(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not private.owns_verified_business(new.business_id, auth.uid()) then
      raise exception 'A verified business is required to create listings';
    end if;
    if new.status <> 'draft' then
      raise exception 'New operator listings must start as drafts';
    end if;
    new.review_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    return new;
  end if;

  if new.business_id is distinct from old.business_id then
    raise exception 'A listing cannot be moved to another business';
  end if;

  if new.review_note is distinct from old.review_note
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Listing review fields can only be changed by an administrator';
  end if;

  if old.status in ('pending_review', 'published')
    and new.status = old.status
    and new is distinct from old then
    raise exception 'Listings cannot be edited while pending review or published';
  end if;

  if new.status is distinct from old.status then
    v_verified := private.owns_verified_business(new.business_id, auth.uid());

    if old.status in ('draft', 'changes_requested', 'rejected', 'paused')
      and new.status = 'pending_review' and v_verified then
      return new;
    elsif old.status = 'published' and new.status = 'paused' then
      return new;
    elsif old.status in ('changes_requested', 'rejected', 'paused') and new.status = 'draft' then
      return new;
    else
      raise exception 'This listing status transition is not allowed for operators';
    end if;
  end if;

  return new;
end;
$$;
