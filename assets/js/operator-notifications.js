import { requireSupabase } from './supabase-client.js';

const client = requireSupabase();
const state = { user: null, items: [], channel: null, open: false };
let center;
let toggle;
let badge;
let panel;
let list;
let markAllButton;

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text != null) node.textContent = String(options.text);
  if (options.attrs) Object.entries(options.attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
  if (options.children) options.children.filter(Boolean).forEach((child) => node.append(child));
  return node;
}

function installStyles() {
  if (document.getElementById('operatorNotificationStyles')) return;
  const style = document.createElement('style');
  style.id = 'operatorNotificationStyles';
  style.textContent = `
    .operator-notification-center{position:relative;display:flex;align-items:center}
    .operator-notification-toggle{position:relative;display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:7px 9px;border:1px solid rgba(255,255,255,.22);border-radius:4px;background:transparent;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
    .operator-notification-toggle:hover,.operator-notification-toggle:focus-visible{background:rgba(255,255,255,.1);outline:none}
    .operator-notification-badge{display:none;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#c73838;color:#fff;font-size:10px;line-height:19px;text-align:center}
    .operator-notification-badge.visible{display:inline-block}
    .operator-notification-panel{position:absolute;z-index:100;top:calc(100% + 8px);right:0;width:min(390px,calc(100vw - 24px));max-height:min(560px,75vh);overflow:hidden;border:1px solid rgba(12,95,103,.18);border-radius:6px;background:#fff;box-shadow:0 18px 44px rgba(7,43,49,.22)}
    .operator-notification-panel[hidden]{display:none}
    .operator-notification-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;border-bottom:1px solid #e6eeee}
    .operator-notification-head strong{font-size:14px;color:#18383e}
    .operator-notification-mark{border:0;background:transparent;color:#087b82;font:inherit;font-size:11px;font-weight:700;cursor:pointer}
    .operator-notification-list{max-height:470px;overflow:auto}
    .operator-notification-item{display:block;width:100%;padding:12px 14px;border:0;border-bottom:1px solid #edf2f2;background:#fff;color:#18383e;text-align:left;font:inherit;cursor:pointer}
    .operator-notification-item:hover,.operator-notification-item:focus-visible{background:#f3fbfb;outline:none}
    .operator-notification-item.unread{background:#eefafa;border-left:4px solid #0b8990;padding-left:10px}
    .operator-notification-item strong{display:block;margin-bottom:3px;font-size:13px}
    .operator-notification-item span{display:block;font-size:11px;line-height:1.45;color:#536d72}
    .operator-notification-item time{display:block;margin-top:6px;font-size:10px;color:#83979a}
    .operator-notification-empty{padding:22px 16px;text-align:center;color:#667f83;font-size:12px}
    @media(max-width:760px){.operator-notification-toggle .label{display:none}.operator-notification-panel{position:fixed;top:62px;left:10px;right:10px;width:auto;max-height:calc(100vh - 78px)}}
  `;
  document.head.append(style);
}

function installUi() {
  if (document.getElementById('operatorNotificationCenter')) return true;
  const nav = document.querySelector('.app-nav');
  if (!nav) return false;

  badge = element('span', { className: 'operator-notification-badge', text: '0', attrs: { 'aria-hidden': 'true' } });
  toggle = element('button', {
    className: 'operator-notification-toggle',
    attrs: { type: 'button', 'aria-expanded': 'false', 'aria-haspopup': 'dialog', 'aria-label': 'Operator notifications' },
    children: [element('span', { text: '🔔', attrs: { 'aria-hidden': 'true' } }), element('span', { className: 'label', text: 'Notifications' }), badge]
  });

  markAllButton = element('button', { className: 'operator-notification-mark', text: 'Mark all read', attrs: { type: 'button' } });
  list = element('div', { className: 'operator-notification-list' });
  panel = element('section', {
    className: 'operator-notification-panel',
    attrs: { hidden: '', role: 'dialog', 'aria-label': 'Notifications' },
    children: [
      element('div', { className: 'operator-notification-head', children: [element('strong', { text: 'Notifications' }), markAllButton] }),
      list
    ]
  });
  center = element('div', { className: 'operator-notification-center', attrs: { id: 'operatorNotificationCenter' }, children: [toggle, panel] });

  const logout = document.getElementById('logoutButton');
  if (logout) nav.insertBefore(center, logout);
  else nav.append(center);

  toggle.addEventListener('click', () => setOpen(!state.open));
  markAllButton.addEventListener('click', markAllRead);
  document.addEventListener('click', (event) => {
    if (state.open && center && !center.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.open) { setOpen(false); toggle.focus(); }
  });
  return true;
}

