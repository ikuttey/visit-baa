import { requirePublicSupabase, requireSupabase, showConfigurationNotice, siteUrl } from './supabase-client.js';
import { signedPublicImageUrl } from './storage.js';
import { clear, createElement, emptyState, formatDate, formatMoney, setBusy, setMessage, statusLabel } from './ui.js';
import { renderPublicListingMedia } from './public-media.js';
import { renderFacilitiesView } from './facilities-ui.js';
import { datesInStay, nightsBetween, nonNegativeInteger, positiveInteger, quoteSummary, validDate } from './marketplace.js';
import { priceUnitLabel } from './pricing.js';

const state = { listing: null, availability: [], gallery: [], rooms: [], roomInventory: [], rates: [], roomImages: [], policy: null, promotions: [], reviews: [], galleryItems: [], galleryIndex: 0 };
const container = document.getElementById('listingDetail');
const message = document.getElementById('detailMessage');
const dialog = document.getElementById('enquiryDialog');
const galleryDialog = document.getElementById('galleryDialog');
const listingPriceLabel=(listing)=>listing.price==null||listing.price_unit==='price_on_request'?'Price on request':`${formatMoney(listing.price,listing.currency)} ${priceUnitLabel(listing.price_unit).toLowerCase()}`;
const form = document.getElementById('enquiryForm');
const control = (id) => document.getElementById(id);

control('closeEnquiry').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
control('closeGallery').addEventListener('click', () => galleryDialog.close());
control('previousGalleryImage').addEventListener('click', () => showGalleryImage(state.galleryIndex - 1));
control('nextGalleryImage').addEventListener('click', () => showGalleryImage(state.galleryIndex + 1));
galleryDialog.addEventListener('click', (event) => { if (event.target === galleryDialog) galleryDialog.close(); });
let galleryTouchStart = null;
galleryDialog.addEventListener('touchstart', (event) => { galleryTouchStart = event.changedTouches[0]?.clientX ?? null; }, { passive:true });
galleryDialog.addEventListener('touchend', (event) => {
  if (galleryTouchStart === null) return;
  const distance = (event.changedTouches[0]?.clientX ?? galleryTouchStart) - galleryTouchStart;
  galleryTouchStart = null;
  if (Math.abs(distance) > 45) showGalleryImage(state.galleryIndex + (distance < 0 ? 1 : -1));
}, { passive:true });
document.addEventListener('keydown', (event) => {
  if (!galleryDialog.open) return;
  if (event.key === 'ArrowLeft') showGalleryImage(state.galleryIndex - 1);
  if (event.key === 'ArrowRight') showGalleryImage(state.galleryIndex + 1);
  if (event.key === 'Escape') galleryDialog.close();
});

async function optional(query) {
  const result = await query;
  if (result.error && !['42P01','42703','PGRST205'].includes(result.error.code)) throw result.error;
  return result.data || [];
}

async function init() {
  if (showConfigurationNotice(control('configMessage'))) return container.append(emptyState('Listing data is not connected', 'Configure Supabase to load approved public listings.'));
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) return container.append(emptyState('No listing selected', 'Return to the listings page and choose a service.'));
  try {
    setMessage(message, 'Loading listing…', 'loading');
    const client = requirePublicSupabase();
    const [listingResult, availabilityResult, galleryResult] = await Promise.all([
      client.from('public_listings').select('*').eq('id', id).maybeSingle(),
      client.from('public_availability').select('*').eq('listing_id', id).order('available_date').order('start_time'),
      client.from('listing_images').select('id,storage_path,caption,sort_order').eq('listing_id', id).order('sort_order')
    ]);
    if (listingResult.error) throw listingResult.error;
    if (availabilityResult.error) throw availabilityResult.error;
    if (galleryResult.error) throw galleryResult.error;
    if (!listingResult.data) return container.append(emptyState('Listing unavailable', 'This listing may be awaiting approval, paused, or removed.'));
    state.listing = listingResult.data; state.availability = availabilityResult.data || []; state.gallery = galleryResult.data || [];
    const [rooms, policy, promotions, reviews] = await Promise.all([
      optional(client.from('public_accommodation_rooms').select('*').eq('listing_id', id).order('sort_order')),
      optional(client.from('public_listing_policies').select('*').eq('listing_id', id).maybeSingle()),
      optional(client.from('public_promotions').select('*').eq('listing_id', id).order('valid_until')),
      optional(client.from('public_reviews').select('*').eq('listing_id', id).order('created_at', { ascending: false }).limit(50))
    ]);
    state.rooms = rooms; state.policy = Array.isArray(policy) ? policy[0] : policy; state.promotions = promotions; state.reviews = reviews;
    if (state.rooms.length) {
      [state.roomInventory, state.rates, state.roomImages] = await Promise.all([
        optional(client.from('public_room_availability').select('*').in('room_id', state.rooms.map((room) => room.id)).order('available_date')),
        optional(client.from('public_room_rate_plans').select('*').in('room_id', state.rooms.map((room) => room.id)).order('sort_order')),
        optional(client.from('public_room_images').select('*').in('room_id', state.rooms.map((room) => room.id)).order('sort_order'))
      ]);
    }
    await render(); populateBookingForm(); updateMetadata(); setMessage(message);
  } catch (error) { setMessage(message, error.message, 'error'); }
}

