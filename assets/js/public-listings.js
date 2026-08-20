import { requirePublicSupabase, showConfigurationNotice } from './supabase-client.js';
import { clear, createElement, emptyState, formatMoney, setMessage, statusLabel } from './ui.js';
import { renderPublicListingMedia } from './public-media.js';

const state = { listings: [] };
const grid = document.getElementById('listingGrid');
const message = document.getElementById('listingsMessage');
const islandFilter = document.getElementById('islandFilter');
const categoryFilter = document.getElementById('categoryFilter');

async function init() {
  if (showConfigurationNotice(document.getElementById('configMessage'))) {
    grid.append(emptyState('Listings will appear after setup', 'Connect Supabase and approve the first operator listing.'));
    return;
  }
  const params = new URLSearchParams(window.location.search);
  islandFilter.value = params.get('island') || '';
  categoryFilter.value = params.get('category') || '';
  islandFilter.addEventListener('change', render);
  categoryFilter.addEventListener('change', render);
  document.getElementById('clearFilters').addEventListener('click', () => { islandFilter.value = ''; categoryFilter.value = ''; render(); });
  try {
    setMessage(message, 'Loading approved listings…', 'loading');
    const { data, error } = await requirePublicSupabase().from('public_listings').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    state.listings = data || [];
    await render(); setMessage(message);
  } catch (error) {
    setMessage(message, error.message, 'error');
  }
}

async function render() {
  clear(grid);
  const filtered = state.listings.filter((listing) => (!islandFilter.value || listing.island === islandFilter.value) && (!categoryFilter.value || listing.category === categoryFilter.value));
  if (!filtered.length) return grid.append(emptyState('No approved listings found', 'Try another island or category. New listings appear only after administrator approval.'));
  for (const listing of filtered) {
    const media = createElement('div', { className: 'listing-card-media' });
    await renderPublicListingMedia(media, listing);
    const link = createElement('a', { className: 'button secondary', text: 'View details →', attrs: { href: `listing.html?id=${encodeURIComponent(listing.id)}` } });
    const businessLink = createElement('a', { className: 'business-link', text: listing.business_name, attrs: { href: `business.html?id=${encodeURIComponent(listing.business_id)}` } });
    grid.append(createElement('article', { className: 'listing-card', children: [media, createElement('div', { className: 'listing-card-body', children: [
      createElement('span', { className: 'eyebrow', text: statusLabel(listing.category) }), createElement('h3', { text: listing.title }),
      createElement('div', { className: 'listing-meta', children: [createElement('span', { text: listing.island }), businessLink] }),
      createElement('p', { text: listing.summary }), createElement('div', { className: 'price', text: `${formatMoney(listing.price, listing.currency)} ${statusLabel(listing.price_unit)}` }),
      createElement('div', { className: 'form-actions', children: [link] })
    ] })] }));
  }
}

init();
