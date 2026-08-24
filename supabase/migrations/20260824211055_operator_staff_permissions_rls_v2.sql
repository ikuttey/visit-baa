create or replace function private.has_listing_permission(p_listing_id uuid,p_permission text,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.listings l where l.id=p_listing_id and private.has_business_permission(l.business_id,p_permission,coalesce(p_user_id,auth.uid())));
$$;
create or replace function private.has_room_permission(p_room_id uuid,p_permission text,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.accommodation_rooms r join public.listings l on l.id=r.listing_id where r.id=p_room_id and private.has_business_permission(l.business_id,p_permission,coalesce(p_user_id,auth.uid())));
$$;
create or replace function private.owns_listing(p_listing_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select private.has_listing_permission(p_listing_id,'content',coalesce(p_user_id,auth.uid()));
$$;
create or replace function private.owns_editable_listing(p_listing_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.listings l join public.businesses b on b.id=l.business_id where l.id=p_listing_id and b.status='verified' and b.is_active and l.status in ('draft','changes_requested','rejected','paused') and private.has_business_permission(b.id,'content',coalesce(p_user_id,auth.uid())));
$$;
create or replace function private.owns_verified_business(p_business_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.businesses b where b.id=p_business_id and b.status='verified' and b.is_active and private.has_business_permission(b.id,'content',coalesce(p_user_id,auth.uid())));
$$;
create or replace function private.owns_room(p_room_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select private.has_room_permission(p_room_id,'content',coalesce(p_user_id,auth.uid()));
$$;
create or replace function private.owns_editable_room(p_room_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.accommodation_rooms r where r.id=p_room_id and private.owns_editable_listing(r.listing_id,coalesce(p_user_id,auth.uid())));
$$;
create or replace function private.owns_verified_listing(p_listing_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.listings l join public.businesses b on b.id=l.business_id where l.id=p_listing_id and b.status='verified' and b.is_active and private.has_business_permission(b.id,'calendar',coalesce(p_user_id,auth.uid())));
$$;
create or replace function private.can_access_enquiry(p_enquiry_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.booking_enquiries e where e.id=p_enquiry_id and (e.traveler_id=coalesce(p_user_id,auth.uid()) or private.has_business_permission(e.business_id,'messages',coalesce(p_user_id,auth.uid())))) or private.is_admin(coalesce(p_user_id,auth.uid()));
$$;

drop policy if exists room_availability_owner_admin_all on public.room_availability;
drop policy if exists room_availability_calendar_select on public.room_availability;
drop policy if exists room_availability_calendar_insert on public.room_availability;
drop policy if exists room_availability_calendar_update on public.room_availability;
drop policy if exists room_availability_calendar_delete on public.room_availability;
create policy room_availability_calendar_select on public.room_availability for select to authenticated using ((select private.has_room_permission(room_id,'calendar')) or (select private.is_admin()));
create policy room_availability_calendar_insert on public.room_availability for insert to authenticated with check ((select private.has_room_permission(room_id,'calendar')) or (select private.is_admin()));
create policy room_availability_calendar_update on public.room_availability for update to authenticated using ((select private.has_room_permission(room_id,'calendar')) or (select private.is_admin())) with check ((select private.has_room_permission(room_id,'calendar')) or (select private.is_admin()));
create policy room_availability_calendar_delete on public.room_availability for delete to authenticated using ((select private.has_room_permission(room_id,'calendar')) or (select private.is_admin()));

drop policy if exists room_rate_calendar_owner_select on public.room_rate_calendar;
drop policy if exists room_rate_calendar_owner_insert on public.room_rate_calendar;
drop policy if exists room_rate_calendar_owner_update on public.room_rate_calendar;
drop policy if exists room_rate_calendar_owner_delete on public.room_rate_calendar;
drop policy if exists room_rate_calendar_calendar_select on public.room_rate_calendar;
drop policy if exists room_rate_calendar_calendar_insert on public.room_rate_calendar;
drop policy if exists room_rate_calendar_calendar_update on public.room_rate_calendar;
drop policy if exists room_rate_calendar_calendar_delete on public.room_rate_calendar;
create policy room_rate_calendar_calendar_select on public.room_rate_calendar for select to authenticated using ((select private.has_room_permission(room_id,'calendar')) or (select private.is_admin()));
create policy room_rate_calendar_calendar_insert on public.room_rate_calendar for insert to authenticated with check ((select private.has_room_permission(room_id,'calendar')) or (select private.is_admin()));
create policy room_rate_calendar_calendar_update on public.room_rate_calendar for update to authenticated using ((select private.has_room_permission(room_id,'calendar')) or (select private.is_admin())) with check ((select private.has_room_permission(room_id,'calendar')) or (select private.is_admin()));
create policy room_rate_calendar_calendar_delete on public.room_rate_calendar for delete to authenticated using ((select private.has_room_permission(room_id,'calendar')) or (select private.is_admin()));

drop policy if exists listing_schedule_rules_owner_all on public.listing_schedule_rules;
drop policy if exists listing_schedule_rules_calendar_all on public.listing_schedule_rules;
create policy listing_schedule_rules_calendar_all on public.listing_schedule_rules for all to authenticated using ((select private.has_listing_permission(listing_id,'calendar')) or (select private.is_admin())) with check ((select private.has_listing_permission(listing_id,'calendar')) or (select private.is_admin()));
drop policy if exists listing_schedule_exceptions_owner_all on public.listing_schedule_exceptions;
drop policy if exists listing_schedule_exceptions_calendar_all on public.listing_schedule_exceptions;
create policy listing_schedule_exceptions_calendar_all on public.listing_schedule_exceptions for all to authenticated using ((select private.has_listing_permission(listing_id,'calendar')) or (select private.is_admin())) with check ((select private.has_listing_permission(listing_id,'calendar')) or (select private.is_admin()));

drop policy if exists "Operators can view their external accommodation bookings" on public.external_accommodation_bookings;
drop policy if exists external_accommodation_bookings_staff_select on public.external_accommodation_bookings;
create policy external_accommodation_bookings_staff_select on public.external_accommodation_bookings for select to authenticated using ((select private.has_business_permission(business_id,'reservations')) or (select private.is_admin()));

drop policy if exists enquiries_staff_select on public.booking_enquiries;
create policy enquiries_staff_select on public.booking_enquiries for select to authenticated using ((select private.has_business_permission(business_id,'reservations')) or (select private.has_business_permission(business_id,'finance')) or (select private.is_admin()));

drop policy if exists payment_references_staff_select on public.payment_references;
create policy payment_references_staff_select on public.payment_references for select to authenticated using (
  (select private.is_admin())
  or exists(select 1 from public.listings l where l.id=payment_references.listing_id and (private.has_business_permission(l.business_id,'reservations') or private.has_business_permission(l.business_id,'finance')))
);

drop policy if exists operator_audit_log_owner_select on public.operator_audit_log;
create policy operator_audit_log_owner_select on public.operator_audit_log for select to authenticated using ((select private.has_business_permission(business_id,'staff_admin')) or (select private.is_admin()));