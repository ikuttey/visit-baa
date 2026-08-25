import { requireSupabase } from './supabase-client.js';
import { installOperatorNavigation,formatMoney,localDateString,addDays } from './operator-shell.js';

const client=requireSupabase();
let timer;

function el(tag,options={}){const node=document.createElement(tag);if(options.className)node.className=options.className;if(options.text!=null)node.textContent=String(options.text);if(options.attrs)Object.entries(options.attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));(options.children||[]).filter(Boolean).forEach((child)=>node.append(child));return node;}
function moneyMap(values,empty='—'){const entries=Object.entries(values||{}).filter(([,amount])=>amount!=null&&Number.isFinite(Number(amount)));return entries.length?entries.map(([currency,amount])=>formatMoney(amount,currency)).join(' · '):empty;}

function installV2Overview(){
  // This enhancer only runs on the historical owner dashboard, which is now
  // the V2 Property page. Treat it as an owner workspace so all V2 links stay
  // visible and Property is highlighted instead of Overview.
  installOperatorNavigation('property',{access_role:'owner'});
  const oldAvailable=document.getElementById('availableSpacesCount');
  if(oldAvailable){const label=oldAvailable.parentElement?.querySelector('span');if(label)label.textContent='Arrivals today';}
  if(document.getElementById('operatorV2Overview'))return;
  const summary=document.querySelector('.summary-grid');if(!summary)return;
  const section=el('section',{className:'panel',attrs:{id:'operatorV2Overview'}});
  section.innerHTML=`<div class="panel-head"><div><span class="eyebrow">Last 30 days</span><h2>Business performance</h2><p>Operational values from confirmed Visit Baa reservations. Visit Baa does not process the operator's money.</p></div><div class="table-actions"><a class="button small secondary" href="operator-reservations.html">Reservations</a><a class="button small secondary" href="operator-calendar.html">Calendar</a><a class="button small aqua" href="operator-analytics.html">Full analytics</a></div></div><div class="operator-metric-grid"><article class="operator-metric"><strong id="ovConfirmed">—</strong><span>Confirmed bookings</span><small>Confirmed / completed / no-show</small></article><article class="operator-metric"><strong id="ovRevenue">—</strong><span>Confirmed value</span><small>Kept separate by currency</small></article><article class="operator-metric"><strong id="ovOccupancy">—</strong><span>Occupancy</span><small>Accommodation only</small></article><article class="operator-metric"><strong id="ovADR">—</strong><span>ADR</span><small>Kept separate by currency</small></article><article class="operator-metric"><strong id="ovCancel">—</strong><span>Cancellation rate</span><small>Selected period</small></article><article class="operator-metric"><strong id="ovViews">—</strong><span>Listing views</span><small>Unique daily visitor views</small></article></div><div class="form-actions"><a class="button aqua" href="operator-reservations.html">Open reservations</a><a class="button secondary" href="operator-calendar.html">Manage calendar</a><a class="button secondary" href="operator-rates.html">Rates & promotions</a><a class="button secondary" href="operator-settings.html">Arrival & settings</a></div>`;
  summary.insertAdjacentElement('afterend',section);
}

function text(id,value){const node=document.getElementById(id);if(node&&node.textContent!==String(value))node.textContent=value;}

async function loadMetrics(businessId){
  if(!businessId)return;
  const to=localDateString(),from=addDays(to,-29);
  const {data,error}=await client.rpc('operator_business_analytics',{p_business_id:businessId,p_from:from,p_to:to});
  if(error){console.error('Overview metrics failed:',error);return;}
  text('ovConfirmed',data?.confirmed_bookings??0);
  text('ovRevenue',moneyMap(data?.confirmed_value_by_currency,'—'));
  text('ovOccupancy',data?.occupancy_percent==null?'—':`${data.occupancy_percent}%`);
  text('ovADR',moneyMap(data?.adr_by_currency,'—'));
  text('ovCancel',`${data?.cancellation_rate??0}%`);
  text('ovViews',data?.listing_views??0);
  text('availableSpacesCount',data?.arrivals_today??0);
}

function selectedBusiness(){const select=document.getElementById('businessSwitcher');return select?.value||localStorage.getItem('baa_operator_business_id')||'';}
function refresh(){clearTimeout(timer);timer=setTimeout(()=>{const id=selectedBusiness();if(id)loadMetrics(id);},180);}

function init(){
  installV2Overview();
  const select=document.getElementById('businessSwitcher');
  if(select)select.addEventListener('change',refresh);
  [250,800,1800].forEach((delay)=>setTimeout(refresh,delay));
  window.addEventListener('focus',refresh);
}

init();
