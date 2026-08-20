-- Visit Baa / Baa Local core schema
-- Run with the Supabase CLI (`supabase db push`) or in the SQL editor.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create type public.app_role as enum ('operator', 'admin');
create type public.business_status as enum (
  'pending_review',
  'verified',
  'changes_requested',
  'rejected',
  'suspended'
);
create type public.listing_status as enum (
  'draft',
  'pending_review',
  'changes_requested',
  'published',
  'rejected',
  'paused'
);
create type public.enquiry_status as enum (
  'new',
  'accepted',
  'declined',
  'completed',
  'cancelled'
);
create type public.operator_category as enum (
  'guesthouse_hotel',
  'dive_centre',
  'snorkelling_excursion',
  'fishing_operator',
  'watersports_provider',
  'restaurant_cafe',
  'speedboat_transfer',
  'conservation_community',
  'other_tourism_service'
);
create type public.listing_category as enum (
  'accommodation',
  'excursion',
  'diving',
  'snorkelling',
  'fishing',
  'watersports',
  'food_dining',
  'transfer',
  'conservation_experience',
  'community_experience',
  'other'
);
create type public.baa_island as enum (
  'Dharavandhoo',
  'Dhonfanu',
  'Eydhafushi',
  'Fehendhoo',
  'Fulhadhoo',
  'Goidhoo',
  'Hithaadhoo',
  'Kamadhoo',
  'Kendhoo',
  'Kihaadhoo',
  'Kudarikilu',
  'Maalhos',
  'Thulhaadhoo'
);
create type public.price_unit as enum (
  'per_person',
  'per_room',
  'per_night',
  'per_trip',
  'per_hour',
  'fixed'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'operator',
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  contact_person_name text not null check (char_length(contact_person_name) between 2 and 120),
  business_name text not null check (char_length(business_name) between 2 and 180),
  registration_number text not null check (char_length(registration_number) between 2 and 80),
  category public.operator_category not null,
  island public.baa_island not null,
  email text not null,
  phone text not null,
  business_address text not null,
  website_url text,
  description text not null check (char_length(description) between 20 and 1500),
  logo_path text,
  public_contact boolean not null default true,
  accuracy_confirmed boolean not null default false,
  terms_accepted boolean not null default false,
  status public.business_status not null default 'pending_review',
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index businesses_registration_number_unique
  on public.businesses (lower(registration_number));
create index businesses_owner_id_idx on public.businesses(owner_id);
create index businesses_status_idx on public.businesses(status);
create index businesses_island_idx on public.businesses(island);

create table public.business_images (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  storage_path text not null unique,
  caption text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);
create index business_images_business_id_idx on public.business_images(business_id);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 180),
  category public.listing_category not null,
  island public.baa_island not null,
  summary text not null check (char_length(summary) between 10 and 300),
  description text not null check (char_length(description) between 30 and 5000),
  price numeric(12,2) not null default 0 check (price >= 0),
  currency char(3) not null default 'USD' check (currency = upper(currency)),
  price_unit public.price_unit not null default 'per_person',
  start_time time,
  end_time time,
  max_capacity integer not null default 1 check (max_capacity > 0),
  available_spaces integer not null default 1 check (available_spaces >= 0),
  included_items text[] not null default '{}',
  excluded_items text[] not null default '{}',
  meeting_point text,
  requirements text,
  cancellation_information text,
  cover_image_path text,
  property_type text,
  room_type text,
  maximum_guests integer check (maximum_guests is null or maximum_guests > 0),
  number_of_rooms integer check (number_of_rooms is null or number_of_rooms > 0),
  amenities text[] not null default '{}',
  check_in_time time,
  check_out_time time,
  price_per_night numeric(12,2) check (price_per_night is null or price_per_night >= 0),
  status public.listing_status not null default 'draft',
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_available_spaces_capacity_check check (available_spaces <= max_capacity),
  constraint listings_time_order_check check (start_time is null or end_time is null or start_time < end_time),
  constraint accommodation_fields_check check (
    category <> 'accommodation'
    or (property_type is not null and room_type is not null and maximum_guests is not null and number_of_rooms is not null)
  )
);
create index listings_business_id_idx on public.listings(business_id);
create index listings_status_idx on public.listings(status);
create index listings_island_category_idx on public.listings(island, category);
create index listings_public_idx on public.listings(status, is_active) where status = 'published';

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text not null unique,
  caption text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);
