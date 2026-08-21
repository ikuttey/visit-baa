import { requirePublicSupabase, showConfigurationNotice } from './supabase-client.js';
import { clear, createElement, emptyState, formatMoney, setMessage, statusLabel } from './ui.js';
import { renderPublicListingMedia } from './public-media.js';
import { POPULAR_FACILITIES } from './facilities-config.js';
import { facilityQueryAliases } from './facilities-ui.js';
import { availabilityLabel, nightsBetween, nonNegativeInteger, positiveInteger, quoteSummary, validDate } from './marketplace.js';
import { priceUnitLabel } from './pricing.js';

const PAGE_SIZE = 12;
const state = { listings: [], total: 0, page: 0, map: null, rooms: [], inventory: [], availability: [], eligibility: null, querySequence: 0 };
const grid = document.getElementById('listingGrid');
const message = document.getElementById('listingsMessage');
const summary = document.getElementById('resultsSummary');
const listingPriceLabel=(listing)=>listing.price==null||listing.price_unit==='price_on_request'?'Price on request':`${formatMoney(listing.price,listing.currency)} ${priceUnitLabel(listing.price_unit).toLowerCase()}`;
const islandFilter = document.getElementById('islandFilter');
const categoryFilter = document.getElementById('categoryFilter');
const sortFilter = document.getElementById('sortFilter');
const advanced = document.getElementById('advancedFilters');
const mapContainer = document.getElementById('listingMap');
const today = new Date().toISOString().slice(0, 10);

function control(id) { return document.getElementById(id); }
function selectedFacilities() { return [...document.querySelectorAll('#facilityFilters input:checked')].map((input) => input.value); }
function optionalModelMissing(error) { return ['42P01','42703','PGRST205'].includes(error?.code); }
function postgresArrayValue(value) { return `{"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"}`; }

function currentSearch() {
  return {
    island: islandFilter.value, category: categoryFilter.value, sort: sortFilter.value,
    checkin: control('checkinFilter').value, checkout: control('checkoutFilter').value, date: control('dateFilter').value,
    adults: positiveInteger(control('adultsFilter').value), children: nonNegativeInteger(control('childrenFilter').value),
    rooms: positiveInteger(control('roomsFilter').value), minPrice: control('minPriceFilter').value,
    maxPrice: control('maxPriceFilter').value, facilities: selectedFacilities()
  };
}

function updateUrl(search) {
  const params = new URLSearchParams();
  for (const key of ['island','category','sort','checkin','checkout','date','minPrice','maxPrice']) if (search[key]) params.set(key, search[key]);
  params.set('adults', String(search.adults));
  if (search.children) params.set('children', String(search.children));
  if (search.rooms !== 1) params.set('rooms', String(search.rooms));
  if (search.facilities.length) params.set('facilities', search.facilities.join('|'));
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
}

function renderFacilityFilters(selected = []) {
  const container = control('facilityFilters'); clear(container);
  const options = POPULAR_FACILITIES[categoryFilter.value] || [];
  if (!options.length) return container.append(createElement('span', { className: 'help', text: 'Choose a category to see relevant facility filters.' }));
  options.slice(0, 10).forEach((facility) => {
    const input = createElement('input', { attrs: { type: 'checkbox', value: facility } });
    input.checked = selected.includes(facility);
    container.append(createElement('label', { className: 'facility-option compact', children: [input, createElement('span', { text: facility })] }));
  });
}

function toggleCategoryFields() {
  const accommodation = categoryFilter.value === 'accommodation';
  const transfer = categoryFilter.value === 'transfer';
  document.querySelectorAll('.accommodation-search-field').forEach((field) => { field.hidden = !accommodation; });
  document.querySelectorAll('.activity-search-field').forEach((field) => { field.hidden = accommodation; });
  control('childrenFilter').closest('.field').hidden = !accommodation;
  document.querySelector('label[for="adultsFilter"]').textContent = accommodation ? 'Adults' : (transfer ? 'Passengers' : 'Guests');
  document.querySelector('label[for="dateFilter"]').textContent = transfer ? 'Travel date' : 'Activity date';
  if (!accommodation) { control('childrenFilter').value = '0'; control('roomsFilter').value = '1'; }
}

