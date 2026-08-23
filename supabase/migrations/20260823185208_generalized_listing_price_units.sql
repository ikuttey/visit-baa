-- Additional operator-selected bases used by the shared listing pricing
-- engine. Kept in an enum-only migration so later constraints can safely use
-- the new labels after this transaction commits.
alter type public.price_unit add value if not exists 'per_infant';
alter type public.price_unit add value if not exists 'per_booking';
alter type public.price_unit add value if not exists 'per_direction';
alter type public.price_unit add value if not exists 'per_day';
alter type public.price_unit add value if not exists 'per_session';
alter type public.price_unit add value if not exists 'per_dive';
alter type public.price_unit add value if not exists 'per_item';
alter type public.price_unit add value if not exists 'per_set';
