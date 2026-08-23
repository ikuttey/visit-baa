-- Explicit per-adult and per-package pricing across validation and trip
-- booking calculations. Included package activities remain descriptive.
alter table public.listings drop constraint if exists listings_confirmed_unit_category_check;
alter table public.listings add constraint listings_confirmed_unit_category_check check (
  not price_unit_confirmed
  or (category='accommodation' and price_unit in ('per_room_per_night','per_property_per_night','per_person_per_night','fixed_stay','price_on_request'))
  or (category='transfer' and price_unit in ('per_person','per_adult','per_trip','per_boat','per_vehicle','per_leg','price_on_request'))
  or (category not in ('accommodation','transfer') and price_unit in ('per_person','per_adult','per_child','per_group','per_trip','per_boat','per_package','fixed','price_on_request'))
);

create or replace function private.current_request_subtotal(p_item public.trip_items,p_listing public.listings)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_people integer:=p_item.adult_count+p_item.child_count; v_nights integer;
begin
  if not p_listing.price_unit_confirmed or p_listing.price_unit='price_on_request' or p_listing.price is null then return null; end if;
  if p_listing.category='accommodation' then
    if p_item.planned_date is null or p_item.planned_end_date is null or p_item.planned_end_date<=p_item.planned_date then raise exception 'Valid stay dates are required'; end if;
    v_nights:=p_item.planned_end_date-p_item.planned_date;
    return case p_listing.price_unit
      when 'per_room_per_night' then p_listing.price*p_item.rooms_requested*v_nights
      when 'per_property_per_night' then p_listing.price*v_nights
      when 'per_person_per_night' then (p_listing.price*p_item.adult_count+coalesce(p_listing.child_price,0)*p_item.child_count)*v_nights
      when 'fixed_stay' then p_listing.price else null end;
  elsif p_listing.category='transfer' then
    return case p_listing.price_unit
      when 'per_person' then p_listing.price*v_people
      when 'per_adult' then p_listing.price*p_item.adult_count+coalesce(p_listing.child_price,0)*p_item.child_count
      when 'per_trip' then p_listing.price when 'per_boat' then p_listing.price
      when 'per_vehicle' then p_listing.price when 'per_leg' then p_listing.price else null end;
  end if;
  return case p_listing.price_unit
    when 'per_person' then p_listing.price*p_item.adult_count+coalesce(p_listing.child_price,p_listing.price)*p_item.child_count
    when 'per_adult' then p_listing.price*p_item.adult_count+coalesce(p_listing.child_price,0)*p_item.child_count
    when 'per_child' then p_listing.price*p_item.child_count
    when 'per_group' then p_listing.price*ceil(v_people::numeric/p_listing.group_capacity)
    when 'per_trip' then p_listing.price when 'per_boat' then p_listing.price
    when 'per_package' then p_listing.price when 'fixed' then p_listing.price else null end;
end;
$$;
revoke all on function private.current_request_subtotal(public.trip_items,public.listings) from public,anon,authenticated;

comment on type public.price_unit is 'Explicit marketplace price bases, including a one-product per_package unit.';