function hydrateFromUrl() {
  const params = new URLSearchParams(location.search);
  islandFilter.value = params.get('island') || '';
  categoryFilter.value = params.get('category') || '';
  sortFilter.value = params.get('sort') || 'recommended';
  control('checkinFilter').value = params.get('checkin') || '';
  control('checkoutFilter').value = params.get('checkout') || '';
  control('dateFilter').value = params.get('date') || '';
  control('adultsFilter').value = params.get('adults') || params.get('guests') || '1';
  control('childrenFilter').value = params.get('children') || '0';
  control('roomsFilter').value = params.get('rooms') || '1';
  control('minPriceFilter').value = params.get('minPrice') || '';
  control('maxPriceFilter').value = params.get('maxPrice') || '';
  ['checkinFilter','checkoutFilter','dateFilter'].forEach((id) => { control(id).min = today; });
  renderFacilityFilters((params.get('facilities') || '').split('|').filter(Boolean));
  toggleCategoryFields();
}

async function eligibleListingIds(search) {
  state.rooms = []; state.inventory = []; state.eligibility = null;
  const client = requirePublicSupabase();
  if (search.category === 'accommodation' && validDate(search.checkin) && validDate(search.checkout)) {
    const nights = nightsBetween(search.checkin, search.checkout);
    if (!nights) return [];
    const adultsPerRoom = Math.ceil(search.adults / search.rooms);
    const childrenPerRoom = Math.ceil(search.children / search.rooms);
    const { data: rooms, error: roomError } = await client.from('public_accommodation_rooms').select('*')
      .gte('adult_capacity', adultsPerRoom).gte('child_capacity', childrenPerRoom).gte('maximum_guests', adultsPerRoom + childrenPerRoom);
    if (roomError && !optionalModelMissing(roomError)) throw roomError;
    state.rooms = rooms || [];
    if (state.rooms.length) {
      const { data: inventory, error: inventoryError } = await client.from('public_room_availability').select('*')
        .in('room_id', state.rooms.map((room) => room.id)).gte('available_date', search.checkin).lt('available_date', search.checkout)
        .gte('available_quantity', search.rooms);
      if (inventoryError && !optionalModelMissing(inventoryError)) throw inventoryError;
      state.inventory = inventory || [];
    }
    const days = new Map();
    state.inventory.forEach((item) => {
      if (!days.has(item.room_id)) days.set(item.room_id, new Set());
      days.get(item.room_id).add(item.available_date);
    });
    const eligibleRooms = new Set([...days].filter(([, dates]) => dates.size === nights).map(([roomId]) => roomId));
    state.rooms = state.rooms.filter((room) => eligibleRooms.has(room.id));
    const ids = new Set(state.rooms.map((room) => room.listing_id));
    const legacyResult = await client.from('public_availability').select('listing_id,available_date').gte('available_date', search.checkin).lt('available_date', search.checkout)
      .is('start_time', null).gte('remaining_spaces', search.rooms);
    if (legacyResult.error) throw legacyResult.error;
    const legacyDays = new Map();
    (legacyResult.data || []).forEach((item) => { if (!legacyDays.has(item.listing_id)) legacyDays.set(item.listing_id, new Set()); legacyDays.get(item.listing_id).add(item.available_date); });
    for (const [listingId, dates] of legacyDays) if (dates.size === nights) ids.add(listingId);
    const eligibleIds = [...ids]; state.eligibility = new Set(eligibleIds); return eligibleIds;
  }
  if (search.category !== 'accommodation' && validDate(search.date)) {
    const guests = search.adults + search.children;
    const { data, error } = await client.from('public_availability').select('listing_id,remaining_spaces,start_time')
      .eq('available_date', search.date);
    if (error) throw error;
    const ids = new Set((data || []).filter((slot) => Number(slot.remaining_spaces) >= (search.category ? guests : (slot.start_time ? guests : search.rooms))).map((slot) => slot.listing_id));
    if (!search.category) {
      const adultsPerRoom = Math.ceil(search.adults / search.rooms);
      const childrenPerRoom = Math.ceil(search.children / search.rooms);
      const roomResult = await client.from('public_accommodation_rooms').select('*')
        .gte('adult_capacity', adultsPerRoom).gte('child_capacity', childrenPerRoom).gte('maximum_guests', adultsPerRoom + childrenPerRoom);
      if (roomResult.error && !optionalModelMissing(roomResult.error)) throw roomResult.error;
      state.rooms = roomResult.data || [];
      if (state.rooms.length) {
        const inventoryResult = await client.from('public_room_availability').select('*').in('room_id', state.rooms.map((room) => room.id))
          .eq('available_date', search.date).gte('available_quantity', search.rooms);
        if (inventoryResult.error && !optionalModelMissing(inventoryResult.error)) throw inventoryResult.error;
        state.inventory = inventoryResult.data || [];
        const availableRooms = new Set(state.inventory.map((item) => item.room_id));
        state.rooms.filter((room) => availableRooms.has(room.id)).forEach((room) => ids.add(room.listing_id));
      }
    }
    const eligibleIds = [...ids]; state.eligibility = new Set(eligibleIds); return eligibleIds;
  }
  return null;
}