create index listing_images_listing_id_idx on public.listing_images(listing_id);

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  available_date date not null,
  start_time time,
  end_time time,
  max_capacity integer not null check (max_capacity > 0),
  remaining_spaces integer not null check (remaining_spaces >= 0),
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_remaining_capacity_check check (remaining_spaces <= max_capacity),
  constraint availability_time_order_check check (start_time is null or end_time is null or start_time < end_time),
  constraint availability_blocked_spaces_check check (not is_blocked or remaining_spaces = 0),
  unique nulls not distinct (listing_id, available_date, start_time)
);
create index availability_listing_date_idx on public.availability(listing_id, available_date);
create index availability_upcoming_idx on public.availability(available_date) where not is_blocked;

create table public.booking_enquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete restrict,
  operator_id uuid not null references auth.users(id) on delete restrict,
  availability_id uuid references public.availability(id) on delete set null,
  requested_date date not null,
  requested_time time,
  guest_count integer not null check (guest_count > 0),
  guest_full_name text not null check (char_length(guest_full_name) between 2 and 120),
  guest_email text not null,
  guest_phone text not null,
  guest_message text check (guest_message is null or char_length(guest_message) <= 2000),
  status public.enquiry_status not null default 'new',
  operator_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index booking_enquiries_listing_id_idx on public.booking_enquiries(listing_id);
create index booking_enquiries_operator_status_idx on public.booking_enquiries(operator_id, status);
create index booking_enquiries_requested_date_idx on public.booking_enquiries(requested_date);

create table public.review_history (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in ('business', 'listing')),
  target_id uuid not null,
  previous_status text,
  new_status text not null,
  note text,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index review_history_target_idx on public.review_history(target_type, target_id, created_at desc);

-- Shared helpers ------------------------------------------------------------

create or replace function private.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = coalesce(p_user_id, auth.uid())
      and role = 'admin'
  );
$$;

create or replace function private.owns_business(p_business_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.businesses
    where id = p_business_id
      and owner_id = coalesce(p_user_id, auth.uid())
  );
$$;

create or replace function private.owns_listing(p_listing_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings l
    join public.businesses b on b.id = l.business_id
    where l.id = p_listing_id
      and b.owner_id = coalesce(p_user_id, auth.uid())
  );
$$;

create or replace function private.owns_verified_business(p_business_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.businesses
    where id = p_business_id
      and owner_id = coalesce(p_user_id, auth.uid())
      and status = 'verified'
      and is_active
  );
$$;

create or replace function private.is_public_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings l
    join public.businesses b on b.id = l.business_id
    where l.id = p_listing_id
      and l.status = 'published'
      and l.is_active
      and b.status = 'verified'
      and b.is_active
  );
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_90_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger businesses_90_set_updated_at
before update on public.businesses
for each row execute function private.set_updated_at();

create trigger listings_90_set_updated_at
before update on public.listings
for each row execute function private.set_updated_at();

create trigger availability_90_set_updated_at
before update on public.availability
for each row execute function private.set_updated_at();

create trigger booking_enquiries_90_set_updated_at
before update on public.booking_enquiries
for each row execute function private.set_updated_at();

-- Create the operator profile and pending business from trusted server-side
-- trigger logic after Auth creates a user. Authorization never relies on metadata.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.operator_category;
  v_island public.baa_island;
