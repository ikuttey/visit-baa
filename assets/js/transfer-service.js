import { requirePublicSupabase } from './supabase-client.js';
import { findRoutes, routeDestinations } from './route-planner.js';
import { canonicalLocationName, mergeTransportLocations } from './transport-locations.js';

export function isMissingRouteSchema(error) {
  return ['PGRST205','42P01'].includes(error?.code) || /public_transfer_routes|transfer_route_details/i.test(error?.message || '');
}

async function loadTransportLocationRows(client){let result=await client.from('public_transport_locations').select('id,slug,name,location_type,island_name,aliases,is_permanent,customer_selectable,sort_order').order('sort_order').order('name');if(result.error?.code==='42703')result=await client.from('public_transport_locations').select('id,slug,name,location_type,island_name,aliases,is_permanent').order('name');return result;}

export async function loadTransferNetwork(date = '') {
  const client = requirePublicSupabase();
  const [routeResult,locationResult] = await Promise.all([
    client.from('public_transfer_routes').select('*').order('departure_time'),
    loadTransportLocationRows(client)
  ]);
  const databaseLocations=locationResult.error&&isMissingRouteSchema(locationResult.error)?[]:(locationResult.data||[]);
  if(locationResult.error&&!isMissingRouteSchema(locationResult.error))throw locationResult.error;
  if (routeResult.error) {
    if (isMissingRouteSchema(routeResult.error)) {
      const locations=mergeTransportLocations(databaseLocations);
      return { routes: [], locations, destinations:locations.map((item)=>item.name), schemaPending: true };
    }
    throw routeResult.error;
  }
  const rawRoutes=routeResult.data||[];
  const locations=mergeTransportLocations(databaseLocations,rawRoutes.flatMap((route)=>[
    {id:route.origin_location_id,slug:route.origin_slug,name:route.origin_name,location_type:'route_point'},
    {id:route.destination_location_id,slug:route.destination_slug,name:route.destination_name,location_type:'route_point'}
  ]));
  const routes=rawRoutes.map((route)=>({...route,
    origin_name:canonicalLocationName(route.origin_name,locations),
    destination_name:canonicalLocationName(route.destination_name,locations)
  }));
  if (date && routes.length) {
    const availabilityResult = await client.from('public_availability')
      .select('listing_id,remaining_spaces,start_time,is_blocked')
      .in('listing_id', [...new Set(routes.map((route) => route.listing_id))])
      .eq('available_date', date);
    if (!availabilityResult.error) {
      const spaces = new Map((availabilityResult.data || []).filter((item) => !item.is_blocked).map((item) => [item.listing_id, item.remaining_spaces]));
      routes.forEach((route) => { if (spaces.has(route.listing_id)) route.remaining_spaces = spaces.get(route.listing_id); });
    }
  }
  return { routes, locations, destinations: locations.map((item)=>item.name), routeDestinations:routeDestinations(routes), schemaPending: false };
}

export async function searchTransferRoutes(search) {
  const network = await loadTransferNetwork(search.date);
  return { ...network, options: findRoutes(network.routes, search) };
}
