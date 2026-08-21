import { confirmationRedirect } from './auth.js';
import { requireSupabase, showConfigurationNotice } from './supabase-client.js';
import { setBusy, setMessage } from './ui.js';

const form = document.getElementById('travelerRegisterForm');
const message = document.getElementById('formMessage');
const button = form.querySelector('button[type="submit"]');
if (showConfigurationNotice(document.getElementById('configMessage'))) button.disabled = true;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (document.getElementById('password').value !== document.getElementById('confirmPassword').value) return setMessage(message, 'The password confirmation does not match.', 'error');
  try {
    setBusy(button, true, 'Creating account…');
    const { data, error } = await requireSupabase().auth.signUp({
      email: document.getElementById('email').value.trim(), password: document.getElementById('password').value,
      options: { emailRedirectTo: confirmationRedirect(), data: { account_type:'traveler', full_name:document.getElementById('fullName').value.trim(), phone:document.getElementById('phone').value.trim() } }
    });
    if (error) throw error;
    if (!data.user) throw new Error('Traveler account could not be created.');
    form.reset(); setMessage(message, 'Account created. Check your email to verify it, then log in.', 'success');
  } catch (error) { setMessage(message, error.message || 'Account registration failed.', 'error'); }
  finally { setBusy(button, false); }
});