function setOpen(open) {
  state.open = Boolean(open);
  panel.hidden = !state.open;
  toggle.setAttribute('aria-expanded', String(state.open));
}

function relativeTime(timestamp) {
  const date = new Date(timestamp);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const ranges = [
    ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]
  ];
  for (const [unit, size] of ranges) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

function unreadCount() {
  return state.items.filter((item) => !item.is_read).length;
}

function updateBadge() {
  const count = unreadCount();
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('visible', count > 0);
  toggle.setAttribute('aria-label', count ? `${count} unread operator notification${count === 1 ? '' : 's'}` : 'Operator notifications');
  document.title = count ? `(${count}) ${document.title.replace(/^\(\d+\)\s*/, '')}` : document.title.replace(/^\(\d+\)\s*/, '');
}

function render() {
  list.replaceChildren();
  if (!state.items.length) {
    list.append(element('div', { className: 'operator-notification-empty', text: 'No notifications yet. New bookings, guest messages and important account updates will appear here.' }));
    markAllButton.hidden = true;
    updateBadge();
    return;
  }

  markAllButton.hidden = unreadCount() === 0;
  state.items.forEach((item) => {
    const button = element('button', {
      className: `operator-notification-item${item.is_read ? '' : ' unread'}`,
      attrs: { type: 'button' },
      children: [
        element('strong', { text: item.title }),
        element('span', { text: item.message }),
        element('time', { text: relativeTime(item.created_at), attrs: { datetime: item.created_at } })
      ]
    });
    button.addEventListener('click', () => openNotification(item));
    list.append(button);
  });
  updateBadge();
}

async function loadNotifications() {
  if (!state.user) return;
  const { data, error } = await client
    .from('operator_notifications')
    .select('id,type,title,message,action_url,is_read,read_at,email_status,created_at,business_id,booking_id,listing_id')
    .eq('operator_id', state.user.id)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  state.items = data || [];
  render();
}

async function markRead(item) {
  if (item.is_read) return;
  const { error } = await client.rpc('mark_operator_notification_read', { p_notification_id: item.id });
  if (error) throw error;
  item.is_read = true;
  item.read_at = new Date().toISOString();
  render();
}

async function markAllRead() {
  markAllButton.disabled = true;
  try {
    const { error } = await client.rpc('mark_all_operator_notifications_read');
    if (error) throw error;
    state.items.forEach((item) => { item.is_read = true; item.read_at ||= new Date().toISOString(); });
    render();
  } catch (error) {
    console.error('Could not mark notifications read:', error);
  } finally {
    markAllButton.disabled = false;
  }
}

function notificationDestination(item){
  if(item.type==='customer_message'&&item.booking_id)return `operator-inbox.html?booking=${encodeURIComponent(item.booking_id)}`;
  if(['booking_request','booking_cancelled','payment_reference'].includes(item.type)&&item.booking_id)return `operator-reservations.html?id=${encodeURIComponent(item.booking_id)}`;
  if(['listing_published','listing_approved','listing_changes_requested','listing_rejected'].includes(item.type)&&item.listing_id)return `operator-content.html?listing=${encodeURIComponent(item.listing_id)}`;
  if(['business_verified','business_approved','business_changes_requested','business_rejected','business_suspended'].includes(item.type))return 'operator-dashboard.html?tab=business';
  return item.action_url||'operator-overview.html';
}

async function openNotification(item) {
  try { await markRead(item); }
  catch (error) { console.error('Could not mark notification read:', error); }
  setOpen(false);
  window.location.href = notificationDestination(item);
}

function subscribe() {
  if (!state.user || state.channel) return;
  state.channel = client
    .channel(`operator-notifications-${state.user.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'operator_notifications',
      filter: `operator_id=eq.${state.user.id}`
    }, (payload) => {
      const item = payload.new;
      if (!item?.id || state.items.some((current) => current.id === item.id)) return;
      state.items.unshift(item);
      state.items = state.items.slice(0, 40);
      render();
    })
    .subscribe();
}

function activateDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  if (!tab) return;
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    const button = document.querySelector(`.tab[data-tab="${CSS.escape(tab)}"]`);
    if (button) {
      button.click();
      window.clearInterval(timer);
    } else if (attempts > 20) window.clearInterval(timer);
  }, 100);
}

async function init() {
  installStyles();
  if (!installUi()) return;
  activateDeepLink();
  try {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    state.user = data.user;
    if (!state.user) return;
    await loadNotifications();
    subscribe();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) loadNotifications().catch((error) => console.error('Notification refresh failed:', error));
    });
  } catch (error) {
    console.error('Operator notifications failed:', error);
  }
}

init();
