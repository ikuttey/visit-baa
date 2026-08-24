import { isSupabaseConfigured, requirePublicSupabase, requireSupabase } from './supabase-client.js';
import { userRoles } from './auth.js';

const container = document.getElementById('activities');
const note = document.getElementById('activitiesNote');
const tabs = [...document.querySelectorAll('.date-tab[data-range]')];
const state = { availability: [], listings: new Map(), range: 'today' };
const travelDate = document.getElementById('travelDate');
if (travelDate) travelDate.min = localDate(0);

function normalizeHomepageNavigation() {
  const header = document.querySelector('header.nav');
  if (!header) return;

  const brand = header.querySelector('.brand');
  if (brand) {
    brand.href = 'index.html';
    brand.setAttribute('aria-label', 'Visit Baa home');
    brand.innerHTML = '<img class="visit-baa-brand-logo" src="assets/images/visit-baa-logo.png?v=3" alt="Visit Baa" decoding="sync" fetchpriority="high">';
  }

  const nav = header.querySelector('.navlinks');
  if (nav) {
    nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML = [
      '<a href="index.html" aria-current="page">Home</a>',
      '<a href="listings.html">Explore listings</a>',
      '<a href="login.html" data-account-link>Login</a>'
    ].join('');
  }

  const hamburger = header.querySelector('.hamb');
  if (hamburger && nav) {
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-controls', 'homepagePrimaryNav');
    nav.id = 'homepagePrimaryNav';

    if (!document.getElementById('homepageNavRuntimeStyles')) {
      const style = document.createElement('style');
      style.id = 'homepageNavRuntimeStyles';
      style.textContent = '@media(max-width:850px){.navlinks.is-open{display:flex;position:absolute;top:calc(100% + 8px);left:13px;right:13px;flex-direction:column;gap:4px;margin:0;padding:12px;border:1px solid rgba(255,255,255,.18);border-radius:16px;background:rgba(3,30,36,.97);box-shadow:0 18px 45px rgba(0,0,0,.25)}.navlinks.is-open a{padding:11px 12px;border-radius:10px}.navlinks.is-open a:hover,.navlinks.is-open a:focus-visible{background:rgba(255,255,255,.1)}}';
      document.head.append(style);
    }

    hamburger.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      hamburger.setAttribute('aria-expanded', String(open));
    });

    nav.addEventListener('click', (event) => {
      if (!event.target.closest('a')) return;
      nav.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  }
}

function accountDestination(roles) {
  if (roles.includes('admin')) return { href: 'admin-dashboard.html', label: 'Admin Dashboard' };
  if (roles.includes('operator')) return { href: 'operator-dashboard.html', label: 'Operator Dashboard' };
  if (roles.includes('traveler')) return { href: 'traveler-dashboard.html', label: 'My Baa Trip' };
  return { href: 'login.html', label: 'Login' };
}

function updateAccountLinks(destination) {
  const accountLink = document.querySelector('[data-account-link]');
  if (accountLink) {
    accountLink.href = destination.href;
    accountLink.textContent = destination.label;
  }

  const footerOperatorLink = [...document.querySelectorAll('.footer-col a')]
    .find((link) => link.textContent.trim() === 'Operator portal');
  if (footerOperatorLink && destination.href !== 'login.html') {
    footerOperatorLink.href = destination.href;
    footerOperatorLink.textContent = destination.label;
  }

  if (destination.href === 'operator-dashboard.html') {
    const businessCta = document.querySelector('.business-copy a.btn[href="register.html"]');
    if (businessCta) {
      businessCta.href = destination.href;
      businessCta.textContent = 'Open operator dashboard →';
    }
    const mobileListLink = document.querySelector('.bottom-nav a[href="register.html"]');
    if (mobileListLink) {
      mobileListLink.href = destination.href;
      mobileListLink.innerHTML = '▣<span>Dashboard</span>';
    }
  }
}

async function applyHomepageAccountNavigation() {
  if (!isSupabaseConfigured) return;

  try {
    const client = requireSupabase();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      updateAccountLinks({ href: 'login.html', label: 'Login' });
      return;
    }

    const roles = await userRoles(data.user.id);
    updateAccountLinks(accountDestination(roles));
  } catch (error) {
    console.warn('Could not restore signed-in homepage navigation:', error);
  }
}

normalizeHomepageNavigation();
applyHomepageAccountNavigation();

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function activityRow(slot, listing) {
  const link = document.createElement('a');
  link.className = 'activity';
  link.href = `listing.html?id=${encodeURIComponent(listing.id)}`;
  const time = document.createElement('time');
  time.textContent = slot.start_time?.slice(0, 5) || 'All day';
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = listing.title;
  const detail = document.createElement('small');
  detail.textContent = `${listing.island} · ${listing.business_name}`;
  copy.append(title, detail);
  const spaces = document.createElement('span');
  spaces.className = 'spaces';
  spaces.textContent = `${slot.remaining_spaces} space${slot.remaining_spaces === 1 ? '' : 's'}`;
  link.append(time, copy, spaces);
  return link;
}

function renderEmpty(title, detail) {
  container.replaceChildren();
  const row = document.createElement('div');
  row.className = 'activity';
  const time = document.createElement('time'); time.textContent = '—';
  const copy = document.createElement('div');
  const strong = document.createElement('strong'); strong.textContent = title;
  const small = document.createElement('small'); small.textContent = detail;
  copy.append(strong, small); row.append(time, copy); container.append(row);
}

function render() {
  const start = state.range === 'tomorrow' ? localDate(1) : localDate(0);
  const end = state.range === 'week' ? localDate(7) : start;
  const slots = state.availability.filter((slot) => slot.available_date >= start && slot.available_date <= end && state.listings.has(slot.listing_id));
  container.replaceChildren();
  if (!slots.length) {
    renderEmpty('No approved schedules found', 'Try another date or browse all published listings.');
    return;
  }
  slots.slice(0, 6).forEach((slot) => container.append(activityRow(slot, state.listings.get(slot.listing_id))));
}

tabs.forEach((tab) => tab.addEventListener('click', () => {
  state.range = tab.dataset.range;
  tabs.forEach((item) => item.classList.toggle('active', item === tab));
  render();
}));

async function init() {
  if (!isSupabaseConfigured) {
    renderEmpty('Live listings are not connected yet', 'Complete the Supabase setup to show approved schedules here.');
    note.textContent = 'No demonstration availability is shown when Supabase is not configured.';
    return;
  }
  try {
    const client = requirePublicSupabase();
    const { data: availability, error } = await client.from('public_availability').select('*').gte('available_date', localDate(0)).lte('available_date', localDate(7)).order('available_date').order('start_time');
    if (error) throw error;
    state.availability = availability || [];
    const ids = [...new Set(state.availability.map((slot) => slot.listing_id))];
    if (ids.length) {
      const { data: listings, error: listingError } = await client.from('public_listings').select('id,title,island,business_name').in('id', ids);
      if (listingError) throw listingError;
      state.listings = new Map((listings || []).map((listing) => [listing.id, listing]));
    }
    render();
  } catch (error) {
    renderEmpty('Approved schedules could not be loaded', error.message || 'Please try again later.');
  }
}

init();
