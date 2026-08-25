import { requireSupabase, siteUrl } from './supabase-client.js';

export async function currentUser() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function userRoles(userId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((row) => row.role);
}

export async function requireOperator() {
  const user = await currentUser();
  if (!user) {
    window.location.replace(`login.html?next=${encodeURIComponent(window.location.pathname.split('/').pop())}`);
    throw new Error('Authentication required');
  }
  const roles = await userRoles(user.id);
  if (!roles.includes('operator')) {
    window.location.replace(roles.includes('admin') ? 'admin-dashboard.html' : 'login.html');
    throw new Error('Operator access required');
  }
  return user;
}

export async function requireAdmin() {
  const user = await currentUser();
  if (!user) {
    window.location.replace('login.html?next=admin-dashboard.html');
    throw new Error('Authentication required');
  }
  const roles = await userRoles(user.id);
  if (!roles.includes('admin')) {
    window.location.replace('operator-overview.html');
    throw new Error('Administrator access required');
  }
  return user;
}

export async function requireTraveler() {
  const user = await currentUser();
  if (!user) {
    const page = `${window.location.pathname.split('/').pop()}${window.location.search}`;
    window.location.replace(`login.html?next=${encodeURIComponent(page)}`);
    throw new Error('Authentication required');
  }
  const roles = await userRoles(user.id);
  if (!roles.includes('traveler')) {
    window.location.replace(roles.includes('admin') ? 'admin-dashboard.html' : 'operator-overview.html');
    throw new Error('Traveler access required');
  }
  return user;
}

export async function redirectAfterLogin(user) {
  const roles = await userRoles(user.id);
  const requested = new URLSearchParams(window.location.search).get('next') || localStorage.getItem('baa_after_auth_path');
  const next = /^traveler-dashboard\.html(?:\?[-A-Za-z0-9_=&%]*)?$/.test(requested || '') ? requested : 'traveler-dashboard.html';
  if (roles.includes('admin')) window.location.replace('admin-dashboard.html');
  else if (roles.includes('operator')) window.location.replace('operator-overview.html');
  else if (roles.includes('traveler')) { localStorage.removeItem('baa_after_auth_path'); window.location.replace(next); }
  else throw new Error('This account does not have an assigned Visit Baa role.');
}

export async function logout() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
  window.location.replace('login.html');
}

export function confirmationRedirect() {
  return siteUrl('login.html?verified=1');
}

export function passwordResetRedirect() {
  return siteUrl('reset-password.html');
}

if (typeof document !== 'undefined') {
  const operatorPage = document.body?.dataset?.operatorPage || '';

  // Shared V2 header layout: navigation scrolls inside its own region and can
  // never sit underneath Notifications / Log out.
  if (operatorPage) {
    queueMicrotask(() => import('./operator-header-layout-v2.js?v=2').catch((error) => console.error('Operator header layout fix failed:', error)));
  }

  if (operatorPage === 'calendar') {
    queueMicrotask(() => import('./operator-calendar-submit-guard-v2.js?v=1').catch((error) => console.error('Operator calendar submit guard failed:', error)));
  }

  // The historical owner dashboard remains only for Property / business
  // profile management. Dedicated V2 pages own all operational workflows.
  if (document.getElementById('businessForm') && document.getElementById('listingForm')) {
    queueMicrotask(() => import('./operator-header-layout-v2.js?v=2').catch((error) => console.error('Operator header layout fix failed:', error)));
    queueMicrotask(() => import('./operator-dashboard-retire-legacy-v2.js?v=2').catch((error) => console.error('Legacy operator dashboard retirement failed:', error)));
    queueMicrotask(() => import('./operator-onboarding-simple.js?v=2').catch((error) => console.error('Operator onboarding enhancement failed:', error)));
    queueMicrotask(() => import('./operator-notifications.js?v=2').catch((error) => console.error('Operator notification center failed:', error)));
    queueMicrotask(() => import('./operator-overview-v2.js?v=2').catch((error) => console.error('Operator V2 property overview failed:', error)));
  }

  // External-bookings stays available for manual channel reservations, while
  // Calendar & Schedule is the only inventory/rate editor.
  if (document.getElementById('externalBookingForm') && document.getElementById('availabilityRangeForm')) {
    queueMicrotask(() => import('./operator-external-bookings-compat-v2.js?v=2').catch((error) => console.error('External bookings V2 compatibility failed:', error)));
  }
}