begin
  begin
    v_category := (new.raw_user_meta_data ->> 'operator_category')::public.operator_category;
  exception when others then
    v_category := 'other_tourism_service';
  end;

  begin
    v_island := (new.raw_user_meta_data ->> 'island')::public.baa_island;
  exception when others then
    v_island := 'Dharavandhoo';
  end;

  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'New operator'),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'operator');

  if nullif(new.raw_user_meta_data ->> 'business_name', '') is not null then
    insert into public.businesses (
      owner_id,
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
      accuracy_confirmed,
      terms_accepted
    ) values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'New operator'),
      new.raw_user_meta_data ->> 'business_name',
      coalesce(nullif(new.raw_user_meta_data ->> 'registration_number', ''), 'PENDING-' || new.id::text),
      v_category,
      v_island,
      coalesce(new.email, ''),
      coalesce(new.raw_user_meta_data ->> 'phone', ''),
      coalesce(new.raw_user_meta_data ->> 'business_address', ''),
      nullif(new.raw_user_meta_data ->> 'website_url', ''),
      coalesce(nullif(new.raw_user_meta_data ->> 'description', ''), 'Business profile awaiting completion.'),
      coalesce((new.raw_user_meta_data ->> 'accuracy_confirmed')::boolean, false),
      coalesce((new.raw_user_meta_data ->> 'terms_accepted')::boolean, false)
    );
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

-- Prevent operators from editing protected business approval fields.
create or replace function private.protect_business_review_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_admin(auth.uid()) then
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
    or new.status is distinct from old.status
    or new.review_note is distinct from old.review_note
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.is_active is distinct from old.is_active then
    raise exception 'Business approval fields can only be changed by an administrator';
  end if;

  return new;
end;
$$;

create trigger businesses_10_protect_review_fields
before update on public.businesses
for each row execute function private.protect_business_review_fields();

