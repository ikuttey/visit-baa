import { requireSupabase, showConfigurationNotice } from './supabase-client.js';
import { logout, requireAdmin } from './auth.js';
import { signedImageUrl } from './storage.js';
import { bindTabs, clear, createElement, displayList, emptyState, formatDate, formatMoney, setBusy, setMessage, statusBadge, statusLabel } from './ui.js';
import { renderFacilitiesView } from './facilities-ui.js';

const state = { user: null, businesses: [], listings: [], profiles: [], roles: [], reservations: [], reviews: [], paymentReferences: [] };
const message = document.getElementById('adminMessage');
const dialog = document.getElementById('inspectionDialog');

bindTabs();
document.getElementById('logoutButton').addEventListener('click', () => logout().catch((error) => setMessage(message, error.message, 'error')));
document.getElementById('closeInspection').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

async function init() {
  if (showConfigurationNotice(document.getElementById('configMessage'))) return;
  try {
    state.user = await requireAdmin();
    await loadData();
  } catch (error) {
    if (!error.message.includes('required')) setMessage(message, error.message, 'error');
  }
}

async function loadData() {
  setMessage(message, 'Loading administrator records…', 'loading');
  const client = requireSupabase();
  const [businessResult, listingResult, profileResult, roleResult, reservationResult, reviewResult, paymentResult] = await Promise.all([
    client.from('businesses').select('*').order('created_at', { ascending: false }),
    client.from('listings').select('*, businesses(id,owner_id,business_name,status,island,category,contact_person_name,email,phone,registration_number)').order('created_at', { ascending: false }),
    client.from('profiles').select('*').order('created_at', { ascending: false }),
    client.from('user_roles').select('*'),
    client.from('booking_enquiries').select('*').order('created_at', { ascending: false }).limit(500),
    client.from('reviews').select('*').order('created_at', { ascending: false }).limit(500),
    client.from('payment_references').select('*').order('created_at', { ascending: false }).limit(500)
  ]);
  for (const result of [businessResult, listingResult, profileResult, roleResult, reservationResult, reviewResult]) if (result.error) throw result.error;
  if (paymentResult.error && !['PGRST204','PGRST205','42P01','42703'].includes(paymentResult.error.code)) throw paymentResult.error;
  state.businesses = businessResult.data || [];
  state.listings = listingResult.data || [];
  state.profiles = profileResult.data || [];
  state.roles = roleResult.data || [];
  state.reservations = reservationResult.data || [];
  state.reviews = reviewResult.data || [];
  state.paymentReferences = paymentResult.data || [];
  renderAll(); setMessage(message);
}

function renderAll() {
  const pendingBusinesses = state.businesses.filter((item) => item.status === 'pending_review');
  const pendingListings = state.listings.filter((item) => item.status === 'pending_review');
  renderBusinessTable(document.getElementById('pendingBusinessesTable'), pendingBusinesses, true);
  renderBusinessTable(document.getElementById('allBusinessesTable'), state.businesses, false);
  renderListingTable(document.getElementById('pendingListingsTable'), pendingListings, true);
  renderListingTable(document.getElementById('allListingsTable'), state.listings, false);
  renderReservations();
  renderTravelers();
  renderReviews();
  document.getElementById('pendingBusinessesCount').textContent = pendingBusinesses.length;
  document.getElementById('verifiedBusinessesCount').textContent = state.businesses.filter((item) => item.status === 'verified').length;
  document.getElementById('pendingListingsCount').textContent = pendingListings.length;
  document.getElementById('publishedListingsCount').textContent = state.listings.filter((item) => item.status === 'published').length;
  document.getElementById('operatorCount').textContent = new Set(state.roles.filter((item) => item.role === 'operator').map((item) => item.user_id)).size;
}

function listingName(listingId) {
  return state.listings.find((listing) => listing.id === listingId)?.title || 'Listing';
}

