import {
  FACILITY_ALIASES, FACILITY_GROUPS, FACILITY_HEADINGS,
  POPULAR_FACILITIES, PUBLIC_FACILITY_HEADINGS
} from './facilities-config.js';

function plainKey(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeFacility(value = '') {
  const key = plainKey(value);
  return FACILITY_ALIASES[key] || key;
}

// Match configured labels and legacy stored aliases without rewriting amenities.
export function facilityQueryAliases(value = '') {
  const normalized = normalizeFacility(value);
  return [...new Set([
    String(value).trim(), plainKey(value), normalized,
    ...Object.entries(FACILITY_ALIASES).filter(([, target]) => target === normalized).map(([alias]) => alias)
  ].filter(Boolean))];
}

export function uniqueFacilities(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : String(values).split(','))
    .map((value) => String(value).trim())
    .filter((value) => {
      const key = normalizeFacility(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function categoryFacilities(category) {
  const groups = FACILITY_GROUPS[category] || FACILITY_GROUPS.other;
  const popular = POPULAR_FACILITIES[category] || POPULAR_FACILITIES.other;
  return { groups, popular };
}

function knownFacilityMap(category) {
  const { groups, popular } = categoryFacilities(category);
  const map = new Map();
  [...popular, ...groups.flatMap((group) => group.items)].forEach((item) => {
    const directKey = plainKey(item);
    const aliasKey = normalizeFacility(item);
    if (!map.has(directKey)) map.set(directKey, item);
    if (!map.has(aliasKey)) map.set(aliasKey, item);
  });
  return map;
}

export function partitionFacilities(category, amenities = []) {
  const knownMap = knownFacilityMap(category);
  const known = new Map();
  const custom = [];
  uniqueFacilities(amenities).forEach((storedLabel) => {
    const configuredLabel = knownMap.get(plainKey(storedLabel)) || knownMap.get(normalizeFacility(storedLabel));
    if (configuredLabel) known.set(normalizeFacility(configuredLabel), { configuredLabel, storedLabel });
    else custom.push(storedLabel);
  });
  return { known, custom };
}

export function groupedSelectedFacilities(category, amenities = []) {
  const clean = uniqueFacilities(amenities);
  const { groups, popular } = categoryFacilities(category);
  const selectedByKey = new Map(clean.map((item) => [normalizeFacility(item), item]));
  const configuredKeys = new Set();
  groups.forEach((group) => group.items.forEach((item) => configuredKeys.add(normalizeFacility(item))));
  popular.forEach((item) => configuredKeys.add(normalizeFacility(item)));
  const selectedPopular = popular.filter((item) => selectedByKey.has(normalizeFacility(item)));
  const assignedKeys = new Set();
  const selectedGroups = groups.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => {
      const key = normalizeFacility(item);
      if (!selectedByKey.has(key) || assignedKeys.has(key)) return false;
      assignedKeys.add(key);
      return true;
    })
  })).filter((group) => group.items.length);
  const custom = clean.filter((item) => !configuredKeys.has(normalizeFacility(item)));
  if (custom.length) selectedGroups.push({ label: 'Other facilities / services', items: custom });
  return { popular: selectedPopular, groups: selectedGroups };
}

function element(tag, { className, text, attrs, children } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  Object.entries(attrs || {}).forEach(([name, value]) => node.setAttribute(name, String(value)));
  if (children) node.append(...children.filter(Boolean));
  return node;
}

function checklistItem(label, selectedKeys, onChange) {
  const key = normalizeFacility(label);
  const input = element('input', { attrs: { type: 'checkbox', value: label, 'data-facility-key': key } });
  input.checked = selectedKeys.has(key);
  input.addEventListener('change', () => onChange(key, input.checked));
  return element('label', {
    className: 'facility-option',
    attrs: { 'data-search-text': plainKey(label) },
    children: [input, element('span', { text: label })]
  });
}

export class FacilitiesSelector {
  constructor(container) {
    this.container = container;
    this.category = 'other';
    this.selections = new Map();
  }

  load(category, amenities = []) {
    this.selections.clear();
    this.category = category || 'other';
    this.selections.set(this.category, uniqueFacilities(amenities));
    this.render();
  }

  switchCategory(category) {
    this.collect();
    this.category = category || 'other';
    if (!this.selections.has(this.category)) this.selections.set(this.category, []);
    this.render();
  }

  collect() {
    if (!this.container) return [];
    const previous = this.selections.get(this.category) || [];
    const previousByKey = new Map(previous.map((label) => [normalizeFacility(label), label]));
    const checked = [...this.container.querySelectorAll('input[type="checkbox"]:checked')]
      .map((input) => previousByKey.get(input.dataset.facilityKey) || input.value);
    const custom = String(this.container.querySelector('[data-custom-facilities]')?.value || '').split(',');
    const values = uniqueFacilities([...checked, ...custom]);
    this.selections.set(this.category, values);
    return values;
  }

