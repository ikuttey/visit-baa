import { nightsBetween } from './marketplace.js';
import { minutesToTime } from './route-planner.js';
import { loadTransferNetwork, searchTransferRoutes } from './transfer-service.js';

function setupHomepageControls() {
  const oldDate = document.getElementById('travelDate');
  const button = document.createElement('button');
  button.id = 'whenButton'; button.className = 'when-button'; button.type = 'button'; button.textContent = 'Choose dates';
  oldDate.replaceWith(button);

  const dialog = document.createElement('dialog');
  dialog.id = 'whenDialog'; dialog.className = 'when-dialog';
  dialog.insertAdjacentHTML('beforeend', `<form method="dialog"><div class="when-head"><strong>When are you visiting?</strong><button id="closeWhenDialog" type="button" aria-label="Close">×</button></div><div class="when-tabs" role="tablist"><button type="button" data-when-mode="stay">Stay</button><button type="button" data-when-mode="activity">Activity</button><button type="button" data-when-mode="transfer">Transfer</button></div><div id="heroRangeFields" class="when-fields"><label>Check-in<input id="heroCheckin" type="date" required></label><label>Check-out<input id="heroCheckout" type="date" required></label></div><div id="heroSingleFields" class="when-fields" hidden><label>Travel date<input id="heroSingleDate" type="date" required></label></div><button id="applyWhen" class="routebtn" type="button">Apply dates</button></form>`);
  document.body.append(dialog);

  const routeForm = document.getElementById('routeForm');
  const selects = routeForm.querySelectorAll('select');
  selects[0].id = 'routeFrom'; selects[1].id = 'routeTo';
  selects.forEach((select) => select.replaceChildren(new Option('Loading published routes…', '')));
  const swap = routeForm.querySelector('.swap'); swap.id = 'routeSwap'; swap.setAttribute('aria-label', 'Swap origin and destination');
  const date = routeForm.querySelector('input[type="date"]'); date.id = 'routeDate'; date.required = true;
  const oldNote = routeForm.nextElementSibling; oldNote.id = 'routeStatus'; oldNote.setAttribute('role', 'status'); oldNote.setAttribute('aria-live', 'polite'); oldNote.textContent = 'Destinations load from active, published transfer listings when you use the planner.';
  const results = document.createElement('div'); results.id = 'routeResults'; results.className = 'route-results'; oldNote.after(results);

  const styles = document.createElement('style');
  styles.textContent = `.when-button{display:block;width:100%;padding:0;border:0;background:transparent;color:var(--ink);font-weight:600;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}.route-results{display:grid;gap:12px;margin-top:18px}.route-result{display:grid;gap:6px;padding:18px 20px;border:1px solid rgba(255,255,255,.14);border-radius:18px;background:rgba(255,255,255,.07)}.route-result span{font-size:14px}.route-result small{color:rgba(255,255,255,.7)}.route-result a{color:var(--aqua);font-weight:700}.when-dialog{width:min(560px,calc(100% - 30px));padding:0;border:0;border-radius:24px;box-shadow:var(--shadow)}.when-dialog::backdrop{background:rgba(2,30,36,.58)}.when-dialog form{padding:24px}.when-head{display:flex;align-items:center;justify-content:space-between;font-family:Manrope;font-size:20px}.when-head button{border:0;background:var(--foam);width:38px;height:38px;border-radius:50%;font-size:20px}.when-tabs{display:flex;gap:8px;margin:22px 0}.when-tabs button{border:1px solid var(--line);border-radius:99px;padding:9px 14px;background:#fff;font-weight:700}.when-tabs button.active{background:var(--deep);color:#fff}.when-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}.when-fields label{font-size:12px;font-weight:800;color:var(--muted)}.when-fields input{display:block;width:100%;margin-top:6px;padding:12px;border:1px solid var(--line);border-radius:12px}`;
  document.head.append(styles);
}

setupHomepageControls();

const today = new Date().toISOString().slice(0, 10);
const whenButton = document.getElementById('whenButton');
const whenDialog = document.getElementById('whenDialog');
const checkin = document.getElementById('heroCheckin');
const checkout = document.getElementById('heroCheckout');
const singleDate = document.getElementById('heroSingleDate');
const rangeFields = document.getElementById('heroRangeFields');
const singleFields = document.getElementById('heroSingleFields');
let searchMode = 'stay';
let routeNetworkLoaded = false;

[checkin, checkout, singleDate, document.getElementById('routeDate')].forEach((input) => { input.min = today; });

function formatShortDate(date) {
  return new Intl.DateTimeFormat('en', { day:'numeric', month:'short' }).format(new Date(`${date}T12:00:00`));
}

function renderWhenLabel() {
  if (searchMode === 'stay' && checkin.value && checkout.value) {
    const nights = nightsBetween(checkin.value, checkout.value);
    whenButton.textContent = `${formatShortDate(checkin.value)}–${formatShortDate(checkout.value)} · ${nights} night${nights === 1 ? '' : 's'}`;
  } else if (searchMode !== 'stay' && singleDate.value) whenButton.textContent = formatShortDate(singleDate.value);
  else whenButton.textContent = 'Choose dates';
}