function renderReservations() {
  const container = document.getElementById('adminReservationsTable'); clear(container);
  if (!state.reservations.length) return container.append(emptyState('No reservations', 'Booking requests will appear here when travelers contact operators.'));
  const body = createElement('tbody');
  state.reservations.forEach((reservation) => { const refs=state.paymentReferences.filter((item)=>item.booking_id===reservation.id); body.append(createElement('tr', { children: [
    createElement('td', { children: [createElement('strong', { text: reservation.booking_reference || 'Legacy enquiry' }), createElement('div', { text: reservation.guest_full_name })] }),
    createElement('td', { text: listingName(reservation.listing_id) }),
    createElement('td', { text: reservation.check_out_date ? `${formatDate(`${reservation.requested_date}T00:00:00`)} - ${formatDate(`${reservation.check_out_date}T00:00:00`)}` : formatDate(`${reservation.requested_date}T00:00:00`) }),
    createElement('td', { children:[createElement('div',{text:Number(reservation.quoted_total)>0?formatMoney(reservation.quoted_total,reservation.quote_currency):'Not quoted'}),Number(reservation.deposit_amount)>0?createElement('small',{text:`Deposit ${formatMoney(reservation.deposit_amount,reservation.quote_currency)} · ${statusLabel(reservation.payment_status)}`}):null,...refs.map((item)=>createElement('small',{text:`${item.payment_reference}: ${formatMoney(item.amount,item.currency)} · ${statusLabel(item.status)}`}))] }),
    createElement('td', { children: [statusBadge(reservation.status)] })
  ] })); });
  container.append(tableWrap(['Reference / traveler','Listing','Date','Total','Status'], body));
}

function renderTravelers() {
  const container = document.getElementById('adminTravelersTable'); clear(container);
  const travelerIds = new Set(state.roles.filter((record) => record.role === 'traveler').map((record) => record.user_id));
  const travelers = state.profiles.filter((profile) => travelerIds.has(profile.id));
  if (!travelers.length) return container.append(emptyState('No traveler accounts', 'Verified traveler accounts will appear here.'));
  const body = createElement('tbody');
  travelers.forEach((profile) => body.append(createElement('tr', { children: [createElement('td', { text: profile.full_name }), createElement('td', { text: profile.phone || 'Not provided' }), createElement('td', { text: formatDate(profile.created_at) }), createElement('td', { text: state.reservations.filter((item) => item.traveler_id === profile.id).length })] })));
  container.append(tableWrap(['Traveler','Phone','Joined','Booking requests'], body));
}

function renderReviews() {
  const container = document.getElementById('adminReviewsTable'); clear(container);
  if (!state.reviews.length) return container.append(emptyState('No verified reviews', 'Reviews can only be submitted after completed bookings.'));
  const body = createElement('tbody');
  state.reviews.forEach((review) => {
    const actions = createElement('div', { className: 'table-actions' });
    if (review.status !== 'published') actions.append(button('Publish', () => moderateReview(review.id, 'published'), 'aqua'));
    if (review.status !== 'removed') actions.append(button('Remove', () => moderateReview(review.id, 'removed'), 'danger'));
    body.append(createElement('tr', { children: [
      createElement('td', { children: [createElement('strong', { text: review.display_name }), createElement('div', { text: review.title || review.body.slice(0, 90) })] }),
      createElement('td', { text: listingName(review.listing_id) }), createElement('td', { text: `${Number(review.overall_rating).toFixed(1)} / 10` }),
      createElement('td', { children: [statusBadge(review.status)] }), createElement('td', { children: [actions] })
    ] }));
  });
  container.append(tableWrap(['Review','Listing','Score','Status','Moderation'], body));
}

async function moderateReview(id, status) {
  const reason = window.prompt(status === 'removed' ? 'Reason for removing this review:' : 'Optional moderation note:', '');
  if (status === 'removed' && !reason?.trim()) return setMessage(message, 'A moderation reason is required when removing a review.', 'error');
  const { error } = await requireSupabase().from('reviews').update({ status, moderation_note:reason?.trim() || null }).eq('id', id);
  if (error) throw error;
  await loadData();
  setMessage(message, `Review changed to ${statusLabel(status)}.`, 'success');
}

