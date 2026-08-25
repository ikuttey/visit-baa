import { requireSupabase } from './supabase-client.js';
import { logout, requireOperator } from './auth.js';

// Visit Baa keeps its own branding/colors, but the operator information
// architecture follows the familiar OTA partner-extranet pattern: a compact
// account bar followed by a dedicated operations navigation row.
export const OPERATOR_NAV = [
  ['overview','operator-overview.html','Home'],
  ['calendar','operator-calendar.html','Calendar'],
  ['reservations','operator-reservations.html','Reservations'],
  ['listings','operator-content.html','Listings'],
  ['property','operator-dashboard.html?tab=business','Property'],
  ['rates','operator-rates.html','Rate plans'],
  ['promotions','operator-rates.html#promotions','Promotions'],
  ['inbox','operator-inbox.html','Inbox'],
  ['reviews','operator-reviews.html','Reviews'],
  ['analytics','operator-analytics.html','Analytics'],
  ['settings','operator-settings.html','Settings'],
  ['external','operator-availability.html','External bookings']
];

const PARTNER_MENUS = [
  { key:'overview', label:'Home', href:'operator-overview.html' },
  {
    key:'rates-availability', label:'Rates & availability',
    items:[
      ['calendar','operator-calendar.html','Calendar'],
      ['rates','operator-rates.html','Rate plans'],
      ['external','operator-availability.html','External bookings']
    ]
  },
  { key:'reservations', label:'Reservations', href:'operator-reservations.html' },
  {
    key:'property-menu', label:'Property',
    items:[
      ['property','operator-dashboard.html?tab=business','Property details'],
      ['listings','operator-content.html','Listings & rooms'],
      ['arrival','operator-settings.html#arrivalPanel','Arrival information']
    ]
  },
  { key:'promotions', label:'Promotions', href:'operator-rates.html#promotions' },
  { key:'inbox', label:'Inbox', href:'operator-inbox.html' },
  { key:'reviews', label:'Reviews', href:'operator-reviews.html' },
  { key:'analytics', label:'Analytics', href:'operator-analytics.html' }
];

function el(tag,options={}){
  const node=document.createElement(tag);
  if(options.className)node.className=options.className;
  if(options.text!=null)node.textContent=String(options.text);
  if(options.attrs)Object.entries(options.attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));
  (options.children||[]).filter(Boolean).forEach((child)=>node.append(child));
  return node;
}

export function selectedBusinessId(){return localStorage.getItem('baa_operator_business_id')||'';}
export function rememberBusiness(id){if(id)localStorage.setItem('baa_operator_business_id',id);}

export function businessCan(business,permission){
  if(!business)return false;
  const role=business.access_role||'owner';
  if(['owner','admin','manager'].includes(role))return true;
  if(role==='reservations')return ['reservations','messages','calendar','analytics'].includes(permission);
  if(role==='content')return ['content','arrival'].includes(permission);
  if(role==='finance')return ['finance','analytics'].includes(permission);
  return false;
}

function navAllowed(key,business){
  if(!business)return ['overview','property','settings'].includes(key);
  const role=business.access_role||'owner';
  if(['owner','admin'].includes(role))return true;
  if(key==='overview'||key==='settings')return true;
  if(key==='calendar')return businessCan(business,'calendar');
  // The external-bookings screen still loads owner-owned businesses directly;
  // keep it owner-only until that legacy data loader is converted to staff RPCs.
  if(key==='external')return false;
  if(key==='reservations')return businessCan(business,'reservations')||businessCan(business,'finance');
  if(key==='inbox')return businessCan(business,'messages');
  if(key==='listings'||key==='rates'||key==='promotions')return businessCan(business,'content');
  if(key==='arrival')return businessCan(business,'arrival');
  if(key==='reviews')return businessCan(business,'staff_admin');
  if(key==='analytics')return businessCan(business,'analytics');
  if(key==='property')return ['owner','admin'].includes(role);
  return false;
}

function resolvedActive(active){
  if(active==='rates'&&window.location.hash==='#promotions')return 'promotions';
  return active;
}

function menuActive(menu,active){
  if(menu.items)return menu.items.some(([key])=>key===active);
  return menu.key===active;
}

