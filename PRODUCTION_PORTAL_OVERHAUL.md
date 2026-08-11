# Production Portal Overhaul

This update changes only the Production/Admin job-order side of the CRM. Existing Sales, Admin, Accounting and historical workflows are retained.

## Required Supabase migration

Run:

`supabase/migrations/0016_production_system.sql`

The migration adds:

- Production brief fields on `job_orders`.
- Production stages and stage history.
- Material planning/usage.
- Labor work logs.
- Material requests.
- QC inspections and rework records.
- Delivery/dispatch records.
- Installation schedules.
- Production evidence attachments.
- Approved-design/order-reference attachment categories.
- Actual production-cost rollups into the existing `job_orders` cost fields used by Accounting.
- Fabricator RLS for assigned job orders and production records.
- Protection preventing fabricators from changing commercial/financial/assignment fields.

## Admin workflow

1. Approve the customer/design through the existing Admin workflow.
2. Create the Job Order and assign the fabricator.
3. Open **Production job-order brief**.
4. Enter the exact order description, dimensions, quantity, specifications, installation notes, priority and deadline.
5. Upload the exact approved design revision under **Approved design**.
6. Add customer/reference images under **Order / reference images**.
7. Save the production brief.

Fabricators can see the approved design and order references but cannot replace the approved design.

## Fabricator workflow

The Production portal now follows:

`Materials → Fabrication/Printing/Finishing/Electrical/Assembly → QC → Ready for Delivery → Installation → Completed`

A fabricator can:

- Update production stage.
- Record materials and actual usage.
- Log labor/work hours.
- Request missing materials.
- Submit QC results.
- Add dispatch and installation records.
- Upload fabrication/QC/installation evidence.
- Put a job on hold with a reason.

## Accounting connection

Production detail records feed the existing Accounting/job-profitability fields:

- material actual cost
- labor actual cost
- logistics actual cost

The approved selling price remains owned by Admin/Sales. Fund releases and customer payments remain owned by Accounting.

## Image rules

- `approved_design`: Admin-controlled fabrication reference.
- `order_reference`: Admin-controlled customer/order visuals.
- `production_progress`: Fabricator evidence.
- `qc`: Fabricator QC evidence.
- `installation_proof`: Fabricator installation evidence.

All job-attachment storage remains private and is served through signed URLs.
