"use client";

import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaymentLogger } from "@/components/accounting/PaymentLogger";
import { FundReleaseQueue } from "@/components/accounting/FundReleaseQueue";
import { CommissionQueue } from "@/components/accounting/CommissionQueue";
import { CommissionControl, type AdminCommissionRow } from "@/components/accounting/CommissionControl";
import type { AccountingJob, AccountingExpense } from "@/components/accounting/AccountingWorkspace";

function peso(value: number | null | undefined) {
  return `₱${Number(value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-gray-200 bg-white open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-semibold text-gray-800">
        <span className="flex items-center gap-2">
          {title}
          {typeof count === "number" && count > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{count}</span>
          )}
        </span>
        <span className="text-gray-400 transition group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-gray-100 p-3">{children}</div>
    </details>
  );
}

export function SimpleAccountingWorkspace({
  jobs,
  expenses,
  jobOrderRows,
  commissionRows,
  commissionControlRows,
  accountingUserId
}: {
  jobs: AccountingJob[];
  expenses: AccountingExpense[];
  jobOrderRows: { job_order_id: string; job_id: string; client_name: string; estimated_materials_cost: number | null; estimated_labor_cost: number | null; estimated_logistics_cost: number | null; funds_release_status: string }[];
  commissionRows: { commission_id: string; job_id: string; agent_name: string; client_name: string; amount: number; status: string }[];
  commissionControlRows: AdminCommissionRow[];
  accountingUserId: string;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => j.client_name.toLowerCase().includes(q));
  }, [jobs, query]);

  const totals = useMemo(() => ({
    receivable: jobs.reduce((s, j) => s + j.receivable, 0),
    commissionPending: jobs.reduce((s, j) => s + Math.max(0, j.commission - j.commission_paid), 0),
    expenses: expenses.filter((e) => e.status !== "void").reduce((s, e) => s + e.amount, 0)
  }), [jobs, expenses]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"><p className="text-[10px] uppercase text-gray-400">Total receivable</p><p className="text-lg font-semibold">{peso(totals.receivable)}</p></div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"><p className="text-[10px] uppercase text-gray-400">Commission pending</p><p className="text-lg font-semibold">{peso(totals.commissionPending)}</p></div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"><p className="text-[10px] uppercase text-gray-400">Total expenses logged</p><p className="text-lg font-semibold">{peso(totals.expenses)}</p></div>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search client…"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:max-w-xs"
      />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="divide-y divide-gray-100">
          {filtered.map((job) => {
            const isOpen = expanded === job.job_id;
            const paymentRow = { job_id: job.job_id, client_name: job.client_name, quoted_value: job.quoted_value, final_value: job.final_value };
            const jobOrders = jobOrderRows.filter((r) => r.job_id === job.job_id);
            const commissions = commissionRows.filter((r) => r.job_id === job.job_id);
            const commissionControls = commissionControlRows.filter((r) => r.job_id === job.job_id);
            const jobExpenses = expenses.filter((e) => e.job_id === job.job_id);

            return (
              <div key={job.job_id}>
                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">{job.client_name}</p>
                      <StatusBadge status={job.status} />
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500">
                      Value {peso(job.final_value || job.quoted_value)} · Received {peso(job.received)} · Balance {peso(job.receivable)}
                    </p>
                  </div>
                  <button onClick={() => setExpanded(isOpen ? null : job.job_id)} className="shrink-0 rounded-md border border-gray-800 px-3 py-1.5 text-xs font-semibold">
                    {isOpen ? "Hide details" : "Show details"}
                  </button>
                </div>

                {isOpen && (
                  <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-4 py-4">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase text-gray-400">Materials</p><p className="text-xs font-semibold">{peso(job.est_materials)} est · {job.actual_materials == null ? "—" : peso(job.actual_materials)} actual</p></div>
                      <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase text-gray-400">Labor</p><p className="text-xs font-semibold">{peso(job.est_labor)} est · {job.actual_labor == null ? "—" : peso(job.actual_labor)} actual</p></div>
                      <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase text-gray-400">Logistics</p><p className="text-xs font-semibold">{peso(job.est_logistics)} est · {job.actual_logistics == null ? "—" : peso(job.actual_logistics)} actual</p></div>
                      <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase text-gray-400">Commission</p><p className="text-xs font-semibold">{peso(job.commission)} · {peso(job.commission_paid)} paid</p></div>
                    </div>

                    {jobExpenses.length > 0 && (
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Expenses on this job</p>
                        <div className="space-y-1.5">
                          {jobExpenses.map((e) => (
                            <div key={e.expense_id} className="flex items-center justify-between text-xs">
                              <span>{e.description} {e.payee ? `· ${e.payee}` : ""}</span>
                              <span className="font-semibold">{peso(e.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Section title="Log payment">
                      <PaymentLogger rows={[paymentRow]} />
                    </Section>

                    {jobOrders.length > 0 && (
                      <Section title="Release funds to production">
                        <FundReleaseQueue rows={jobOrders} accountingUserId={accountingUserId} />
                      </Section>
                    )}

                    {commissions.length > 0 && (
                      <Section title="Commission payout" count={commissions.length}>
                        <CommissionQueue rows={commissions} />
                      </Section>
                    )}

                    {commissionControls.length > 0 && (
                      <Section title="Commission details">
                        <CommissionControl rows={commissionControls} />
                      </Section>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <p className="px-4 py-10 text-center text-sm text-gray-500">No jobs match this search.</p>}
        </div>
      </div>
    </div>
  );
}
