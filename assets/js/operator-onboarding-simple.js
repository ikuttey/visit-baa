import { requireSupabase } from './supabase-client.js';
import { createElement, setMessage } from './ui.js';

const CATEGORY_TO_SERVICE = Object.freeze({
  accommodation: 'accommodation',
  excursion: 'excursions',
  snorkelling: 'excursions',
  diving: 'diving',
  transfer: 'transport',
  fishing: 'fishing',
  watersports: 'watersports',
  food_dining: 'food-dining',
  conservation_experience: 'conservation',
  community_experience: 'local-experiences',
  other: 'other'
});

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

  const ensureCompatibilityChoice = () => {
    const checked = serviceChoices?.querySelector('[name="operatorService"]:checked');
    if (checked) return;
    const fallback = serviceChoices?.querySelector('[name="operatorService"][value="other"]') || serviceChoices?.querySelector('[name="operatorService"]');
    if (fallback) fallback.checked = true;
  };
  ensureCompatibilityChoice();
  if (serviceChoices) new MutationObserver(ensureCompatibilityChoice).observe(serviceChoices, { childList: true, subtree: true });

  const next = document.getElementById('businessStepNext');
  const back = document.getElementById('businessStepBack');
  next?.addEventListener('click', () => queueMicrotask(() => {
    if (selectedStep() === '1') step2?.click();
  }));
  back?.addEventListener('click', () => queueMicrotask(() => {
    if (selectedStep() === '1') step0?.click();
  }));

  const review = document.getElementById('businessReviewSummary');
  const removeServiceReview = () => {
    review?.querySelectorAll('dl > div').forEach((row) => {
      if (row.querySelector('dt')?.textContent.trim() === 'Services') row.remove();
    });
  };
  removeServiceReview();
  if (review) new MutationObserver(removeServiceReview).observe(review, { childList: true, subtree: true });
}

function renderUniversalListingChoices() {
  const host = document.getElementById('listingTypeCards');
  const chooser = document.getElementById('listingTypeChooser');
  const form = document.getElementById('listingForm');
  if (!host || !chooser || !form || chooser.hidden) return;
  if (host.dataset.simpleChoices === 'ready' && host.children.length === LISTING_CHOICES.length) return;

  host.dataset.simpleChoices = 'ready';
  host.replaceChildren(...LISTING_CHOICES.map((item) => {
    const button = createElement('button', {
      className: 'listing-type-card',
      attrs: { type: 'button' },
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

async function ensureBusinessServiceForListing(category) {
  const businessId = document.getElementById('businessSwitcher')?.value;
  if (!businessId) throw new Error('Choose a verified business before creating a listing.');
  const slug = CATEGORY_TO_SERVICE[category] || 'other';
  const client = requireSupabase();

  const serviceResult = await client
    .from('service_categories')
    .select('id,slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (serviceResult.error) throw serviceResult.error;
  if (!serviceResult.data?.id) throw new Error(`The service category “${slug}” is not available.`);

  const existing = await client
    .from('business_service_categories')
    .select('service_category_id')
    .eq('business_id', businessId)
    .eq('service_category_id', serviceResult.data.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return;

  const inserted = await client.from('business_service_categories').insert({
    business_id: businessId,
    service_category_id: serviceResult.data.id
  });
  if (inserted.error) throw inserted.error;
}

function bindListingCapabilitySync() {
  const form = document.getElementById('listingForm');
  const message = document.getElementById('dashboardMessage');
  if (!form || form.dataset.simpleCapabilitySync === 'bound') return;
  form.dataset.simpleCapabilitySync = 'bound';
  let replay = false;

  form.addEventListener('submit', async (event) => {
    if (replay) {
      replay = false;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      await ensureBusinessServiceForListing(document.getElementById('listingCategory').value);
      replay = true;
      form.requestSubmit(form.querySelector('button[type="submit"]'));
    } catch (error) {
      setMessage(message, `The service could not be linked to this business: ${error.message}`, 'error');
    }
  }, true);
}

function boot() {
  if (!document.getElementById('businessForm') || !document.getElementById('listingForm')) return;
  simplifyBusinessWizard();
  bindListingCapabilitySync();
  renderUniversalListingChoices();

  const host = document.getElementById('listingTypeCards');
  if (host) new MutationObserver(() => {
    host.dataset.simpleChoices = '';
    queueMicrotask(renderUniversalListingChoices);
  }).observe(host, { childList: true });

  document.getElementById('newListingButton')?.addEventListener('click', () => setTimeout(renderUniversalListingChoices, 0));
  document.getElementById('registerAnotherBusiness')?.addEventListener('click', () => setTimeout(simplifyBusinessWizard, 0));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
