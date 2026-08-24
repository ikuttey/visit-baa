import { createElement } from './ui.js';

const LISTING_CHOICES = Object.freeze([
  { label: 'Accommodation', category: 'accommodation', kind: 'standard', detail: 'Rooms, guesthouses and stays' },
  { label: 'Activity / Excursion', category: 'excursion', kind: 'standard', detail: 'Fishing, diving, snorkelling and experiences' },
  { label: 'Excursion Package', category: 'excursion', kind: 'excursion_package', detail: 'A combined trip sold as one product' },
  { label: 'Transport', category: 'transfer', kind: 'standard', detail: 'Airport, island and speedboat transfers' },
  { label: 'Food / Dining', category: 'food_dining', kind: 'standard', detail: 'Dining and food experiences' },
  { label: 'Other Service', category: 'other', kind: 'standard', detail: 'Another eligible local tourism service' }
]);

function selectedStep() {
  return document.querySelector('[data-business-step].active')?.dataset.businessStep || null;
}

function simplifyBusinessWizard() {
  const serviceChoices = document.getElementById('operatorServiceChoices');
  const serviceField = serviceChoices?.closest('fieldset');
  if (serviceField) {
    serviceField.hidden = true;
    serviceField.style.display = 'none';
    serviceField.setAttribute('aria-hidden', 'true');
  }

  const step0 = document.querySelector('[data-business-step="0"]');
  const step1 = document.querySelector('[data-business-step="1"]');
  const step2 = document.querySelector('[data-business-step="2"]');
  const step3 = document.querySelector('[data-business-step="3"]');
  if (step0) step0.textContent = '1. Business Details';
  if (step1) step1.hidden = true;
  if (step2) step2.textContent = '2. Verification & Contact';
  if (step3) step3.textContent = '3. Review & Submit';

  const form = document.getElementById('businessForm');
  if (form && !document.getElementById('simpleBusinessFlowNote')) {
    const note = createElement('div', {
      className: 'message success',
      attrs: { id: 'simpleBusinessFlowNote', role: 'status' },
      children: [
        createElement('strong', { text: 'Simple approval flow' }),
        createElement('div', { text: 'Register the business first. After an administrator verifies it, you can add every service you provide and enter the prices in each listing.' })
      ]
    });
    form.before(note);
  }

  // The existing schema still expects one legacy capability during business
  // registration. Keep a hidden compatibility value; real capabilities are
  // added automatically by Supabase when the verified business creates listings.
  const ensureCompatibilityChoice = () => {
    const checked = serviceChoices?.querySelector('[name="operatorService"]:checked');
    if (checked) return;
    const fallback = serviceChoices?.querySelector('[name="operatorService"][value="other"]') || serviceChoices?.querySelector('[name="operatorService"]');
    if (fallback) fallback.checked = true;
  };
  ensureCompatibilityChoice();
  if (serviceChoices && serviceChoices.dataset.simpleObserver !== 'bound') {
    serviceChoices.dataset.simpleObserver = 'bound';
    new MutationObserver(ensureCompatibilityChoice).observe(serviceChoices, { childList: true, subtree: true });
  }

  const next = document.getElementById('businessStepNext');
  const back = document.getElementById('businessStepBack');
  if (next && next.dataset.simpleSkip !== 'bound') {
    next.dataset.simpleSkip = 'bound';
    next.addEventListener('click', () => queueMicrotask(() => {
      if (selectedStep() === '1') step2?.click();
    }));
  }
  if (back && back.dataset.simpleSkip !== 'bound') {
    back.dataset.simpleSkip = 'bound';
    back.addEventListener('click', () => queueMicrotask(() => {
      if (selectedStep() === '1') step0?.click();
    }));
  }

  const review = document.getElementById('businessReviewSummary');
  const removeServiceReview = () => {
    review?.querySelectorAll('dl > div').forEach((row) => {
      if (row.querySelector('dt')?.textContent.trim() === 'Services') row.remove();
    });
  };
  removeServiceReview();
  if (review && review.dataset.simpleObserver !== 'bound') {
    review.dataset.simpleObserver = 'bound';
    new MutationObserver(removeServiceReview).observe(review, { childList: true, subtree: true });
  }
}

