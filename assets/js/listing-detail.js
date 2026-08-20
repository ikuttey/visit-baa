import { requirePublicSupabase, requireSupabase, showConfigurationNotice } from './supabase-client.js';
import { signedPublicImageUrl } from './storage.js';
import { clear, createElement, displayList, emptyState, formatDate, formatMoney, setBusy, setMessage, statusLabel } from './ui.js';
import { renderPublicListingMedia } from './public-media.js';

const state = { listing: null, availability: [], gallery: [] };
const container = document.getElementById('listingDetail');
const message = document.getElementById('detailMessage');
const dialog = document.getElementById('enquiryDialog');
const form = document.getElementById('enquiryForm');

document.getElementById('closeEnquiry').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

async function init() {
  if (showConfigurationNotice(document.getElementById('configMessage'))) return container.append(emptyState('Listing data is not connected', 'Configure Supabase to load approved public listings.'));
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) return container.append(emptyState('No listing selected', 'Return to the listings page and choose a service.'));
  try {
    setMessage(message, 'Loading listing…', 'loading');
    const client = requirePublicSupabase();
    const [listingResult, availabilityResult, galleryResult] = await Promise.all([
      client.from('public_listings').select('*').eq('id', id).maybeSingle(),
      client.from('public_availability').select('*').eq('listing_id', id).order('available_date').order('start_time'),
      client.from('listing_images').select('id, storage_path, caption, sort_order').eq('listing_id', id).order('sort_order')
    ]);
    if (listingResult.error) throw listingResult.error;
    if (availabilityResult.error) throw availabilityResult.error;
    if (galleryResult.error) throw galleryResult.error;
    if (!listingResult.data) return container.append(emptyState('Listing unavailable', 'This listing may be awaiting approval, paused, or removed.'));
    state.listing = listingResult.data; state.availability = availabilityResult.data || []; state.gallery = galleryResult.data || [];
    await render(); populateAvailability(); setMessage(message);
  } catch (error) { setMessage(message, error.message, 'error'); }
}

function definition(label, text) { return createElement('div', { className: 'definition', children: [createElement('small', { text: label }), createElement('strong', { text: text || '—' })] }); }

