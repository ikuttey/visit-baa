import { isSupabaseConfigured, requireSupabase } from './supabase-client.js';

const container = document.getElementById('activities');
const note = document.getElementById('activitiesNote');
const tabs = [...document.querySelectorAll('.date-tab[data-range]')];
const state = { availability: [], listings: new Map(), range: 'today' };

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function activityRow(slot, listing) {
  const link = document.createElement('a');
  link.className = 'activity';
  link.href = `listing.html?id=${encodeURIComponent(listing.id)}`;
  const time = document.createElement('time');
  time.textContent = slot.start_time?.slice(0, 5) || 'All day';
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = listing.title;
  const detail = document.createElement('small');
  detail.textContent = `${listing.island} · ${listing.business_name}`;
  copy.append(title, detail);
  const spaces = document.createElement('span');
  spaces.className = 'spaces';
  spaces.textContent = `${slot.remaining_spaces} space${slot.remaining_spaces === 1 ? '' : 's'}`;
  link.append(time, copy, spaces);
  return link;
}

function renderEmpty(title, detail) {
  container.replaceChildren();
  const row = document.createElement('div');
  row.className = 'activity';
  const time = document.createElement('time'); time.textContent = '—';
  const copy = document.createElement('div');
  const strong = document.createElement('strong'); strong.textContent = title;
  const small = document.createElement('small'); small.textContent = detail;
  copy.append(strong, small); row.append(time, copy); container.append(row);
}

function render() {
  const start = state.range === 'tomorrow' ? localDate(1) : localDate(0);
  const end = state.range === 'week' ? localDate(7) : start;
  const slots = state.availability.filter((slot) => slot.available_date >= start && slot.available_date <= end && state.listings.has(slot.listing_id));
  container.replaceChildren();
  if (!slots.length) {
    renderEmpty('No approved schedules found', 'Try another date or browse all published listings.');
    return;
  }
  slots.slice(0, 6).forEach((slot) => container.append(activityRow(slot, state.listings.get(slot.listing_id))));
}

tabs.forEach((tab) => tab.addEventListener('click', () => {
  state.range = tab.dataset.range;
  tabs.forEach((item) => item.classList.toggle('active', item === tab));
  render();
}));

async function init() {
  if (!isSupabaseConfigured) {
    renderEmpty('Live listings are not connected yet', 'Complete the Supabase setup to show approved schedules here.');
    note.textContent = 'No demonstration availability is shown when Supabase is not configured.';
    return;
  }
  try {
    const client = requireSupabase();
    const { data: availability, error } = await client.from('public_availability').select('*').gte('available_date', localDate(0)).lte('available_date', localDate(7)).order('available_date').order('start_time');
    if (error) throw error;
    state.availability = availability || [];
    const ids = [...new Set(state.availability.map((slot) => slot.listing_id))];
    if (ids.length) {
      const { data: listings, error: listingError } = await client.from('public_listings').select('id,title,island,business_name').in('id', ids);
      if (listingError) throw listingError;
      state.listings = new Map((listings || []).map((listing) => [listing.id, listing]));
    }
    render();
  } catch (error) {
    renderEmpty('Approved schedules could not be loaded', error.message || 'Please try again later.');
  }
}

init();

