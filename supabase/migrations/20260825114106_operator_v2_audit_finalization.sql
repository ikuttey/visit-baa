-- Final Visit Baa Operator V2 audit fixes.
-- Business activation semantics, Finance proof access, recurring-session provenance,
-- and one-date schedule exception RPCs.

alter table public.businesses alter column is_active set default false;

create or replace function public.admin_review_business(p_business_id uuid, p_status public.business_status, p_note text default null)
returns public.businesses language plpgsql security definer set search_path=''
as $$
declare v_previous public.business_status; v_business public.businesses;
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if p_status not in ('verified','changes_requested','rejected','suspended') then raise exception 'Invalid administrator business decision'; end if;
  if p_status='verified' and not exists(select 1 from public.businesses where id=p_business_id and accuracy_confirmed and terms_accepted) then raise exception 'The business must confirm accuracy and platform terms before verification'; end if;
  select status into v_previous from public.businesses where id=p_business_id for update;
  if v_previous is null then raise exception 'Business not found'; end if;
  update public.businesses set status=p_status,review_note=nullif(trim(p_note),''),reviewed_by=auth.uid(),reviewed_at=now(),is_active=(p_status='verified') where id=p_business_id returning * into v_business;
  insert into public.review_history(target_type,target_id,previous_status,new_status,note,reviewed_by) values('business',p_business_id,v_previous::text,p_status::text,nullif(trim(p_note),''),auth.uid());
  return v_business;
end;
$$;

create or replace function public.submit_business(p_business_id uuid)
returns public.businesses language plpgsql security definer set search_path=''
as $$
declare v_business public.businesses;
begin
  perform set_config('app.business_resubmit','true',true);
  update public.businesses set status='pending_review',is_active=false where id=p_business_id and owner_id=auth.uid() and status in ('changes_requested','rejected') returning * into v_business;
  if v_business.id is null then raise exception 'Business is not eligible for resubmission'; end if;
  return v_business;
end;
$$;

drop policy if exists payment_proofs_participant_select on storage.objects;
create policy payment_proofs_participant_select on storage.objects for select to authenticated
using (
  bucket_id='payment-proofs' and (
    (storage.foldername(name))[1]=(auth.uid())::text
    or exists(
      select 1 from public.payment_references pr
      join public.booking_enquiries e on e.id=pr.booking_id
      where pr.proof_path=objects.name and (
        pr.operator_id=auth.uid()
        or private.has_business_permission(e.business_id,'finance',auth.uid())
        or private.has_business_permission(e.business_id,'reservations',auth.uid())
        or private.is_admin(auth.uid())
      )
    )
  )
);

alter table public.availability add column if not exists schedule_rule_id uuid;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='availability_schedule_rule_id_fkey') then
    alter table public.availability add constraint availability_schedule_rule_id_fkey foreign key(schedule_rule_id) references public.listing_schedule_rules(id) on delete set null;
  end if;
end $$;
create index if not exists availability_schedule_rule_id_idx on public.availability(schedule_rule_id,available_date);

with candidates as (
  select a.id as availability_id,min(r.id::text)::uuid as rule_id,count(*) as matches
  from public.availability a
  join public.listing_schedule_rules r
    on r.listing_id=a.listing_id
   and extract(dow from a.available_date)::smallint=r.day_of_week
   and a.start_time=r.start_time
   and a.available_date>=r.valid_from
   and (r.valid_until is null or a.available_date<=r.valid_until)
   and a.end_time is not distinct from r.end_time
   and coalesce(a.sellable_capacity,a.max_capacity)=r.capacity
  where a.schedule_rule_id is null
  group by a.id
)
update public.availability a set schedule_rule_id=c.rule_id from candidates c where a.id=c.availability_id and c.matches=1;

