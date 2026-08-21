-- Marketplace enum additions are isolated because PostgreSQL requires newly
-- added enum values to be committed before later migrations can use them.

alter type public.app_role add value if not exists 'traveler';

alter type public.enquiry_status add value if not exists 'confirmed';
alter type public.enquiry_status add value if not exists 'changes_requested';
alter type public.enquiry_status add value if not exists 'no_show';

alter type public.price_unit add value if not exists 'per_adult';
alter type public.price_unit add value if not exists 'per_child';
alter type public.price_unit add value if not exists 'per_group';
alter type public.price_unit add value if not exists 'per_boat';
alter type public.price_unit add value if not exists 'per_session';
alter type public.price_unit add value if not exists 'per_transfer';
