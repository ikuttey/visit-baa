-- V2 Calendar and Analytics are the only supported operator workflows.
-- The legacy availability-range and currency-unsafe analytics RPCs were used by
-- retired V1 forms and are intentionally removed to prevent stale clients from
-- bypassing the current operator workflows.

drop function if exists public.operator_set_room_availability_range(uuid,date,date,integer,boolean,numeric);
drop function if exists public.operator_listing_analytics(uuid,date,date);
