import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const config = window.BAA_CONFIG || {};
export const isSupabaseConfigured = Boolean(
  config.supabaseUrl
  && config.supabaseAnonKey
  && !config.supabaseUrl.includes('YOUR_PROJECT_REF')
  && !config.supabaseAnonKey.includes('YOUR_PUBLISHABLE')
);

export const supabase = isSupabaseConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

// Public catalogue pages deliberately use an anonymous client. This prevents
// a signed-in operator's private RLS scope from changing the public catalogue.
export const publicSupabase = isSupabaseConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'baa-public-anonymous'
      }
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add the project URL and public key to config.js.');
  }
  return supabase;
}

export function requirePublicSupabase() {
  if (!publicSupabase) {
    throw new Error('Supabase is not configured. Add the project URL and public key to config.js.');
  }
  return publicSupabase;
}

export function siteUrl(path = '') {
  const base = config.siteUrl || (window.location.protocol.startsWith('http') ? window.location.origin : 'http://localhost:3000');
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return new URL(path.replace(/^\//, ''), normalized).href;
}

export function showConfigurationNotice(element) {
  if (isSupabaseConfigured || !element) return false;
  element.hidden = false;
  element.className = 'message warning';
  element.textContent = 'Supabase is not connected yet. Add the public project URL and publishable/anon key to config.js. See SETUP.md.';
  return true;
}
