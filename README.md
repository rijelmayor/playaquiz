# DW AdSign CRM

Lead-to-closeout pipeline for a signage/print advertising company. Four role-based
portals share one Supabase database, deployed on Vercel.

## Folder structure — where to make changes 001

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
2. Run `supabase/migrations/0001_init.sql` in the Supabase SQL editor.
3. Run `supabase/migrations/0002_job_attachments.sql` in the Supabase SQL
   editor. This adds the `job_attachments` table and creates the private
   `job-attachments` storage bucket (transaction photos, site visit photos,
   and each job order's approved design photo).
4. Run `supabase/migrations/0003_missing_rls_policies.sql`. This adds
   policies for `clients`, `payments`, `quotations`, and `designs` — these
   tables had row level security enabled with no policies defined, which
   blocked every role, including admin, from reading or writing them.
5. Run `supabase/migrations/0004_security_and_automation.sql`. This closes
   a real hole — `users` had RLS enabled nowhere in `0001`, so the anon key
   could read every user's row, or write to it (including setting your own
   role to `admin`). It also adds the automation the spec describes but
   `0001`–`0003` never implemented: `booked_by` immutability (with an
   audit-logged `override_booked_by()` escape hatch), a `job_commissions`
   row auto-created per job at intake (10% default rate — override
   `commission_rate`/`split_pct` per row for multi-agent splits or a
   different rate), commission `pending → payable`/`void` transitions,
   `funds_release_status` roll-up from `fund_releases`, and `job_orders`
   reaching `installed` flowing back to `jobs.status`.
6. Manually add your first `admin` row to the `users` table, linked via
   `auth_id` to a Supabase Auth user you create in the Auth dashboard.
7. Copy `.env.example` to `.env.local` and fill in your Supabase URL/anon key.
8. `npm install`
9. `npm run dev`

**Your live Supabase project currently has no `public` schema tables at
all** (checked against the CSV you exported) — none of the four
migrations have been run against it yet. Run all four, in order, before
anything will work. That also explains what dwcrm.xyz was showing: every
query fails and the page components render on empty data.

## Deployment

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as
   environment variables in the Vercel project settings.
4. Every push to `main` auto-deploys.

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
