// Keep the legacy external-bookings screen for channel/manual reservations only.
// V2 Calendar & Schedule is the single source of truth for room inventory and
// rates, so retire the duplicate bulk-availability editor on this page.

document.body.classList.add('operator-v2-body');
document.body.dataset.operatorPage='external';

if(!document.querySelector('link[href*="operator-v2.css"]')){
  const link=document.createElement('link');link.rel='stylesheet';link.href='assets/css/operator-v2.css';document.head.append(link);
}
if(!document.querySelector('link[data-operator-partner-style]')){
  const link=document.createElement('link');link.rel='stylesheet';link.href='assets/css/operator-partner-extranet.css?v=1';link.dataset.operatorPartnerStyle='1';document.head.append(link);
}

const brand=document.querySelector('.app-header .brand');
if(brand){brand.href='index.html';brand.innerHTML='<span class="brand-mark"></span>Visit Baa';}
document.title='External bookings — Visit Baa';

// Auth imports this compatibility layer, so install the shared operator shell
// asynchronously after the current module finishes evaluating.
queueMicrotask(()=>import('./operator-shell.js').then(({installOperatorNavigation})=>installOperatorNavigation('external',{access_role:'owner'})).catch((error)=>console.error('External bookings navigation failed:',error)));
queueMicrotask(()=>import('./operator-header-layout-v2.js?v=3').catch((error)=>console.error('External bookings header layout failed:',error)));
queueMicrotask(()=>import('./operator-notifications.js?v=3').catch((error)=>console.error('External bookings notifications failed:',error)));

const rangeForm = document.getElementById('availabilityRangeForm');
if (rangeForm) {
  // Prevent the historical range handler from writing V1-style availability
  // even if an old cached/deep-linked UI manages to expose the hidden form.
  rangeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.href = 'operator-calendar.html';
  }, true);
  [...rangeForm.elements].forEach((control) => { control.disabled = true; });

  const panel = rangeForm.closest('.panel');
  if (panel) panel.hidden = true;

  const actions = document.querySelector('.availability-actions');
  if (actions) actions.style.gridTemplateColumns = 'minmax(0,1fr)';

  const note = document.querySelector('.availability-note');
  if (note && !document.getElementById('externalBookingsCalendarLink')) {
    const wrap = document.createElement('div');
    wrap.id = 'externalBookingsCalendarLink';
    wrap.className = 'form-actions';
    wrap.innerHTML = '<a class="button secondary" href="operator-calendar.html">Open Rates & availability</a>';
    note.append(wrap);
  }

  const heading = document.querySelector('.page-heading h1');
  if (heading) heading.textContent = 'External bookings';
  const eyebrow=document.querySelector('.page-heading .eyebrow');
  if(eyebrow)eyebrow.textContent='Rates & availability';
  const intro = document.querySelector('.page-heading p');
  if (intro) intro.textContent = 'Record Booking.com, Agoda, direct and walk-in reservations here. Visit Baa adjusts room inventory automatically.';
}