  render() {
    if (!this.container) return;
    this.container.replaceChildren();
    const values = this.selections.get(this.category) || [];
    const { known, custom } = partitionFacilities(this.category, values);
    const selectedKeys = new Set(known.keys());
    const { groups, popular } = categoryFacilities(this.category);
    const search = element('input', {
      attrs: { type: 'search', placeholder: 'Search facilities...', 'aria-label': 'Search facilities and services' }
    });
    const groupsContainer = element('div', { className: 'facility-groups' });
    const syncCheckboxes = (key, checked) => {
      this.container.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        if (input.dataset.facilityKey === key) input.checked = checked;
      });
    };
    const addGroup = (label, items, popularGroup = false) => {
      const uniqueItems = items.filter((item, index) => items.findIndex((candidate) => normalizeFacility(candidate) === normalizeFacility(item)) === index);
      const group = element('section', {
        className: `facility-group${popularGroup ? ' popular' : ''}`,
        children: [
          element('h4', { text: label }),
          element('div', { className: 'facility-options', children: uniqueItems.map((item) => checklistItem(item, selectedKeys, syncCheckboxes)) })
        ]
      });
      groupsContainer.append(group);
    };
    addGroup('Most popular', popular, true);
    groups.forEach((group) => addGroup(group.label, group.items));
    search.addEventListener('input', () => {
      const query = plainKey(search.value);
      groupsContainer.querySelectorAll('.facility-option').forEach((option) => {
        option.hidden = Boolean(query) && !option.dataset.searchText.includes(query);
      });
      groupsContainer.querySelectorAll('.facility-group').forEach((group) => {
        group.hidden = ![...group.querySelectorAll('.facility-option')].some((option) => !option.hidden);
      });
    });
    const customInput = element('input', {
      attrs: {
        type: 'text',
        value: custom.join(', '),
        placeholder: 'House reef access, private jetty, marine biologist guide',
        'data-custom-facilities': ''
      }
    });
    this.container.append(
      element('div', { className: 'facility-selector-head', children: [
        element('div', { children: [
          element('h3', { text: FACILITY_HEADINGS[this.category] || FACILITY_HEADINGS.other }),
          element('p', { text: 'Select only the facilities and services this listing actually provides.' })
        ] }),
        search
      ] }),
      element('p', { className: 'facility-switch-note', text: 'Selections are kept per category while this editor is open. Only the category currently shown is saved.' }),
      groupsContainer,
      element('div', { className: 'field facility-custom', children: [
        element('label', { text: 'Other facilities or services', attrs: { for: 'customFacilities' } }),
        customInput,
        element('small', { text: 'Separate uncommon options with commas. Blank and duplicate values are removed.' })
      ] })
    );
    customInput.id = 'customFacilities';
  }
}

function facilityGroupView(group) {
  return element('section', {
    className: 'selected-facility-group',
    children: [
      element('h3', { text: group.label }),
      element('ul', { className: 'selected-facility-list', children: group.items.map((item) => element('li', { text: item })) })
    ]
  });
}

export function renderFacilitiesView(listing, { context = 'public' } = {}) {
  const selected = groupedSelectedFacilities(listing.category, listing.amenities);
  if (!selected.popular.length && !selected.groups.length) return null;
  const headingFactory = PUBLIC_FACILITY_HEADINGS[listing.category] || PUBLIC_FACILITY_HEADINGS.other;
  const section = element('section', { className: `facilities-view ${context === 'admin' ? 'admin-facilities-view' : 'public-facilities-view'}` });
  section.append(element('h2', { text: context === 'admin' ? 'Facilities & services' : headingFactory(listing) }));
  if (context === 'public' && selected.popular.length) {
    section.append(facilityGroupView({ label: 'Most popular', items: selected.popular }));
  }
  const groupViews = selected.groups.map(facilityGroupView);
  if (context === 'public' && groupViews.length > 2) {
    groupViews.forEach((view, index) => { if (index > 1) view.hidden = true; });
    const toggle = element('button', { className: 'button secondary facilities-toggle', text: 'Show all facilities', attrs: { type: 'button', 'aria-expanded': 'false' } });
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      groupViews.forEach((view, index) => { if (index > 1) view.hidden = expanded; });
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.textContent = expanded ? 'Show all facilities' : 'Show fewer';
    });
    section.append(...groupViews, toggle);
  } else section.append(...groupViews);
  return section;
}
