import assert from 'node:assert/strict';
import { bindListingToBusiness, validateListingSubmissionContext } from '../assets/js/listing-ownership.js';

const user = { id: 'ba9f5c77-8702-4539-bce7-ae479bab65f0' };
const business = {
  id: '1c872d15-b48f-464c-8bfa-678de9a7c67c',
  owner_id: user.id,
  status: 'verified',
  is_active: true
};

const payload = bindListingToBusiness({
  title: 'Submission ownership test',
  business_id: 'untrusted-form-value'
}, user, business);

assert.equal(payload.business_id, business.id, 'payload must use the owner-bound business ID');
assert.equal(payload.business_id, '1c872d15-b48f-464c-8bfa-678de9a7c67c');

const services = ['diving', 'transfer', 'accommodation'].map((category, index) => bindListingToBusiness({
  title: `Service ${index + 1}`,
  category
}, user, business));
assert.equal(services.length, 3);
assert.deepEqual(services.map((service) => service.business_id), [business.id, business.id, business.id]);
assert.deepEqual(services.map((service) => service.category), ['diving', 'transfer', 'accommodation']);

const invalidContexts = [
  [null, business, /session|account/i],
  [user, null, /No business/i],
  [user, { ...business, owner_id: 'another-user' }, /not owned/i],
  [{ id: 'another-user' }, business, /not owned/i],
  [user, { ...business, status: 'pending_review' }, /verified/i],
  [user, { ...business, is_active: false }, /not active/i]
];

for (const [invalidUser, invalidBusiness, expectedMessage] of invalidContexts) {
  assert.throws(
    () => validateListingSubmissionContext(invalidUser, invalidBusiness),
    expectedMessage
  );
}

console.log(`Listing payload ownership test passed for business ${payload.business_id}.`);
