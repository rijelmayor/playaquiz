"use client";

import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CustomerStatusEditor } from "@/components/shared/CustomerStatusEditor";
import { QuotationCreateForm } from "@/components/shared/QuotationCreateForm";
import { QuotationQueue } from "@/components/admin/QuotationQueue";
import { DesignApprovalQueue } from "@/components/admin/DesignApprovalQueue";
import { JobOrderCreateForm } from "@/components/admin/JobOrderCreateForm";
import { JobOrderDetailManager, type AdminJobOrderDetailRow } from "@/components/admin/JobOrderDetailManager";
import { AdminPaymentManager, type AdminPaymentJob } from "@/components/admin/AdminPaymentManager";
import { CompletionAcknowledgment, type CompletionRow } from "@/components/admin/CompletionAcknowledgment";
import type { AdminJobRow } from "@/components/admin/AdminWorkspace";
import type { QuotationSettings } from "@/lib/types/database";

function money(value: number | null | undefined) {
  return `₱${(value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateOnly(value: string) {
  return new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

// A plain, no-JS-state <details>/<summary> pair gives every function area
// its own hide/unhide toggle without needing extra React state per section.
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

export function SimpleAdminWorkspace({
  jobs,
  preQuoteRows,
  pendingQuoteRows,
  pendingDesignRows,
  jobOrderCandidateRows,
  jobOrderDetailRows,
  paymentJobs,
  completionRows,
  fabricators,
  quotationSettings,
  adminId
}: {
  jobs: AdminJobRow[];
  preQuoteRows: { job_id: string; client_name: string; next_version: number; payment_terms?: any }[];
  pendingQuoteRows: { job_id: string; client_name: string; quoted_value: number; quotation_id: string | null; version: number | null }[];
  pendingDesignRows: { design_id: string; job_id: string; client_name: string; revision_no: number; status: string; file_url: string | null; revision_note: string | null; file_name: string | null }[];
  jobOrderCandidateRows: { job_id: string; client_name: string; payment_terms: any; down_payment_received: boolean }[];
  jobOrderDetailRows: AdminJobOrderDetailRow[];
  paymentJobs: AdminPaymentJob[];
  completionRows: CompletionRow[];
  fabricators: { user_id: string; name: string }[];
  quotationSettings: QuotationSettings | null;
  adminId: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter !== "all" && job.status !== statusFilter) return false;
      if (!q) return true;
      return (
        job.client_name.toLowerCase().includes(q) ||
        (job.job_name ?? "").toLowerCase().includes(q) ||
        job.display_job_id.toLowerCase().includes(q)
      );
    });
  }, [jobs, query, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search client, project, or job ID…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:max-w-xs"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          <option value="lead">Lead</option>
          <option value="site_visit">Site Visit</option>
          <option value="design_review">Design Review</option>
          <option value="quoted">Quoted</option>
          <option value="approved">Approved</option>
          <option value="in_production">In Production</option>
          <option value="installed">Installed</option>
          <option value="paid">Paid</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <p className="text-xs text-gray-400 sm:ml-auto">{filtered.length} of {jobs.length} jobs</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="divide-y divide-gray-100">
          {filtered.map((job) => {
            const isOpen = expanded === job.job_id;
            const quote = job.latest_quotation_total ?? job.quoted_value ?? 0;
            const preQuote = preQuoteRows.filter((r) => r.job_id === job.job_id);
            const pendingQuote = pendingQuoteRows.filter((r) => r.job_id === job.job_id);
            const pendingDesigns = pendingDesignRows.filter((r) => r.job_id === job.job_id);
            const jobOrderCandidate = jobOrderCandidateRows.filter((r) => r.job_id === job.job_id);
            const jobOrderDetails = jobOrderDetailRows.filter((r) => r.job_id === job.job_id);
            const payment = paymentJobs.filter((r) => r.job_id === job.job_id);
            const completion = completionRows.filter((r) => r.job_id === job.job_id);

            return (
              <div key={job.job_id}>
                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-700">{job.display_job_id}</span>
                      <p className="truncate text-sm font-semibold text-gray-900">{job.client_name}</p>
                      <StatusBadge status={job.status} />
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500">{job.job_name || "Untitled project"} · {money(quote)} · Created {dateOnly(job.created_at)}</p>
                  </div>
                  <button
                    onClick={() => setExpanded(isOpen ? null : job.job_id)}
                    className="shrink-0 rounded-md border border-gray-800 px-3 py-1.5 text-xs font-semibold"
                  >
                    {isOpen ? "Hide details" : "Show details"}
                  </button>
                </div>

                {isOpen && (
                  <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-4 py-4">
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="text-xs text-gray-600">
                          <p>{job.contact || "No contact"}{job.location ? ` · ${job.location}` : ""}</p>
                          {job.notes && <p className="mt-1 whitespace-pre-wrap border-l-2 border-gray-200 pl-2 text-gray-500">{job.notes}</p>}
                        </div>
                        <CustomerStatusEditor jobId={job.job_id} status={job.follow_up_status} note={job.follow_up_note} />
                      </div>
                    </div>

                    {preQuote.length > 0 && (
                      <Section title="Create quotation">
                        <QuotationCreateForm rows={preQuote} settings={quotationSettings} createdBy={adminId} />
                      </Section>
                    )}

                    {pendingQuote.length > 0 && (
                      <Section title="Quotation awaiting decision">
                        <QuotationQueue rows={pendingQuote} />
                      </Section>
                    )}

                    {pendingDesigns.length > 0 && (
                      <Section title="Design approval" count={pendingDesigns.length}>
                        <DesignApprovalQueue rows={pendingDesigns} />
                      </Section>
                    )}

                    {jobOrderCandidate.length > 0 && (
                      <Section title="Create job order">
                        <JobOrderCreateForm rows={jobOrderCandidate} fabricators={fabricators} />
                      </Section>
                    )}

                    {jobOrderDetails.length > 0 && (
                      <Section title="Production job order">
                        <JobOrderDetailManager rows={jobOrderDetails} adminId={adminId} />
                      </Section>
                    )}

                    {payment.length > 0 && (
                      <Section title="Payments">
                        <AdminPaymentManager jobs={payment} />
                      </Section>
                    )}

                    {completion.length > 0 && (
                      <Section title="Completion acknowledgment">
                        <CompletionAcknowledgment rows={completion} adminId={adminId} />
                      </Section>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <p className="px-4 py-10 text-center text-sm text-gray-500">No jobs match these filters.</p>}
        </div>
      </div>
    </div>
  );
}
