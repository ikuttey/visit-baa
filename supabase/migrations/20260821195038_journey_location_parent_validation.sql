-- Journey endpoints need a stable parent so local and inter-island travel are
-- classified without treating an accommodation or meeting point as an island.
update public.transport_locations
set island_name=name
where location_type='island' and nullif(trim(island_name),'') is null;

alter table public.transport_locations
  add constraint transport_locations_journey_parent_check check (
    location_type not in ('airport','island')
    or nullif(trim(island_name),'') is not null
  );

comment on constraint transport_locations_journey_parent_check on public.transport_locations is
  'Airports and islands require a parent island/location for local-route classification.';

notify pgrst, 'reload schema';
