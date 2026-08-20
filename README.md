# Baa Local / Visit Baa

Baa Local is a lightweight HTML, CSS, and JavaScript marketplace for verified tourism operators in Baa Atoll. The existing public design is preserved and extended with Supabase-backed registration, authentication, operator tools, administrator approvals, public listings, availability, and booking enquiries.

## Current status

The application uses a gitignored `config.js` for the public Supabase URL/key.
Complete the authenticated live-test matrix in [TESTING.md](TESTING.md) before
treating a build as production-ready.

## Main entry points

- `index (1).html` — preserved public homepage
- `register.html` — operator registration
- `login.html` — operator/admin login
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

The pre-implementation backup is in `backup-before-supabase-20260817-1200/`.