function ensureBusinessLifecycleStyles() {
  if (document.getElementById('businessLifecycleStyles')) return;
  const style = document.createElement('style');
  style.id = 'businessLifecycleStyles';
  style.textContent = `
    .business-lifecycle-card{display:grid;gap:14px;padding:18px;border:1px solid var(--line,#d8e6e4);border-radius:18px;background:var(--surface,#fff);margin-top:14px}
    .business-lifecycle-card.verified{border-color:rgba(24,165,151,.38);background:linear-gradient(135deg,rgba(54,199,183,.10),rgba(255,255,255,.96))}
    .business-lifecycle-card.pending_review{border-color:rgba(202,151,46,.35);background:linear-gradient(135deg,rgba(250,221,153,.18),rgba(255,255,255,.96))}
    .business-lifecycle-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
    .business-lifecycle-title{display:grid;gap:4px}.business-lifecycle-title h3{margin:0;font-size:1.25rem}.business-lifecycle-title p{margin:0;color:var(--muted,#667b7c)}
    .business-lifecycle-pill{display:inline-flex;width:max-content;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;background:rgba(16,117,108,.10)}
    .business-lifecycle-copy{margin:0;max-width:760px;line-height:1.55}
    .business-lifecycle-meta{display:flex;gap:8px 14px;flex-wrap:wrap;color:var(--muted,#667b7c);font-size:.92rem}
    .business-lifecycle-actions{display:flex;gap:9px;flex-wrap:wrap}
    .business-profile-editing{margin-top:16px;padding-top:16px;border-top:1px solid var(--line,#d8e6e4)}
    @media(max-width:640px){.business-lifecycle-actions .button{width:100%;justify-content:center}.business-lifecycle-card{padding:15px}}
  `;
  document.head.append(style);
}

function businessStatusKey() {
  const text = (document.getElementById('businessStatus')?.textContent || '').trim().toLowerCase();
  if (text.includes('verified')) return 'verified';
  if (text.includes('pending')) return 'pending_review';
  if (text.includes('changes')) return 'changes_requested';
  if (text.includes('rejected')) return 'rejected';
  if (text.includes('registration')) return 'registration_required';
  return '';
}

function selectedBusinessIdentity() {
  return document.getElementById('businessSwitcher')?.value || '';
}

