-- Keep security-invoker public views usable after a visitor signs in.
-- The existing USING predicates remain unchanged; only the eligible API roles
-- are aligned so authenticated travelers see the same published rows as anon.

alter policy "businesses_select_verified_public"
  on public.businesses to anon, authenticated;
alter policy "listings_select_published_public"
  on public.listings to anon, authenticated;
alter policy "availability_select_published_public"
  on public.availability to anon, authenticated;

alter policy "rooms_public_select"
  on public.accommodation_rooms to anon, authenticated;
alter policy "room_images_public_select"
  on public.room_images to anon, authenticated;
alter policy "room_availability_public_select"
  on public.room_availability to anon, authenticated;
alter policy "room_rate_plans_public_select"
  on public.room_rate_plans to anon, authenticated;
alter policy "listing_policies_public_select"
  on public.listing_policies to anon, authenticated;
alter policy "promotions_public_select"
  on public.promotions to anon, authenticated;
alter policy "reviews_public_select"
  on public.reviews to anon, authenticated;
alter policy "review_responses_public_select"
  on public.review_responses to anon, authenticated;

comment on policy "businesses_select_verified_public" on public.businesses is
  'Published business read access for anonymous and authenticated marketplace visitors.';
comment on policy "rooms_public_select" on public.accommodation_rooms is
  'Active rooms are public only when their parent listing remains publicly eligible.';
