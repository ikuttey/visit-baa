import {initializeOperatorPage,bindBusinessSwitcher,setPageMessage} from './operator-shell.js';

const state={client:null,user:null,businesses:[],business:null,accommodations:[],guide:null,preference:null};
const message=document.getElementById('pageMessage');
const businessSwitcher=document.getElementById('businessSwitcher');
const arrivalListing=document.getElementById('arrivalListing');
const arrivalForm=document.getElementById('arrivalForm');
const notificationTypes=[
  ['booking_request','New booking requests'],['booking_cancelled','Booking cancellations'],['customer_message','Customer messages'],['payment_reference','Payment references'],['business_verified','Business approved'],['business_changes_requested','Business changes requested'],['business_rejected','Business rejected'],['business_suspended','Business suspended'],['listing_published','Listing published'],['listing_changes_requested','Listing changes requested'],['listing_rejected','Listing rejected']
];

function esc(value){return String(value??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function value(id){return document.getElementById(id).value.trim();}
function nullableNumber(id){const v=document.getElementById(id).value;return v===''?null:Number(v);}
function renderNotificationTypes(){const box=document.getElementById('notificationTypes');box.replaceChildren();notificationTypes.forEach(([key,label])=>{const item=document.createElement('label');item.className='checkbox';item.innerHTML=`<input type="checkbox" value="${key}" checked><span>${esc(label)}</span>`;box.append(item);});}
function setCheckedTypes(types){const enabled=types==null?null:new Set(types);document.querySelectorAll('#notificationTypes input').forEach((input)=>{input.checked=enabled==null||enabled.has(input.value);});}
function chosenTypes(){const inputs=[...document.querySelectorAll('#notificationTypes input')];const chosen=inputs.filter((x)=>x.checked).map((x)=>x.value);return chosen.length===inputs.length?null:chosen;}

async function loadNotificationPreference(){
  if(!state.business)return;
  const {data,error}=await state.client.from('operator_notification_preferences').select('*').eq('operator_id',state.user.id).eq('business_id',state.business.id).maybeSingle();if(error)throw error;
  state.preference=data||null;document.getElementById('notifyInApp').checked=data?.in_app_enabled??true;document.getElementById('notifyEmail').checked=data?.email_enabled??true;setCheckedTypes(data?.enabled_types??null);
}

async function saveNotificationPreference(event){
  event.preventDefault();if(!state.business)return;
  const payload={operator_id:state.user.id,business_id:state.business.id,in_app_enabled:document.getElementById('notifyInApp').checked,email_enabled:document.getElementById('notifyEmail').checked,enabled_types:chosenTypes(),updated_at:new Date().toISOString()};
  const {error}=await state.client.from('operator_notification_preferences').upsert(payload,{onConflict:'operator_id,business_id'});if(error)throw error;setPageMessage(message,'Notification preferences saved.','success');await loadNotificationPreference();
}

function fillArrivalListings(){
  arrivalListing.replaceChildren();
  if(!state.accommodations.length){arrivalListing.append(new Option('No accommodation listings',''));arrivalListing.disabled=true;arrivalForm.hidden=true;document.getElementById('arrivalEmpty').hidden=false;return;}
  arrivalListing.disabled=false;arrivalForm.hidden=false;document.getElementById('arrivalEmpty').hidden=true;state.accommodations.forEach((listing)=>arrivalListing.append(new Option(`${listing.title} — ${String(listing.status).replaceAll('_',' ')}`,listing.id)));
  const remembered=sessionStorage.getItem('baa_arrival_listing_id');if(state.accommodations.some((x)=>x.id===remembered))arrivalListing.value=remembered;
}

function clearArrivalForm(){arrivalForm.reset();document.getElementById('airportPickupCurrency').value='USD';}
function populateArrival(data){clearArrivalForm();if(!data)return;document.getElementById('receptionHours').value=data.reception_hours||'';document.getElementById('checkInInstructions').value=data.check_in_instructions||'';document.getElementById('earlyCheckIn').value=data.early_check_in||'';document.getElementById('lateCheckIn').value=data.late_check_in||'';document.getElementById('keyCollection').value=data.key_collection||'';document.getElementById('arrivalAirport').value=data.airport_name||'';document.getElementById('airportPickupAvailable').checked=Boolean(data.airport_pickup_available);document.getElementById('airportPickupFee').value=data.airport_pickup_fee??'';document.getElementById('airportPickupCurrency').value=data.airport_pickup_currency||'USD';document.getElementById('airportMeetingPoint').value=data.airport_meeting_point||'';document.getElementById('jettyPickup').value=data.jetty_pickup||'';document.getElementById('luggageInformation').value=data.luggage_information||'';document.getElementById('arrivalDirections').value=data.directions||'';document.getElementById('emergencyContact').value=data.emergency_contact||'';document.getElementById('houseRules').value=data.house_rules||'';}

async function loadArrivalGuide(){
  if(!arrivalListing.value){clearArrivalForm();return;}
  sessionStorage.setItem('baa_arrival_listing_id',arrivalListing.value);const {data,error}=await state.client.from('listing_arrival_guides').select('*').eq('listing_id',arrivalListing.value).maybeSingle();if(error)throw error;state.guide=data||null;populateArrival(state.guide);
}

async function saveArrivalGuide(event){
  event.preventDefault();if(!arrivalListing.value)return;
  const payload={listing_id:arrivalListing.value,reception_hours:value('receptionHours')||null,check_in_instructions:value('checkInInstructions')||null,early_check_in:value('earlyCheckIn')||null,late_check_in:value('lateCheckIn')||null,key_collection:value('keyCollection')||null,airport_name:value('arrivalAirport')||null,airport_pickup_available:document.getElementById('airportPickupAvailable').checked,airport_pickup_fee:nullableNumber('airportPickupFee'),airport_pickup_currency:document.getElementById('airportPickupCurrency').value,airport_meeting_point:value('airportMeetingPoint')||null,jetty_pickup:value('jettyPickup')||null,luggage_information:value('luggageInformation')||null,directions:value('arrivalDirections')||null,emergency_contact:value('emergencyContact')||null,house_rules:value('houseRules')||null,updated_at:new Date().toISOString()};
  const {error}=await state.client.from('listing_arrival_guides').upsert(payload,{onConflict:'listing_id'});if(error)throw error;setPageMessage(message,'Arrival guide saved.','success');await loadArrivalGuide();
}

function changedKeys(changes){
  const before=changes?.before||{},after=changes?.after||{};const ignored=new Set(['updated_at','reviewed_at']);return [...new Set([...Object.keys(before),...Object.keys(after)])].filter((key)=>!ignored.has(key)&&JSON.stringify(before[key])!==JSON.stringify(after[key])).slice(0,8);
}

async function loadAudit(){
  const box=document.getElementById('auditLog');if(!state.business){box.innerHTML='';return;}
  const {data,error}=await state.client.from('operator_audit_log').select('id,listing_id,entity_type,action,changes,created_at').eq('business_id',state.business.id).order('created_at',{ascending:false}).limit(60);if(error)throw error;
  const rows=data||[];if(!rows.length){box.innerHTML='<div class="empty-state"><strong>No activity yet</strong><span>Important business and listing changes will be recorded here.</span></div>';return;}
  box.innerHTML=`<div class="table-wrap"><table><thead><tr><th>When</th><th>Area</th><th>Action</th><th>Changes</th></tr></thead><tbody>${rows.map((row)=>`<tr><td>${esc(new Date(row.created_at).toLocaleString())}</td><td>${esc(String(row.entity_type).replaceAll('_',' '))}</td><td>${esc(row.action)}</td><td>${esc(changedKeys(row.changes).map((key)=>key.replaceAll('_',' ')).join(', ')||'Record updated')}</td></tr>`).join('')}</tbody></table></div>`;
}

async function loadBusinessData(){
  if(!state.business)return;setPageMessage(message,'Loading settings…','loading');
  const {data,error}=await state.client.from('listings').select('id,title,status,category').eq('business_id',state.business.id).eq('category','accommodation').order('title');if(error)throw error;state.accommodations=data||[];fillArrivalListings();
  await Promise.all([loadNotificationPreference(),loadArrivalGuide(),loadAudit()]);setPageMessage(message,'');
}

function bindEvents(){document.getElementById('notificationForm').addEventListener('submit',(e)=>saveNotificationPreference(e).catch((err)=>setPageMessage(message,err.message,'error')));arrivalListing.addEventListener('change',()=>loadArrivalGuide().catch((err)=>setPageMessage(message,err.message,'error')));arrivalForm.addEventListener('submit',(e)=>saveArrivalGuide(e).catch((err)=>setPageMessage(message,err.message,'error')));document.getElementById('refreshAudit').addEventListener('click',()=>loadAudit().catch((err)=>setPageMessage(message,err.message,'error')));}

async function init(){try{renderNotificationTypes();const base=await initializeOperatorPage('settings');Object.assign(state,base);bindBusinessSwitcher(businessSwitcher,state,loadBusinessData);bindEvents();await loadBusinessData();}catch(error){setPageMessage(message,error.message||'Could not open settings.','error');}}
init();