function button(text, handler, style = 'secondary') {
  const element = createElement('button', { className: `button small ${style}`, text, attrs: { type: 'button' } });
  element.addEventListener('click', async () => {
    if (element.disabled) return;
    setBusy(element, true, `${text}...`);
    try { await handler(element); }
    finally { if (element.isConnected) setBusy(element, false); }
  });
  return element;
}

function renderBusinessTable(container, records, reviewMode) {
  clear(container);
  if (!records.length) return container.append(emptyState(reviewMode ? 'No pending business applications' : 'No business records', reviewMode ? 'New applications will appear here.' : 'No operators have registered yet.'));
  const body = createElement('tbody');
  records.forEach((business) => {
    const actions = createElement('div', { className: 'table-actions' });
    actions.append(button('Inspect', () => inspectBusiness(business)));
    if (reviewMode || business.status !== 'verified') actions.append(button('Approve', () => reviewBusiness(business.id, 'verified'), 'aqua'));
    actions.append(button('Request changes', () => reviewBusiness(business.id, 'changes_requested')));
    actions.append(button('Reject', () => reviewBusiness(business.id, 'rejected'), 'danger'));
    if (business.status === 'verified') actions.append(button('Suspend', () => reviewBusiness(business.id, 'suspended'), 'danger'));
    body.append(createElement('tr', { children: [
      createElement('td', { children: [createElement('strong', { text: business.business_name }), createElement('div', { text: business.registration_number })] }),
      createElement('td', { text: `${business.island} · ${statusLabel(business.category)}` }),
      createElement('td', { children: [statusBadge(business.status)] }),
      createElement('td', { text: formatDate(business.created_at) }),
      createElement('td', { children: [actions] })
    ] }));
  });
  container.append(tableWrap(['Business','Island / category','Status','Applied','Actions'], body));
}

function renderListingTable(container, records, reviewMode) {
  clear(container);
  if (!records.length) return container.append(emptyState(reviewMode ? 'No pending listings' : 'No listing records', reviewMode ? 'Submitted listings will appear here.' : 'Operators have not created listings yet.'));
  const body = createElement('tbody');
  records.forEach((listing) => {
    const actions = createElement('div', { className: 'table-actions' });
    actions.append(button('Inspect', () => inspectListing(listing)));
    if (listing.status === 'pending_review') {
      actions.append(button('Publish', () => reviewListing(listing.id, 'published'), 'aqua'));
      actions.append(button('Request changes', () => reviewListing(listing.id, 'changes_requested')));
      actions.append(button('Reject', () => reviewListing(listing.id, 'rejected'), 'danger'));
    }
    if (listing.status === 'published') actions.append(button('Suspend', () => reviewListing(listing.id, 'paused')));
    body.append(createElement('tr', { children: [
      createElement('td', { children: [createElement('strong', { text: listing.title }), createElement('div', { text: listing.businesses?.business_name || 'Business' })] }),
      createElement('td', { text: `${listing.island} · ${statusLabel(listing.category)}` }),
      createElement('td', { text: formatMoney(listing.price, listing.currency) }),
      createElement('td', { children: [statusBadge(listing.status)] }),
      createElement('td', { children: [actions] })
    ] }));
  });
  container.append(tableWrap(['Listing','Island / category','Price','Status','Actions'], body));
}

function tableWrap(headings, body) {
  const head = createElement('thead', { children: [createElement('tr', { children: headings.map((text) => createElement('th', { text })) })] });
  return createElement('div', { className: 'table-wrap', children: [createElement('table', { children: [head, body] })] });
}

function definition(label, data) {
  return createElement('div', { className: 'definition', children: [createElement('small', { text: label }), createElement('strong', { text: data ?? '—' })] });
}

async function mediaPreview(items, fallbackAlt) {
  const grid = createElement('div', { className: 'preview-grid' });
  const resolved = await Promise.all(items.filter((item) => item.path).map(async (item) => ({
    ...item,
    url: await signedImageUrl(item.bucket, item.path)
  })));
  resolved.filter((item) => item.url).forEach((item) => grid.append(createElement('figure', { className: 'preview captioned', children: [
    createElement('img', { attrs: { src: item.url, alt: item.caption || fallbackAlt } }),
    item.caption ? createElement('figcaption', { text: item.caption }) : null
  ] })));
  return grid;
}

