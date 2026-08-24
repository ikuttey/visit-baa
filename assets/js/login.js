import { requireSupabase, showConfigurationNotice } from './supabase-client.js';
import { redirectAfterLogin } from './auth.js';
import { setBusy, setMessage } from './ui.js';

const form = document.getElementById('loginForm');
const message = document.getElementById('formMessage');
const button = form.querySelector('button[type="submit"]');
if (showConfigurationNotice(document.getElementById('configMessage'))) button.disabled = true;

const params = new URLSearchParams(window.location.search);
if (params.get('verified') === '1') setMessage(message, 'Email verified. You can now log in.', 'success');

async function redirectExistingSession() {
  if (button.disabled) return false;

  const client = requireSupabase();
  setBusy(button, true, 'Checking session…');

  try {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData.session) return false;

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) return false;

    await redirectAfterLogin(userData.user);
    return true;
  } finally {
    setBusy(button, false);
  }
}

redirectExistingSession().catch((error) => {
  console.warn('Existing session check failed:', error);
  setBusy(button, false);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage(message);
  try {
    setBusy(button, true, 'Logging in…');
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value
    });
    if (error) throw error;
    await redirectAfterLogin(data.user);
  } catch (error) {
    setMessage(message, error.message || 'Login failed.', 'error');
    setBusy(button, false);
  }
});
