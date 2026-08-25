-- V2 Calendar and Analytics are the only supported operator workflows.
-- Retire legacy V1 RPCs so stale clients cannot bypass current workflows.

drop function if exists public.operator_set_room_availability_range(uuid,date,date,integer,boolean,numeric);
drop function if exists public.operator_listing_analytics(uuid,date,date);
