create or replace function public.operator_business_analytics(p_business_id uuid,p_from date,p_to date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_from date:=coalesce(p_from,current_date-29);
  v_to date:=coalesce(p_to,current_date);
  v_bookings integer;
  v_confirmed integer;
  v_cancelled integer;
  v_revenue numeric;
  v_room_nights numeric;
  v_sellable_room_nights numeric;
  v_views integer;
  v_avg_stay numeric;
  v_avg_lead numeric;
  v_arrivals integer;
  v_currency_count integer:=0;
  v_single_currency text;
  v_value_by_currency jsonb:='{}'::jsonb;
  v_adr_by_currency jsonb:='{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  if v_to<v_from then raise exception 'End date must not be before start date';end if;
  if not private.has_business_permission(p_business_id,'analytics',auth.uid()) then raise exception 'Analytics access denied'; end if;

  select count(*),count(*) filter(where status in ('confirmed','completed','no_show')),count(*) filter(where status='cancelled'),
    coalesce(sum(quoted_total) filter(where status in ('confirmed','completed','no_show')),0),
    coalesce(sum(case when check_out_date is not null and status in ('confirmed','completed','no_show') then (check_out_date-requested_date)*rooms_requested else 0 end),0),
    coalesce(avg(case when check_out_date is not null and status in ('confirmed','completed','no_show') then check_out_date-requested_date end),0),
    coalesce(avg(greatest(0,requested_date-created_at::date)) filter(where status in ('accepted','confirmed','completed','no_show')),0),
    count(*) filter(where requested_date=current_date and status in ('accepted','confirmed'))
  into v_bookings,v_confirmed,v_cancelled,v_revenue,v_room_nights,v_avg_stay,v_avg_lead,v_arrivals
  from public.booking_enquiries where business_id=p_business_id and requested_date between v_from and v_to;

  select coalesce(sum(ra.sellable_quantity),0) into v_sellable_room_nights
  from public.room_availability ra join public.accommodation_rooms r on r.id=ra.room_id join public.listings l on l.id=r.listing_id
  where l.business_id=p_business_id and ra.available_date between v_from and v_to;

  select count(*) into v_views from public.listing_views lv join public.listings l on l.id=lv.listing_id
  where l.business_id=p_business_id and lv.viewed_on between v_from and v_to;

  select count(*),max(currency),coalesce(jsonb_object_agg(currency,total),'{}'::jsonb)
  into v_currency_count,v_single_currency,v_value_by_currency
  from (
    select coalesce(nullif(trim(quote_currency),''),'USD') currency,round(sum(quoted_total),2) total
    from public.booking_enquiries
    where business_id=p_business_id and requested_date between v_from and v_to and status in ('confirmed','completed','no_show')
    group by coalesce(nullif(trim(quote_currency),''),'USD')
  ) currency_totals;

  select coalesce(jsonb_object_agg(currency,adr),'{}'::jsonb)
  into v_adr_by_currency
  from (
    select coalesce(nullif(trim(quote_currency),''),'USD') currency,
      case when sum(case when check_out_date is not null then (check_out_date-requested_date)*rooms_requested else 0 end)>0
        then round(sum(quoted_total)/sum(case when check_out_date is not null then (check_out_date-requested_date)*rooms_requested else 0 end),2)
        else null end adr
    from public.booking_enquiries
    where business_id=p_business_id and requested_date between v_from and v_to and status in ('confirmed','completed','no_show')
    group by coalesce(nullif(trim(quote_currency),''),'USD')
  ) adr_totals
  where adr is not null;

  return jsonb_build_object(
    'from',v_from,'to',v_to,'bookings',v_bookings,'confirmed_bookings',v_confirmed,'cancelled_bookings',v_cancelled,
    'confirmed_revenue',case when v_currency_count<=1 then round(v_revenue,2) else null end,
    'currency',case when v_currency_count=1 then v_single_currency else null end,
    'confirmed_value_by_currency',v_value_by_currency,
    'room_nights',v_room_nights,'sellable_room_nights',v_sellable_room_nights,
    'occupancy_percent',case when v_sellable_room_nights>0 then round(100*v_room_nights/v_sellable_room_nights,1) else null end,
    'adr',case when v_currency_count=1 and v_room_nights>0 then round(v_revenue/v_room_nights,2) else null end,
    'adr_by_currency',v_adr_by_currency,
    'cancellation_rate',case when v_bookings>0 then round(100*v_cancelled::numeric/v_bookings,1) else 0 end,
    'average_stay',round(coalesce(v_avg_stay,0),1),'average_lead_days',round(coalesce(v_avg_lead,0),1),
    'listing_views',v_views,'conversion_percent',case when v_views>0 then round(100*v_confirmed::numeric/v_views,2) else 0 end,
    'arrivals_today',v_arrivals
  );
end;
$$;

create or replace function public.operator_listing_analytics_v2(p_business_id uuid,p_from date,p_to date)
returns table(listing_id uuid,title text,category text,views bigint,enquiries bigint,confirmed bigint,revenue_by_currency jsonb,conversion_percent numeric)
language plpgsql
security definer
set search_path=''
as $$
declare v_from date:=coalesce(p_from,current_date-29);v_to date:=coalesce(p_to,current_date);
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  if not private.has_business_permission(p_business_id,'analytics',auth.uid()) then raise exception 'Analytics access denied'; end if;
  return query
  select l.id,l.title,l.category::text,coalesce(v.cnt,0),coalesce(b.enquiries,0),coalesce(b.confirmed,0),coalesce(b.revenue_by_currency,'{}'::jsonb),
    case when coalesce(v.cnt,0)>0 then round(100*coalesce(b.confirmed,0)::numeric/v.cnt,2) else 0 end
  from public.listings l
  left join lateral(select count(*) cnt from public.listing_views x where x.listing_id=l.id and x.viewed_on between v_from and v_to)v on true
  left join lateral(
    select count(*) enquiries,
      count(*) filter(where status in ('confirmed','completed','no_show')) confirmed,
      (select coalesce(jsonb_object_agg(currency,total),'{}'::jsonb) from (
        select coalesce(nullif(trim(y.quote_currency),''),'USD') currency,round(sum(y.quoted_total),2) total
        from public.booking_enquiries y
        where y.listing_id=l.id and y.requested_date between v_from and v_to and y.status in ('confirmed','completed','no_show')
        group by coalesce(nullif(trim(y.quote_currency),''),'USD')
      ) currency_totals) revenue_by_currency
    from public.booking_enquiries x where x.listing_id=l.id and x.requested_date between v_from and v_to
  )b on true
  where l.business_id=p_business_id order by coalesce(b.confirmed,0) desc,l.title;
end;
$$;
revoke all on function public.operator_listing_analytics_v2(uuid,date,date) from public;
grant execute on function public.operator_listing_analytics_v2(uuid,date,date) to authenticated;