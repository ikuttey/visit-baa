import { requireSupabase } from './supabase-client.js';
import { COMPONENT_PRESETS, ALL_PRICE_UNITS, priceUnitLabel } from './pricing.js';

const client=requireSupabase();
const listingId=document.getElementById('listingId');
const editor=document.getElementById('listingEditor');
const editorMessage=document.getElementById('editorMessage');
const listingCategory=document.getElementById('listingCategory');
const listingKind=document.getElementById('listingKind');
const pricingMode=document.getElementById('listingPricingMode');
const submitButton=document.getElementById('submitListing');
const saveButton=document.getElementById('saveListing');
const form=document.getElementById('listingForm');

if(!listingId||!editor||!listingCategory||!listingKind||!form){
  console.warn('Advanced listing editor skipped: required DOM not found.');
}else{
  const advanced={activityTypes:[],selectedActivities:new Set(),components:[],deletedComponents:new Set(),loadedId:'',dirty:false,persisting:false,allowCoreSubmit:false,transportLocations:[]};
  const componentTypeOptions=COMPONENT_PRESETS.map((x)=>`<option value="${x.type}">${x.name}</option>`).join('');
  const priceUnitOptions=ALL_PRICE_UNITS.map((unit)=>`<option value="${unit}">${priceUnitLabel(unit)}</option>`).join('');

  function esc(value=''){return String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function currentId(){return listingId.value||'';}
  function checkedActivities(){return [...document.querySelectorAll('[name="listingActivity"]:checked')].map((x)=>x.value);}
  function packageActive(){return listingCategory.value==='excursion'&&listingKind.value==='excursion_package';}
  function componentPricingActive(){return ['components_only','main_plus_components'].includes(pricingMode.value);}

  function installUi(){
    if(document.getElementById('advancedListingActivityPanel'))return;
    const serviceSection=document.querySelector('[data-editor-section="service"]');
    const packageFields=document.getElementById('packageFields');
    const activity=document.createElement('section');
    activity.id='advancedListingActivityPanel';activity.className='settings-section';
    activity.innerHTML=`<h3>Activities included</h3><p class="help">Choose the structured activities this service provides. Excursion packages require at least two.</p><div id="listingActivityChoices" class="checkbox-grid"></div>`;
    if(packageFields)packageFields.insertAdjacentElement('afterend',activity);else serviceSection?.append(activity);

    const core=document.querySelector('[data-editor-section="core"]');
    const components=document.createElement('section');components.id='priceComponentPanel';components.className='settings-section';components.style.marginTop='18px';
    components.innerHTML=`<div class="panel-head"><div><h3>Separate charges</h3><p>Use this for guide fees, transfer/boat costs, tickets, equipment and other required or optional charges.</p></div><button class="button secondary" id="addPriceComponent" type="button">Add charge</button></div><div id="priceComponentList"></div><div id="priceComponentEditor" hidden><div class="form-grid three"><input id="componentId" type="hidden"><div class="field"><label for="componentType">Charge type</label><select id="componentType">${componentTypeOptions}</select></div><div class="field"><label for="componentName">Name</label><input id="componentName" maxlength="120"></div><div class="field"><label for="componentStatus">Customer sees it as</label><select id="componentStatus"><option value="required">Required</option><option value="optional">Optional</option><option value="included">Included in main price</option></select></div><div class="field"><label for="componentAmount">Amount</label><input id="componentAmount" type="number" min="0" step="0.01"></div><div class="field"><label for="componentUnit">Price unit</label><select id="componentUnit">${priceUnitOptions}</select></div><div class="field"><label for="componentGroupCapacity">People per group</label><input id="componentGroupCapacity" type="number" min="1"></div><div class="field full"><label for="componentDescription">Customer description</label><textarea id="componentDescription" maxlength="500"></textarea></div></div><div class="form-actions"><button class="button aqua" id="savePriceComponent" type="button">Save charge</button><button class="button secondary" id="cancelPriceComponent" type="button">Cancel</button></div></div>`;
    core?.append(components);

    const transfer=document.getElementById('transferFields');
    if(transfer){
      const extra=document.createElement('div');extra.className='form-grid three';extra.style.marginTop='12px';extra.innerHTML=`<div class="field"><label for="routeServiceType">Service type</label><select id="routeServiceType"><option value="shared">Shared</option><option value="private">Private</option><option value="both">Shared + private</option></select></div><div class="field"><label for="routePricingModel">Pricing model</label><select id="routePricingModel"><option value="per_person">Per person</option><option value="per_trip">Per trip</option><option value="per_boat">Per boat</option><option value="fixed">Fixed</option></select></div><div class="field"><label for="routeMinimumPassengers">Minimum passengers</label><input id="routeMinimumPassengers" type="number" min="1" value="1"></div><div class="field"><label for="routePrivatePrice">Private price</label><input id="routePrivatePrice" type="number" min="0" step="0.01"></div><div class="field"><label for="routeInfantPrice">Infant price</label><input id="routeInfantPrice" type="number" min="0" step="0.01"></div><fieldset class="field full"><legend class="fieldset-title">Operating days</legend><div id="routeOperatingDays" class="checkbox-grid"></div></fieldset>`;transfer.append(extra);
    }

    if(packageFields){
      const extra=document.createElement('div');extra.className='form-grid three';extra.style.marginTop='12px';extra.innerHTML=`<fieldset class="field full"><legend class="fieldset-title">Operating days</legend><div id="packageOperatingDays" class="checkbox-grid"></div></fieldset><div class="field full"><label class="checkbox"><input id="packageEquipmentIncluded" type="checkbox"><span>Equipment included</span></label></div><div class="field full"><label class="checkbox"><input id="packageMealIncluded" type="checkbox"><span>Meal included</span></label></div><div class="field full"><label class="checkbox"><input id="packageWaterIncluded" type="checkbox"><span>Drinking water included</span></label></div><div class="field full"><label class="checkbox"><input id="packageAirportPickup" type="checkbox"><span>Airport pickup available</span></label></div><div class="field full"><label for="packageDropoffNotes">Drop-off notes</label><textarea id="packageDropoffNotes" maxlength="1000"></textarea></div>`;packageFields.append(extra);
    }

    installDayChecks('routeOperatingDays');installDayChecks('packageOperatingDays');
    installTransportDatalist();bindUi();updateVisibility();
  }

  function installDayChecks(id){const host=document.getElementById(id);if(!host)return;const names=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];host.replaceChildren();names.forEach((name,index)=>{const label=document.createElement('label');label.className='checkbox';label.innerHTML=`<input type="checkbox" value="${index}" checked><span>${name}</span>`;host.append(label);});}
  function setDays(id,values){const selected=new Set((values?.length?values:[0,1,2,3,4,5,6]).map(Number));document.querySelectorAll(`#${id} input`).forEach((x)=>x.checked=selected.has(Number(x.value)));}
  function getDays(id){return [...document.querySelectorAll(`#${id} input:checked`)].map((x)=>Number(x.value));}

  async function installTransportDatalist(){
    try{const {data}=await client.from('public_transport_locations').select('name,island_name,location_type').order('sort_order');advanced.transportLocations=data||[];}catch{advanced.transportLocations=[];}
    if(!advanced.transportLocations.length)return;
    let dl=document.getElementById('transportLocationOptions');if(!dl){dl=document.createElement('datalist');dl.id='transportLocationOptions';document.body.append(dl);}dl.innerHTML=advanced.transportLocations.map((x)=>`<option value="${esc(x.name)}">${esc(x.island_name||x.location_type||'')}</option>`).join('');
    ['routeOrigin','routeDestination','routeDeparturePoint','routeArrivalPoint','meetingPoint'].forEach((id)=>document.getElementById(id)?.setAttribute('list','transportLocationOptions'));
  }

  function renderActivities(){
    const host=document.getElementById('listingActivityChoices');if(!host)return;
    const cat=listingCategory.value;const eligible=advanced.activityTypes.filter((a)=>!Array.isArray(a.listing_categories)||!a.listing_categories.length||a.listing_categories.includes(cat));
    host.innerHTML=eligible.length?eligible.map((a)=>`<label class="checkbox"><input name="listingActivity" type="checkbox" value="${esc(a.slug)}"${advanced.selectedActivities.has(a.slug)?' checked':''}><span><strong>${esc(a.name)}</strong>${a.description?`<small>${esc(a.description)}</small>`:''}</span></label>`).join(''):'<span class="help">No structured activity types are available for this category.</span>';
    host.querySelectorAll('input').forEach((input)=>input.addEventListener('change',()=>{advanced.selectedActivities=new Set(checkedActivities());advanced.dirty=true;updateActivityHint();}));
    updateActivityHint();
  }
  function updateActivityHint(){
    let hint=document.getElementById('activitySelectionHint');const panel=document.getElementById('advancedListingActivityPanel');if(!panel)return;
    if(!hint){hint=document.createElement('p');hint.id='activitySelectionHint';hint.className='help';panel.append(hint);}
    const count=checkedActivities().length;hint.textContent=packageActive()?`${count} selected · excursion packages need at least 2 before submission.`:`${count} structured activit${count===1?'y':'ies'} selected.`;
  }

  function renderComponents(){
    const host=document.getElementById('priceComponentList');if(!host)return;
    const visible=advanced.components.filter((c)=>!advanced.deletedComponents.has(c.id||c._key));
    if(!visible.length){host.innerHTML='<div class="empty-inline">No separate charges yet. Add guide, transfer, ticket or equipment charges when needed.</div>';return;}
    host.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Charge</th><th>Type</th><th>Price</th><th>Status</th><th>Action</th></tr></thead><tbody>${visible.map((c)=>`<tr><td><strong>${esc(c.name)}</strong><small class="table-subline">${esc(c.customer_description||'')}</small></td><td>${esc(String(c.component_type||'custom').replaceAll('_',' '))}</td><td>${c.charge_status==='included'?'Included':c.price_unit==='price_on_request'?'Price on request':`${c.currency||document.getElementById('listingCurrency')?.value||'USD'} ${Number(c.amount||0).toFixed(2)} · ${esc(priceUnitLabel(c.price_unit))}`}</td><td>${esc(c.charge_status)}</td><td><button class="button small secondary" type="button" data-component-edit="${esc(c.id||c._key)}">Edit</button> <button class="button small danger" type="button" data-component-delete="${esc(c.id||c._key)}">Remove</button></td></tr>`).join('')}</tbody></table></div>`;
    host.querySelectorAll('[data-component-edit]').forEach((b)=>b.addEventListener('click',()=>openComponent(visible.find((c)=>(c.id||c._key)===b.dataset.componentEdit))));
    host.querySelectorAll('[data-component-delete]').forEach((b)=>b.addEventListener('click',()=>removeComponent(b.dataset.componentDelete)));
  }
  function openComponent(component=null){
    const box=document.getElementById('priceComponentEditor');box.hidden=false;document.getElementById('componentId').value=component?.id||component?._key||'';document.getElementById('componentType').value=component?.component_type||'custom';document.getElementById('componentName').value=component?.name||'';document.getElementById('componentStatus').value=component?.charge_status||'required';document.getElementById('componentAmount').value=component?.amount??'';document.getElementById('componentUnit').value=component?.price_unit||'per_person';document.getElementById('componentGroupCapacity').value=component?.group_capacity??'';document.getElementById('componentDescription').value=component?.customer_description||'';syncComponentFields();box.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function syncComponentFields(){const status=document.getElementById('componentStatus').value;const unit=document.getElementById('componentUnit').value;document.getElementById('componentAmount').disabled=status==='included'||unit==='price_on_request';document.getElementById('componentUnit').disabled=status==='included';document.getElementById('componentGroupCapacity').disabled=status==='included'||unit!=='per_group';}
  function saveComponentLocal(){
    const name=document.getElementById('componentName').value.trim();if(name.length<2){alert('Enter a charge name.');return;}
    const status=document.getElementById('componentStatus').value;const unit=status==='included'?null:document.getElementById('componentUnit').value;const amount=status==='included'||unit==='price_on_request'?null:Number(document.getElementById('componentAmount').value);
    if(status!=='included'&&unit!=='price_on_request'&&(!Number.isFinite(amount)||amount<0)){alert('Enter a valid charge amount.');return;}
    const group=unit==='per_group'?Number(document.getElementById('componentGroupCapacity').value):null;if(unit==='per_group'&&(!Number.isFinite(group)||group<1)){alert('Enter how many people one group price covers.');return;}
    const key=document.getElementById('componentId').value||`local-${crypto.randomUUID()}`;let row=advanced.components.find((x)=>(x.id||x._key)===key);const values={component_type:document.getElementById('componentType').value,name,charge_status:status,amount,currency:document.getElementById('listingCurrency')?.value||'USD',price_unit:unit,group_capacity:group,customer_description:document.getElementById('componentDescription').value.trim()||null,is_active:true};
    if(row)Object.assign(row,values);else advanced.components.push({_key:key,...values});advanced.deletedComponents.delete(key);advanced.dirty=true;document.getElementById('priceComponentEditor').hidden=true;renderComponents();
  }
  function removeComponent(key){const row=advanced.components.find((x)=>(x.id||x._key)===key);if(!row)return;if(row.id)advanced.deletedComponents.add(row.id);else advanced.components=advanced.components.filter((x)=>x!==row);advanced.dirty=true;renderComponents();}

  function bindUi(){
    document.getElementById('addPriceComponent')?.addEventListener('click',()=>openComponent());document.getElementById('savePriceComponent')?.addEventListener('click',saveComponentLocal);document.getElementById('cancelPriceComponent')?.addEventListener('click',()=>document.getElementById('priceComponentEditor').hidden=true);document.getElementById('componentStatus')?.addEventListener('change',syncComponentFields);document.getElementById('componentUnit')?.addEventListener('change',syncComponentFields);
    listingCategory.addEventListener('change',()=>{advanced.dirty=true;renderActivities();updateVisibility();});listingKind.addEventListener('change',()=>{advanced.dirty=true;updateVisibility();updateActivityHint();});pricingMode.addEventListener('change',updateVisibility);
    document.getElementById('listingCurrency')?.addEventListener('change',()=>{advanced.components.forEach((c)=>{c.currency=document.getElementById('listingCurrency').value;});advanced.dirty=true;renderComponents();});
    document.addEventListener('change',(event)=>{if(event.target.closest('#routeOperatingDays,#packageOperatingDays')||['routeServiceType','routePricingModel','routeMinimumPassengers','routePrivatePrice','routeInfantPrice','packageEquipmentIncluded','packageMealIncluded','packageWaterIncluded','packageAirportPickup','packageDropoffNotes'].includes(event.target.id))advanced.dirty=true;});
  }

  function updateVisibility(){
    const activityPanel=document.getElementById('advancedListingActivityPanel');if(activityPanel)activityPanel.hidden=listingCategory.value==='accommodation'||listingCategory.value==='food_dining';
    const componentPanel=document.getElementById('priceComponentPanel');if(componentPanel)componentPanel.hidden=!componentPricingActive();
    const policyTab=document.querySelector('#editorTabs [data-section="policy"]');if(policyTab){policyTab.hidden=listingCategory.value!=='accommodation';if(policyTab.hidden&&policyTab.classList.contains('active'))document.querySelector('#editorTabs [data-section="service"]')?.click();}
  }

  async function loadCatalogs(){const {data,error}=await client.from('public_activity_types').select('slug,name,description,listing_categories,sort_order').order('sort_order');if(!error)advanced.activityTypes=data||[];renderActivities();}

  async function loadAdvanced(id){
    advanced.loadedId=id;advanced.deletedComponents.clear();advanced.dirty=false;
    if(!id){advanced.selectedActivities.clear();advanced.components=[];resetExtraFields();renderActivities();renderComponents();return;}
    const [listing,components,route,pkg]=await Promise.all([
      originalFrom('listings').select('activity_type_slugs').eq('id',id).maybeSingle(),
      originalFrom('listing_price_components').select('*').eq('listing_id',id).order('sort_order'),
      originalFrom('transfer_route_details').select('*').eq('listing_id',id).maybeSingle(),
      originalFrom('listing_package_details').select('*').eq('listing_id',id).maybeSingle()
    ]);
    advanced.selectedActivities=new Set(listing.data?.activity_type_slugs||[]);advanced.components=(components.data||[]).map((x)=>({...x}));populateRouteExtra(route.data||null);populatePackageExtra(pkg.data||null);renderActivities();renderComponents();advanced.dirty=false;
  }
  function resetExtraFields(){setDays('routeOperatingDays',[0,1,2,3,4,5,6]);setDays('packageOperatingDays',[0,1,2,3,4,5,6]);if(document.getElementById('routeServiceType'))document.getElementById('routeServiceType').value='shared';if(document.getElementById('routePricingModel'))document.getElementById('routePricingModel').value='per_person';if(document.getElementById('routeMinimumPassengers'))document.getElementById('routeMinimumPassengers').value='1';['routePrivatePrice','routeInfantPrice','packageDropoffNotes'].forEach((id)=>{if(document.getElementById(id))document.getElementById(id).value='';});['packageEquipmentIncluded','packageMealIncluded','packageWaterIncluded','packageAirportPickup'].forEach((id)=>{if(document.getElementById(id))document.getElementById(id).checked=false;});}
  function populateRouteExtra(r){if(!r){resetExtraFields();return;}document.getElementById('routeServiceType').value=r.service_type||'shared';document.getElementById('routePricingModel').value=r.pricing_model||'per_person';document.getElementById('routeMinimumPassengers').value=r.minimum_passengers??1;document.getElementById('routePrivatePrice').value=r.private_price??'';document.getElementById('routeInfantPrice').value=r.infant_price??'';setDays('routeOperatingDays',r.operating_days);}
  function populatePackageExtra(p){if(!p){setDays('packageOperatingDays',[0,1,2,3,4,5,6]);return;}setDays('packageOperatingDays',p.operating_days);document.getElementById('packageEquipmentIncluded').checked=Boolean(p.equipment_included);document.getElementById('packageMealIncluded').checked=Boolean(p.meal_included);document.getElementById('packageWaterIncluded').checked=Boolean(p.drinking_water_included);document.getElementById('packageAirportPickup').checked=Boolean(p.airport_pickup);document.getElementById('packageDropoffNotes').value=p.dropoff_notes||'';}

  async function persistComponents(){
    const id=currentId();if(!id)return;
    for(const deleted of advanced.deletedComponents){const {error}=await originalFrom('listing_price_components').delete().eq('id',deleted).eq('listing_id',id);if(error)throw error;}
    let order=0;for(const component of advanced.components.filter((c)=>!advanced.deletedComponents.has(c.id||c._key))){const payload={listing_id:id,component_type:component.component_type,name:component.name,charge_status:component.charge_status,amount:component.amount,currency:document.getElementById('listingCurrency')?.value||component.currency||'USD',price_unit:component.price_unit,group_capacity:component.group_capacity,customer_description:component.customer_description,is_active:true,sort_order:order++};let result;if(component.id)result=await originalFrom('listing_price_components').update(payload).eq('id',component.id).select().single();else result=await originalFrom('listing_price_components').insert(payload).select().single();if(result.error)throw result.error;Object.assign(component,result.data);delete component._key;}
    advanced.deletedComponents.clear();renderComponents();
  }
  async function persistAdvanced(){if(advanced.persisting||!currentId())return;advanced.persisting=true;try{await persistComponents();advanced.dirty=false;}finally{advanced.persisting=false;}}

  function validateAdvancedForSubmit(){
    if(packageActive()&&checkedActivities().length<2)throw new Error('Choose at least two structured activities for this excursion package.');
    if(pricingMode.value==='components_only'){const required=advanced.components.filter((c)=>!advanced.deletedComponents.has(c.id||c._key)&&c.charge_status==='required'&&c.is_active!==false);if(!required.length)throw new Error('Built from separate charges requires at least one required charge.');}
  }

  async function waitForDraftSave(timeout=15000){
    const started=Date.now();while(Date.now()-started<timeout){if(currentId()&&/draft saved/i.test(editorMessage?.textContent||'')){await persistAdvanced();return;}if(/error/.test(editorMessage?.className||'')&&editorMessage?.textContent)throw new Error(editorMessage.textContent);await new Promise((r)=>setTimeout(r,100));}throw new Error('The draft did not finish saving. Please try again.');
  }

  submitButton?.addEventListener('click',async(event)=>{
    if(advanced.allowCoreSubmit)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(submitButton.disabled)return;
    submitButton.disabled=true;const old=submitButton.textContent;submitButton.textContent='Preparing…';
    try{
      validateAdvancedForSubmit();
      if(!currentId()){editorMessage.textContent='Saving draft before submission…';editorMessage.hidden=false;editorMessage.className='message loading';form.requestSubmit(saveButton||undefined);await waitForDraftSave();}
      else await persistAdvanced();
      validateAdvancedForSubmit();advanced.allowCoreSubmit=true;submitButton.disabled=false;submitButton.textContent=old;submitButton.click();queueMicrotask(()=>{advanced.allowCoreSubmit=false;});
    }catch(error){submitButton.disabled=false;submitButton.textContent=old;editorMessage.textContent=error.message;editorMessage.hidden=false;editorMessage.className='message error';}
  },true);

  const originalFrom=client.from.bind(client);
  client.from=function(table){
    const builder=originalFrom(table);
    if(table==='listings'){
      const originalInsert=builder.insert.bind(builder);builder.insert=(payload,...args)=>originalInsert(augmentListing(payload),...args);
      const originalUpdate=builder.update.bind(builder);builder.update=(payload,...args)=>originalUpdate(augmentListing(payload),...args);
    }
    if(table==='transfer_route_details'&&builder.upsert){const originalUpsert=builder.upsert.bind(builder);builder.upsert=(payload,...args)=>originalUpsert(augmentRoute(payload),...args);}
    if(table==='listing_package_details'&&builder.upsert){const originalUpsert=builder.upsert.bind(builder);builder.upsert=(payload,...args)=>originalUpsert(augmentPackage(payload),...args);}
    return builder;
  };
  function augmentListing(payload){if(Array.isArray(payload))return payload.map(augmentListing);if(!payload||typeof payload!=='object')return payload;return {...payload,activity_type_slugs:checkedActivities()};}
  function augmentRoute(payload){if(!payload||typeof payload!=='object')return payload;return {...payload,service_type:document.getElementById('routeServiceType')?.value||payload.service_type||'shared',pricing_model:document.getElementById('routePricingModel')?.value||payload.pricing_model||'per_person',minimum_passengers:Math.max(1,Number(document.getElementById('routeMinimumPassengers')?.value||payload.minimum_passengers||1)),private_price:document.getElementById('routePrivatePrice')?.value===''?null:Number(document.getElementById('routePrivatePrice')?.value),infant_price:document.getElementById('routeInfantPrice')?.value===''?null:Number(document.getElementById('routeInfantPrice')?.value),operating_days:getDays('routeOperatingDays')};}
  function augmentPackage(payload){if(!payload||typeof payload!=='object')return payload;return {...payload,operating_days:getDays('packageOperatingDays'),equipment_included:Boolean(document.getElementById('packageEquipmentIncluded')?.checked),meal_included:Boolean(document.getElementById('packageMealIncluded')?.checked),drinking_water_included:Boolean(document.getElementById('packageWaterIncluded')?.checked),airport_pickup:Boolean(document.getElementById('packageAirportPickup')?.checked),dropoff_notes:document.getElementById('packageDropoffNotes')?.value.trim()||null};}

  const idObserver=new MutationObserver(()=>{const id=currentId();if(id!==advanced.loadedId){const oldNewKey=`visit_baa_listing_draft:${document.getElementById('businessSwitcher')?.value||'none'}:new`;if(id)localStorage.removeItem(oldNewKey);loadAdvanced(id).catch((e)=>console.error('Could not load advanced listing details',e));}});idObserver.observe(listingId,{attributes:true,attributeFilter:['value']});
  const editorObserver=new MutationObserver(()=>{if(!editor.hidden){const id=currentId();if(id!==advanced.loadedId)loadAdvanced(id).catch(console.error);updateVisibility();}});editorObserver.observe(editor,{attributes:true,attributeFilter:['hidden']});
  const messageObserver=new MutationObserver(()=>{if(/draft saved/i.test(editorMessage?.textContent||'')&&currentId())persistAdvanced().then(()=>{if(editorMessage?.textContent==='Draft saved.')editorMessage.textContent='Draft and pricing details saved.';}).catch((error)=>{editorMessage.textContent=error.message;editorMessage.className='message error';editorMessage.hidden=false;});});if(editorMessage)messageObserver.observe(editorMessage,{childList:true,characterData:true,subtree:true});

  installUi();loadCatalogs().catch(console.error);loadAdvanced(currentId()).catch(console.error);
}
