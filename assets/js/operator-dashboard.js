import { requireSupabase, showConfigurationNotice } from './supabase-client.js';
import { logout, requireOperator } from './auth.js';
import { bindListingToBusiness, validateListingSubmissionContext } from './listing-ownership.js';
import { removeImage, signedImageUrl, uploadImage, validateImages } from './storage.js';
import { bindTabs, clear, commaList, confirmAction, createElement, emptyState, formatDate, formatMoney, previewFiles, setBusy, setMessage, statusBadge } from './ui.js';
import { assertInsertedDraft, createListingId, listingEditAction, moveGalleryItemByKey, orderedGalleryItems, validateAvailabilityFields, validateListingFields } from './listing-workflow.js';

const state = {
  user: null,
  profile: null,
  business: null,
  businessLookupComplete: false,
  listingContextValidated: false,
  listingSubmissionBusy: false,
  listings: [],
  availability: [],
  enquiries: [],
  listingEditor: {
    original: null,
    originalStatus: null,
    existingGallery: [],
    newGallery: [],
    coverFile: null
  }
};
const message = document.getElementById('dashboardMessage');
const businessForm = document.getElementById('businessForm');
const listingForm = document.getElementById('listingForm');
const availabilityForm = document.getElementById('availabilityForm');

bindTabs();
document.getElementById('logoutButton').addEventListener('click', () => logout().catch((error) => setMessage(message, error.message, 'error')));

function value(id) { return document.getElementById(id).value.trim(); }
function nullable(id) { return value(id) || null; }
function numberOrNull(id) { const raw = value(id); return raw === '' ? null : Number(raw); }

async function init() {
  if (showConfigurationNotice(document.getElementById('configMessage'))) return;
  try {
    state.user = await requireOperator();
    await loadAll();
    bindEvents();
  } catch (error) {
    if (!error.message.includes('required')) setMessage(message, error.message, 'error');
  }
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
    renderListings();
    renderAvailability();
    renderEnquiries();
    renderSummary();
    setMessage(message);
    return;
  }

  await Promise.all([loadListings(), loadEnquiries()]);
  await loadAvailability();
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
  renderListings();
  const select = document.getElementById('availabilityListing');
  clear(select);
  state.listings.forEach((listing) => select.append(createElement('option', { text: listing.title, attrs: { value: listing.id } })));
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
  document.getElementById('availableDate').min = new Date().toISOString().slice(0, 10);
  document.getElementById('newListingButton').addEventListener('click', () => openListingEditor());
  document.getElementById('resubmitBusinessButton').addEventListener('click', resubmitBusiness);
  document.getElementById('closeListingEditor').addEventListener('click', closeListingEditor);
  document.getElementById('cancelListingButton').addEventListener('click', closeListingEditor);
  document.getElementById('listingCategory').addEventListener('change', toggleAccommodationFields);
  document.getElementById('clearAvailabilityButton').addEventListener('click', () => availabilityForm.reset());
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
}

function previewSelectedBusinessImages() {
  const files = [...document.getElementById('businessLogo').files, ...document.getElementById('businessGallery').files];
  const transfer = new DataTransfer(); files.forEach((file) => transfer.items.add(file));
  previewFiles(transfer, document.getElementById('businessImagePreviews'));
}

function selectListingCover(event) {
  try {
    state.listingEditor.coverFile = validateImages(event.target.files, { multiple: false })[0] || null;
    renderListingMediaEditor();
  } catch (error) {
    event.target.value = '';
    state.listingEditor.coverFile = null;
    setMessage(message, error.message, 'error');
  }
}

