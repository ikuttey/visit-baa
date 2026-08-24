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
  renderUniversalListingChoices();

  const host = document.getElementById('listingTypeCards');
  if (host && host.dataset.simpleObserver !== 'bound') {
    host.dataset.simpleObserver = 'bound';
    new MutationObserver(() => queueMicrotask(renderUniversalListingChoices)).observe(host, { childList: true });
  }

  document.getElementById('newListingButton')?.addEventListener('click', () => setTimeout(renderUniversalListingChoices, 0));
  document.getElementById('registerAnotherBusiness')?.addEventListener('click', () => setTimeout(simplifyBusinessWizard, 0));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