create or replace function public.operator_generate_listing_schedule(p_listing_id uuid,p_start_date date default current_date,p_end_date date default (current_date+365))
returns integer language plpgsql security definer set search_path=''
as $$
declare v_listing public.listings;v_rule public.listing_schedule_rules;v_exception public.listing_schedule_exceptions;v_day date;v_start time;v_end time;v_capacity integer;v_cancelled boolean;v_count integer:=0;v_availability_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'Choose a valid date range'; end if;
  if p_end_date>p_start_date+366 then raise exception 'Generate at most 12 months at a time'; end if;
  select * into v_listing from public.listings where id=p_listing_id;
  if v_listing.id is null then raise exception 'Listing not found'; end if;
  if v_listing.category='accommodation' then raise exception 'Accommodation uses the room calendar'; end if;
  if not private.has_business_permission(v_listing.business_id,'calendar',auth.uid()) then raise exception 'Schedule access denied'; end if;
  for v_day in select generate_series(p_start_date,p_end_date,interval '1 day')::date loop
    for v_rule in select * from public.listing_schedule_rules where listing_id=p_listing_id and is_active and day_of_week=extract(dow from v_day)::smallint and v_day>=valid_from and (valid_until is null or v_day<=valid_until) order by start_time loop
      v_start:=v_rule.start_time;v_end:=v_rule.end_time;v_capacity:=v_rule.capacity;v_cancelled:=false;
      select * into v_exception from public.listing_schedule_exceptions where listing_id=p_listing_id and available_date=v_day and start_time=v_rule.start_time;
      if v_exception.id is not null then v_cancelled:=v_exception.is_cancelled;v_start:=coalesce(v_exception.override_start_time,v_start);v_end:=coalesce(v_exception.override_end_time,v_end);v_capacity:=coalesce(v_exception.override_capacity,v_capacity);end if;
      v_availability_id:=null;
      select id into v_availability_id from public.availability where schedule_rule_id=v_rule.id and available_date=v_day order by created_at limit 1 for update;
      if v_availability_id is null then
        if exists(select 1 from public.availability where listing_id=p_listing_id and available_date=v_day and start_time=v_start) then continue; end if;
        insert into public.availability(listing_id,available_date,start_time,end_time,max_capacity,remaining_spaces,sellable_capacity,is_blocked,stop_sell,schedule_rule_id)
        values(p_listing_id,v_day,v_start,v_end,v_capacity,case when v_cancelled then 0 else v_capacity end,v_capacity,v_cancelled,v_cancelled,v_rule.id)
        returning id into v_availability_id;
      else
        update public.availability set start_time=v_start,end_time=v_end,max_capacity=v_capacity,sellable_capacity=v_capacity,is_blocked=v_cancelled,stop_sell=v_cancelled,schedule_rule_id=v_rule.id,updated_at=now() where id=v_availability_id;
      end if;
      perform private.recalculate_availability_inventory(v_availability_id);v_count:=v_count+1;
    end loop;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.operator_generate_listing_schedule(uuid,date,date) from public,anon;
grant execute on function public.operator_generate_listing_schedule(uuid,date,date) to authenticated;

create or replace function public.operator_set_schedule_rule_state(p_rule_id uuid,p_active boolean)
returns public.listing_schedule_rules language plpgsql security definer set search_path=''
as $$
declare v_rule public.listing_schedule_rules;v_av public.availability;v_until date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_rule from public.listing_schedule_rules where id=p_rule_id for update;
  if v_rule.id is null then raise exception 'Schedule rule not found'; end if;
  if not private.has_business_permission((select business_id from public.listings where id=v_rule.listing_id),'calendar',auth.uid()) then raise exception 'Schedule access denied'; end if;
  update public.listing_schedule_rules set is_active=p_active,updated_at=now() where id=p_rule_id returning * into v_rule;
  v_until:=least(coalesce(v_rule.valid_until,current_date+365),current_date+365);
  if p_active then perform public.operator_generate_listing_schedule(v_rule.listing_id,greatest(current_date,v_rule.valid_from),v_until);
  else for v_av in select * from public.availability where schedule_rule_id=p_rule_id and available_date>=current_date for update loop update public.availability set stop_sell=true,is_blocked=true,updated_at=now() where id=v_av.id;perform private.recalculate_availability_inventory(v_av.id);end loop;end if;
  return v_rule;
end;
$$;
revoke all on function public.operator_set_schedule_rule_state(uuid,boolean) from public,anon;
grant execute on function public.operator_set_schedule_rule_state(uuid,boolean) to authenticated;

