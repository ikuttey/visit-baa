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
    icon.href = 'assets/images/visit-baa-icon.png';
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
        height: 52px;
        max-width: min(230px, 44vw);
        object-fit: contain;
        padding: 4px 9px;
        border-radius: 12px;
        background: rgba(255,255,255,.97);
        box-shadow: 0 7px 22px rgba(0,0,0,.12);
      }
      .nav .visit-baa-brand-logo { height: 58px; }
      .auth-story .visit-baa-brand-logo { height: 66px; max-width: 260px; }
      .brand:has(.visit-baa-brand-logo) { line-height: 0; }
      @media (max-width: 550px) {
        .visit-baa-brand-logo,
        .nav .visit-baa-brand-logo { height: 46px; max-width: 190px; padding: 3px 7px; border-radius: 10px; }
        .auth-story .visit-baa-brand-logo { height: 56px; }
      }
    `;
    document.head.append(style);
  }

  document.querySelectorAll('a.brand').forEach((brand) => {
    if (/admin/i.test(brand.textContent || '') || brand.closest('.app-header')?.querySelector('[aria-label*="Admin"]')) return;
    brand.href = 'index.html';
    brand.setAttribute('aria-label', 'Visit Baa home');
    brand.innerHTML = '<img class="visit-baa-brand-logo" src="assets/images/visit-baa-logo.png" alt="Visit Baa">';
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
