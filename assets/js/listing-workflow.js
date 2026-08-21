const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createListingId(uuidFactory = () => crypto.randomUUID()) {
  const id = uuidFactory();
  if (!UUID_PATTERN.test(id)) throw new Error('Unable to create a secure listing ID. Refresh the page and try again.');
  return id;
}

export function validateListingFields({ price, priceOnRequest = false, maxCapacity, availableSpaces, startTime, endTime, hasCover }) {
  if (!priceOnRequest && (!Number.isFinite(price) || price <= 0)) throw new Error('Price must be greater than zero.');
  if (priceOnRequest && price !== null) throw new Error('Price-on-request listings must not store a numeric price.');
  if (!Number.isInteger(maxCapacity) || maxCapacity < 1) throw new Error('Maximum capacity must be a positive whole number.');
  if (!Number.isInteger(availableSpaces) || availableSpaces < 0) throw new Error('Available spaces must be zero or a positive whole number.');
  if (availableSpaces > maxCapacity) throw new Error('Available spaces cannot exceed maximum capacity.');
  if (startTime && endTime && endTime <= startTime) throw new Error('Ending time must be later than starting time.');
  if (!hasCover) throw new Error('Add a cover image before saving this listing.');
}

export function validateAvailabilityFields({ maxCapacity, remainingSpaces, startTime, endTime }) {
  if (!Number.isInteger(maxCapacity) || maxCapacity < 1) throw new Error('Maximum capacity must be a positive whole number.');
  if (!Number.isInteger(remainingSpaces) || remainingSpaces < 0) throw new Error('Remaining spaces must be zero or a positive whole number.');
  if (remainingSpaces > maxCapacity) throw new Error('Remaining spaces cannot exceed maximum capacity.');
  if (startTime && endTime && endTime <= startTime) throw new Error('Availability end time must be later than its start time.');
}

export function assertInsertedDraft(record, expectedId, expectedBusinessId) {
  if (!record) throw new Error('The draft was inserted but could not be loaded. Refresh the dashboard before retrying.');
  if (record.id !== expectedId) throw new Error('The saved draft ID did not match the generated listing ID.');
  if (record.business_id !== expectedBusinessId) throw new Error('The saved draft is not linked to your authenticated business.');
  if (record.status !== 'draft') throw new Error('A new listing must be saved as a draft.');
  return record;
}

export function listingMediaCandidates(listing) {
  return [
    listing?.cover_image_path ? { bucket: 'listing-covers', path: listing.cover_image_path, source: 'listing-cover' } : null,
    listing?.business_logo_path ? { bucket: 'business-logos', path: listing.business_logo_path, source: 'business-logo' } : null
  ].filter(Boolean);
}

export function categoryFallback(category = 'other') {
  const fallbacks = {
    accommodation: ['Stay', '⌂'], excursion: ['Explore', '↗'], diving: ['Dive', '◉'], snorkelling: ['Snorkel', '≈'],
    fishing: ['Fish', '◇'], watersports: ['Water', '≋'], food_dining: ['Dine', '✦'], transfer: ['Transfer', '→'],
    conservation_experience: ['Conserve', '◌'], community_experience: ['Community', '◎'], other: ['Discover', '✧']
  };
  const [label, symbol] = fallbacks[category] || fallbacks.other;
  return { label, symbol, className: `category-${String(category).replaceAll('_', '-')}` };
}

export function listingEditAction(status) {
  if (status === 'pending_review') return 'Withdraw for editing';
  if (['draft', 'changes_requested', 'rejected', 'paused', 'published'].includes(status)) return 'Edit';
  return '';
}

export function orderedGalleryItems(items = []) {
  return items
    .filter((item) => !item.removed)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
}

export function moveGalleryItemByKey(items, key, direction) {
  const visible = orderedGalleryItems(items);
  const current = visible.findIndex((item) => (item.id || item.key) === key);
  const target = current + direction;
  if (current < 0 || target < 0 || target >= visible.length) return false;
  const currentOrder = visible[current].sort_order;
  visible[current].sort_order = visible[target].sort_order;
  visible[target].sort_order = currentOrder;
  return true;
}