create or replace function public.operator_delete_schedule_rule(p_rule_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_rule public.listing_schedule_rules;v_av public.availability;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_rule from public.listing_schedule_rules where id=p_rule_id for update;
  if v_rule.id is null then return false; end if;
  if not private.has_business_permission((select business_id from public.listings where id=v_rule.listing_id),'calendar',auth.uid()) then raise exception 'Schedule access denied'; end if;
  for v_av in select * from public.availability where schedule_rule_id=p_rule_id and available_date>=current_date for update loop update public.availability set stop_sell=true,is_blocked=true,updated_at=now() where id=v_av.id;perform private.recalculate_availability_inventory(v_av.id);end loop;
  delete from public.listing_schedule_rules where id=p_rule_id;return true;
end;
$$;
revoke all on function public.operator_delete_schedule_rule(uuid) from public,anon;
grant execute on function public.operator_delete_schedule_rule(uuid) to authenticated;

create or replace function public.operator_upsert_schedule_exception(p_listing_id uuid,p_available_date date,p_start_time time,p_is_cancelled boolean default false,p_override_start_time time default null,p_override_end_time time default null,p_override_capacity integer default null,p_note text default null)
returns public.listing_schedule_exceptions language plpgsql security definer set search_path=''
as $$
declare v_listing public.listings;v_result public.listing_schedule_exceptions;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_available_date is null or p_available_date<current_date then raise exception 'Choose today or a future date'; end if;
  if p_start_time is null then raise exception 'Choose the recurring start time'; end if;
  if p_override_capacity is not null and p_override_capacity<1 then raise exception 'Override capacity must be at least 1'; end if;
  if p_override_start_time is not null and p_override_end_time is not null and p_override_end_time<=p_override_start_time then raise exception 'Override end time must be after start time'; end if;
  select * into v_listing from public.listings where id=p_listing_id;
  if v_listing.id is null or v_listing.category='accommodation' then raise exception 'Choose a scheduled service listing'; end if;
  if not private.has_business_permission(v_listing.business_id,'calendar',auth.uid()) then raise exception 'Schedule access denied'; end if;
  if not exists(select 1 from public.listing_schedule_rules r where r.listing_id=p_listing_id and r.day_of_week=extract(dow from p_available_date)::smallint and r.start_time=p_start_time and p_available_date>=r.valid_from and (r.valid_until is null or p_available_date<=r.valid_until)) then raise exception 'No recurring schedule matches this date and start time'; end if;
  insert into public.listing_schedule_exceptions(listing_id,available_date,start_time,is_cancelled,override_start_time,override_end_time,override_capacity,note)
  values(p_listing_id,p_available_date,p_start_time,coalesce(p_is_cancelled,false),p_override_start_time,p_override_end_time,p_override_capacity,nullif(trim(coalesce(p_note,'')),''))
  on conflict(listing_id,available_date,start_time) do update set is_cancelled=excluded.is_cancelled,override_start_time=excluded.override_start_time,override_end_time=excluded.override_end_time,override_capacity=excluded.override_capacity,note=excluded.note,updated_at=now()
  returning * into v_result;
  perform public.operator_generate_listing_schedule(p_listing_id,p_available_date,p_available_date);return v_result;
end;
$$;
revoke all on function public.operator_upsert_schedule_exception(uuid,date,time,boolean,time,time,integer,text) from public,anon;
grant execute on function public.operator_upsert_schedule_exception(uuid,date,time,boolean,time,time,integer,text) to authenticated;

create or replace function public.operator_delete_schedule_exception(p_listing_id uuid,p_available_date date,p_start_time time)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_business uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select business_id into v_business from public.listings where id=p_listing_id;
  if v_business is null then raise exception 'Listing not found'; end if;
  if not private.has_business_permission(v_business,'calendar',auth.uid()) then raise exception 'Schedule access denied'; end if;
  delete from public.listing_schedule_exceptions where listing_id=p_listing_id and available_date=p_available_date and start_time=p_start_time;
  perform public.operator_generate_listing_schedule(p_listing_id,p_available_date,p_available_date);return true;
end;
$$;
revoke all on function public.operator_delete_schedule_exception(uuid,date,time) from public,anon;
grant execute on function public.operator_delete_schedule_exception(uuid,date,time) to authenticated;
