import { signedPublicImageUrl } from './storage.js';
import { categoryFallback, listingMediaCandidates } from './listing-workflow.js';
import { createElement } from './ui.js';

function showFallback(container, listing) {
  const fallback = categoryFallback(listing.category);
  container.replaceChildren(createElement('div', {
    className: `category-fallback ${fallback.className}`,
    children: [
      createElement('span', { className: 'category-fallback-symbol', text: fallback.symbol }),
      createElement('span', { className: 'category-fallback-label', text: fallback.label })
    ]
  }));
}

export async function renderPublicListingMedia(container, listing, { loading = 'lazy' } = {}) {
  const candidates = listingMediaCandidates(listing);
  let index = 0;

  const tryNext = async () => {
    while (index < candidates.length) {
      const candidate = candidates[index++];
      const url = await signedPublicImageUrl(candidate.bucket, candidate.path);
      if (!url) continue;
      const alt = candidate.source === 'listing-cover'
        ? `${listing.title} cover image`
        : `${listing.business_name} logo for ${listing.title}`;
      const image = createElement('img', { attrs: { src: url, alt, loading } });
      image.addEventListener('error', tryNext, { once: true });
      container.replaceChildren(image);
      return candidate.source;
    }
    showFallback(container, listing);
    return 'category-fallback';
  };

  return tryNext();
}