function definition(label, text) { return createElement('div', { className: 'definition', children: [createElement('small', { text: label }), createElement('strong', { text: text || '—' })] }); }

function promotionSection() {
  if (!state.promotions.length) return null;
  return createElement('section', { className: 'marketplace-detail-section', children: [createElement('h2', { text: 'Current offers' }), ...state.promotions.map((promotion) => createElement('div', { className: 'promotion-card', children: [
    createElement('strong', { text: promotion.name }), createElement('span', { text: promotion.discount_type === 'percent' ? `${promotion.discount_value}% off` : `${formatMoney(promotion.discount_value, state.listing.currency)} off` }), promotion.description ? createElement('p', { text: promotion.description }) : null
  ] }))] });
}

function bookableRooms(useUrl = false) {
  const params = new URLSearchParams(location.search);
  const chosen = (id, parameter, fallback) => useUrl ? (params.get(parameter) || fallback) : (control(id)?.value || params.get(parameter) || fallback);
  const checkin = chosen('requestedDate', 'checkin', '');
  const checkout = chosen('checkOutDate', 'checkout', '');
  const adults = positiveInteger(chosen('guestCount', 'adults', '1'));
  const children = nonNegativeInteger(chosen('childrenCount', 'children', '0'));
  const roomsRequested = positiveInteger(chosen('roomsRequested', 'rooms', '1'));
  const dates = datesInStay(checkin, checkout);
  return state.rooms.filter((room) => {
    if (Number(room.adult_capacity) * roomsRequested < adults || Number(room.child_capacity) * roomsRequested < children || Number(room.maximum_guests) * roomsRequested < adults + children) return false;
    if (!dates.length) return true;
    const inventory = state.roomInventory.filter((item) => item.room_id === room.id && dates.includes(item.available_date) && Number(item.available_quantity) >= roomsRequested);
    return new Set(inventory.map((item) => item.available_date)).size === dates.length;
  });
}

