import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FACILITY_GROUPS, OPERATOR_LISTING_DEFAULTS, POPULAR_FACILITIES
} from '../assets/js/facilities-config.js';
import {
  categoryFacilities, facilityQueryAliases, groupedSelectedFacilities, normalizeFacility,
  partitionFacilities, uniqueFacilities
} from '../assets/js/facilities-ui.js';

const listingCategories = [
  'accommodation', 'excursion', 'diving', 'snorkelling', 'fishing',
  'watersports', 'food_dining', 'transfer', 'conservation_experience',
  'community_experience', 'other'
];
const operatorCategories = [
  'guesthouse_hotel', 'dive_centre', 'snorkelling_excursion', 'fishing_operator',
  'watersports_provider', 'restaurant_cafe', 'speedboat_transfer',
  'conservation_community', 'other_tourism_service'
];

for (const category of listingCategories) {
  assert.ok(FACILITY_GROUPS[category]?.length, `${category} needs facility groups`);
  assert.ok(POPULAR_FACILITIES[category]?.length, `${category} needs popular facilities`);
  const configured = new Set(FACILITY_GROUPS[category].flatMap((group) => group.items).map(normalizeFacility));
  for (const item of POPULAR_FACILITIES[category]) {
    assert.ok(configured.has(normalizeFacility(item)), `${category} popular facility must exist in its groups: ${item}`);
  }
  assert.equal(categoryFacilities(category).groups, FACILITY_GROUPS[category]);
  const firstFacility = FACILITY_GROUPS[category][0].items[0];
  const grouped = groupedSelectedFacilities(category, [firstFacility, `Custom ${category} service`]);
  assert.ok(grouped.groups.some((group) => group.items.includes(firstFacility)), `${category} must group selected configured facilities`);
  assert.ok(grouped.groups.some((group) => group.items.includes(`Custom ${category} service`)), `${category} must retain custom facilities`);
  const fullList = grouped.groups.flatMap((group) => group.items).map(normalizeFacility);
  assert.equal(fullList.length, new Set(fullList).size, `${category} must not repeat a facility across full-view groups`);
}

for (const category of operatorCategories) {
  assert.ok(OPERATOR_LISTING_DEFAULTS[category]?.length, `${category} needs at least one sensible listing default`);
  OPERATOR_LISTING_DEFAULTS[category].forEach((listingCategory) => assert.ok(listingCategories.includes(listingCategory)));
}

assert.deepEqual(uniqueFacilities(['wifi', 'WiFi', 'Wi-Fi', 'Free WiFi', 'Free Wi-Fi']), ['wifi']);
assert.ok(facilityQueryAliases('Free Wi-Fi').includes('wifi'), 'facility filters must match legacy WiFi aliases');
assert.deepEqual(uniqueFacilities(['Life jackets', '', ' life jackets ', 'GPS']), ['Life jackets', 'GPS']);

const divingEdit = partitionFacilities('diving', ['Nitrox', 'Emergency oxygen', 'PADI Dive Centre', 'Marine biologist guide']);
assert.equal(divingEdit.known.get(normalizeFacility('Nitrox available')).storedLabel, 'Nitrox');
assert.deepEqual(divingEdit.custom, ['PADI Dive Centre', 'Marine biologist guide']);

const fishing = groupedSelectedFacilities('fishing', [
  'Fishing equipment included', 'Bait included', 'Life jackets',
  'Fish barbecue arrangement', 'Fish barbecue arrangement'
]);
assert.ok(fishing.popular.includes('Fishing equipment included'));
assert.ok(fishing.groups.some((group) => group.label === 'Safety' && group.items.includes('Life jackets')));
assert.deepEqual(fishing.groups.find((group) => group.label === 'Other facilities / services').items, ['Fish barbecue arrangement']);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [operator, operatorHtml, publicDetail, admin] = await Promise.all([
  readFile(path.join(root, 'assets/js/operator-content-v2.js'), 'utf8'),
  readFile(path.join(root, 'operator-content.html'), 'utf8'),
  readFile(path.join(root, 'assets/js/listing-detail.js'), 'utf8'),
  readFile(path.join(root, 'assets/js/admin-dashboard.js'), 'utf8')
]);
assert.match(operator, /amenities:list\('amenities'\)/, 'V2 Listings must save facilities/amenities for every category');
assert.doesNotMatch(operator, /amenities:\s*val\('listingCategory'\)===['"]accommodation['"]/, 'amenities must not be restricted to accommodation');
assert.match(operatorHtml, /id="amenities"/, 'V2 Listings must expose the facilities/amenities field');
assert.match(publicDetail, /renderFacilitiesView\(listing\)/);
assert.match(admin, /renderFacilitiesView\(listing, \{ context: 'admin' \}\)/);

console.log(`Facilities tests passed for ${listingCategories.length} listing categories and ${operatorCategories.length} operator categories.`);
