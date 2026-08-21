export const ACCOMMODATION_CATEGORY = 'accommodation';

export function positiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function validDate(value = '') {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`));
}

export function nightsBetween(checkin, checkout) {
  if (!validDate(checkin) || !validDate(checkout)) return 0;
  return Math.max(0, Math.round((Date.parse(`${checkout}T12:00:00Z`) - Date.parse(`${checkin}T12:00:00Z`)) / 86400000));
}

export function datesInStay(checkin, checkout) {
  const nights = nightsBetween(checkin, checkout);
  return Array.from({ length: nights }, (_, index) => {
    const date = new Date(`${checkin}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export function availabilityLabel(remaining, requested = 1) {
  const spaces = Number(remaining);
  if (!Number.isFinite(spaces) || spaces < requested) return 'Sold out';
  if (spaces <= Math.max(3, requested)) return 'Limited availability';
  return 'Available';
}

export function quoteSummary(listing, { nights = 0, rooms = 1, guests = 1, unitPrice = null } = {}) {
  const price = Number(unitPrice ?? listing.price_per_night ?? listing.price ?? 0);
  let subtotal = price;
  if (listing.category === ACCOMMODATION_CATEGORY && nights > 0) subtotal = price * nights * rooms;
  else if (['per_person', 'per_adult'].includes(listing.price_unit)) subtotal = price * guests;
  const taxes = Number(listing.taxes_amount || 0);
  const fees = Number(listing.fees_amount || 0);
  return { subtotal, taxes, fees, total: subtotal + taxes + fees };
}

export function distanceKilometres(lat1, lon1, lat2, lon2) {
  const values = [lat1, lon1, lat2, lon2].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  const [aLat, aLon, bLat, bLon] = values.map((value) => value * Math.PI / 180);
  const deltaLat = bLat - aLat;
  const deltaLon = bLon - aLon;
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(aLat) * Math.cos(bLat) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
