// Copy this file to config.js for local development, then add only the
// Supabase project URL and public publishable/anon key. Never add service_role.
window.BAA_CONFIG = Object.freeze({
  supabaseUrl: 'https://hwllwtnqehtsoiwzkskk.supabase.co',
  supabaseAnonKey: 'sb_publishable_V92w-ElApdYKalXzdS2wGg_f7K0eK0n',
  siteUrl: 'https://ikuttey.github.io/visit-baa/'
});

function repairLegacyHomeLinks() {
  document.querySelectorAll('a[href="index (1).html"], a[href="index%20(1).html"]').forEach((link) => {
    link.setAttribute('href', 'index.html');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', repairLegacyHomeLinks, { once: true });
} else {
  repairLegacyHomeLinks();
}

