// The historical operator-dashboard remains the Property / business-profile
// screen, but V2 owns listings, calendar, reservations, rates and reviews on
// dedicated pages. Hide and block the old operational tabs so their legacy
// write handlers cannot overwrite V2-calculated inventory or bypass workflows.

document.body.classList.add('operator-v2-body');
document.body.dataset.operatorPage='property';

if(!document.querySelector('link[href*="operator-v2.css"]')){
  const link=document.createElement('link');link.rel='stylesheet';link.href='assets/css/operator-v2.css';document.head.append(link);
}
if(!document.querySelector('link[data-operator-partner-style]')){
  const link=document.createElement('link');link.rel='stylesheet';link.href='assets/css/operator-partner-extranet.css?v=1';link.dataset.operatorPartnerStyle='1';document.head.append(link);
}

const brand=document.querySelector('.app-header .brand');
if(brand){brand.href='index.html';brand.innerHTML='<span class="brand-mark"></span>Visit Baa';}
document.title='Property — Visit Baa';

const accountNav=document.querySelector('.app-header .app-nav');
if(accountNav){
  accountNav.querySelectorAll('a').forEach((link)=>link.remove());
  const website=document.createElement('a');website.href='index.html';website.textContent='Visit website';
  const logout=document.getElementById('logoutButton');
  if(logout)accountNav.insertBefore(website,logout);else accountNav.append(website);
}

const destinations = {
  listings: 'operator-content.html',
  availability: 'operator-calendar.html',
  enquiries: 'operator-reservations.html',
  reviewsOffers: 'operator-reviews.html'
};

const requestedTab = new URLSearchParams(window.location.search).get('tab');
if (requestedTab && destinations[requestedTab]) {
  window.location.replace(destinations[requestedTab]);
} else {
  const style = document.createElement('style');
  style.id = 'operatorDashboardLegacyRetirementStyles';
  style.textContent = `
    .tabs .tab[data-tab="listings"],
    .tabs .tab[data-tab="availability"],
    .tabs .tab[data-tab="enquiries"],
    .tabs .tab[data-tab="reviewsOffers"],
    .tab-panel[data-tab-panel="listings"],
    .tab-panel[data-tab-panel="availability"],
    .tab-panel[data-tab-panel="enquiries"],
    .tab-panel[data-tab-panel="reviewsOffers"]{display:none!important}
    .operator-v2-property-links{margin:0 0 18px}
    .operator-v2-property-links .form-actions{margin-top:12px}
    .page-heading{margin-bottom:18px}
    .tabs{display:none!important}
  `;
  document.head.append(style);

  const legacyPanel = (node) => node?.closest?.('.tab-panel[data-tab-panel]')?.dataset?.tabPanel;

  // Block every submit originating from a retired operational panel. The V1
  // handlers stay in the bundle only because Property still uses that file.
  document.addEventListener('submit', (event) => {
    const tab = legacyPanel(event.target);
    if (!tab || !destinations[tab]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.href = destinations[tab];
  }, true);

  const forceBusinessProfile = () => {
    document.querySelectorAll('.tabs .tab[data-tab]').forEach((tab) => {
      const legacy = tab.dataset.tab !== 'business';
      tab.hidden = legacy;
      tab.disabled = legacy;
      tab.classList.toggle('active', !legacy);
      tab.setAttribute('aria-selected', String(!legacy));
    });
    document.querySelectorAll('.tab-panel[data-tab-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== 'business';
      if (destinations[panel.dataset.tabPanel]) {
        panel.querySelectorAll('input,select,textarea,button').forEach((control) => { control.disabled = true; });
      }
    });

    const heading = document.querySelector('.page-heading h1');
    if (heading) heading.textContent = 'Property';
    const eyebrow=document.querySelector('.page-heading .eyebrow');
    if(eyebrow)eyebrow.textContent='Property details';

    if (!document.getElementById('operatorV2PropertyLinks')) {
      const anchor = document.querySelector('.business-workspace');
      if (anchor) {
        const section = document.createElement('section');
        section.id = 'operatorV2PropertyLinks';
        section.className = 'panel operator-v2-property-links';
        section.innerHTML = `
          <div class="panel-head"><div><span class="eyebrow">Quick links</span><h2>Manage your property</h2><p>Use the dedicated partner tools for content, inventory, reservations and guest communication.</p></div></div>
          <div class="form-actions">
            <a class="button aqua" href="operator-content.html">Listings & rooms</a>
            <a class="button secondary" href="operator-calendar.html">Rates & availability</a>
            <a class="button secondary" href="operator-reservations.html">Reservations</a>
            <a class="button secondary" href="operator-inbox.html">Inbox</a>
            <a class="button secondary" href="operator-rates.html#promotions">Promotions</a>
          </div>`;
        anchor.insertAdjacentElement('afterend', section);
      }
    }
  };

  // Any old "Add Listing" button now opens the real V2 Listings workspace.
  document.addEventListener('click', (event) => {
    const control = event.target.closest('button, a');
    if (!control) return;
    const tab = legacyPanel(control);
    if (tab && destinations[tab]) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = destinations[tab];
      return;
    }
    const text = String(control.textContent || '').replace(/^\s*\+\s*/, '').trim().toLowerCase();
    if (control.id === 'newListingButton' || text === 'add listing' || text === 'add service or listing') {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = 'operator-content.html';
    }
  }, true);

  forceBusinessProfile();
  const observer = new MutationObserver(forceBusinessProfile);
  const workspace = document.querySelector('.page-wrap');
  if (workspace) observer.observe(workspace, { childList: true, subtree: true });
}