async function roomsSection() {
  if (state.listing.category !== 'accommodation') return null;
  const section = createElement('section', { className: 'marketplace-detail-section room-options', children: [createElement('h2', { text: 'Room options' })] });
  const rooms = bookableRooms(true);
  if (!state.rooms.length) return section.append(emptyState('Room details available on request', 'This existing property has not published separate room types yet.')), section;
  if (!rooms.length) return section.append(emptyState('No rooms available', 'Try different stay dates, traveler numbers, or room quantity.')), section;
  for (const room of rooms) {
    const card = createElement('article', { className: 'public-room-card' });
    const images = state.roomImages.filter((image) => image.room_id === room.id);
    const photoStrip = createElement('div', { className: 'room-photo-strip' });
    for (const image of images.slice(0, 4)) {
      const url = await signedPublicImageUrl('room-gallery', image.storage_path);
      if (!url) continue;
      const galleryIndex = state.galleryItems.push({ ...image, url, caption:image.caption || `${room.name} photo` }) - 1;
      const thumbnail = createElement('img', { attrs: { src:url, alt:image.caption || `${room.name} photo`, loading:'lazy' } });
      const open = createElement('button', { attrs: { type:'button', 'aria-label':`Open ${room.name} photo` }, children:[thumbnail] });
      open.addEventListener('click', () => openGallery(galleryIndex)); photoStrip.append(open);
    }
    card.append(createElement('div', { children: [createElement('h3', { text: room.name }), photoStrip.childElementCount ? photoStrip : null, createElement('p', { text: room.description || `${room.bed_configuration} · up to ${room.maximum_guests} guests` }), createElement('div', { className: 'listing-meta', children: [createElement('span', { text: room.bed_configuration }), createElement('span', { text: `${room.maximum_guests} guests` }), room.view_type ? createElement('span', { text: room.view_type }) : null, room.room_size_sqm ? createElement('span', { text: `${room.room_size_sqm} m²` }) : null] }), room.amenities?.length ? createElement('p', { className: 'help', text: room.amenities.join(' · ') }) : null] }));
    card.append(createElement('div', { children: [createElement('strong', { className: 'price', text: `${formatMoney(room.base_price, room.currency)} / night` }), createElement('span', { className: 'help', text: `${room.quantity} room${room.quantity === 1 ? '' : 's'} in this type` }), createElement('button', { className: 'button secondary small', text: 'Select room', attrs: { type: 'button', 'data-room-id': room.id } })] }));
    card.querySelector('[data-room-id]').addEventListener('click', () => { dialog.showModal(); control('roomSelect').value = room.id; populateRatePlans(); updateQuote(); });
    section.append(card);
  }
  return section;
}

function policiesSection() {
  if (!state.policy) return null;
  const policy = state.policy;
  const values = [
    ['Cancellation', statusLabel(policy.cancellation_type)],
    ['Check-in', [policy.check_in_from, policy.check_in_until].filter(Boolean).join(' – ')],
    ['Check-out', [policy.check_out_from, policy.check_out_until].filter(Boolean).join(' – ')],
    ['Children', policy.children_allowed === null ? '' : (policy.children_allowed ? 'Children allowed' : 'Adults only')],
    ['Pets', statusLabel(policy.pets_policy || '')], ['Smoking', statusLabel(policy.smoking_policy || '')],
    ['Payment', policy.payment_condition === 'deposit_required' && policy.deposit_percentage != null ? `${Number(policy.deposit_percentage)}% deposit required` : statusLabel(policy.payment_condition || '')]
  ].filter(([, value]) => value);
  if (!values.length) return null;
  return createElement('section', { className: 'marketplace-detail-section', children: [createElement('h2', { text: 'Property policies' }), createElement('div', { className: 'definition-grid', children: values.map(([label, value]) => definition(label, value)) })] });
}

function reviewsSection() {
  const section = createElement('section', { className: 'marketplace-detail-section reviews-section', children: [createElement('h2', { text: 'Verified traveler reviews' })] });
  if (!state.reviews.length) return section.append(emptyState('No reviews yet', 'Only travelers with completed reservations can review this listing.')), section;
  const average = state.reviews.reduce((sum, review) => sum + Number(review.overall_rating), 0) / state.reviews.length;
  section.append(createElement('div', { className: 'review-summary', children: [createElement('strong', { text: average.toFixed(1) }), createElement('span', { text: `${state.reviews.length} verified review${state.reviews.length === 1 ? '' : 's'}` })] }));
  state.reviews.slice(0, 6).forEach((review) => section.append(createElement('article', { className: 'review-card', children: [
    createElement('div', { children: [createElement('strong', { text: review.title || 'Traveler review' }), createElement('span', { className: 'review-score', text: Number(review.overall_rating).toFixed(1) })] }),
    createElement('small', { text: `${review.display_name} · ${formatDate(review.created_at)}` }), createElement('p', { text: review.body }),
    review.operator_response ? createElement('div', { className: 'operator-response', children: [createElement('strong', { text: 'Operator response' }), createElement('p', { text: review.operator_response })] }) : null
  ] })));
  return section;
}

