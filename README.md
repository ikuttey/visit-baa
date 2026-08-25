# Baa Local / Visit Baa

Baa Local is a lightweight HTML, CSS, and JavaScript marketplace for verified tourism operators in Baa Atoll. The existing public design is preserved and extended with Supabase-backed search, room/session inventory, secure reservation requests, traveler accounts, deterministic route-first trip planning, directional island transfer schedules, reviews, promotions, operator tools, and administrator approvals.

## Current status

The application uses a gitignored `config.js` for the public Supabase URL/key.
Complete the authenticated live-test matrix in [TESTING.md](TESTING.md) before
treating a build as production-ready.

## Main entry points

- `index.html` — public homepage
- `register.html` — operator registration
- `login.html` — operator/admin/traveler login
- `traveler-register.html` — traveler account registration
- `traveler-dashboard.html` — bookings, messages, saved listings, reviews, and My Baa Trip
- `operator-dashboard.html` — protected operator workspace
- `admin-dashboard.html` — protected administrator workspace
- `listings.html` — approved public listings
- `listing.html?id=...` — listing details and booking enquiry
- `supabase/migrations/` — database, RLS, RPC, and Storage migrations

## Quick local start

1. Configure Supabase as described in [SETUP.md](SETUP.md).
2. Copy `config.example.js` to `config.js` and enter only the public project URL and publishable/anon key.
3. Serve this folder over HTTP:

   ```powershell
   npm start
   ```

4. Open `http://localhost:3000`.

The included `serve.json` disables extension-removing redirects so query-string
IDs such as `listing.html?id=...` and `business.html?id=...` are preserved.

Run source checks with:

```powershell
npm run check
```

Run the complete source/security-contract suite and responsive marketplace browser suite with:

```powershell
npm test
npm run test:browser:marketplace
```

The floating manta planner lazy-loads current public marketplace data when opened. Its deterministic, question-by-question flow searches the shared directional route network, real availability, stays, and experiences; it never exposes or calls a client-side AI key. Selected services remain one editable My Baa Trip draft until the traveler explicitly sends separate, revalidated operator requests. Payments stay direct between traveler and operator, with Visit Baa recording references only.

The pre-implementation backup is in `backup-before-supabase-20260817-1200/`.
