import { requireSupabase } from './supabase-client.js';
import { logout, requireOperator } from './auth.js';

export const OPERATOR_NAV = [
  ['overview','operator-dashboard.html','Overview'],
  ['calendar','operator-calendar.html','Calendar / Schedule'],
  ['reservations','operator-reservations.html','Reservations'],
  ['listings','operator-dashboard.html?tab=listings','Listings'],
  ['property','operator-dashboard.html?tab=business','Property'],
  ['rates','operator-rates.html','Rates & Promotions'],
  ['reviews','operator-dashboard.html?tab=reviewsOffers','Reviews & Messages'],
  ['analytics','operator-analytics.html','Analytics'],
  ['settings','operator-settings.html','Settings']
];

function el(tag,options={}){const node=document.createElement(tag);if(options.className)node.className=options.className;if(options.text!=null)node.textContent=String(options.text);if(options.attrs)Object.entries(options.attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));(options.children||[]).filter(Boolean).forEach((child)=>node.append(child));return node;}

export function selectedBusinessId(){return localStorage.getItem('baa_operator_business_id')||'';}
export function rememberBusiness(id){if(id)localStorage.setItem('baa_operator_business_id',id);}

export function installOperatorNavigation(active='overview'){
  const nav=document.querySelector('.app-nav');
  if(nav){
    [...nav.querySelectorAll('[data-operator-v2-link]')].forEach((item)=>item.remove());
    const logoutButton=document.getElementById('logoutButton');
    const group=el('div',{className:'operator-v2-nav',attrs:{'data-operator-v2-link':'1','aria-label':'Operator workspace'}});
    OPERATOR_NAV.forEach(([key,href,label])=>group.append(el('a',{text:label,attrs:{href,'aria-current':key===active?'page':'false'}})));
    if(logoutButton)nav.insertBefore(group,logoutButton);else nav.append(group);
  }

  let mobile=document.querySelector('.operator-mobile-actions');
  if(!mobile){
    mobile=el('nav',{className:'operator-mobile-actions',attrs:{'aria-label':'Operator mobile navigation'}});
    [['overview','operator-dashboard.html','Home'],['calendar','operator-calendar.html','Calendar'],['reservations','operator-reservations.html','Bookings'],['analytics','operator-analytics.html','Stats'],['settings','operator-settings.html','Settings']].forEach(([key,href,label])=>mobile.append(el('a',{text:label,attrs:{href,'aria-current':key===active?'page':'false'}})));
    document.body.append(mobile);
  }
}

export async function loadOwnedBusinesses(user){
  const client=requireSupabase();
  const {data,error}=await client.from('businesses').select('id,business_name,island,status,is_active,category').eq('owner_id',user.id).order('business_name');
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
  if(!businesses.length){select.append(new Option('No registered businesses',''));select.disabled=true;return;}
  businesses.forEach((item)=>select.append(new Option(`${item.business_name} — ${String(item.status||'').replaceAll('_',' ')}`,item.id)));
  select.disabled=false;select.value=business?.id||businesses[0].id;
}

export async function initializeOperatorPage(active='overview'){
  const user=await requireOperator();
  installOperatorNavigation(active);
  const logoutButton=document.getElementById('logoutButton');
  if(logoutButton&&!logoutButton.dataset.operatorShellBound){
    logoutButton.dataset.operatorShellBound='1';
    logoutButton.addEventListener('click',()=>logout().catch((error)=>console.error('Logout failed',error)));
  }
  const businesses=await loadOwnedBusinesses(user);
  const business=chooseBusiness(businesses);
  if(business)rememberBusiness(business.id);
  queueMicrotask(()=>import('./operator-notifications.js?v=2').catch((error)=>console.error('Operator notification center failed:',error)));
  return {client:requireSupabase(),user,businesses,business};
}

export function bindBusinessSwitcher(select,state,onChange){
  if(!select)return;
  fillBusinessSwitcher(select,state.businesses,state.business);
  select.addEventListener('change',async()=>{
    state.business=state.businesses.find((item)=>item.id===select.value)||null;
    if(state.business)rememberBusiness(state.business.id);
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
