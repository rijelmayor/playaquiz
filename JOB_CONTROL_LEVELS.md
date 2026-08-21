# DW AdSign Job Control Levels

## Purpose

DW AdSign now classifies jobs by selling value so staff can immediately see the intended level of operational control without changing the existing database schema.

| Job value | Level | Intended path |
|---|---|---|
| Below ₱10,000 | Fast Close | Materials → Fabrication → Installation → Collect payment → Financial close |
| ₱10,000–₱49,999 | Standard Control | Production → QC → Installation → Payment → Actual cost reconciliation → Financial close |
| ₱50,000+ | Full Control | Full production, QC, installation verification, costing, payment and accounting controls |

## Important safety rule

This release does **not** weaken the existing Supabase financial-close trigger or production-completion trigger. Those database safeguards remain the final authority. The tier is therefore a workflow classification and UI guide in this release, not a database-policy bypass.

A future database-policy change would be required if DW AdSign wants Fast Close jobs to bypass the existing QC/installation verification gates at the database level. No migration is included in this release.

## Parent job status synchronization

Admin completion now explicitly synchronizes a completed job order to the parent `jobs.status = installed`. Admin also receives a **Sync job status** action for legacy records where the job order is already completed/installed but the parent job still says `in_production`.

This fixes the condition where Accounting displays all green operational checks but keeps **Close project financially** disabled because the parent job status is stale.
