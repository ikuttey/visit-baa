// Keep the legacy external-bookings screen for channel/manual reservations only.
// V2 Calendar & Schedule is the single source of truth for room inventory and
// rates, so retire the duplicate bulk-availability editor on this page.

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
    wrap.innerHTML = '<a class="button secondary" href="operator-calendar.html">Manage room inventory in Calendar & Schedule</a>';
    note.append(wrap);
  }

  const heading = document.querySelector('.page-heading h1');
  if (heading) heading.textContent = 'External accommodation bookings';
  const intro = document.querySelector('.page-heading p');
  if (intro) intro.textContent = 'Record Booking.com, Agoda, direct and walk-in reservations here. Room inventory and rates are managed only in Calendar & Schedule.';
}