function selectListingGallery(event) {
  try {
    const nextOrder = Math.max(-1, ...[
      ...state.listingEditor.existingGallery,
      ...state.listingEditor.newGallery
    ].map((item) => Number(item.sort_order ?? -1))) + 1;
    state.listingEditor.newGallery = validateImages(event.target.files).map((file, index) => ({
      key: crypto.randomUUID(), file, caption: '', sort_order: nextOrder + index
    }));
    renderListingMediaEditor();
  } catch (error) {
    event.target.value = '';
    state.listingEditor.newGallery = [];
    setMessage(message, error.message, 'error');
  }
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
  document.getElementById('accommodationFields').hidden = !accommodation;
  ['propertyType','roomType','maximumGuests','numberOfRooms'].forEach((id) => document.getElementById(id).required = accommodation);
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
    state.listingEditor = { original: editable, originalStatus, existingGallery: [], newGallery: [], coverFile: null };
    document.getElementById('listingEditor').hidden = false;
    document.getElementById('listingEditorTitle').textContent = editable ? 'Edit service or listing' : 'Add service or listing';
    document.getElementById('listingId').value = editable?.id || '';
    document.getElementById('listingIsland').value = editable?.island || business.island;
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
      numberOfRooms:'number_of_rooms', checkInTime:'check_in_time', checkOutTime:'check_out_time', pricePerNight:'price_per_night'
    };
    if (editable) Object.entries(map).forEach(([id, key]) => document.getElementById(id).value = editable[key] ?? '');
    document.getElementById('includedItems').value = editable?.included_items?.join(', ') || '';
    document.getElementById('excludedItems').value = editable?.excluded_items?.join(', ') || '';
    document.getElementById('amenities').value = editable?.amenities?.join(', ') || '';
    toggleAccommodationFields();

    if (editable) {
      const { data, error } = await client.from('listing_images').select('*').eq('listing_id', editable.id).order('sort_order');
      if (error) throw error;
      state.listingEditor.existingGallery = (data || []).map((item) => ({ ...item, removed: false }));
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

async function renderListingMediaEditor() {
  const container = document.getElementById('listingMediaEditor');
  clear(container);
  const listing = state.listingEditor.original;
  const coverGroup = createElement('section', { className: 'media-group', children: [createElement('h3', { text: 'Cover image' })] });
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

  const galleryGroup = createElement('section', { className: 'media-group', children: [createElement('h3', { text: 'Gallery images' })] });
  const visibleGallery = orderedGalleryItems([
    ...state.listingEditor.existingGallery,
    ...state.listingEditor.newGallery
  ]);
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
  if (!visibleGallery.length) galleryGroup.append(createElement('p', { className: 'help', text: 'Gallery images are optional.' }));
  container.append(coverGroup, galleryGroup);
}

function closeListingEditor() {
  document.getElementById('listingEditor').hidden = true;
  listingForm.reset();
  state.listingEditor = { original: null, originalStatus: null, existingGallery: [], newGallery: [], coverFile: null };
  document.getElementById('listingMediaEditor').replaceChildren();
  setMessage(document.getElementById('listingEditorWarning'));
}

async function saveListing(event) {
  event.preventDefault();
  const button = listingForm.querySelector('button[type="submit"]');
  const capacity = Number(value('listingMaxCapacity'));
  const spaces = Number(value('listingAvailableSpaces'));
  const price = Number(value('listingPrice'));
  try {
    validateListingFields({
      price,
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
      currency: value('listingCurrency'), price_unit: value('listingPriceUnit'), start_time: nullable('listingStartTime'), end_time: nullable('listingEndTime'),
      max_capacity: capacity, available_spaces: spaces, included_items: commaList(value('includedItems')), excluded_items: commaList(value('excludedItems')),
      meeting_point: nullable('meetingPoint'), requirements: nullable('requirements'), cancellation_information: nullable('cancellationInformation'),
      property_type: accommodation ? value('propertyType') : null, room_type: accommodation ? value('roomType') : null,
      maximum_guests: accommodation ? numberOrNull('maximumGuests') : null, number_of_rooms: accommodation ? numberOrNull('numberOfRooms') : null,
      amenities: accommodation ? commaList(value('amenities')) : [], check_in_time: accommodation ? nullable('checkInTime') : null,
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
  if (!state.listings.length) { state.availability = []; return renderAvailability(); }
  const ids = state.listings.map((listing) => listing.id);
  const { data, error } = await requireSupabase().from('availability').select('*').in('listing_id', ids).gte('available_date', new Date().toISOString().slice(0,10)).order('available_date').order('start_time');
  if (error) throw error;
  state.availability = data || []; renderAvailability();
}

function renderAvailability() {
  const container = document.getElementById('availabilityTable'); clear(container);
  if (!state.availability.length) return container.append(emptyState('No upcoming availability', 'Choose a listing and add its first available date or time.'));
  const names = new Map(state.listings.map((listing) => [listing.id, listing.title]));
  const body = createElement('tbody');
  state.availability.forEach((slot) => body.append(createElement('tr', { children: [
    createElement('td', { text: names.get(slot.listing_id) || 'Listing' }), createElement('td', { text: formatDate(`${slot.available_date}T00:00:00`) }),
    createElement('td', { text: slot.start_time || 'All day' }), createElement('td', { text: slot.is_blocked ? 'Blocked' : `${slot.remaining_spaces} / ${slot.max_capacity}` }),
    createElement('td', { children: [createElement('div', { className: 'table-actions', children: [actionButton('Edit', () => editAvailability(slot)), actionButton('Delete', () => deleteAvailability(slot.id), 'danger')] })] })
  ] })));
  container.append(createElement('div', { className: 'table-wrap', children: [createElement('table', { children: [createElement('thead', { children: [createElement('tr', { children: ['Listing','Date','Time','Spaces','Actions'].map((text) => createElement('th', { text })) })] }), body] })] }));
}

function editAvailability(slot) {
  document.getElementById('availabilityId').value = slot.id; document.getElementById('availabilityListing').value = slot.listing_id;
  document.getElementById('availableDate').value = slot.available_date; document.getElementById('availabilityStartTime').value = slot.start_time || '';
  document.getElementById('availabilityEndTime').value = slot.end_time || ''; document.getElementById('availabilityCapacity').value = slot.max_capacity;
  document.getElementById('remainingSpaces').value = slot.remaining_spaces; document.getElementById('isBlocked').checked = slot.is_blocked;
  availabilityForm.scrollIntoView({ behavior: 'smooth' });
}

async function saveAvailability(event) {
  event.preventDefault(); const button = availabilityForm.querySelector('button[type="submit"]');
  const max = Number(value('availabilityCapacity')); const blocked = document.getElementById('isBlocked').checked; const remaining = blocked ? 0 : Number(value('remainingSpaces'));
  try { validateAvailabilityFields({ maxCapacity:max, remainingSpaces:remaining, startTime:nullable('availabilityStartTime'), endTime:nullable('availabilityEndTime') }); }
  catch (error) { setMessage(message, error.message, 'error'); return; }
  try { setBusy(button, true, 'Saving…'); const payload = { listing_id:value('availabilityListing'), available_date:value('availableDate'), start_time:nullable('availabilityStartTime'), end_time:nullable('availabilityEndTime'), max_capacity:max, remaining_spaces:remaining, is_blocked:blocked }; const id = value('availabilityId'); const query = id ? requireSupabase().from('availability').update(payload).eq('id', id) : requireSupabase().from('availability').insert(payload); const { error } = await query; if (error) throw error; availabilityForm.reset(); await loadAvailability(); renderSummary(); setMessage(message, 'Availability saved.', 'success'); }
  catch (error) { setMessage(message, error.message, 'error'); } finally { setBusy(button, false); }
}

async function deleteAvailability(id) { if (!confirmAction('Delete this availability entry?')) return; try { const { error } = await requireSupabase().from('availability').delete().eq('id', id); if (error) throw error; await loadAvailability(); renderSummary(); } catch (error) { setMessage(message, error.message, 'error'); } }

async function loadEnquiries() {
  const { data, error } = await requireSupabase().from('booking_enquiries').select('*, listings(title)').eq('operator_id', state.user.id).order('created_at', { ascending: false });
  if (error) throw error; state.enquiries = data || []; renderEnquiries();
}

function renderEnquiries() {
  const container = document.getElementById('enquiriesTable'); clear(container);
  if (!state.enquiries.length) return container.append(emptyState('No booking enquiries', 'New traveller requests will appear here.'));
  const body = createElement('tbody');
  state.enquiries.forEach((enquiry) => {
    const actions = createElement('div', { className: 'table-actions' });
    if (enquiry.status === 'new') { actions.append(actionButton('Accept', () => updateEnquiry(enquiry.id, 'accepted'), 'aqua'), actionButton('Decline', () => updateEnquiry(enquiry.id, 'declined'), 'danger')); }
    if (enquiry.status === 'accepted') actions.append(actionButton('Complete', () => updateEnquiry(enquiry.id, 'completed'), 'aqua'), actionButton('Cancel', () => updateEnquiry(enquiry.id, 'cancelled'), 'danger'));
    body.append(createElement('tr', { children: [createElement('td', { children: [createElement('strong', { text: enquiry.guest_full_name }), createElement('div', { text: enquiry.guest_email }), createElement('div', { text: enquiry.guest_phone })] }), createElement('td', { text: enquiry.listings?.title || 'Listing' }), createElement('td', { text: `${formatDate(`${enquiry.requested_date}T00:00:00`)} · ${enquiry.requested_time || 'Time flexible'} · ${enquiry.guest_count} guest(s)` }), createElement('td', { children: [statusBadge(enquiry.status)] }), createElement('td', { children: [actions] })] }));
  });
  container.append(createElement('div', { className: 'table-wrap', children: [createElement('table', { children: [createElement('thead', { children: [createElement('tr', { children: ['Guest','Listing','Request','Status','Actions'].map((text) => createElement('th', { text })) })] }), body] })] }));
}

async function updateEnquiry(id, status) { if (!confirmAction(`Change this enquiry to ${status}?`)) return; try { const { error } = await requireSupabase().from('booking_enquiries').update({ status }).eq('id', id); if (error) throw error; await loadEnquiries(); renderSummary(); setMessage(message, 'Enquiry updated.', 'success'); } catch (error) { setMessage(message, error.message, 'error'); } }

function renderSummary() {
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('newEnquiriesCount').textContent = state.enquiries.filter((item) => item.status === 'new').length;
  document.getElementById('upcomingBookingsCount').textContent = state.enquiries.filter((item) => item.status === 'accepted' && item.requested_date >= today).length;
  document.getElementById('activeListingsCount').textContent = state.listings.filter((item) => item.status === 'published' && item.is_active).length;
  document.getElementById('pendingListingsCount').textContent = state.listings.filter((item) => item.status === 'pending_review').length;
  document.getElementById('availableSpacesCount').textContent = state.availability.filter((item) => !item.is_blocked).reduce((sum, item) => sum + item.remaining_spaces, 0);
}

init();
