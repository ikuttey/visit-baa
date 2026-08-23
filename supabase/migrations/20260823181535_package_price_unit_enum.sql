-- Kept in its own migration because PostgreSQL enum values must be committed
-- before a later migration can safely use them in constraints and functions.
alter type public.price_unit add value if not exists 'per_package';
