# Baa Local Supabase setup and deployment

## Important status

No real Supabase project URL or key was supplied during implementation. The site is intentionally left in a safe “not connected” state and shows clear empty/configuration messages instead of fake live data. Do not describe it as fully operational until the live checklist in [TESTING.md](TESTING.md) passes against your project.

The frontend must contain only the Supabase project URL and the public publishable/anon key. Never place a service-role key, database password, JWT secret, or administrator password in `config.js`, `.env`, HTML, JavaScript, source control, or hosting logs. Supabase explicitly warns that service keys bypass RLS and must never be exposed in a browser ([Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)).

## 1. Create a Supabase project

1. Sign in at [supabase.com](https://supabase.com/) and create a project in the preferred region.
2. Record the project URL and public publishable key from **Project Settings → API**.
3. Keep the database password and service-role/secret keys in a secure password manager. They are not used by this frontend.
4. Wait until the database and Auth services report healthy.

## 2. Apply the SQL migrations

Run these files in filename order:

1. `supabase/migrations/202608170001_core_schema.sql`
2. `supabase/migrations/202608170002_rls_and_grants.sql`
3. `supabase/migrations/202608170003_storage.sql`
4. `supabase/migrations/202608170004_security_hardening.sql`

### Option A: Supabase CLI

Install and authenticate the Supabase CLI, link this folder to the project, then run:

```powershell
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### Option B: SQL editor

Open **SQL Editor** in the Supabase dashboard. Paste and run each file separately in the order above. Stop if any migration reports an error; do not skip ahead.

The migrations create:

- Auth-linked profiles and database roles
- Pending business applications and verification states
- Listings and accommodation-specific fields
- Listing and business images
- Date/time availability with non-negative capacity constraints
- Private booking enquiries
- Administrator review history
- Approval and resubmission RPCs
- Public approved-only views
- Row Level Security on every user-related table
- Four private image buckets and their Storage policies

## 3. Configure the public browser client

For local development, copy `config.example.js` to `config.js` and set:

```js
window.BAA_CONFIG = Object.freeze({
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabaseAnonKey: 'YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY',
  siteUrl: 'http://localhost:3000'
});
```

`config.js` is gitignored. The key used here is intentionally public; RLS is the security boundary. Supabase initializes browser clients with the project URL and publishable key ([official initialization reference](https://supabase.com/docs/reference/javascript/initializing)).

Alternatively, set the variables from `.env.example` and generate the local configuration:

```powershell
$env:SUPABASE_URL='https://YOUR_PROJECT_REF.supabase.co'
$env:SUPABASE_ANON_KEY='YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY'
$env:SITE_URL='http://localhost:3000'
npm run config
```

## 4. Configure email verification

1. Open **Authentication → Providers → Email**.
2. Enable email/password signups.
3. Keep **Confirm email** enabled so a new account must verify its address.
4. Configure production SMTP before launch. Supabase’s default sender is intended only for limited testing; the official password guide notes its low best-effort rate limit ([password authentication guide](https://supabase.com/docs/guides/auth/passwords)).
5. Customize the confirmation email to match the Baa Local brand.

The registration page uses `emailRedirectTo` and stores the text application through the database Auth trigger. If confirmation prevents an immediate authenticated session, the operator uploads the selected logo and gallery files again after verifying and logging in. This avoids unsafe anonymous Storage upload access.

## 5. Configure Auth URLs

Open **Authentication → URL Configuration**.

For local development:

- Site URL: `http://localhost:3000`
- Additional redirect URL: `http://localhost:3000/**`

For production, replace the Site URL with the exact HTTPS domain and add:

- `https://YOUR_DOMAIN/login.html?verified=1`
- `https://YOUR_DOMAIN/reset-password.html`
- Any exact preview URLs needed during staging

Supabase requires redirect destinations to be allow-listed and recommends exact production paths ([redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls)).

If a customized email template uses `{{ .SiteURL }}`, change the confirmation link to use `{{ .RedirectTo }}` as described in that guide.

## 6. Storage buckets

Migration `202608170003_storage.sql` creates these private buckets:

- `business-logos`
- `business-gallery`
- `listing-covers`
- `listing-gallery`

Each accepts JPG, PNG, and WebP files up to 5 MB. The interface validates the same limits before upload. Files use paths beginning with the authenticated user ID followed by the business/listing ID and a random UUID, preventing accidental overwrites.

Do not change these buckets to public. Private bucket downloads and signed URLs remain subject to access policies ([Supabase private bucket documentation](https://supabase.com/docs/guides/storage/buckets/fundamentals)); uploads are denied unless a matching `storage.objects` policy permits them ([Storage access control](https://supabase.com/docs/guides/storage/security/access-control)).

## 7. Create the first administrator safely

Administrator access is never inferred from an email address in JavaScript. It is stored in `public.user_roles` and checked by database policies/functions.

1. Register the future administrator through `register.html`, or create the user in **Authentication → Users**.
2. Verify that user’s email.
3. In the Supabase SQL editor, identify the exact account:

   ```sql
   select id, email, email_confirmed_at
   from auth.users
   where email = 'ADMIN_EMAIL_HERE';
   ```

4. Confirm the result is exactly the intended user, then grant the role from the SQL editor:

   ```sql
   begin;

   insert into public.user_roles (user_id, role, granted_by)
   select id, 'admin'::public.app_role, id
   from auth.users
   where email = 'ADMIN_EMAIL_HERE'
     and email_confirmed_at is not null
   on conflict (user_id, role) do nothing;

   select ur.user_id, u.email, ur.role
   from public.user_roles ur
   join auth.users u on u.id = ur.user_id
   where u.email = 'ADMIN_EMAIL_HERE';

   commit;
   ```

5. Log out and back in. Login redirects users with an `admin` database role to `admin-dashboard.html`.

Do not run admin-auth methods or use a service-role key from the browser. Supabase states that `auth.admin` operations belong on a trusted server ([admin API warning](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)).

## 8. Create and test the first operator

1. Register through `register.html` with all agreements selected.
2. Confirm the email.
3. Log in and verify that the business status is **Pending review**.
4. Confirm listing creation is disabled.
5. Log in as the administrator, inspect the application, and approve it.
6. Log back in as the operator; listing creation should now be enabled.
7. Create a draft, upload images, add availability, and submit it.
8. Approve/publish it from the administrator dashboard.
9. Confirm it appears in `listings.html` and its approved availability appears on the homepage.
10. Submit an enquiry from the detail page and accept/decline it in the operator dashboard.

## 9. Run locally

Do not open the HTML with a `file://` URL because browser modules and Auth redirects require HTTP.

```powershell
npx serve . -l 3000
```

Open `http://localhost:3000`. Session restoration is handled by the Supabase browser client, which persists and refreshes sessions by default ([Supabase Auth client overview](https://supabase.com/docs/reference/javascript/auth)).

Run static checks:

```powershell
npm run check
```

## 10. Build and deploy

The build copies only public HTML, images, CSS, and JavaScript to `dist/`. SQL migrations, documentation, the source backup, and development configuration are excluded.

Set these hosting environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SITE_URL` (the exact production HTTPS origin)

Then run:

```powershell
npm run build
```

Deploy the generated `dist/` directory.

### Vercel

- Framework preset: Other
- Build command: `npm run build`
- Output directory: `dist`
- Add the three environment variables for Production and Preview as appropriate.

### Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Add the three variables under Pages project settings.

### GitHub Pages

The architecture can run on GitHub Pages because all privileged enforcement lives in Supabase and the browser uses only a public key. However, GitHub Pages does not provide runtime environment-variable injection. Use a GitHub Actions build that supplies repository/environment secrets to `npm run build` and deploys `dist/`, or choose Vercel/Cloudflare Pages for simpler environment handling. Never publish a service-role key; the publishable/anon key is expected to be visible in browser code.

## 11. Production domain

1. Attach the custom domain to the selected host.
2. Enable HTTPS and redirect HTTP to HTTPS.
3. Set `SITE_URL` to the canonical origin without an extra path.
4. Update Supabase Auth Site URL and exact allowed confirmation/reset paths.
5. Update email templates and test links from a real mailbox.
6. Rebuild and redeploy.

## 12. Security model summary

- Every user-related table has RLS enabled.
- Operators can select/update only their own profile and business.
- Business approval columns are unavailable through operator column grants and protected by a trigger.
- Business resubmission uses a narrow database RPC.
- Only verified, active business owners can create/manage listings and availability.
- Draft submission and administrator approval use constrained database transitions.
- Pending/published listing content cannot be silently edited.
- Public views expose only verified businesses and published active listings.
- Booking ownership is derived by a `BEFORE INSERT` trigger; public clients cannot choose an operator.
- Public roles have no `SELECT` permission on booking enquiries, so guest contact details remain private.
- Admin authorization comes from `user_roles`, not mutable user metadata or hard-coded emails.
- Admin review RPCs recheck the database role and record review history.
- Private Storage policies and path-validation triggers bind media to its owner.
- Availability constraints prevent negative spaces or values above maximum capacity.
- Frontend DOM construction uses `textContent`/element creation rather than inserting database content with unsafe `innerHTML`.

## Remaining manual work

Before deploying this marketplace upgrade, apply these new migrations in order:

1. `20260821135712_marketplace_engine.sql` (enum values in its own committed migration).
2. `20260821135813_marketplace_core.sql` (tables, views, RLS, RPCs, indexes, and room Storage policies).
3. `20260821152556_transfer_routes.sql` (directional transfer schedules, pricing, RLS, grants, and the public route view).
4. `20260821165102_trip_booking_payments.sql` (trip draft extensions, idempotent multi-operator requests, deposit snapshots, direct-payment references, private proof storage, RLS, and grants).

Run these against a disposable staging project first. The application preserves
the existing UUID insert-then-owner-fetch listing workflow and reuses the
existing `availability` table for activity sessions.

- Supply a real Supabase URL and public key.
- Apply all migrations successfully.
- Enable email confirmation and production SMTP.
- Configure Auth redirect URLs and the production domain.
- Create the first administrator through the SQL editor.
- Perform every live test in [TESTING.md](TESTING.md).
- Add final legal platform terms/listing rules and privacy notice.
- Confirm commercial rights for all existing public-site imagery.
- Decide whether operators may publicly expose contact details by default.
- Add active directional route details and date availability to published transfer listings before launching the Island Hopping planner.
- An AI itinerary endpoint is intentionally not configured. The structured manta planner remains functional without one; any future AI integration must run through a protected server or Edge Function.
- Online payment is intentionally not implemented.
