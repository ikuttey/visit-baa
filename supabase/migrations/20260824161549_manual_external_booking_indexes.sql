create index if not exists external_accommodation_bookings_listing_idx
  on public.external_accommodation_bookings(listing_id);
create index if not exists external_accommodation_bookings_created_by_idx
  on public.external_accommodation_bookings(created_by);
