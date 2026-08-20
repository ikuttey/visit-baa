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
    window.location.replace('operator-dashboard.html');
    throw new Error('Administrator access required');
  }
  return user;
}

export async function redirectAfterLogin(user) {
  const roles = await userRoles(user.id);
  window.location.replace(roles.includes('admin') ? 'admin-dashboard.html' : 'operator-dashboard.html');
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
