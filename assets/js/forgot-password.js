import { requireSupabase, showConfigurationNotice } from './supabase-client.js';
import { passwordResetRedirect } from './auth.js';
import { setBusy, setMessage } from './ui.js';

const form = document.getElementById('forgotForm');
const message = document.getElementById('formMessage');
const button = form.querySelector('button[type="submit"]');
if (showConfigurationNotice(document.getElementById('configMessage'))) button.disabled = true;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    setBusy(button, true, 'Sending…');
    const client = requireSupabase();
    const { error } = await client.auth.resetPasswordForEmail(document.getElementById('email').value.trim(), {
      redirectTo: passwordResetRedirect()
    });
    if (error) throw error;
    form.reset();
    setMessage(message, 'If that address belongs to an account, a password-reset link has been sent.', 'success');
  } catch (error) {
    setMessage(message, error.message || 'The reset request could not be sent.', 'error');
  } finally {
    setBusy(button, false);
  }
});

