import { requireSupabase, showConfigurationNotice } from './supabase-client.js';
import { setBusy, setMessage } from './ui.js';

const form = document.getElementById('resetForm');
const message = document.getElementById('formMessage');
const button = form.querySelector('button[type="submit"]');
let recoveryReady = false;

if (showConfigurationNotice(document.getElementById('configMessage'))) {
  button.disabled = true;
} else {
  const client = requireSupabase();
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' || session) {
      recoveryReady = true;
      button.disabled = false;
      setMessage(message, 'Recovery link accepted. Choose a new password.', 'success');
    }
  });
  const { data } = await client.auth.getSession();
  if (data.session) {
    recoveryReady = true;
    button.disabled = false;
  } else {
    setMessage(message, 'Open this page using the password-recovery link sent to your email.', 'warning');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = document.getElementById('password').value;
  if (!recoveryReady) return setMessage(message, 'A valid recovery session is required.', 'error');
  if (password !== document.getElementById('confirmPassword').value) return setMessage(message, 'The password confirmation does not match.', 'error');
  try {
    setBusy(button, true, 'Updating…');
    const client = requireSupabase();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    setMessage(message, 'Password updated. Redirecting to login…', 'success');
    setTimeout(() => window.location.replace('login.html'), 1200);
  } catch (error) {
    setMessage(message, error.message || 'The password could not be updated.', 'error');
  } finally {
    setBusy(button, false);
  }
});

