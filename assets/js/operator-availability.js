import { requireSupabase, showConfigurationNotice } from './supabase-client.js';
import { logout, requireOperator } from './auth.js';
import { clear, createElement, emptyState, formatDate, setBusy, setMessage, statusBadge } from './ui.js';

const state = {
  user: null,
  businesses: [],
  business: null,
  listings: [],
  rooms: [],
  externalBookings: [],
  inventory: []
};

const message = document.getElementById('pageMessage');
const businessSwitcher = document.getElementById('businessSwitcher');
const externalForm = document.getElementById('externalBookingForm');
const rangeForm = document.getElementById('availabilityRangeForm');
const externalListing = document.getElementById('externalListing');
const externalRoom = document.getElementById('externalRoom');
const rangeListing = document.getElementById('rangeListing');
const rangeRoom = document.getElementById('rangeRoom');
const inventoryRoomFilter = document.getElementById('inventoryRoomFilter');

function localDateString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function sourceLabel(source) {
  return ({
    booking_com: 'Booking.com',
    agoda: 'Agoda',
    direct: 'Direct',
    walk_in: 'Walk-in',
    other: 'Other'
  })[source] || source || 'Other';
}

function setFormDisabled(form, disabled) {
  [...form.elements].forEach((element) => { element.disabled = disabled; });
}

function listingName(id) {
  return state.listings.find((item) => item.id === id)?.title || 'Accommodation';
}

function roomRecord(id) {
  return state.rooms.find((item) => item.id === id) || null;
}

function roomLabel(room) {
  if (!room) return 'Room';
  return `${listingName(room.listing_id)} · ${room.name}`;
}

function populateBusinessSwitcher() {
  clear(businessSwitcher);
  if (!state.businesses.length) {
    businessSwitcher.append(new Option('No businesses found', ''));
    businessSwitcher.disabled = true;
    return;
  }
  businessSwitcher.disabled = false;
  state.businesses.forEach((business) => businessSwitcher.append(new Option(
    `${business.business_name} — ${String(business.status || '').replaceAll('_', ' ')}`,
    business.id
  )));
  businessSwitcher.value = state.business?.id || state.businesses[0].id;
}

function fillListingSelect(select, selectedId = '') {
  clear(select);
  if (!state.listings.length) {
    select.append(new Option('No accommodation listings', ''));
    select.disabled = true;
    return;
  }
  select.disabled = false;
  state.listings.forEach((listing) => select.append(new Option(listing.title, listing.id)));
  select.value = state.listings.some((listing) => listing.id === selectedId) ? selectedId : state.listings[0].id;
}

function fillRoomSelect(select, listingId, selectedId = '') {
  clear(select);
  const rooms = state.rooms.filter((room) => room.listing_id === listingId && room.is_active);
  if (!rooms.length) {
    select.append(new Option('No room types configured', ''));
    select.disabled = true;
    return;
  }
  select.disabled = false;
  rooms.forEach((room) => select.append(new Option(`${room.name} — ${room.quantity} total`, room.id)));
  select.value = rooms.some((room) => room.id === selectedId) ? selectedId : rooms[0].id;
}

function refreshRoomControls() {
  const previousExternalRoom = externalRoom.value;
  const previousRangeRoom = rangeRoom.value;
  fillRoomSelect(externalRoom, externalListing.value, previousExternalRoom);
  fillRoomSelect(rangeRoom, rangeListing.value, previousRangeRoom);
  updateRangeQuantity();
}

function updateRangeQuantity() {
  const room = roomRecord(rangeRoom.value);
  const input = document.getElementById('rangeAvailable');
  const help = document.getElementById('rangeQuantityHelp');
  if (!room) {
    input.value = '';
    input.max = '';
    help.textContent = 'Choose a room type first.';
    return;
  }
  input.max = String(room.quantity);
  if (input.value === '' || Number(input.value) > Number(room.quantity)) input.value = String(room.quantity);
  help.textContent = `This room type has ${room.quantity} room${Number(room.quantity) === 1 ? '' : 's'} in total. Existing confirmed reservations are protected automatically.`;
}

