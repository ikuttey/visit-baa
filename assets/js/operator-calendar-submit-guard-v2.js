// Prevent duplicate recurring-schedule writes on the V2 calendar.
// The calendar module owns the actual save. This guard only makes the submit
// idempotent from the browser side and replaces raw unique-constraint errors
// with an operator-friendly message.

const form = document.getElementById('scheduleRuleForm');
const pageMessage = document.getElementById('pageMessage');

if (form && !form.dataset.v2SubmitGuard) {
  form.dataset.v2SubmitGuard = '1';
  const submit = form.querySelector('button[type="submit"]');
  const normalLabel = submit?.textContent || 'Add recurring schedule';
  let busy = false;
  let fallbackTimer = 0;

  const unlock = () => {
    if (!busy) return;
    busy = false;
    window.clearTimeout(fallbackTimer);
    if (submit) {
      submit.disabled = false;
      submit.textContent = normalLabel;
    }
  };

  form.addEventListener('submit', (event) => {
    if (busy) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    busy = true;
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Saving schedule…';
    }
    // Network/RLS responses normally update pageMessage. Keep a fallback so a
    // failed browser request can never leave the button locked indefinitely.
    fallbackTimer = window.setTimeout(unlock, 15000);
  }, true);

  if (pageMessage) {
    const observer = new MutationObserver(() => {
      const text = String(pageMessage.textContent || '');
      if (/listing_schedule_rules_listing_id_day_of_week_start_time/i.test(text) || /duplicate key value/i.test(text)) {
        pageMessage.textContent = 'A recurring schedule already exists for this listing, day and start time. Edit or delete the existing rule below instead of adding a duplicate.';
        pageMessage.className = 'message warning';
        pageMessage.hidden = false;
      }
      if (text.trim()) unlock();
    });
    observer.observe(pageMessage, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  }
}
