import { requireSupabase, showConfigurationNotice } from './supabase-client.js';
import { logout, requireOperator } from './auth.js';
import { bindListingToBusiness, validateListingSubmissionContext } from './listing-ownership.js';
import { removeImage, signedImageUrl, uploadImage, validateImages } from './storage.js';
import { bindTabs, clear, commaList, confirmAction, createElement, emptyState, formatDate, formatMoney, previewFiles, setBusy, setMessage, statusBadge } from './ui.js';
import { assertInsertedDraft, createListingId, listingEditAction, moveGalleryItemByKey, orderedGalleryItems, validateAvailabilityFields, validateListingFields } from './listing-workflow.js';
import { OPERATOR_LISTING_DEFAULTS } from './facilities-config.js';
import { FacilitiesSelector } from './facilities-ui.js';
import { loadTransferNetwork } from './transfer-service.js';
import { normalizeLocationKey } from './transport-locations.js';
import { priceUnitLabel, priceUnitsForCategory } from './pricing.js';

const state = {
  user: null,
  profile: null,
  business: null,
  businessLookupComplete: false,
  listingContextValidated: false,
  listingSubmissionBusy: false,
  listings: [],
  availability: [],
  transportLocations: [],
  roomAvailability: [],
  rooms: [],
  enquiries: [],
  paymentReferences: [],
  reviews: [],
  reviewResponses: [],
  promotions: [],
  listingEditor: {
    original: null,
    originalStatus: null,
    existingGallery: [],
    newGallery: [],
    coverFile: null,
    rooms: [],
    policy: null,
    route: null
  }
};
const message = document.getElementById('dashboardMessage');
const businessForm = document.getElementById('businessForm');
const listingForm = document.getElementById('listingForm');
const availabilityForm = document.getElementById('availabilityForm');
const facilitiesSelector = new FacilitiesSelector(document.getElementById('facilitiesSelector'));

bindTabs();
document.getElementById('logoutButton').addEventListener('click', () => logout().catch((error) => setMessage(message, error.message, 'error')));
let dashboardEventsBound = false;

function value(id) { return document.getElementById(id).value.trim(); }
function nullable(id) { return value(id) || null; }
function numberOrNull(id) { const raw = value(id); return raw === '' ? null : Number(raw); }

async function init() {
  if (showConfigurationNotice(document.getElementById('configMessage'))) return;
  // Bind local controls before any network request. File pickers and forms must
  // remain responsive even when a secondary dashboard query is slow or fails.
  bindEvents();
  try {
    state.user = await requireOperator();
    await loadOperatorTransportLocations();
    await loadAll();
  } catch (error) {
    if (!error.message.includes('required')) setMessage(message, error.message, 'error');
  }
}

async function loadOperatorTransportLocations(){
  const network=await loadTransferNetwork();state.transportLocations=network.locations||[];
  const datalist=document.getElementById('baaRoutePlaces');
  datalist.replaceChildren(...state.transportLocations.map((location)=>new Option(location.name)));
}

async function loadAll() {
  setMessage(message, 'Loading dashboard…', 'loading');
  const client = requireSupabase();
  state.businessLookupComplete = false;
  state.listingContextValidated = false;
  updateListingSubmissionAvailability();
  const [businessResult, profileResult] = await Promise.all([
    client.from('businesses').select('*').eq('owner_id', state.user.id).maybeSingle(),
    client.from('profiles').select('full_name,phone').eq('id', state.user.id).maybeSingle()
  ]);
  if (businessResult.error) throw businessResult.error;
  if (profileResult.error) throw profileResult.error;
  state.business = businessResult.data;
  state.profile = profileResult.data;
  state.businessLookupComplete = true;
  try {
    validateListingSubmissionContext(state.user, state.business);
    state.listingContextValidated = true;
  } catch {
    state.listingContextValidated = false;
  }
  renderBusiness();

  if (!state.business) {
    state.listings = [];
    state.availability = [];
    state.enquiries = [];
    state.reviews = [];
    state.reviewResponses = [];
    state.promotions = [];
    renderListings();
    renderAvailability();
    renderEnquiries();
    renderReviewsAndOffers();
    renderSummary();
    setMessage(message);
    return;
  }

  await Promise.all([loadListings(), loadEnquiries()]);
  await loadAvailability();
  await loadReviewsAndOffers();
  renderSummary();
  setMessage(message);
}

function renderBusiness() {
  const b = state.business;
  const onboarding = !b;
  const businessTabs = [...document.querySelectorAll('.tab[data-tab]:not([data-tab="business"])')];
  businessTabs.forEach((tab) => {
    tab.disabled = onboarding;
    tab.setAttribute('aria-disabled', String(onboarding));
  });

  const agreements = document.getElementById('businessRegistrationAgreements');
  agreements.hidden = !onboarding;
  document.getElementById('businessAccuracyConfirmed').required = onboarding;
  document.getElementById('businessTermsAccepted').required = onboarding;
  const submitButton = businessForm.querySelector('button[type="submit"]');

  if (onboarding) {
    businessForm.reset();
    document.getElementById('businessPanelTitle').textContent = 'Complete business registration';
    document.getElementById('businessPanelDescription').textContent = 'Your operator account is ready. Submit the business details below for administrator review.';
    document.getElementById('welcomeText').textContent = 'Complete business registration to continue onboarding.';
    document.getElementById('businessStatus').replaceChildren(statusBadge('registration_required'));
    document.getElementById('contactPersonName').value = state.profile?.full_name === 'New operator' ? '' : (state.profile?.full_name || '');
    document.getElementById('businessEmail').value = state.user?.email || '';
    document.getElementById('businessPhone').value = state.profile?.phone || '';
    document.getElementById('publicContact').checked = true;
    document.getElementById('businessReviewNote').hidden = true;
    document.getElementById('businessImagePreviews').replaceChildren();
    document.getElementById('resubmitBusinessButton').hidden = true;
    updateListingSubmissionAvailability();
    submitButton.textContent = 'Complete business registration';
    setMessage(document.getElementById('listingPermissionMessage'), 'Complete business registration and wait for administrator verification before creating listings.', 'warning');
    return;
  }

  document.getElementById('businessPanelTitle').textContent = 'Business information';
  document.getElementById('businessPanelDescription').textContent = 'Keep your public and verification information accurate.';
  document.getElementById('welcomeText').textContent = `${b.business_name} · ${b.island}`;
  document.getElementById('businessStatus').replaceChildren(statusBadge(b.status));
  document.getElementById('contactPersonName').value = b.contact_person_name || '';
  document.getElementById('businessName').value = b.business_name || '';
  document.getElementById('registrationNumber').value = b.registration_number || '';
  document.getElementById('operatorCategory').value = b.category;
  document.getElementById('businessIsland').value = b.island;
  document.getElementById('businessEmail').value = b.email || '';
  document.getElementById('businessPhone').value = b.phone || '';
  document.getElementById('websiteUrl').value = b.website_url || '';
  document.getElementById('businessAddress').value = b.business_address || '';
  document.getElementById('businessLatitude').value = b.latitude ?? '';
  document.getElementById('businessLongitude').value = b.longitude ?? '';
  document.getElementById('businessDescription').value = b.description || '';
  document.getElementById('publicContact').checked = b.public_contact;
  submitButton.textContent = 'Save business profile';
  setMessage(document.getElementById('businessReviewNote'));
  if (b.review_note) setMessage(document.getElementById('businessReviewNote'), `Administrator note: ${b.review_note}`, b.status === 'rejected' ? 'error' : 'warning');
  renderBusinessImages();
  const allowed = state.listingContextValidated;
  document.getElementById('resubmitBusinessButton').hidden = !['changes_requested', 'rejected'].includes(b.status);
  updateListingSubmissionAvailability();
  const permissionText = b.status !== 'verified'
    ? 'Listings can be created after an administrator verifies this business.'
    : (!b.is_active ? 'This verified business is not active. Contact an administrator before creating listings.' : '');
  setMessage(document.getElementById('listingPermissionMessage'), allowed ? '' : permissionText, 'warning');
}

function updateListingSubmissionAvailability() {
  const enabled = state.businessLookupComplete
    && state.listingContextValidated
    && !state.listingSubmissionBusy;
  document.getElementById('newListingButton').disabled = !enabled;
  listingForm.querySelector('button[type="submit"]').disabled = !enabled;
}

async function loadAuthenticatedListingBusiness(client) {
  state.businessLookupComplete = false;
  state.listingContextValidated = false;
  updateListingSubmissionAvailability();

  try {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throw new Error(`Unable to verify your signed-in account: ${userError.message}`);
    const user = userData?.user;
    if (!user?.id) throw new Error('Your session has expired. Sign in again before creating a listing.');

    const { data: business, error: businessError } = await client
      .from('businesses')
      .select('id,owner_id,status,is_active,island')
      .eq('owner_id', user.id)
      .maybeSingle();
    if (businessError) throw new Error(`Unable to load the business linked to your account: ${businessError.message}`);

    validateListingSubmissionContext(user, business);
    state.user = user;
    state.business = { ...state.business, ...business };
    state.listingContextValidated = true;
    return { user, business };
  } finally {
    state.businessLookupComplete = true;
    updateListingSubmissionAvailability();
  }
}

async function renderBusinessImages() {
  const container = document.getElementById('businessImagePreviews');
  clear(container);
  if (!state.business) return;
  const client = requireSupabase();
  const { data: images, error } = await client.from('business_images').select('*').eq('business_id', state.business.id).order('sort_order');
  if (error) return setMessage(message, error.message, 'error');
  const records = [];
  if (state.business.logo_path) records.push({ bucket: 'business-logos', path: state.business.logo_path, label: 'Business logo', kind: 'logo' });
  (images || []).forEach((image) => records.push({ bucket: 'business-gallery', path: image.storage_path, label: image.caption || 'Business photograph', kind: 'gallery', id: image.id }));
  for (const record of records) {
    const url = await signedImageUrl(record.bucket, record.path);
    if (!url) continue;
    const image = createElement('img', { attrs: { src: url, alt: record.label } });
    const remove = actionButton('Remove', () => removeBusinessMedia(record), 'danger');
    remove.classList.add('preview-action');
    container.append(createElement('div', { className: 'preview', children: [image, remove] }));
  }
}

async function removeBusinessMedia(record) {
  if (!confirmAction(`Remove this ${record.kind === 'logo' ? 'business logo' : 'business photograph'}?`)) return;
  try {
    const client = requireSupabase();
    const { error } = record.kind === 'logo'
      ? await client.from('businesses').update({ logo_path: null }).eq('id', state.business.id)
      : await client.from('business_images').delete().eq('id', record.id);
    if (error) throw error;
    let cleanupError = null;
    try { await removeImage(record.bucket, record.path); }
    catch (error) { cleanupError = error; }
    if (record.kind === 'logo') state.business.logo_path = null;
    await renderBusinessImages();
    setMessage(message, cleanupError ? `Business image record removed, but its Storage object could not be deleted: ${cleanupError.message}` : 'Business image removed.', cleanupError ? 'warning' : 'success');
  } catch (error) { setMessage(message, error.message, 'error'); }
}