async function renderGallery(listing) {
  const gallery = createElement('section', { className: 'detail-gallery' });
  const resolved = await Promise.all(state.gallery.map(async (item) => ({ ...item, url: await signedPublicImageUrl('listing-gallery', item.storage_path) })));
  state.galleryItems = resolved.filter((item) => item.url);
  if (!state.galleryItems.length) return gallery;
  const previews = createElement('div', { className: 'preview-grid' });
  state.galleryItems.forEach((item, index) => {
    const figure = createElement('figure', { className: 'preview captioned gallery-preview' });
    const image = createElement('img', { attrs: { src: item.url, alt: item.caption || `${listing.title} gallery photo`, loading: 'lazy' } });
    image.addEventListener('error', () => figure.remove(), { once: true });
    const open = createElement('button', { className: 'gallery-open', attrs: { type: 'button', 'aria-label': `Open image ${index + 1} of ${state.galleryItems.length}` }, children: [image] });
    open.addEventListener('click', () => openGallery(index)); figure.append(open);
    if (item.caption) figure.append(createElement('figcaption', { text: item.caption }));
    previews.append(figure);
  });
  gallery.append(createElement('h2', { text: 'Photo gallery' }), previews); return gallery;
}

async function render() {
  clear(container); const listing = state.listing;
  const hero = createElement('div', { className: 'detail-hero' }); await renderPublicListingMedia(hero, listing, { loading: 'eager' });
  const enquire = createElement('button', { className: 'button aqua', text: 'Send booking enquiry', attrs: { type: 'button' } }); enquire.addEventListener('click', () => { dialog.showModal(); updateQuote(); });
  const save = createElement('button', { className: 'button secondary', text: '♡ Save', attrs: { type: 'button' } }); save.addEventListener('click', () => saveListing(save));
  const trip = createElement('button', { className: 'button secondary', text: '+ Add to trip', attrs: { type: 'button' } }); trip.addEventListener('click', () => addToTrip(trip));
  const contact = createElement('div', { className: 'form-actions' });
  if (listing.contact_email) contact.append(createElement('a', { className: 'button secondary', text: 'Email operator', attrs: { href: `mailto:${listing.contact_email}` } }));
  if (listing.contact_phone) contact.append(createElement('a', { className: 'button secondary', text: 'Call operator', attrs: { href: `tel:${listing.contact_phone.replace(/[^+\d]/g, '')}` } }));
  const businessLink = createElement('a', { className: 'business-heading-link', text: listing.business_name, attrs: { href: `business.html?id=${encodeURIComponent(listing.business_id)}` } });
  const definitions = [definition('Island', listing.island), definition('Category', statusLabel(listing.category)), definition('Price', listingPriceLabel(listing)), definition('Capacity', `${listing.available_spaces} of ${listing.max_capacity} spaces`), definition('Schedule', listing.start_time ? `${listing.start_time} – ${listing.end_time || 'Flexible'}` : 'Flexible'), definition('Meeting point', listing.meeting_point), definition('Included', listing.included_items?.join(', ')), definition('Excluded', listing.excluded_items?.join(', ')), definition('Requirements', listing.requirements), definition('Cancellation', listing.cancellation_information)];
  if (listing.category === 'accommodation') definitions.push(definition('Property / room', `${listing.property_type} · ${listing.room_type}`), definition('Rooms / guests', `${listing.number_of_rooms} rooms · up to ${listing.maximum_guests} guests`), definition('Check-in / out', `${listing.check_in_time || '—'} / ${listing.check_out_time || '—'}`));
  const facilities = renderFacilitiesView(listing);
  const gallery = await renderGallery(listing);
  const roomOptions = await roomsSection();
  const schedules = createElement('div', { className: 'availability-list' });
  state.availability.forEach((slot) => schedules.append(createElement('div', { className: 'availability-item', children: [createElement('strong', { text: formatDate(`${slot.available_date}T00:00:00`) }), createElement('span', { text: `${slot.start_time || 'All day'}${slot.end_time ? `–${slot.end_time}` : ''} · ${slot.remaining_spaces} spaces` })] })));
  container.append(createElement('div', { className: 'detail-grid', children: [createElement('section', { children: [hero, createElement('div', { className: 'detail-copy', children: [createElement('span', { className: 'eyebrow', text: `${listing.island} · ${statusLabel(listing.category)}` }), createElement('h1', { text: listing.title }), createElement('p', { className: 'business-byline', children: [createElement('span', { text: 'Offered by ' }), businessLink, listing.is_verified ? createElement('span', { className: 'verified-label', text: ' · ✓ Verified by Visit Baa' }) : null] }), createElement('p', { text: listing.description }), createElement('div', { className: 'definition-grid', children: definitions }), facilities, promotionSection(), roomOptions, policiesSection(), gallery, reviewsSection()] })] }), createElement('aside', { className: 'detail-sidebar panel', children: [createElement('span', { className: 'eyebrow', text: 'Request a place' }), createElement('h2', { text: listingPriceLabel(listing) }), createElement('p', { text: state.availability.length ? `${state.availability.length} upcoming schedule(s) currently listed.` : 'Ask the operator about dates and available spaces.' }), schedules, enquire, createElement('div', { className: 'form-actions', children: [save, trip] }), contact] })] }));
}

