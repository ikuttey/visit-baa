import {
  initializeOperatorPage,
  bindBusinessSwitcher,
  formatMoney,
  localDateString,
  addDays,
  setPageMessage
} from './operator-shell.js';

const state={client:null,user:null,businesses:[],business:null,summary:null,listings:[]};
const message=document.getElementById('pageMessage');
const businessSwitcher=document.getElementById('businessSwitcher');
const fromInput=document.getElementById('analyticsFrom');
const toInput=document.getElementById('analyticsTo');

function setText(id,value){const node=document.getElementById(id);if(node)node.textContent=value;}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

function defaultDates(days=30){
  const to=localDateString();
  const from=addDays(to,-Math.max(0,days-1));
  fromInput.value=from;toInput.value=to;
}

function renderSummary(){
  const a=state.summary||{};
  const currency=state.listings.find((item)=>item.revenue>0)?.currency||'USD';
  setText('aRevenue',formatMoney(a.confirmed_revenue||0,currency));
  setText('aBookings',a.confirmed_bookings??0);
  setText('aOccupancy',a.occupancy_percent==null?'—':`${a.occupancy_percent}%`);
  setText('aADR',a.adr==null?'—':formatMoney(a.adr,currency));
  setText('aCancel',`${a.cancellation_rate??0}%`);
  setText('aConversion',`${a.conversion_percent??0}%`);
  setText('aStay',`${a.average_stay??0} nights`);
  setText('aLead',`${a.average_lead_days??0} days`);
  setText('aArrivals',a.arrivals_today??0);

  const funnel=document.getElementById('demandFunnel');
  if(funnel){
    const views=Number(a.listing_views||0),requests=Number(a.bookings||0),confirmed=Number(a.confirmed_bookings||0);
    const rows=[['Listing views',views],['Booking requests',requests],['Confirmed bookings',confirmed]];
    const max=Math.max(1,...rows.map(([,v])=>v));
    funnel.innerHTML=rows.map(([label,value])=>`<div class="funnel-row"><div class="funnel-label"><span>${escapeHtml(label)}</span><strong>${value}</strong></div><div class="funnel-track"><span style="width:${Math.max(value?4:0,Math.round(value/max*100))}%"></span></div></div>`).join('');
  }
}

function renderListings(){
  const container=document.getElementById('listingPerformance');
  if(!container)return;
  if(!state.listings.length){container.innerHTML='<div class="empty-state"><strong>No listing performance yet</strong><span>Views and reservations will appear here as travelers use your listings.</span></div>';return;}
  container.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Listing</th><th>Views</th><th>Requests</th><th>Confirmed</th><th>Conversion</th><th>Recorded value</th></tr></thead><tbody>${state.listings.map((item)=>`<tr><td><strong>${escapeHtml(item.title)}</strong><small class="table-subline">${escapeHtml(String(item.category||'').replaceAll('_',' '))}</small></td><td>${item.views??0}</td><td>${item.enquiries??0}</td><td>${item.confirmed??0}</td><td>${item.conversion_percent??0}%</td><td>${formatMoney(item.revenue||0,'USD')}</td></tr>`).join('')}</tbody></table></div>`;
}

async function loadAnalytics(){
  if(!state.business)return;
  setPageMessage(message,'Loading analytics…','loading');
  try{
    const from=fromInput.value||addDays(localDateString(),-29);
    const to=toInput.value||localDateString();
    const [summaryResult,listResult]=await Promise.all([
      state.client.rpc('operator_business_analytics',{p_business_id:state.business.id,p_from:from,p_to:to}),
      state.client.rpc('operator_listing_analytics',{p_business_id:state.business.id,p_from:from,p_to:to})
    ]);
    if(summaryResult.error)throw summaryResult.error;
    if(listResult.error)throw listResult.error;
    state.summary=summaryResult.data||{};
    state.listings=listResult.data||[];
    renderSummary();renderListings();setPageMessage(message,'');
  }catch(error){setPageMessage(message,error.message||'Could not load analytics.','error');}
}

function bindEvents(){
  document.getElementById('applyAnalytics')?.addEventListener('click',loadAnalytics);
  document.querySelectorAll('[data-preset]').forEach((button)=>button.addEventListener('click',()=>{defaultDates(Number(button.dataset.preset||30));loadAnalytics();}));
}

async function init(){
  try{
    const base=await initializeOperatorPage('analytics');Object.assign(state,base);
    bindBusinessSwitcher(businessSwitcher,state,loadAnalytics);
    defaultDates(30);bindEvents();
    await loadAnalytics();
  }catch(error){setPageMessage(message,error.message||'Could not open analytics.','error');}
}

init();
