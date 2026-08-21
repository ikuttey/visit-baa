export function clear(element) {
  if (element) element.replaceChildren();
}

export function createElement(tag, options = {}) {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = String(options.text);
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([name, value]) => {
      if (value !== null && value !== undefined) element.setAttribute(name, String(value));
    });
  }
  if (options.children) element.append(...options.children.filter(Boolean));
  return element;
}

export function setMessage(element, message = '', type = 'info') {
  if (!element) return;
  element.hidden = !message;
  element.className = `message ${type}`;
  element.textContent = message;
}

export function setBusy(button, busy, busyText = 'Please wait…') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

export function statusLabel(value = '') {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function statusBadge(value) {
  return createElement('span', {
    className: `status ${String(value || '').replaceAll('_', '-')}`,
    text: statusLabel(value || 'unknown')
  });
}

export function formatMoney(amount, currency = 'USD') {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(Number(amount || 0));
}

export function formatDate(value, includeTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat('en', includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(date);
}

export function commaList(value = '') {
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

export function displayList(value) {
  return Array.isArray(value) && value.length ? value.join(', ') : '—';
}

export function emptyState(title, description) {
  return createElement('div', {
    className: 'empty-state',
    children: [
      createElement('strong', { text: title }),
      createElement('span', { text: description })
    ]
  });
}

export function confirmAction(message) {
  return window.confirm(message);
}

export function bindTabs(root = document) {
  const tabs = [...root.querySelectorAll('[data-tab]')];
  const panels = [...root.querySelectorAll('[data-tab-panel]')];
  const activate = (tab, focus = false) => {
    tabs.forEach((item) => { const active = item === tab; item.classList.toggle('active', active); item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1; });
    panels.forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== tab.dataset.tab; });
    if (focus) tab.focus();
  };
  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    const panel = panels.find((item) => item.dataset.tabPanel === tab.dataset.tab);
    if (panel) { panel.setAttribute('role', 'tabpanel'); if (!panel.id) panel.id = `tab-panel-${tab.dataset.tab}`; tab.setAttribute('aria-controls', panel.id); }
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      activate(tabs[target], true);
    });
  });
  const initial = tabs.find((tab) => tab.classList.contains('active')) || tabs[0];
  if (initial) activate(initial);
}

export function previewFiles(input, container) {
  clear(container);
  [...(input.files || [])].forEach((file) => {
    const image = createElement('img', { attrs: { alt: `Preview of ${file.name}` } });
    image.src = URL.createObjectURL(file);
    image.addEventListener('load', () => URL.revokeObjectURL(image.src), { once: true });
    container.append(createElement('div', { className: 'preview', children: [image] }));
  });
}
