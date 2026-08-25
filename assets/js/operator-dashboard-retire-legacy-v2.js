// The historical operator-dashboard remains the Property / business-profile
// screen, but V2 owns listings, calendar, reservations, rates and reviews on
// dedicated pages. Hide the old operational tabs so their legacy write handlers
// cannot overwrite V2-calculated inventory or bypass the newer workflows.

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
    .operator-v2-property-links{margin:0 0 22px}
    .operator-v2-property-links .form-actions{margin-top:14px}
  `;
  document.head.append(style);

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
    });

    const heading = document.querySelector('.page-heading h1');
    if (heading && heading.textContent.trim() === 'Business dashboard') heading.textContent = 'Property & business profile';

    if (!document.getElementById('operatorV2PropertyLinks')) {
      const anchor = document.querySelector('.business-workspace');
      if (anchor) {
        const section = document.createElement('section');
        section.id = 'operatorV2PropertyLinks';
        section.className = 'panel operator-v2-property-links';
        section.innerHTML = `
          <div class="panel-head"><div><span class="eyebrow">V2 workspace</span><h2>Manage daily operations</h2><p>Property information stays here. Listings, inventory, reservations, rates and reviews use the dedicated V2 workspaces.</p></div></div>
          <div class="form-actions">
            <a class="button aqua" href="operator-content.html">Listings</a>
            <a class="button secondary" href="operator-calendar.html">Calendar & Schedule</a>
            <a class="button secondary" href="operator-reservations.html">Reservations</a>
            <a class="button secondary" href="operator-rates.html">Rates & Promotions</a>
            <a class="button secondary" href="operator-reviews.html">Reviews</a>
          </div>`;
        anchor.insertAdjacentElement('afterend', section);
      }
    }
  };

  // Any old "Add Listing" button now opens the real V2 Listings workspace.
  document.addEventListener('click', (event) => {
    const control = event.target.closest('button, a');
    if (!control) return;
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
