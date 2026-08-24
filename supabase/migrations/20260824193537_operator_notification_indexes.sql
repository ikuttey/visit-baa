create index if not exists operator_notifications_listing_idx
  on public.operator_notifications(listing_id) where listing_id is not null;
create index if not exists operator_notifications_payment_reference_idx
  on public.operator_notifications(payment_reference_id) where payment_reference_id is not null;