async function loadListings() {
  if (!state.business) {
    state.listings = [];
    renderListings();
    clear(document.getElementById('availabilityListing'));
    return;
  }
  const client = requireSupabase();
  const { data, error } = await client.from('listings').select('*').eq('business_id', state.business.id).order('updated_at', { ascending: false });
  if (error) throw error;
  state.listings = data || [];
  const accommodationIds = state.listings.filter((listing) => listing.category === 'accommodation').map((listing) => listing.id);
  state.rooms = [];
  if (accommodationIds.length) {
    const { data: rooms, error: roomError } = await client.from('accommodation_rooms').select('*').in('listing_id', accommodationIds).order('sort_order');
    if (roomError) throw roomError;
    state.rooms = rooms || [];
  }
  renderListings();
  const select = document.getElementById('availabilityListing');
  clear(select);
  state.listings.forEach((listing) => select.append(createElement('option', { text: listing.title, attrs: { value: listing.id } })));
  updateAvailabilityMode();
}

function renderListings() {
  const container = document.getElementById('listingsTable');
  clear(container);
  if (!state.business) return container.append(emptyState('Business registration required', 'Complete the business registration form before creating listings.'));
  if (!state.listings.length) return container.append(emptyState('No listings yet', 'Create your first listing after the business is verified.'));
  const body = createElement('tbody');
  state.listings.forEach((listing) => {
    const actions = createElement('div', { className: 'table-actions' });
    const editLabel = listingEditAction(listing.status);
    if (editLabel) actions.append(actionButton(editLabel, () => openListingEditor(listing), 'secondary'));
    if (['draft', 'changes_requested', 'rejected', 'paused'].includes(listing.status)) actions.append(actionButton('Submit for review', () => submitListing(listing.id), 'aqua'));
    if (listing.status === 'published') actions.append(actionButton('Pause', () => pauseListing(listing.id), 'secondary'));
    actions.append(actionButton('Delete', () => deleteListing(listing), 'danger'));
    body.append(createElement('tr', { children: [
      createElement('td', { children: [createElement('strong', { text: listing.title }), createElement('div', { text: listing.island }), listing.review_note && listing.status !== 'published' ? createElement('small', { className: 'listing-review-note', text: `Administrator note: ${listing.review_note}` }) : null] }),
      createElement('td', { text: listing.category.replaceAll('_', ' ') }),
      createElement('td', { text: formatMoney(listing.price, listing.currency) }),
      createElement('td', { children: [statusBadge(listing.status)] }),
      createElement('td', { children: [actions] })
    ] }));
  });
  const table = createElement('table', { children: [createElement('thead', { children: [createElement('tr', { children: ['Listing','Category','Price','Status','Actions'].map((text) => createElement('th', { text })) })] }), body] });
  container.append(createElement('div', { className: 'table-wrap', children: [table] }));
}

function actionButton(text, handler, style = 'secondary') {
  const button = createElement('button', { className: `button small ${style}`, text, attrs: { type: 'button' } });
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    setBusy(button, true, `${text}...`);
    try { await handler(button); }
    finally { if (button.isConnected) setBusy(button, false); }
  });
  return button;
}

function bindEvents() {
  if (dashboardEventsBound) return;
  dashboardEventsBound = true;
  document.getElementById('availableDate').min = new Date().toISOString().slice(0, 10);
  document.getElementById('newListingButton').addEventListener('click', () => openListingEditor());
  document.getElementById('resubmitBusinessButton').addEventListener('click', resubmitBusiness);
  document.getElementById('closeListingEditor').addEventListener('click', closeListingEditor);
  document.getElementById('cancelListingButton').addEventListener('click', closeListingEditor);
  document.getElementById('listingCategory').addEventListener('change', handleListingCategoryChange);
  ['listingPrice','listingCurrency','listingPriceUnit','listingGroupCapacity'].forEach((id)=>document.getElementById(id).addEventListener('input',updatePricingPreview));
  document.getElementById('listingPriceUnit').addEventListener('change',updatePricingControls);
  document.getElementById('availabilityListing').addEventListener('change', updateAvailabilityMode);
  document.getElementById('addRoomType').addEventListener('click', () => openRoomEditor());
  document.getElementById('saveRoomType').addEventListener('click', saveRoomTypeDraft);
  document.getElementById('cancelRoomType').addEventListener('click', closeRoomEditor);
  document.getElementById('clearAvailabilityButton').addEventListener('click', () => { availabilityForm.reset(); updateAvailabilityMode(); });
  document.getElementById('isBlocked').addEventListener('change', (event) => {
    if (event.target.checked) document.getElementById('remainingSpaces').value = 0;
  });
  document.getElementById('businessLogo').addEventListener('change', previewSelectedBusinessImages);
  document.getElementById('businessGallery').addEventListener('change', previewSelectedBusinessImages);
  document.getElementById('listingCover').addEventListener('change', selectListingCover);
  document.getElementById('listingGallery').addEventListener('change', selectListingGallery);
  businessForm.addEventListener('submit', saveBusiness);
  listingForm.addEventListener('submit', saveListing);
  availabilityForm.addEventListener('submit', saveAvailability);
  document.getElementById('promotionForm').addEventListener('submit', savePromotion);
}

function previewSelectedBusinessImages() {
  const files = [...document.getElementById('businessLogo').files, ...document.getElementById('businessGallery').files];
  const transfer = new DataTransfer(); files.forEach((file) => transfer.items.add(file));
  previewFiles(transfer, document.getElementById('businessImagePreviews'));
}

function selectListingCover(event) {
  try {
    state.listingEditor.coverFile = validateImages(event.target.files, { multiple: false })[0] || null;
    setFilePickerStatus('listingCoverStatus', state.listingEditor.coverFile
      ? `${state.listingEditor.coverFile.name} selected. Save the draft to upload it.`
      : 'No new cover selected.', Boolean(state.listingEditor.coverFile));
    renderListingMediaEditor().catch((error) => setFilePickerStatus('listingCoverStatus', error.message, false, true));
  } catch (error) {
    event.target.value = '';
    state.listingEditor.coverFile = null;
    setFilePickerStatus('listingCoverStatus', error.message, false, true);
  }
}

function selectListingGallery(event) {
  try {
    const nextOrder = Math.max(-1, ...[
      ...state.listingEditor.existingGallery,
      ...state.listingEditor.newGallery
    ].map((item) => Number(item.sort_order ?? -1))) + 1;
    const selected = validateImages(event.target.files);
    state.listingEditor.newGallery.push(...selected.map((file, index) => ({
      key: crypto.randomUUID(), file, caption: '', sort_order: nextOrder + index
    })));
    const count = state.listingEditor.newGallery.length;
    setFilePickerStatus('listingGalleryStatus', count
      ? `${count} new gallery image${count === 1 ? '' : 's'} selected. Save the draft to upload ${count === 1 ? 'it' : 'them'}.`
      : 'No new gallery images selected.', count > 0);
    renderListingMediaEditor().catch((error) => setFilePickerStatus('listingGalleryStatus', error.message, false, true));
  } catch (error) {
    event.target.value = '';
    setFilePickerStatus('listingGalleryStatus', error.message, false, true);
  }
}

function setFilePickerStatus(id, text, success = false, isError = false) {
  const status = document.getElementById(id);
  if (!status) return;
  status.textContent = text;
  status.className = `file-picker-status${isError ? ' error' : (success ? ' success' : '')}`;
}

function resetListingFilePickerStatus(listing = null, galleryCount = 0) {
  setFilePickerStatus('listingCoverStatus', listing?.cover_image_path
    ? 'Current cover retained. Choose a file only if you want to replace it.'
    : 'No new cover selected.');
  setFilePickerStatus('listingGalleryStatus', galleryCount
    ? `${galleryCount} current gallery image${galleryCount === 1 ? '' : 's'}. Choose more images to add.`
    : 'No new gallery images selected.');
}

async function saveBusiness(event) {
  event.preventDefault();
  const button = businessForm.querySelector('button[type="submit"]');
  const creating = !state.business;
  let businessCreated = false;

  if (creating && (!document.getElementById('businessAccuracyConfirmed').checked || !document.getElementById('businessTermsAccepted').checked)) {
    setMessage(message, 'Confirm the information is accurate and accept the platform terms before registering the business.', 'error');
    return;
  }

  try {
    setBusy(button, true, creating ? 'Submitting…' : 'Saving…');
    const client = requireSupabase();
    const logoFiles = validateImages(document.getElementById('businessLogo').files, { multiple: false });
    const galleryFiles = validateImages(document.getElementById('businessGallery').files);
    const payload = {
      contact_person_name: value('contactPersonName'), business_name: value('businessName'), registration_number: value('registrationNumber'),
      category: value('operatorCategory'), island: value('businessIsland'), email: value('businessEmail'), phone: value('businessPhone'),
      business_address: value('businessAddress'), website_url: nullable('websiteUrl'), description: value('businessDescription'),
      latitude: numberOrNull('businessLatitude'), longitude: numberOrNull('businessLongitude'),
      public_contact: document.getElementById('publicContact').checked,
      accuracy_confirmed: creating ? document.getElementById('businessAccuracyConfirmed').checked : true,
      terms_accepted: creating ? document.getElementById('businessTermsAccepted').checked : true
    };

    let result;
    if (creating) {
      result = await client.from('businesses').insert(payload).select().single();
    } else {
      if (logoFiles[0]) payload.logo_path = await uploadImage('business-logos', logoFiles[0], state.user.id, state.business.id);
      result = await client.from('businesses').update(payload).eq('id', state.business.id).select().single();
    }

    const { data, error } = result;
    if (error) throw error;
    state.business = data;
    businessCreated = creating;

    if (creating && logoFiles[0]) {
      const logoPath = await uploadImage('business-logos', logoFiles[0], state.user.id, state.business.id);
      const { data: updatedBusiness, error: logoError } = await client
        .from('businesses')
        .update({ logo_path: logoPath })
        .eq('id', state.business.id)
        .select()
        .single();
      if (logoError) throw logoError;
      state.business = updatedBusiness;
    }

    for (const [index, file] of galleryFiles.entries()) {
      const path = await uploadImage('business-gallery', file, state.user.id, state.business.id);
      const { error: imageError } = await client.from('business_images').insert({ business_id: state.business.id, storage_path: path, sort_order: index });
      if (imageError) throw imageError;
    }

    businessForm.reset();
    if (creating) await loadAll();
    else renderBusiness();
    setMessage(message, creating ? 'Business registration submitted for administrator review.' : 'Business profile saved.', 'success');
  } catch (error) {
    if (businessCreated) {
      await loadAll().catch(() => {});
      setMessage(message, `Business registration was submitted, but some media could not be saved: ${error.message}`, 'warning');
    } else {
      setMessage(message, error.message, 'error');
    }
  } finally {
    setBusy(button, false);
    button.textContent = state.business ? 'Save business profile' : 'Complete business registration';
  }
}