async function render() {
  clear(container); const listing = state.listing;
  const hero = createElement('div', { className: 'detail-hero' });
  await renderPublicListingMedia(hero, listing, { loading: 'eager' });
  const enquire = createElement('button', { className: 'button aqua', text: 'Send booking enquiry', attrs: { type: 'button' } }); enquire.addEventListener('click', () => dialog.showModal());
  const contact = createElement('div', { className: 'form-actions' });
  if (listing.contact_email) contact.append(createElement('a', { className: 'button secondary', text: 'Email operator', attrs: { href: `mailto:${listing.contact_email}` } }));
  if (listing.contact_phone) contact.append(createElement('a', { className: 'button secondary', text: 'Call operator', attrs: { href: `tel:${listing.contact_phone.replace(/[^+\d]/g, '')}` } }));
  const businessLink = createElement('a', { className: 'business-heading-link', text: listing.business_name, attrs: { href: `business.html?id=${encodeURIComponent(listing.business_id)}` } });
  const definitions = [definition('Island', listing.island), definition('Category', statusLabel(listing.category)), definition('Price', `${formatMoney(listing.price, listing.currency)} ${statusLabel(listing.price_unit)}`), definition('Capacity', `${listing.available_spaces} of ${listing.max_capacity} spaces`), definition('Schedule', listing.start_time ? `${listing.start_time} – ${listing.end_time || 'Flexible'}` : 'Flexible'), definition('Meeting point', listing.meeting_point), definition('Included', displayList(listing.included_items)), definition('Excluded', displayList(listing.excluded_items)), definition('Requirements', listing.requirements), definition('Cancellation', listing.cancellation_information)];
  if (listing.category === 'accommodation') definitions.push(definition('Property / room', `${listing.property_type} · ${listing.room_type}`), definition('Rooms / guests', `${listing.number_of_rooms} rooms · up to ${listing.maximum_guests} guests`), definition('Amenities', displayList(listing.amenities)), definition('Check-in / out', `${listing.check_in_time || '—'} / ${listing.check_out_time || '—'}`));
  const gallery = createElement('section', { className: 'detail-gallery' });
  if (state.gallery.length) {
    const previews = createElement('div', { className: 'preview-grid' });
    const images = await Promise.all(state.gallery.map(async (item) => ({ item, url: await signedPublicImageUrl('listing-gallery', item.storage_path) })));
    images.filter(({ url }) => url).forEach(({ item, url }) => {
      const figure = createElement('figure', { className: 'preview captioned' });
      const image = createElement('img', { attrs: { src: url, alt: item.caption || `${listing.title} gallery photo`, loading: 'lazy' } });
      image.addEventListener('error', () => figure.remove(), { once: true });
      figure.append(image);
      if (item.caption) figure.append(createElement('figcaption', { text: item.caption }));
      previews.append(figure);
    });
    if (previews.childElementCount) gallery.append(createElement('h2', { text: 'Photo gallery' }), previews);
  }
  const schedules = createElement('div', { className: 'availability-list' });
  state.availability.forEach((slot) => schedules.append(createElement('div', { className: 'availability-item', children: [
    createElement('strong', { text: formatDate(`${slot.available_date}T00:00:00`) }),
    createElement('span', { text: `${slot.start_time || 'All day'}${slot.end_time ? `–${slot.end_time}` : ''} · ${slot.remaining_spaces} spaces` })
  ] })));
  container.append(createElement('div', { className: 'detail-grid', children: [createElement('section', { children: [hero, createElement('div', { className: 'detail-copy', children: [createElement('span', { className: 'eyebrow', text: `${listing.island} · ${statusLabel(listing.category)}` }), createElement('h1', { text: listing.title }), createElement('p', { className: 'business-byline', children: [createElement('span', { text: 'Offered by ' }), businessLink] }), createElement('p', { text: listing.description }), createElement('div', { className: 'definition-grid', children: definitions }), gallery] })] }), createElement('aside', { className: 'detail-sidebar panel', children: [createElement('span', { className: 'eyebrow', text: 'Request a place' }), createElement('h2', { text: formatMoney(listing.price, listing.currency) }), createElement('p', { text: state.availability.length ? `${state.availability.length} upcoming schedule(s) currently listed.` : 'Ask the operator about dates and available spaces.' }), schedules, enquire, contact] })] }));
}

function populateAvailability() {
  const select = document.getElementById('availabilitySelect'); clear(select); select.append(createElement('option', { text: 'Choose manually', attrs: { value: '' } }));
  state.availability.forEach((slot) => select.append(createElement('option', { text: `${formatDate(`${slot.available_date}T00:00:00`)} · ${slot.start_time || 'All day'} · ${slot.remaining_spaces} spaces`, attrs: { value: slot.id } })));
  select.addEventListener('change', () => {
    const slot = state.availability.find((item) => item.id === select.value);
    if (!slot) return;
    document.getElementById('requestedDate').value = slot.available_date;
    document.getElementById('requestedTime').value = slot.start_time || '';
    document.getElementById('guestCount').max = slot.remaining_spaces;
  });
  document.getElementById('requestedDate').min = new Date().toISOString().slice(0,10);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault(); const button = form.querySelector('button[type="submit"]'); const enquiryMessage = document.getElementById('enquiryMessage');
  const selected = state.availability.find((item) => item.id === document.getElementById('availabilitySelect').value);
  const guestCount = Number(document.getElementById('guestCount').value);
  if (selected && guestCount > selected.remaining_spaces) return setMessage(enquiryMessage, 'Guest count exceeds the remaining spaces.', 'error');
  try {
    setBusy(button, true, 'Sending…');
    const { error } = await requireSupabase().from('booking_enquiries').insert({
      listing_id: state.listing.id, availability_id: selected?.id || null, requested_date: document.getElementById('requestedDate').value,
      requested_time: document.getElementById('requestedTime').value || null, guest_count: guestCount,
      guest_full_name: document.getElementById('guestName').value.trim(), guest_email: document.getElementById('guestEmail').value.trim(),
      guest_phone: document.getElementById('guestPhone').value.trim(), guest_message: document.getElementById('guestMessage').value.trim() || null
    });
    if (error) throw error;
    form.reset(); setMessage(enquiryMessage, 'Enquiry sent. This is not a confirmed booking; the operator must accept it first.', 'success');
  } catch (error) { setMessage(enquiryMessage, error.message, 'error'); }
  finally { setBusy(button, false); }
});

init();
