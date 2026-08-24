import { requireOperator } from './auth.js';

const root=document.getElementById('previewRoot');
function esc(value){return String(value??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function list(value){return String(value||'').split(',').map((x)=>x.trim()).filter(Boolean);}
function money(value,currency='USD'){if(value===''||value==null)return 'Price on request';const n=Number(value);if(Number.isNaN(n))return 'Price on request';try{return new Intl.NumberFormat('en-US',{style:'currency',currency}).format(n);}catch{return `${currency} ${n.toFixed(2)}`;}}

async function init(){
  try{await requireOperator();}catch{root.innerHTML='<div class="preview-empty"><h1>Sign in required</h1><p>Open this preview from the operator workspace after signing in.</p></div>';return;}
  const token=new URLSearchParams(location.search).get('preview')||'';
  const key=token?`visit_baa_listing_preview:${token}`:'';
  const raw=key?localStorage.getItem(key):null;
  if(!raw){root.innerHTML='<div class="preview-empty"><h1>No draft preview available</h1><p>Return to Listings and choose “Preview current draft”.</p></div>';return;}
  let snap;
  try{snap=JSON.parse(raw);}catch{localStorage.removeItem(key);root.innerHTML='<div class="preview-empty"><h1>Preview data could not be read</h1></div>';return;}
  localStorage.removeItem(key);
  if(!snap?.expiresAt||Date.now()>Number(snap.expiresAt)){root.innerHTML='<div class="preview-empty"><h1>Draft preview expired</h1><p>Return to Listings and create a new preview.</p></div>';return;}
  const v=snap.values||{};const title=v.listingTitle||'Untitled listing';const summary=v.listingSummary||'';const description=v.listingDescription||'';const category=String(v.listingCategory||'listing').replaceAll('_',' ');const island=v.listingIsland||'';const currency=v.listingCurrency||'USD';const price=(v.listingPricingMode==='components_only'||v.listingPriceUnit==='price_on_request')?null:v.listingPrice;
  const included=list(v.includedItems),amenities=list(v.amenities);const details=[v.meetingPoint&&`Meeting point: ${v.meetingPoint}`,v.requirements&&`Requirements: ${v.requirements}`,v.cancellationInformation&&`Cancellation: ${v.cancellationInformation}`].filter(Boolean);
  root.innerHTML=`<article class="preview-hero"><div class="preview-cover" ${snap.coverSrc?`style="background-image:url('${esc(snap.coverSrc)}')"`:''}>${snap.coverSrc?'':'Cover image preview'}</div><div class="preview-content"><div class="preview-meta"><span>${esc(category)}</span>${island?`<span>· ${esc(island)}</span>`:''}</div><h1>${esc(title)}</h1><p>${esc(summary)}</p><div class="preview-price">${esc(money(price,currency))}${v.listingPriceUnit?` <small>· ${esc(String(v.listingPriceUnit).replaceAll('_',' '))}</small>`:''}</div></div></article><div class="preview-grid"><section class="preview-card"><h2>About</h2><p>${esc(description||'No description yet.')}</p>${included.length?`<h3>Included</h3><div class="preview-list">${included.map((x)=>`<span>${esc(x)}</span>`).join('')}</div>`:''}${amenities.length?`<h3>Facilities / amenities</h3><div class="preview-list">${amenities.map((x)=>`<span>${esc(x)}</span>`).join('')}</div>`:''}</section><aside class="preview-card"><h2>Booking details</h2>${details.length?details.map((x)=>`<p>${esc(x)}</p>`).join(''):'<p>Add service, meeting and policy details to improve this preview.</p>'}${snap.roomRows?.length?`<h3>Room types</h3>${snap.roomRows.map((x)=>`<p>${esc(x)}</p>`).join('')}`:''}</aside></div>`;
}
init();