function populateSelectors() {
  const extListingId = externalListing.value;
  const rangeListingId = rangeListing.value;
  fillListingSelect(externalListing, extListingId);
  fillListingSelect(rangeListing, rangeListingId);
  refreshRoomControls();

  clear(inventoryRoomFilter);
  inventoryRoomFilter.append(new Option('All room types', ''));
  state.rooms.filter((room) => room.is_active).forEach((room) => inventoryRoomFilter.append(new Option(roomLabel(room), room.id)));

  const disabled = !state.listings.length || !state.rooms.length;
  setFormDisabled(externalForm, disabled);
  setFormDisabled(rangeForm, disabled);
}

async function loadBusinessData() {
  if (!state.business) {
    state.listings = [];
    state.rooms = [];
    state.externalBookings = [];
    state.inventory = [];
    populateSelectors();
    renderExternalBookings();
    renderInventory();
    return;
  }

  setMessage(message, 'Loading accommodation availability…', 'loading');
  const client = requireSupabase();
  const listingsResult = await client
    .from('listings')
    .select('id,business_id,title,category,status,is_active')
    .eq('business_id', state.business.id)
    .eq('category', 'accommodation')
    .order('title');
  if (listingsResult.error) throw listingsResult.error;
  state.listings = listingsResult.data || [];

  if (state.listings.length) {
    const roomsResult = await client
      .from('accommodation_rooms')
      .select('id,listing_id,name,quantity,is_active')
      .in('listing_id', state.listings.map((listing) => listing.id))
      .order('sort_order')
      .order('name');
    if (roomsResult.error) throw roomsResult.error;
    state.rooms = roomsResult.data || [];
  } else {
    state.rooms = [];
  }

  const externalResult = await client
    .from('external_accommodation_bookings')
    .select('*')
    .eq('business_id', state.business.id)
    .order('check_in_date', { ascending: true })
    .order('created_at', { ascending: false });
  if (externalResult.error) throw externalResult.error;
  state.externalBookings = externalResult.data || [];

  if (state.rooms.length) {
    const today = localDateString();
    const inventoryResult = await client
      .from('room_availability')
      .select('id,room_id,available_date,total_quantity,available_quantity,price_override,is_blocked')
      .in('room_id', state.rooms.map((room) => room.id))
      .gte('available_date', today)
      .lte('available_date', addDays(today, 60))
      .order('available_date')
      .limit(1500);
    if (inventoryResult.error) throw inventoryResult.error;
    state.inventory = inventoryResult.data || [];
  } else {
    state.inventory = [];
  }

  populateSelectors();
  renderExternalBookings();
  renderInventory();
  setMessage(message, state.listings.length
    ? ''
    : 'This business does not have an accommodation listing with room types yet. Create the accommodation and room types in the Business dashboard first.', 'warning');
}

function createTable(headers) {
  const table = createElement('table', { className: 'inventory-table' });
  const thead = createElement('thead');
  const row = createElement('tr');
  headers.forEach((header) => row.append(createElement('th', { text: header })));
  thead.append(row);
  const tbody = createElement('tbody');
  table.append(thead, tbody);
  return { wrap: createElement('div', { className: 'inventory-table-wrap', children: [table] }), tbody };
}

function renderExternalBookings() {
  const container = document.getElementById('externalBookingsTable');
  clear(container);
  if (!state.externalBookings.length) {
    container.append(emptyState('No external bookings recorded', 'When Agoda, Booking.com, direct or walk-in bookings are confirmed, add them here immediately.'));
    return;
  }

  const { wrap, tbody } = createTable(['Source', 'Property / room', 'Stay', 'Rooms', 'Reference', 'Status', 'Action']);
  state.externalBookings.forEach((booking) => {
    const room = roomRecord(booking.room_id);
    const source = createElement('span', { className: 'source-chip', text: sourceLabel(booking.source) });
    const actions = createElement('div', { className: 'compact-actions' });
    if (booking.status === 'active') {
      const cancel = createElement('button', { className: 'button small secondary', text: 'Cancel / restore', attrs: { type: 'button' } });
      cancel.addEventListener('click', () => cancelExternalBooking(booking));
      actions.append(cancel);
    }
    tbody.append(createElement('tr', { children: [
      createElement('td', { children: [source] }),
      createElement('td', { text: roomLabel(room) }),
      createElement('td', { text: `${formatDate(`${booking.check_in_date}T00:00:00`)} → ${formatDate(`${booking.check_out_date}T00:00:00`)}` }),
      createElement('td', { text: booking.rooms_booked }),
      createElement('td', { text: booking.external_reference || '—' }),
      createElement('td', { children: [statusBadge(booking.status)] }),
      createElement('td', { children: [actions] })
    ] }));
  });
  container.append(wrap);
}

