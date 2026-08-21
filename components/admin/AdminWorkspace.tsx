"use client";

import { useEffect, useMemo, useState } from "react";
import { CustomerStatusEditor } from "@/components/shared/CustomerStatusEditor";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AdminPaymentManager, type AdminPaymentJob } from "@/components/admin/AdminPaymentManager";
import { QuotationCreateForm } from "@/components/shared/QuotationCreateForm";
import { QuotationQueue } from "@/components/admin/QuotationQueue";
import { DesignApprovalQueue } from "@/components/admin/DesignApprovalQueue";
import { JobOrderCreateForm } from "@/components/admin/JobOrderCreateForm";
import { JobOrderDetailManager, type AdminJobOrderDetailRow } from "@/components/admin/JobOrderDetailManager";
import { CompletionAcknowledgment, type CompletionRow } from "@/components/admin/CompletionAcknowledgment";
import { AdminMaterialsEditor, type MaterialRow } from "@/components/admin/AdminMaterialsEditor";
import { QuotationSettingsForm } from "@/components/admin/QuotationSettingsForm";
import { AuditTrail } from "@/components/admin/AuditTrail";
import { AdminJobEvidencePreview } from "@/components/admin/AdminJobEvidencePreview";
import type { FollowUpStatus, JobStatus, PaymentTerms, QuotationSettings, SiteVisitStatus } from "@/lib/types/database";

export interface AdminJobRow {
  job_id: string;
  display_job_id: string;
  job_name: string | null;
  client_name: string;
  contact: string | null;
  email: string | null;
  location: string | null;
  booked_by_name: string;
  status: JobStatus;
  follow_up_status: FollowUpStatus;
  follow_up_note: string | null;
  needs_site_visit: boolean;
  site_visit_status: SiteVisitStatus;
  site_visit_date: string | null;
  site_visit_by: string | null;
  site_visit_note: string | null;
  notes: string | null;
  quoted_value: number | null;
  final_value: number | null;
  payment_terms: PaymentTerms;
  created_at: string;
  updated_at: string;
  quotation_count: number;
  latest_quotation_id: string | null;
  latest_quotation_total: number | null;
  latest_quotation_created_at: string | null;
  latest_design_status: string | null;
  latest_design_revision: number | null;
  job_order_status: string | null;
  deposit_received: number;
  balance_received: number;
  total_received: number;
  reference_photos: { attachment_id: string; signed_url: string | null; caption?: string | null }[];
  transaction_photos: { attachment_id: string; signed_url: string | null; caption?: string | null }[];
  site_visit_photos: { attachment_id: string; signed_url: string | null; caption?: string | null }[];
}

const STATUS_ICONS: Record<string, string> = {
  lead: "🌱",
  site_visit: "📍",
  design_review: "✏️",
  quoted: "📄",
  approved: "✅",
  in_production: "⚙️",
  installed: "🏗️",
  paid: "💰",
  closed: "🔒",
  cancelled: "❌"
};

