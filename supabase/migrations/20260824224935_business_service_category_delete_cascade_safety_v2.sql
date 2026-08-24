create or replace function private.protect_business_service_removal()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  -- Allow FK-driven cascading cleanup when the parent business is being deleted.
  if pg_trigger_depth()>1 then return old; end if;

  if (select count(*) from public.business_service_categories bsc where bsc.business_id=old.business_id)<=1 then
    raise exception 'A business must retain at least one service category';
  end if;
  if exists (
    select 1 from public.listings l
    join public.service_categories removed on removed.id=old.service_category_id
    where l.business_id=old.business_id and l.category=any(removed.listing_categories)
      and not exists (
        select 1 from public.business_service_categories remaining
        join public.service_categories sc on sc.id=remaining.service_category_id and sc.is_active
        where remaining.business_id=old.business_id and remaining.service_category_id<>old.service_category_id
          and l.category=any(sc.listing_categories)
      )
  ) then
    raise exception 'This service category is still required by one or more business listings';
  end if;
  return old;
end;
$$;