async function inspectBusiness(business) {
  document.getElementById('inspectionTitle').textContent = business.business_name;
  const inspectionBody = document.getElementById('inspectionBody');
  inspectionBody.replaceChildren(createElement('div', { className: 'message loading', text: 'Loading application media…' }));
  dialog.showModal();
  const profile = state.profiles.find((item) => item.id === business.owner_id);
  const details = createElement('div', { className: 'definition-grid', children: [
    definition('Contact person', business.contact_person_name), definition('Account name', profile?.full_name),
    definition('Registration number', business.registration_number), definition('Category', statusLabel(business.category)),
    definition('Island', business.island), definition('Email', business.email), definition('Phone / WhatsApp', business.phone),
    definition('Address', business.business_address), definition('Website', business.website_url), definition('Description', business.description),
    definition('Accuracy confirmed', business.accuracy_confirmed ? 'Yes' : 'No'), definition('Terms accepted', business.terms_accepted ? 'Yes' : 'No'),
    definition('Status', statusLabel(business.status)), definition('Review note', business.review_note)
  ] });
  try {
    const { data, error } = await requireSupabase().from('business_images').select('storage_path, caption, sort_order').eq('business_id', business.id).order('sort_order');
    if (error) throw error;
    const media = await mediaPreview([
      { bucket: 'business-logos', path: business.logo_path, caption: `${business.business_name} logo` },
      ...(data || []).map((item) => ({ bucket: 'business-gallery', path: item.storage_path, caption: item.caption }))
    ], `${business.business_name} application photo`);
    inspectionBody.replaceChildren(details);
    if (media.childElementCount) inspectionBody.append(createElement('h3', { text: 'Submitted media' }), media);
  } catch (error) {
    inspectionBody.replaceChildren(details, createElement('div', { className: 'message error', text: error.message }));
  }
}

