import {
  bindBusinessSwitcher,
  fillBusinessSwitcher,
  initializeOperatorPage,
  loadOwnedBusinesses,
  rememberBusiness,
  setPageMessage
} from './operator-shell.js';
import { removeImage, signedImageUrl, uploadImage, validateImages } from './storage.js';

const state={client:null,user:null,businesses:[],business:null,record:null,editing:false,creating:false};
const pageMessage=document.getElementById('pageMessage');
const businessSwitcher=document.getElementById('businessSwitcher');
const form=document.getElementById('businessForm');

function esc(value=''){return String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function val(id){return document.getElementById(id)?.value?.trim()||'';}
function nullable(id){return val(id)||null;}
function numberOrNull(id){const raw=val(id);return raw===''?null:Number(raw);}
function statusText(value){return String(value||'').replaceAll('_',' ');}
function statusClass(value){return value==='verified'?'badge-paid':['rejected'].includes(value)?'badge-unpaid':'badge-hold';}
function ownerBusiness(item){return ['owner','admin'].includes(item?.access_role||'owner');}

function setBusy(busy,label='Saving…'){
  const button=document.getElementById('businessSubmitButton');
  if(!button)return;
  if(!button.dataset.defaultText)button.dataset.defaultText=button.textContent;
  button.disabled=busy;button.textContent=busy?label:(state.creating?'Submit business for review':'Save business profile');
}

function resetForm(){
  form.reset();
  document.getElementById('businessLatitude').value='';
  document.getElementById('businessLongitude').value='';
  document.getElementById('publicContact').checked=true;
  document.getElementById('businessImagePreviews').replaceChildren();
}

function populateForm(record){
  resetForm();
  if(!record){
    document.getElementById('contactPersonName').value=state.user?.user_metadata?.full_name||'';
    document.getElementById('businessEmail').value=state.user?.email||'';
    document.getElementById('businessRegistrationAgreements').hidden=false;
    document.getElementById('businessAccuracyConfirmed').required=true;
    document.getElementById('businessTermsAccepted').required=true;
    return;
  }
  const map={contactPersonName:'contact_person_name',businessName:'business_name',registrationNumber:'registration_number',businessIsland:'island',businessEmail:'email',businessPhone:'phone',websiteUrl:'website_url',businessAddress:'business_address',businessLatitude:'latitude',businessLongitude:'longitude',businessDescription:'description'};
  Object.entries(map).forEach(([id,key])=>{const node=document.getElementById(id);if(node)node.value=record[key]??'';});
  document.getElementById('publicContact').checked=record.public_contact!==false;
  document.getElementById('businessRegistrationAgreements').hidden=true;
  document.getElementById('businessAccuracyConfirmed').required=false;
  document.getElementById('businessTermsAccepted').required=false;
}

function showEditor({creating=false}={}){
  state.creating=creating;state.editing=true;
  if(creating)populateForm(null);else populateForm(state.record);
  form.hidden=false;
  document.getElementById('editorTitle').textContent=creating?'Register another business':'Edit business profile';
  document.getElementById('editorDescription').textContent=creating?'Submit the business details for administrator verification.':'Update public and verification information without changing listing, rate or inventory data.';
  document.getElementById('cancelBusinessEdit').hidden=false;
  document.getElementById('resubmitBusinessButton').hidden=creating||!['changes_requested','rejected'].includes(state.record?.status);
  setBusy(false);
  form.scrollIntoView({behavior:'smooth',block:'start'});
}

function hideEditor(){state.editing=false;state.creating=false;form.hidden=true;document.getElementById('cancelBusinessEdit').hidden=true;}

function renderBusinessCards(){
  const host=document.getElementById('businessCards');host.replaceChildren();
  const rows=state.businesses.filter(ownerBusiness);
  if(!rows.length){host.innerHTML='<div class="empty-state"><strong>No business registered yet</strong><span>Register the first property or tourism business below.</span></div>';return;}
  rows.forEach((item)=>{
    const card=document.createElement('article');card.className=`business-management-card${item.id===state.business?.id?' selected':''}`;
    card.innerHTML=`<div><strong>${esc(item.business_name)}</strong><span class="${statusClass(item.status)}">${esc(statusText(item.status))}</span><span>${esc(item.island||'Baa Atoll')}</span></div><div class="form-actions"><button class="button small secondary" type="button" data-manage="${item.id}">Manage</button>${item.status==='verified'&&item.is_active?`<a class="button small secondary" href="business.html?id=${encodeURIComponent(item.id)}" target="_blank" rel="noopener">View public page</a>`:''}</div>`;
    host.append(card);
  });
  host.querySelectorAll('[data-manage]').forEach((button)=>button.addEventListener('click',()=>{
    businessSwitcher.value=button.dataset.manage;
    businessSwitcher.dispatchEvent(new Event('change',{bubbles:true}));
  }));
}

function renderStatus(){
  const host=document.getElementById('propertyStatusCard');
  if(!state.record){
    host.innerHTML='<div class="empty-state"><strong>Register your business</strong><span>Business verification is required before listings can be published.</span></div>';
    showEditor({creating:true});return;
  }
  const r=state.record;
  const note=r.review_note?`<p class="help"><strong>Administrator note:</strong> ${esc(r.review_note)}</p>`:'';
  host.innerHTML=`<div class="panel-head"><div><span class="eyebrow">Property status</span><h2>${esc(r.business_name)}</h2><p>${esc(r.island||'Baa Atoll')} · ${esc(r.registration_number||'Registration number not set')}</p></div><span class="${statusClass(r.status)}">${esc(statusText(r.status))}</span></div>${note}<div class="form-actions"><button class="button aqua" id="editBusinessProfile" type="button">Edit business profile</button>${r.status==='verified'&&r.is_active?'<a class="button secondary" href="operator-content.html">Listings & rooms</a><a class="button secondary" href="operator-calendar.html">Rates & availability</a>':''}${['changes_requested','rejected'].includes(r.status)?'<button class="button secondary" id="statusResubmit" type="button">Resubmit for review</button>':''}</div>`;
  document.getElementById('editBusinessProfile')?.addEventListener('click',()=>showEditor());
  document.getElementById('statusResubmit')?.addEventListener('click',resubmitBusiness);
  if(!state.editing)hideEditor();
}

async function renderImages(){
  const host=document.getElementById('businessImagePreviews');host.replaceChildren();
  if(!state.record)return;
  const {data,error}=await state.client.from('business_images').select('id,storage_path,caption,sort_order').eq('business_id',state.record.id).order('sort_order');
  if(error){setPageMessage(pageMessage,error.message,'error');return;}
  const records=[];
  if(state.record.logo_path)records.push({kind:'logo',bucket:'business-logos',path:state.record.logo_path,label:'Business logo'});
  (data||[]).forEach((row)=>records.push({kind:'gallery',bucket:'business-gallery',path:row.storage_path,label:row.caption||'Business photograph',id:row.id}));
  for(const record of records){
    const url=await signedImageUrl(record.bucket,record.path);if(!url)continue;
    const card=document.createElement('div');card.className='preview';card.innerHTML=`<img src="${esc(url)}" alt="${esc(record.label)}"><button class="button small danger preview-action" type="button">Remove</button>`;
    card.querySelector('button').addEventListener('click',()=>removeBusinessMedia(record));host.append(card);
  }
}

async function removeBusinessMedia(record){
  if(!confirm(`Remove this ${record.kind==='logo'?'business logo':'business photograph'}?`))return;
  try{
    if(record.kind==='logo'){
      const {error}=await state.client.from('businesses').update({logo_path:null}).eq('id',state.record.id);if(error)throw error;state.record.logo_path=null;
    }else{
      const {error}=await state.client.from('business_images').delete().eq('id',record.id);if(error)throw error;
    }
    await removeImage(record.bucket,record.path);await renderImages();setPageMessage(pageMessage,'Business image removed.','success');
  }catch(error){setPageMessage(pageMessage,error.message,'error');}
}

async function loadRecord(){
  if(!state.business){state.record=null;renderBusinessCards();renderStatus();return;}
  const {data,error}=await state.client.from('businesses').select('*').eq('id',state.business.id).maybeSingle();
  if(error)throw error;state.record=data||null;state.editing=false;state.creating=false;renderBusinessCards();renderStatus();if(state.record)await renderImages();
}

async function refreshBusinesses(preferredId=''){
  state.businesses=await loadOwnedBusinesses();
  if(preferredId)rememberBusiness(preferredId);
  state.business=state.businesses.find((item)=>item.id===(preferredId||localStorage.getItem('baa_operator_business_id')))||state.businesses.find(ownerBusiness)||null;
  fillBusinessSwitcher(businessSwitcher,state.businesses.filter(ownerBusiness),state.business);
  await loadRecord();
}

async function saveBusiness(event){
  event.preventDefault();
  const creating=state.creating||!state.record;
  if(creating&&(!document.getElementById('businessAccuracyConfirmed').checked||!document.getElementById('businessTermsAccepted').checked)){
    setPageMessage(pageMessage,'Confirm the information is accurate and accept the platform terms before registering the business.','error');return;
  }
  let createdId='';
  try{
    setBusy(true,creating?'Submitting…':'Saving…');
    const logo=validateImages(document.getElementById('businessLogo').files,{multiple:false})[0]||null;
    const gallery=validateImages(document.getElementById('businessGallery').files);
    const payload={
      contact_person_name:val('contactPersonName'),business_name:val('businessName'),registration_number:val('registrationNumber'),
      category:state.record?.category||'other_tourism_service',island:val('businessIsland'),email:val('businessEmail'),phone:val('businessPhone'),
      website_url:nullable('websiteUrl'),business_address:val('businessAddress'),latitude:numberOrNull('businessLatitude'),longitude:numberOrNull('businessLongitude'),
      description:val('businessDescription'),public_contact:document.getElementById('publicContact').checked,
      accuracy_confirmed:true,terms_accepted:true
    };
    let result;
    if(creating)result=await state.client.from('businesses').insert(payload).select().single();
    else result=await state.client.from('businesses').update(payload).eq('id',state.record.id).select().single();
    if(result.error)throw result.error;
    const saved=result.data;createdId=saved.id;
    if(logo){
      const path=await uploadImage('business-logos',logo,state.user.id,saved.id);
      const update=await state.client.from('businesses').update({logo_path:path}).eq('id',saved.id).select().single();
      if(update.error){await removeImage('business-logos',path);throw update.error;}
    }
    let order=0;
    if(!creating){const existing=await state.client.from('business_images').select('sort_order').eq('business_id',saved.id).order('sort_order',{ascending:false}).limit(1);if(!existing.error&&existing.data?.length)order=Number(existing.data[0].sort_order||0)+1;}
    for(const file of gallery){const path=await uploadImage('business-gallery',file,state.user.id,saved.id);const insert=await state.client.from('business_images').insert({business_id:saved.id,storage_path:path,caption:file.name,sort_order:order++});if(insert.error){await removeImage('business-gallery',path);throw insert.error;}}
    hideEditor();await refreshBusinesses(saved.id);setPageMessage(pageMessage,creating?'Business registration submitted for administrator review.':'Business profile saved.','success');
  }catch(error){
    if(creating&&createdId){rememberBusiness(createdId);await refreshBusinesses(createdId).catch(()=>{});setPageMessage(pageMessage,`Business registration was created, but part of the media update failed: ${error.message}`,'warning');}
    else setPageMessage(pageMessage,error.message,'error');
  }finally{setBusy(false);}
}

async function resubmitBusiness(){
  if(!state.record||!['changes_requested','rejected'].includes(state.record.status))return;
  if(!confirm('Resubmit the updated business profile for administrator review?'))return;
  try{const {data,error}=await state.client.rpc('submit_business',{p_business_id:state.record.id});if(error)throw error;state.record=data;await refreshBusinesses(state.record.id);setPageMessage(pageMessage,'Business profile resubmitted for review.','success');}
  catch(error){setPageMessage(pageMessage,error.message,'error');}
}

function bind(){
  form.addEventListener('submit',saveBusiness);
  document.getElementById('cancelBusinessEdit').addEventListener('click',()=>{hideEditor();renderStatus();});
  document.getElementById('resubmitBusinessButton').addEventListener('click',resubmitBusiness);
  document.getElementById('registerAnotherBusiness').addEventListener('click',()=>showEditor({creating:true}));
  document.getElementById('businessLogo').addEventListener('change',()=>{const file=document.getElementById('businessLogo').files?.[0];document.getElementById('logoHelp').textContent=file?`${file.name} selected. It will upload when you save.`:'JPG, PNG or WebP; maximum 5 MB.';});
  document.getElementById('businessGallery').addEventListener('change',()=>{const count=document.getElementById('businessGallery').files?.length||0;document.getElementById('galleryHelp').textContent=count?`${count} image${count===1?'':'s'} selected. They will upload when you save.`:'Add property and business photographs.';});
}

async function init(){
  try{
    const base=await initializeOperatorPage('property');Object.assign(state,base);
    state.businesses=state.businesses.filter(ownerBusiness);state.business=state.businesses.find((x)=>x.id===base.business?.id)||state.businesses[0]||null;
    fillBusinessSwitcher(businessSwitcher,state.businesses,state.business);
    bindBusinessSwitcher(businessSwitcher,state,async()=>{state.editing=false;state.creating=false;await loadRecord();});
    bind();renderBusinessCards();await loadRecord();
  }catch(error){setPageMessage(pageMessage,error.message||'Could not open Property.','error');}
}
init();