async function resubmitBusiness() {
  if (!confirmAction('Resubmit the updated business profile for administrator review?')) return;
  try {
    const { data, error } = await requireSupabase().rpc('submit_business', { p_business_id: state.business.id });
    if (error) throw error;
    state.business = data;
    renderBusiness();
    setMessage(message, 'Business profile resubmitted for review.', 'success');
  } catch (error) {
    setMessage(message, error.message, 'error');
  }
}

function toggleAccommodationFields() {
  const accommodation = value('listingCategory') === 'accommodation';
  const transfer = value('listingCategory') === 'transfer';
  document.getElementById('accommodationFields').hidden = !accommodation;
  document.getElementById('accommodationPolicyFields').hidden = !accommodation;
  document.getElementById('roomTypesSection').hidden = !accommodation;
  document.getElementById('transferRouteFields').hidden = !transfer;
  ['propertyType','roomType','maximumGuests','numberOfRooms'].forEach((id) => document.getElementById(id).required = accommodation);
  ['routeOrigin','routeDestination','routeDeparturePoint','routeArrivalPoint','routeDepartureTime','routeDuration','routeMaximumPassengers'].forEach((id) => document.getElementById(id).required = transfer);
}

function handleListingCategoryChange() {
  toggleAccommodationFields();
  updatePricingControls();
  if (value('listingCategory') === 'transfer' && !document.querySelector('[name="routeDay"]:checked')) resetTransferRouteFields();
  facilitiesSelector.switchCategory(value('listingCategory'));
}

function updatePricingControls(){
  const select=document.getElementById('listingPriceUnit');const current=select.value;const units=priceUnitsForCategory(value('listingCategory'));
  const original=state.listingEditor.original;const legacy=original&&!original.price_unit_confirmed&&original.price_unit===current;
  select.replaceChildren(new Option('Choose a price unit',''),...units.map((unit)=>new Option(priceUnitLabel(unit),unit)));
  if(units.includes(current))select.value=current;
  else if(legacy){select.append(new Option(`${priceUnitLabel(current)} — operator update required`,current));select.value=current;}
  else select.value='';
  const request=select.value==='price_on_request';const price=document.getElementById('listingPrice');price.required=!request;price.disabled=request;if(request)price.value='';
  const group=select.value==='per_group';document.getElementById('listingGroupCapacityField').hidden=!group;document.getElementById('listingGroupCapacity').required=group;
  updatePricingPreview();
}

function updatePricingPreview(){
  const unit=value('listingPriceUnit');const currency=value('listingCurrency')||'USD';const raw=document.getElementById('listingPrice').value;const preview=document.getElementById('listingPricePreview');
  if(!unit){preview.textContent='Choose an explicit price unit before saving.';preview.className='message warning';return;}
  if(unit==='price_on_request'){preview.textContent='Customers will see: Price on request';preview.className='message';return;}
  const amount=Number(raw);if(!Number.isFinite(amount)||amount<=0){preview.textContent='Enter a price greater than zero.';preview.className='message warning';return;}
  preview.textContent=`Customers will see: ${formatMoney(amount,currency)} ${priceUnitLabel(unit).toLowerCase()}`;preview.className='message';
}

