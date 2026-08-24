import { requireSupabase } from './supabase-client.js';

const form=document.getElementById('listingForm');
const editor=document.getElementById('listingEditor');
const table=document.getElementById('listingTable');
const businessSwitcher=document.getElementById('businessSwitcher');
const listingId=document.getElementById('listingId');
if(!form||!editor||!table||!businessSwitcher||!listingId){
  console.warn('Listing enhancements skipped: workspace DOM not found.');
}else{
  const client=requireSupabase();
  let activeKey='';
  let dirty=false;
  let saveTimer=null;
  let recoveryFor='';

  const css=document.createElement('style');
  css.textContent=`
    .listing-health{display:grid;grid-template-columns:minmax(180px,.65fr) 1.35fr auto;gap:16px;align-items:center;padding:14px 16px;margin:0 0 16px;border:1px solid #dbe8e5;border-radius:16px;background:#f8fcfb}
    .listing-health strong{display:block;color:#082b32}.listing-health small{display:block;color:#6d8286;margin-top:4px}.listing-health-track{height:9px;background:#e4efed;border-radius:999px;overflow:hidden}.listing-health-track span{display:block;height:100%;background:#0c7c86;border-radius:inherit;transition:width .2s ease}.listing-health-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.listing-recovery{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:12px;background:#fff8df;border:1px solid #eadb9c}.listing-recovery[hidden]{display:none}.listing-recovery-actions{display:flex;gap:7px}.listing-health-missing{grid-column:1/-1;color:#6a7d81;font-size:12px}.table-actions [data-duplicate-v2]{white-space:nowrap}@media(max-width:760px){.listing-health{grid-template-columns:1fr}.listing-health-actions{justify-content:flex-start}.listing-recovery{align-items:flex-start;flex-direction:column}}
  `;
  document.head.append(css);

  const health=document.createElement('div');
  health.className='listing-health';
  health.innerHTML=`<div><strong id="listingCompleteness">0% complete</strong><small id="listingDraftStatus">Local recovery ready</small></div><div><div class="listing-health-track"><span id="listingCompletenessBar" style="width:0%"></span></div></div><div class="listing-health-actions"><button type="button" class="button small secondary" id="previewCurrentDraft">Preview current draft</button></div><div class="listing-health-missing" id="listingMissing"></div><div class="listing-recovery" id="listingRecovery" hidden><span><strong>Unsaved local draft found</strong><small>This browser has newer unsaved form changes for this listing.</small></span><div class="listing-recovery-actions"><button type="button" class="button small secondary" id="dismissRecovery">Dismiss</button><button type="button" class="button small aqua" id="restoreRecovery">Restore</button></div></div>`;
  const tabs=document.getElementById('editorTabs');
  if(tabs)tabs.before(health);else form.prepend(health);

  function currentKey(){
    const business=businessSwitcher.value||'none';
    const id=listingId.value||'new';
    return `visit_baa_listing_draft:${business}:${id}`;
  }
  function serialize(){
    const values={};
    [...form.elements].forEach((node)=>{
      if(!node.id||node.type==='file'||node.type==='button'||node.type==='submit')return;
      if(node.type==='checkbox')values[node.id]=node.checked;
      else if(node.type==='radio'){if(node.checked)values[node.id]=node.value;}
      else values[node.id]=node.value;
    });
    const roomRows=[...document.querySelectorAll('#roomsTable tbody tr')].map((row)=>row.innerText.trim()).filter(Boolean);
    return {version:1,changedAt:new Date().toISOString(),values,roomRows,coverSrc:document.querySelector('#coverPreview img')?.src||'',businessId:businessSwitcher.value||'',listingId:listingId.value||''};
  }
  function apply(snapshot){
    const values=snapshot?.values||{};
    Object.entries(values).forEach(([id,value])=>{
      const node=document.getElementById(id);if(!node||node.type==='file')return;
      if(node.type==='checkbox')node.checked=Boolean(value);else node.value=value??'';
      node.dispatchEvent(new Event('change',{bubbles:true}));
    });
    dirty=true;updateCompleteness();scheduleSave();
  }
  function scheduleSave(){
    clearTimeout(saveTimer);saveTimer=setTimeout(()=>{
      if(!dirty||editor.hidden)return;
      const key=currentKey();localStorage.setItem(key,JSON.stringify(serialize()));
      document.getElementById('listingDraftStatus').textContent=`Recovery saved ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
      dirty=false;
    },500);
  }
  function clearRecovery(){
    const key=currentKey();localStorage.removeItem(key);dirty=false;
    document.getElementById('listingRecovery').hidden=true;
    document.getElementById('listingDraftStatus').textContent='Saved to Visit Baa';
  }
  function checkRecovery(force=false){
    const key=currentKey();if(!force&&key===recoveryFor)return;recoveryFor=key;
    const raw=localStorage.getItem(key);const box=document.getElementById('listingRecovery');
    if(!raw){box.hidden=true;return;}
    try{const snap=JSON.parse(raw);box.hidden=false;box.dataset.key=key;box.dataset.snapshot=raw;}catch{localStorage.removeItem(key);box.hidden=true;}
  }
  function nonEmpty(id){return Boolean(String(document.getElementById(id)?.value||'').trim());}
  function updateCompleteness(){
    if(editor.hidden)return;
    const category=document.getElementById('listingCategory')?.value||'';
    const pricingMode=document.getElementById('listingPricingMode')?.value||'';
    const priceUnit=document.getElementById('listingPriceUnit')?.value||'';
    const checks=[
      ['Title',nonEmpty('listingTitle'),10],['Summary',nonEmpty('listingSummary'),10],['Description',nonEmpty('listingDescription'),15],['Island and category',nonEmpty('listingIsland')&&nonEmpty('listingCategory'),5],
      ['Pricing',pricingMode==='components_only'||priceUnit==='price_on_request'||nonEmpty('listingPrice'),15],['Capacity',Number(document.getElementById('maxCapacity')?.value||0)>0,5],
      ['Customer details',nonEmpty('includedItems')||nonEmpty('meetingPoint')||nonEmpty('requirements'),5],['Cancellation / policy',nonEmpty('cancellationInformation')||nonEmpty('policyCancellationType'),10],
      [category==='accommodation'?'Room types':'Service details',category==='accommodation'?document.querySelectorAll('#roomsTable tbody tr').length>0:(nonEmpty('serviceDuration')||nonEmpty('startTime')||nonEmpty('meetingPoint')),15],
      ['Cover image',Boolean(document.querySelector('#coverPreview img')),10]
    ];
    const score=checks.reduce((sum,[,ok,w])=>sum+(ok?w:0),0);const missing=checks.filter(([,ok])=>!ok).map(([name])=>name);
    document.getElementById('listingCompleteness').textContent=`${score}% complete`;
    document.getElementById('listingCompletenessBar').style.width=`${score}%`;
    document.getElementById('listingMissing').textContent=missing.length?`Still useful before submission: ${missing.join(' · ')}`:'Ready for review checks.';
  }

  function rowListingId(row){
    const live=row.querySelector('a[href*="listing.html?id="]');
    if(live){try{return new URL(live.href,location.href).searchParams.get('id')||'';}catch{}}
    return row.querySelector('[data-withdraw]')?.dataset.withdraw||row.querySelector('[data-revise]')?.dataset.revise||row.querySelector('[data-edit]')?.dataset.edit||'';
  }
  function enhanceRows(){
    table.querySelectorAll('tbody tr').forEach((row)=>{
      if(row.querySelector('[data-duplicate-v2]'))return;
      const id=rowListingId(row);const actions=row.querySelector('.table-actions');if(!id||!actions)return;
      const button=document.createElement('button');button.type='button';button.className='button small secondary';button.dataset.duplicateV2=id;button.textContent='Duplicate';
      button.addEventListener('click',async()=>{
        button.disabled=true;button.textContent='Duplicating…';
        const {data,error}=await client.rpc('duplicate_operator_listing',{p_listing_id:id});
        if(error){button.disabled=false;button.textContent='Duplicate';alert(error.message);return;}
        const newId=data?.id||data?.[0]?.id||'';
        location.href=`operator-content.html${newId?`?listing=${encodeURIComponent(newId)}`:''}`;
      });
      actions.append(button);
    });
  }

  document.getElementById('previewCurrentDraft').addEventListener('click',()=>{
    const snap=serialize();
    sessionStorage.setItem('visit_baa_listing_preview',JSON.stringify(snap));
    window.open('operator-listing-preview.html','_blank','noopener');
  });
  document.getElementById('restoreRecovery').addEventListener('click',()=>{
    const raw=document.getElementById('listingRecovery').dataset.snapshot;if(!raw)return;
    try{apply(JSON.parse(raw));document.getElementById('listingRecovery').hidden=true;document.getElementById('listingDraftStatus').textContent='Recovered local changes';}catch(error){console.error(error);}
  });
  document.getElementById('dismissRecovery').addEventListener('click',()=>{localStorage.removeItem(currentKey());document.getElementById('listingRecovery').hidden=true;});

  form.addEventListener('input',()=>{dirty=true;updateCompleteness();scheduleSave();});
  form.addEventListener('change',()=>{dirty=true;updateCompleteness();scheduleSave();});
  const tableObserver=new MutationObserver(enhanceRows);tableObserver.observe(table,{childList:true,subtree:true});enhanceRows();
  const editorObserver=new MutationObserver(()=>{if(!editor.hidden){setTimeout(()=>{updateCompleteness();checkRecovery(true);},60);}});editorObserver.observe(editor,{attributes:true,attributeFilter:['hidden'],childList:true,subtree:true});
  setInterval(()=>{const key=currentKey();if(key!==activeKey){activeKey=key;setTimeout(()=>{updateCompleteness();checkRecovery(true);},100);}},350);

  const successObserver=new MutationObserver(()=>{
    const text=`${document.getElementById('editorMessage')?.textContent||''} ${document.getElementById('pageMessage')?.textContent||''}`.toLowerCase();
    if(/listing saved|submitted|revision submitted|draft saved/.test(text))clearRecovery();
  });
  ['editorMessage','pageMessage'].forEach((id)=>{const node=document.getElementById(id);if(node)successObserver.observe(node,{childList:true,characterData:true,subtree:true});});
  setTimeout(()=>{enhanceRows();updateCompleteness();checkRecovery(true);},250);
}