function money(value: number | null | undefined) {
  return `₱${(value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateOnly(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function effectivePipelineStage(job: AdminJobRow): JobStatus {
  if (["in_production", "installed", "paid", "closed", "cancelled"].includes(job.status))
    return job.status;
  if (job.follow_up_status === "approved" || job.status === "approved") return "approved";
  return job.status;
}

function MetricTile({
  icon,
  label,
  value,
  color,
  onClick
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
}) {
  const colors: Record<string, string> = {
    slate: "from-slate-50 to-white border-slate-200 hover:border-slate-400",
    amber: "from-amber-50 to-white border-amber-200 hover:border-amber-400",
    blue: "from-blue-50 to-white border-blue-200 hover:border-blue-400",
    emerald: "from-emerald-50 to-white border-emerald-200 hover:border-emerald-400",
    rose: "from-rose-50 to-white border-rose-200 hover:border-rose-400",
    violet: "from-violet-50 to-white border-violet-200 hover:border-violet-400",
    cyan: "from-cyan-50 to-white border-cyan-200 hover:border-cyan-400"
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] ${colors[color] ?? colors.slate}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 text-lg shadow-sm ring-1 ring-black/5">
          {icon}
        </span>
        <p className="text-2xl font-bold tracking-tight text-gray-900">{value}</p>
      </div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
    </button>
  );
}

export function AdminWorkspace({
  jobs,
  paymentJobs,
  preQuoteRows,
  pendingQuoteRows,
  pendingDesignRows,
  jobOrderCandidateRows,
  jobOrderDetailRows,
  completionRows,
  fabricators,
  quotationSettings,
  materialsByOrder,
  auditRows,
  adminId
}: {
  jobs: AdminJobRow[];
  paymentJobs: AdminPaymentJob[];
  preQuoteRows: {
    job_id: string;
    client_name: string;
    next_version: number;
    payment_terms?: PaymentTerms;
  }[];
  pendingQuoteRows: {
    job_id: string;
    client_name: string;
    quoted_value: number;
    quotation_id: string | null;
    version: number | null;
  }[];
  pendingDesignRows: {
    design_id: string;
    job_id: string;
    client_name: string;
    revision_no: number;
    status: string;
    file_url: string | null;
    revision_note: string | null;
    file_name: string | null;
  }[];
  jobOrderCandidateRows: {
    job_id: string;
    client_name: string;
    payment_terms: PaymentTerms;
    down_payment_received: boolean;
  }[];
  jobOrderDetailRows: AdminJobOrderDetailRow[];
  completionRows: CompletionRow[];
  fabricators: { user_id: string; name: string }[];
  quotationSettings: QuotationSettings | null;
  materialsByOrder: Record<string, MaterialRow[]>;
  auditRows: {
    audit_id: string;
    action: string;
    table_name: string;
    record_id: string;
    actor_name: string | null;
    created_at: string;
  }[];
  adminId: string;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const detailJob = detailJobId
    ? jobs.find((j) => j.job_id === detailJobId) ?? null
    : null;

  useEffect(() => {
    if (!detailJobId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDetailJobId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailJobId]);

  useEffect(() => {
    if (detailJobId) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [detailJobId]);

  const metrics = useMemo(
    () => ({
      active: jobs.filter((j) => !["closed", "cancelled"].includes(j.status))
        .length,
      pendingQuotes: jobs.filter((j) => j.status === "quoted").length,
      awaitingDeposit: jobs.filter(
        (j) =>
          j.payment_terms === "50_50" &&
          j.total_received <= 0 &&
          ["approved", "in_production"].includes(j.status)
      ).length,
      readyProduction: jobs.filter(
        (j) =>
          (j.status === "approved" || j.follow_up_status === "approved") &&
          !j.job_order_status
      ).length,
      inProduction: jobs.filter((j) => j.status === "in_production").length,
      pendingDesigns: jobs.filter((j) => j.latest_design_status === "pending")
        .length,
      completed: jobs.filter((j) =>
        ["installed", "paid", "closed"].includes(j.status)
      ).length,
      followUps: jobs.filter((j) => j.follow_up_status === "follow_up").length
    }),
    [jobs]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter !== "all" && effectivePipelineStage(job) !== statusFilter)
        return false;
      if (!q) return true;
      return [
        job.display_job_id,
        job.client_name,
        job.job_name,
        job.contact,
        job.email,
        job.booked_by_name
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [jobs, search, statusFilter]);

  function openJob(id: string) {
    setDetailJobId(id);
  }

  return (
    <div className="space-y-5">
      {/* Game-style metric tiles */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
        <MetricTile
          icon="👥"
          label="Active jobs"
          value={metrics.active}
          color="slate"
          onClick={() => setStatusFilter("all")}
        />
        <MetricTile
          icon="📄"
          label="Pending quotes"
          value={metrics.pendingQuotes}
          color="blue"
          onClick={() => setStatusFilter("quoted")}
        />
        <MetricTile
          icon="💳"
          label="Awaiting deposit"
          value={metrics.awaitingDeposit}
          color="amber"
        />
        <MetricTile
          icon="🎨"
          label="Pending designs"
          value={metrics.pendingDesigns}
          color="violet"
        />
        <MetricTile
          icon="🚀"
          label="Ready for production"
          value={metrics.readyProduction}
          color="cyan"
          onClick={() => setStatusFilter("approved")}
        />
        <MetricTile
          icon="⚙️"
          label="In production"
          value={metrics.inProduction}
          color="amber"
          onClick={() => setStatusFilter("in_production")}
        />
        <MetricTile
          icon="🏆"
          label="Completed"
          value={metrics.completed}
          color="emerald"
          onClick={() => setStatusFilter("installed")}
        />
        <MetricTile
          icon="🔔"
          label="Needs follow-up"
          value={metrics.followUps}
          color="rose"
        />
      </div>

      {/* Search + filters + settings */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Job ID, client, project…"
            className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 sm:max-w-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm"
          >
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
          <p className="text-xs text-gray-400 sm:ml-1">
            {filtered.length} of {jobs.length}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            ⚙️ Quote settings
          </button>
          <button
            type="button"
            onClick={() => setShowAudit((v) => !v)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            📋 Audit
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <QuotationSettingsForm
            settings={
              quotationSettings ?? {
                id: 1,
                company_name: "Delight Works Advertising Signages",
                company_address:
                  "2nd Flr, Unit 15, Ellen's Bldg, Jasmin St., Capitol Site, Cebu City",
                company_contact: "09569934866/09329848552/09205102720",
                social_media_account: "",
                email_address: "",
                website: "",
                services_note: "Mock-Up/Mobilization/Installation FREE",
                terms:
                  "1. Estimated days to finish the project is 5-7 working days from approval and downpayment.\n2. Price Quote Valid 15 days\n3. Mode of payment: 50% downpayment and 50% after completion\n4. All Payments shall be made via Cash, Check or Credit Card\n5. All Checks Payable to: __________",
                valid_days: 15,
                bank_name: null,
                bank_account_name: null,
                bank_account_number: null,
                gcash_number: null,
                gcash_account_name: null,
                gcash_qr_url: null,
                updated_by: null,
                updated_at: new Date().toISOString()
              }
            }
          />
        </div>
      )}

      {showAudit && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <AuditTrail rows={auditRows} />
        </div>
      )}

      {/* Clean job table — same language as Sales */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/90">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Job ID
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Project
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Evidence
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Received
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Open
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((job) => {
                const stage = effectivePipelineStage(job);
                const quote =
                  job.latest_quotation_total ?? job.quoted_value ?? 0;
                return (
                  <tr
                    key={job.job_id}
                    className="transition hover:bg-gray-50/80"
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-2 py-1 text-[11px] font-bold tracking-wide text-white">
                        <span className="text-sm leading-none">
                          {STATUS_ICONS[stage] ?? "•"}
                        </span>
                        {job.display_job_id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        {job.job_name || job.client_name}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {job.client_name}
                        {job.booked_by_name ? ` · ${job.booked_by_name}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <AdminJobEvidencePreview
                        jobId={job.display_job_id}
                        transactionPhotos={job.transaction_photos}
                        siteVisitPhotos={job.site_visit_photos}
                        referencePhotos={job.reference_photos}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={stage} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">
                        {money(job.total_received)}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        of {money(quote)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openJob(job.job_id)}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-gray-900 hover:bg-gray-900 hover:text-white"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-gray-500">
            No jobs match these filters.
          </p>
        )}
      </div>

      {/* Job detail modal — all admin actions in one place */}
      {detailJob && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-6">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setDetailJobId(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 my-2 w-full max-w-3xl rounded-2xl bg-white shadow-2xl ring-1 ring-gray-200"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-gray-100 bg-white/95 px-4 py-3.5 backdrop-blur sm:px-5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-2xl shadow-sm">
                  {STATUS_ICONS[effectivePipelineStage(detailJob)] ?? "📋"}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {detailJob.display_job_id}
                  </p>
                  <h2 className="truncate text-base font-bold text-gray-900 sm:text-lg">
                    {detailJob.job_name || detailJob.client_name}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {detailJob.client_name}
                    {detailJob.contact ? ` · ${detailJob.contact}` : ""}
                    {detailJob.location ? ` · ${detailJob.location}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={effectivePipelineStage(detailJob)} />
                <button
                  type="button"
                  onClick={() => setDetailJobId(null)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Close"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="max-h-[calc(100vh-8rem)] space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
              {/* Snapshot cards */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">
                    Quote
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-gray-900">
                    {money(
                      detailJob.latest_quotation_total ??
                        detailJob.quoted_value
                    )}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-600">
                    Received
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-emerald-900">
                    {money(detailJob.total_received)}
                  </p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-amber-600">
                    Balance
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-amber-900">
                    {money(
                      Math.max(
                        0,
                        (detailJob.latest_quotation_total ??
                          detailJob.quoted_value ??
                          0) - detailJob.total_received
                      )
                    )}
                  </p>
                </div>
                <div className="rounded-xl bg-blue-50 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-blue-600">
                    Sales agent
                  </p>
                  <p className="mt-0.5 truncate text-sm font-bold text-blue-900">
                    {detailJob.booked_by_name}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
                <span>
                  Created {dateOnly(detailJob.created_at)}
                  {detailJob.email ? ` · ${detailJob.email}` : ""}
                </span>
                <CustomerStatusEditor
                  jobId={detailJob.job_id}
                  status={detailJob.follow_up_status}
                  note={detailJob.follow_up_note}
                />
              </div>

              {detailJob.notes && (
                <p className="whitespace-pre-wrap border-l-2 border-gray-200 pl-3 text-xs leading-relaxed text-gray-600">
                  {detailJob.notes}
                </p>
              )}

              {/* Create quotation */}
              {preQuoteRows.some((r) => r.job_id === detailJob.job_id) && (
                <section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
                  <p className="mb-2 text-xs font-bold text-blue-800">
                    📄 Create quotation
                  </p>
                  <QuotationCreateForm
                    rows={preQuoteRows.filter(
                      (r) => r.job_id === detailJob.job_id
                    )}
                    settings={quotationSettings}
                    createdBy={adminId}
                  />
                </section>
              )}

              {/* Approve quotation */}
              {pendingQuoteRows.some((r) => r.job_id === detailJob.job_id) && (
                <section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
                  <p className="mb-2 text-xs font-bold text-emerald-800">
                    ✅ Quotation approval
                  </p>
                  <QuotationQueue
                    rows={pendingQuoteRows.filter(
                      (r) => r.job_id === detailJob.job_id
                    )}
                  />
                </section>
              )}

              {/* Design approval */}
              {pendingDesignRows.some((r) => r.job_id === detailJob.job_id) && (
                <section className="rounded-2xl border border-violet-100 bg-violet-50/40 p-3">
                  <p className="mb-2 text-xs font-bold text-violet-800">
                    🎨 Design approval
                  </p>
                  <DesignApprovalQueue
                    rows={pendingDesignRows.filter(
                      (r) => r.job_id === detailJob.job_id
                    )}
                  />
                </section>
              )}

              {/* Create job order */}
              {jobOrderCandidateRows.some(
                (r) => r.job_id === detailJob.job_id
              ) && (
                <section className="rounded-2xl border border-cyan-100 bg-cyan-50/40 p-3">
                  <p className="mb-2 text-xs font-bold text-cyan-800">
                    🚀 Forward to production
                  </p>
                  <JobOrderCreateForm
                    rows={jobOrderCandidateRows.filter(
                      (r) => r.job_id === detailJob.job_id
                    )}
                    fabricators={fabricators}
                  />
                </section>
              )}

              {/* Job order details + materials */}
              {jobOrderDetailRows
                .filter((r) => r.job_id === detailJob.job_id)
                .map((order) => (
                  <section
                    key={order.job_order_id}
                    className="space-y-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <p className="text-xs font-bold text-gray-800">
                      ⚙️ Production job order
                    </p>
                    <JobOrderDetailManager
                      rows={[order]}
                      adminId={adminId}
                    />
                    <AdminMaterialsEditor
                      jobOrderId={order.job_order_id}
                      jobId={detailJob.job_id}
                      materials={
                        materialsByOrder[order.job_order_id] ?? []
                      }
                    />
                  </section>
                ))}

              {/* Payments */}
              {paymentJobs.some((r) => r.job_id === detailJob.job_id) && (
                <section className="rounded-2xl border border-amber-100 bg-amber-50/30 p-3">
                  <p className="mb-2 text-xs font-bold text-amber-800">
                    💳 Payments
                  </p>
                  <AdminPaymentManager
                    jobs={paymentJobs.filter(
                      (r) => r.job_id === detailJob.job_id
                    )}
                  />
                </section>
              )}

              {/* Completion */}
              {completionRows.some((r) => r.job_id === detailJob.job_id) && (
                <section className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-2 text-xs font-bold text-gray-800">
                    🏆 Completion acknowledgment
                  </p>
                  <CompletionAcknowledgment
                    rows={completionRows.filter(
                      (r) => r.job_id === detailJob.job_id
                    )}
                    adminId={adminId}
                  />
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
