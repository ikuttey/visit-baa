-- Enum values are isolated in their own migration/transaction so the next
-- migration can safely use them in constraints and data changes.
alter type public.price_unit add value if not exists 'per_room_per_night';
alter type public.price_unit add value if not exists 'per_property_per_night';
alter type public.price_unit add value if not exists 'per_person_per_night';
alter type public.price_unit add value if not exists 'fixed_stay';
alter type public.price_unit add value if not exists 'price_on_request';
alter type public.price_unit add value if not exists 'per_vehicle';
alter type public.price_unit add value if not exists 'per_leg';