function buildListingQuery(search, eligibleIds) {
  let query = requirePublicSupabase().from('public_listings').select('*', { count: 'exact' });
  if (search.island) query = query.eq('island', search.island);
  if (search.category) query = query.eq('category', search.category);
  if (search.category === 'accommodation' && (validDate(search.checkin) || validDate(search.date))) query = query.gte('maximum_guests', Math.ceil((search.adults + search.children) / search.rooms));
  if (search.minPrice !== '') query = query.gte('price', Number(search.minPrice));
  if (search.maxPrice !== '') query = query.lte('price', Number(search.maxPrice));
  search.facilities.forEach((facility) => {
    const alternatives = facilityQueryAliases(facility).map((alias) => `amenities.cs.${postgresArrayValue(alias)}`);
    query = query.or(alternatives.join(','));
  });
  if (eligibleIds) query = query.in('id', eligibleIds);
  if (search.sort === 'price_asc') query = query.order('price', { ascending: true });
  else if (search.sort === 'price_desc') query = query.order('price', { ascending: false });
  else query = query.order('updated_at', { ascending: false });
  return query.range(state.page * PAGE_SIZE, state.page * PAGE_SIZE + PAGE_SIZE - 1);
}

async function loadResults({ append = false } = {}) {
  const search = currentSearch();
  const sequence = ++state.querySequence;
  if ((search.checkin && !search.checkout) || (!search.checkin && search.checkout)) return setMessage(message, 'Choose both check-in and check-out.', 'error');
  if (validDate(search.checkin) && validDate(search.checkout) && nightsBetween(search.checkin, search.checkout) < 1) return setMessage(message, 'Check-out must be after check-in.', 'error');
  if (search.minPrice !== '' && search.maxPrice !== '' && Number(search.minPrice) > Number(search.maxPrice)) return setMessage(message, 'Minimum price cannot be higher than maximum price.', 'error');
  if (!append) { state.page = 0; state.listings = []; }
  updateUrl(search); setMessage(message, append ? 'Loading more listings…' : 'Searching approved listings…', 'loading');
  try {
    const eligibleIds = await eligibleListingIds(search);
    if (sequence !== state.querySequence) return;
    if (Array.isArray(eligibleIds) && !eligibleIds.length) { state.total = 0; state.listings = []; await render(); setMessage(message); return; }
    const { data, error, count } = await buildListingQuery(search, eligibleIds);
    if (error) throw error;
    if (sequence !== state.querySequence) return;
    state.total = count || 0;
    state.listings = append ? [...state.listings, ...(data || [])] : (data || []);
    await loadAvailabilityMeta(search); if (sequence !== state.querySequence) return; await render(); setMessage(message);
  } catch (error) { setMessage(message, error.message, 'error'); }
}

