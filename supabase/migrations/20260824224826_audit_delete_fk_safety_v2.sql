create or replace function private.audit_operator_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_business_id uuid;
  v_listing_id uuid;
  v_entity_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  v_old:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;

  if tg_table_name='businesses' then
    v_business_id:=coalesce(new.id,old.id);
    v_entity_id:=v_business_id;
    -- A deleted business can no longer satisfy operator_audit_log.business_id FK.
    if tg_op='DELETE' then return old; end if;
  elsif tg_table_name='listings' then
    v_business_id:=coalesce(new.business_id,old.business_id);
    v_entity_id:=coalesce(new.id,old.id);
    -- Keep the business-level audit record for listing deletion, but do not
    -- reference a listing row that no longer exists.
    v_listing_id:=case when tg_op='DELETE' then null else coalesce(new.id,old.id) end;
  elsif tg_table_name='accommodation_rooms' then
    v_entity_id:=coalesce(new.id,old.id);
    select l.id,l.business_id into v_listing_id,v_business_id
    from public.listings l where l.id=coalesce(new.listing_id,old.listing_id);
  elsif tg_table_name='room_rate_plans' then
    v_entity_id:=coalesce(new.id,old.id);
    select l.id,l.business_id into v_listing_id,v_business_id
    from public.accommodation_rooms r join public.listings l on l.id=r.listing_id
    where r.id=coalesce(new.room_id,old.room_id);
  elsif tg_table_name='listing_policies' then
    v_listing_id:=coalesce(new.listing_id,old.listing_id);
    v_entity_id:=v_listing_id;
    select business_id into v_business_id from public.listings where id=v_listing_id;
  elsif tg_table_name='promotions' then
    v_entity_id:=coalesce(new.id,old.id);
    v_listing_id:=coalesce(new.listing_id,old.listing_id);
    select business_id into v_business_id from public.listings where id=v_listing_id;
  else
    return coalesce(new,old);
  end if;

  -- Cascading deletes may remove the parent before this audit trigger runs.
  -- In that case there is no valid FK-safe audit row to write.
  if v_business_id is null or not exists(select 1 from public.businesses where id=v_business_id) then
    return coalesce(new,old);
  end if;
  if v_listing_id is not null and not exists(select 1 from public.listings where id=v_listing_id) then
    v_listing_id:=null;
  end if;

  insert into public.operator_audit_log(business_id,listing_id,actor_id,entity_type,entity_id,action,changes)
  values(v_business_id,v_listing_id,auth.uid(),tg_table_name,v_entity_id,lower(tg_op),jsonb_build_object('before',v_old,'after',v_new));
  return coalesce(new,old);
end;
$$;