-- Enforce listing ownership and status transitions in the database.
create or replace function private.enforce_listing_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verified boolean;
begin
  if private.is_admin(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not private.owns_verified_business(new.business_id, auth.uid()) then
      raise exception 'A verified business is required to create listings';
    end if;
    if new.status <> 'draft' then
      raise exception 'New operator listings must start as drafts';
    end if;
    new.review_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    return new;
  end if;

  if new.business_id is distinct from old.business_id then
    raise exception 'A listing cannot be moved to another business';
  end if;

  if new.review_note is distinct from old.review_note
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Listing review fields can only be changed by an administrator';
  end if;

  if old.status in ('pending_review', 'published')
    and new.status = old.status
    and new is distinct from old then
    raise exception 'Listings cannot be edited while pending review or published';
  end if;

  if new.status is distinct from old.status then
    v_verified := private.owns_verified_business(new.business_id, auth.uid());

    if old.status in ('draft', 'changes_requested', 'rejected', 'paused')
      and new.status = 'pending_review' and v_verified then
      return new;
    elsif old.status = 'published' and new.status = 'paused' then
      return new;
    elsif old.status in ('changes_requested', 'rejected', 'paused') and new.status = 'draft' then
      return new;
    else
      raise exception 'This listing status transition is not allowed for operators';
    end if;
  end if;

  return new;
end;
$$;

create trigger listings_10_enforce_workflow
before insert or update on public.listings
for each row execute function private.enforce_listing_workflow();

-- Never trust public clients to provide operator or business ownership.
create or replace function private.fill_enquiry_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_operator_id uuid;
  v_capacity integer;
begin
  if new.requested_date < current_date then
    raise exception 'Booking enquiries cannot request a past date';
  end if;

  select l.business_id, b.owner_id, coalesce(a.remaining_spaces, l.available_spaces)
    into v_business_id, v_operator_id, v_capacity
  from public.listings l
  join public.businesses b on b.id = l.business_id
  left join public.availability a on a.id = new.availability_id and a.listing_id = l.id
  where l.id = new.listing_id
    and l.status = 'published'
    and l.is_active
    and b.status = 'verified'
    and b.is_active;

  if v_business_id is null then
    raise exception 'This listing is not available for enquiries';
  end if;

  if new.availability_id is not null and not exists (
    select 1 from public.availability a
    where a.id = new.availability_id
      and a.listing_id = new.listing_id
      and not a.is_blocked
      and a.available_date = new.requested_date
      and (new.requested_time is null or new.requested_time = a.start_time)
  ) then
    raise exception 'The selected availability does not match this enquiry';
  end if;

  if new.guest_count > v_capacity then
    raise exception 'Guest count exceeds the available capacity';
  end if;

  new.business_id := v_business_id;
  new.operator_id := v_operator_id;
  new.status := 'new';
  new.operator_response := null;
  return new;
end;
$$;

create trigger booking_enquiries_10_fill_ownership
before insert on public.booking_enquiries
for each row execute function private.fill_enquiry_ownership();

create or replace function private.protect_enquiry_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_admin(auth.uid()) then
    return new;
  end if;

  if new.listing_id is distinct from old.listing_id
    or new.business_id is distinct from old.business_id
    or new.operator_id is distinct from old.operator_id
    or new.availability_id is distinct from old.availability_id
    or new.requested_date is distinct from old.requested_date
    or new.requested_time is distinct from old.requested_time
    or new.guest_count is distinct from old.guest_count
    or new.guest_full_name is distinct from old.guest_full_name
    or new.guest_email is distinct from old.guest_email
    or new.guest_phone is distinct from old.guest_phone
    or new.guest_message is distinct from old.guest_message then
    raise exception 'Operators can only change enquiry status and response';
  end if;

  if new.status not in ('accepted', 'declined', 'completed', 'cancelled') then
    raise exception 'Invalid operator enquiry status';
  end if;

  return new;
end;
$$;

create trigger booking_enquiries_10_protect_fields
before update on public.booking_enquiries
for each row execute function private.protect_enquiry_fields();

-- Review and submission RPCs -----------------------------------------------

create or replace function public.submit_listing(p_listing_id uuid)
returns public.listings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_listing public.listings;
begin
  update public.listings
  set status = 'pending_review'
  where id = p_listing_id
  returning * into v_listing;

  if v_listing.id is null then
    raise exception 'Listing not found or not accessible';
  end if;

  return v_listing;
end;
$$;

create or replace function public.submit_business(p_business_id uuid)
returns public.businesses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
begin
  -- The trigger reads this transaction-local flag to permit only this narrow,
  -- server-controlled resubmission transition. It does not depend on the
  -- database owner's role name.
  perform set_config('app.business_resubmit', 'true', true);

  update public.businesses
  set status = 'pending_review'
  where id = p_business_id
    and owner_id = auth.uid()
    and status in ('changes_requested', 'rejected')
  returning * into v_business;

  if v_business.id is null then
    raise exception 'Business is not eligible for resubmission';
  end if;

  return v_business;
end;
$$;

create or replace function public.admin_review_business(
  p_business_id uuid,
  p_status public.business_status,
  p_note text default null
)
returns public.businesses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.business_status;
  v_business public.businesses;
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'Administrator access required';
  end if;

  if p_status not in ('verified', 'changes_requested', 'rejected', 'suspended') then
    raise exception 'Invalid administrator business decision';
  end if;

  if p_status = 'verified' and not exists (
    select 1 from public.businesses
    where id = p_business_id and accuracy_confirmed and terms_accepted
  ) then
    raise exception 'The business must confirm accuracy and platform terms before verification';
  end if;

  select status into v_previous from public.businesses where id = p_business_id for update;
  if v_previous is null then raise exception 'Business not found'; end if;

  update public.businesses
  set status = p_status,
      review_note = nullif(trim(p_note), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      is_active = p_status not in ('rejected', 'suspended')
  where id = p_business_id
  returning * into v_business;

  insert into public.review_history(target_type, target_id, previous_status, new_status, note, reviewed_by)
  values ('business', p_business_id, v_previous::text, p_status::text, nullif(trim(p_note), ''), auth.uid());

  return v_business;
end;
$$;

create or replace function public.admin_review_listing(
  p_listing_id uuid,
  p_status public.listing_status,
  p_note text default null
)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.listing_status;
  v_listing public.listings;
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'Administrator access required';
  end if;

  if p_status not in ('published', 'changes_requested', 'rejected', 'paused') then
    raise exception 'Invalid administrator listing decision';
  end if;

  select status into v_previous from public.listings where id = p_listing_id for update;
  if v_previous is null then raise exception 'Listing not found'; end if;

  if p_status in ('published', 'changes_requested', 'rejected') and v_previous <> 'pending_review' then
    raise exception 'Only pending listings can receive a review decision';
  end if;

  if p_status = 'paused' and v_previous <> 'published' then
    raise exception 'Only published listings can be paused';
  end if;

  if p_status = 'published' and not exists (
    select 1
    from public.listings l
    join public.businesses b on b.id = l.business_id
    where l.id = p_listing_id and b.status = 'verified' and b.is_active
  ) then
    raise exception 'Only listings from verified businesses can be published';
  end if;

  update public.listings
  set status = p_status,
      review_note = nullif(trim(p_note), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      is_active = p_status <> 'paused'
  where id = p_listing_id
  returning * into v_listing;

  insert into public.review_history(target_type, target_id, previous_status, new_status, note, reviewed_by)
  values ('listing', p_listing_id, v_previous::text, p_status::text, nullif(trim(p_note), ''), auth.uid());

  return v_listing;
end;
$$;

-- Public read models expose only approved information and never guest data. --

create view public.public_businesses
with (security_barrier = true)
as
select
  b.id,
  b.business_name,
  b.category,
  b.island,
  b.description,
  b.logo_path,
  case when b.public_contact then b.email end as contact_email,
  case when b.public_contact then b.phone end as contact_phone,
  case when b.public_contact then b.website_url end as website_url,
  case when b.public_contact then b.business_address end as business_address,
  b.updated_at
from public.businesses b
where b.status = 'verified' and b.is_active;

create view public.public_listings
with (security_barrier = true)
as
select
  l.id,
  l.business_id,
  b.business_name,
  b.logo_path as business_logo_path,
  l.title,
  l.category,
  l.island,
  l.summary,
  l.description,
  l.price,
  l.currency,
  l.price_unit,
  l.start_time,
  l.end_time,
  l.max_capacity,
  l.available_spaces,
  l.included_items,
  l.excluded_items,
  l.meeting_point,
  l.requirements,
  l.cancellation_information,
  l.cover_image_path,
  l.property_type,
  l.room_type,
  l.maximum_guests,
  l.number_of_rooms,
  l.amenities,
  l.check_in_time,
  l.check_out_time,
  l.price_per_night,
  case when b.public_contact then b.email end as contact_email,
  case when b.public_contact then b.phone end as contact_phone,
  case when b.public_contact then b.website_url end as website_url,
  l.updated_at
from public.listings l
join public.businesses b on b.id = l.business_id
where l.status = 'published'
  and l.is_active
  and b.status = 'verified'
  and b.is_active;

create view public.public_availability
with (security_barrier = true)
as
select
  a.id,
  a.listing_id,
  a.available_date,
  a.start_time,
  a.end_time,
  a.max_capacity,
  a.remaining_spaces
from public.availability a
join public.listings l on l.id = a.listing_id
join public.businesses b on b.id = l.business_id
where a.available_date >= current_date
  and not a.is_blocked
  and l.status = 'published'
  and l.is_active
  and b.status = 'verified'
  and b.is_active;

comment on view public.public_listings is 'Approved public listing data only; excludes private review and registration fields.';
comment on table public.booking_enquiries is 'Private enquiry contact data; never grant public SELECT.';
