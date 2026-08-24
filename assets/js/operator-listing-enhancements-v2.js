const form=document.getElementById('listingForm');
if(!form)throw new Error('Listing form not found');

const listingId=document.getElementById('listingId');
const editor=document.getElementById('listingEditor');
const fields=[
  ['listingTitle','Title'],['listingCategory','Category'],['listingIsland','Island'],['listingPrice','Price'],['listingPriceUnit','Price unit'],
  ['listingMaxCapacity','Capacity'],['listingSummary','Summary'],['listingDescription','Description'],['meetingPoint','Meeting point'],['cancellationInformation','Cancellation policy']
];
let saveTimer;

function esc(value=''){return String(value).replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function key(){return `baa_listing_autosave_${listingId?.value||'new'}`;}
function serialize(){
  const data={savedAt:new Date().toISOString(),values:{}};
  [...form.elements].forEach((element)=>{
    if(!element.id||element.type==='file'||element.type==='submit'||element.type==='button'||element.id==='listingId')return;
    if(element.type==='checkbox'||element.type==='radio')data.values[element.id]=element.checked;
    else data.values[element.id]=element.value;
  });
  return data;
}
function store(){try{localStorage.setItem(key(),JSON.stringify(serialize()));updateAutosaveLabel();}catch(error){console.debug('Listing autosave unavailable',error);}}
function scheduleStore(){clearTimeout(saveTimer);saveTimer=setTimeout(store,650);updateCompleteness();}
function savedDraft(){try{return JSON.parse(localStorage.getItem(key())||'null');}catch{return null;}}
function restore(){
  const draft=savedDraft();if(!draft?.values)return;
  Object.entries(draft.values).forEach(([id,value])=>{const element=document.getElementById(id);if(!element||element.disabled)return;if(element.type==='checkbox'||element.type==='radio')element.checked=Boolean(value);else element.value=value??'';element.dispatchEvent(new Event('change',{bubbles:true}));});
  updateCompleteness();updateAutosaveLabel('Restored autosaved values');
}

function hasValue(id){const element=document.getElementById(id);if(!element)return false;if(element.type==='checkbox')return element.checked;return String(element.value||'').trim().length>0;}
function updateCompleteness(){
  const completed=fields.filter(([id])=>hasValue(id)).length;const percent=Math.round(completed/fields.length*100);
  document.getElementById('listingCompletenessValue').textContent=`${percent}% complete`;
  document.getElementById('listingCompletenessBar').style.width=`${percent}%`;
  const missing=fields.filter(([id])=>!hasValue(id)).map(([,label])=>label);
  document.getElementById('listingCompletenessHelp').textContent=missing.length?`Still useful to add: ${missing.slice(0,4).join(', ')}${missing.length>4?'…':''}`:'Core customer information is complete.';
}
function updateAutosaveLabel(override=''){
  const node=document.getElementById('listingAutosaveStatus');if(!node)return;if(override){node.textContent=override;return;}
  const draft=savedDraft();node.textContent=draft?.savedAt?`Autosaved ${new Date(draft.savedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:'Autosave ready';
  const restoreButton=document.getElementById('restoreListingDraft');if(restoreButton)restoreButton.hidden=!draft;
}

function preview(){
  let dialog=document.getElementById('listingPreviewDialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='listingPreviewDialog';dialog.className='dialog';dialog.innerHTML='<div class="dialog-body"><div class="dialog-head"><div><span class="eyebrow">Customer preview</span><h2>Listing preview</h2></div><button class="icon-button" type="button" data-close-preview>×</button></div><div id="listingPreviewBody"></div><div class="form-actions"><button class="button secondary" type="button" data-close-preview>Close preview</button></div></div>';document.body.append(dialog);dialog.querySelectorAll('[data-close-preview]').forEach((button)=>button.addEventListener('click',()=>dialog.close()));}
  const currency=document.getElementById('listingCurrency')?.value||'USD';const price=document.getElementById('listingPrice')?.value||'—';const unit=document.getElementById('listingPriceUnit')?.selectedOptions?.[0]?.textContent||'';
  document.getElementById('listingPreviewBody').innerHTML=`<article class="panel" style="box-shadow:none"><span class="eyebrow">${esc(document.getElementById('listingCategory')?.selectedOptions?.[0]?.textContent||'Listing')} · ${esc(document.getElementById('listingIsland')?.value||'Baa Atoll')}</span><h2 style="margin-top:8px">${esc(document.getElementById('listingTitle')?.value||'Untitled listing')}</h2><p>${esc(document.getElementById('listingSummary')?.value||'Add a short summary so customers immediately understand the experience.')}</p><div class="summary-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:20px 0"><div class="summary-card"><strong style="font-size:22px">${esc(currency)} ${esc(price)}</strong><span>${esc(unit)}</span></div><div class="summary-card"><strong style="font-size:22px">${esc(document.getElementById('listingMaxCapacity')?.value||'—')}</strong><span>Maximum capacity</span></div><div class="summary-card"><strong style="font-size:22px">${esc(document.getElementById('listingStartTime')?.value||'Flexible')}</strong><span>Starting time</span></div></div><h3>Description</h3><p>${esc(document.getElementById('listingDescription')?.value||'No full description yet.')}</p><h3>Meeting point</h3><p>${esc(document.getElementById('meetingPoint')?.value||'Not specified yet.')}</p><h3>Cancellation</h3><p>${esc(document.getElementById('cancellationInformation')?.value||'Not specified yet.')}</p></article>`;
  dialog.showModal();
}

function install(){
  if(document.getElementById('listingEnhancementBar'))return;
  const bar=document.createElement('section');bar.id='listingEnhancementBar';bar.className='panel';bar.style.margin='0 0 18px';bar.innerHTML='<div class="panel-head" style="margin-bottom:12px"><div><h3>Listing readiness</h3><p id="listingCompletenessHelp">Checking listing…</p></div><div class="table-actions"><button class="button small secondary" id="restoreListingDraft" type="button" hidden>Restore autosave</button><button class="button small secondary" id="previewListing" type="button">Preview as customer</button></div></div><div style="height:8px;border-radius:99px;background:#e8f0ee;overflow:hidden"><span id="listingCompletenessBar" style="display:block;height:100%;width:0;background:var(--sea);transition:.2s"></span></div><div style="display:flex;justify-content:space-between;gap:12px;margin-top:8px"><strong id="listingCompletenessValue">0% complete</strong><small id="listingAutosaveStatus">Autosave ready</small></div>';
  form.parentElement.insertBefore(bar,form);
  document.getElementById('restoreListingDraft').addEventListener('click',restore);document.getElementById('previewListing').addEventListener('click',preview);
  form.addEventListener('input',scheduleStore);form.addEventListener('change',scheduleStore);
  document.getElementById('newListingButton')?.addEventListener('click',()=>setTimeout(()=>{updateCompleteness();updateAutosaveLabel();},50));
  document.getElementById('listingsTable')?.addEventListener('click',()=>setTimeout(()=>{updateCompleteness();updateAutosaveLabel();},80));
  updateCompleteness();updateAutosaveLabel();
}

install();