function fieldValue(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function ensureEditCancelButton() {
  const actions = document.getElementById('businessSubmitButton')?.closest('.form-actions');
  if (!actions) return null;
  let cancel = document.getElementById('businessProfileEditCancel');
  if (!cancel) {
    cancel = createElement('button', {
      className: 'button secondary',
      text: 'Cancel editing',
      attrs: { id: 'businessProfileEditCancel', type: 'button' }
    });
    cancel.addEventListener('click', () => {
      const form = document.getElementById('businessForm');
      if (form) form.dataset.profileEditOpen = '0';
      syncBusinessLifecycleUI();
    });
    actions.append(cancel);
  }
  return cancel;
}

function setBusinessProfileEditor(open, status) {
  const form = document.getElementById('businessForm');
  if (!form) return;
  form.hidden = !open;
  form.classList.toggle('business-profile-editing', open);

  const progress = document.getElementById('businessWorkflowProgress');
  const back = document.getElementById('businessStepBack');
  const next = document.getElementById('businessStepNext');
  const submit = document.getElementById('businessSubmitButton');
  const cancel = ensureEditCancelButton();

  if (!open) {
    if (cancel) cancel.hidden = true;
    return;
  }

  if (progress) progress.hidden = true;
  if (back) back.hidden = true;
  if (next) next.hidden = true;
  if (submit) {
    submit.hidden = false;
    submit.textContent = 'Save business profile';
  }
  if (cancel) cancel.hidden = false;

  document.querySelectorAll('[data-business-workflow-step]').forEach((node) => {
    if (node.id === 'businessReviewSummary' || node.id === 'businessRegistrationAgreements') {
      node.hidden = true;
      return;
    }
    node.hidden = false;
  });

  const reviewSummary = document.getElementById('businessReviewSummary');
  if (reviewSummary) reviewSummary.hidden = true;
  const agreements = document.getElementById('businessRegistrationAgreements');
  if (agreements) agreements.hidden = true;
  const resubmit = document.getElementById('resubmitBusinessButton');
  if (resubmit) resubmit.hidden = !['changes_requested', 'rejected'].includes(status);
}

function showRegistrationWizard() {
  const form = document.getElementById('businessForm');
  if (!form) return;
  form.hidden = false;
  form.classList.remove('business-profile-editing');
  form.dataset.profileEditOpen = '0';
  const progress = document.getElementById('businessWorkflowProgress');
  if (progress) progress.hidden = false;
  const cancel = document.getElementById('businessProfileEditCancel');
  if (cancel) cancel.hidden = true;
  document.querySelector('[data-business-step="0"]')?.click();
}

function lifecycleCard() {
  const form = document.getElementById('businessForm');
  if (!form) return null;
  let card = document.getElementById('businessLifecycleCard');
  if (!card) {
    card = createElement('section', {
      className: 'business-lifecycle-card',
      attrs: { id: 'businessLifecycleCard', 'aria-live': 'polite' }
    });
    form.before(card);
  }
  return card;
}

function openListingFromBusinessCard() {
  const listingsTab = document.querySelector('[data-tab="listings"]');
  listingsTab?.click();
  setTimeout(() => document.getElementById('newListingButton')?.click(), 0);
}

function renderLifecycleCard(status) {
  const card = lifecycleCard();
  if (!card) return;
  card.hidden = false;
  card.className = `business-lifecycle-card ${status}`;

  const name = fieldValue('businessName') || 'Your business';
  const island = fieldValue('businessIsland');
  const email = fieldValue('businessEmail');
  const phone = fieldValue('businessPhone');
  const registration = fieldValue('registrationNumber');
  const verified = status === 'verified';
  const pending = status === 'pending_review';
  const correction = ['changes_requested', 'rejected'].includes(status);

  const pillText = verified ? '✓ Verified' : pending ? 'Pending verification' : status === 'changes_requested' ? 'Changes requested' : 'Review required';
  const title = createElement('div', {
    className: 'business-lifecycle-title',
    children: [
      createElement('span', { className: 'business-lifecycle-pill', text: pillText }),
      createElement('h3', { text: name }),
      createElement('p', { text: island ? `${island}, Baa Atoll` : 'Baa Atoll' })
    ]
  });

  const head = createElement('div', { className: 'business-lifecycle-head', children: [title] });
  const copy = createElement('p', {
    className: 'business-lifecycle-copy',
    text: verified
      ? 'Your business is verified. You can now create services and listings, set operator-controlled prices, manage availability and receive enquiries.'
      : pending
        ? 'Your business registration has been submitted. Visit Baa is reviewing it. Listings will unlock after administrator verification.'
        : 'Update the requested business details below, then resubmit the business for administrator review.'
  });

  const meta = createElement('div', { className: 'business-lifecycle-meta' });
  if (registration) meta.append(createElement('span', { text: `Registration: ${registration}` }));
  if (email) meta.append(createElement('span', { text: email }));
  if (phone) meta.append(createElement('span', { text: phone }));

  const actions = createElement('div', { className: 'business-lifecycle-actions' });
  const edit = createElement('button', {
    className: 'button secondary',
    text: correction ? 'Edit required details' : pending ? 'Edit submitted details' : 'Edit Business Profile',
    attrs: { type: 'button' }
  });
  edit.addEventListener('click', () => {
    const form = document.getElementById('businessForm');
    if (form) form.dataset.profileEditOpen = '1';
    syncBusinessLifecycleUI();
    form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  actions.append(edit);

  if (verified) {
    const addListing = createElement('button', {
      className: 'button aqua',
      text: '+ Add Listing',
      attrs: { type: 'button' }
    });
    addListing.addEventListener('click', openListingFromBusinessCard);
    actions.prepend(addListing);

    const publicLink = document.querySelector('.business-management-card.selected a[href^="business.html"]');
    if (publicLink?.href) {
      actions.append(createElement('a', {
        className: 'button secondary',
        text: 'View Public Page',
        attrs: { href: publicLink.getAttribute('href') }
      }));
    }
  }

  card.replaceChildren(head, copy, meta, actions);
}

function syncBusinessLifecycleUI() {
  const form = document.getElementById('businessForm');
  if (!form) return;
  ensureBusinessLifecycleStyles();

  const status = businessStatusKey();
  const identity = selectedBusinessIdentity();
  if (form.dataset.lifecycleBusinessId !== identity) {
    form.dataset.lifecycleBusinessId = identity;
    form.dataset.profileEditOpen = '0';
  }

  const note = document.getElementById('simpleBusinessFlowNote');
  const panelTitle = document.getElementById('businessPanelTitle');
  const panelDescription = document.getElementById('businessPanelDescription');
  const card = lifecycleCard();

  if (!status || status === 'registration_required') {
    if (card) card.hidden = true;
    if (note) note.hidden = false;
    if (panelTitle) panelTitle.textContent = 'Complete business registration';
    if (panelDescription) panelDescription.textContent = 'Submit your business details for administrator review.';
    showRegistrationWizard();
    return;
  }

  if (note) note.hidden = true;
  renderLifecycleCard(status);

  if (status === 'verified') {
    if (panelTitle) panelTitle.textContent = 'Business Profile';
    if (panelDescription) panelDescription.textContent = 'Your verified business details. Edit them only when something changes.';
  } else if (status === 'pending_review') {
    if (panelTitle) panelTitle.textContent = 'Business submitted';
    if (panelDescription) panelDescription.textContent = 'Your registration is awaiting administrator verification.';
  } else {
    if (panelTitle) panelTitle.textContent = 'Business details need attention';
    if (panelDescription) panelDescription.textContent = 'Make the requested corrections and resubmit for review.';
  }

  const correction = ['changes_requested', 'rejected'].includes(status);
  const editOpen = form.dataset.profileEditOpen === '1' || correction;
  setBusinessProfileEditor(editOpen, status);
}

function addManualAvailabilityShortcut() {
  const panel = document.querySelector('[data-tab-panel="availability"]');
  if (!panel || document.getElementById('manualAvailabilityShortcut')) return;
  const heading = panel.querySelector('.panel .panel-head');
  if (!heading) return;
  const link = createElement('a', {
    className: 'button aqua',
    text: 'Manual booking sync',
    attrs: {
      id: 'manualAvailabilityShortcut',
      href: 'operator-availability.html',
      title: 'Record Agoda, Booking.com, direct and walk-in bookings'
    }
  });
  heading.append(link);
}

function universalChoicesPresent(host) {
  return host.children.length === LISTING_CHOICES.length && [...host.children].every((child) => child.dataset.simpleListingChoice === '1');
}

function renderUniversalListingChoices() {
  const host = document.getElementById('listingTypeCards');
  const chooser = document.getElementById('listingTypeChooser');
  const form = document.getElementById('listingForm');
  if (!host || !chooser || !form || chooser.hidden || universalChoicesPresent(host)) return;

  host.replaceChildren(...LISTING_CHOICES.map((item) => {
    const button = createElement('button', {
      className: 'listing-type-card',
      attrs: { type: 'button', 'data-simple-listing-choice': '1' },
      children: [
        createElement('strong', { text: item.label }),
        createElement('span', { text: item.detail })
      ]
    });
    button.addEventListener('click', () => {
      const category = document.getElementById('listingCategory');
      const kind = document.getElementById('listingKind');
      category.value = item.category;
      kind.value = item.kind;
      category.dispatchEvent(new Event('change', { bubbles: true }));
      kind.dispatchEvent(new Event('change', { bubbles: true }));
      chooser.hidden = true;
      form.hidden = false;
      document.querySelector('[data-listing-step="0"]')?.click();
    });
    return button;
  }));
}

function boot() {
  if (!document.getElementById('businessForm') || !document.getElementById('listingForm')) return;
  simplifyBusinessWizard();
  addManualAvailabilityShortcut();
  renderUniversalListingChoices();
  syncBusinessLifecycleUI();

  const host = document.getElementById('listingTypeCards');
  if (host && host.dataset.simpleObserver !== 'bound') {
    host.dataset.simpleObserver = 'bound';
    new MutationObserver(() => queueMicrotask(renderUniversalListingChoices)).observe(host, { childList: true });
  }

  const status = document.getElementById('businessStatus');
  if (status && status.dataset.lifecycleObserver !== 'bound') {
    status.dataset.lifecycleObserver = 'bound';
    new MutationObserver(() => queueMicrotask(syncBusinessLifecycleUI)).observe(status, { childList: true, subtree: true, characterData: true });
  }

  const switcher = document.getElementById('businessSwitcher');
  switcher?.addEventListener('change', () => {
    const form = document.getElementById('businessForm');
    if (form) form.dataset.profileEditOpen = '0';
    setTimeout(syncBusinessLifecycleUI, 0);
  });

  document.getElementById('businessForm')?.addEventListener('submit', () => {
    const statusKey = businessStatusKey();
    if (statusKey && statusKey !== 'registration_required') {
      const form = document.getElementById('businessForm');
      if (form) form.dataset.profileEditOpen = '0';
      setTimeout(syncBusinessLifecycleUI, 50);
    }
  });

  document.getElementById('newListingButton')?.addEventListener('click', () => setTimeout(renderUniversalListingChoices, 0));
  document.getElementById('registerAnotherBusiness')?.addEventListener('click', () => {
    const form = document.getElementById('businessForm');
    if (form) {
      form.dataset.profileEditOpen = '0';
      form.dataset.lifecycleBusinessId = '';
    }
    setTimeout(() => {
      simplifyBusinessWizard();
      syncBusinessLifecycleUI();
    }, 0);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