async function loadAvailabilityMeta(search) {
  state.availability = [];
  const ids = state.listings.filter((listing) => listing.category !== 'accommodation').map((listing) => listing.id);
  if (!ids.length) return;
  let query = requirePublicSupabase().from('public_availability').select('*').in('listing_id', ids);
  query = validDate(search.date) ? query.eq('available_date', search.date) : query.gte('available_date', today).limit(200);
  const { data, error } = await query.order('available_date').order('start_time');
  if (error) throw error;
  state.availability = data || [];
}

function listingSearchLink(listing) {
  const params = new URLSearchParams(location.search); params.set('id', listing.id); return `listing.html?${params}`;
}

function availabilityText(listing, search) {
  if (listing.category === 'accommodation' && validDate(search.checkin) && validDate(search.checkout)) {
    const rooms = state.rooms.filter((room) => room.listing_id === listing.id);
    if (!rooms.length) return state.eligibility?.has(listing.id) ? 'Available' : 'No rooms available';
    const remaining = Math.max(...rooms.map((room) => Math.min(...state.inventory.filter((item) => item.room_id === room.id).map((item) => item.available_quantity))));
    return availabilityLabel(remaining, search.rooms);
  }
  const slots = state.availability.filter((slot) => slot.listing_id === listing.id);
  if (!slots.length) return validDate(search.date) ? 'No availability' : 'Availability on request';
  return availabilityLabel(Math.max(...slots.map((slot) => slot.remaining_spaces)), search.adults + search.children);
}

function totalText(listing, search) {
  if (listing.category !== 'accommodation' || !validDate(search.checkin) || !validDate(search.checkout)) return '';
  const nights = nightsBetween(search.checkin, search.checkout);
  const rooms = state.rooms.filter((room) => room.listing_id === listing.id);
  const unitPrice = rooms.length ? Math.min(...rooms.map((room) => Number(room.base_price))) : null;
  const quote = quoteSummary(listing, { nights, rooms: search.rooms, guests: search.adults + search.children, unitPrice });
  return `${nights} night${nights === 1 ? '' : 's'} · ${formatMoney(quote.total, rooms[0]?.currency || listing.currency)} total`;
}

async function render() {
  clear(grid); const search = currentSearch();
  summary.textContent = state.total ? `${state.total} approved listing${state.total === 1 ? '' : 's'} found` : '';
  control('loadMoreListings').hidden = state.listings.length >= state.total;
  if (!state.listings.length) {
    grid.append(emptyState(state.eligibility ? 'No availability for these dates' : 'No approved listings found', state.eligibility ? 'Try different dates, traveler numbers, or another category.' : 'Try another island, category, price, or facility filter.'));
    renderMap(); return;
  }
  for (const listing of state.listings) {
    const media = createElement('div', { className: 'listing-card-media' }); await renderPublicListingMedia(media, listing);
    const link = createElement('a', { className: 'button secondary', text: 'View details →', attrs: { href: listingSearchLink(listing) } });
    const businessLink = createElement('a', { className: 'business-link', text: listing.business_name, attrs: { href: `business.html?id=${encodeURIComponent(listing.business_id)}` } });
    const total = totalText(listing, search);
    grid.append(createElement('article', { className: 'listing-card', children: [media, createElement('div', { className: 'listing-card-body', children: [
      createElement('span', { className: 'eyebrow', text: statusLabel(listing.category) }), createElement('h3', { text: listing.title }),
      createElement('div', { className: 'listing-meta', children: [createElement('span', { text: listing.island }), businessLink, listing.is_verified ? createElement('span', { className: 'verified-label', text: '✓ Verified by Visit Baa' }) : null] }),
      createElement('p', { text: listing.summary }), createElement('div', { className: 'availability-status', text: availabilityText(listing, search) }),
      createElement('div', { className: 'price', text: listingPriceLabel(listing) }),
      total ? createElement('small', { className: 'calculated-total', text: total }) : null,
      createElement('div', { className: 'form-actions', children: [link] })
    ] })] }));
  }
  renderMap();
}

