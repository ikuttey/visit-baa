import { requireSupabase, showConfigurationNotice } from './supabase-client.js';
import { confirmationRedirect } from './auth.js';
import { uploadImage, validateImages } from './storage.js';
import { previewFiles, setBusy, setMessage } from './ui.js';

const form = document.getElementById('registrationForm');
const message = document.getElementById('formMessage');
const submitButton = form.querySelector('button[type="submit"]');
const logoInput = document.getElementById('businessLogo');
const imagesInput = document.getElementById('businessImages');
const previews = document.getElementById('imagePreviews');

if (showConfigurationNotice(document.getElementById('configMessage'))) submitButton.disabled = true;

function refreshPreviews() {
  const transfer = new DataTransfer();
  [...logoInput.files, ...imagesInput.files].forEach((file) => transfer.items.add(file));
  previewFiles(transfer, previews);
}

logoInput.addEventListener('change', refreshPreviews);
imagesInput.addEventListener('change', refreshPreviews);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage(message);

  const password = document.getElementById('password').value;
  if (password !== document.getElementById('confirmPassword').value) {
    setMessage(message, 'The password confirmation does not match.', 'error');
    return;
  }

  try {
    const logoFiles = validateImages(logoInput.files, { multiple: false });
    const galleryFiles = validateImages(imagesInput.files);
    setBusy(submitButton, true, 'Submitting…');
    const client = requireSupabase();
    const values = {
      full_name: document.getElementById('fullName').value.trim(),
      business_name: document.getElementById('businessName').value.trim(),
      registration_number: document.getElementById('registrationNumber').value.trim(),
      operator_category: document.getElementById('operatorCategory').value,
      island: document.getElementById('island').value,
      phone: document.getElementById('phone').value.trim(),
      business_address: document.getElementById('businessAddress').value.trim(),
      website_url: document.getElementById('websiteUrl').value.trim(),
      description: document.getElementById('description').value.trim(),
      accuracy_confirmed: document.getElementById('accuracyConfirmed').checked,
      terms_accepted: document.getElementById('termsAccepted').checked
    };

    const { data, error } = await client.auth.signUp({
      email: document.getElementById('email').value.trim(),
      password,
      options: { data: values, emailRedirectTo: confirmationRedirect() }
    });
    if (error) throw error;

    if (data.session && data.user) {
      const { data: business, error: businessError } = await client
        .from('businesses').select('id').eq('owner_id', data.user.id).single();
      if (businessError) throw businessError;

      if (logoFiles[0]) {
        const logoPath = await uploadImage('business-logos', logoFiles[0], data.user.id, business.id);
        const { error: logoError } = await client.from('businesses').update({ logo_path: logoPath }).eq('id', business.id);
        if (logoError) throw logoError;
      }

      for (const [index, file] of galleryFiles.entries()) {
        const storagePath = await uploadImage('business-gallery', file, data.user.id, business.id);
        const { error: imageError } = await client.from('business_images').insert({ business_id: business.id, storage_path: storagePath, sort_order: index });
        if (imageError) throw imageError;
      }
    }

    form.reset();
    previews.replaceChildren();
    const imageNote = (logoFiles.length || galleryFiles.length) && !data.session
      ? ' For security, email-confirmation accounts must upload the selected logo and photographs again from the dashboard after verification.'
      : '';
    setMessage(message, `Application received with Pending review status. Check your email to verify the account.${imageNote}`, 'success');
  } catch (error) {
    setMessage(message, error.message || 'Registration could not be completed.', 'error');
  } finally {
    setBusy(submitButton, false);
  }
});

