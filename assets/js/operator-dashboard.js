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
import { ALL_PRICE_UNITS, COMPONENT_PRESETS, calculatePriceBreakdown, componentMath, priceUnitLabel, priceUnitsForCategory } from './pricing.js';
import { normalizeActivityTypes } from './planner-catalogs.js';
import { LEGACY_OPERATOR_CATEGORY, normalizeServiceCategories } from './service-catalogs.js';

const state = {
  user: null,
  profile: null,
  businesses: [],
  business: null,
  serviceCategories: [],
  businessServices: [],
  activityTypes: [],
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
    route: null,
    packageDetails: null,
    packageTransfers: [],
    servicePickupLocations: [],
    priceComponents: []
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
let businessWorkflowStep=0;
let listingWorkflowStep=0;

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
  const [businessResult, profileResult,serviceResult,businessServiceResult,activityResult] = await Promise.all([
    client.from('businesses').select('*').eq('owner_id', state.user.id).order('created_at'),
    client.from('profiles').select('full_name,phone').eq('id', state.user.id).maybeSingle(),
    client.from('service_categories').select('id,slug,name,listing_categories,sort_order').eq('is_active',true).order('sort_order'),
    client.from('business_service_categories').select('business_id,service_category_id'),
    client.from('public_activity_types').select('id,slug,name,listing_categories,sort_order').order('sort_order')
  ]);
  if (businessResult.error) throw businessResult.error;
  if (profileResult.error) throw profileResult.error;
  state.businesses = businessResult.data || [];
  state.serviceCategories=normalizeServiceCategories(serviceResult.error?[]:(serviceResult.data||[]));
  state.businessServices=businessServiceResult.error?[]:(businessServiceResult.data||[]);
  state.activityTypes=normalizeActivityTypes(activityResult.error?[]:(activityResult.data||[]));
  const requested=localStorage.getItem('baa_operator_business_id');
  if(state.business&&!state.businesses.some((item)=>item.id===state.business.id))state.business=null;
  state.business=state.businesses.find((item)=>item.id===(state.business?.id||requested))||state.businesses[0]||null;
  state.profile = profileResult.data;
  state.businessLookupComplete = true;
  try {
    validateListingSubmissionContext(state.user, state.business);
    state.listingContextValidated = true;
  } catch {
    state.listingContextValidated = false;
  }
  renderBusinessWorkspace();
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

function selectedBusinessServiceSlugs(businessId=state.business?.id){
  const ids=new Set(state.businessServices.filter((item)=>item.business_id===businessId).map((item)=>item.service_category_id));
  const selected=state.serviceCategories.filter((item)=>ids.has(item.id)).map((item)=>item.slug);if(selected.length)return selected;
  const legacy=state.businesses.find((item)=>item.id===businessId)?.category;const fallback=Object.entries(LEGACY_OPERATOR_CATEGORY).find(([,category])=>category===legacy)?.[0];return fallback?[fallback]:[];
}

function renderBusinessWorkspace(){
  const select=document.getElementById('businessSwitcher');clear(select);
  state.businesses.forEach((business)=>select.append(createElement('option',{text:`${business.business_name} — ${business.status.replaceAll('_',' ')}`,attrs:{value:business.id}})));
  select.disabled=!state.businesses.length;select.value=state.business?.id||'';
  const container=document.getElementById('myBusinessesList');clear(container);
  if(!state.businesses.length)container.append(emptyState('No business registered','Complete the business registration form below.'));
  state.businesses.forEach((business)=>{
    const services=selectedBusinessServiceSlugs(business.id).map((slug)=>state.serviceCategories.find((item)=>item.slug===slug)?.name).filter(Boolean);
    const manage=actionButton('Manage Business',()=>selectBusiness(business.id),'secondary');
    const add=actionButton('Add Listing',async()=>{await selectBusiness(business.id);if(state.listingContextValidated)await openListingEditor();},'aqua');add.disabled=business.status!=='verified'||!business.is_active;
    container.append(createElement('article',{className:`business-management-card${state.business?.id===business.id?' selected':''}`,children:[createElement('div',{children:[createElement('strong',{text:business.business_name}),statusBadge(business.status),createElement('span',{text:services.join(' · ')||'Service categories pending'})]}),createElement('div',{className:'form-actions',children:[manage,add,business.status==='verified'&&business.is_active?createElement('a',{className:'button small secondary',text:'View Public Page',attrs:{href:`business.html?id=${encodeURIComponent(business.id)}`}}):null]})]}));
  });
}

async function selectBusiness(id){
  const business=state.businesses.find((item)=>item.id===id);if(!business)return;
  state.business=business;localStorage.setItem('baa_operator_business_id',id);closeListingEditor();renderBusinessWorkspace();renderBusiness();
  await Promise.all([loadListings(),loadEnquiries()]);await loadAvailability();await loadReviewsAndOffers();renderSummary();
}

function renderServiceChoices(selected=[]){
  const container=document.getElementById('operatorServiceChoices');clear(container);
  state.serviceCategories.forEach((service)=>{const input=createElement('input',{attrs:{type:'checkbox',name:'operatorService',value:service.slug}});input.checked=selected.includes(service.slug);container.append(createElement('label',{className:'checkbox',children:[input,createElement('span',{text:service.name})]}));});
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
    renderServiceChoices();
    document.getElementById('businessReviewNote').hidden = true;
    document.getElementById('businessImagePreviews').replaceChildren();
    document.getElementById('resubmitBusinessButton').hidden = true;
    updateListingSubmissionAvailability();
    submitButton.textContent = 'Complete business registration';
    setMessage(document.getElementById('listingPermissionMessage'), 'Complete business registration and wait for administrator verification before creating listings.', 'warning');
    showBusinessWorkflowStep(0);
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
  renderServiceChoices(selectedBusinessServiceSlugs());
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
  showBusinessWorkflowStep(0);
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
      .eq('id',state.business?.id||'00000000-0000-0000-0000-000000000000')
      .eq('owner_id', user.id)
      .maybeSingle();
    if (businessError) throw new Error(`Unable to load the business linked to your account: ${businessError.message}`);

    validateListingSubmissionContext(user, business);
    state.user = user;
    state.business = { ...state.business, ...business };
    state.businesses=state.businesses.map((item)=>item.id===business.id?{...item,...business}:item);
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
    actions.append(actionButton('Duplicate Listing',()=>duplicateListing(listing),'secondary'));
    if (['draft', 'changes_requested', 'rejected', 'paused'].includes(listing.status)) actions.append(actionButton('Submit for review', () => submitListing(listing.id), 'aqua'));
    if (listing.status === 'published') actions.append(actionButton('Pause', () => pauseListing(listing.id), 'secondary'));
    actions.append(actionButton('Delete', () => deleteListing(listing), 'danger'));
    body.append(createElement('tr', { children: [
      createElement('td', { children: [createElement('strong', { text: listing.title }), createElement('div', { text: listing.island }), listing.review_note && listing.status !== 'published' ? createElement('small', { className: 'listing-review-note', text: `Administrator note: ${listing.review_note}` }) : null] }),
      createElement('td', { text: listing.category.replaceAll('_', ' ') }),
      createElement('td', { text: listing.pricing_mode==='components_only'?'Built from separate charges':listing.price==null?'Price on request':formatMoney(listing.price, listing.currency) }),
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

function tagWorkflowField(id,kind,step){const node=document.getElementById(id);const target=node?.matches('.field,fieldset,section')?node:(node?.closest('.field')||node);if(target)target.dataset[`${kind}WorkflowStep`]=String(step);}

function initializeWorkflows(){
  ['businessName','businessIsland','businessEmail','businessPhone','businessDescription','businessLogo','businessGallery','businessImagePreviews'].forEach((id)=>tagWorkflowField(id,'business',0));
  tagWorkflowField('operatorServiceChoices','business',1);
  ['contactPersonName','registrationNumber','websiteUrl','businessAddress','businessLatitude','businessLongitude','publicContact','businessRegistrationAgreements'].forEach((id)=>tagWorkflowField(id,'business',2));
  tagWorkflowField('businessReviewSummary','business',3);
  ['listingTitle','listingCategory','listingKind','listingIsland','listingSummary','listingDescription','listingActivityFields'].forEach((id)=>tagWorkflowField(id,'listing',0));
  ['listingStartTime','listingEndTime','listingMaxCapacity','listingAvailableSpaces','meetingPoint','activityScheduleFields','activityPickupLocationsField','packageFields','accommodationFields','accommodationPolicyFields','transferRouteFields','roomTypesSection'].forEach((id)=>tagWorkflowField(id,'listing',1));
  ['listingPrice','listingCurrency','listingPriceUnit','listingGroupCapacityField','listingPricePreview','listingChildPrice','listingTaxes','listingFees','componentPricingFields'].forEach((id)=>tagWorkflowField(id,'listing',2));
  ['includedItems','excludedItems','requirements','cancellationInformation','facilitiesSelector'].forEach((id)=>tagWorkflowField(id,'listing',3));
  ['listingLatitude','listingLongitude','listingCover','listingGallery','listingMediaEditor','listingReviewSummary'].forEach((id)=>tagWorkflowField(id,'listing',4));
}

function showBusinessWorkflowStep(step=0){
  businessWorkflowStep=Math.max(0,Math.min(3,step));
  document.querySelectorAll('[data-business-workflow-step]').forEach((node)=>{node.hidden=Number(node.dataset.businessWorkflowStep)!==businessWorkflowStep;});
  document.querySelectorAll('[data-business-step]').forEach((button)=>button.classList.toggle('active',Number(button.dataset.businessStep)===businessWorkflowStep));
  document.getElementById('businessStepBack').hidden=businessWorkflowStep===0;
  document.getElementById('businessStepNext').hidden=businessWorkflowStep===3;
  document.getElementById('businessSubmitButton').hidden=businessWorkflowStep!==3;
  if(businessWorkflowStep===3)renderBusinessReviewSummary();
}

function renderBusinessReviewSummary(){
  const services=[...document.querySelectorAll('[name="operatorService"]:checked')].map((input)=>state.serviceCategories.find((item)=>item.slug===input.value)?.name||input.value);
  const host=document.getElementById('businessReviewSummary');host.hidden=false;host.replaceChildren(
    createElement('span',{className:'eyebrow',text:'Review before submission'}),createElement('h3',{text:value('businessName')||'Business name required'}),
    createElement('dl',{className:'review-definition-list',children:[createElement('div',{children:[createElement('dt',{text:'Island'}),createElement('dd',{text:value('businessIsland')})]}),createElement('div',{children:[createElement('dt',{text:'Services'}),createElement('dd',{text:services.join(', ')||'Select at least one service'})]}),createElement('div',{children:[createElement('dt',{text:'Verification'}),createElement('dd',{text:value('registrationNumber')||'Registration number required'})]})]})
  );
}

function showListingWorkflowStep(step=0){
  listingWorkflowStep=Math.max(0,Math.min(4,step));
  document.querySelectorAll('[data-listing-workflow-step]').forEach((node)=>{node.hidden=Number(node.dataset.listingWorkflowStep)!==listingWorkflowStep;});
  document.querySelectorAll('[data-listing-step]').forEach((button)=>button.classList.toggle('active',Number(button.dataset.listingStep)===listingWorkflowStep));
  document.getElementById('listingStepBack').hidden=listingWorkflowStep===0;
  document.getElementById('listingStepNext').hidden=listingWorkflowStep===4;
  document.getElementById('listingSaveButton').hidden=listingWorkflowStep!==4;
  if(listingWorkflowStep===4)renderListingReviewSummary();
}

function renderListingReviewSummary(){
  const host=document.getElementById('listingReviewSummary');host.hidden=false;host.replaceChildren(createElement('span',{className:'eyebrow',text:'Preview as Customer'}),createElement('h3',{text:value('listingTitle')||'Untitled listing'}),createElement('p',{text:`Provided by ${state.business?.business_name||'your business'} · ${value('listingIsland')}` }));
  const preview=document.getElementById('operatorPricePreview').cloneNode(true);preview.removeAttribute('id');host.append(preview);
}

function allowedListingTypes(){
  const allowed=new Set(state.serviceCategories.filter((service)=>selectedBusinessServiceSlugs().includes(service.slug)).flatMap((service)=>service.listing_categories||[]));
  return[
    {label:'Accommodation',category:'accommodation',kind:'standard'},
    {label:'Activity / Excursion',category:allowed.has('excursion')?'excursion':[...allowed].find((item)=>['snorkelling','diving','fishing','watersports','conservation_experience','community_experience'].includes(item)),kind:'standard'},
    {label:'Excursion Package',category:'excursion',kind:'excursion_package',requires:'excursion'},
    {label:'Transport',category:'transfer',kind:'standard'},
    {label:'Food / Dining',category:'food_dining',kind:'standard'},
    {label:'Other Service',category:'other',kind:'standard'}
  ].filter((item)=>item.category&&allowed.has(item.requires||item.category));
}

function renderListingTypeCards(editing=false){
  const chooser=document.getElementById('listingTypeChooser');const form=document.getElementById('listingForm');const cards=document.getElementById('listingTypeCards');clear(cards);
  chooser.hidden=editing;form.hidden=!editing;
  allowedListingTypes().forEach((item)=>{const card=createElement('button',{className:'listing-type-card',attrs:{type:'button'},children:[createElement('strong',{text:item.label}),createElement('span',{text:`Create for ${state.business?.business_name||'selected business'}`})]});card.addEventListener('click',()=>{document.getElementById('listingCategory').value=item.category;document.getElementById('listingKind').value=item.kind;chooser.hidden=true;form.hidden=false;handleListingCategoryChange();handleListingKindChange();showListingWorkflowStep(0);});cards.append(card);});
}

function componentDraftListing(){return{id:value('listingId')||null,business_id:state.business?.id,category:value('listingCategory'),pricing_mode:value('listingPricingMode'),price:value('listingPricingMode')==='components_only'?null:numberOrNull('listingPrice'),currency:value('listingCurrency')||'USD',price_unit:value('listingPriceUnit')||'price_on_request',price_unit_confirmed:true,group_capacity:numberOrNull('listingGroupCapacity'),child_price:numberOrNull('listingChildPrice'),price_components:state.listingEditor.priceComponents};}

function addPriceComponent(custom=false){
  const preset=custom?COMPONENT_PRESETS.at(-1):COMPONENT_PRESETS[0];state.listingEditor.priceComponents.push({id:crypto.randomUUID(),component_type:preset.type,name:preset.name,charge_status:'required',amount:null,currency:value('listingCurrency')||'USD',price_unit:'per_person',group_capacity:null,customer_description:null,sort_order:state.listingEditor.priceComponents.length,tiers:[],isNew:true});renderPriceComponents();
}

function syncPickupPriceComponent(){
  const mode=value('activityPickupMode');let component=state.listingEditor.priceComponents.find((item)=>item.component_type==='pickup');
  if(mode==='not_available'){if(component)state.listingEditor.priceComponents=state.listingEditor.priceComponents.filter((item)=>item!==component);}
  else if(!component){component={id:crypto.randomUUID(),component_type:'pickup',name:'Pickup',charge_status:mode==='included'?'included':'required',amount:null,currency:value('listingCurrency')||'USD',price_unit:mode==='included'?null:'per_trip',group_capacity:null,customer_description:null,sort_order:state.listingEditor.priceComponents.length,tiers:[],isNew:true};state.listingEditor.priceComponents.push(component);}
  else component.charge_status=mode==='included'?'included':'required';updatePickupLocationVisibility();renderPriceComponents();
}

function updatePickupLocationVisibility(){document.getElementById('activityPickupLocationsField').hidden=value('listingKind')==='excursion_package'||value('activityPickupMode')==='not_available';}

function renderPriceComponents(){
  const host=document.getElementById('listingPriceComponents');clear(host);
  state.listingEditor.priceComponents.forEach((component,index)=>{
    const type=createElement('select',{children:COMPONENT_PRESETS.map((preset)=>{const option=new Option(preset.name,preset.type);option.selected=preset.type===component.component_type;return option;})});
    const name=createElement('input',{attrs:{value:component.name,maxlength:'120','aria-label':'Charge name'}});
    const status=createElement('select',{children:[new Option('Included','included'),new Option('Required extra','required'),new Option('Optional extra','optional')]});status.value=component.charge_status;
    const price=createElement('input',{attrs:{type:'number',min:'0',step:'0.01',value:component.amount??'','aria-label':'Charge price'}});
    const currency=createElement('select',{children:[new Option('USD','USD'),new Option('MVR','MVR')]});currency.value=component.currency||'USD';
    const unit=createElement('select',{children:ALL_PRICE_UNITS.map((code)=>new Option(priceUnitLabel(code),code))});unit.value=component.price_unit||'per_person';
    const groupCapacity=createElement('input',{attrs:{type:'number',min:'1',value:component.group_capacity??(Number(value('listingMaxCapacity'))||1),'aria-label':'People covered by one group price'}});
    const tierList=createElement('div',{className:'price-tier-list',children:(component.tiers||[]).map((tier,tierIndex)=>createElement('span',{children:[document.createTextNode(`${tier.minimum_guests}–${tier.maximum_guests}: ${formatMoney(tier.amount,component.currency)} ${tier.calculation_kind==='fixed_total'?'total':priceUnitLabel(component.price_unit).toLowerCase()}`),actionButton('×',()=>{component.tiers.splice(tierIndex,1);renderPriceComponents();},'text')]}))});
    const fields=createElement('div',{className:'price-component-fields',children:[type,name,status,price,currency,unit,groupCapacity]});
    const advanced=actionButton('Advanced Pricing',()=>addPriceTier(component),'secondary');
    const remove=actionButton('Remove',()=>{state.listingEditor.priceComponents.splice(index,1);renderPriceComponents();},'danger');
    const sync=()=>{component.component_type=type.value;const preset=COMPONENT_PRESETS.find((item)=>item.type===type.value);if(!name.value.trim()||COMPONENT_PRESETS.some((item)=>item.name===name.value))name.value=preset?.name||name.value;component.name=name.value.trim();component.charge_status=status.value;component.amount=status.value==='included'?null:(price.value===''?null:Number(price.value));component.currency=currency.value;component.price_unit=status.value==='included'?null:unit.value;component.group_capacity=component.price_unit==='per_group'?Number(groupCapacity.value)||1:null;price.hidden=currency.hidden=unit.hidden=status.value==='included';groupCapacity.hidden=status.value==='included'||unit.value!=='per_group';renderOperatorPricePreview();};
    [type,status,currency,unit].forEach((control)=>control.addEventListener('change',sync));[name,price,groupCapacity].forEach((control)=>control.addEventListener('input',sync));sync();
    host.append(createElement('article',{className:`price-component-card ${component.charge_status}`,children:[fields,tierList,createElement('div',{className:'form-actions',children:[advanced,remove]})]}));
  });
  renderOperatorPricePreview();
}

function addPriceTier(component){
  const range=window.prompt('Guest range for this operator-entered rate (example: 1-4):','1-4');if(!range)return;const match=range.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);if(!match)return setMessage(message,'Use a guest range such as 1-4.','error');
  const minimum=Number(match[1]);const maximum=Number(match[2]);if(maximum<minimum||(component.tiers||[]).some((tier)=>minimum<=tier.maximum_guests&&maximum>=tier.minimum_guests))return setMessage(message,'Advanced price tiers cannot overlap.','error');
  const rate=Number(window.prompt(`Operator-entered rate in ${component.currency}:`,String(component.amount??'')));if(!Number.isFinite(rate)||rate<0)return setMessage(message,'Enter a valid tier price.','error');
  const fixed=window.confirm('Choose OK for a fixed total for this guest range. Choose Cancel for a per-unit rate.');component.tiers.push({id:crypto.randomUUID(),minimum_guests:minimum,maximum_guests:maximum,amount:rate,calculation_kind:fixed?'fixed_total':'per_unit',sort_order:component.tiers.length});renderPriceComponents();
}

function updateComponentPricingControls(){
  const componentsOnly=value('listingPricingMode')==='components_only';const mainIds=['listingPrice','listingCurrency','listingPriceUnit','listingGroupCapacityField','listingPricePreview','listingChildPrice'];mainIds.forEach((id)=>{const node=document.getElementById(id);const target=node?.closest('.field')||node;if(target)target.hidden=componentsOnly;});
  document.getElementById('priceIncludesEverything').closest('.field').hidden=componentsOnly;
  const advanced=componentsOnly||value('priceIncludesEverything')==='no';document.getElementById('addPriceComponent').hidden=!advanced;document.getElementById('addCustomPriceComponent').hidden=!advanced;
  document.getElementById('listingPrice').required=!componentsOnly&&value('listingPriceUnit')!=='price_on_request';renderPriceComponents();
}

function renderOperatorPricePreview(){
  const host=document.getElementById('operatorPricePreview');if(!host)return;const listing=componentDraftListing();const result=calculatePriceBreakdown(listing,{adults:Number(document.getElementById('previewAdults').value)||1,children:Number(document.getElementById('previewChildren').value)||0});clear(host);
  host.append(createElement('span',{className:'eyebrow',text:'Preview as Customer'}),createElement('strong',{text:`${document.getElementById('previewAdults').value||1} adults` }));
  result.lines.forEach((line)=>host.append(createElement('div',{className:'price-breakdown-line',children:[createElement('span',{text:`${line.name} · ${line.status==='optional'?'Optional':line.status==='included'?'Included':'Required'}`}),createElement('strong',{text:line.pending?'Price on request':line.status==='included'?'Included':`${formatMoney(line.amount,line.currency||result.currency)} · ${componentMath(line)}`})]})));
  host.append(createElement('div',{className:'price-breakdown-total',children:[createElement('span',{text:'Required Total'}),createElement('strong',{text:result.requiredTotal==null?'Price confirmation required':formatMoney(result.requiredTotal,result.currency)})]}));
}

async function loadPriceComponents(client,listingId){
  const {data,error}=await client.from('listing_price_components').select('*,listing_price_tiers(*)').eq('listing_id',listingId).order('sort_order');
  if(error&&['PGRST204','PGRST205','42P01','42703'].includes(error.code)){state.listingEditor.priceComponents=[];return;}if(error)throw error;
  state.listingEditor.priceComponents=(data||[]).map((component)=>({...component,tiers:component.listing_price_tiers||[]}));
}

function validatePriceComponents(){
  const mode=value('listingPricingMode');const components=state.listingEditor.priceComponents;
  if(mode==='components_only'&&!components.some((component)=>component.charge_status==='required'))throw new Error('Component-only pricing needs at least one required charge.');
  for(const component of components){if(!component.name?.trim())throw new Error('Every charge needs a name.');if(component.charge_status!=='included'&&component.price_unit!=='price_on_request'&&!Number.isFinite(Number(component.amount)))throw new Error(`Enter the operator price for ${component.name}.`);}
}

async function persistPriceComponents(client,listingId){
  validatePriceComponents();const removed=await client.from('listing_price_components').delete().eq('listing_id',listingId);if(removed.error)throw removed.error;
  for(const [index,component] of state.listingEditor.priceComponents.entries()){
    const payload={id:component.id,listing_id:listingId,component_type:component.component_type,name:component.name.trim(),charge_status:component.charge_status,amount:component.charge_status==='included'||component.price_unit==='price_on_request'?null:Number(component.amount),currency:component.currency,price_unit:component.charge_status==='included'?null:component.price_unit,group_capacity:component.price_unit==='per_group'?Number(component.group_capacity||numberOrNull('listingMaxCapacity')||1):null,customer_description:component.customer_description||null,is_active:true,sort_order:index};
    const saved=await client.from('listing_price_components').insert(payload);if(saved.error)throw saved.error;
    if(component.tiers?.length){const tiers=await client.from('listing_price_tiers').insert(component.tiers.map((tier,tierIndex)=>({id:tier.id,component_id:component.id,minimum_guests:Number(tier.minimum_guests),maximum_guests:Number(tier.maximum_guests),amount:Number(tier.amount),calculation_kind:tier.calculation_kind,sort_order:tierIndex})));if(tiers.error)throw tiers.error;}
  }
}

function syncPackagePricingComponents(){
  if(value('listingKind')!=='excursion_package')return;
  const sync=(direction,modeId,feeId)=>{const mode=value(modeId);const name=direction==='pickup'?'Package pickup':'Package drop-off';let component=state.listingEditor.priceComponents.find((item)=>item.name===name);if(['not_available','meet_at_provider','same_as_pickup'].includes(mode)){if(component)state.listingEditor.priceComponents=state.listingEditor.priceComponents.filter((item)=>item!==component);return;}if(!component){component={id:crypto.randomUUID(),component_type:direction==='pickup'?'pickup':'transfer',name,charge_status:mode==='included'?'included':'optional',amount:null,currency:value('listingCurrency')||'USD',price_unit:mode==='included'?null:'per_trip',group_capacity:null,customer_description:null,sort_order:state.listingEditor.priceComponents.length,tiers:[]};state.listingEditor.priceComponents.push(component);}component.charge_status=mode==='included'?'included':'optional';component.amount=mode==='extra_charge'?numberOrNull(feeId):null;component.price_unit=mode==='extra_charge'?'per_trip':null;};
  sync('pickup','packagePickupMode','packagePickupFee');sync('dropoff','packageDropoffMode','packageDropoffFee');
  const included=[['packageEquipmentIncluded','snorkelling_equipment','Equipment'],['packageMealIncluded','food_drink','Meal'],['packageWaterIncluded','food_drink','Drinking water']];
  included.forEach(([controlId,type,name])=>{let component=state.listingEditor.priceComponents.find((item)=>item.name===name);if(document.getElementById(controlId).checked){if(!component)state.listingEditor.priceComponents.push({id:crypto.randomUUID(),component_type:type,name,charge_status:'included',amount:null,currency:value('listingCurrency')||'USD',price_unit:null,group_capacity:null,customer_description:null,sort_order:state.listingEditor.priceComponents.length,tiers:[]});else{component.charge_status='included';component.amount=null;component.price_unit=null;}}else if(component?.charge_status==='included')state.listingEditor.priceComponents=state.listingEditor.priceComponents.filter((item)=>item!==component);});
}

function bindEvents() {
  if (dashboardEventsBound) return;
  dashboardEventsBound = true;
  initializeWorkflows();showBusinessWorkflowStep(0);
  document.getElementById('availableDate').min = new Date().toISOString().slice(0, 10);
  document.getElementById('newListingButton').addEventListener('click', () => openListingEditor());
  document.getElementById('businessSwitcher').addEventListener('change',(event)=>selectBusiness(event.target.value).catch((error)=>setMessage(message,error.message,'error')));
  document.getElementById('registerAnotherBusiness').addEventListener('click',()=>{state.business=null;renderBusinessWorkspace();renderBusiness();document.querySelector('[data-tab="business"]').click();businessForm.scrollIntoView({behavior:'smooth',block:'start'});});
  document.getElementById('businessStepBack').addEventListener('click',()=>showBusinessWorkflowStep(businessWorkflowStep-1));
  document.getElementById('businessStepNext').addEventListener('click',()=>showBusinessWorkflowStep(businessWorkflowStep+1));
  document.querySelectorAll('[data-business-step]').forEach((button)=>button.addEventListener('click',()=>showBusinessWorkflowStep(Number(button.dataset.businessStep))));
  document.getElementById('resubmitBusinessButton').addEventListener('click', resubmitBusiness);
  document.getElementById('closeListingEditor').addEventListener('click', closeListingEditor);
  document.getElementById('cancelListingButton').addEventListener('click', closeListingEditor);
  document.getElementById('listingCategory').addEventListener('change', handleListingCategoryChange);
  document.getElementById('listingKind').addEventListener('change',handleListingKindChange);
  document.getElementById('listingStepBack').addEventListener('click',()=>showListingWorkflowStep(listingWorkflowStep-1));
  document.getElementById('listingStepNext').addEventListener('click',()=>showListingWorkflowStep(listingWorkflowStep+1));
  document.querySelectorAll('[data-listing-step]').forEach((button)=>button.addEventListener('click',()=>showListingWorkflowStep(Number(button.dataset.listingStep))));
  document.getElementById('listingPricingMode').addEventListener('change',updateComponentPricingControls);
  document.getElementById('priceIncludesEverything').addEventListener('change',updateComponentPricingControls);
  document.getElementById('activityPickupMode').addEventListener('change',syncPickupPriceComponent);
  document.getElementById('addPriceComponent').addEventListener('click',()=>addPriceComponent(false));
  document.getElementById('addCustomPriceComponent').addEventListener('click',()=>addPriceComponent(true));
  ['previewAdults','previewChildren'].forEach((id)=>document.getElementById(id).addEventListener('input',renderOperatorPricePreview));
  ['listingPrice','listingCurrency','listingPriceUnit','listingGroupCapacity'].forEach((id)=>document.getElementById(id).addEventListener('input',updatePricingPreview));
  document.getElementById('listingCurrency').addEventListener('change',()=>{state.listingEditor.priceComponents.forEach((component)=>{component.currency=value('listingCurrency');});renderPriceComponents();});
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
    const selectedServiceSlugs=[...document.querySelectorAll('[name="operatorService"]:checked')].map((input)=>input.value);
    if(!selectedServiceSlugs.length)throw new Error('Select at least one service this business provides.');
    const logoFiles = validateImages(document.getElementById('businessLogo').files, { multiple: false });
    const galleryFiles = validateImages(document.getElementById('businessGallery').files);
    const payload = {
      contact_person_name: value('contactPersonName'), business_name: value('businessName'), registration_number: value('registrationNumber'),
      category: LEGACY_OPERATOR_CATEGORY[selectedServiceSlugs[0]]||value('operatorCategory'), island: value('businessIsland'), email: value('businessEmail'), phone: value('businessPhone'),
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
    if(creating)localStorage.setItem('baa_operator_business_id',data.id);
    const selectedServiceIds=state.serviceCategories.filter((item)=>selectedServiceSlugs.includes(item.slug)).map((item)=>item.id);
    const added=await client.from('business_service_categories').upsert(selectedServiceIds.map((service_category_id)=>({business_id:data.id,service_category_id})),{onConflict:'business_id,service_category_id'});
    if(added.error)throw added.error;
    for(const existing of state.businessServices.filter((item)=>item.business_id===data.id&&!selectedServiceIds.includes(item.service_category_id))){
      const removed=await client.from('business_service_categories').delete().eq('business_id',data.id).eq('service_category_id',existing.service_category_id);if(removed.error)throw removed.error;
    }

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
    await loadAll();
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
  if(value('listingCategory')!=='excursion'&&value('listingKind')==='excursion_package')document.getElementById('listingKind').value='standard';
  toggleAccommodationFields();
  handleListingKindChange();
  updatePricingControls();
  if (value('listingCategory') === 'transfer' && !document.querySelector('[name="routeDay"]:checked')) resetTransferRouteFields();
  facilitiesSelector.switchCategory(value('listingCategory'));
}

function handleListingKindChange(){
  const packageMode=value('listingKind')==='excursion_package';
  if(packageMode&&value('listingCategory')!=='excursion')document.getElementById('listingCategory').value='excursion';
  document.getElementById('packageFields').hidden=!packageMode;
  document.getElementById('listingKind').querySelector('[value="excursion_package"]').disabled=value('listingCategory')!=='excursion'&&!packageMode;
  ['packageDuration','packageMinimumGuests','packageMaximumGuests'].forEach((id)=>{document.getElementById(id).required=packageMode;});
  updatePickupLocationVisibility();
}

function renderListingActivityChoices(selected=[]){
  const container=document.getElementById('listingActivityChoices');clear(container);
  state.activityTypes.forEach((activity)=>{const input=createElement('input',{attrs:{type:'checkbox',name:'listingActivity',value:activity.slug}});input.checked=selected.includes(activity.slug);container.append(createElement('label',{className:'checkbox',children:[input,createElement('span',{text:activity.name})]}));});
}

function renderPackageLocationChoices(transfers=[]){
  for(const direction of ['pickup','dropoff']){
    const container=document.getElementById(direction==='pickup'?'packagePickupLocations':'packageDropoffLocations');clear(container);
    state.transportLocations.filter((item)=>item.location_type==='island'||item.location_type==='airport').forEach((location)=>{const input=createElement('input',{attrs:{type:'checkbox',name:`package${direction}`,value:location.id}});input.checked=transfers.some((item)=>item.direction===direction&&item.location_id===location.id);container.append(createElement('label',{className:'checkbox',children:[input,createElement('span',{text:location.name})]}));});
  }
}

function renderServicePickupLocationChoices(selected=[]){
  const selectedIds=new Set(selected.map((item)=>item.location_id));const container=document.getElementById('activityPickupLocations');clear(container);
  state.transportLocations.filter((item)=>item.location_type==='island'||item.location_type==='airport').forEach((location)=>{const input=createElement('input',{attrs:{type:'checkbox',name:'activityPickupLocation',value:location.id}});input.checked=selectedIds.has(location.id);container.append(createElement('label',{className:'checkbox',children:[input,createElement('span',{text:location.name})]}));});
  updatePickupLocationVisibility();
}

async function loadServicePickupLocations(client,listingId){
  const {data,error}=await client.from('listing_service_pickup_locations').select('location_id,sort_order').eq('listing_id',listingId).order('sort_order');
  if(error&&['PGRST204','PGRST205','42P01','42703'].includes(error.code))state.listingEditor.servicePickupLocations=[];else if(error)throw error;else state.listingEditor.servicePickupLocations=data||[];
  renderServicePickupLocationChoices(state.listingEditor.servicePickupLocations);
}

async function persistServicePickupLocations(client,listingId){
  const removed=await client.from('listing_service_pickup_locations').delete().eq('listing_id',listingId);if(removed.error)throw removed.error;
  if(value('listingKind')==='excursion_package'||value('activityPickupMode')==='not_available')return;
  const selected=[...document.querySelectorAll('[name="activityPickupLocation"]:checked')];if(!selected.length)throw new Error('Select at least one pickup island or location.');
  const inserted=await client.from('listing_service_pickup_locations').insert(selected.map((input,index)=>({listing_id:listingId,location_id:input.value,sort_order:index})));if(inserted.error)throw inserted.error;
}

function updateListingCategoryOptions(currentCategory=''){
  const allowed=new Set(state.serviceCategories.filter((service)=>selectedBusinessServiceSlugs().includes(service.slug)).flatMap((service)=>service.listing_categories||[]));
  document.querySelectorAll('#listingCategory option').forEach((option)=>{option.disabled=!allowed.has(option.value)&&option.value!==currentCategory;});
}

function updatePricingControls(){
  const select=document.getElementById('listingPriceUnit');const current=select.value;const units=priceUnitsForCategory(value('listingCategory'));
  const original=state.listingEditor.original;const legacy=original&&!original.price_unit_confirmed&&original.price_unit===current;
  select.replaceChildren(new Option('Choose a price unit',''),...units.map((unit)=>new Option(priceUnitLabel(unit),unit)));
  if(units.includes(current))select.value=current;
  else if(legacy){select.append(new Option(`${priceUnitLabel(current)} — operator update required`,current));select.value=current;}
  else select.value='';
  const componentsOnly=value('listingPricingMode')==='components_only';const request=select.value==='price_on_request';const price=document.getElementById('listingPrice');price.required=!componentsOnly&&!request;price.disabled=componentsOnly||request;if(request&&!componentsOnly)price.value='';
  const group=select.value==='per_group';document.getElementById('listingGroupCapacityField').hidden=!group;document.getElementById('listingGroupCapacity').required=group;
  updatePricingPreview();updateComponentPricingControls();
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
    state.listingEditor = { original: editable, originalStatus, existingGallery: [], newGallery: [], coverFile: null, rooms: [], policy: null, route: null,packageDetails:null,packageTransfers:[],servicePickupLocations:[],priceComponents:[] };
    resetListingFilePickerStatus(editable);
    document.getElementById('listingEditor').hidden = false;
    document.getElementById('listingEditorTitle').textContent = editable ? 'Edit service or listing' : 'Add service or listing';
    document.getElementById('listingBusinessContext').textContent=`Listing for: ${business.business_name}`;
    renderListingTypeCards(Boolean(editable));
    document.getElementById('listingId').value = editable?.id || '';
    document.getElementById('listingIsland').value = editable?.island || business.island;
    document.getElementById('listingCategory').value = editable?.category
      || OPERATOR_LISTING_DEFAULTS[state.business?.category]?.[0]
      || 'other';
    updateListingCategoryOptions(editable?.category||'');
    if(document.getElementById('listingCategory').selectedOptions[0]?.disabled){const first=[...document.getElementById('listingCategory').options].find((option)=>!option.disabled);if(first)document.getElementById('listingCategory').value=first.value;}
    document.getElementById('listingKind').value=editable?.listing_kind||'standard';
    document.getElementById('listingPricingMode').value=editable?.pricing_mode||'main_plus_components';
    document.getElementById('priceIncludesEverything').value='yes';
    renderListingActivityChoices(editable?.activity_type_slugs||[]);renderPackageLocationChoices();renderServicePickupLocationChoices();
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
      listingChildPrice:'child_price', listingTaxes:'taxes_amount', listingFees:'fees_amount', listingLatitude:'latitude', listingLongitude:'longitude',
      activityDuration:'service_duration_minutes',activityMinimumGuests:'service_minimum_guests',activityPickupMode:'service_pickup_mode',activityPickupNotes:'service_pickup_notes'
    };
    if (editable) Object.entries(map).forEach(([id, key]) => document.getElementById(id).value = editable[key] ?? '');
    document.querySelectorAll('[name="activityDay"]').forEach((input)=>{input.checked=!editable||editable.service_operating_days?.includes(Number(input.value));});
    document.getElementById('includedItems').value = editable?.included_items?.join(', ') || '';
    document.getElementById('excludedItems').value = editable?.excluded_items?.join(', ') || '';
    if(editable){await loadPriceComponents(client,editable.id);await loadServicePickupLocations(client,editable.id);}
    renderPriceComponents();updateComponentPricingControls();
    toggleAccommodationFields();
    handleListingKindChange();
    updatePricingControls();
    facilitiesSelector.load(value('listingCategory'), editable?.amenities || []);

    if (editable?.category === 'accommodation') await loadRoomTypesAndPolicy(client, editable.id);
    else renderRoomTypes();
    if (editable?.category === 'transfer') await loadTransferRoute(client, editable.id);
    else resetTransferRouteFields();
    if(editable?.listing_kind==='excursion_package')await loadPackageDetails(client,editable.id);

    if (editable) {
      const { data, error } = await client.from('listing_images').select('*').eq('listing_id', editable.id).order('sort_order');
      if (error) throw error;
      state.listingEditor.existingGallery = (data || []).map((item) => ({ ...item, removed: false }));
      resetListingFilePickerStatus(editable, state.listingEditor.existingGallery.length);
    }
    await renderListingMediaEditor();
    if(editable)showListingWorkflowStep(0);
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

async function loadPackageDetails(client,listingId){
  const[detailsResult,transferResult]=await Promise.all([client.from('listing_package_details').select('*').eq('listing_id',listingId).maybeSingle(),client.from('package_transfer_options').select('*').eq('listing_id',listingId)]);
  if(detailsResult.error)throw detailsResult.error;if(transferResult.error)throw transferResult.error;
  const details=detailsResult.data||{};state.listingEditor.packageDetails=details;state.listingEditor.packageTransfers=transferResult.data||[];
  const map={packageDuration:'duration_minutes',packageMinimumGuests:'minimum_guests',packageMaximumGuests:'maximum_guests',packageInfantPolicy:'infant_policy',packageSharedPrice:'shared_trip_price',packagePrivatePrice:'private_trip_price',packagePickupMode:'pickup_mode',packagePickupNotes:'pickup_notes',packageDropoffMode:'dropoff_mode',packageDropoffNotes:'dropoff_notes',packageBookingLeadHours:'booking_lead_hours'};
  Object.entries(map).forEach(([id,key])=>{document.getElementById(id).value=details[key]??document.getElementById(id).value;});
  document.getElementById('packageEquipmentIncluded').checked=details.equipment_included===true;document.getElementById('packageMealIncluded').checked=details.meal_included===true;document.getElementById('packageWaterIncluded').checked=details.drinking_water_included===true;document.getElementById('packageAirportPickup').checked=details.airport_pickup===true;
  const days=new Set((details.operating_days||[0,1,2,3,4,5,6]).map(Number));document.querySelectorAll('[name="packageDay"]').forEach((input)=>{input.checked=days.has(Number(input.value));});renderPackageLocationChoices(state.listingEditor.packageTransfers);
  document.getElementById('packagePickupFee').value=state.listingEditor.packageTransfers.find((item)=>item.direction==='pickup'&&item.availability==='extra_charge')?.fee??'';document.getElementById('packageDropoffFee').value=state.listingEditor.packageTransfers.find((item)=>item.direction==='dropoff'&&item.availability==='extra_charge')?.fee??'';
}

async function persistPackageDetails(client,listingId){
  const activities=[...document.querySelectorAll('[name="listingActivity"]:checked')].map((input)=>input.value);if(activities.length<2)throw new Error('Select at least two included activities for an excursion package.');
  const operating_days=[...document.querySelectorAll('[name="packageDay"]:checked')].map((input)=>Number(input.value));if(!operating_days.length)throw new Error('Select at least one package operating day.');
  const payload={listing_id:listingId,duration_minutes:Number(value('packageDuration')),operating_days,minimum_guests:Number(value('packageMinimumGuests')),maximum_guests:Number(value('packageMaximumGuests')),infant_policy:nullable('packageInfantPolicy'),shared_trip_price:numberOrNull('packageSharedPrice'),private_trip_price:numberOrNull('packagePrivatePrice'),equipment_included:document.getElementById('packageEquipmentIncluded').checked,meal_included:document.getElementById('packageMealIncluded').checked,drinking_water_included:document.getElementById('packageWaterIncluded').checked,pickup_mode:value('packagePickupMode'),pickup_notes:nullable('packagePickupNotes'),airport_pickup:document.getElementById('packageAirportPickup').checked,dropoff_mode:value('packageDropoffMode'),dropoff_notes:nullable('packageDropoffNotes'),booking_lead_hours:Number(value('packageBookingLeadHours'))};
  const saved=await client.from('listing_package_details').upsert(payload,{onConflict:'listing_id'});if(saved.error)throw saved.error;
  const removed=await client.from('package_transfer_options').delete().eq('listing_id',listingId);if(removed.error)throw removed.error;
  const options=[];for(const direction of ['pickup','dropoff']){const mode=value(direction==='pickup'?'packagePickupMode':'packageDropoffMode');const availability=mode==='extra_charge'?'extra_charge':'included';const fee=numberOrNull(direction==='pickup'?'packagePickupFee':'packageDropoffFee');if(mode==='extra_charge'&&(fee===null||fee<0))throw new Error(`Enter the ${direction} fee for the selected locations.`);for(const input of document.querySelectorAll(`[name="package${direction}"]:checked`))options.push({listing_id:listingId,direction,location_id:input.value,availability,fee:mode==='extra_charge'?fee:null,currency:value('listingCurrency')});}
  if(options.length){const inserted=await client.from('package_transfer_options').insert(options);if(inserted.error)throw inserted.error;}
}

function closeListingEditor() {
  document.getElementById('listingEditor').hidden = true;
  listingForm.reset();
  state.listingEditor = { original: null, originalStatus: null, existingGallery: [], newGallery: [], coverFile: null, rooms: [], policy: null, route: null,packageDetails:null,packageTransfers:[],servicePickupLocations:[],priceComponents:[] };
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
  const componentsOnly=value('listingPricingMode')==='components_only';
  const priceUnit=value('listingPriceUnit');
  const priceOnRequest=componentsOnly||priceUnit==='price_on_request';
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
  if(!componentsOnly&&!priceUnit){setMessage(message,'Choose an explicit price unit for this listing.','error');return;}
  if(!componentsOnly&&priceUnit==='per_group'&&!numberOrNull('listingGroupCapacity')){setMessage(message,'Enter the number of people covered by one group price.','error');return;}
  syncPackagePricingComponents();try{validatePriceComponents();}catch(error){setMessage(message,error.message,'error');return;}
  const activityTypeSlugs=[...document.querySelectorAll('[name="listingActivity"]:checked')].map((input)=>input.value);
  if(!document.querySelector('[name="activityDay"]:checked')){setMessage(message,'Select at least one operating day.','error');return;}
  if(value('listingKind')==='excursion_package'&&activityTypeSlugs.length<2){setMessage(message,'Select at least two activities included in this package.','error');return;}
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
      title: value('listingTitle'), category: value('listingCategory'),listing_kind:value('listingKind'),activity_type_slugs:activityTypeSlugs, island: value('listingIsland'),
      summary: value('listingSummary'), description: value('listingDescription'), price,pricing_mode:value('listingPricingMode'),
      currency: value('listingCurrency'), price_unit: componentsOnly?(state.listingEditor.original?.price_unit||'per_person'):priceUnit,price_unit_confirmed:componentsOnly||!(state.listingEditor.original?.price_unit_confirmed===false&&state.listingEditor.original?.price_unit===priceUnit),group_capacity:!componentsOnly&&priceUnit==='per_group'?numberOrNull('listingGroupCapacity'):null,start_time: nullable('listingStartTime'), end_time: nullable('listingEndTime'),
      max_capacity: capacity, available_spaces: spaces, included_items: commaList(value('includedItems')), excluded_items: commaList(value('excludedItems')),
      meeting_point: nullable('meetingPoint'), requirements: nullable('requirements'), cancellation_information: nullable('cancellationInformation'),
      latitude: numberOrNull('listingLatitude'), longitude: numberOrNull('listingLongitude'), child_price: numberOrNull('listingChildPrice'),
      service_duration_minutes:numberOrNull('activityDuration'),service_operating_days:[...document.querySelectorAll('[name="activityDay"]:checked')].map((input)=>Number(input.value)),service_minimum_guests:Number(value('activityMinimumGuests')||1),service_pickup_mode:value('activityPickupMode')||'not_available',service_pickup_notes:nullable('activityPickupNotes'),
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
    syncPackagePricingComponents();
    await persistPriceComponents(client,saved.id);
    await persistServicePickupLocations(client,saved.id);
    if(value('listingKind')==='excursion_package')await persistPackageDetails(client,saved.id);
    else if(state.listingEditor.original?.listing_kind==='excursion_package'){const removed=await client.from('listing_package_details').delete().eq('listing_id',saved.id);if(removed.error)throw removed.error;}
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

async function duplicateListing(listing){
  if(!confirmAction(`Duplicate “${listing.title}” as a new draft?`))return;
  const client=requireSupabase();const {business}=await loadAuthenticatedListingBusiness(client);const source=await loadOwnedListing(client,listing.id,business.id);if(!source)throw new Error('The source listing is no longer available.');
  const {id:ignoredId,created_at:ignoredCreated,updated_at:ignoredUpdated,status:ignoredStatus,review_note:ignoredNote,reviewed_by:ignoredReviewer,reviewed_at:ignoredReviewed,...copy}=source;void ignoredId;void ignoredCreated;void ignoredUpdated;void ignoredStatus;void ignoredNote;void ignoredReviewer;void ignoredReviewed;
  const newId=createListingId();const inserted=await client.from('listings').insert({...copy,id:newId,title:`${source.title} (Copy)`.slice(0,180),cover_image_path:null,status:'draft',is_active:true});if(inserted.error)throw inserted.error;
  const [componentResult,packageResult,transferResult,servicePickupResult,policyResult]=await Promise.all([
    client.from('listing_price_components').select('*,listing_price_tiers(*)').eq('listing_id',source.id),
    client.from('listing_package_details').select('*').eq('listing_id',source.id).maybeSingle(),
    client.from('package_transfer_options').select('*').eq('listing_id',source.id),
    client.from('listing_service_pickup_locations').select('location_id,sort_order').eq('listing_id',source.id),
    client.from('listing_policies').select('*').eq('listing_id',source.id).maybeSingle()
  ]);
  for(const result of [componentResult,packageResult,transferResult,servicePickupResult,policyResult])if(result.error&&!['PGRST116','PGRST204','PGRST205','42P01','42703'].includes(result.error.code))throw result.error;
  for(const component of componentResult.data||[]){const {id:oldComponentId,listing_id:ignoredListing,listing_price_tiers:tiers=[],created_at:componentCreated,updated_at:componentUpdated,...componentCopy}=component;void ignoredListing;void componentCreated;void componentUpdated;const componentId=crypto.randomUUID();const saved=await client.from('listing_price_components').insert({...componentCopy,id:componentId,listing_id:newId});if(saved.error)throw saved.error;if(tiers.length){const savedTiers=await client.from('listing_price_tiers').insert(tiers.map(({id,component_id,created_at,...tier})=>{void id;void component_id;void created_at;return{...tier,id:crypto.randomUUID(),component_id:componentId};}));if(savedTiers.error)throw savedTiers.error;}void oldComponentId;}
  if(packageResult.data){const {listing_id,updated_at,...details}=packageResult.data;void listing_id;void updated_at;const saved=await client.from('listing_package_details').insert({...details,listing_id:newId});if(saved.error)throw saved.error;}
  if(transferResult.data?.length){const saved=await client.from('package_transfer_options').insert(transferResult.data.map(({id,listing_id,created_at,...option})=>{void id;void listing_id;void created_at;return{...option,id:crypto.randomUUID(),listing_id:newId};}));if(saved.error)throw saved.error;}
  if(servicePickupResult.data?.length){const saved=await client.from('listing_service_pickup_locations').insert(servicePickupResult.data.map((option)=>({...option,listing_id:newId})));if(saved.error)throw saved.error;}
  if(policyResult.data){const {listing_id,updated_at,...policy}=policyResult.data;void listing_id;void updated_at;const saved=await client.from('listing_policies').insert({...policy,listing_id:newId});if(saved.error)throw saved.error;}
  await loadListings();renderSummary();setMessage(message,'Listing duplicated as a draft. Availability, bookings, reviews, payments, and approval state were not copied.','success');
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
  if(!state.business){state.enquiries=[];state.paymentReferences=[];renderEnquiries();return;}
  const { data, error } = await requireSupabase().from('booking_enquiries').select('*, listings(title,listing_kind,activity_type_slugs), trip_items(item_kind,pickup_point,dropoff_point,note)').eq('operator_id', state.user.id).eq('business_id',state.business.id).order('created_at', { ascending: false });
  if (error) throw error; state.enquiries = data || [];
  const bookingIds=state.enquiries.map((item)=>item.id);
  const payments=bookingIds.length?await requireSupabase().from('payment_references').select('*').eq('operator_id',state.user.id).in('booking_id',bookingIds).order('created_at',{ascending:false}):{data:[],error:null};
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
    const packageSummary=(enquiry.listing_kind_snapshot||enquiry.listings?.listing_kind)==='excursion_package'?`Package · ${(enquiry.activity_type_slugs_snapshot?.length?enquiry.activity_type_slugs_snapshot:enquiry.listings?.activity_type_slugs||[]).map((slug)=>slug.replaceAll('-',' ')).join(', ')}`:null;const pickupPoint=enquiry.pickup_point_snapshot||enquiry.trip_items?.pickup_point;const dropoffPoint=enquiry.dropoff_point_snapshot||enquiry.trip_items?.dropoff_point;const pickup=pickupPoint||dropoffPoint?`Pickup / drop-off: ${pickupPoint||'not selected'} → ${dropoffPoint||'not selected'}`:null;
    body.append(createElement('tr', { children: [createElement('td', { children: [createElement('strong', { text: enquiry.guest_full_name }), createElement('div', { text: enquiry.booking_reference || 'Legacy enquiry' }), createElement('div', { text: enquiry.guest_email }), createElement('div', { text: enquiry.guest_phone })] }), createElement('td', { children:[createElement('strong',{text:enquiry.listings?.title||'Listing'}),packageSummary?createElement('small',{text:packageSummary}):null] }), createElement('td', { children:[createElement('div',{text:`${stay}${enquiry.quoted_total!=null?` · ${formatMoney(enquiry.quoted_total,enquiry.quote_currency)}`:''}`}),pickup?createElement('small',{text:pickup}):null,createElement('small',{text:payment}),...refs.map((ref)=>createElement('small',{text:`${ref.payment_reference} · ${formatMoney(ref.amount,ref.currency)} · ${ref.status}`}))] }), createElement('td', { children: [statusBadge(enquiry.status)] }), createElement('td', { children: [actions] })] }));
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