function populateBookingForm() {
  const params = new URLSearchParams(location.search);
  const accommodation = state.listing.category === 'accommodation';
  document.querySelectorAll('.accommodation-booking-field').forEach((field) => { field.hidden = !accommodation; });
  document.querySelectorAll('.experience-booking-field').forEach((field) => { field.hidden = accommodation; });
  control('checkOutDate').required = accommodation;
  control('requestedDateLabel').textContent = accommodation ? 'Check-in' : (state.listing.category === 'transfer' ? 'Travel date' : 'Activity date');
  control('guestCountLabel').textContent = accommodation ? 'Adults' : (state.listing.category === 'transfer' ? 'Passengers' : 'Guests');
  control('requestedDate').min = new Date().toISOString().slice(0,10); control('checkOutDate').min = control('requestedDate').min;
  control('requestedDate').value = accommodation ? (params.get('checkin') || '') : (params.get('date') || '');
  control('checkOutDate').value = params.get('checkout') || '';
  control('guestCount').value = params.get('adults') || params.get('guests') || '1';
  control('childrenCount').value = params.get('children') || '0'; control('roomsRequested').value = params.get('rooms') || '1';
  const availability = control('availabilitySelect'); clear(availability); availability.append(createElement('option', { text: 'Choose manually', attrs: { value: '' } }));
  state.availability.forEach((slot) => availability.append(createElement('option', { text: `${formatDate(`${slot.available_date}T00:00:00`)} · ${slot.start_time || 'All day'} · ${slot.remaining_spaces} spaces`, attrs: { value: slot.id } })));
  refreshRoomSelect();
  populateRatePlans();
  availability.addEventListener('change', () => {
    const slot = state.availability.find((item) => item.id === availability.value); if (!slot) return;
    control('requestedDate').value = slot.available_date; control('requestedTime').value = slot.start_time || ''; control('guestCount').max = slot.remaining_spaces; updateQuote();
  });
  control('roomSelect').addEventListener('change', () => { populateRatePlans(); updateQuote(); });
  ['requestedDate','checkOutDate','guestCount','childrenCount','roomsRequested'].forEach((id) => control(id).addEventListener('change', () => { refreshRoomSelect(); updateQuote(); }));
  control('ratePlanSelect').addEventListener('change', updateQuote);
}

function refreshRoomSelect() {
  const roomSelect = control('roomSelect'); const previous = roomSelect.value; clear(roomSelect);
  bookableRooms().forEach((room) => roomSelect.append(createElement('option', { text:`${room.name} - ${formatMoney(room.base_price, room.currency)}/night`, attrs:{ value:room.id } })));
  if ([...roomSelect.options].some((option) => option.value === previous)) roomSelect.value = previous;
  populateRatePlans();
}

function populateRatePlans() {
  const select = control('ratePlanSelect'); clear(select); select.append(createElement('option', { text: 'Standard room rate', attrs: { value: '' } }));
  state.rates.filter((rate) => rate.room_id === control('roomSelect').value).forEach((rate) => select.append(createElement('option', { text: `${rate.name} · ${formatMoney(rate.nightly_price, state.listing.currency)}`, attrs: { value: rate.id } })));
}

