import { requireSupabase, showConfigurationNotice } from './supabase-client.js';
import { redirectAfterLogin } from './auth.js';
import { setBusy, setMessage } from './ui.js';

const form = document.getElementById('loginForm');
const message = document.getElementById('formMessage');
const button = form.querySelector('button[type="submit"]');
if (showConfigurationNotice(document.getElementById('configMessage'))) button.disabled = true;

const params = new URLSearchParams(window.location.search);
if (params.get('verified') === '1') setMessage(message, 'Email verified. You can now log in.', 'success');

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

