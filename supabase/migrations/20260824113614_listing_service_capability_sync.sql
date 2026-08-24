-- Service capabilities are selected through real listings, not during business
-- registration. Keep business_service_categories synchronized with each listing
-- so public discovery and Manta continue to use the normalized capability model.

create or replace function private.sync_business_service_from_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service_slug text;
begin
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
$$;

revoke all on function private.sync_business_service_from_listing() from public, anon, authenticated;

drop trigger if exists listings_16_sync_business_service on public.listings;
create trigger listings_16_sync_business_service
after insert or update of business_id, category on public.listings
for each row execute function private.sync_business_service_from_listing();

-- Bring existing listings into the same model without changing any existing
-- business capability rows.
insert into public.business_service_categories (business_id, service_category_id)
select distinct
  l.business_id,
  sc.id
from public.listings l
join public.service_categories sc
  on sc.slug = case l.category::text
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
  end
where sc.is_active
on conflict do nothing;
