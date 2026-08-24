drop policy if exists reviews_participant_select on public.reviews;
create policy reviews_participant_select on public.reviews for select to authenticated
using (
  traveler_id=(select auth.uid())
  or private.has_listing_permission(listing_id,'staff_admin',(select auth.uid()))
  or private.is_admin((select auth.uid()))
  or status='published'
);

drop policy if exists review_responses_owner_admin_select on public.review_responses;
create policy review_responses_staff_select on public.review_responses for select to authenticated
using (exists(select 1 from public.reviews r where r.id=review_id and (private.has_listing_permission(r.listing_id,'staff_admin',(select auth.uid())) or private.is_admin((select auth.uid())))));
drop policy if exists review_responses_owner_insert on public.review_responses;
create policy review_responses_staff_insert on public.review_responses for insert to authenticated
with check (operator_id=(select auth.uid()) and exists(select 1 from public.reviews r where r.id=review_id and private.has_listing_permission(r.listing_id,'staff_admin',(select auth.uid()))));
drop policy if exists review_responses_owner_update on public.review_responses;
create policy review_responses_staff_update on public.review_responses for update to authenticated
using (exists(select 1 from public.reviews r where r.id=review_id and (private.has_listing_permission(r.listing_id,'staff_admin',(select auth.uid())) or private.is_admin((select auth.uid())))))
with check (exists(select 1 from public.reviews r where r.id=review_id and (private.has_listing_permission(r.listing_id,'staff_admin',(select auth.uid())) or private.is_admin((select auth.uid())))));

create or replace function public.operator_report_review(p_review_id uuid)
returns public.reviews
language plpgsql
security definer
set search_path=''
as $$
declare v_review public.reviews;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_review from public.reviews where id=p_review_id for update;
  if v_review.id is null then raise exception 'Review not found'; end if;
  if not private.has_listing_permission(v_review.listing_id,'staff_admin',auth.uid()) then raise exception 'Review access denied'; end if;
  if v_review.status<>'published' then raise exception 'Only a published review can be reported'; end if;
  update public.reviews set status='reported' where id=p_review_id returning * into v_review;
  return v_review;
end;
$$;
revoke all on function public.operator_report_review(uuid) from public,anon;
grant execute on function public.operator_report_review(uuid) to authenticated;