function renderInventory() {
  const container = document.getElementById('roomInventoryTable');
  clear(container);
  const roomFilter = inventoryRoomFilter.value;
  const rows = state.inventory.filter((item) => !roomFilter || item.room_id === roomFilter);
  if (!rows.length) {
    container.append(emptyState('No upcoming room inventory configured', 'Use “Set room availability in bulk” above to open or block future dates.'));
    return;
  }

  const { wrap, tbody } = createTable(['Date', 'Property / room', 'Available', 'Total', 'Status', 'Price override']);
  rows.forEach((item) => {
    const available = Number(item.available_quantity);
    tbody.append(createElement('tr', { children: [
      createElement('td', { text: formatDate(`${item.available_date}T00:00:00`) }),
      createElement('td', { text: roomLabel(roomRecord(item.room_id)) }),
      createElement('td', { className: available > 0 ? 'inventory-good' : 'inventory-zero', text: available }),
      createElement('td', { text: item.total_quantity }),
      createElement('td', { text: item.is_blocked ? 'Blocked' : (available > 0 ? 'Open' : 'Sold out') }),
      createElement('td', { text: item.price_override == null ? 'Normal price' : String(item.price_override) })
    ] }));
  });
  container.append(wrap);
}

async function saveExternalBooking(event) {
  event.preventDefault();
  const button = externalForm.querySelector('button[type="submit"]');
  const checkIn = document.getElementById('externalCheckIn').value;
  const checkOut = document.getElementById('externalCheckOut').value;
  if (!externalRoom.value) return setMessage(message, 'Choose a room type.', 'error');
  if (!checkIn || !checkOut || checkOut <= checkIn) return setMessage(message, 'Check-out must be after check-in.', 'error');

  try {
    setBusy(button, true, 'Blocking inventory…');
    const { data, error } = await requireSupabase().rpc('create_external_accommodation_booking', {
      p_room_id: externalRoom.value,
      p_source: document.getElementById('externalSource').value,
      p_check_in_date: checkIn,
      p_check_out_date: checkOut,
      p_rooms: Number(document.getElementById('externalRooms').value),
      p_external_reference: document.getElementById('externalReference').value.trim() || null,
      p_guest_name: document.getElementById('externalGuestName').value.trim() || null,
      p_notes: document.getElementById('externalNotes').value.trim() || null
    });
    if (error) throw error;
    document.getElementById('externalReference').value = '';
    document.getElementById('externalGuestName').value = '';
    document.getElementById('externalNotes').value = '';
    setMessage(message, `External booking added. Visit Baa inventory is now reduced for ${data.rooms_booked} room${Number(data.rooms_booked) === 1 ? '' : 's'} from ${data.check_in_date} to ${data.check_out_date}.`, 'success');
    await loadBusinessData();
  } catch (error) {
    setMessage(message, error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

async function saveAvailabilityRange(event) {
  event.preventDefault();
  const button = rangeForm.querySelector('button[type="submit"]');
  const start = document.getElementById('rangeStart').value;
  const end = document.getElementById('rangeEnd').value;
  const blocked = document.getElementById('rangeBlocked').checked;
  if (!rangeRoom.value) return setMessage(message, 'Choose a room type.', 'error');
  if (!start || !end || end < start) return setMessage(message, 'Choose a valid date range.', 'error');

  try {
    setBusy(button, true, 'Saving range…');
    const { data, error } = await requireSupabase().rpc('operator_set_room_availability_range', {
      p_room_id: rangeRoom.value,
      p_start_date: start,
      p_end_date: end,
      p_available_quantity: blocked ? 0 : Number(document.getElementById('rangeAvailable').value),
      p_is_blocked: blocked,
      p_price_override: document.getElementById('rangePrice').value === '' ? null : Number(document.getElementById('rangePrice').value)
    });
    if (error) throw error;
    setMessage(message, `${data} date${Number(data) === 1 ? '' : 's'} updated. Existing confirmed Visit Baa and external reservations were protected.`, 'success');
    await loadBusinessData();
  } catch (error) {
    setMessage(message, error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

async function cancelExternalBooking(booking) {
  const label = `${sourceLabel(booking.source)} ${booking.external_reference || 'booking'}`;
  if (!window.confirm(`Cancel ${label} in Visit Baa and restore its room inventory? Only do this if the external reservation is actually cancelled.`)) return;
  try {
    setMessage(message, 'Restoring room inventory…', 'loading');
    const { error } = await requireSupabase().rpc('cancel_external_accommodation_booking', { p_booking_id: booking.id });
    if (error) throw error;
    await loadBusinessData();
    setMessage(message, 'External booking cancelled in Visit Baa and its room inventory was restored.', 'success');
  } catch (error) {
    setMessage(message, error.message, 'error');
  }
}

function bindEvents() {
  document.getElementById('logoutButton').addEventListener('click', () => logout().catch((error) => setMessage(message, error.message, 'error')));
  businessSwitcher.addEventListener('change', async () => {
    state.business = state.businesses.find((business) => business.id === businessSwitcher.value) || null;
    if (state.business) localStorage.setItem('baa_operator_business_id', state.business.id);
    try { await loadBusinessData(); } catch (error) { setMessage(message, error.message, 'error'); }
  });
  externalListing.addEventListener('change', refreshRoomControls);
  rangeListing.addEventListener('change', refreshRoomControls);
  rangeRoom.addEventListener('change', updateRangeQuantity);
  inventoryRoomFilter.addEventListener('change', renderInventory);
  document.getElementById('rangeBlocked').addEventListener('change', (event) => {
    const quantity = document.getElementById('rangeAvailable');
    quantity.disabled = event.target.checked;
    if (event.target.checked) quantity.value = '0';
    else updateRangeQuantity();
  });
  document.getElementById('refreshButton').addEventListener('click', () => loadBusinessData().catch((error) => setMessage(message, error.message, 'error')));
  externalForm.addEventListener('submit', saveExternalBooking);
  rangeForm.addEventListener('submit', saveAvailabilityRange);
}

function setDefaultDates() {
  const today = localDateString();
  document.getElementById('externalCheckIn').min = today;
  document.getElementById('externalCheckOut').min = addDays(today, 1);
  document.getElementById('externalCheckIn').value = today;
  document.getElementById('externalCheckOut').value = addDays(today, 1);
  document.getElementById('rangeStart').min = today;
  document.getElementById('rangeEnd').min = today;
  document.getElementById('rangeStart').value = today;
  document.getElementById('rangeEnd').value = addDays(today, 30);
  document.getElementById('externalCheckIn').addEventListener('change', (event) => {
    const minimumCheckout = addDays(event.target.value || today, 1);
    document.getElementById('externalCheckOut').min = minimumCheckout;
    if (document.getElementById('externalCheckOut').value <= event.target.value) document.getElementById('externalCheckOut').value = minimumCheckout;
  });
  document.getElementById('rangeStart').addEventListener('change', (event) => {
    document.getElementById('rangeEnd').min = event.target.value || today;
    if (document.getElementById('rangeEnd').value < event.target.value) document.getElementById('rangeEnd').value = event.target.value;
  });
}

async function init() {
  if (showConfigurationNotice(document.getElementById('configMessage'))) return;
  bindEvents();
  setDefaultDates();
  try {
    state.user = await requireOperator();
    const { data, error } = await requireSupabase()
      .from('businesses')
      .select('id,business_name,status,is_active,owner_id')
      .eq('owner_id', state.user.id)
      .order('created_at');
    if (error) throw error;
    state.businesses = data || [];
    const requested = localStorage.getItem('baa_operator_business_id');
    state.business = state.businesses.find((business) => business.id === requested) || state.businesses[0] || null;
    populateBusinessSwitcher();
    await loadBusinessData();
  } catch (error) {
    if (!String(error.message || '').includes('required')) setMessage(message, error.message, 'error');
  }
}

init();
