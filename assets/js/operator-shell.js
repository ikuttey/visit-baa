import { requireSupabase } from './supabase-client.js';
import { logout, requireOperator } from './auth.js';

export const OPERATOR_NAV = [
  ['overview','operator-overview.html','Overview'],
  ['calendar','operator-calendar.html','Calendar / Schedule'],
  ['reservations','operator-reservations.html','Reservations'],
  ['listings','operator-content.html','Listings'],
  ['property','operator-dashboard.html?tab=business','Property'],
  ['rates','operator-rates.html','Rates & Promotions'],
  ['reviews','operator-dashboard.html?tab=reviewsOffers','Reviews & Messages'],
  ['analytics','operator-analytics.html','Analytics'],
  ['settings','operator-settings.html','Settings']
];

function el(tag,options={}){const node=document.createElement(tag);if(options.className)node.className=options.className;if(options.text!=null)node.textContent=String(options.text);if(options.attrs)Object.entries(options.attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));(options.children||[]).filter(Boolean).forEach((child)=>node.append(child));return node;}

export function selectedBusinessId(){return localStorage.getItem('baa_operator_business_id')||'';}
export function rememberBusiness(id){if(id)localStorage.setItem('baa_operator_business_id',id);}

export function businessCan(business,permission){
  const role=business?.access_role||'owner';
  if(['owner','admin','manager'].includes(role))return true;
  if(role==='reservations')return ['reservations','messages','calendar','analytics'].includes(permission);
  if(role==='content')return ['content','arrival'].includes(permission);
  if(role==='finance')return ['finance','analytics'].includes(permission);
  return false;
}

function navAllowed(key,business){
  const role=business?.access_role||'owner';
  if(['owner','admin'].includes(role))return true;
  if(key==='overview'||key==='settings')return true;
  if(key==='calendar')return businessCan(business,'calendar');
  if(key==='reservations')return businessCan(business,'reservations')||businessCan(business,'finance');
  if(key==='listings'||key==='rates')return businessCan(business,'content');
  if(key==='analytics')return businessCan(business,'analytics');
  // Property verification and the legacy review-response page remain owner-only.
  return false;
}

export function installOperatorNavigation(active='overview',business=null){
  const allowed=OPERATOR_NAV.filter(([key])=>navAllowed(key,business));
  const nav=document.querySelector('.app-nav');
  if(nav){
    [...nav.querySelectorAll('[data-operator-v2-link]')].forEach((item)=>item.remove());
    const logoutButton=document.getElementById('logoutButton');
    const group=el('div',{className:'operator-v2-nav',attrs:{'data-operator-v2-link':'1','aria-label':'Operator workspace'}});
    allowed.forEach(([key,href,label])=>group.append(el('a',{text:label,attrs:{href,'aria-current':key===active?'page':'false'}})));
    if(logoutButton)nav.insertBefore(group,logoutButton);else nav.append(group);
  }

  document.querySelector('.operator-mobile-actions')?.remove();
  const mobile=el('nav',{className:'operator-mobile-actions',attrs:{'aria-label':'Operator mobile navigation'}});
  const mobileKeys=new Set(['overview','calendar','reservations','listings','analytics','settings']);
  allowed.filter(([key])=>mobileKeys.has(key)).forEach(([key,href,label])=>mobile.append(el('a',{text:key==='overview'?'Home':key==='reservations'?'Bookings':key==='analytics'?'Stats':key==='listings'?'Listings':label,attrs:{href,'aria-current':key===active?'page':'false'}})));
  if(mobile.childElementCount)document.body.append(mobile);
}

export async function loadOwnedBusinesses(){
  const client=requireSupabase();
  const {data,error}=await client.rpc('operator_accessible_businesses');
  if(error)throw error;
  return data||[];
}

export function chooseBusiness(businesses){
  const remembered=selectedBusinessId();
  return businesses.find((item)=>item.id===remembered)||businesses[0]||null;
}

export function fillBusinessSwitcher(select,businesses,business){
  if(!select)return;
  select.replaceChildren();
  if(!businesses.length){select.append(new Option('No accessible businesses',''));select.disabled=true;return;}
  businesses.forEach((item)=>{
    const role=item.access_role&&item.access_role!=='owner'?` · ${String(item.access_role).replaceAll('_',' ')}`:'';
    select.append(new Option(`${item.business_name} — ${String(item.status||'').replaceAll('_',' ')}${role}`,item.id));
  });
  select.disabled=false;select.value=business?.id||businesses[0].id;
}

export async function initializeOperatorPage(active='overview'){
  const user=await requireOperator();
  const logoutButton=document.getElementById('logoutButton');
  if(logoutButton&&!logoutButton.dataset.operatorShellBound){
    logoutButton.dataset.operatorShellBound='1';
    logoutButton.addEventListener('click',()=>logout().catch((error)=>console.error('Logout failed',error)));
  }
  const businesses=await loadOwnedBusinesses();
  const business=chooseBusiness(businesses);
  if(business)rememberBusiness(business.id);
  installOperatorNavigation(active,business);
  queueMicrotask(()=>import('./operator-notifications.js?v=2').catch((error)=>console.error('Operator notification center failed:',error)));
  return {client:requireSupabase(),user,businesses,business};
}

export function bindBusinessSwitcher(select,state,onChange){
  if(!select)return;
  fillBusinessSwitcher(select,state.businesses,state.business);
  select.addEventListener('change',async()=>{
    state.business=state.businesses.find((item)=>item.id===select.value)||null;
    if(state.business)rememberBusiness(state.business.id);
    installOperatorNavigation(document.body.dataset.operatorPage||'overview',state.business);
    await onChange?.(state.business);
  });
}

export function formatMoney(value,currency='USD'){
  if(value==null||Number.isNaN(Number(value)))return '—';
  try{return new Intl.NumberFormat('en-US',{style:'currency',currency}).format(Number(value));}
  catch{return `${currency} ${Number(value).toFixed(2)}`;}
}

export function localDateString(date=new Date()){
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,10);
}

export function addDays(dateString,days){const d=new Date(`${dateString}T12:00:00`);d.setDate(d.getDate()+days);return localDateString(d);}

export function setPageMessage(node,text='',kind=''){
  if(!node)return;node.textContent=text;node.hidden=!text;node.className=`message${kind?` ${kind}`:''}`;
}

export function debounce(fn,delay=250){let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),delay);};}
