-- Visit Baa marketplace engine. Extends existing listings, availability and
-- enquiries; the established facilities/listings.amenities system is untouched.

alter table public.businesses
  add column latitude numeric(9,6),
  add column longitude numeric(9,6),
  add constraint businesses_latitude_check check (latitude is null or latitude between -90 and 90),
  add constraint businesses_longitude_check check (longitude is null or longitude between -180 and 180);

alter table public.listings
  add column latitude numeric(9,6),
  add column longitude numeric(9,6),
  add column child_price numeric(12,2),
  add column taxes_amount numeric(12,2) not null default 0,
  add column fees_amount numeric(12,2) not null default 0,
  add constraint listings_latitude_check check (latitude is null or latitude between -90 and 90),
  add constraint listings_longitude_check check (longitude is null or longitude between -180 and 180),
  add constraint listings_child_price_check check (child_price is null or child_price >= 0),
  add constraint listings_taxes_amount_check check (taxes_amount >= 0),
  add constraint listings_fees_amount_check check (fees_amount >= 0);

create table public.traveler_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 120),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accommodation_rooms (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text check (description is null or char_length(description) <= 2000),
  maximum_guests integer not null check (maximum_guests > 0),
  adult_capacity integer not null check (adult_capacity > 0),
  child_capacity integer not null default 0 check (child_capacity >= 0),
  bed_configuration text not null check (char_length(bed_configuration) between 2 and 200),
  room_size_sqm numeric(8,2) check (room_size_sqm is null or room_size_sqm > 0),
  view_type text,
  quantity integer not null check (quantity > 0),
  base_price numeric(12,2) not null check (base_price >= 0),
  currency char(3) not null default 'USD' check (currency = upper(currency)),
  amenities text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accommodation_rooms_capacity_check check (adult_capacity + child_capacity <= maximum_guests)
);
create index accommodation_rooms_listing_sort_idx on public.accommodation_rooms(listing_id, is_active, sort_order);

create table public.room_images (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.accommodation_rooms(id) on delete cascade,
  storage_path text not null unique,
  caption text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);
create index room_images_room_sort_idx on public.room_images(room_id, sort_order);

create table public.room_availability (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.accommodation_rooms(id) on delete cascade,
  available_date date not null,
  total_quantity integer not null check (total_quantity > 0),
  available_quantity integer not null check (available_quantity >= 0),
  price_override numeric(12,2) check (price_override is null or price_override >= 0),
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, available_date),
  constraint room_availability_quantity_check check (available_quantity <= total_quantity),
  constraint room_availability_blocked_check check (not is_blocked or available_quantity = 0)
);
create index room_availability_date_room_idx on public.room_availability(available_date, room_id);

