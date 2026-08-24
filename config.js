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

function visitBaaBrandMarkup() {
  return [
    '<img class="visit-baa-brand-icon" src="assets/images/visit-baa-icon.png?v=4" alt="" aria-hidden="true" decoding="sync" fetchpriority="high">',
    '<span class="visit-baa-wordmark"><span class="visit-baa-wordmark-visit">Visit</span> <span class="visit-baa-wordmark-baa">Baa</span></span>'
  ].join('');
}

function applyVisitBaaBranding() {
  if (!document.querySelector('link[data-visit-baa-icon]')) {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.type = 'image/png';
    icon.href = 'assets/images/visit-baa-icon.png?v=4';
    icon.dataset.visitBaaIcon = 'true';
    document.head.append(icon);
  }

  if (!document.getElementById('visitBaaBrandStyles')) {
    const style = document.createElement('style');
    style.id = 'visitBaaBrandStyles';
    style.textContent = `
      .brand:has(.visit-baa-brand-icon) {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-height: 58px;
        line-height: 1;
        padding: 5px 14px 5px 7px;
        border: 1px solid rgba(255,255,255,.22);
        border-radius: 17px;
        background: rgba(3,31,38,.82);
        box-shadow: 0 8px 22px rgba(0,0,0,.22);
        text-decoration: none;
      }
      .visit-baa-brand-icon {
        display: block;
        flex: 0 0 auto;
        width: 50px;
        height: 50px;
        object-fit: contain;
        image-rendering: auto;
        padding: 0;
        margin: 0;
        border: 0;
        background: transparent;
        box-shadow: none;
        filter: none;
        transform: none;
      }
      .visit-baa-wordmark {
        display: inline-flex;
        align-items: baseline;
        gap: .18em;
        white-space: nowrap;
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 27px;
        font-weight: 700;
        letter-spacing: -.035em;
        line-height: 1;
        text-shadow: 0 1px 1px rgba(0,0,0,.18);
      }
      .visit-baa-wordmark-visit { color: #ffffff; }
      .visit-baa-wordmark-baa { color: #61ddd8; }
      .brand:has(.visit-baa-brand-icon):hover,
      .brand:has(.visit-baa-brand-icon):focus-visible {
        background: rgba(3,31,38,.94);
        border-color: rgba(255,255,255,.34);
      }
      .auth-story .brand:has(.visit-baa-brand-icon) {
        min-height: 66px;
      }
      .auth-story .visit-baa-brand-icon {
        width: 56px;
        height: 56px;
      }
      .auth-story .visit-baa-wordmark {
        font-size: 30px;
      }
      @media (max-width: 550px) {
        .brand:has(.visit-baa-brand-icon) {
          min-height: 50px;
          gap: 8px;
          padding: 4px 11px 4px 6px;
          border-radius: 14px;
        }
        .visit-baa-brand-icon {
          width: 42px;
          height: 42px;
        }
        .visit-baa-wordmark {
          font-size: 22px;
        }
      }
    `;
    document.head.append(style);
  }

  document.querySelectorAll('a.brand').forEach((brand) => {
    if (/admin/i.test(brand.textContent || '') || brand.closest('.app-header')?.querySelector('[aria-label*="Admin"]')) return;
    brand.href = 'index.html';
    brand.setAttribute('aria-label', 'Visit Baa home');
    brand.innerHTML = visitBaaBrandMarkup();
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
