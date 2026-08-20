# Baa Local live test plan

Run these tests in a disposable Supabase staging project before production. Record the test account IDs, timestamps, expected result, actual result, and any console/database errors. The static source checks do not replace these live tests.

## Prerequisites

- All tracked migrations completed without errors.
- Email confirmation and redirect URLs configured.
- One verified administrator account.
- Two separate operator accounts: Operator A and Operator B.
- A private/incognito browser window for public tests.

Never store test passwords in this repository. Supply operator/admin credentials
only through the browser or temporary process environment during a live test.

## Automated public browser check

Start the source site, then run the credential-free desktop/mobile check in a
second terminal:

```powershell
npm start
npm run test:browser:public
```

This uses isolated Chrome contexts, verifies the anonymous catalogue and public
business page, checks signed images, exercises the invalid-business state, and
detects console, network, image, and mobile-overflow failures. It does not
replace the authenticated operator/administrator workflow below.

## Authentication

1. Register Operator A and confirm that the UI reports **Pending review**.
2. Confirm no authenticated dashboard session exists before email verification.
3. Open the verification email and confirm the redirect reaches `login.html?verified=1`.
4. Log in with the verified account and refresh `operator-dashboard.html`; the session should restore.
5. Log out and confirm the dashboard redirects to login.
6. Request a password reset, open the email, set a new 10+ character password, and log in with it.
7. Open `operator-dashboard.html` signed out and confirm redirect to login.
8. Open `admin-dashboard.html` as a normal operator and confirm redirect to the operator dashboard.

## Business review

1. Verify Operator A cannot create a listing while the business is pending.
2. Inspect and approve Operator A’s business from the admin dashboard.
3. Refresh Operator A’s dashboard and confirm **Verified** status and enabled listing creation.
4. Register Operator B; request changes with a reason.
5. Edit Operator B’s business, use **Resubmit for review**, and confirm it returns to pending.
6. Reject a test business with a reason and confirm the operator sees the status/note.
7. Suspend a verified test business and confirm its public listings disappear.

## Listings and approval

1. Create every listing category at least once.
2. Create an accommodation listing and confirm required accommodation fields are enforced.
3. Set available spaces above maximum capacity and confirm the UI/database reject it.
4. Save a draft, edit it, upload a cover and gallery images, then submit it.
5. Attempt to edit the pending listing with a crafted API call; the database must reject it.
6. Approve/publish from the administrator dashboard.
7. Confirm the listing appears in `listings.html` and `listing.html?id=...`.
8. Pause the listing as the operator and confirm it disappears publicly.
9. Edit the paused listing and resubmit; an administrator must approve before it returns publicly.
10. Request changes and reject separate listings; confirm notes appear to the operator.

## Availability

1. Add a future date/time with maximum capacity 8 and remaining spaces 6.
2. Attempt remaining spaces `-1`; expect rejection.
3. Attempt remaining spaces `9`; expect rejection.
4. Block a date and confirm remaining spaces becomes zero.
5. Edit and delete availability.
6. Confirm only non-blocked, future availability for a published listing appears publicly.

## Booking enquiries

1. Submit an enquiry for an approved listing from a signed-out browser.
2. Confirm the visitor receives the “not confirmed until accepted” message.
3. Confirm the enquiry appears only in the correct operator dashboard with **New** status.
4. Accept, decline, complete, and cancel separate test enquiries.
5. Attempt a guest count above the selected remaining capacity; expect rejection.
6. Attempt a past requested date; expect rejection.
7. Confirm no anonymous query can select from `booking_enquiries`.

## Cross-operator and authorization attacks

Use staging UUIDs for Operator A and B. The successful listing must first be
created through **Save draft** in the authenticated operator webpage. Privileged
SQL may inspect or negatively probe the resulting row, but it is not proof that
the browser INSERT/RLS workflow works. For optional diagnostic policy checks,
use a transaction and replace the placeholders first:

```sql
begin;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'OPERATOR_A_UUID', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- Must return only Operator A's row.
select id, owner_id, business_name, status from public.businesses;

-- Replace with Operator B's business ID. Must update zero rows or raise.
update public.businesses
set business_name = 'Unauthorized change'
where id = 'OPERATOR_B_BUSINESS_UUID';

-- Must fail: status is not an operator-updatable column.
update public.businesses
set status = 'verified'
where owner_id = 'OPERATOR_A_UUID';

-- Must fail through the workflow trigger even if attempted directly.
update public.listings
set status = 'published'
where id = 'OPERATOR_A_DRAFT_LISTING_UUID';

-- Must not reveal another operator's enquiries.
select id, operator_id, guest_email from public.booking_enquiries;

rollback;
```

Also test through the browser/network panel:

- Operator A requests Operator B’s business/listing/enquiry UUID directly.
- Operator A attempts to attach a Storage path beginning with Operator B’s UUID.
- An anonymous client selects base `businesses`, `listings`, and `booking_enquiries` tables.
- An anonymous client queries `public_listings`; only approved rows should appear.
- An operator changes a pending listing’s text or cover path; expect rejection.
- A non-admin calls `admin_review_business` or `admin_review_listing`; expect rejection.

## Mobile, accessibility, and browser checks

1. Test at 320 px, 375 px, 768 px, and desktop widths.
2. Complete registration, login, listing creation, filters, and enquiry submission using keyboard only.
3. Confirm visible focus indicators, associated labels, error messages, and status announcements.
4. Confirm image previews and file-size/type errors.
5. Check Chrome, Edge, Firefox, and Safari where available.
6. Keep DevTools Console open; record and resolve unexpected errors.
7. Test slow network/loading states and empty-state screens.

## Static checks

```powershell
npm run check
```

This verifies required files, local asset references, JavaScript syntax, balanced button tags, absence of unsafe `innerHTML` assignments, required statuses, RLS enablement statements, and common secret-key patterns.
