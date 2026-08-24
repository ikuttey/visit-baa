create or replace function private.sync_business_service_from_listing()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_service_slug text;
begin
  if not exists (
    select 1
    from public.businesses b
    where b.id = new.business_id
      and b.status = 'verified'
      and b.is_active = true
  ) then
    return new;
  end if;

  v_service_slug := case new.category::text
    when 'accommodation' then 'accommodation'
    when 'excursion' then 'excursions'
    when 'snorkelling' then 'excursions'
    when 'diving' then 'diving'
    when 'transfer' then 'transport'
    when 'fishing' then 'fishing'
    when 'watersports' then 'watersports'
    when 'food_dining' then 'food-dining'
    when 'conservation_experience' then 'conservation'
    when 'community_experience' then 'local-experiences'
    else 'other'
  end;

  insert into public.business_service_categories (business_id, service_category_id)
  select new.business_id, sc.id
  from public.service_categories sc
  where sc.slug = v_service_slug
    and sc.is_active
  on conflict do nothing;

  return new;
end;
$function$;

drop trigger if exists listings_16_sync_business_service on public.listings;
drop trigger if exists listings_11_sync_business_service on public.listings;

create trigger listings_11_sync_business_service
before insert or update of business_id, category on public.listings
for each row execute function private.sync_business_service_from_listing();
