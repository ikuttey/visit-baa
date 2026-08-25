import {initializeOperatorPage,bindBusinessSwitcher,setPageMessage,businessCan,formatMoney,localDateString,addDays} from './operator-shell.js';

const state={client:null,user:null,businesses:[],business:null,bookings:[],payments:[],analytics:null};
const message=document.getElementById('pageMessage');
const businessSwitcher=document.getElementById('businessSwitcher');
function esc(v){return String(v??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function text(id,v){const n=document.getElementById(id);if(n)n.textContent=String(v);}
function moneyMap(values,empty='—'){const entries=Object.entries(values||{}).filter(([,amount])=>Number.isFinite(Number(amount)));return entries.length?entries.map(([currency,amount])=>formatMoney(amount,currency)).join(' · '):empty;}
function bookingTitle(b){return b.listing_title_snapshot||b.listings?.title||'Booking';}
function dateLabel(b){return b.check_out_date?`${b.requested_date} → ${b.check_out_date}`:b.requested_date;}
function statusLabel(v){return String(v||'').replaceAll('_',' ');}

function renderActions(){
  const host=document.getElementById('overviewActions');host.replaceChildren();
  const actions=[];
  if(businessCan(state.business,'reservations'))actions.push(['operator-reservations.html','Reservations']);
  if(businessCan(state.business,'calendar'))actions.push(['operator-calendar.html','Rates & availability']);
  if(businessCan(state.business,'messages'))actions.push(['operator-inbox.html','Inbox']);
  if(['owner','admin'].includes(state.business?.access_role||'owner'))actions.push(['operator-dashboard.html?tab=business','Property']);
  if(businessCan(state.business,'content'))actions.push(['operator-rates.html#promotions','Promotions']);
  if(businessCan(state.business,'analytics'))actions.push(['operator-analytics.html','Analytics']);
  actions.forEach(([href,label],index)=>{const a=document.createElement('a');a.href=href;a.className=`button ${index===0?'aqua':'secondary'}`;a.textContent=label;host.append(a);});
}

function renderAttention(){
  const host=document.getElementById('attentionList');
  const now=Date.now();
  const items=[];
  state.bookings.filter((b)=>b.status==='new'||b.quote_status==='availability_confirmation_required').forEach((b)=>items.push({priority:1,title:`New · ${bookingTitle(b)}`,meta:`${b.guest_full_name} · ${dateLabel(b)}`,id:b.id}));
  state.bookings.filter((b)=>b.hold_status==='active'&&b.hold_expires_at&&new Date(b.hold_expires_at).getTime()-now<6*3600e3).forEach((b)=>items.push({priority:2,title:`Hold expiring · ${bookingTitle(b)}`,meta:`${b.guest_full_name} · ${new Date(b.hold_expires_at).toLocaleString()}`,id:b.id}));
  state.payments.filter((p)=>p.status==='submitted').forEach((p)=>{const b=state.bookings.find((x)=>x.id===p.booking_id);items.push({priority:1,title:`Payment reference · ${b?bookingTitle(b):'Booking'}`,meta:`${p.currency} ${Number(p.amount).toFixed(2)} · ${p.payment_reference}`,id:p.booking_id});});
  items.sort((a,b)=>a.priority-b.priority);
  if(!items.length){host.innerHTML='<div class="empty-state"><strong>Nothing urgent</strong><span>No new booking requests, expiring holds or submitted payment references need attention.</span></div>';return;}
  host.innerHTML=`<div class="reservation-list">${items.slice(0,12).map((item)=>`<a class="reservation-row" href="operator-reservations.html?id=${encodeURIComponent(item.id)}"><div><strong>${esc(item.title)}</strong><span>${esc(item.meta)}</span></div><span>Open →</span></a>`).join('')}</div>`;
}

function renderUpcoming(){
  const host=document.getElementById('upcomingList');const today=localDateString();
  const rows=state.bookings.filter((b)=>['accepted','confirmed'].includes(b.status)&&b.requested_date>=today).sort((a,b)=>String(a.requested_date).localeCompare(String(b.requested_date))).slice(0,10);
  if(!rows.length){host.innerHTML='<div class="empty-state"><strong>No upcoming bookings</strong><span>Accepted and confirmed reservations will appear here.</span></div>';return;}
  host.innerHTML=`<div class="reservation-list">${rows.map((b)=>`<a class="reservation-row" href="operator-reservations.html?id=${encodeURIComponent(b.id)}"><div><strong>${esc(bookingTitle(b))}</strong><span>${esc(b.guest_full_name)} · ${esc(dateLabel(b))}</span></div><span class="status ${esc(statusLabel(b.status).replaceAll(' ','-'))}">${esc(statusLabel(b.status))}</span></a>`).join('')}</div>`;
}

function renderMetrics(){
  const a=state.analytics||{};const today=localDateString();
  text('oNew',state.bookings.filter((b)=>b.status==='new').length);
  text('oArrivals',state.bookings.filter((b)=>['accepted','confirmed'].includes(b.status)&&b.requested_date===today).length);
  text('oPayment',state.payments.filter((p)=>p.status==='submitted').length);
  text('oConfirmed',a.confirmed_bookings??0);text('oValue',moneyMap(a.confirmed_value_by_currency));text('oOccupancy',a.occupancy_percent==null?'—':`${a.occupancy_percent}%`);text('oADR',moneyMap(a.adr_by_currency));text('oCancel',`${a.cancellation_rate??0}%`);text('oViews',a.listing_views??0);text('oConversion',`${a.conversion_percent??0}%`);
}

async function loadBusinessData(){
  if(!state.business)return;setPageMessage(message,'Loading overview…','loading');
  try{
    const bookingResult=await state.client.from('booking_enquiries').select('id,listing_id,guest_full_name,requested_date,check_out_date,status,quote_status,hold_status,hold_expires_at,payment_status,listing_title_snapshot,listings(title)').eq('business_id',state.business.id).gte('requested_date',addDays(localDateString(),-60)).order('requested_date');
    if(bookingResult.error)throw bookingResult.error;state.bookings=bookingResult.data||[];
    const ids=state.bookings.map((b)=>b.id);state.payments=[];
    if(ids.length&&(businessCan(state.business,'reservations')||businessCan(state.business,'finance'))){const paymentResult=await state.client.from('payment_references').select('id,booking_id,amount,currency,payment_reference,status').in('booking_id',ids).order('created_at',{ascending:false});if(paymentResult.error)throw paymentResult.error;state.payments=paymentResult.data||[];}
    if(businessCan(state.business,'analytics')){const to=localDateString(),from=addDays(to,-29);const result=await state.client.rpc('operator_business_analytics',{p_business_id:state.business.id,p_from:from,p_to:to});if(result.error)throw result.error;state.analytics=result.data||{};}else state.analytics={};
    renderActions();renderAttention();renderUpcoming();renderMetrics();setPageMessage(message,'');
  }catch(error){setPageMessage(message,error.message||'Could not load overview.','error');}
}

async function init(){try{const base=await initializeOperatorPage('overview');Object.assign(state,base);bindBusinessSwitcher(businessSwitcher,state,loadBusinessData);await loadBusinessData();}catch(error){setPageMessage(message,error.message||'Could not open operator overview.','error');}}
init();
