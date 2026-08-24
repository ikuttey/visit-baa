create or replace function public.operator_update_booking(p_enquiry_id uuid,p_status public.enquiry_status,p_response text default null)
returns public.booking_enquiries
language plpgsql
security definer
set search_path=''
as $$
declare
  v_enquiry public.booking_enquiries;
  v_day date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform private.expire_booking_holds();

  select * into v_enquiry from public.booking_enquiries where id=p_enquiry_id for update;
  if v_enquiry.id is null then raise exception 'Booking request not found'; end if;
  if not private.has_business_permission(v_enquiry.business_id,'reservations',auth.uid()) then raise exception 'Booking access denied'; end if;

  if not (
    (v_enquiry.status='new' and p_status in ('accepted','declined','changes_requested','cancelled'))
    or (v_enquiry.status in ('accepted','changes_requested') and p_status in ('confirmed','declined','changes_requested','cancelled','accepted'))
    or (v_enquiry.status='confirmed' and p_status in ('completed','cancelled','no_show'))
  ) then raise exception 'Invalid booking status transition'; end if;

  if p_status='accepted' and v_enquiry.status<>'accepted' then
    perform private.create_booking_hold(p_enquiry_id);
  elsif p_status in ('changes_requested','declined','cancelled') and v_enquiry.status='accepted' then
    perform private.release_booking_hold(p_enquiry_id,'released','Booking moved from accepted to '||p_status::text);
  elsif p_status='confirmed' then
    perform private.convert_booking_hold(p_enquiry_id);
  elsif p_status='cancelled' and v_enquiry.status='confirmed' then
    perform private.release_confirmed_booking_inventory(p_enquiry_id,'Confirmed booking cancelled');
  end if;

  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries
  set status=p_status,
      operator_response=nullif(trim(coalesce(p_response,'')),''),
      confirmed_at=case when p_status='confirmed' then coalesce(confirmed_at,now()) else confirmed_at end,
      hold_status=case when p_status='confirmed' then 'converted' when p_status in ('declined','cancelled','changes_requested') and hold_status='active' then 'released' else hold_status end
  where id=p_enquiry_id returning * into v_enquiry;

  -- convert_booking_hold commits inventory before this status transition. Recalculate
  -- once more after status='confirmed' so derived booked/remaining quantities reflect
  -- the newly committed booking immediately, without waiting for another request.
  if p_status='confirmed' then
    if v_enquiry.room_id is not null then
      for v_day in select generate_series(v_enquiry.requested_date,v_enquiry.check_out_date-1,interval '1 day')::date loop
        perform private.recalculate_room_inventory(v_enquiry.room_id,v_day);
      end loop;
    elsif v_enquiry.availability_id is not null then
      perform private.recalculate_availability_inventory(v_enquiry.availability_id);
    end if;
  end if;

  return v_enquiry;
end;
$$;

revoke all on function public.operator_update_booking(uuid,public.enquiry_status,text) from public,anon;
grant execute on function public.operator_update_booking(uuid,public.enquiry_status,text) to authenticated;