function updateQuote() {
  const accommodation = state.listing.category === 'accommodation';
  const adults = positiveInteger(control('guestCount').value); const children = nonNegativeInteger(control('childrenCount').value); const rooms = positiveInteger(control('roomsRequested').value);
  let nights = 0; let unitPrice = null; let currency = state.listing.currency;
  if (accommodation) {
    nights = nightsBetween(control('requestedDate').value, control('checkOutDate').value);
    const room = state.rooms.find((item) => item.id === control('roomSelect').value); const rate = state.rates.find((item) => item.id === control('ratePlanSelect').value);
    unitPrice = Number(rate?.nightly_price ?? room?.base_price ?? state.listing.price_per_night ?? state.listing.price); currency = room?.currency || currency;
  }
  const quote = quoteSummary(state.listing, { nights, rooms, guests: adults + children, unitPrice });
  if (accommodation && nights) {
    const roomId = control('roomSelect').value;
    const inventoryByDate = new Map(state.roomInventory.filter((item) => item.room_id === roomId).map((item) => [item.available_date, item]));
    const stayDates = datesInStay(control('requestedDate').value, control('checkOutDate').value);
    if (stayDates.every((date) => inventoryByDate.has(date))) {
      quote.subtotal = stayDates.reduce((sum, date) => sum + Number(inventoryByDate.get(date).price_override ?? unitPrice), 0) * rooms;
      quote.total = quote.subtotal + quote.taxes + quote.fees;
    }
  }
  const requestDate = control('requestedDate').value;
  const promotion = state.promotions.filter((offer) => requestDate >= offer.valid_from && requestDate <= offer.valid_until && (!offer.minimum_nights || nights >= offer.minimum_nights)).sort((a,b) => {
    const discount = (offer) => offer.discount_type === 'percent' ? quote.subtotal * Number(offer.discount_value) / 100 : Number(offer.discount_value);
    return discount(b) - discount(a);
  })[0];
  const discount = promotion ? Math.min(quote.subtotal, promotion.discount_type === 'percent' ? quote.subtotal * Number(promotion.discount_value) / 100 : Number(promotion.discount_value)) : 0;
  const total = Math.max(0, quote.total - discount);
  control('bookingQuote').replaceChildren(createElement('strong', { text: accommodation && !nights ? 'Choose valid stay dates for a total.' : `Estimated total: ${formatMoney(total, currency)}${nights ? ` for ${nights} night${nights === 1 ? '' : 's'}` : ''}` }), discount ? createElement('small', { text: `${promotion.name}: ${formatMoney(discount, currency)} discount applied.` }) : null, (quote.taxes || quote.fees) ? createElement('small', { text: `Includes configured taxes ${formatMoney(quote.taxes, currency)} and fees ${formatMoney(quote.fees, currency)}.` }) : null);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault(); const button = form.querySelector('button[type="submit"]'); const enquiryMessage = control('enquiryMessage');
  const selected = state.availability.find((item) => item.id === control('availabilitySelect').value);
  const adults = positiveInteger(control('guestCount').value); const children = nonNegativeInteger(control('childrenCount').value);
  if (selected && adults + children > selected.remaining_spaces) return setMessage(enquiryMessage, 'Guest count exceeds the remaining spaces.', 'error');
  if (state.listing.category === 'accommodation' && state.rooms.length && !control('roomSelect').value) return setMessage(enquiryMessage, 'No room type is available for the selected stay and travelers.', 'error');
  try {
    setBusy(button, true, 'Sending…');
    const { data, error } = await requireSupabase().rpc('create_booking_request', {
      p_listing_id:state.listing.id,p_availability_id:selected?.id || null,p_room_id:state.listing.category === 'accommodation' ? (control('roomSelect').value || null) : null,
      p_rate_plan_id:control('ratePlanSelect').value || null,p_requested_date:control('requestedDate').value,p_check_out_date:control('checkOutDate').value || null,
      p_requested_time:control('requestedTime').value || null,p_adults:adults,p_children:children,p_rooms:positiveInteger(control('roomsRequested').value),
      p_guest_full_name:control('guestName').value.trim(),p_guest_email:control('guestEmail').value.trim(),p_guest_phone:control('guestPhone').value.trim(),p_guest_message:control('guestMessage').value.trim() || null
    });
    if (error) throw error;
    form.reset(); populateBookingForm();
    setMessage(enquiryMessage, `Enquiry sent. Reference ${data.booking_reference}. Quoted total ${formatMoney(data.quoted_total, data.quote_currency)}. The operator must accept and confirm it.`, 'success');
  } catch (error) { setMessage(enquiryMessage, error.message, 'error'); }
  finally { setBusy(button, false); }
});

