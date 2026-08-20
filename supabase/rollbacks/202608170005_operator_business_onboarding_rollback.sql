-- Roll back 202608170005_operator_business_onboarding.sql without deleting
-- Auth users or business records created while the migration was active.

revoke insert (
  contact_person_name,
  business_name,
  registration_number,
  category,
  island,
  email,
  phone,
  business_address,
  website_url,
  description,
  public_contact,
  accuracy_confirmed,
  terms_accepted
) on public.businesses from authenticated;

drop policy if exists "businesses_insert_own_operator"
on public.businesses;

drop trigger if exists businesses_00_enforce_new_workflow
on public.businesses;

drop function if exists private.enforce_new_business_workflow();

alter table public.businesses
  alter column owner_id drop default,
  alter column is_active set default true;

alter table public.businesses enable row level security;
