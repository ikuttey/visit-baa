grant insert, update
on table public.businesses
to authenticated;

drop policy if exists businesses_insert_own on public.businesses;

create policy businesses_insert_own
on public.businesses
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and (select private.is_operator(auth.uid()))
  and status = 'pending_review'::public.business_status
  and review_note is null
  and reviewed_by is null
  and reviewed_at is null
  and is_active = true
);
