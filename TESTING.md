# Visit Baa V2 test plan

This test plan covers the current Visit Baa marketplace and the single-owner Operator V2 architecture. Run destructive/live workflow tests in a disposable Supabase staging project when possible. Never store real passwords, service-role keys, or production secrets in the repository.

## Current Operator V2 ownership

Each operational job has one main workspace:

- **Property** — business registration, identity, verification details, logo/gallery.
- **Listings & rooms** — listing content, rooms, room photos, packages, transfer details, pricing components, media, revisions.
- **Calendar** — accommodation sellable inventory, rate overrides, stay restrictions, stop-sell, recurring service schedules and one-date exceptions.
- **Reservations** — Visit Baa booking requests, quote/price confirmation, holds, confirmation, changes, decline, cancellation, completion, no-show, notes and payment references in booking context.
- **External bookings** — Booking.com, Agoda, direct and walk-in accommodation bookings, including safe edits/cancellation with inventory recalculation.
- **Payments** — finance-focused payment reference/reconciliation view without unnecessary guest contact data.
- **Inbox** — guest conversations across reservations.
- **Rates / Promotions** — accommodation rate plans and promotions.
- **Reviews** — responses and reports.
- **Analytics** — currency-safe performance metrics.
- **Settings** — notifications, arrival information, staff access and audit history.

Do not reintroduce retired V1 listing, availability, enquiry, promotion or review forms into Property.

## Install and run automated checks

Node 20+ is required.

```powershell
npm ci
npx playwright install chromium
npm test
```

`npm test` includes source/static checks plus the current Operator V2 browser smoke suite.

Additional browser checks:

```powershell
npm run test:browser:operator-v2
npm run test:browser:public
npm run test:browser:facilities
npm run test:browser:marketplace
```

The Operator V2 browser test exercises the current workspaces under Owner, Reservations, Content and Finance roles and fails on browser page errors. It also verifies the pending-business → verified-business switch on Listings without requiring a page refresh.

## Migration and deployment checks

Before production deployment:

1. Confirm the local `supabase/migrations` history matches production versions.
2. Confirm the latest production migrations include:
   - `20260825074051_retire_operator_v1_duplicate_rpcs`
   - `20260825104633_operator_v2_audit_hardening`
   - `20260825105332_operator_finance_queue_complete`
   - `20260825114106_operator_v2_audit_finalization`
   - `20260825114822_operator_calendar_staff_visibility`
3. Run `npm run check` and `npm test`.
4. Confirm no legacy RPC calls remain for `operator_set_room_availability_range` or old `operator_listing_analytics`.
5. Confirm no retired `operator-content-compat-v2.js` or V1 operator dashboard controller is referenced.

## Authentication and business onboarding

1. Register an operator and confirm email verification is required as configured.
2. Log in and open Property.
3. Register a new business and confirm it starts `pending_review` and inactive.
4. Confirm Listings remains locked while the business is pending.
5. Approve the business from Admin and confirm it becomes `verified` and active.
6. Request changes/reject a second business, edit it, resubmit, and confirm it returns to pending/inactive until approval.
7. Suspend a verified business and confirm its public listings disappear.
8. With one pending and one verified business under the same account, open Listings while pending is selected, switch to verified, and confirm all advanced listing controls work without refreshing.

## Listings, packages and pricing components

For every listing category, create a draft and verify the correct category-specific controls.

### Accommodation

1. Create an accommodation listing.
2. Add multiple room types with different capacity, quantity, base price and amenities.
3. Upload room-specific photos; confirm they are stored separately from the listing gallery.
4. Edit room captions/order and remove a room photo.
5. Configure accommodation policies and confirm canonical cancellation/payment values save correctly.
6. Submit the listing and verify admin review/publish.
7. Edit a published listing through a safe revision and confirm the live listing remains published until approval.

### Excursion package

1. Set `Listing type = Excursion package`.
2. Select at least two structured activities.
3. Confirm submission is blocked with fewer than two activities.
4. Configure operating days, equipment, meal, drinking water, pickup and drop-off notes.
5. Save/reopen and confirm values are preserved exactly.
6. Use `Built from separate charges` and add at least one required price component.
7. Add optional/included components such as guide, boat transfer, ticket and equipment.
8. Confirm component-only submission is blocked if no required component exists.

### Transfer

1. Create a transfer route with origin/destination and route details.
2. Configure Shared or Private service type.
3. Configure Per-person or Private-fixed pricing.
4. Configure operating days, minimum passengers, infant/private price and luggage rules.
5. Save/reopen and confirm no route values are reset to defaults.

## Calendar and inventory

### Accommodation

1. Configure room sellable quantity for a date range.
2. Set price override, min/max stay, min/max advance booking, CTA/CTD, stop-sell and blocked flags.
3. Confirm current held/confirmed Visit Baa bookings and external bookings remain protected.
4. Race two bookings against the last available room and confirm only one succeeds.
5. Cancel a confirmed booking and confirm inventory restores without exceeding sellable quantity.
6. As Reservations staff, confirm the Calendar can read room types and rate plans and can operate allowed calendar functions.
7. On mobile, verify the 7-day calendar view and Open/Close date quick actions.

### Scheduled services

1. Add a recurring rule and generate 12 months of sessions.
2. Confirm generated availability rows carry a `schedule_rule_id`.
3. Pause the rule and confirm only future sessions generated by that rule close.
4. Confirm a manual session at the same weekday/time is not closed by pausing another recurring rule.
5. Reactivate the rule and confirm future linked sessions regenerate/reopen correctly.
6. Add a one-date exception: cancel one date.
7. Add one-date time/capacity overrides.
8. Restore the recurring schedule for that date.
9. Delete the recurring rule and confirm linked future sessions close while confirmed booking records remain.

