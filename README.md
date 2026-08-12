# DW AdSign CRM

Lead-to-closeout pipeline for a signage/print advertising company. Four role-based
portals share one Supabase database, deployed on Vercel.

## Folder structure — where to make changes

```
app/
  login/            shared login page
  sales/            Sales portal route (client intake, own commissions)
  admin/            Admin portal route (approvals, profitability)
  accounting/       Accounting portal route (fund release, commission payout)
  production/       Fabrication/production portal route (job order board)
components/
  sales/            Sales-only UI — safe to edit without touching other portals
  admin/            Admin-only UI
  accounting/       Accounting-only UI
  production/       Production-only UI
  shared/           Used by multiple portals (StatusBadge, MetricCard) —
                     changes here affect every portal, edit carefully
lib/
  supabase/         client.ts (browser) and server.ts (Server Components) —
                     don't duplicate Supabase client setup elsewhere
  types/database.ts one place for all TypeScript types matching the schema
middleware.ts        role-based access control — one file gates all four portals
supabase/
  migrations/        SQL schema, RLS policies, and the job_profitability view.
                      This is the source of truth for the database — run in the
                      Supabase SQL editor or via the Supabase CLI.
```

**Rule of thumb**: if a change only affects one role, it belongs in that role's
folder (`components/sales`, `app/sales`, etc.). If it affects the shape of data
every portal reads, it belongs in `lib/types` and `supabase/migrations` together,
kept in sync.

## Setup

1. Create a Supabase project.
2. Open the Supabase SQL Editor and run every file in `supabase/migrations/`
   **in numeric order, 0001 through 0014**, each as its own run. Don't skip
   any — later ones repair/tighten what earlier ones set up (site-visit
   tracking in particular went through three corrective passes: 0012, 0013,
   0014). Migrations are written to be safe to run once, in order, on a
   database that has none of them yet.
3. Manually add your first `admin` row to the `users` table, linked via
   `auth_id` to a Supabase Auth user you create in the Auth dashboard.
4. Copy `.env.example` to `.env.local` and fill in your Supabase URL/anon key.
5. `npm install`
6. `npm run dev`

**If a portal page ever shows a red "couldn't load its data" panel** (in
production or locally), the error message it prints tells you exactly which
query failed and why — almost always it's a specific column or table not
existing yet, which means one of the 14 migrations above hasn't been run
against that Supabase project. Run it, then reload. This replaces the old
behavior of silently rendering an empty page when a query failed.

## Deployment (and why "two versions" confuses Vercel)

Vercel deployments are triggered by **git commits**, not by uploading a
folder. If you're working from two separate exported zip folders instead of
one git repository with a commit history, Vercel has no way to tell which
one is "newer" — there's no timeline for it to compare, so re-uploading a
folder doesn't reliably produce a new deployment or show up in the
Deployments/Activity tab.

The fix is to have exactly **one** git repository be the source of truth:

1. Pick one of the two versions as the starting point (the newer one has
   all the fixes the older one doesn't — check `git log` once this is a
   real repo, or just compare file-by-file, so a delivered zip's date isn't
   the deciding factor if the two were exported unevenly).
2. If this folder isn't already a git repo: `git init`, `git add -A`,
   `git commit -m "current state"`.
3. Push it to a GitHub repo: `git remote add origin <your-repo-url>` then
   `git push -u origin main`.
4. In Vercel: Project Settings → Git, connect that exact GitHub repo/branch.
   Every `git push` to that branch from then on creates a new deployment
   automatically, visible immediately in the Deployments tab.
5. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` under
   Project Settings → Environment Variables, for the **Production**
   environment specifically (Preview/Development are separate — it's easy
   to set a var for one and not the other, which looks identical to a
   missing var when the page fails to load).
6. From now on, don't upload zips to replace the project — edit the repo,
   commit, push. That's what gives Vercel something to diff and deploy.

## Adding a new portal or role

1. Add the role to the `role` check constraint in `0001_init.sql` (new migration).
2. Add a route folder under `app/`.
3. Add the route + role mapping to `PORTAL_ROLES` in `middleware.ts`.
4. Add a matching folder under `components/`.

## What's built vs. what's still a stub

Solid and wired end-to-end: auth + role-gated routing (`middleware.ts`),
Sales intake + client/photo list, Admin quotation creation → approval,
design approval with the revision-fee flag, job order creation and
assignment to a fabricator, Production board with status advance +
approved-design photo upload, Accounting payment logging, fund releases,
and commission payout, and the Admin profitability view reading straight
off the `job_profitability` SQL view.

Known gaps worth knowing about before you rely on this in production:

- **Commission rate is a flat 10% default**, set in the
  `jobs_after_insert_create_commission()` trigger in `0004`. There's no UI
  to change it per job — edit the `job_commissions` row directly in the
  Supabase table editor, or add an admin field for it if you need that
  regularly.
- **Multi-agent commission splits** are supported by the schema
  (`split_pct`) but there's no UI to add a second agent row to a job — only
  the auto-created 100%-split row exists today.
- **No invoice document generation** — "final payment → invoice issued" in
  the spec is just the payment log entry; nothing generates a PDF.
- **Design file uploads are a pasted link**, not a file picker — `designs.
  file_url` is a plain text field, unlike the photo attachments which go
  through the private storage bucket.

## Business logic reference

See `advertising-crm-build-prompt.md` (the original spec) for the full
workflow, commission rules, and fund-release rules this schema implements.

DW AdSign CRM


### Quotation branding and contact channels

- `dwlogo.jpg` is stored at the repository root and also at `public/dwlogo.jpg` for browser access.
- The same logo is used on login and portal navigation and is embedded in the upper-right of quotation PDFs.
- Admin → Quotation defaults includes optional Social Media Account, Email Address, and Website fields.
- Those optional lines are displayed on quotations only when the corresponding field contains data.
- Apply `supabase/migrations/0008_quotation_contact_channels.sql` after the existing migrations.

## V12.2 quotation / Gmail setup

The quotation workflow now uses the DW logo palette (charcoal/black, electric blue, teal and gold), supports discounts, optional VAT/tax, other charges, quotation notes, versioned Sales/Admin editing, and customer completion acknowledgment.

For Gmail SMTP in Vercel, add these environment variables:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-gmail-address@gmail.com
SMTP_PASS=your-google-app-password
SMTP_FROM=your-gmail-address@gmail.com
```

Use a Google App Password rather than the normal Gmail password. Keep SMTP credentials only in Vercel/server environment variables; never expose them in client code.

Before using the new quotation/commission/completion features, run the new Supabase migration `0019_quotation_commission_completion_upgrade.sql` after migrations 0015-0018.
