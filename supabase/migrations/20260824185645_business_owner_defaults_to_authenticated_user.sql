-- Business registration is performed by an authenticated operator through the
-- browser client. The dashboard intentionally leaves ownership enforcement to
-- the database, so default owner_id to the authenticated user's UUID.
--
-- RLS still requires owner_id = auth.uid(), so callers cannot assign a new
-- business to another account by supplying a different owner_id.
alter table public.businesses
  alter column owner_id set default auth.uid();