async function inspectListing(listing) {
  document.getElementById('inspectionTitle').textContent = listing.title;
  const inspectionBody = document.getElementById('inspectionBody');
  inspectionBody.replaceChildren(createElement('div', { className: 'message loading', text: 'Loading listing media…' }));
  dialog.showModal();
  const business = state.businesses.find((item) => item.id === listing.business_id) || listing.businesses;
  const profile = state.profiles.find((item) => item.id === business?.owner_id);
  const details = createElement('div', { className: 'definition-grid', children: [
    definition('Business', business?.business_name), definition('Business status', statusLabel(business?.status || 'unknown')),
    definition('Registration number', business?.registration_number), definition('Operator contact', business?.contact_person_name),
    definition('Account name', profile?.full_name), definition('Account phone', profile?.phone),
    definition('Business email', business?.email), definition('Business phone', business?.phone),
    definition('Category', statusLabel(listing.category)), definition('Island', listing.island), definition('Summary', listing.summary), definition('Description', listing.description),
    definition('Price', `${formatMoney(listing.price, listing.currency)} ${statusLabel(listing.price_unit)}`), definition('Capacity', `${listing.available_spaces} / ${listing.max_capacity}`),
    definition('Time', `${listing.start_time || 'Flexible'} – ${listing.end_time || 'Flexible'}`), definition('Meeting point', listing.meeting_point),
    definition('Included', displayList(listing.included_items)), definition('Excluded', displayList(listing.excluded_items)),
    definition('Requirements', listing.requirements), definition('Cancellation', listing.cancellation_information), definition('Status', statusLabel(listing.status)), definition('Current review note', listing.review_note)
  ] });
  try {
    const client = requireSupabase();
    const [galleryResult, availabilityResult, historyResult] = await Promise.all([
      client.from('listing_images').select('storage_path,caption,sort_order').eq('listing_id', listing.id).order('sort_order'),
      client.from('availability').select('*').eq('listing_id', listing.id).order('available_date').order('start_time'),
      client.from('review_history').select('*').eq('target_type', 'listing').eq('target_id', listing.id).order('created_at', { ascending: false })
    ]);
    for (const result of [galleryResult, availabilityResult, historyResult]) if (result.error) throw result.error;
    const media = await mediaPreview([
      { bucket: 'listing-covers', path: listing.cover_image_path, caption: `${listing.title} cover` },
      ...(galleryResult.data || []).map((item) => ({ bucket: 'listing-gallery', path: item.storage_path, caption: item.caption }))
    ], `${listing.title} listing photo`);
    inspectionBody.replaceChildren(details);
    const facilities = renderFacilitiesView(listing, { context: 'admin' });
    if (facilities) inspectionBody.append(facilities);
    if (media.childElementCount) inspectionBody.append(createElement('h3', { text: 'Submitted media' }), media);
    inspectionBody.append(createElement('h3', { text: 'Availability' }));
    const slots = availabilityResult.data || [];
    inspectionBody.append(slots.length ? createElement('div', { className: 'definition-grid', children: slots.map((slot) => definition(formatDate(`${slot.available_date}T00:00:00`), slot.is_blocked ? 'Blocked' : `${slot.start_time || 'All day'}${slot.end_time ? `–${slot.end_time}` : ''} · ${slot.remaining_spaces} / ${slot.max_capacity} spaces`)) }) : emptyState('No availability', 'The operator has not added availability for this listing.'));
    inspectionBody.append(createElement('h3', { text: 'Review history' }));
    const history = historyResult.data || [];
    inspectionBody.append(history.length ? createElement('div', { className: 'history-list', children: history.map((item) => createElement('div', { className: 'history-item', children: [statusBadge(item.new_status), createElement('strong', { text: `${statusLabel(item.previous_status || 'new')} → ${statusLabel(item.new_status)}` }), createElement('span', { text: formatDate(item.created_at, true) }), item.note ? createElement('p', { text: item.note }) : null] })) }) : emptyState('No previous decisions', 'This listing has no administrator review history yet.'));
  } catch (error) {
    inspectionBody.replaceChildren(details, createElement('div', { className: 'message error', text: error.message }));
  }
}

function reviewNote(action) {
  const note = window.prompt(`Optional review note for “${statusLabel(action)}”:`, '');
  if (note === null) return null;
  if (['changes_requested','rejected','suspended','paused'].includes(action) && !note.trim()) {
    setMessage(message, 'Add a reason for change requests, rejection, or suspension.', 'error');
    return null;
  }
  return note.trim();
}

async function reviewBusiness(id, status) {
  const note = reviewNote(status); if (note === null) return;
  try { setMessage(message, 'Saving business decision…', 'loading'); const { error } = await requireSupabase().rpc('admin_review_business', { p_business_id:id, p_status:status, p_note:note || null }); if (error) throw error; await loadData(); setMessage(message, `Business changed to ${statusLabel(status)}.`, 'success'); }
  catch (error) { setMessage(message, error.message, 'error'); }
}

async function reviewListing(id, status) {
  const note = reviewNote(status); if (note === null) return;
  try {
    setMessage(message, 'Saving listing decision…', 'loading');
    const client = requireSupabase();
    const { data, error } = await client.rpc('admin_review_listing', { p_listing_id:id, p_status:status, p_note:note || null });
    if (error) throw error;
    if (!data || data.id !== id || data.status !== status) throw new Error('The database did not return the expected listing review result.');
    if (status === 'published' && (data.is_active !== true || data.reviewed_by !== state.user.id || !data.reviewed_at)) throw new Error('Publication did not set all required administrator review fields.');
    const { data: history, error: historyError } = await client.from('review_history').select('id,new_status,reviewed_by').eq('target_type', 'listing').eq('target_id', id).eq('new_status', status).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (historyError) throw historyError;
    if (!history || history.reviewed_by !== state.user.id) throw new Error('The review decision was not recorded in review history.');
    await loadData(); setMessage(message, `Listing changed to ${statusLabel(status)}.`, 'success');
  }
  catch (error) { setMessage(message, error.message, 'error'); }
}

init();