async function saveListing(button) {
  try {
    const { data } = await requireSupabase().auth.getUser();
    if (data.user) {
      const { error } = await requireSupabase().from('saved_listings').upsert({ user_id:data.user.id, listing_id:state.listing.id }); if (error) throw error;
    } else {
      const saved = new Set(JSON.parse(localStorage.getItem('baa_saved_listings') || '[]')); saved.add(state.listing.id); localStorage.setItem('baa_saved_listings', JSON.stringify([...saved]));
    }
    button.textContent = '♥ Saved'; button.disabled = true;
  } catch (error) { setMessage(message, error.message, 'error'); }
}

async function addToTrip(button) {
  try {
    const { data } = await requireSupabase().auth.getUser();
    const plannedDate = control('requestedDate').value || null;
    if (data.user) {
      let { data: trip, error } = await requireSupabase().from('trips').select('id').eq('user_id', data.user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!trip) { const id=crypto.randomUUID();const inserted=await requireSupabase().from('trips').insert({id,user_id:data.user.id,name:'My Baa Trip'});if(inserted.error)throw inserted.error;const fetched=await requireSupabase().from('trips').select('id').eq('id',id).eq('user_id',data.user.id).maybeSingle();if(fetched.error||!fetched.data)throw fetched.error||new Error('Draft ownership validation failed');trip=fetched.data; }
      const result = await requireSupabase().from('trip_items').upsert({ trip_id:trip.id, listing_id:state.listing.id, planned_date:plannedDate }, { onConflict:'trip_id,listing_id,planned_date,planned_time' }); if (result.error) throw result.error;
    } else {
      const items = JSON.parse(localStorage.getItem('baa_trip_items') || '[]').filter((item) => item.listingId !== state.listing.id || item.plannedDate !== plannedDate);
      items.push({ listingId:state.listing.id, title:state.listing.title, island:state.listing.island, category:state.listing.category, plannedDate }); localStorage.setItem('baa_trip_items', JSON.stringify(items));
    }
    button.textContent = 'Added to My Baa Trip'; button.disabled = true;
  } catch { setMessage(message, 'Your draft remains saved on this device. Online saving is temporarily unavailable.', 'error'); }
}

function openGallery(index) { showGalleryImage(index); galleryDialog.showModal(); }
function showGalleryImage(index) {
  if (!state.galleryItems.length) return;
  state.galleryIndex = (index + state.galleryItems.length) % state.galleryItems.length;
  const item = state.galleryItems[state.galleryIndex]; control('galleryLightboxImage').src = item.url; control('galleryLightboxImage').alt = item.caption || `${state.listing.title} image`;
  control('galleryLightboxCaption').textContent = item.caption || ''; control('galleryCounter').textContent = `${state.galleryIndex + 1} / ${state.galleryItems.length}`;
}

function updateMetadata() {
  const listing = state.listing; document.title = `${listing.title} in ${listing.island} — Visit Baa`;
  let description = document.querySelector('meta[name="description"]'); description.content = listing.summary;
  const canonical = createElement('link', { attrs: { rel:'canonical', href:siteUrl(`listing.html?id=${encodeURIComponent(listing.id)}`) } }); document.head.append(canonical);
  [['og:title',document.title],['og:description',listing.summary],['og:type',listing.category === 'accommodation' ? 'website' : 'article']].forEach(([property,content]) => document.head.append(createElement('meta', { attrs: { property, content } })));
  const schema = { '@context':'https://schema.org', '@type':listing.category === 'accommodation' ? 'LodgingBusiness' : 'TouristAttraction', name:listing.title, description:listing.summary, address:{ '@type':'PostalAddress', addressLocality:listing.island, addressCountry:'MV' } };
  if(listing.price!=null&&listing.price_unit!=='price_on_request')schema.offers={ '@type':'Offer',price:Number(listing.price),priceCurrency:listing.currency };
  const script = createElement('script', { attrs: { type:'application/ld+json' }, text:JSON.stringify(schema) }); document.head.append(script);
}

init();
