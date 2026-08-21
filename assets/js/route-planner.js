import { canonicalLocationName, normalizeLocationKey } from './transport-locations.js';

const MIN_CONNECTION_MINUTES = 45;

export function normalizePlace(value = '') {
  return normalizeLocationKey(canonicalLocationName(value));
}

export function timeToMinutes(value = '') {
  const match = String(value).match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToTime(value) {
  const minutes = Math.max(0, Math.min(1439, Number(value) || 0));
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function routeOperatesOn(route, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return false;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return Array.isArray(route.operating_days) && route.operating_days.map(Number).includes(day);
}

export function routePrice(route, travelers = {}) {
  const adults = Math.max(1, Number(travelers.adults) || 1);
  const children = Math.max(0, Number(travelers.children) || 0);
  const infants = Math.max(0, Number(travelers.infants) || 0);
  if (route.pricing_model === 'private_fixed') {
    const amount = Number(route.private_price);
    return Number.isFinite(amount) ? amount : null;
  }
  const adultPrice = Number(route.adult_price);
  if (!Number.isFinite(adultPrice)) return null;
  const childPrice = route.child_price == null ? adultPrice : Number(route.child_price);
  const infantPrice = route.infant_price == null ? 0 : Number(route.infant_price);
  if (![childPrice, infantPrice].every(Number.isFinite)) return null;
  return adultPrice * adults + childPrice * children + infantPrice * infants;
}

export function routeDestinations(routes = []) {
  const names = new Map();
  routes.forEach((route) => [route.origin_name, route.destination_name].forEach((name) => {
    if (name?.trim()) {
      const canonical=canonicalLocationName(name);
      names.set(normalizePlace(canonical), canonical);
    }
  }));
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

function preparedLeg(route, date, travelers) {
  if (!routeOperatesOn(route, date)) return null;
  const passengers = Math.max(1, Number(travelers.adults || 1) + Number(travelers.children || 0) + Number(travelers.infants || 0));
  const capacity = Number(route.remaining_spaces ?? route.available_passengers);
  if (Number.isFinite(capacity) && capacity < passengers) return null;
  if (passengers < Number(route.minimum_passengers || 1)) return null;
  const departure = timeToMinutes(route.departure_time);
  if (departure == null) return null;
  let arrival = timeToMinutes(route.arrival_time);
  if (arrival == null) arrival = departure + Number(route.estimated_duration_minutes || 0);
  if (arrival <= departure || arrival >= 1440) return null;
  const price = routePrice(route, travelers);
  if (price == null) return null;
  return { ...route, departure_minutes: departure, arrival_minutes: arrival, calculated_price: price };
}

export function findRoutes(routes, { from, to, date, adults = 1, children = 0, infants = 0, maxLegs = 3 } = {}) {
  const origin = normalizePlace(from);
  const destination = normalizePlace(to);
  if (!origin || !destination || origin === destination) return [];
  const travelers = { adults, children, infants };
  const legs = routes.map((route) => preparedLeg(route, date, travelers)).filter(Boolean);
  const results = [];

  function visit(place, path, visited) {
    if (path.length >= Math.min(3, Math.max(1, maxLegs))) return;
    legs.filter((leg) => normalizePlace(leg.origin_name) === place).forEach((leg) => {
      const next = normalizePlace(leg.destination_name);
      if (visited.has(next)) return;
      const previous = path.at(-1);
      if (previous && leg.departure_minutes < previous.arrival_minutes + MIN_CONNECTION_MINUTES) return;
      const nextPath = [...path, leg];
      if (next === destination) {
        const totalPrice = nextPath.reduce((sum, item) => sum + item.calculated_price, 0);
        results.push({
          legs: nextPath,
          total_price: totalPrice,
          currency: nextPath[0].currency,
          departure_minutes: nextPath[0].departure_minutes,
          arrival_minutes: nextPath.at(-1).arrival_minutes,
          duration_minutes: nextPath.at(-1).arrival_minutes - nextPath[0].departure_minutes
        });
      } else visit(next, nextPath, new Set([...visited, next]));
    });
  }

  visit(origin, [], new Set([origin]));
  return results
    .filter((option) => option.legs.every((leg) => leg.currency === option.currency))
    .sort((a, b) => a.legs.length - b.legs.length || a.duration_minutes - b.duration_minutes || a.total_price - b.total_price);
}