async function openListingEditor(listing = null) {
  try {
    const client = requireSupabase();
    const { business } = await loadAuthenticatedListingBusiness(client);
    let editable = null;
    let originalStatus = null;

    if (listing) {
      editable = await loadOwnedListing(client, listing.id, business.id);
      if (!editable) throw new Error('This listing is no longer available to your account. Refresh the dashboard.');
      originalStatus = editable.status;

      if (editable.status === 'pending_review') {
        if (!confirmAction('Withdraw this pending listing for editing? It must be submitted and approved again.')) return;
        const { error } = await client.rpc('withdraw_listing_for_edit', { p_listing_id: editable.id });
        if (error) throw error;
        editable = await loadOwnedListing(client, editable.id, business.id);
      } else if (editable.status === 'published') {
        const warning = 'Saving changes will remove this listing from public view and return it for administrator review.';
        if (!confirmAction(warning)) return;
        await updateOwnedListingStatus(client, editable.id, business.id, 'paused');
        await updateOwnedListingStatus(client, editable.id, business.id, 'draft');
        editable = await loadOwnedListing(client, editable.id, business.id);
      } else if (['changes_requested', 'rejected', 'paused'].includes(editable.status)) {
        await updateOwnedListingStatus(client, editable.id, business.id, 'draft');
        editable = await loadOwnedListing(client, editable.id, business.id);
      } else if (editable.status !== 'draft') {
        throw new Error('This listing cannot be edited in its current status.');
      }
    }

    listingForm.reset();
    state.listingEditor = { original: editable, originalStatus, existingGallery: [], newGallery: [], coverFile: null, rooms: [], policy: null, route: null };
    resetListingFilePickerStatus(editable);
    document.getElementById('listingEditor').hidden = false;
    document.getElementById('listingEditorTitle').textContent = editable ? 'Edit service or listing' : 'Add service or listing';
    document.getElementById('listingId').value = editable?.id || '';
    document.getElementById('listingIsland').value = editable?.island || business.island;
    document.getElementById('listingCategory').value = editable?.category
      || OPERATOR_LISTING_DEFAULTS[state.business?.category]?.[0]
      || 'other';
    setMessage(document.getElementById('listingEditorWarning'));
    if (originalStatus === 'published') {
      setMessage(document.getElementById('listingEditorWarning'), 'Saving changes will remove this listing from public view and return it for administrator review.', 'warning');
    } else if (originalStatus === 'pending_review') {
      setMessage(document.getElementById('listingEditorWarning'), 'This listing was withdrawn to draft. Save your changes, then submit it for administrator review again.', 'warning');
    }

    const map = {
      listingTitle:'title', listingCategory:'category', listingPrice:'price', listingCurrency:'currency', listingPriceUnit:'price_unit',
      listingStartTime:'start_time', listingEndTime:'end_time', listingMaxCapacity:'max_capacity', listingAvailableSpaces:'available_spaces',
      listingSummary:'summary', listingDescription:'description', meetingPoint:'meeting_point', requirements:'requirements',
      cancellationInformation:'cancellation_information', propertyType:'property_type', roomType:'room_type', maximumGuests:'maximum_guests',
      numberOfRooms:'number_of_rooms', checkInTime:'check_in_time', checkOutTime:'check_out_time', pricePerNight:'price_per_night',listingGroupCapacity:'group_capacity',
      listingChildPrice:'child_price', listingTaxes:'taxes_amount', listingFees:'fees_amount', listingLatitude:'latitude', listingLongitude:'longitude'
    };
    if (editable) Object.entries(map).forEach(([id, key]) => document.getElementById(id).value = editable[key] ?? '');
    document.getElementById('includedItems').value = editable?.included_items?.join(', ') || '';
    document.getElementById('excludedItems').value = editable?.excluded_items?.join(', ') || '';
    toggleAccommodationFields();
    updatePricingControls();
    facilitiesSelector.load(value('listingCategory'), editable?.amenities || []);

    if (editable?.category === 'accommodation') await loadRoomTypesAndPolicy(client, editable.id);
    else renderRoomTypes();
    if (editable?.category === 'transfer') await loadTransferRoute(client, editable.id);
    else resetTransferRouteFields();

    if (editable) {
      const { data, error } = await client.from('listing_images').select('*').eq('listing_id', editable.id).order('sort_order');
      if (error) throw error;
      state.listingEditor.existingGallery = (data || []).map((item) => ({ ...item, removed: false }));
      resetListingFilePickerStatus(editable, state.listingEditor.existingGallery.length);
    }
    await renderListingMediaEditor();
    await loadListings();
    renderSummary();
    document.getElementById('listingEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setMessage(message, error.message, 'error');
  }
}

async function loadOwnedListing(client, listingId, businessId) {
  const { data, error } = await client.from('listings').select('*').eq('id', listingId).eq('business_id', businessId).maybeSingle();
  if (error) throw error;
  return data;
}

async function updateOwnedListingStatus(client, listingId, businessId, status) {
  const { error } = await client.from('listings').update({ status }).eq('id', listingId).eq('business_id', businessId);
  if (error) throw error;
  const listing = await loadOwnedListing(client, listingId, businessId);
  if (!listing || listing.status !== status) throw new Error(`The listing could not be changed to ${status.replaceAll('_', ' ')}.`);
  return listing;
}

function moveGalleryItem(key, direction) {
  const items = [...state.listingEditor.existingGallery, ...state.listingEditor.newGallery];
  if (moveGalleryItemByKey(items, key, direction)) renderListingMediaEditor();
}

function mediaControls(record) {
  const key = record.id || record.key;
  const caption = createElement('input', { attrs: { type: 'text', maxlength: '300', value: record.caption || '', 'aria-label': 'Image caption', placeholder: 'Image caption' } });
  caption.addEventListener('input', () => { record.caption = caption.value.trimStart(); });
  const controls = createElement('div', { className: 'media-controls', children: [
    caption,
    actionButton('Earlier', () => moveGalleryItem(key, -1)),
    actionButton('Later', () => moveGalleryItem(key, 1)),
    actionButton('Remove', () => { record.removed = true; renderListingMediaEditor(); }, 'danger')
  ] });
  return controls;
}

function listingMediaPicker(kind, listing, galleryCount = 0) {
  const isCover = kind === 'cover';
  const inputId = isCover ? 'listingCover' : 'listingGallery';
  const statusId = isCover ? 'listingCoverStatus' : 'listingGalleryStatus';
  const helpId = isCover ? 'listingCoverHelp' : 'listingGalleryHelp';
  const newGalleryCount = state.listingEditor.newGallery.filter((item) => !item.removed).length;
  let statusText;
  let selected = false;

  if (isCover && state.listingEditor.coverFile) {
    statusText = `${state.listingEditor.coverFile.name} selected. Save the draft to upload it.`;
    selected = true;
  } else if (isCover && listing?.cover_image_path) {
    statusText = 'Current cover retained. Choose another image only if you want to replace it.';
  } else if (isCover) {
    statusText = 'No cover selected yet. A cover image is required.';
  } else if (newGalleryCount) {
    statusText = `${newGalleryCount} new gallery image${newGalleryCount === 1 ? '' : 's'} selected. Save the draft to upload ${newGalleryCount === 1 ? 'it' : 'them'}.`;
    selected = true;
  } else if (galleryCount) {
    statusText = `${galleryCount} current gallery image${galleryCount === 1 ? '' : 's'}. You can add more below.`;
  } else {
    statusText = 'No gallery images selected. Gallery images are optional.';
  }

  const buttonText = isCover
    ? (state.listingEditor.coverFile || listing?.cover_image_path ? 'Replace cover image' : 'Choose cover image')
    : 'Add gallery images';
  const button = createElement('label', {
    className: 'button secondary file-picker-button', text: buttonText,
    attrs: { for: inputId }
  });
  const heading = createElement('div', { className: 'media-group-head', children: [
    createElement('h3', { text: isCover ? 'Cover image' : 'Gallery images' }), button
  ] });
  const status = createElement('span', {
    className: `file-picker-status${selected ? ' success' : ''}`, text: statusText,
    attrs: { id: statusId, role: 'status', 'aria-live': 'polite' }
  });
  const help = createElement('small', {
    text: isCover
      ? 'JPG, PNG, or WebP; maximum 5 MB. The image uploads when you save the draft.'
      : 'Select one or more JPG, PNG, or WebP images up to 5 MB each, then save the draft.',
    attrs: { id: helpId }
  });
  return [heading, status, help];
}

async function renderListingMediaEditor() {
  const container = document.getElementById('listingMediaEditor');
  clear(container);
  const listing = state.listingEditor.original;
  const visibleGallery = orderedGalleryItems([
    ...state.listingEditor.existingGallery,
    ...state.listingEditor.newGallery
  ]);
  const coverGroup = createElement('section', { className: 'media-group', children: listingMediaPicker('cover', listing) });
  if (state.listingEditor.coverFile) {
    const url = URL.createObjectURL(state.listingEditor.coverFile);
    const image = createElement('img', { attrs: { src: url, alt: `New cover preview for ${value('listingTitle') || 'listing'}` } });
    image.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
    coverGroup.append(createElement('div', { className: 'media-card cover', children: [image, createElement('strong', { text: 'New cover selected' })] }));
  } else if (listing?.cover_image_path) {
    const url = await signedImageUrl('listing-covers', listing.cover_image_path);
    if (url) coverGroup.append(createElement('div', { className: 'media-card cover', children: [createElement('img', { attrs: { src: url, alt: `${listing.title} current cover` } }), createElement('strong', { text: 'Current cover' })] }));
  } else {
    coverGroup.append(createElement('p', { className: 'help', text: 'A cover image is required before this listing can be saved.' }));
  }

  const galleryGroup = createElement('section', { className: 'media-group', children: listingMediaPicker('gallery', listing, visibleGallery.length) });
  for (const record of visibleGallery) {
    const card = createElement('div', { className: 'media-card' });
    if (record.file) {
      const url = URL.createObjectURL(record.file);
      const image = createElement('img', { attrs: { src: url, alt: `Preview of ${record.file.name}` } });
      image.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
      card.append(image);
    } else {
      const url = await signedImageUrl('listing-gallery', record.storage_path);
      if (url) card.append(createElement('img', { attrs: { src: url, alt: record.caption || 'Current listing gallery image' } }));
    }
    card.append(mediaControls(record));
    galleryGroup.append(card);
  }
  container.append(coverGroup, galleryGroup);
}

async function loadRoomTypesAndPolicy(client, listingId) {
  const [roomsResult, policyResult] = await Promise.all([
    client.from('accommodation_rooms').select('*').eq('listing_id', listingId).order('sort_order'),
    client.from('listing_policies').select('*').eq('listing_id', listingId).maybeSingle()
  ]);
  if (roomsResult.error) throw roomsResult.error;
  if (policyResult.error) throw policyResult.error;
  const rooms = roomsResult.data || [];
  let images = [];
  let ratePlans = [];
  if (rooms.length) {
    const [imageResult, rateResult] = await Promise.all([
      client.from('room_images').select('*').in('room_id', rooms.map((room) => room.id)).order('sort_order'),
      client.from('room_rate_plans').select('*').in('room_id', rooms.map((room) => room.id)).order('sort_order')
    ]);
    if (imageResult.error) throw imageResult.error;
    if (rateResult.error) throw rateResult.error;
    images = imageResult.data || [];
    ratePlans = rateResult.data || [];
  }
  state.listingEditor.rooms = rooms.map((room) => ({
    ...room, isNew: false, newPhotos: [], existingImages: images.filter((image) => image.room_id === room.id),
    ratePlans: ratePlans.filter((plan) => plan.room_id === room.id).map((plan) => ({ ...plan, isNew:false, removed:false }))
  }));
  state.listingEditor.policy = policyResult.data;
  const policy = policyResult.data || {};
  document.getElementById('cancellationType').value = policy.cancellation_type || 'legacy';
  document.getElementById('cancellationDeadline').value = policy.cancellation_deadline_hours ?? '';
  document.getElementById('cancellationPenalty').value = policy.cancellation_penalty || '';
  document.getElementById('checkInUntil').value = policy.check_in_until || '';
  document.getElementById('checkOutFrom').value = policy.check_out_from || '';
  document.getElementById('minimumChildAge').value = policy.minimum_child_age ?? '';
  document.getElementById('childPricingNotes').value = policy.child_pricing_notes || '';
  document.getElementById('petsPolicy').value = policy.pets_policy || '';
  document.getElementById('smokingPolicy').value = policy.smoking_policy || '';
  document.getElementById('paymentCondition').value = policy.payment_condition || '';
  document.getElementById('depositPercentage').value = policy.deposit_percentage ?? '';
  document.getElementById('childrenAllowed').checked = policy.children_allowed === true;
  renderRoomTypes();
}

function roomById(id) { return state.listingEditor.rooms.find((room) => room.id === id); }

function renderRoomTypes() {
  const container = document.getElementById('roomTypesList');
  clear(container);
  const rooms = [...state.listingEditor.rooms].sort((a, b) => a.sort_order - b.sort_order);
  if (!rooms.length) container.append(emptyState('No room types yet', 'Add the room options travelers can request for this accommodation.'));
  rooms.forEach((room, index) => {
    const actions = createElement('div', { className: 'table-actions', children: [
      actionButton('Edit', () => openRoomEditor(room)),
      actionButton('+ Rate plan', () => addRoomRatePlan(room)),
      actionButton('Earlier', () => moveRoom(room.id, -1)),
      actionButton('Later', () => moveRoom(room.id, 1)),
      actionButton(room.is_active ? 'Deactivate' : 'Activate', () => { room.is_active = !room.is_active; renderRoomTypes(); }, room.is_active ? 'danger' : 'secondary')
    ] });
    const planList = (room.ratePlans || []).filter((plan) => !plan.removed).map((plan) => createElement('span', { className: 'room-rate-plan', children: [createElement('span', { text: `${plan.name}: ${formatMoney(plan.nightly_price, room.currency)}` }), actionButton('Remove', () => removeRoomRatePlan(room, plan), 'danger')] }));
    container.append(createElement('article', { className: `room-summary${room.is_active ? '' : ' inactive'}`, children: [
      createElement('div', { children: [createElement('strong', { text: room.name }), createElement('span', { text: `${room.maximum_guests} guests · ${room.bed_configuration} · ${room.quantity} room${room.quantity === 1 ? '' : 's'}` }), createElement('span', { className: 'price', text: `${formatMoney(room.base_price, room.currency)} / night` }), ...planList] }),
      actions
    ] }));
    room.sort_order = index;
  });
}

function addRoomRatePlan(room) {
  const name = window.prompt('Rate plan name:', 'Breakfast included');
  if (!name?.trim()) return;
  const nightlyPrice = Number(window.prompt(`Nightly price in ${room.currency}:`, String(room.base_price)));
  if (!Number.isFinite(nightlyPrice) || nightlyPrice < 0) return setMessage(message, 'Enter a valid nightly price.', 'error');
  const mealPlan = window.prompt('Meal plan (optional):', '')?.trim() || null;
  const freeCancellation = window.confirm('Does this rate include free cancellation?');
  room.ratePlans ||= [];
  room.ratePlans.push({ id:crypto.randomUUID(), room_id:room.id, name:name.trim(), nightly_price:nightlyPrice, meal_plan:mealPlan, free_cancellation:freeCancellation, cancellation_deadline_hours:null, is_refundable:true, is_active:true, sort_order:room.ratePlans.length, isNew:true, removed:false });
  renderRoomTypes();
}

function removeRoomRatePlan(room, plan) {
  if (!confirmAction(`Remove the ${plan.name} rate plan?`)) return;
  if (plan.isNew) room.ratePlans = room.ratePlans.filter((item) => item.id !== plan.id);
  else plan.removed = true;
  renderRoomTypes();
}

function openRoomEditor(room = null) {
  const editor = document.getElementById('roomTypeEditor');
  editor.hidden = false;
  const record = room || {};
  const map = {
    roomId: 'id', roomName: 'name', roomMaxGuests: 'maximum_guests', roomAdultCapacity: 'adult_capacity',
    roomChildCapacity: 'child_capacity', roomQuantity: 'quantity', roomBasePrice: 'base_price', roomCurrency: 'currency',
    roomBeds: 'bed_configuration', roomView: 'view_type', roomSize: 'room_size_sqm', roomDescription: 'description'
  };
  Object.entries(map).forEach(([id, key]) => { document.getElementById(id).value = record[key] ?? (id === 'roomCurrency' ? 'USD' : ''); });
  document.getElementById('roomAmenities').value = record.amenities?.join(', ') || '';
  document.getElementById('roomPhotos').value = '';
  editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeRoomEditor() {
  document.getElementById('roomTypeEditor').hidden = true;
  ['roomId','roomName','roomMaxGuests','roomAdultCapacity','roomChildCapacity','roomQuantity','roomBasePrice','roomBeds','roomView','roomSize','roomDescription','roomAmenities','roomPhotos'].forEach((id) => { document.getElementById(id).value = ''; });
  document.getElementById('roomCurrency').value = 'USD';
}

function saveRoomTypeDraft() {
  try {
    const maximumGuests = Number(value('roomMaxGuests'));
    const adultCapacity = Number(value('roomAdultCapacity'));
    const childCapacity = Number(value('roomChildCapacity') || 0);
    const quantity = Number(value('roomQuantity'));
    const basePrice = Number(value('roomBasePrice'));
    if (!value('roomName') || !value('roomBeds')) throw new Error('Room name and bed configuration are required.');
    if (![maximumGuests, adultCapacity, quantity].every((number) => Number.isInteger(number) && number > 0)) throw new Error('Room capacities and quantity must be positive whole numbers.');
    if (!Number.isInteger(childCapacity) || childCapacity < 0 || adultCapacity + childCapacity > maximumGuests) throw new Error('Adult and child capacity cannot exceed maximum guests.');
    if (!Number.isFinite(basePrice) || basePrice < 0) throw new Error('Enter a valid nightly room price.');
    const photos = validateImages(document.getElementById('roomPhotos').files);
    const id = value('roomId') || crypto.randomUUID();
    const existing = roomById(id);
    const record = {
      ...(existing || {}), id, name: value('roomName'), description: nullable('roomDescription'), maximum_guests: maximumGuests,
      adult_capacity: adultCapacity, child_capacity: childCapacity, bed_configuration: value('roomBeds'),
      room_size_sqm: numberOrNull('roomSize'), view_type: nullable('roomView'), quantity, base_price: basePrice,
      currency: value('roomCurrency'), amenities: commaList(value('roomAmenities')), is_active: existing?.is_active ?? true,
      sort_order: existing?.sort_order ?? state.listingEditor.rooms.length, isNew: existing?.isNew ?? true,
      existingImages: existing?.existingImages || [], newPhotos: [...(existing?.newPhotos || []), ...photos],
      ratePlans: existing?.ratePlans || []
    };
    if (existing) Object.assign(existing, record); else state.listingEditor.rooms.push(record);
    closeRoomEditor(); renderRoomTypes();
  } catch (error) { setMessage(message, error.message, 'error'); }
}

function moveRoom(id, direction) {
  const rooms = [...state.listingEditor.rooms].sort((a, b) => a.sort_order - b.sort_order);
  const index = rooms.findIndex((room) => room.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= rooms.length) return;
  [rooms[index], rooms[target]] = [rooms[target], rooms[index]];
  rooms.forEach((room, order) => { room.sort_order = order; });
  renderRoomTypes();
}

async function persistRoomTypes(client, listingId, userId) {
  const warnings = [];
  for (const room of state.listingEditor.rooms) {
    const payload = {
      listing_id: listingId, name: room.name, description: room.description, maximum_guests: room.maximum_guests,
      adult_capacity: room.adult_capacity, child_capacity: room.child_capacity, bed_configuration: room.bed_configuration,
      room_size_sqm: room.room_size_sqm, view_type: room.view_type, quantity: room.quantity, base_price: room.base_price,
      currency: room.currency, amenities: room.amenities, is_active: room.is_active, sort_order: room.sort_order
    };
    const result = room.isNew
      ? await client.from('accommodation_rooms').insert({ ...payload, id: room.id })
      : await client.from('accommodation_rooms').update(payload).eq('id', room.id).eq('listing_id', listingId);
    if (result.error) throw result.error;
    room.isNew = false;
    for (const [index, file] of room.newPhotos.entries()) {
      try {
        const storagePath = await uploadImage('room-gallery', file, userId, room.id);
        const { error } = await client.from('room_images').insert({ room_id: room.id, storage_path: storagePath, caption: file.name, sort_order: room.existingImages.length + index });
        if (error) throw error;
      } catch (error) { warnings.push(`${room.name}: a room photo could not be saved (${error.message}).`); }
    }
    room.newPhotos = [];
    for (const plan of room.ratePlans || []) {
      if (plan.removed) {
        if (!plan.isNew) {
          const removed = await client.from('room_rate_plans').delete().eq('id', plan.id).eq('room_id', room.id);
          if (removed.error) throw removed.error;
        }
        continue;
      }
      const ratePayload = { room_id:room.id, name:plan.name, nightly_price:plan.nightly_price, meal_plan:plan.meal_plan, free_cancellation:plan.free_cancellation, cancellation_deadline_hours:plan.cancellation_deadline_hours ?? null, is_refundable:plan.is_refundable, is_active:plan.is_active, sort_order:plan.sort_order };
      const savedRate = plan.isNew
        ? await client.from('room_rate_plans').insert({ ...ratePayload, id:plan.id })
        : await client.from('room_rate_plans').update(ratePayload).eq('id', plan.id).eq('room_id', room.id);
      if (savedRate.error) throw savedRate.error;
      plan.isNew = false;
    }
    room.ratePlans = (room.ratePlans || []).filter((plan) => !plan.removed);
  }
  return warnings;
}

async function persistListingPolicy(client, listingId) {
  const depositPercentage = numberOrNull('depositPercentage');
  if (value('paymentCondition') === 'deposit_required' && (!Number.isFinite(depositPercentage) || depositPercentage <= 0 || depositPercentage >= 100)) throw new Error('Enter a deposit percentage greater than 0 and less than 100.');
  const payload = {
    listing_id: listingId, cancellation_type: value('cancellationType'), cancellation_deadline_hours: numberOrNull('cancellationDeadline'), cancellation_penalty:nullable('cancellationPenalty'),
    check_in_from: nullable('checkInTime'), check_in_until:nullable('checkInUntil'), check_out_from:nullable('checkOutFrom'), check_out_until: nullable('checkOutTime'), children_allowed: document.getElementById('childrenAllowed').checked,
    minimum_child_age:numberOrNull('minimumChildAge'), child_pricing_notes:nullable('childPricingNotes'),
    pets_policy: nullable('petsPolicy'), smoking_policy: nullable('smokingPolicy'), payment_condition: nullable('paymentCondition'), deposit_percentage: value('paymentCondition') === 'deposit_required' ? depositPercentage : null
  };
  const { error } = await client.from('listing_policies').upsert(payload, { onConflict: 'listing_id' });
  if (error) throw error;
}

function resetTransferRouteFields() {
  ['routeOrigin','routeDestination','routeDeparturePoint','routeArrivalPoint','routeDepartureTime','routeArrivalTime','routeDuration','routeAdultPrice','routeChildPrice','routeInfantPrice','routePrivatePrice','routeMaximumPassengers','routeLuggage'].forEach((id) => { document.getElementById(id).value = ''; });
  document.getElementById('routeTransportType').value = 'speedboat';
  document.getElementById('routeServiceType').value = 'shared';
  document.getElementById('routePricingModel').value = 'per_person';
  document.getElementById('routeCurrency').value = value('listingCurrency') || 'USD';
  document.getElementById('routeMinimumPassengers').value = '1';
  document.querySelectorAll('[name="routeDay"]').forEach((checkbox) => { checkbox.checked = true; });
}

async function loadTransferRoute(client, listingId) {
  resetTransferRouteFields();
  const { data, error } = await client.from('transfer_route_details').select('*').eq('listing_id', listingId).maybeSingle();
  if (error) {
    if (['PGRST205','42P01'].includes(error.code)) {
      setMessage(document.getElementById('listingEditorWarning'), 'Directional route fields are ready, but the transfer route migration must be deployed before they can be saved.', 'warning');
      return;
    }
    throw error;
  }
  if (!data) return;
  state.listingEditor.route = data;
  const map = { routeOrigin:'origin_name',routeDestination:'destination_name',routeDeparturePoint:'departure_point',routeArrivalPoint:'arrival_point',routeTransportType:'transport_type',routeServiceType:'service_type',routeDepartureTime:'departure_time',routeArrivalTime:'arrival_time',routeDuration:'estimated_duration_minutes',routePricingModel:'pricing_model',routeAdultPrice:'adult_price',routeChildPrice:'child_price',routeInfantPrice:'infant_price',routePrivatePrice:'private_price',routeCurrency:'currency',routeMinimumPassengers:'minimum_passengers',routeMaximumPassengers:'maximum_passengers',routeLuggage:'luggage_information' };
  Object.entries(map).forEach(([id,key]) => { document.getElementById(id).value = data[key] ?? ''; });
  document.getElementById('routeDepartureTime').value = data.departure_time?.slice(0,5) || '';
  document.getElementById('routeArrivalTime').value = data.arrival_time?.slice(0,5) || '';
  const days = new Set((data.operating_days || []).map(Number));
  document.querySelectorAll('[name="routeDay"]').forEach((checkbox) => { checkbox.checked = days.has(Number(checkbox.value)); });
}

function transferRoutePayload(listingId) {
  const operatingDays = [...document.querySelectorAll('[name="routeDay"]:checked')].map((checkbox) => Number(checkbox.value));
  const origin = value('routeOrigin'); const destination = value('routeDestination');
  if (!operatingDays.length) throw new Error('Select at least one operating day for this transfer.');
  if (origin.localeCompare(destination, undefined, { sensitivity:'accent' }) === 0) throw new Error('Transfer origin and destination must be different.');
  const pricingModel = value('routePricingModel');
  if (pricingModel === 'per_person' && numberOrNull('routeAdultPrice') === null) throw new Error('Enter an adult price for per-person transfer pricing.');
  if (pricingModel === 'private_fixed' && numberOrNull('routePrivatePrice') === null) throw new Error('Enter a private service price for fixed transfer pricing.');
  const minimum = Number(value('routeMinimumPassengers')); const maximum = Number(value('routeMaximumPassengers'));
  if (maximum < minimum) throw new Error('Maximum passengers cannot be below the minimum.');
  const originLocation=state.transportLocations.find((item)=>[item.name,item.slug,...(item.aliases||[])].some((candidate)=>normalizeLocationKey(candidate)===normalizeLocationKey(origin)));
  const destinationLocation=state.transportLocations.find((item)=>[item.name,item.slug,...(item.aliases||[])].some((candidate)=>normalizeLocationKey(candidate)===normalizeLocationKey(destination)));
  return { listing_id:listingId,origin_name:originLocation?.name||origin,destination_name:destinationLocation?.name||destination,origin_location_id:originLocation?.id||null,destination_location_id:destinationLocation?.id||null,departure_point:value('routeDeparturePoint'),arrival_point:value('routeArrivalPoint'),transport_type:value('routeTransportType'),service_type:value('routeServiceType'),departure_time:value('routeDepartureTime'),arrival_time:nullable('routeArrivalTime'),estimated_duration_minutes:Number(value('routeDuration')),operating_days:operatingDays,adult_price:numberOrNull('routeAdultPrice'),child_price:numberOrNull('routeChildPrice'),infant_price:numberOrNull('routeInfantPrice'),private_price:numberOrNull('routePrivatePrice'),currency:value('routeCurrency'),pricing_model:pricingModel,minimum_passengers:minimum,maximum_passengers:maximum,luggage_information:nullable('routeLuggage'),is_active:true };
}

async function persistTransferRoute(client, listingId) {
  const payload = transferRoutePayload(listingId);
  const { error } = await client.from('transfer_route_details').upsert(payload, { onConflict:'listing_id' });
  if (error) throw error;
}

function closeListingEditor() {
  document.getElementById('listingEditor').hidden = true;
  listingForm.reset();
  state.listingEditor = { original: null, originalStatus: null, existingGallery: [], newGallery: [], coverFile: null, rooms: [], policy: null, route: null };
  resetListingFilePickerStatus();
  document.getElementById('listingMediaEditor').replaceChildren();
  document.getElementById('facilitiesSelector').replaceChildren();
  setMessage(document.getElementById('listingEditorWarning'));
}

async function saveListing(event) {
  event.preventDefault();
  const button = listingForm.querySelector('button[type="submit"]');
  const capacity = Number(value('listingMaxCapacity'));
  const spaces = Number(value('listingAvailableSpaces'));
  const priceUnit=value('listingPriceUnit');
  const priceOnRequest=priceUnit==='price_on_request';
  const price=priceOnRequest?null:Number(value('listingPrice'));
  try {
    validateListingFields({
      price,
      priceOnRequest,
      maxCapacity: capacity,
      availableSpaces: spaces,
      startTime: nullable('listingStartTime'),
      endTime: nullable('listingEndTime'),
      hasCover: Boolean(state.listingEditor.coverFile || state.listingEditor.original?.cover_image_path)
    });
  } catch (error) {
    setMessage(message, error.message, 'error');
    return;
  }
  if(!priceUnit){setMessage(message,'Choose an explicit price unit for this listing.','error');return;}
  if(priceUnit==='per_group'&&!numberOrNull('listingGroupCapacity')){setMessage(message,'Enter the number of people covered by one group price.','error');return;}
  if (value('listingCategory') === 'transfer') {
    try { transferRoutePayload('00000000-0000-0000-0000-000000000000'); }
    catch (error) { setMessage(message, error.message, 'error'); return; }
  }

  let savedDraftId = null;
  let newlyInserted = false;
  try {
    state.listingSubmissionBusy = true;
    setBusy(button, true, 'Saving…');
    updateListingSubmissionAvailability();
    const client = requireSupabase();
    const { user, business } = await loadAuthenticatedListingBusiness(client);
    const accommodation = value('listingCategory') === 'accommodation';
    const payload = bindListingToBusiness({
      title: value('listingTitle'), category: value('listingCategory'), island: value('listingIsland'),
      summary: value('listingSummary'), description: value('listingDescription'), price,
      currency: value('listingCurrency'), price_unit: priceUnit,price_unit_confirmed:!(state.listingEditor.original?.price_unit_confirmed===false&&state.listingEditor.original?.price_unit===priceUnit),group_capacity:priceUnit==='per_group'?numberOrNull('listingGroupCapacity'):null,start_time: nullable('listingStartTime'), end_time: nullable('listingEndTime'),
      max_capacity: capacity, available_spaces: spaces, included_items: commaList(value('includedItems')), excluded_items: commaList(value('excludedItems')),
      meeting_point: nullable('meetingPoint'), requirements: nullable('requirements'), cancellation_information: nullable('cancellationInformation'),
      latitude: numberOrNull('listingLatitude'), longitude: numberOrNull('listingLongitude'), child_price: numberOrNull('listingChildPrice'),
      taxes_amount: numberOrNull('listingTaxes') || 0, fees_amount: numberOrNull('listingFees') || 0,
      property_type: accommodation ? value('propertyType') : null, room_type: accommodation ? value('roomType') : null,
      maximum_guests: accommodation ? numberOrNull('maximumGuests') : null, number_of_rooms: accommodation ? numberOrNull('numberOfRooms') : null,
      amenities: facilitiesSelector.collect(), check_in_time: accommodation ? nullable('checkInTime') : null,
      check_out_time: accommodation ? nullable('checkOutTime') : null, price_per_night: accommodation ? numberOrNull('pricePerNight') : null
    }, user, business);
    validateListingSubmissionContext(user, business);
    const existingId = value('listingId');
    let saved;

    if (existingId) {
      const current = await loadOwnedListing(client, existingId, business.id);
      if (!current || current.status !== 'draft') throw new Error('This listing is no longer an editable draft. Refresh the dashboard.');
      const { business_id: ignoredBusinessId, ...editablePayload } = payload;
      void ignoredBusinessId;
      const { error } = await client.from('listings').update(editablePayload).eq('id', existingId).eq('business_id', business.id);
      if (error) throw error;
      saved = await loadOwnedListing(client, existingId, business.id);
      if (!saved) throw new Error('The updated draft could not be loaded. Refresh the dashboard.');
      savedDraftId = existingId;
    } else {
      const id = createListingId();
      const { error } = await client.from('listings').insert({ ...payload, id, status: 'draft' });
      if (error) throw error;
      savedDraftId = id;
      newlyInserted = true;
      saved = assertInsertedDraft(await loadOwnedListing(client, id, business.id), id, business.id);
      document.getElementById('listingId').value = id;
    }

    const warnings = await persistListingMedia(client, saved, user.id);
    if (accommodation) {
      warnings.push(...await persistRoomTypes(client, saved.id, user.id));
      await persistListingPolicy(client, saved.id);
    }
    if (value('listingCategory') === 'transfer') await persistTransferRoute(client, saved.id);
    await loadListings();
    await loadAvailability();
    renderSummary();
    closeListingEditor();
    setMessage(message, warnings.length ? `Listing draft saved. ${warnings.join(' ')}` : 'Listing draft saved.', warnings.length ? 'warning' : 'success');
  } catch (error) {
    if (savedDraftId) {
      await loadListings().catch(() => {});
      renderSummary();
      setMessage(message, `The listing draft ${newlyInserted ? 'was created' : 'details were saved'} and is recoverable, but its media could not be completed: ${error.message}`, 'warning');
    } else {
      setMessage(message, error.message, 'error');
    }
  }
  finally {
    state.listingSubmissionBusy = false;
    setBusy(button, false);
    updateListingSubmissionAvailability();
  }
}

async function removeUploadedOrDescribe(bucket, path, originalError) {
  try {
    await removeImage(bucket, path);
    return originalError.message;
  } catch (cleanupError) {
    return `${originalError.message} Cleanup also failed for ${path}: ${cleanupError.message}`;
  }
}

async function persistListingMedia(client, listing, userId) {
  const warnings = [];
  const oldCoverPath = listing.cover_image_path;
  if (state.listingEditor.coverFile) {
    const newPath = await uploadImage('listing-covers', state.listingEditor.coverFile, userId, listing.id);
    const { error } = await client.from('listings').update({ cover_image_path: newPath }).eq('id', listing.id).eq('business_id', listing.business_id);
    if (error) throw new Error(await removeUploadedOrDescribe('listing-covers', newPath, error));
    if (oldCoverPath && oldCoverPath !== newPath) {
      try { await removeImage('listing-covers', oldCoverPath); }
      catch (cleanupError) { warnings.push(`The new cover is saved, but the old cover object could not be removed: ${cleanupError.message}`); }
    }
  }

  const orderedVisible = orderedGalleryItems([
    ...state.listingEditor.existingGallery,
    ...state.listingEditor.newGallery
  ]);
  for (const [sortOrder, item] of orderedVisible.entries()) {
    if (item.file) {
      const path = await uploadImage('listing-gallery', item.file, userId, listing.id);
      const { error } = await client.from('listing_images').insert({ listing_id: listing.id, storage_path: path, caption: item.caption?.trim() || null, sort_order: sortOrder });
      if (error) throw new Error(await removeUploadedOrDescribe('listing-gallery', path, error));
    } else {
      const { error } = await client.from('listing_images').update({ caption: item.caption?.trim() || null, sort_order: sortOrder }).eq('id', item.id).eq('listing_id', listing.id);
      if (error) throw error;
    }
  }

  for (const item of state.listingEditor.existingGallery.filter((record) => record.removed)) {
    const { error } = await client.from('listing_images').delete().eq('id', item.id).eq('listing_id', listing.id);
    if (error) throw error;
    try { await removeImage('listing-gallery', item.storage_path); }
    catch (cleanupError) { warnings.push(`A removed gallery object could not be deleted from Storage: ${cleanupError.message}`); }
  }
  return warnings;
}

async function submitListing(id) {
  if (!confirmAction('Submit this listing for administrator review?')) return;
  try {
    const client = requireSupabase();
    const { business } = await loadAuthenticatedListingBusiness(client);
    const listing = await loadOwnedListing(client, id, business.id);
    if (!listing || !['draft', 'changes_requested', 'rejected', 'paused'].includes(listing.status)) throw new Error('Only an owned editable listing can be submitted for review.');
    if (!listing.cover_image_path) throw new Error('Add and save a cover image before submitting this listing.');
    const { error } = await client.rpc('submit_listing', { p_listing_id: listing.id });
    if (error) throw error;
    const submitted = await loadOwnedListing(client, listing.id, business.id);
    if (!submitted || submitted.status !== 'pending_review') throw new Error('The listing was not moved to pending review.');
    await loadListings(); renderSummary(); setMessage(message, 'Listing submitted for administrator review.', 'success');
  }
  catch (error) { setMessage(message, error.message, 'error'); }
}

async function pauseListing(id) {
  if (!confirmAction('Pause this published listing? It will disappear from the public website.')) return;
  try {
    const client = requireSupabase();
    const { business } = await loadAuthenticatedListingBusiness(client);
    const listing = await loadOwnedListing(client, id, business.id);
    if (!listing || listing.status !== 'published') throw new Error('Only your published listing can be paused.');
    await updateOwnedListingStatus(client, id, business.id, 'paused');
    await loadListings(); await loadAvailability(); renderSummary(); setMessage(message, 'Listing paused and removed from public view.', 'success');
  }
  catch (error) { setMessage(message, error.message, 'error'); }
}

async function deleteListing(listing) {
  if (!confirmAction(`Delete “${listing.title}”? This also removes its availability records.`)) return;
  try {
    const client = requireSupabase();
    const { business } = await loadAuthenticatedListingBusiness(client);
    const current = await loadOwnedListing(client, listing.id, business.id);
    if (!current) throw new Error('This listing is not available to your account.');
    const { data: gallery, error: galleryError } = await client.from('listing_images').select('storage_path').eq('listing_id', current.id);
    if (galleryError) throw galleryError;
    const { error } = await client.from('listings').delete().eq('id', current.id).eq('business_id', business.id);
    if (error) throw error;
    const cleanupFailures = [];
    if (current.cover_image_path) {
      try { await removeImage('listing-covers', current.cover_image_path); }
      catch (cleanupError) { cleanupFailures.push(cleanupError.message); }
    }
    for (const image of gallery || []) {
      try { await removeImage('listing-gallery', image.storage_path); }
      catch (cleanupError) { cleanupFailures.push(cleanupError.message); }
    }
    await loadListings(); await loadAvailability(); renderSummary();
    setMessage(message, cleanupFailures.length ? `Listing deleted, but some Storage objects could not be removed: ${cleanupFailures.join(' ')}` : 'Listing deleted.', cleanupFailures.length ? 'warning' : 'success');
  }
  catch (error) { setMessage(message, error.message, 'error'); }
}

async function loadAvailability() {
  if (!state.listings.length) { state.availability = []; state.roomAvailability = []; return renderAvailability(); }
  const ids = state.listings.map((listing) => listing.id);
  const client = requireSupabase();
  const listingResult = await client.from('availability').select('*').in('listing_id', ids).gte('available_date', new Date().toISOString().slice(0,10)).order('available_date').order('start_time');
  if (listingResult.error) throw listingResult.error;
  let roomData = [];
  if (state.rooms.length) {
    const roomResult = await client.from('room_availability').select('*').in('room_id', state.rooms.map((room) => room.id)).gte('available_date', new Date().toISOString().slice(0,10)).order('available_date');
    if (roomResult.error) throw roomResult.error;
    roomData = roomResult.data || [];
  }
  state.availability = listingResult.data || []; state.roomAvailability = roomData; renderAvailability();
}

function renderAvailability() {
  const container = document.getElementById('availabilityTable'); clear(container);
  if (!state.availability.length && !state.roomAvailability.length) return container.append(emptyState('No upcoming availability', 'Choose a listing and add its first available date, room inventory, or session.'));
  const names = new Map(state.listings.map((listing) => [listing.id, listing.title]));
  const roomMap = new Map(state.rooms.map((room) => [room.id, room]));
  const body = createElement('tbody');
  state.availability.forEach((slot) => body.append(createElement('tr', { children: [
    createElement('td', { text: names.get(slot.listing_id) || 'Listing' }), createElement('td', { text: formatDate(`${slot.available_date}T00:00:00`) }),
    createElement('td', { text: slot.start_time || 'All day' }), createElement('td', { text: slot.is_blocked ? 'Blocked' : `${slot.remaining_spaces} / ${slot.max_capacity}` }),
    createElement('td', { children: [createElement('div', { className: 'table-actions', children: [actionButton('Edit', () => editAvailability(slot)), actionButton('Delete', () => deleteAvailability(slot.id), 'danger')] })] })
  ] })));
  state.roomAvailability.forEach((slot) => {
    const room = roomMap.get(slot.room_id);
    body.append(createElement('tr', { children: [
      createElement('td', { text: `${names.get(room?.listing_id) || 'Accommodation'} · ${room?.name || 'Room'}` }),
      createElement('td', { text: formatDate(`${slot.available_date}T00:00:00`) }), createElement('td', { text: 'Nightly inventory' }),
      createElement('td', { text: slot.is_blocked ? 'Blocked' : `${slot.available_quantity} / ${slot.total_quantity}` }),
      createElement('td', { children: [createElement('div', { className: 'table-actions', children: [actionButton('Edit', () => editRoomAvailability(slot)), actionButton('Delete', () => deleteAvailability(slot.id, 'room'), 'danger')] })] })
    ] }));
  });
  container.append(createElement('div', { className: 'table-wrap', children: [createElement('table', { children: [createElement('thead', { children: [createElement('tr', { children: ['Listing','Date','Time','Spaces','Actions'].map((text) => createElement('th', { text })) })] }), body] })] }));
}

function editAvailability(slot) {
  document.getElementById('availabilityId').value = slot.id; document.getElementById('availabilityListing').value = slot.listing_id;
  updateAvailabilityMode();
  document.getElementById('availabilityKind').value = 'listing';
  document.getElementById('availableDate').value = slot.available_date; document.getElementById('availabilityStartTime').value = slot.start_time || '';
  document.getElementById('availabilityEndTime').value = slot.end_time || ''; document.getElementById('availabilityCapacity').value = slot.max_capacity;
  document.getElementById('remainingSpaces').value = slot.remaining_spaces; document.getElementById('isBlocked').checked = slot.is_blocked;
  availabilityForm.scrollIntoView({ behavior: 'smooth' });
}

function editRoomAvailability(slot) {
  const room = state.rooms.find((item) => item.id === slot.room_id);
  if (!room) return;
  document.getElementById('availabilityId').value = slot.id;
  document.getElementById('availabilityKind').value = 'room';
  document.getElementById('availabilityListing').value = room.listing_id;
  updateAvailabilityMode();
  document.getElementById('availabilityRoom').value = room.id;
  document.getElementById('availableDate').value = slot.available_date;
  document.getElementById('availabilityCapacity').value = slot.total_quantity;
  document.getElementById('remainingSpaces').value = slot.available_quantity;
  document.getElementById('roomPriceOverride').value = slot.price_override ?? '';
  document.getElementById('isBlocked').checked = slot.is_blocked;
  availabilityForm.scrollIntoView({ behavior: 'smooth' });
}

function updateAvailabilityMode() {
  const listing = state.listings.find((item) => item.id === value('availabilityListing'));
  const accommodation = listing?.category === 'accommodation';
  document.getElementById('availabilityRoomField').hidden = !accommodation;
  document.getElementById('roomPriceOverrideField').hidden = !accommodation;
  document.querySelectorAll('.session-time-field').forEach((field) => { field.hidden = accommodation; });
  const roomSelect = document.getElementById('availabilityRoom');
  clear(roomSelect);
  state.rooms.filter((room) => room.listing_id === listing?.id && room.is_active).forEach((room) => roomSelect.append(createElement('option', { text: room.name, attrs: { value: room.id } })));
  document.getElementById('availabilityKind').value = accommodation ? 'room' : 'listing';
}

async function saveAvailability(event) {
  event.preventDefault(); const button = availabilityForm.querySelector('button[type="submit"]');
  const max = Number(value('availabilityCapacity')); const blocked = document.getElementById('isBlocked').checked; const remaining = blocked ? 0 : Number(value('remainingSpaces'));
  try { validateAvailabilityFields({ maxCapacity:max, remainingSpaces:remaining, startTime:nullable('availabilityStartTime'), endTime:nullable('availabilityEndTime') }); }
  catch (error) { setMessage(message, error.message, 'error'); return; }
  try {
    setBusy(button, true, 'Saving…');
    const id = value('availabilityId');
    const roomMode = value('availabilityKind') === 'room';
    if (roomMode && !value('availabilityRoom')) throw new Error('Add and select a room type before setting room inventory.');
    const payload = roomMode
      ? { room_id:value('availabilityRoom'), available_date:value('availableDate'), total_quantity:max, available_quantity:remaining, price_override:numberOrNull('roomPriceOverride'), is_blocked:blocked }
      : { listing_id:value('availabilityListing'), available_date:value('availableDate'), start_time:nullable('availabilityStartTime'), end_time:nullable('availabilityEndTime'), max_capacity:max, remaining_spaces:remaining, is_blocked:blocked };
    const table = roomMode ? 'room_availability' : 'availability';
    const query = id ? requireSupabase().from(table).update(payload).eq('id', id) : requireSupabase().from(table).insert(payload);
    const { error } = await query; if (error) throw error;
    availabilityForm.reset(); updateAvailabilityMode(); await loadAvailability(); renderSummary(); setMessage(message, roomMode ? 'Room inventory saved.' : 'Availability saved.', 'success');
  }
  catch (error) { setMessage(message, error.message, 'error'); } finally { setBusy(button, false); }
}

async function deleteAvailability(id, kind = 'listing') { if (!confirmAction('Delete this availability entry?')) return; try { const { error } = await requireSupabase().from(kind === 'room' ? 'room_availability' : 'availability').delete().eq('id', id); if (error) throw error; await loadAvailability(); renderSummary(); } catch (error) { setMessage(message, error.message, 'error'); } }

async function loadEnquiries() {
  const { data, error } = await requireSupabase().from('booking_enquiries').select('*, listings(title)').eq('operator_id', state.user.id).order('created_at', { ascending: false });
  if (error) throw error; state.enquiries = data || [];
  const payments=await requireSupabase().from('payment_references').select('*').eq('operator_id',state.user.id).order('created_at',{ascending:false});
  state.paymentReferences=payments.error&&['PGRST204','PGRST205','42P01','42703'].includes(payments.error.code)?[]:(payments.data||[]);if(payments.error&&!['PGRST204','PGRST205','42P01','42703'].includes(payments.error.code))throw payments.error;renderEnquiries();
}

function renderEnquiries() {
  const container = document.getElementById('enquiriesTable'); clear(container);
  if (!state.enquiries.length) return container.append(emptyState('No booking enquiries', 'New traveller requests will appear here.'));
  const body = createElement('tbody');
  state.enquiries.forEach((enquiry) => {
    const actions = createElement('div', { className: 'table-actions' });
    const quotePending=enquiry.quote_status==='availability_confirmation_required';
    if(quotePending&&['new','changes_requested'].includes(enquiry.status))actions.append(actionButton('Confirm price',()=>quoteEnquiry(enquiry),'aqua'));
    if (enquiry.status === 'new'&&!quotePending) actions.append(actionButton('Accept', () => updateEnquiry(enquiry.id, 'accepted'), 'aqua'));
    if (enquiry.status === 'new') actions.append(actionButton('Request changes', () => updateEnquiry(enquiry.id, 'changes_requested')), actionButton('Decline', () => updateEnquiry(enquiry.id, 'declined'), 'danger'));
    if (['accepted', 'changes_requested'].includes(enquiry.status)) actions.append(actionButton('Confirm', () => updateEnquiry(enquiry.id, 'confirmed'), 'aqua'), actionButton('Cancel', () => updateEnquiry(enquiry.id, 'cancelled'), 'danger'));
    if (enquiry.status === 'confirmed') actions.append(actionButton('Complete', () => updateEnquiry(enquiry.id, 'completed'), 'aqua'), actionButton('No-show', () => updateEnquiry(enquiry.id, 'no_show')), actionButton('Cancel', () => updateEnquiry(enquiry.id, 'cancelled'), 'danger'));
    if (enquiry.traveler_id) actions.append(actionButton('Message', () => sendEnquiryMessage(enquiry.id)));
    const stay = enquiry.check_out_date ? `${formatDate(`${enquiry.requested_date}T00:00:00`)} – ${formatDate(`${enquiry.check_out_date}T00:00:00`)} · ${enquiry.rooms_requested} room(s)` : `${formatDate(`${enquiry.requested_date}T00:00:00`)} · ${enquiry.requested_time || 'Time flexible'} · ${enquiry.guest_count} guest(s)`;
    const refs=state.paymentReferences.filter((item)=>item.booking_id===enquiry.id);refs.forEach((ref)=>{if(ref.proof_path)actions.append(actionButton('View proof',()=>viewPaymentProof(ref)));if(ref.status==='submitted')actions.append(actionButton('Confirm payment',()=>reviewPayment(ref,'confirmed'),'aqua'),actionButton('Reject reference',()=>reviewPayment(ref,'rejected'),'danger'));});
    const payment=quotePending?'Price confirmation required':Number(enquiry.deposit_amount)>0?`${formatMoney(enquiry.deposit_amount,enquiry.quote_currency)} deposit · ${String(enquiry.payment_status||'unpaid').replaceAll('_',' ')}`:'Pay operator / no deposit';
    body.append(createElement('tr', { children: [createElement('td', { children: [createElement('strong', { text: enquiry.guest_full_name }), createElement('div', { text: enquiry.booking_reference || 'Legacy enquiry' }), createElement('div', { text: enquiry.guest_email }), createElement('div', { text: enquiry.guest_phone })] }), createElement('td', { text: enquiry.listings?.title || 'Listing' }), createElement('td', { children:[createElement('div',{text:`${stay}${enquiry.quoted_total!=null?` · ${formatMoney(enquiry.quoted_total,enquiry.quote_currency)}`:''}`}),createElement('small',{text:payment}),...refs.map((ref)=>createElement('small',{text:`${ref.payment_reference} · ${formatMoney(ref.amount,ref.currency)} · ${ref.status}`}))] }), createElement('td', { children: [statusBadge(enquiry.status)] }), createElement('td', { children: [actions] })] }));
  });
  container.append(createElement('div', { className: 'table-wrap', children: [createElement('table', { children: [createElement('thead', { children: [createElement('tr', { children: ['Guest','Listing','Request','Status','Actions'].map((text) => createElement('th', { text })) })] }), body] })] }));
}

async function viewPaymentProof(reference){const {data,error}=await requireSupabase().storage.from('payment-proofs').createSignedUrl(reference.proof_path,300);if(error)throw error;window.open(data.signedUrl,'_blank','noopener,noreferrer');}
async function reviewPayment(reference,status){if(!confirmAction(`${status==='confirmed'?'Confirm that you received':'Reject'} this direct payment reference?`))return;const note=window.prompt('Optional note to the traveler:','')??'';const {error}=await requireSupabase().from('payment_references').update({status,operator_note:note.trim()||null,confirmed_at:status==='confirmed'?new Date().toISOString():null}).eq('id',reference.id);if(error)throw error;await loadEnquiries();setMessage(message,`Payment reference ${status}.`,'success');}

async function quoteEnquiry(enquiry){const subtotal=Number(window.prompt(`Confirmed subtotal in ${enquiry.quote_currency}:`,enquiry.quoted_subtotal??''));if(!Number.isFinite(subtotal)||subtotal<0)throw new Error('Enter a valid subtotal of zero or greater.');const taxes=Number(window.prompt('Taxes:',String(enquiry.taxes_amount||0)));const fees=Number(window.prompt('Fees:',String(enquiry.fees_amount||0)));if(!Number.isFinite(taxes)||taxes<0||!Number.isFinite(fees)||fees<0)throw new Error('Taxes and fees must be zero or greater.');const response=window.prompt('Optional quote note for the traveler:','')??'';const {error}=await requireSupabase().rpc('operator_quote_booking',{p_enquiry_id:enquiry.id,p_subtotal:subtotal,p_taxes:taxes,p_fees:fees,p_response:response.trim()||null});if(error)throw error;await loadEnquiries();setMessage(message,'Price confirmed. You can now accept the booking request.','success');}

async function updateEnquiry(id, status) {
  if (!confirmAction(`Change this enquiry to ${status.replaceAll('_', ' ')}?`)) return;
  const response = window.prompt('Optional response for the traveler:', '') ?? '';
  try {
    const { error } = await requireSupabase().rpc('operator_update_booking', { p_enquiry_id:id, p_status:status, p_response:response.trim() || null });
    if (error) throw error;
    await loadEnquiries(); renderSummary(); setMessage(message, `Booking request changed to ${status.replaceAll('_', ' ')}.`, 'success');
  } catch (error) { setMessage(message, error.message, 'error'); }
}

async function sendEnquiryMessage(enquiryId) {
  const body = window.prompt('Message to the traveler:', '');
  if (!body?.trim()) return;
  const { error } = await requireSupabase().from('enquiry_messages').insert({ enquiry_id: enquiryId, sender_id: state.user.id, body: body.trim() });
  if (error) throw error;
  setMessage(message, 'Message sent.', 'success');
}

async function loadReviewsAndOffers() {
  const listingIds = state.listings.map((listing) => listing.id);
  const promotionSelect = document.getElementById('promotionListing'); clear(promotionSelect);
  state.listings.forEach((listing) => promotionSelect.append(createElement('option', { text: listing.title, attrs: { value: listing.id } })));
  if (!listingIds.length) {
    state.reviews = []; state.reviewResponses = []; state.promotions = [];
    renderReviewsAndOffers(); return;
  }
  const client = requireSupabase();
  const [reviewResult, promotionResult] = await Promise.all([
    client.from('reviews').select('*').in('listing_id', listingIds).order('created_at', { ascending: false }),
    client.from('promotions').select('*').in('listing_id', listingIds).order('valid_until', { ascending: false })
  ]);
  if (reviewResult.error) throw reviewResult.error;
  if (promotionResult.error) throw promotionResult.error;
  state.reviews = reviewResult.data || []; state.promotions = promotionResult.data || []; state.reviewResponses = [];
  if (state.reviews.length) {
    const responseResult = await client.from('review_responses').select('*').in('review_id', state.reviews.map((review) => review.id));
    if (responseResult.error) throw responseResult.error;
    state.reviewResponses = responseResult.data || [];
  }
  renderReviewsAndOffers();
}

function renderReviewsAndOffers() {
  const reviewContainer = document.getElementById('operatorReviewsTable'); clear(reviewContainer);
  if (!state.reviews.length) reviewContainer.append(emptyState('No verified reviews', 'Only completed reservations can produce a traveler review.'));
  else {
    const body = createElement('tbody');
    state.reviews.forEach((review) => {
      const response = state.reviewResponses.find((item) => item.review_id === review.id);
      const actions = createElement('div', { className: 'table-actions', children: [
        actionButton(response ? 'Edit response' : 'Respond', () => respondToReview(review, response), 'secondary'),
        review.status === 'published' ? actionButton('Report', () => reportReview(review.id), 'danger') : null
      ] });
      body.append(createElement('tr', { children: [
        createElement('td', { children: [createElement('strong', { text: review.display_name }), createElement('div', { text: review.title || review.body.slice(0, 90) }), response ? createElement('small', { text: `Your response: ${response.body}` }) : null] }),
        createElement('td', { text: state.listings.find((listing) => listing.id === review.listing_id)?.title || 'Listing' }),
        createElement('td', { text: `${Number(review.overall_rating).toFixed(1)} / 10` }), createElement('td', { children: [statusBadge(review.status)] }), createElement('td', { children: [actions] })
      ] }));
    });
    reviewContainer.append(createElement('div', { className: 'table-wrap', children: [createElement('table', { children: [createElement('thead', { children: [createElement('tr', { children: ['Review','Listing','Score','Status','Actions'].map((text) => createElement('th', { text })) })] }), body] })] }));
  }

  const promotionContainer = document.getElementById('operatorPromotionsTable'); clear(promotionContainer);
  if (!state.promotions.length) promotionContainer.append(emptyState('No promotions', 'Create a real date-bound offer above.'));
  else {
    const body = createElement('tbody');
    state.promotions.forEach((promotion) => {
      const actions = createElement('div', { className: 'table-actions', children: [
        actionButton(promotion.is_active ? 'Deactivate' : 'Activate', () => togglePromotion(promotion)),
        actionButton('Delete', () => deletePromotion(promotion.id), 'danger')
      ] });
      body.append(createElement('tr', { children: [createElement('td', { children: [createElement('strong', { text: promotion.name }), createElement('div', { text: state.listings.find((listing) => listing.id === promotion.listing_id)?.title || 'Listing' })] }), createElement('td', { text: promotion.discount_type === 'percent' ? `${promotion.discount_value}%` : formatMoney(promotion.discount_value, state.listings.find((listing) => listing.id === promotion.listing_id)?.currency || 'USD') }), createElement('td', { text: `${formatDate(`${promotion.valid_from}T00:00:00`)} - ${formatDate(`${promotion.valid_until}T00:00:00`)}` }), createElement('td', { children: [statusBadge(promotion.is_active ? 'active' : 'inactive')] }), createElement('td', { children: [actions] })] }));
    });
    promotionContainer.append(createElement('div', { className: 'table-wrap', children: [createElement('table', { children: [createElement('thead', { children: [createElement('tr', { children: ['Offer','Discount','Dates','Status','Actions'].map((text) => createElement('th', { text })) })] }), body] })] }));
  }
}

async function respondToReview(review, response) {
  try {
    const body = window.prompt('Your public response:', response?.body || '');
    if (!body?.trim()) return;
    const { error } = await requireSupabase().from('review_responses').upsert({ review_id:review.id, operator_id:state.user.id, body:body.trim() }, { onConflict:'review_id' });
    if (error) throw error;
    await loadReviewsAndOffers(); setMessage(message, 'Review response saved.', 'success');
  } catch (error) { setMessage(message, error.message, 'error'); }
}

async function reportReview(reviewId) {
  if (!confirmAction('Report this review to an administrator for moderation?')) return;
  try {
    const { error } = await requireSupabase().rpc('operator_report_review', { p_review_id:reviewId });
    if (error) throw error;
    await loadReviewsAndOffers(); setMessage(message, 'Review reported for administrator moderation.', 'success');
  } catch (error) { setMessage(message, error.message, 'error'); }
}

async function savePromotion(event) {
  event.preventDefault(); const button = event.currentTarget.querySelector('button[type="submit"]');
  try {
    const listingId = value('promotionListing'); const discountValue = Number(value('promotionValue'));
    if (!state.listings.some((listing) => listing.id === listingId)) throw new Error('Choose one of your listings.');
    if (!Number.isFinite(discountValue) || discountValue <= 0 || (value('promotionType') === 'percent' && discountValue > 100)) throw new Error('Enter a valid discount.');
    if (value('promotionUntil') < value('promotionFrom')) throw new Error('The promotion end date must not be before its start date.');
    setBusy(button, true, 'Creating...');
    const { error } = await requireSupabase().from('promotions').insert({ listing_id:listingId, name:value('promotionName'), description:nullable('promotionDescription'), discount_type:value('promotionType'), discount_value:discountValue, valid_from:value('promotionFrom'), valid_until:value('promotionUntil'), minimum_nights:numberOrNull('promotionMinimumNights'), is_active:true });
    if (error) throw error;
    event.currentTarget.reset(); await loadReviewsAndOffers(); setMessage(message, 'Promotion created.', 'success');
  } catch (error) { setMessage(message, error.message, 'error'); }
  finally { setBusy(button, false); }
}

async function togglePromotion(promotion) {
  try {
    const { error } = await requireSupabase().from('promotions').update({ is_active:!promotion.is_active }).eq('id', promotion.id);
    if (error) throw error; await loadReviewsAndOffers();
  } catch (error) { setMessage(message, error.message, 'error'); }
}

async function deletePromotion(id) {
  if (!confirmAction('Delete this promotion?')) return;
  try {
    const { error } = await requireSupabase().from('promotions').delete().eq('id', id);
    if (error) throw error; await loadReviewsAndOffers();
  } catch (error) { setMessage(message, error.message, 'error'); }
}

function renderSummary() {
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('newEnquiriesCount').textContent = state.enquiries.filter((item) => item.status === 'new').length;
  document.getElementById('upcomingBookingsCount').textContent = state.enquiries.filter((item) => ['accepted','confirmed'].includes(item.status) && item.requested_date >= today).length;
  document.getElementById('activeListingsCount').textContent = state.listings.filter((item) => item.status === 'published' && item.is_active).length;
  document.getElementById('pendingListingsCount').textContent = state.listings.filter((item) => item.status === 'pending_review').length;
  document.getElementById('availableSpacesCount').textContent = state.availability.filter((item) => !item.is_blocked).reduce((sum, item) => sum + item.remaining_spaces, 0)
    + state.roomAvailability.filter((item) => !item.is_blocked).reduce((sum, item) => sum + item.available_quantity, 0);
}

init();
