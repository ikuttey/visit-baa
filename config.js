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

function applyVisitBaaBranding() {
  if (!document.querySelector('link[data-visit-baa-icon]')) {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.type = 'image/png';
    icon.href = 'assets/images/visit-baa-icon.png?v=3';
    icon.dataset.visitBaaIcon = 'true';
    document.head.append(icon);
  }

  if (!document.getElementById('visitBaaBrandStyles')) {
    const style = document.createElement('style');
    style.id = 'visitBaaBrandStyles';
    style.textContent = `
      .visit-baa-brand-logo {
        display: block;
        width: auto;
        height: 66px;
        max-width: min(280px, 48vw);
        object-fit: contain;
        image-rendering: auto;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        filter: none;
        transform: none;
      }
      .nav .visit-baa-brand-logo {
        height: 68px;
        max-width: min(300px, 48vw);
      }
      .auth-story .visit-baa-brand-logo {
        height: 76px;
        max-width: 320px;
      }
      .brand:has(.visit-baa-brand-logo) {
        line-height: 0;
        padding: 7px 12px;
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 18px;
        background: rgba(4,46,55,.86);
        box-shadow: 0 8px 22px rgba(0,0,0,.24);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        transform: none;
      }
      .brand:has(.visit-baa-brand-logo):hover,
      .brand:has(.visit-baa-brand-logo):focus-visible {
        background: rgba(4,46,55,.96);
        border-color: rgba(255,255,255,.28);
      }
      @media (max-width: 550px) {
        .visit-baa-brand-logo,
        .nav .visit-baa-brand-logo {
          height: 54px;
          max-width: 210px;
          padding: 0;
          border-radius: 0;
        }
        .auth-story .visit-baa-brand-logo { height: 64px; }
        .brand:has(.visit-baa-brand-logo) {
          padding: 5px 8px;
          border-radius: 14px;
        }
      }
    `;
    document.head.append(style);
  }

  document.querySelectorAll('a.brand').forEach((brand) => {
    if (/admin/i.test(brand.textContent || '') || brand.closest('.app-header')?.querySelector('[aria-label*="Admin"]')) return;
    brand.href = 'index.html';
    brand.setAttribute('aria-label', 'Visit Baa home');
    brand.innerHTML = '<img class="visit-baa-brand-logo" src="assets/images/visit-baa-logo.png?v=3" alt="Visit Baa" decoding="sync" fetchpriority="high">';
  });
}

function initializeSharedSiteUi() {
  repairLegacyHomeLinks();
  applyVisitBaaBranding();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSharedSiteUi, { once: true });
} else {
  initializeSharedSiteUi();
}
