revoke select on public.availability from anon;
grant select (
  id,listing_id,available_date,start_time,end_time,max_capacity,remaining_spaces,
  sellable_capacity,minimum_stay,maximum_stay,min_advance_hours,max_advance_days,
  closed_to_arrival,closed_to_departure,is_blocked,stop_sell
) on public.availability to anon;
