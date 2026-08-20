export function validateListingSubmissionContext(user, business) {
  if (!user?.id) {
    throw new Error('Your authenticated session could not be verified. Sign in again before creating a listing.');
  }
  if (!business?.id) {
    throw new Error('No business is linked to your account. Complete business registration before creating a listing.');
  }
  if (business.owner_id !== user.id) {
    throw new Error('This business is not owned by the signed-in account. Refresh the dashboard or sign in again.');
  }
  if (business.status !== 'verified') {
    throw new Error('Your business must be verified by an administrator before you can create a listing.');
  }
  if (business.is_active !== true) {
    throw new Error('Your verified business is not active. Contact an administrator before creating a listing.');
  }

  return business.id;
}

export function bindListingToBusiness(payload, user, business) {
  const businessId = validateListingSubmissionContext(user, business);
  return { ...payload, business_id: businessId };
}