function installDesktopPartnerNav(active,business){
  const header=document.querySelector('.app-header');
  const inner=document.querySelector('.app-header-inner');
  const accountNav=document.querySelector('.app-nav');
  if(!header||!inner||!accountNav)return;

  header.querySelector('.operator-partner-tabs-wrap')?.remove();
  accountNav.querySelectorAll('[data-operator-account-link]').forEach((item)=>item.remove());

  // Existing page templates already include Visit website + Log out. Keep them
  // as account actions and put Settings beside Notifications instead of mixing
  // them into the main operations navigation.
  const logoutButton=document.getElementById('logoutButton');
  if(navAllowed('settings',business)){
    const settings=el('a',{
      className:'operator-account-link',
      text:'Settings',
      attrs:{href:'operator-settings.html','data-operator-account-link':'1','aria-current':active==='settings'?'page':'false'}
    });
    if(logoutButton)accountNav.insertBefore(settings,logoutButton);else accountNav.append(settings);
  }

  const wrap=el('div',{className:'operator-partner-tabs-wrap',attrs:{'data-operator-v2-link':'1'}});
  const nav=el('nav',{className:'operator-v2-nav',attrs:{'aria-label':'Operator workspace'}});

  PARTNER_MENUS.forEach((menu)=>{
    const isActive=menuActive(menu,active);
    if(menu.items){
      const visible=menu.items.filter(([key])=>navAllowed(key,business));
      if(!visible.length)return;
      const details=el('details',{className:`operator-nav-menu${isActive?' active':''}`});
      const summary=el('summary',{text:menu.label,attrs:{'aria-current':isActive?'page':'false'}});
      const popup=el('div',{className:'operator-nav-menu-popup'});
      visible.forEach(([key,href,label])=>popup.append(el('a',{text:label,attrs:{href,'aria-current':key===active?'page':'false'}})));
      details.append(summary,popup);nav.append(details);
    }else{
      if(!navAllowed(menu.key,business))return;
      nav.append(el('a',{className:isActive?'active':'',text:menu.label,attrs:{href:menu.href,'aria-current':isActive?'page':'false'}}));
    }
  });

  wrap.append(nav);
  inner.insertAdjacentElement('afterend',wrap);

  nav.addEventListener('click',(event)=>{
    if(event.target.closest('.operator-nav-menu-popup a'))nav.querySelectorAll('details[open]').forEach((d)=>d.removeAttribute('open'));
  });
}

function installMobilePartnerNav(active,business){
  document.querySelector('.operator-mobile-actions')?.remove();
  const mobile=el('nav',{className:'operator-mobile-actions',attrs:{'aria-label':'Operator mobile navigation'}});
  const entries=[
    ['overview','operator-overview.html','Home'],
    ['reservations','operator-reservations.html','Bookings'],
    ['calendar','operator-calendar.html','Calendar'],
    ['inbox','operator-inbox.html','Inbox'],
    ['settings','operator-settings.html','More']
  ];
  entries.filter(([key])=>navAllowed(key,business)).forEach(([key,href,label])=>mobile.append(el('a',{text:label,attrs:{href,'aria-current':key===active?'page':'false'}})));
  if(mobile.childElementCount)document.body.append(mobile);
}

export function installOperatorNavigation(active='overview',business=null){
  const current=resolvedActive(active);
  installDesktopPartnerNav(current,business);
  installMobilePartnerNav(current,business);
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

function clearInvalidNoBusinessDrafts(){
  const keys=[];
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith('visit_baa_listing_draft:none:'))keys.push(key);}
  keys.forEach((key)=>localStorage.removeItem(key));
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
  if(business)rememberBusiness(business.id);else{localStorage.removeItem('baa_operator_business_id');clearInvalidNoBusinessDrafts();}
  installOperatorNavigation(active,business);

  if(active==='listings'&&!business){
    const newListing=document.getElementById('newListing');if(newListing)newListing.disabled=true;
    const editor=document.getElementById('listingEditor');if(editor)editor.hidden=true;
    const table=document.getElementById('listingTable');if(table)table.innerHTML='<div class="empty-state"><strong>Register a business first</strong><span>Your business must exist before you can create listings. Open Property to register your business and submit it for administrator approval.</span><a class="button aqua" href="operator-dashboard.html?tab=business">Register business</a></div>';
  }

  queueMicrotask(()=>import('./operator-header-layout-v2.js?v=3').catch((error)=>console.error('Operator header layout fix failed:',error)));
  queueMicrotask(()=>import('./operator-notifications.js?v=3').catch((error)=>console.error('Operator notification center failed:',error)));
  if(active==='listings'&&business){
    await import('./operator-content-compat-v2.js?v=1').catch((error)=>console.error('Listing schema compatibility failed:',error));
    queueMicrotask(()=>import('./operator-content-enhancements.js?v=2').catch((error)=>console.error('Listing enhancements failed:',error)));
  }
  return {client:requireSupabase(),user,businesses,business};
}

export function bindBusinessSwitcher(select,state,onChange){
  if(!select)return;
  fillBusinessSwitcher(select,state.businesses,state.business);
  select.addEventListener('change',async()=>{
    state.business=state.businesses.find((item)=>item.id===select.value)||null;
    if(state.business)rememberBusiness(state.business.id);else localStorage.removeItem('baa_operator_business_id');
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