function renderMap() {
  if (mapContainer.hidden) return;
  if (!window.L) {
    mapContainer.replaceChildren(emptyState('Map could not load', 'The listing view still works. Check your connection and try again.'));
    return;
  }
  const located = state.listings.filter((listing) => Number.isFinite(Number(listing.latitude)) && Number.isFinite(Number(listing.longitude)));
  if (!located.length) {
    if (state.map) { state.map.remove(); state.map = null; }
    mapContainer.replaceChildren(emptyState('No mapped locations', 'Verified operators can add coordinates from their business profile.')); return;
  }
  if (state.map) state.map.remove();
  mapContainer.replaceChildren();
  state.map = window.L.map(mapContainer).setView([Number(located[0].latitude), Number(located[0].longitude)], 11);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18 }).addTo(state.map);
  const bounds = [];
  located.forEach((listing) => {
    const point = [Number(listing.latitude), Number(listing.longitude)]; bounds.push(point);
    const popup = document.createElement('div');
    popup.append(createElement('strong', { text: listing.title }), document.createElement('br'), createElement('a', { text: 'View listing', attrs: { href: listingSearchLink(listing) } }));
    window.L.marker(point).addTo(state.map).bindPopup(popup);
  });
  if (bounds.length > 1) state.map.fitBounds(bounds, { padding: [24, 24] });
}

function bindEvents() {
  categoryFilter.addEventListener('change', () => { renderFacilityFilters(); toggleCategoryFields(); loadResults(); });
  control('toggleFilters').addEventListener('click', () => { advanced.hidden = !advanced.hidden; control('toggleFilters').setAttribute('aria-expanded', String(!advanced.hidden)); });
  control('toggleMap').addEventListener('click', () => {
    mapContainer.hidden = !mapContainer.hidden; control('toggleMap').setAttribute('aria-expanded', String(!mapContainer.hidden));
    control('toggleMap').textContent = mapContainer.hidden ? 'Show map' : 'Hide map'; renderMap();
  });
  control('applyFilters').addEventListener('click', () => loadResults());
  advanced.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.matches('input,select')) { event.preventDefault(); loadResults(); } });
  islandFilter.addEventListener('change', () => loadResults());
  sortFilter.addEventListener('change', () => loadResults());
  control('clearFilters').addEventListener('click', () => {
    [islandFilter, categoryFilter].forEach((input) => { input.value = ''; }); sortFilter.value = 'recommended';
    advanced.querySelectorAll('input').forEach((input) => {
      if (['minPriceFilter','maxPriceFilter'].includes(input.id)) input.value = '';
      else input.value = input.type === 'number' ? (input.id === 'childrenFilter' ? '0' : '1') : '';
    });
    renderFacilityFilters(); toggleCategoryFields(); loadResults();
  });
  control('loadMoreListings').addEventListener('click', () => { state.page += 1; loadResults({ append: true }); });
}

async function init() {
  hydrateFromUrl(); bindEvents();
  if (showConfigurationNotice(control('configMessage'))) return grid.append(emptyState('Listings will appear after setup', 'Connect Supabase and approve the first operator listing.'));
  await loadResults();
}

init();
