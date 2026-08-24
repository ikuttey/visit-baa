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
    icon.href = 'assets/images/visit-baa-icon.png?v=2';
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
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        filter: drop-shadow(0 3px 7px rgba(0,0,0,.52)) drop-shadow(0 0 1px rgba(255,255,255,.22));
      }
      .nav .visit-baa-brand-logo {
        height: 72px;
        max-width: min(300px, 48vw);
      }
      .auth-story .visit-baa-brand-logo {
        height: 80px;
        max-width: 320px;
      }
      .brand:has(.visit-baa-brand-logo) {
        line-height: 0;
        padding: 0;
        background: transparent;
        border-radius: 0;
        box-shadow: none;
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
      }
    `;
    document.head.append(style);
  }

  document.querySelectorAll('a.brand').forEach((brand) => {
    if (/admin/i.test(brand.textContent || '') || brand.closest('.app-header')?.querySelector('[aria-label*="Admin"]')) return;
    brand.href = 'index.html';
    brand.setAttribute('aria-label', 'Visit Baa home');
    brand.innerHTML = '<img class="visit-baa-brand-logo" src="assets/images/visit-baa-logo.png?v=2" alt="Visit Baa">';
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
