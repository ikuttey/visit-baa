import { requirePublicSupabase, showConfigurationNotice } from './supabase-client.js';
import { signedPublicImageUrl } from './storage.js';
import { renderPublicListingMedia } from './public-media.js';
import { categoryFallback } from './listing-workflow.js';
import { clear, createElement, emptyState, formatMoney, setMessage, statusLabel } from './ui.js';

const container = document.getElementById('businessDetail');
const message = document.getElementById('businessPageMessage');

async function init() {
  if (showConfigurationNotice(document.getElementById('configMessage'))) return container.append(emptyState('Business data is not connected', 'Configure Supabase to load verified businesses.'));
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) return container.append(emptyState('No business selected', 'Return to a listing and choose its verified business.'));
  try {
    setMessage(message, 'Loading verified business…', 'loading');
    const client = requirePublicSupabase();
    const [businessResult, imageResult, listingResult] = await Promise.all([
      client.from('public_businesses').select('*').eq('id', id).maybeSingle(),
      client.from('business_images').select('id,storage_path,caption,sort_order').eq('business_id', id).order('sort_order'),
      client.from('public_listings').select('*').eq('business_id', id).order('updated_at', { ascending: false })
    ]);
    if (businessResult.error) throw businessResult.error;
    if (imageResult.error) throw imageResult.error;
    if (listingResult.error) throw listingResult.error;
    if (!businessResult.data) return container.append(emptyState('Business unavailable', 'This business may be unverified, suspended, or no longer active.'));
    await renderBusiness(businessResult.data, imageResult.data || [], listingResult.data || []);
    setMessage(message);
  } catch (error) { setMessage(message, error.message, 'error'); }
}

async function renderBusiness(business, images, listings) {
  clear(container);
  document.title = `${business.business_name} — Baa Local`;
  const logo = createElement('div', { className: 'business-logo-large' });
  const logoUrl = business.logo_path ? await signedPublicImageUrl('business-logos', business.logo_path) : '';
  if (logoUrl) {
    const image = createElement('img', { attrs: { src: logoUrl, alt: `${business.business_name} logo` } });
    image.addEventListener('error', () => showBusinessFallback(logo, business.category), { once: true });
    logo.append(image);
  } else showBusinessFallback(logo, business.category);

  const contacts = createElement('div', { className: 'form-actions' });
  if (business.contact_email) contacts.append(createElement('a', { className: 'button secondary', text: 'Email business', attrs: { href: `mailto:${business.contact_email}` } }));
  if (business.contact_phone) contacts.append(createElement('a', { className: 'button secondary', text: 'Call business', attrs: { href: `tel:${business.contact_phone.replace(/[^+\d]/g, '')}` } }));
  if (business.website_url) contacts.append(createElement('a', { className: 'button secondary', text: 'Visit website', attrs: { href: business.website_url, target: '_blank', rel: 'noopener noreferrer' } }));

  const header = createElement('section', { className: 'business-profile panel', children: [logo, createElement('div', { children: [
    createElement('span', { className: 'eyebrow', text: `${business.island} · ${statusLabel(business.category)}` }),
    createElement('h1', { text: business.business_name }), createElement('p', { text: business.description }),
    business.business_address ? createElement('p', { className: 'help', text: business.business_address }) : null, contacts
  ] })] });

  const gallery = createElement('section', { className: 'panel', children: [createElement('div', { className: 'panel-head', children: [createElement('div', { children: [createElement('h2', { text: 'Business photographs' }), createElement('p', { text: 'Approved photographs supplied by this verified operator.' })] })] })] });
  const galleryGrid = createElement('div', { className: 'preview-grid' });
  for (const item of images) {
    const url = await signedPublicImageUrl('business-gallery', item.storage_path);
    if (!url) continue;
    const figure = createElement('figure', { className: 'preview captioned' });
    const image = createElement('img', { attrs: { src: url, alt: item.caption || `${business.business_name} photograph`, loading: 'lazy' } });
    image.addEventListener('error', () => figure.remove(), { once: true });
    figure.append(image);
    if (item.caption) figure.append(createElement('figcaption', { text: item.caption }));
    galleryGrid.append(figure);
  }
  if (galleryGrid.childElementCount) gallery.append(galleryGrid); else gallery.append(emptyState('No business photographs', 'This operator has not added public gallery photographs yet.'));

  const services = createElement('section', { className: 'panel', children: [createElement('div', { className: 'panel-head', children: [createElement('div', { children: [createElement('h2', { text: 'Services offered' }), createElement('p', { text: 'Active services published by this business.' })] })] })] });
  const grid = createElement('div', { className: 'listing-grid' });
  for (const listing of listings) {
    const media = createElement('div', { className: 'listing-card-media' });
    await renderPublicListingMedia(media, listing);
    grid.append(createElement('article', { className: 'listing-card', children: [media, createElement('div', { className: 'listing-card-body', children: [
      createElement('span', { className: 'eyebrow', text: statusLabel(listing.category) }), createElement('h3', { text: listing.title }),
      createElement('div', { className: 'listing-meta', children: [createElement('span', { text: listing.island }), createElement('span', { text: business.business_name })] }),
      createElement('p', { text: listing.summary }), createElement('div', { className: 'price', text: `${formatMoney(listing.price, listing.currency)} ${statusLabel(listing.price_unit)}` }),
      createElement('div', { className: 'form-actions', children: [createElement('a', { className: 'button secondary', text: 'View details →', attrs: { href: `listing.html?id=${encodeURIComponent(listing.id)}` } })] })
    ] })] }));
  }
  if (grid.childElementCount) services.append(grid); else services.append(emptyState('No published services', 'This verified business does not currently have an active published service.'));
  container.append(header, gallery, services);
}

function showBusinessFallback(container, category) {
  const fallback = categoryFallback(category === 'guesthouse_hotel' ? 'accommodation' : 'other');
  container.replaceChildren(createElement('div', { className: `category-fallback ${fallback.className}`, children: [createElement('span', { className: 'category-fallback-symbol', text: fallback.symbol }), createElement('span', { className: 'category-fallback-label', text: fallback.label })] }));
}

init();