create table public.room_rate_plans (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.accommodation_rooms(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  nightly_price numeric(12,2) not null check (nightly_price >= 0),
  meal_plan text,
  free_cancellation boolean not null default false,
  cancellation_deadline_hours integer check (cancellation_deadline_hours is null or cancellation_deadline_hours >= 0),
  is_refundable boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index room_rate_plans_room_sort_idx on public.room_rate_plans(room_id, is_active, sort_order);

create table public.listing_policies (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  cancellation_type text not null default 'legacy' check (cancellation_type in ('legacy','free_cancellation','deadline','non_refundable')),
  cancellation_deadline_hours integer check (cancellation_deadline_hours is null or cancellation_deadline_hours >= 0),
  cancellation_penalty text,
  check_in_from time,
  check_in_until time,
  check_out_from time,
  check_out_until time,
  children_allowed boolean,
  minimum_child_age integer check (minimum_child_age is null or minimum_child_age between 0 and 17),
  child_pricing_notes text,
  pets_policy text check (pets_policy is null or pets_policy in ('allowed','not_allowed','on_request')),
  smoking_policy text check (smoking_policy is null or smoking_policy in ('non_smoking','smoking_areas')),
  payment_condition text check (payment_condition is null or payment_condition in ('pay_at_property','deposit_required','prepayment_required')),
  updated_at timestamptz not null default now()
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  valid_from date not null,
  valid_until date not null,
  minimum_nights integer check (minimum_nights is null or minimum_nights > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_dates_check check (valid_from <= valid_until),
  constraint promotions_percent_check check (discount_type <> 'percent' or discount_value <= 100)
);
create index promotions_listing_dates_idx on public.promotions(listing_id, is_active, valid_from, valid_until);

alter table public.booking_enquiries
  add column traveler_id uuid references auth.users(id) on delete set null,
  add column room_id uuid references public.accommodation_rooms(id) on delete set null,
  add column rate_plan_id uuid references public.room_rate_plans(id) on delete set null,
  add column check_out_date date,
  add column adult_count integer not null default 1,
  add column child_count integer not null default 0,
  add column rooms_requested integer not null default 1,
  add column booking_reference text not null default ('VB-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6))),
  add column quoted_subtotal numeric(12,2) not null default 0,
  add column discount_amount numeric(12,2) not null default 0,
  add column taxes_amount numeric(12,2) not null default 0,
  add column fees_amount numeric(12,2) not null default 0,
  add column quoted_total numeric(12,2) not null default 0,
  add column quote_currency char(3) not null default 'USD',
  add column inventory_committed boolean not null default false,
  add column confirmed_at timestamptz,
  add constraint booking_enquiries_reference_unique unique (booking_reference),
  add constraint booking_enquiries_stay_dates_check check (check_out_date is null or check_out_date > requested_date),
  add constraint booking_enquiries_adults_check check (adult_count > 0),
  add constraint booking_enquiries_children_check check (child_count >= 0),
  add constraint booking_enquiries_rooms_check check (rooms_requested > 0),
  add constraint booking_enquiries_quote_check check (
    quoted_subtotal >= 0 and discount_amount >= 0 and taxes_amount >= 0 and fees_amount >= 0 and quoted_total >= 0
  );
create index booking_enquiries_traveler_created_idx on public.booking_enquiries(traveler_id, created_at desc);
create index booking_enquiries_reference_idx on public.booking_enquiries(booking_reference);

create table public.saved_listings (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Baa Trip' check (char_length(name) between 2 and 120),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_dates_check check (start_date is null or end_date is null or start_date <= end_date)
);
create index trips_user_updated_idx on public.trips(user_id, updated_at desc);

create table public.trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  planned_date date,
  planned_time time,
  note text check (note is null or char_length(note) <= 1000),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique nulls not distinct (trip_id, listing_id, planned_date, planned_time)
);
create index trip_items_trip_sort_idx on public.trip_items(trip_id, planned_date, sort_order);

create table public.enquiry_messages (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.booking_enquiries(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index enquiry_messages_enquiry_created_idx on public.enquiry_messages(enquiry_id, created_at);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null unique references public.booking_enquiries(id) on delete restrict,
  listing_id uuid not null references public.listings(id) on delete restrict,
  traveler_id uuid not null references auth.users(id) on delete restrict,
  display_name text not null,
  overall_rating numeric(3,1) not null check (overall_rating between 1 and 10),
  cleanliness_rating numeric(3,1) check (cleanliness_rating is null or cleanliness_rating between 1 and 10),
  staff_rating numeric(3,1) check (staff_rating is null or staff_rating between 1 and 10),
  location_rating numeric(3,1) check (location_rating is null or location_rating between 1 and 10),
  comfort_rating numeric(3,1) check (comfort_rating is null or comfort_rating between 1 and 10),
  guide_rating numeric(3,1) check (guide_rating is null or guide_rating between 1 and 10),
  organization_rating numeric(3,1) check (organization_rating is null or organization_rating between 1 and 10),
  safety_rating numeric(3,1) check (safety_rating is null or safety_rating between 1 and 10),
  value_rating numeric(3,1) check (value_rating is null or value_rating between 1 and 10),
  title text check (title is null or char_length(title) <= 160),
  body text not null check (char_length(body) between 10 and 3000),
  status text not null default 'published' check (status in ('published','reported','removed')),
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reviews_listing_status_created_idx on public.reviews(listing_id, status, created_at desc);

create table public.review_responses (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  operator_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(body) between 2 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Shared authorization helpers --------------------------------------------

create or replace function private.owns_room(p_room_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.accommodation_rooms r
    where r.id = p_room_id and private.owns_listing(r.listing_id, coalesce(p_user_id, auth.uid()))
  );
$$;

create or replace function private.can_access_enquiry(p_enquiry_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.booking_enquiries e
    where e.id = p_enquiry_id
      and (e.operator_id = coalesce(p_user_id, auth.uid()) or e.traveler_id = coalesce(p_user_id, auth.uid()))
  ) or private.is_admin(coalesce(p_user_id, auth.uid()));
$$;

create or replace function private.is_traveler(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_roles where user_id=coalesce(p_user_id,auth.uid()) and role='traveler');
$$;

revoke all on function private.owns_room(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_access_enquiry(uuid, uuid) from public, anon, authenticated;
revoke all on function private.is_traveler(uuid) from public, anon, authenticated;
grant execute on function private.owns_room(uuid, uuid) to authenticated;
grant execute on function private.can_access_enquiry(uuid, uuid) to authenticated;
grant execute on function private.is_traveler(uuid) to authenticated;

-- Updated-at triggers ------------------------------------------------------

create trigger traveler_profiles_90_set_updated_at before update on public.traveler_profiles for each row execute function private.set_updated_at();
create trigger accommodation_rooms_90_set_updated_at before update on public.accommodation_rooms for each row execute function private.set_updated_at();
create trigger room_availability_90_set_updated_at before update on public.room_availability for each row execute function private.set_updated_at();
create trigger room_rate_plans_90_set_updated_at before update on public.room_rate_plans for each row execute function private.set_updated_at();
create trigger listing_policies_90_set_updated_at before update on public.listing_policies for each row execute function private.set_updated_at();
create trigger promotions_90_set_updated_at before update on public.promotions for each row execute function private.set_updated_at();
create trigger trips_90_set_updated_at before update on public.trips for each row execute function private.set_updated_at();
create trigger reviews_90_set_updated_at before update on public.reviews for each row execute function private.set_updated_at();
create trigger review_responses_90_set_updated_at before update on public.review_responses for each row execute function private.set_updated_at();

-- New Auth users may now choose traveler onboarding. Authorization still
-- comes only from user_roles, never editable user metadata.
create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_category public.operator_category;
  v_island public.baa_island;
  v_is_traveler boolean := coalesce(new.raw_user_meta_data ->> 'account_type', '') = 'traveler';
  v_name text := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'New traveler');
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, v_name, nullif(new.raw_user_meta_data ->> 'phone', ''));

  if v_is_traveler then
    insert into public.user_roles (user_id, role) values (new.id, 'traveler');
    insert into public.traveler_profiles(user_id, display_name, phone)
    values (new.id, v_name, nullif(new.raw_user_meta_data ->> 'phone', ''));
    return new;
  end if;

  begin v_category := (new.raw_user_meta_data ->> 'operator_category')::public.operator_category;
  exception when others then v_category := 'other_tourism_service'; end;
  begin v_island := (new.raw_user_meta_data ->> 'island')::public.baa_island;
  exception when others then v_island := 'Dharavandhoo'; end;

  insert into public.user_roles (user_id, role) values (new.id, 'operator');
  if nullif(new.raw_user_meta_data ->> 'business_name', '') is not null then
    insert into public.businesses (
      owner_id,contact_person_name,business_name,registration_number,category,island,email,phone,
      business_address,website_url,description,accuracy_confirmed,terms_accepted
    ) values (
      new.id,v_name,new.raw_user_meta_data ->> 'business_name',
      coalesce(nullif(new.raw_user_meta_data ->> 'registration_number', ''), 'PENDING-' || new.id::text),
      v_category,v_island,coalesce(new.email, ''),coalesce(new.raw_user_meta_data ->> 'phone', ''),
      coalesce(new.raw_user_meta_data ->> 'business_address', ''),nullif(new.raw_user_meta_data ->> 'website_url', ''),
      coalesce(nullif(new.raw_user_meta_data ->> 'description', ''), 'Business profile awaiting completion.'),
      coalesce((new.raw_user_meta_data ->> 'accuracy_confirmed')::boolean, false),
      coalesce((new.raw_user_meta_data ->> 'terms_accepted')::boolean, false)
    );
  end if;
  return new;
end;
$$;

-- Room-image path ownership is enforced in the database as well as Storage.
create or replace function private.validate_room_image_path()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if private.is_admin(auth.uid()) then return new; end if;
  select b.owner_id into v_owner
  from public.accommodation_rooms r
  join public.listings l on l.id = r.listing_id
  join public.businesses b on b.id = l.business_id
  where r.id = new.room_id;
  if v_owner is distinct from auth.uid() or split_part(new.storage_path, '/', 1) <> auth.uid()::text then
    raise exception 'Room image path must belong to the signed-in operator';
  end if;
  return new;
end;
$$;
create trigger room_images_05_validate_path before insert or update on public.room_images for each row execute function private.validate_room_image_path();
revoke all on function private.validate_room_image_path() from public, anon, authenticated;

-- Reservation pricing and capacity ----------------------------------------

create or replace function private.fill_enquiry_ownership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_business_id uuid;
  v_operator_id uuid;
  v_capacity integer;
begin
  if new.requested_date < current_date then raise exception 'Booking enquiries cannot request a past date'; end if;
  select l.business_id,b.owner_id,
    case when new.room_id is not null then r.maximum_guests*new.rooms_requested
         else coalesce(a.remaining_spaces,l.available_spaces) end
  into v_business_id,v_operator_id,v_capacity
  from public.listings l join public.businesses b on b.id=l.business_id
  left join public.availability a on a.id=new.availability_id and a.listing_id=l.id
  left join public.accommodation_rooms r on r.id=new.room_id and r.listing_id=l.id and r.is_active
  where l.id=new.listing_id and l.status='published' and l.is_active and b.status='verified' and b.is_active;
  if v_business_id is null then raise exception 'This listing is not available for enquiries'; end if;
  if new.availability_id is not null and not exists(
    select 1 from public.availability a where a.id=new.availability_id and a.listing_id=new.listing_id
      and not a.is_blocked and a.available_date=new.requested_date
      and (new.requested_time is null or new.requested_time=a.start_time)
  ) then raise exception 'The selected availability does not match this enquiry'; end if;
  if new.room_id is not null and v_capacity is null then raise exception 'The selected room does not belong to this listing'; end if;
  if new.guest_count>v_capacity then raise exception 'Guest count exceeds the available capacity'; end if;
  new.business_id:=v_business_id;
  new.operator_id:=v_operator_id;
  new.status:='new';
  new.operator_response:=null;
  return new;
end;
$$;

create or replace function public.create_booking_request(
  p_listing_id uuid,
  p_availability_id uuid default null,
  p_room_id uuid default null,
  p_rate_plan_id uuid default null,
  p_requested_date date default null,
  p_check_out_date date default null,
  p_requested_time time default null,
  p_adults integer default 1,
  p_children integer default 0,
  p_rooms integer default 1,
  p_guest_full_name text default null,
  p_guest_email text default null,
  p_guest_phone text default null,
  p_guest_message text default null
)
returns public.booking_enquiries
language plpgsql security definer set search_path = '' as $$
declare
  v_listing public.listings;
  v_room public.accommodation_rooms;
  v_rate public.room_rate_plans;
  v_slot public.availability;
  v_result public.booking_enquiries;
  v_nights integer := 1;
  v_guest_count integer := coalesce(p_adults, 0) + coalesce(p_children, 0);
  v_unit_price numeric(12,2);
  v_subtotal numeric(12,2);
  v_discount numeric(12,2) := 0;
  v_promotion public.promotions;
  v_inventory_days integer;
begin
  if p_requested_date is null or p_requested_date < current_date then raise exception 'Choose a current or future date'; end if;
  if coalesce(p_adults,0) < 1 or coalesce(p_children,0) < 0 or coalesce(p_rooms,0) < 1 then raise exception 'Invalid traveler quantities'; end if;
  if char_length(trim(coalesce(p_guest_full_name,''))) < 2 or trim(coalesce(p_guest_email,'')) = '' or trim(coalesce(p_guest_phone,'')) = '' then
    raise exception 'Traveler name, email and phone are required';
  end if;

  select l.* into v_listing from public.listings l
  join public.businesses b on b.id=l.business_id
  where l.id=p_listing_id and l.status='published' and l.is_active and b.status='verified' and b.is_active;
  if v_listing.id is null then raise exception 'This listing is not available'; end if;

  if v_listing.category = 'accommodation' then
    if p_availability_id is not null then raise exception 'Accommodation requests use date-range inventory, not an activity session'; end if;
    if p_room_id is null and p_rate_plan_id is not null then raise exception 'A rate plan requires a room type'; end if;
    if p_check_out_date is null or p_check_out_date <= p_requested_date then raise exception 'Check-out must be after check-in'; end if;
    v_nights := p_check_out_date - p_requested_date;
    if p_room_id is not null then
      select * into v_room from public.accommodation_rooms
      where id=p_room_id and listing_id=p_listing_id and is_active;
      if v_room.id is null then raise exception 'The selected room is not available'; end if;
      if p_adults > v_room.adult_capacity*p_rooms or p_children > v_room.child_capacity*p_rooms or v_guest_count > v_room.maximum_guests*p_rooms then
        raise exception 'The selected rooms cannot accommodate this party';
      end if;
      select count(*) into v_inventory_days from public.room_availability
      where room_id=v_room.id and available_date>=p_requested_date and available_date<p_check_out_date
        and not is_blocked and available_quantity>=p_rooms;
      if v_inventory_days <> v_nights then raise exception 'The room is not available for the full stay'; end if;
      if p_rate_plan_id is not null then
        select * into v_rate from public.room_rate_plans where id=p_rate_plan_id and room_id=v_room.id and is_active;
        if v_rate.id is null then raise exception 'The selected rate plan is not available'; end if;
        v_unit_price := v_rate.nightly_price;
      else v_unit_price := v_room.base_price; end if;
      select sum(coalesce(ra.price_override,v_unit_price))*p_rooms into v_subtotal
      from public.room_availability ra
      where ra.room_id=v_room.id and ra.available_date>=p_requested_date and ra.available_date<p_check_out_date;
    else
      if v_guest_count > coalesce(v_listing.maximum_guests,1)*p_rooms then raise exception 'The listing cannot accommodate this party'; end if;
      select count(*) into v_inventory_days from public.availability
      where listing_id=p_listing_id and available_date>=p_requested_date and available_date<p_check_out_date
        and start_time is null and not is_blocked and remaining_spaces>=p_rooms;
      if v_inventory_days <> v_nights then raise exception 'Availability is not configured for the full stay'; end if;
      v_unit_price := coalesce(v_listing.price_per_night,v_listing.price);
    end if;
    v_subtotal := coalesce(v_subtotal,v_unit_price*v_nights*p_rooms);
  else
    if p_room_id is not null or p_rate_plan_id is not null or p_check_out_date is not null then raise exception 'Room details only apply to accommodation bookings'; end if;
    if p_availability_id is not null then
      select * into v_slot from public.availability
      where id=p_availability_id and listing_id=p_listing_id and available_date=p_requested_date
        and not is_blocked and remaining_spaces>=v_guest_count;
      if v_slot.id is null then raise exception 'The selected session is not available'; end if;
    elsif exists (select 1 from public.availability where listing_id=p_listing_id and available_date=p_requested_date) then
      raise exception 'Choose an available session';
    elsif v_guest_count > v_listing.available_spaces then raise exception 'Guest count exceeds available capacity';
    end if;
    v_unit_price := v_listing.price;
    v_subtotal := case v_listing.price_unit
      when 'per_person' then v_listing.price*p_adults + coalesce(v_listing.child_price,v_listing.price)*p_children
      when 'per_adult' then v_listing.price*p_adults + coalesce(v_listing.child_price,0)*p_children
      when 'per_child' then v_listing.price*p_children
      else v_listing.price end;
  end if;

  select p.* into v_promotion from public.promotions p
  where p.listing_id=p_listing_id and p.is_active and p_requested_date between p.valid_from and p.valid_until
    and (p.minimum_nights is null or v_nights>=p.minimum_nights)
  order by case when p.discount_type='percent' then v_subtotal*p.discount_value/100 else p.discount_value end desc
  limit 1;
  if v_promotion.id is not null then
    v_discount := least(v_subtotal, case when v_promotion.discount_type='percent' then round(v_subtotal*v_promotion.discount_value/100,2) else v_promotion.discount_value end);
  end if;

  insert into public.booking_enquiries (
    listing_id,availability_id,traveler_id,room_id,rate_plan_id,requested_date,check_out_date,requested_time,
    guest_count,adult_count,child_count,rooms_requested,guest_full_name,guest_email,guest_phone,guest_message,
    quoted_subtotal,discount_amount,taxes_amount,fees_amount,quoted_total,quote_currency
  ) values (
    p_listing_id,p_availability_id,case when private.is_traveler(auth.uid()) then auth.uid() else null end,p_room_id,p_rate_plan_id,p_requested_date,p_check_out_date,p_requested_time,
    v_guest_count,p_adults,p_children,p_rooms,trim(p_guest_full_name),trim(p_guest_email),trim(p_guest_phone),nullif(trim(p_guest_message),''),
    v_subtotal,v_discount,v_listing.taxes_amount,v_listing.fees_amount,
    greatest(0,v_subtotal-v_discount+v_listing.taxes_amount+v_listing.fees_amount),
    coalesce(v_room.currency,v_listing.currency)
  ) returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.operator_update_booking(p_enquiry_id uuid, p_status public.enquiry_status, p_response text default null)
returns public.booking_enquiries
language plpgsql security definer set search_path = '' as $$
declare
  v_enquiry public.booking_enquiries;
  v_listing public.listings;
  v_days integer;
  v_updated integer;
begin
  select * into v_enquiry from public.booking_enquiries where id=p_enquiry_id for update;
  if v_enquiry.id is null then raise exception 'Booking request not found'; end if;
  if v_enquiry.operator_id <> auth.uid() and not private.is_admin(auth.uid()) then raise exception 'Booking access denied'; end if;
  if not (
    (v_enquiry.status='new' and p_status in ('accepted','declined','changes_requested','cancelled')) or
    (v_enquiry.status in ('accepted','changes_requested') and p_status in ('confirmed','declined','changes_requested','cancelled')) or
    (v_enquiry.status='confirmed' and p_status in ('completed','cancelled','no_show'))
  ) then raise exception 'Invalid booking status transition'; end if;

  select * into v_listing from public.listings where id=v_enquiry.listing_id;
  perform set_config('app.booking_capacity_rpc','true',true);
  if p_status='confirmed' and not v_enquiry.inventory_committed then
    if v_enquiry.room_id is not null then
      v_days := v_enquiry.check_out_date-v_enquiry.requested_date;
      perform 1 from public.room_availability where room_id=v_enquiry.room_id
        and available_date>=v_enquiry.requested_date and available_date<v_enquiry.check_out_date for update;
      update public.room_availability set available_quantity=available_quantity-v_enquiry.rooms_requested
      where room_id=v_enquiry.room_id and available_date>=v_enquiry.requested_date and available_date<v_enquiry.check_out_date
        and not is_blocked and available_quantity>=v_enquiry.rooms_requested;
      get diagnostics v_updated = row_count;
      if v_updated<>v_days then raise exception 'Room inventory changed; this stay can no longer be confirmed'; end if;
    elsif v_listing.category='accommodation' then
      v_days := v_enquiry.check_out_date-v_enquiry.requested_date;
      perform 1 from public.availability where listing_id=v_enquiry.listing_id
        and available_date>=v_enquiry.requested_date and available_date<v_enquiry.check_out_date and start_time is null for update;
      update public.availability set remaining_spaces=remaining_spaces-v_enquiry.rooms_requested
      where listing_id=v_enquiry.listing_id and available_date>=v_enquiry.requested_date and available_date<v_enquiry.check_out_date
        and start_time is null and not is_blocked and remaining_spaces>=v_enquiry.rooms_requested;
      get diagnostics v_updated = row_count;
      if v_updated<>v_days then raise exception 'Accommodation inventory changed; this stay can no longer be confirmed'; end if;
    elsif v_enquiry.availability_id is not null then
      update public.availability set remaining_spaces=remaining_spaces-v_enquiry.guest_count
      where id=v_enquiry.availability_id and not is_blocked and remaining_spaces>=v_enquiry.guest_count;
      if not found then raise exception 'Session capacity changed; this booking can no longer be confirmed'; end if;
    else
      update public.listings set available_spaces=available_spaces-v_enquiry.guest_count
      where id=v_enquiry.listing_id and available_spaces>=v_enquiry.guest_count;
      if not found then raise exception 'Listing capacity changed; this booking can no longer be confirmed'; end if;
    end if;
  elsif p_status='cancelled' and v_enquiry.inventory_committed then
    if v_enquiry.room_id is not null then
      update public.room_availability set available_quantity=least(total_quantity,available_quantity+v_enquiry.rooms_requested)
      where room_id=v_enquiry.room_id and available_date>=v_enquiry.requested_date and available_date<v_enquiry.check_out_date;
    elsif v_listing.category='accommodation' then
      update public.availability set remaining_spaces=least(max_capacity,remaining_spaces+v_enquiry.rooms_requested)
      where listing_id=v_enquiry.listing_id and available_date>=v_enquiry.requested_date and available_date<v_enquiry.check_out_date and start_time is null;
    elsif v_enquiry.availability_id is not null then
      update public.availability set remaining_spaces=least(max_capacity,remaining_spaces+v_enquiry.guest_count) where id=v_enquiry.availability_id;
    else update public.listings set available_spaces=least(max_capacity,available_spaces+v_enquiry.guest_count) where id=v_enquiry.listing_id; end if;
  end if;

  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries set status=p_status,operator_response=nullif(trim(p_response),''),
    inventory_committed=case when p_status='confirmed' then true when p_status='cancelled' then false else inventory_committed end,
    confirmed_at=case when p_status='confirmed' then now() else confirmed_at end
  where id=p_enquiry_id returning * into v_enquiry;
  return v_enquiry;
end;
$$;

create or replace function public.traveler_cancel_booking(p_enquiry_id uuid)
returns public.booking_enquiries
language plpgsql security definer set search_path = '' as $$
declare
  v_enquiry public.booking_enquiries;
  v_listing public.listings;
begin
  select * into v_enquiry from public.booking_enquiries where id=p_enquiry_id for update;
  if v_enquiry.id is null or v_enquiry.traveler_id is distinct from auth.uid() then raise exception 'Booking access denied'; end if;
  if v_enquiry.status not in ('new','accepted','changes_requested','confirmed') then raise exception 'This booking can no longer be cancelled online'; end if;
  select * into v_listing from public.listings where id=v_enquiry.listing_id;
  perform set_config('app.booking_capacity_rpc','true',true);
  if v_enquiry.inventory_committed then
    if v_enquiry.room_id is not null then
      update public.room_availability set available_quantity=least(total_quantity,available_quantity+v_enquiry.rooms_requested)
      where room_id=v_enquiry.room_id and available_date>=v_enquiry.requested_date and available_date<v_enquiry.check_out_date;
    elsif v_listing.category='accommodation' then
      update public.availability set remaining_spaces=least(max_capacity,remaining_spaces+v_enquiry.rooms_requested)
      where listing_id=v_enquiry.listing_id and available_date>=v_enquiry.requested_date and available_date<v_enquiry.check_out_date and start_time is null;
    elsif v_enquiry.availability_id is not null then
      update public.availability set remaining_spaces=least(max_capacity,remaining_spaces+v_enquiry.guest_count) where id=v_enquiry.availability_id;
    else
      update public.listings set available_spaces=least(max_capacity,available_spaces+v_enquiry.guest_count) where id=v_enquiry.listing_id;
    end if;
  end if;
  perform set_config('app.booking_rpc','true',true);
  update public.booking_enquiries set status='cancelled',inventory_committed=false where id=p_enquiry_id returning * into v_enquiry;
  return v_enquiry;
end;
$$;

create or replace function private.enforce_listing_workflow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_verified boolean;
begin
  if private.is_admin(auth.uid()) then return new; end if;
  if tg_op='INSERT' then
    if not private.owns_verified_business(new.business_id,auth.uid()) then raise exception 'A verified business is required to create listings'; end if;
    if new.status<>'draft' then raise exception 'New operator listings must start as drafts'; end if;
    new.review_note:=null; new.reviewed_by:=null; new.reviewed_at:=null; return new;
  end if;
  if current_setting('app.booking_capacity_rpc',true)='true' then
    if new.available_spaces<0 or new.available_spaces>new.max_capacity then raise exception 'Invalid listing capacity'; end if;
    return new;
  end if;
  if new.business_id is distinct from old.business_id then raise exception 'A listing cannot be moved to another business'; end if;
  if new.review_note is distinct from old.review_note or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Listing review fields can only be changed by an administrator';
  end if;
  if current_setting('app.listing_withdraw_for_edit',true)='true' and old.status='pending_review' and new.status='draft'
    and private.owns_verified_business(new.business_id,auth.uid()) then return new; end if;
  if old.status in ('pending_review','published') and new.status=old.status and new is distinct from old then
    raise exception 'Listings cannot be edited while pending review or published';
  end if;
  if new.status is distinct from old.status then
    v_verified:=private.owns_verified_business(new.business_id,auth.uid());
    if old.status in ('draft','changes_requested','rejected','paused') and new.status='pending_review' and v_verified then return new;
    elsif old.status='published' and new.status='paused' then return new;
    elsif old.status in ('changes_requested','rejected','paused') and new.status='draft' then return new;
    else raise exception 'This listing status transition is not allowed for operators'; end if;
  end if;
  return new;
end;
$$;

create or replace function private.protect_enquiry_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.is_admin(auth.uid()) or current_setting('app.booking_rpc',true)='true' then return new; end if;
  if new is distinct from old then raise exception 'Booking requests must be updated through the secure booking workflow'; end if;
  return new;
end;
$$;

create or replace function private.verify_completed_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if not exists (
    select 1 from public.booking_enquiries e where e.id=new.enquiry_id and e.listing_id=new.listing_id
      and e.traveler_id=auth.uid() and e.status='completed'
  ) then raise exception 'Only a traveler with a completed booking can review this listing'; end if;
  new.traveler_id:=auth.uid();
  select full_name into v_name from public.profiles where id=auth.uid();
  new.display_name:=coalesce(nullif(trim(v_name),''),'Verified traveler');
  new.status:='published';
  return new;
end;
$$;
create trigger reviews_10_verify_completed before insert on public.reviews for each row execute function private.verify_completed_review();
revoke all on function private.verify_completed_review() from public, anon, authenticated;

-- Moderation may change publication status, but nobody (including an admin)
-- can rewrite the score or review content after it has been submitted.
create or replace function private.protect_review_content()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (to_jsonb(new)-'status'-'moderation_note'-'updated_at') is distinct from (to_jsonb(old)-'status'-'moderation_note'-'updated_at') then
    raise exception 'Review scores and content cannot be edited';
  end if;
  return new;
end;
$$;
create trigger reviews_20_protect_content before update on public.reviews for each row execute function private.protect_review_content();
revoke all on function private.protect_review_content() from public, anon, authenticated;

create or replace function public.operator_report_review(p_review_id uuid)
returns public.reviews
language plpgsql security definer set search_path = '' as $$
declare v_review public.reviews;
begin
  select * into v_review from public.reviews where id=p_review_id for update;
  if v_review.id is null then raise exception 'Review not found'; end if;
  if not private.owns_listing(v_review.listing_id,auth.uid()) then raise exception 'Review access denied'; end if;
  if v_review.status<>'published' then raise exception 'Only a published review can be reported'; end if;
  update public.reviews set status='reported' where id=p_review_id returning * into v_review;
  return v_review;
end;
$$;

-- Row-level security -------------------------------------------------------

alter table public.traveler_profiles enable row level security;
alter table public.accommodation_rooms enable row level security;
alter table public.room_images enable row level security;
alter table public.room_availability enable row level security;
alter table public.room_rate_plans enable row level security;
alter table public.listing_policies enable row level security;
alter table public.promotions enable row level security;
alter table public.saved_listings enable row level security;
alter table public.trips enable row level security;
alter table public.trip_items enable row level security;
alter table public.enquiry_messages enable row level security;
alter table public.reviews enable row level security;
alter table public.review_responses enable row level security;

create policy "traveler_profiles_own_or_admin" on public.traveler_profiles for all to authenticated
using ((user_id=auth.uid() and (select private.is_traveler())) or (select private.is_admin())) with check ((user_id=auth.uid() and (select private.is_traveler())) or (select private.is_admin()));

create policy "rooms_public_select" on public.accommodation_rooms for select to anon
using (is_active and (select private.is_public_listing(listing_id)));
create policy "rooms_owner_admin_all" on public.accommodation_rooms for all to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));

create policy "room_images_public_select" on public.room_images for select to anon
using (exists(select 1 from public.accommodation_rooms r where r.id=room_id and r.is_active and (select private.is_public_listing(r.listing_id))));
create policy "room_images_owner_admin_all" on public.room_images for all to authenticated
using ((select private.owns_room(room_id)) or (select private.is_admin()))
with check ((select private.owns_room(room_id)) or (select private.is_admin()));

create policy "room_availability_public_select" on public.room_availability for select to anon
using (available_date>=current_date and not is_blocked and exists(select 1 from public.accommodation_rooms r where r.id=room_id and r.is_active and (select private.is_public_listing(r.listing_id))));
create policy "room_availability_owner_admin_all" on public.room_availability for all to authenticated
using ((select private.owns_room(room_id)) or (select private.is_admin()))
with check ((select private.owns_room(room_id)) or (select private.is_admin()));

create policy "room_rate_plans_public_select" on public.room_rate_plans for select to anon
using (is_active and exists(select 1 from public.accommodation_rooms r where r.id=room_id and r.is_active and (select private.is_public_listing(r.listing_id))));
create policy "room_rate_plans_owner_admin_all" on public.room_rate_plans for all to authenticated
using ((select private.owns_room(room_id)) or (select private.is_admin()))
with check ((select private.owns_room(room_id)) or (select private.is_admin()));

create policy "listing_policies_public_select" on public.listing_policies for select to anon
using ((select private.is_public_listing(listing_id)));
create policy "listing_policies_owner_admin_all" on public.listing_policies for all to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_editable_listing(listing_id)) or (select private.is_admin()));

create policy "promotions_public_select" on public.promotions for select to anon
using (is_active and current_date between valid_from and valid_until and (select private.is_public_listing(listing_id)));
create policy "promotions_owner_admin_all" on public.promotions for all to authenticated
using ((select private.owns_listing(listing_id)) or (select private.is_admin()))
with check ((select private.owns_listing(listing_id)) or (select private.is_admin()));

create policy "enquiries_traveler_select" on public.booking_enquiries for select to authenticated using (traveler_id=auth.uid());

create policy "saved_listings_own_all" on public.saved_listings for all to authenticated
using (user_id=auth.uid() and (select private.is_traveler())) with check (user_id=auth.uid() and (select private.is_traveler()) and (select private.is_public_listing(listing_id)));
create policy "trips_own_all" on public.trips for all to authenticated using (user_id=auth.uid() and (select private.is_traveler())) with check (user_id=auth.uid() and (select private.is_traveler()));
create policy "trip_items_own_all" on public.trip_items for all to authenticated
using ((select private.is_traveler()) and exists(select 1 from public.trips t where t.id=trip_id and t.user_id=auth.uid()))
with check ((select private.is_traveler()) and exists(select 1 from public.trips t where t.id=trip_id and t.user_id=auth.uid()) and (select private.is_public_listing(listing_id)));

create policy "enquiry_messages_participants" on public.enquiry_messages for select to authenticated using ((select private.can_access_enquiry(enquiry_id)));
create policy "enquiry_messages_participant_insert" on public.enquiry_messages for insert to authenticated
with check (sender_id=auth.uid() and (select private.can_access_enquiry(enquiry_id)));

create policy "reviews_public_select" on public.reviews for select to anon using (status='published' and (select private.is_public_listing(listing_id)));
create policy "reviews_participant_select" on public.reviews for select to authenticated
using (traveler_id=auth.uid() or (select private.owns_listing(listing_id)) or (select private.is_admin()) or status='published');
create policy "reviews_traveler_insert" on public.reviews for insert to authenticated with check (traveler_id=auth.uid());
create policy "reviews_admin_update" on public.reviews for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "review_responses_public_select" on public.review_responses for select to anon
using (exists(select 1 from public.reviews r where r.id=review_id and r.status='published' and (select private.is_public_listing(r.listing_id))));
create policy "review_responses_owner_admin_select" on public.review_responses for select to authenticated
using (exists(select 1 from public.reviews r where r.id=review_id and ((select private.owns_listing(r.listing_id)) or (select private.is_admin()))));
create policy "review_responses_owner_insert" on public.review_responses for insert to authenticated
with check (operator_id=auth.uid() and exists(select 1 from public.reviews r where r.id=review_id and (select private.owns_listing(r.listing_id))));
create policy "review_responses_owner_update" on public.review_responses for update to authenticated
using (operator_id=auth.uid() or (select private.is_admin())) with check (operator_id=auth.uid() or (select private.is_admin()));

-- Public read models -------------------------------------------------------

create or replace view public.public_businesses with (security_barrier=true,security_invoker=true) as
select b.id,b.business_name,b.category,b.island,b.description,b.logo_path,
  c.contact->>'email' contact_email,c.contact->>'phone' contact_phone,c.contact->>'website_url' website_url,
  c.contact->>'business_address' business_address,b.updated_at,b.latitude,b.longitude,true as is_verified
from public.businesses b cross join lateral (select private.public_business_contact(b.id) contact) c
where b.status='verified' and b.is_active;

create or replace view public.public_listings with (security_barrier=true,security_invoker=true) as
select l.id,l.business_id,b.business_name,b.logo_path business_logo_path,l.title,l.category,l.island,l.summary,l.description,
  l.price,l.currency,l.price_unit,l.start_time,l.end_time,l.max_capacity,l.available_spaces,l.included_items,l.excluded_items,
  l.meeting_point,l.requirements,l.cancellation_information,l.cover_image_path,l.property_type,l.room_type,l.maximum_guests,
  l.number_of_rooms,l.amenities,l.check_in_time,l.check_out_time,l.price_per_night,
  c.contact->>'email' contact_email,c.contact->>'phone' contact_phone,c.contact->>'website_url' website_url,l.updated_at,
  coalesce(l.latitude,b.latitude) latitude,coalesce(l.longitude,b.longitude) longitude,l.child_price,l.taxes_amount,l.fees_amount,true as is_verified
from public.listings l join public.businesses b on b.id=l.business_id
cross join lateral (select private.public_business_contact(b.id) contact) c
where l.status='published' and l.is_active and b.status='verified' and b.is_active;

create view public.public_accommodation_rooms with (security_barrier=true,security_invoker=true) as
select id,listing_id,name,description,maximum_guests,adult_capacity,child_capacity,bed_configuration,room_size_sqm,view_type,
  quantity,base_price,currency,amenities,sort_order
from public.accommodation_rooms where is_active;

create view public.public_room_images with (security_barrier=true,security_invoker=true) as
select ri.id,ri.room_id,ri.storage_path,ri.caption,ri.sort_order from public.room_images ri
join public.accommodation_rooms r on r.id=ri.room_id where r.is_active;

create view public.public_room_availability with (security_barrier=true,security_invoker=true) as
select id,room_id,available_date,total_quantity,available_quantity,price_override
from public.room_availability where available_date>=current_date and not is_blocked;

create view public.public_room_rate_plans with (security_barrier=true,security_invoker=true) as
select id,room_id,name,nightly_price,meal_plan,free_cancellation,cancellation_deadline_hours,is_refundable,sort_order
from public.room_rate_plans where is_active;

create view public.public_listing_policies with (security_barrier=true,security_invoker=true) as
select * from public.listing_policies;

create view public.public_promotions with (security_barrier=true,security_invoker=true) as
select id,listing_id,name,description,discount_type,discount_value,valid_from,valid_until,minimum_nights
from public.promotions where is_active and current_date between valid_from and valid_until;

create view public.public_reviews with (security_barrier=true,security_invoker=true) as
select r.id,r.listing_id,r.display_name,r.overall_rating,r.cleanliness_rating,r.staff_rating,r.location_rating,r.comfort_rating,
  r.guide_rating,r.organization_rating,r.safety_rating,r.value_rating,r.title,r.body,r.created_at,
  rr.body operator_response,rr.created_at response_created_at
from public.reviews r left join public.review_responses rr on rr.review_id=r.id where r.status='published';

-- Data API grants are explicit for new tables (required independently of RLS).
revoke all on public.traveler_profiles,public.accommodation_rooms,public.room_images,public.room_availability,
  public.room_rate_plans,public.listing_policies,public.promotions,public.saved_listings,public.trips,public.trip_items,
  public.enquiry_messages,public.reviews,public.review_responses from anon,authenticated;

grant select (id,business_name,category,island,description,logo_path,status,is_active,updated_at,latitude,longitude) on public.businesses to anon;
grant select (id,business_id,title,category,island,summary,description,price,currency,price_unit,start_time,end_time,max_capacity,
  available_spaces,included_items,excluded_items,meeting_point,requirements,cancellation_information,cover_image_path,property_type,
  room_type,maximum_guests,number_of_rooms,amenities,check_in_time,check_out_time,price_per_night,status,is_active,updated_at,
  latitude,longitude,child_price,taxes_amount,fees_amount) on public.listings to anon;
grant select on public.accommodation_rooms,public.room_images,public.room_availability,public.room_rate_plans,
  public.listing_policies,public.promotions to anon;
grant select (id,listing_id,display_name,overall_rating,cleanliness_rating,staff_rating,location_rating,comfort_rating,
  guide_rating,organization_rating,safety_rating,value_rating,title,body,status,created_at) on public.reviews to anon;
grant select (review_id,body,created_at) on public.review_responses to anon;
grant select on public.public_businesses,public.public_listings,public.public_availability,public.public_accommodation_rooms,
  public.public_room_images,public.public_room_availability,public.public_room_rate_plans,public.public_listing_policies,
  public.public_promotions,public.public_reviews to anon,authenticated;

grant select,insert,update on public.traveler_profiles to authenticated;
grant update (latitude,longitude) on public.businesses to authenticated;
grant select,insert,update,delete on public.accommodation_rooms,public.room_images,public.room_availability,public.room_rate_plans,
  public.listing_policies,public.promotions to authenticated;
grant select,insert,delete on public.saved_listings to authenticated;
grant select,insert,update,delete on public.trips,public.trip_items to authenticated;
grant select,insert on public.enquiry_messages to authenticated;
grant select,insert,update on public.reviews to authenticated;
grant select,insert,update on public.review_responses to authenticated;
grant select on public.booking_enquiries to authenticated;
revoke insert,update on public.booking_enquiries from anon,authenticated;

revoke all on function public.create_booking_request(uuid,uuid,uuid,uuid,date,date,time,integer,integer,integer,text,text,text,text) from public,anon,authenticated;
revoke all on function public.operator_update_booking(uuid,public.enquiry_status,text) from public,anon,authenticated;
revoke all on function public.traveler_cancel_booking(uuid) from public,anon,authenticated;
revoke all on function public.operator_report_review(uuid) from public,anon,authenticated;
grant execute on function public.create_booking_request(uuid,uuid,uuid,uuid,date,date,time,integer,integer,integer,text,text,text,text) to anon,authenticated;
grant execute on function public.operator_update_booking(uuid,public.enquiry_status,text) to authenticated;
grant execute on function public.traveler_cancel_booking(uuid) to authenticated;
grant execute on function public.operator_report_review(uuid) to authenticated;

-- Room image Storage uses the same owner-folder convention as existing media.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('room-gallery','room-gallery',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "storage_room_insert_own_folder" on storage.objects for insert to authenticated
with check (bucket_id='room-gallery' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "storage_room_update_own_folder" on storage.objects for update to authenticated
using (bucket_id='room-gallery' and ((storage.foldername(name))[1]=auth.uid()::text or (select private.is_admin())))
with check (bucket_id='room-gallery' and ((storage.foldername(name))[1]=auth.uid()::text or (select private.is_admin())));
create policy "storage_room_delete_own_folder" on storage.objects for delete to authenticated
using (bucket_id='room-gallery' and ((storage.foldername(name))[1]=auth.uid()::text or (select private.is_admin())));
create policy "storage_room_read_authorized" on storage.objects for select to anon,authenticated
using (bucket_id='room-gallery' and (
  (storage.foldername(name))[1]=auth.uid()::text or (select private.is_admin()) or exists(
    select 1 from public.room_images ri join public.accommodation_rooms r on r.id=ri.room_id
    where ri.storage_path=name and r.is_active and (select private.is_public_listing(r.listing_id))
  )
));
