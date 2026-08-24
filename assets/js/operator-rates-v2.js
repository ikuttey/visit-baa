import {
  initializeOperatorPage,bindBusinessSwitcher,setPageMessage,formatMoney,localDateString,addDays
} from './operator-shell.js';

const state={client:null,user:null,businesses:[],business:null,listings:[],listing:null,rooms:[],ratePlans:[],promotions:[]};
const message=document.getElementById('pageMessage');
const businessSwitcher=document.getElementById('businessSwitcher');
const listingSelect=document.getElementById('listingSelect');
const rateEditor=document.getElementById('rateEditor');
const promotionEditor=document.getElementById('promotionEditor');
const editableStatuses=new Set(['draft','changes_requested','rejected','paused']);
const dayNames=[['1','Monday'],['2','Tuesday'],['3','Wednesday'],['4','Thursday'],['5','Friday'],['6','Saturday'],['7','Sunday']];

function esc(value){return String(value??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function splitList(value){return String(value||'').split(',').map((x)=>x.trim()).filter(Boolean);}
function nullableNumber(id){const value=document.getElementById(id).value;return value===''?null:Number(value);}
function statusText(value){return String(value||'').replaceAll('_',' ');}
function selectedListing(){return state.listings.find((item)=>item.id===listingSelect.value)||null;}
function listingEditable(){return state.listing&&editableStatuses.has(state.listing.status);}
function roomById(id){return state.rooms.find((r)=>r.id===id)||null;}

function renderDayChoices(){
  const box=document.getElementById('promotionDays');box.replaceChildren();
  dayNames.forEach(([value,label])=>{const wrap=document.createElement('label');wrap.className='checkbox';wrap.innerHTML=`<input type="checkbox" value="${value}"><span>${label}</span>`;box.append(wrap);});
}

function fillListingSelect(){
  listingSelect.replaceChildren();
  if(!state.listings.length){listingSelect.append(new Option('No listings',''));listingSelect.disabled=true;return;}
  state.listings.forEach((item)=>listingSelect.append(new Option(`${item.title} — ${statusText(item.status)}`,item.id)));
  listingSelect.disabled=false;
  const remembered=sessionStorage.getItem('baa_rates_listing_id');
  listingSelect.value=state.listings.some((x)=>x.id===remembered)?remembered:state.listings[0].id;
  state.listing=selectedListing();
}

function fillRateRoomSelect(selected=''){
  const select=document.getElementById('rateRoom');select.replaceChildren();
  state.rooms.forEach((room)=>select.append(new Option(`${room.name} — ${formatMoney(room.base_price,room.currency)}`,room.id)));
  if(selected&&state.rooms.some((r)=>r.id===selected))select.value=selected;
  updateParentOptions();renderOccupancyInputs();
}

function updateParentOptions(){
  const roomId=document.getElementById('rateRoom').value;
  const currentId=document.getElementById('rateId').value;
  const select=document.getElementById('rateParent');select.replaceChildren();select.append(new Option('Choose base rate',''));
  state.ratePlans.filter((plan)=>plan.room_id===roomId&&plan.id!==currentId).forEach((plan)=>select.append(new Option(plan.name,plan.id)));
}

function renderOccupancyInputs(values={}){
  const box=document.getElementById('occupancyPricing');box.replaceChildren();
  const room=roomById(document.getElementById('rateRoom').value);if(!room)return;
  const max=Math.min(8,Number(room.maximum_guests||1));
  for(let guests=1;guests<=max;guests+=1){const field=document.createElement('div');field.className='field';field.innerHTML=`<label for="occ-${guests}">${guests} guest${guests===1?'':'s'}</label><input id="occ-${guests}" data-occ="${guests}" type="number" min="0" step="0.01" placeholder="Normal rate" value="${values[String(guests)]??''}">`;box.append(field);}
}

function ratePriceLabel(plan){
  if(plan.pricing_mode==='derived_percent')return `${Number(plan.adjustment_value)>=0?'+':''}${Number(plan.adjustment_value)}% from base`;
  if(plan.pricing_mode==='derived_amount')return `${Number(plan.adjustment_value)>=0?'+':''}${formatMoney(plan.adjustment_value,roomById(plan.room_id)?.currency||'USD')} from base`;
  return formatMoney(plan.nightly_price,roomById(plan.room_id)?.currency||'USD');
}

function renderRatePlans(){
  const container=document.getElementById('ratePlansTable');
  const lock=document.getElementById('rateLockMessage');
  const newButton=document.getElementById('newRatePlan');
  if(!state.listing||state.listing.category!=='accommodation'){
    lock.hidden=true;newButton.disabled=true;container.innerHTML='<div class="empty-state"><strong>Accommodation rate plans only</strong><span>Select an accommodation listing. Other service prices remain operator-controlled in the listing, with promotions available below.</span></div>';return;
  }
  const editable=listingEditable();newButton.disabled=!editable||!state.rooms.length;
  lock.hidden=editable;lock.textContent=editable?'':'Rate-plan structure is locked while this listing is published or pending review. Calendar prices and promotions can still be managed without changing the approved listing structure.';
  if(!state.ratePlans.length){container.innerHTML='<div class="empty-state"><strong>No rate plans yet</strong><span>Create a flexible, non-refundable, meal-plan or derived rate while the listing is editable.</span></div>';return;}
  container.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Room</th><th>Rate plan</th><th>Price</th><th>Meal</th><th>Stay rules</th><th>Status</th><th>Action</th></tr></thead><tbody>${state.ratePlans.map((plan)=>`<tr><td>${esc(roomById(plan.room_id)?.name||'Room')}</td><td><strong>${esc(plan.name)}</strong><small class="table-subline">${esc(statusText(plan.cancellation_type||'flexible'))}</small></td><td>${esc(ratePriceLabel(plan))}</td><td>${esc(statusText(plan.meal_plan_code||plan.meal_plan||'room_only'))}</td><td>${plan.minimum_stay?`Min ${plan.minimum_stay} night${plan.minimum_stay===1?'':'s'}`:'No minimum'}${plan.maximum_stay?` · Max ${plan.maximum_stay}`:''}</td><td>${plan.is_active?'Active':'Inactive'}</td><td>${editable?`<button class="button small secondary" data-edit-rate="${plan.id}" type="button">Edit</button>`:'Locked'}</td></tr>`).join('')}</tbody></table></div>`;
  container.querySelectorAll('[data-edit-rate]').forEach((button)=>button.addEventListener('click',()=>openRateEditor(state.ratePlans.find((p)=>p.id===button.dataset.editRate))));
}

function renderPromotions(){
  const container=document.getElementById('promotionsTable');
  if(!state.listing){container.innerHTML='';return;}
  if(!state.promotions.length){container.innerHTML='<div class="empty-state"><strong>No promotions yet</strong><span>Create a time-limited offer when you want to stimulate demand.</span></div>';return;}
  container.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Promotion</th><th>Discount</th><th>Stay dates</th><th>Booking window</th><th>Rules</th><th>Status</th><th>Action</th></tr></thead><tbody>${state.promotions.map((p)=>`<tr><td><strong>${esc(p.name)}</strong><small class="table-subline">${esc(statusText(p.promotion_kind))}</small></td><td>${p.discount_type==='percent'?`${p.discount_value}%`:formatMoney(p.discount_value,state.listing.currency)}</td><td>${esc(p.valid_from)} → ${esc(p.valid_until)}</td><td>${p.booking_from||p.booking_until?`${esc(p.booking_from||'Any')} → ${esc(p.booking_until||'Any')}`:'Any booking date'}</td><td>${p.minimum_nights?`Min ${p.minimum_nights} nights`:''}${p.minimum_lead_days!=null?` · ${p.minimum_lead_days}+ days ahead`:''}${p.maximum_lead_days!=null?` · ≤${p.maximum_lead_days} days ahead`:''}</td><td>${p.is_active?'Active':'Inactive'}</td><td><button class="button small secondary" data-edit-promo="${p.id}" type="button">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
  container.querySelectorAll('[data-edit-promo]').forEach((button)=>button.addEventListener('click',()=>openPromotionEditor(state.promotions.find((p)=>p.id===button.dataset.editPromo))));
}

function togglePricingFields(){
  const mode=document.getElementById('ratePricingMode').value;
  document.getElementById('rateFixedField').hidden=mode!=='fixed';
  document.getElementById('rateParentField').hidden=mode==='fixed';
  document.getElementById('rateAdjustmentField').hidden=mode==='fixed';
}

function openRateEditor(plan=null){
  if(!listingEditable())return;
  document.getElementById('rateForm').reset();document.getElementById('rateActive').checked=true;
  document.getElementById('rateId').value=plan?.id||'';document.getElementById('rateEditorTitle').textContent=plan?'Edit rate plan':'New rate plan';
  fillRateRoomSelect(plan?.room_id||state.rooms[0]?.id||'');
  if(plan){
    document.getElementById('rateRoom').value=plan.room_id;updateParentOptions();
    document.getElementById('rateName').value=plan.name||'';document.getElementById('ratePricingMode').value=plan.pricing_mode||'fixed';
    document.getElementById('rateNightlyPrice').value=plan.nightly_price??'';document.getElementById('rateParent').value=plan.parent_rate_plan_id||'';document.getElementById('rateAdjustment').value=plan.adjustment_value??0;
    document.getElementById('rateMealPlan').value=plan.meal_plan_code||plan.meal_plan||'room_only';document.getElementById('rateCancellationType').value=plan.cancellation_type||(!plan.is_refundable?'non_refundable':'flexible');
    document.getElementById('rateCancellationHours').value=plan.cancellation_deadline_hours??'';document.getElementById('rateCancellationPenalty').value=plan.cancellation_penalty||'';
    document.getElementById('rateMinStay').value=plan.minimum_stay??'';document.getElementById('rateMaxStay').value=plan.maximum_stay??'';document.getElementById('rateMinAdvance').value=plan.min_advance_hours??'';document.getElementById('rateMaxAdvance').value=plan.max_advance_days??'';
    document.getElementById('rateBenefits').value=(plan.benefits||[]).join(', ');document.getElementById('rateActive').checked=Boolean(plan.is_active);renderOccupancyInputs(plan.occupancy_pricing||{});
  }
  togglePricingFields();rateEditor.hidden=false;rateEditor.scrollIntoView({behavior:'smooth',block:'start'});
}

function openPromotionEditor(p=null){
  document.getElementById('promotionForm').reset();document.getElementById('promotionActive').checked=true;document.getElementById('promotionPriority').value='100';
  document.getElementById('promotionId').value=p?.id||'';document.getElementById('promotionEditorTitle').textContent=p?'Edit promotion':'New promotion';
  const rateSelect=document.getElementById('promotionRatePlan');rateSelect.replaceChildren(new Option('All rate plans / listing price',''));
  state.ratePlans.forEach((plan)=>rateSelect.append(new Option(`${roomById(plan.room_id)?.name||'Room'} · ${plan.name}`,plan.id)));
  document.querySelectorAll('#promotionDays input').forEach((i)=>{i.checked=false;});
  if(p){
    document.getElementById('promotionKind').value=p.promotion_kind||'custom';document.getElementById('promotionName').value=p.name||'';rateSelect.value=p.applies_to_rate_plan_id||'';
    document.getElementById('promotionDiscountType').value=p.discount_type||'percent';document.getElementById('promotionDiscountValue').value=p.discount_value??'';document.getElementById('promotionPriority').value=p.priority??100;
    document.getElementById('promotionStayFrom').value=p.valid_from||'';document.getElementById('promotionStayUntil').value=p.valid_until||'';document.getElementById('promotionMinNights').value=p.minimum_nights??'';
    document.getElementById('promotionBookingFrom').value=p.booking_from||'';document.getElementById('promotionBookingUntil').value=p.booking_until||'';document.getElementById('promotionMinLead').value=p.minimum_lead_days??'';document.getElementById('promotionMaxLead').value=p.maximum_lead_days??'';
    document.getElementById('promotionStacking').value=p.stacking_mode||'best_only';document.getElementById('promotionDescription').value=p.description||'';document.getElementById('promotionActive').checked=Boolean(p.is_active);
    const days=new Set((p.days_of_week||[]).map(String));document.querySelectorAll('#promotionDays input').forEach((i)=>{i.checked=days.has(i.value);});
  }else{
    const today=localDateString();document.getElementById('promotionStayFrom').value=today;document.getElementById('promotionStayUntil').value=addDays(today,30);
  }
  promotionEditor.hidden=false;promotionEditor.scrollIntoView({behavior:'smooth',block:'start'});
}

function applyPromotionTemplate(){
  const kind=document.getElementById('promotionKind').value;
  const name=document.getElementById('promotionName');if(!name.value)name.value=({early_bird:'Early Bird',last_minute:'Last Minute',long_stay:'Long Stay',weekend:'Weekend Offer',seasonal:'Seasonal Offer',custom:'Custom Offer'})[kind];
  if(kind==='early_bird'&&document.getElementById('promotionMinLead').value==='')document.getElementById('promotionMinLead').value='30';
  if(kind==='last_minute'&&document.getElementById('promotionMaxLead').value==='')document.getElementById('promotionMaxLead').value='7';
  if(kind==='long_stay'&&document.getElementById('promotionMinNights').value==='')document.getElementById('promotionMinNights').value='3';
  if(kind==='weekend'){const defaults=new Set(['5','6']);document.querySelectorAll('#promotionDays input').forEach((i)=>{i.checked=defaults.has(i.value);});}
}

async function saveRate(event){
  event.preventDefault();if(!listingEditable())return;
  const room=roomById(document.getElementById('rateRoom').value);if(!room)throw new Error('Choose a room type.');
  const mode=document.getElementById('ratePricingMode').value;const parentId=document.getElementById('rateParent').value||null;const adjustment=Number(document.getElementById('rateAdjustment').value||0);
  if(mode!=='fixed'&&!parentId)throw new Error('Choose a base rate plan for a derived rate.');
  const parent=state.ratePlans.find((p)=>p.id===parentId);let nightly=nullableNumber('rateNightlyPrice');
  if(mode!=='fixed'){const base=Number(parent?.nightly_price??room.base_price??0);nightly=mode==='derived_percent'?Math.max(0,base*(1+adjustment/100)):Math.max(0,base+adjustment);nightly=Math.round(nightly*100)/100;}
  if(nightly==null||nightly<0)throw new Error('Enter a valid nightly price.');
  const occupancy={};document.querySelectorAll('[data-occ]').forEach((input)=>{if(input.value!=='')occupancy[input.dataset.occ]=Number(input.value);});
  const cancellation=document.getElementById('rateCancellationType').value;
  const payload={room_id:room.id,name:document.getElementById('rateName').value.trim(),nightly_price:nightly,meal_plan:document.getElementById('rateMealPlan').value,meal_plan_code:document.getElementById('rateMealPlan').value,free_cancellation:cancellation==='flexible',is_refundable:cancellation!=='non_refundable',cancellation_type:cancellation,cancellation_deadline_hours:nullableNumber('rateCancellationHours'),cancellation_penalty:document.getElementById('rateCancellationPenalty').value.trim()||null,pricing_mode:mode,parent_rate_plan_id:mode==='fixed'?null:parentId,adjustment_value:mode==='fixed'?0:adjustment,minimum_stay:nullableNumber('rateMinStay'),maximum_stay:nullableNumber('rateMaxStay'),min_advance_hours:nullableNumber('rateMinAdvance'),max_advance_days:nullableNumber('rateMaxAdvance'),benefits:splitList(document.getElementById('rateBenefits').value),occupancy_pricing:occupancy,is_active:document.getElementById('rateActive').checked};
  const id=document.getElementById('rateId').value;const result=id?await state.client.from('room_rate_plans').update(payload).eq('id',id):await state.client.from('room_rate_plans').insert(payload);
  if(result.error)throw result.error;rateEditor.hidden=true;await loadListingData();setPageMessage(message,'Rate plan saved.','success');
}

async function savePromotion(event){
  event.preventDefault();if(!state.listing)return;
  const days=[...document.querySelectorAll('#promotionDays input:checked')].map((i)=>Number(i.value));
  const payload={listing_id:state.listing.id,promotion_kind:document.getElementById('promotionKind').value,name:document.getElementById('promotionName').value.trim(),description:document.getElementById('promotionDescription').value.trim()||null,discount_type:document.getElementById('promotionDiscountType').value,discount_value:Number(document.getElementById('promotionDiscountValue').value),valid_from:document.getElementById('promotionStayFrom').value,valid_until:document.getElementById('promotionStayUntil').value,minimum_nights:nullableNumber('promotionMinNights'),booking_from:document.getElementById('promotionBookingFrom').value||null,booking_until:document.getElementById('promotionBookingUntil').value||null,applies_to_rate_plan_id:document.getElementById('promotionRatePlan').value||null,minimum_lead_days:nullableNumber('promotionMinLead'),maximum_lead_days:nullableNumber('promotionMaxLead'),days_of_week:days.length?days:null,stacking_mode:document.getElementById('promotionStacking').value,priority:Number(document.getElementById('promotionPriority').value||100),is_active:document.getElementById('promotionActive').checked};
  const id=document.getElementById('promotionId').value;const result=id?await state.client.from('promotions').update(payload).eq('id',id):await state.client.from('promotions').insert(payload);
  if(result.error)throw result.error;promotionEditor.hidden=true;await loadListingData();setPageMessage(message,'Promotion saved.','success');
}

async function loadListingData(){
  state.listing=selectedListing();if(!state.listing){state.rooms=[];state.ratePlans=[];state.promotions=[];renderRatePlans();renderPromotions();return;}
  sessionStorage.setItem('baa_rates_listing_id',state.listing.id);setPageMessage(message,'Loading rates and promotions…','loading');
  const roomsResult=state.listing.category==='accommodation'?await state.client.from('accommodation_rooms').select('*').eq('listing_id',state.listing.id).order('sort_order').order('name'):{data:[],error:null};
  if(roomsResult.error)throw roomsResult.error;state.rooms=roomsResult.data||[];
  const rateResult=state.rooms.length?await state.client.from('room_rate_plans').select('*').in('room_id',state.rooms.map((r)=>r.id)).order('sort_order').order('name'):{data:[],error:null};
  if(rateResult.error)throw rateResult.error;state.ratePlans=rateResult.data||[];
  const promoResult=await state.client.from('promotions').select('*').eq('listing_id',state.listing.id).order('created_at',{ascending:false});if(promoResult.error)throw promoResult.error;state.promotions=promoResult.data||[];
  renderRatePlans();renderPromotions();setPageMessage(message,'');
}

async function loadBusiness(){
  if(!state.business){state.listings=[];fillListingSelect();return;}
  const {data,error}=await state.client.from('listings').select('id,title,category,status,currency,is_active').eq('business_id',state.business.id).order('title');if(error)throw error;state.listings=data||[];fillListingSelect();await loadListingData();
}

function bindEvents(){
  listingSelect.addEventListener('change',()=>loadListingData().catch((e)=>setPageMessage(message,e.message,'error')));
  document.getElementById('newRatePlan').addEventListener('click',()=>openRateEditor());document.getElementById('closeRateEditor').addEventListener('click',()=>{rateEditor.hidden=true;});document.getElementById('cancelRate').addEventListener('click',()=>{rateEditor.hidden=true;});
  document.getElementById('rateRoom').addEventListener('change',()=>{updateParentOptions();renderOccupancyInputs();});document.getElementById('ratePricingMode').addEventListener('change',togglePricingFields);document.getElementById('rateForm').addEventListener('submit',(e)=>saveRate(e).catch((err)=>setPageMessage(message,err.message,'error')));
  document.getElementById('newPromotion').addEventListener('click',()=>openPromotionEditor());document.getElementById('closePromotionEditor').addEventListener('click',()=>{promotionEditor.hidden=true;});document.getElementById('cancelPromotion').addEventListener('click',()=>{promotionEditor.hidden=true;});document.getElementById('promotionKind').addEventListener('change',applyPromotionTemplate);document.getElementById('promotionForm').addEventListener('submit',(e)=>savePromotion(e).catch((err)=>setPageMessage(message,err.message,'error')));
}

async function init(){
  try{renderDayChoices();const base=await initializeOperatorPage('rates');Object.assign(state,base);bindBusinessSwitcher(businessSwitcher,state,loadBusiness);bindEvents();await loadBusiness();}
  catch(error){setPageMessage(message,error.message||'Could not open rates and promotions.','error');}
}
init();