function setSearchMode(mode) {
  searchMode = mode;
  rangeFields.hidden = mode !== 'stay';
  singleFields.hidden = mode === 'stay';
  document.querySelectorAll('[data-when-mode]').forEach((button) => {
    const active = button.dataset.whenMode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  renderWhenLabel();
}

whenButton.addEventListener('click', () => whenDialog.showModal());
document.getElementById('closeWhenDialog').addEventListener('click', () => whenDialog.close());
document.querySelectorAll('[data-when-mode]').forEach((button) => button.addEventListener('click', () => setSearchMode(button.dataset.whenMode)));
checkin.addEventListener('change', () => { checkout.min = checkin.value || today; if (checkout.value && checkout.value <= checkin.value) checkout.value = ''; renderWhenLabel(); });
[checkout, singleDate].forEach((input) => input.addEventListener('change', renderWhenLabel));
document.getElementById('applyWhen').addEventListener('click', () => {
  if (searchMode === 'stay' && (!checkin.value || !checkout.value || nightsBetween(checkin.value, checkout.value) < 1)) return checkin.reportValidity();
  if (searchMode !== 'stay' && !singleDate.value) return singleDate.reportValidity();
  renderWhenLabel();
  whenDialog.close();
});

document.getElementById('heroSearch').addEventListener('submit', (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const params = new URLSearchParams({ island:document.getElementById('islandSelect').value, adults:document.getElementById('travelerSelect').value });
  if (searchMode === 'stay') {
    params.set('category', 'accommodation');
    if (checkin.value) params.set('checkin', checkin.value);
    if (checkout.value) params.set('checkout', checkout.value);
    params.set('rooms', '1');
  } else {
    if (searchMode === 'transfer') params.set('category', 'transfer');
    if (singleDate.value) params.set('date', singleDate.value);
  }
  window.location.href = `listings.html?${params}`;
}, true);

function fillRouteSelect(select, locations, preferred = '') {
  select.replaceChildren();
  const values=locations.map((item)=>typeof item==='string'?{name:item,group:'Published route points'}:item);
  [...new Set(values.map((item)=>item.group))].forEach((group)=>{const options=document.createElement('optgroup');options.label=group;values.filter((item)=>item.group===group).forEach((item)=>options.append(new Option(item.name,item.name)));select.append(options);});
  if (values.some((item)=>item.name===preferred)) select.value = preferred;
}

async function ensureRouteNetwork() {
  if (routeNetworkLoaded) return;
  routeNetworkLoaded = true;
  const status = document.getElementById('routeStatus');
  status.textContent = 'Loading published transfer routes…';
  try {
    const network = await loadTransferNetwork();
    const from = document.getElementById('routeFrom');
    const to = document.getElementById('routeTo');
    fillRouteSelect(from, network.locations, 'Dharavandhoo Airport');
    fillRouteSelect(to, network.locations, network.locations.find((item) => item.name !== from.value)?.name);
    if (network.schemaPending) throw new Error('Locations are ready, but published route data is not connected until the latest migration is deployed.');
    if (network.routes.length < 1) throw new Error('No active published transfer routes are available yet.');
    status.textContent = `${network.routes.length} published directional route leg${network.routes.length === 1 ? '' : 's'} available.`;
  } catch (error) {
    routeNetworkLoaded = false;
    status.textContent = error.message;
  }
}

document.getElementById('routeForm').addEventListener('focusin', ensureRouteNetwork, { once:true });
document.getElementById('routeSwap').addEventListener('click', () => {
  const from = document.getElementById('routeFrom'); const to = document.getElementById('routeTo');
  [from.value, to.value] = [to.value, from.value];
});
document.getElementById('routeForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const results = document.getElementById('routeResults');
  const status = document.getElementById('routeStatus');
  results.replaceChildren();
  try {
    await ensureRouteNetwork();
    const search = { from:document.getElementById('routeFrom').value, to:document.getElementById('routeTo').value, date:document.getElementById('routeDate').value, adults:2 };
    if (!search.from || !search.to || !search.date) throw new Error('Choose a real origin, destination, and travel date.');
    if (search.from === search.to) throw new Error('Origin and destination must be different.');
    status.textContent = 'Checking schedules, direction, capacity, and connections…';
    const response = await searchTransferRoutes(search);
    if (response.schemaPending) throw new Error('Route data is not connected yet.');
    if (!response.options.length) throw new Error('No valid published route is available for that direction and date. Try another date or route.');
    response.options.slice(0, 4).forEach((option, index) => {
      const article = document.createElement('article'); article.className = 'route-result';
      const stops = option.legs.map((leg) => `${leg.origin_name} ${minutesToTime(leg.departure_minutes)} → ${leg.destination_name} ${minutesToTime(leg.arrival_minutes)}`).join(' · ');
      const heading = document.createElement('strong'); heading.textContent = index === 0 ? 'Best match' : `${option.legs.length}-leg option`;
      const detail = document.createElement('span'); detail.textContent = stops;
      const meta = document.createElement('small');
      option.legs.forEach((leg, legIndex) => { if (legIndex) meta.append(' + '); const link=document.createElement('a'); link.href=`listing.html?id=${encodeURIComponent(leg.listing_id)}`; link.textContent=leg.title; meta.append(link); });
      meta.append(` · ${new Intl.NumberFormat('en',{style:'currency',currency:option.currency}).format(option.total_price)} for 2 adults`);
      article.append(heading, detail, meta);
      results.append(article);
    });
    status.textContent = `${response.options.length} valid route option${response.options.length === 1 ? '' : 's'} found from published operator schedules.`;
  } catch (error) { status.textContent = error.message; }
}, true);

setSearchMode('stay');