## Reservations

1. Submit accommodation and activity booking requests.
2. Confirm booking references and stored price snapshots.
3. For price-confirmation-required requests, use **Confirm price / Quote** and verify subtotal/taxes/fees.
4. Accept and hold inventory.
5. Request changes and verify customer-facing state.
6. Decline a test request.
7. Confirm a held booking and verify inventory commits once.
8. Cancel, complete and mark no-show on separate bookings.
9. Add/update internal notes.
10. Exchange messages from reservation context and Inbox.
11. Submit/review payment references and service-payment records.

## External Booking.com / Agoda / direct / walk-in bookings

1. Add a Booking.com booking covering multiple nights.
2. Confirm Visit Baa room inventory is reduced for every stay night.
3. Add Agoda/direct/walk-in examples.
4. Attempt an external booking that exceeds available stock; expect rejection.
5. Edit an active external booking's dates, room type and room count.
6. Confirm the old inventory is released, the new stay is validated and the new dates are blocked in one transaction.
7. Attempt a duplicate active source/reference; expect rejection.
8. Cancel an external booking and confirm stock restores.
9. Confirm Reservations staff can use this workspace.

## Payments / Finance privacy

1. Add a Finance staff member with an existing Visit Baa account.
2. Confirm Finance lands on payment-oriented Home/Payments views rather than full guest operations.
3. Confirm Finance cannot directly select full private reservation rows.
4. Confirm the payment queue contains booking reference, service, amount/reference/proof/status and service-payment information.
5. Confirm guest email, phone and private messages are not exposed in the Finance workspace.
6. Open a submitted payment proof as Finance; the signed image must load.
7. Confirm/reject a payment reference.
8. Record and clear service-payment received status.

## Staff roles

Test every role against navigation and backend permissions:

### Owner
Full operator workspaces, Property and staff administration.

### Manager
Day-to-day operations except owner-only business identity controls.

### Reservations
Reservations, Inbox/messages, Calendar, External bookings and permitted analytics. Verify Calendar room/rate SELECT permissions work.

### Content
Listings, room/content management, rate-plan structure/promotions and arrival content. Confirm Home does not require private reservation access.

### Finance
Payments and analytics only as intended. Confirm no guest messages/contact details.

Attempt direct URL access to a workspace outside each role and confirm server-side/RLS permissions remain authoritative even if a URL is guessed.

## Home / multi-business isolation

1. Create two businesses with accommodation rooms.
2. Make one room low-stock in Business A and another normal in Business B.
3. Select Business B on Home and confirm Business A's low-stock warning never appears.
4. Switch to Business A and confirm its low-stock warning appears.
5. Confirm bookings, payment tasks and content tasks are similarly scoped to the selected business.

## Inbox

1. Exchange messages with guest and multiple operator staff members.
2. Confirm labels display `Guest`, `You` and `Team` correctly.
3. Confirm incoming messages appear without manual Refresh.
4. Load older conversations.
5. Test welcome, payment and arrival templates.
6. Verify a Reservations staff user can read public/operator arrival information needed for arrival templates.
7. Confirm another business cannot read the conversation.

## Rates and Promotions

1. Create fixed and derived room rate plans.
2. Test occupancy pricing, meal plans, cancellation rules, stay restrictions and advance limits.
3. Create Early Bird, Last Minute, Long Stay, Weekend, Seasonal and custom promotions.
4. Validate date windows and lead-time constraints.
5. Confirm promotions apply to the intended live listing/rate plan during safe listing revisions.

## Reviews and Analytics

1. Complete a reservation and submit a verified review.
2. Respond/edit response and report the review.
3. Confirm staff roles without review permission cannot modify responses.
4. Verify Analytics keeps USD and MVR separate.
5. Confirm old currency-unsafe analytics RPC is absent.

## Security / RLS

Verify:

- All public base tables have RLS enabled.
- Anonymous users cannot select private businesses/listings/bookings/messages/payment rows.
- Anonymous SECURITY DEFINER access is limited to intended public booking-request/view-tracking functions.
- Cross-operator reads/writes return zero rows or fail.
- Storage paths cannot be attached across operators.
- Finance proof access works only for payments belonging to businesses where the user has Finance/Reservations permission (or Admin).
- Published public availability remains readable for customer search without leaking private operator-only rows.

## Live inventory integrity SQL checks

After stress tests, confirm zero problems for:

- negative room availability
- available/sellable room values above configured limits
- negative service availability
- service spaces above configured capacity
- external bookings referencing missing rooms
- listing revisions referencing missing originals
- duplicate recurring schedule rules

## Mobile and accessibility

Test 320, 375, 390, 430, 768 and desktop widths.

- No unintended horizontal page overflow.
- Calendar mobile week mode remains usable.
- Mobile **More** exposes all role-allowed workspaces.
- Forms are keyboard-operable.
- Focus indicators remain visible.
- Labels and errors are understandable.
- Dialogs/drawers can be closed by keyboard where applicable.
- Loading/success/error states remain visible on slow connections.

## Release rule

Do not deploy an operator change merely because the page looks correct. A release should satisfy:

1. migrations in GitHub reproduce the live schema,
2. `npm test` passes,
3. Operator V2 browser smoke tests pass,
4. no unexpected browser console/page errors,
5. live/staging inventory integrity checks remain clean.
