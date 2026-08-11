"use client";

import { useMemo, useState } from "react";
import { CustomerStatusEditor } from "@/components/shared/CustomerStatusEditor";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import { AdminPaymentManager, type AdminPaymentJob } from "@/components/admin/AdminPaymentManager";
import type { FollowUpStatus, JobStatus, PaymentTerms, SiteVisitStatus } from "@/lib/types/database";

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

const statusLabels: Record<JobStatus, string> = {
  lead: "Lead",
  site_visit: "Site Visit",
  design_review: "Design Review",
  quoted: "Quoted",
  approved: "Approved",
  in_production: "In Production",
  installed: "Installed",
  paid: "Paid",
  closed: "Closed",
  cancelled: "Cancelled"
};

const followUpLabels: Record<FollowUpStatus, string> = {
  follow_up: "Follow Up",
  drawing: "Drawing",
  approved: "Approved",
  other: "Others"
};

// One place to define what every metric on the Overview screen actually
// means, so the tooltip text and the underlying calculation can't drift
// apart silently.
const metricTips: Record<string, string> = {
  "Active customers": "Every project that is not Closed or Cancelled.",
  "New leads": "Projects still sitting at the Lead stage — sales has not yet moved them into Site Visit or Design.",
  "Customer approved": "Approved either through Admin (job status) or through Sales' customer follow-up status. Either signal counts.",
  "Site visits completed": "Counts only jobs with an explicit Completed site-visit record — a photo or approval alone does not count.",
  "Needs follow-up": "Sales has flagged these customers as Follow Up in the customer status editor.",
  "Pending quotations": "A quotation has been generated and is waiting on customer action.",
  "Pending designs": "A design revision is waiting for customer approval.",
  "Awaiting deposit": "50/50 payment-terms projects that are Approved or in Production but have not received any payment yet.",
  "Ready for production": "Customer approved, but no Job Order has been created yet.",
  "In production": "A Job Order exists and the project is being fabricated.",
  "Ready for installation": "Job Order status is Ready for Install.",
  "Completed / installed": "Installed, Paid, or Closed projects."
};

const tabTips: Record<string, string> = {
  overview: "Company-wide snapshot: key metrics, what needs attention today, and the full customer record.",
  customers: "Master list of every customer/project. Search and filter by status, follow-up, site visit, payment or date.",
  pipeline: "The operational lifecycle from Lead through Installed, one column per stage.",
  payments: "Record payments against each project's milestone schedule and review payment history.",
  approvals: "Everything currently waiting on a decision, grouped by approval type."
};

function money(value: number | null | undefined) {
  return `₱${(value ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

function dateOnly(value: string) {
  return new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function paymentLabel(term: PaymentTerms) {
  return term === "50_50"
    ? "50% down / 50% completion"
    : term === "full_on_completion"
      ? "Full on completion"
      : term === "full_on_installation"
        ? "Full on installation"
        : "Custom payment schedule";
}

function effectivePipelineStage(job: AdminJobRow): JobStatus {
  // Once production/installation has started, the operational stage remains
  // authoritative. Before that point, a Sales "Approved" follow-up is the
  // customer's approval signal and should activate the Approved pipeline card.
  if (["in_production", "installed", "paid", "closed", "cancelled"].includes(job.status)) return job.status;
  if (job.follow_up_status === "approved" || job.status === "approved") return "approved";
  return job.status;
}

function siteVisitLabel(status: SiteVisitStatus) {
  return {
    not_required: "Not required",
    not_recorded: "Not yet recorded",
    scheduled: "Scheduled",
    completed: "Completed — customer visited",
    cancelled: "Cancelled",
    rescheduled: "Rescheduled"
  }[status];
}

function siteVisitSummary(job: AdminJobRow) {
  if (job.site_visit_status === "completed") {
    return `✓ Visited${job.site_visit_date ? ` · ${dateOnly(job.site_visit_date)}` : ""}`;
  }
  return siteVisitLabel(job.site_visit_status);
}

// Tailwind classes for the site-visit chip, driven purely by
// site_visit_status — this is the single source of truth (see migration
// 0014_site_visit_single_source_of_truth.sql). Nothing here depends on the
// legacy needs_site_visit boolean, which is what previously caused visit
// updates to silently disappear from Admin.
function siteVisitChipClass(status: SiteVisitStatus) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "bg-red-50 text-red-700";
  if (status === "scheduled" || status === "rescheduled") return "bg-amber-50 text-amber-800";
  if (status === "not_recorded") return "bg-amber-50 text-amber-800";
  return "bg-gray-100 text-gray-500";
}

const siteVisitTip = "Recorded only when Sales explicitly marks the visit Completed in the Site Visit Editor. A site-visit photo, an approved customer, or the job simply reaching this stage do not count as proof of a visit.";

export function AdminWorkspace({ jobs, paymentJobs }: { jobs: AdminJobRow[]; paymentJobs: AdminPaymentJob[] }) {
  const [tab, setTab] = useState("overview");
  const [range, setRange] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [followUp, setFollowUp] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [siteVisitFilter, setSiteVisitFilter] = useState("all");

  const filtered = useMemo(() => {
    const now = Date.now();
    const query = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (range !== "all") {
        const age = now - new Date(job.created_at).getTime();
        const days = range === "today" ? 1 : range === "7d" ? 7 : 30;
        if (age > days * 86400000) return false;
      }
      if (status !== "all" && job.status !== status) return false;
      if (followUp !== "all" && job.follow_up_status !== followUp) return false;
      if (siteVisitFilter !== "all" && job.site_visit_status !== siteVisitFilter) return false;
      if (paymentFilter !== "all") {
        const quote = job.latest_quotation_total ?? job.quoted_value ?? 0;
        const received = job.total_received;
        if (paymentFilter === "awaiting_deposit" && (job.payment_terms !== "50_50" || received > 0)) return false;
        if (paymentFilter === "deposit_received" && (job.payment_terms !== "50_50" || job.deposit_received <= 0)) return false;
        if (paymentFilter === "full_on_completion" && job.payment_terms !== "full_on_completion") return false;
        if (paymentFilter === "full_on_installation" && job.payment_terms !== "full_on_installation") return false;
        if (paymentFilter === "custom" && job.payment_terms !== "custom") return false;
        if (paymentFilter === "balance_due" && (quote <= 0 || received >= quote)) return false;
        if (paymentFilter === "fully_paid" && (quote <= 0 || received < quote)) return false;
      }
      if (!query) return true;
      return [job.display_job_id, job.client_name, job.job_name, job.contact, job.email, job.location, job.booked_by_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [jobs, range, search, status, followUp, paymentFilter, siteVisitFilter]);

  const metrics = useMemo(() => ({
    activeCustomers: jobs.filter((j) => !["closed", "cancelled"].includes(j.status)).length,
    newLeads: jobs.filter((j) => j.status === "lead").length,
    approvedCustomers: jobs.filter((j) => effectivePipelineStage(j) === "approved").length,
    siteVisitsCompleted: jobs.filter((j) => j.site_visit_status === "completed").length,
    followUps: jobs.filter((j) => j.follow_up_status === "follow_up").length,
    pendingQuotes: jobs.filter((j) => j.status === "quoted").length,
    pendingDesigns: jobs.filter((j) => j.latest_design_status === "pending").length,
    awaitingDeposit: jobs.filter((j) => j.payment_terms === "50_50" && j.total_received <= 0 && ["approved", "in_production"].includes(j.status)).length,
    readyProduction: jobs.filter((j) => j.status === "approved" && !j.job_order_status).length,
    inProduction: jobs.filter((j) => j.status === "in_production").length,
    readyInstall: jobs.filter((j) => j.job_order_status === "ready_for_install").length,
    completed: jobs.filter((j) => ["installed", "paid", "closed"].includes(j.status)).length,
    siteVisitsPending: jobs.filter((j) => ["not_recorded", "scheduled", "rescheduled"].includes(j.site_visit_status)).length
  }), [jobs]);

  const attention = jobs.filter((j) =>
    j.follow_up_status === "follow_up" ||
    j.latest_design_status === "pending" ||
    j.status === "quoted" ||
    (j.status === "approved" && !j.job_order_status) ||
    ["not_recorded", "scheduled", "rescheduled"].includes(j.site_visit_status)
  );

  const tabs: [string, string][] = [
    ["overview", "Overview"],
    ["customers", "Customers"],
    ["pipeline", "Pipeline"],
    ["payments", "Payments"],
    ["approvals", "Approvals"]
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            title={tabTips[id]}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${tab === id ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {([
          ["Active customers", metrics.activeCustomers], ["New leads", metrics.newLeads], ["Customer approved", metrics.approvedCustomers], ["Site visits completed", metrics.siteVisitsCompleted], ["Needs follow-up", metrics.followUps],
          ["Pending quotations", metrics.pendingQuotes], ["Pending designs", metrics.pendingDesigns], ["Awaiting deposit", metrics.awaitingDeposit],
          ["Ready for production", metrics.readyProduction], ["In production", metrics.inProduction], ["Ready for installation", metrics.readyInstall], ["Completed / installed", metrics.completed]
        ] as [string, number][]).map(([label, value]) => (
          <button key={label} onClick={() => { setTab("customers"); setSearch(""); }} className="group rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-md">
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-gray-400">
              {label}
              {metricTips[label] && <InfoTooltip text={metricTips[label]} />}
            </p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-4 py-3">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  Needs attention
                  <InfoTooltip text="Follow-ups, pending quotations/designs, approvals waiting on a Job Order, and site visits that are scheduled or still unrecorded." />
                </h2>
                <p className="text-xs text-gray-500">The next actions across Sales and Operations.</p>
              </div>
              {attention.length === 0 ? <p className="px-4 py-8 text-sm text-gray-500">Nothing urgent right now.</p> : attention.slice(0, 10).map((job) => (
                <div key={job.job_id} className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{job.client_name}</p>
                    <p className="text-xs text-gray-500">{job.display_job_id} · {job.job_name || "Untitled project"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge status={effectivePipelineStage(job)} />
                    <p className="mt-1 text-[11px] text-gray-400">
                      {["not_recorded", "scheduled", "rescheduled"].includes(job.site_visit_status) ? siteVisitSummary(job) : followUpLabels[job.follow_up_status]}
                    </p>
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-4 py-3">
                <h2 className="text-sm font-semibold">Overview guide</h2>
                <p className="text-xs text-gray-500">Customer and project information pulled directly from Sales.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4 text-xs text-gray-600">
                <div><p className="font-semibold text-gray-900">Customer</p><p>Name, contact and email</p></div>
                <div><p className="font-semibold text-gray-900">Project</p><p>Job ID, job name and status</p></div>
                <div><p className="font-semibold text-gray-900">Location</p><p>Customer/project address</p></div>
                <div><p className="font-semibold text-gray-900">Notes</p><p>Sales notes and follow-up notes</p></div>
                <div>
                  <p className="flex items-center gap-1 font-semibold text-gray-900">Site visit<InfoTooltip text={siteVisitTip} /></p>
                  <p>Only "Completed" means the site was actually visited</p>
                </div>
                <div><p className="font-semibold text-gray-900">Images</p><p>Reference, transaction and site-visit photos</p></div>
              </div>
            </section>
          </div>

          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold">Customer & project details</h2>
              <p className="text-xs text-gray-500">Complete Sales record for every customer, including contact details, notes, site-visit status and available sample images.</p>
            </div>
            <div className="divide-y divide-gray-100">
              {jobs.map((job) => {
                const quote = job.latest_quotation_total ?? job.quoted_value ?? 0;
                const imageGroups = [
                  ["Desired sample / reference", job.reference_photos],
                  ["Transaction photos", job.transaction_photos],
                  ["Site visit photos", job.site_visit_photos]
                ] as const;
                return (
                  <article key={job.job_id} className="p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-900">{job.client_name}</h3>
                          <span title="Job / Project ID — the shared identifier used across Sales, Admin, Production and Accounting for this project." className="rounded-md bg-gray-900 px-2 py-1 text-[10px] font-bold tracking-wide text-white">{job.display_job_id}</span>
                          <StatusBadge status={effectivePipelineStage(job)} />
                          <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-600">{followUpLabels[job.follow_up_status]}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{job.job_name || "Untitled project"} · Sales: {job.booked_by_name} · Created {dateOnly(job.created_at)}</p>

                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-lg bg-gray-50 p-3">
                            <p className="text-[10px] uppercase tracking-wide text-gray-400">Contact</p>
                            <p className="mt-1 text-xs font-medium text-gray-900">{job.contact || "No contact number"}</p>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-3">
                            <p className="text-[10px] uppercase tracking-wide text-gray-400">Email</p>
                            <p className="mt-1 break-all text-xs font-medium text-gray-900">{job.email || "No email address"}</p>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-3 md:col-span-2">
                            <p className="text-[10px] uppercase tracking-wide text-gray-400">Customer address / location</p>
                            <p className="mt-1 text-xs font-medium text-gray-900">{job.location || "No address/location provided"}</p>
                          </div>
                        </div>

                        {(job.notes || job.follow_up_note) && (
                          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                            {job.notes && (
                              <div className="rounded-lg border border-gray-200 bg-white p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Project notes</p>
                                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">{job.notes}</p>
                              </div>
                            )}
                            {job.follow_up_note && (
                              <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Follow-up note</p>
                                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-amber-900">{job.follow_up_note}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Always shown — including "Not required" — so a
                          missing or stale site-visit update is never hidden
                          from Admin the way it used to be. */}
                      <div className={`w-full rounded-lg border p-3 xl:w-64 ${job.site_visit_status === "completed" ? "border-emerald-100 bg-emerald-50" : job.site_visit_status === "not_required" ? "border-gray-200 bg-gray-50" : "border-amber-100 bg-amber-50"}`}>
                        <p className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${job.site_visit_status === "completed" ? "text-emerald-700" : job.site_visit_status === "not_required" ? "text-gray-500" : "text-amber-700"}`}>
                          Site visit
                          <InfoTooltip text={siteVisitTip} />
                        </p>
                        <p className={`mt-1 text-xs font-semibold ${job.site_visit_status === "completed" ? "text-emerald-950" : job.site_visit_status === "not_required" ? "text-gray-600" : "text-amber-950"}`}>{siteVisitSummary(job)}</p>
                        {job.site_visit_by && job.site_visit_status === "completed" && <p className="mt-0.5 text-[11px] text-emerald-800">Recorded by team member on file</p>}
                        {job.site_visit_note && <p className="mt-1 whitespace-pre-wrap text-[11px] text-gray-700">{job.site_visit_note}</p>}
                      </div>

                      <div className="grid w-full grid-cols-2 gap-2 xl:w-72">
                        <div className="rounded-lg bg-gray-50 p-2.5"><p className="text-[10px] uppercase text-gray-400">Quote</p><p className="text-sm font-semibold">{money(quote)}</p></div>
                        <div className="rounded-lg bg-gray-50 p-2.5"><p className="flex items-center gap-1 text-[10px] uppercase text-gray-400">Payment plan<InfoTooltip text="What the customer agreed to (terms) — not the same as what has actually been paid (status)." /></p><p className="text-xs font-semibold">{paymentLabel(job.payment_terms)}</p></div>
                        <div className="rounded-lg bg-gray-50 p-2.5"><p className="text-[10px] uppercase text-gray-400">Received</p><p className="text-sm font-semibold">{money(job.total_received)}</p></div>
                        <div className="rounded-lg bg-gray-50 p-2.5"><p className="text-[10px] uppercase text-gray-400">Balance</p><p className="text-sm font-semibold">{money(Math.max(0, quote - job.total_received))}</p></div>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-gray-100 pt-3">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {imageGroups.map(([label, images]) => (
                          <div key={label}>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
                            {images.length === 0 ? (
                              <p className="mt-2 text-[11px] text-gray-300">No images uploaded</p>
                            ) : (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {images.slice(0, 8).map((image) => image.signed_url ? (
                                  <a key={image.attachment_id} href={image.signed_url} target="_blank" rel="noreferrer" title={image.caption || label}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={image.signed_url} alt={image.caption || label} className="h-20 w-20 rounded-lg border border-gray-200 object-cover shadow-sm transition hover:opacity-80" />
                                  </a>
                                ) : null)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                );
              })}
              {jobs.length === 0 && <p className="px-4 py-10 text-center text-sm text-gray-500">No customer projects yet.</p>}
            </div>
          </section>
        </div>
      )}

      {tab === "payments" && (
        <AdminPaymentManager jobs={paymentJobs} />
      )}

      {tab === "customers" && (
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, Job ID, contact, email, sales agent…" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <select value={range} onChange={(e) => setRange(e.target.value)} title="Filter by when the project was created" className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="all">All dates</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} title="Filter by pipeline status" className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="all">All statuses</option>{Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
              <select value={followUp} onChange={(e) => setFollowUp(e.target.value)} title="Filter by Sales' customer follow-up status" className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="all">All follow-ups</option>{Object.entries(followUpLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
              <select value={siteVisitFilter} onChange={(e) => setSiteVisitFilter(e.target.value)} title="Filter by explicit site-visit status" className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="all">All site visits</option>
                <option value="not_required">Not required</option>
                <option value="not_recorded">Not yet recorded</option>
                <option value="scheduled">Scheduled</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} title="Filter by payment status" className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="all">All payments</option><option value="awaiting_deposit">Awaiting 50% deposit</option><option value="deposit_received">Deposit received</option><option value="full_on_completion">Full on completion</option><option value="full_on_installation">Full on installation</option><option value="custom">Custom schedule</option><option value="balance_due">Balance due</option><option value="fully_paid">Fully paid</option></select>
            </div>
            <p className="mt-2 text-xs text-gray-400">Showing {filtered.length} of {jobs.length} projects · every record carries its Project/Job ID · {metrics.siteVisitsPending} site visit(s) awaiting action.</p>
          </div>

          <div className="divide-y divide-gray-100">
            {filtered.map((job) => {
              const quote = job.latest_quotation_total ?? job.quoted_value ?? 0;
              return (
                <div key={job.job_id} className="p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{job.client_name}</p>
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-700">{job.display_job_id}</span>
                        <StatusBadge status={effectivePipelineStage(job)} />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{job.job_name || "Untitled project"} · Sales: {job.booked_by_name} · Created {dateOnly(job.created_at)}</p>
                      <p className="mt-1 text-xs text-gray-500">{job.contact || "No contact"}{job.location ? ` · ${job.location}` : ""}</p>
                      <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${siteVisitChipClass(job.site_visit_status)}`}>{siteVisitSummary(job)}</p>
                      {job.follow_up_note && <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">{job.follow_up_note}</p>}
                      {job.notes && <p className="mt-2 whitespace-pre-wrap border-l-2 border-gray-200 pl-3 text-xs text-gray-600">{job.notes}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <CustomerStatusEditor jobId={job.job_id} status={job.follow_up_status} note={job.follow_up_note} />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div className="rounded-lg bg-gray-50 p-2.5"><p className="text-[10px] uppercase text-gray-400">Quote</p><p className="text-sm font-semibold">{money(quote)}</p></div>
                    <div className="rounded-lg bg-gray-50 p-2.5"><p className="text-[10px] uppercase text-gray-400">Payment plan</p><p className="text-xs font-semibold">{paymentLabel(job.payment_terms)}</p></div>
                    <div className="rounded-lg bg-gray-50 p-2.5"><p className="text-[10px] uppercase text-gray-400">Received</p><p className="text-sm font-semibold">{money(job.total_received)}</p></div>
                    <div className="rounded-lg bg-gray-50 p-2.5"><p className="text-[10px] uppercase text-gray-400">Balance</p><p className="text-sm font-semibold">{money(Math.max(0, quote - job.total_received))}</p></div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="px-4 py-10 text-center text-sm text-gray-500">No projects match these filters.</p>}
          </div>
        </section>
      )}

      {tab === "pipeline" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-400">Site visits scheduled / rescheduled<InfoTooltip text="Visits with a date on the books that have not happened yet, or that had to be moved." /></p><p className="mt-1 text-2xl font-semibold">{jobs.filter((j) => ["scheduled", "rescheduled"].includes(j.site_visit_status)).length}</p></div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm"><p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-600">Site visits completed<InfoTooltip text={siteVisitTip} /></p><p className="mt-1 text-2xl font-semibold text-emerald-950">{metrics.siteVisitsCompleted}</p></div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 shadow-sm"><p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-blue-600">Customer approvals<InfoTooltip text="Counts jobs.status = approved OR Sales' follow_up_status = approved — either signal is treated as customer approval." /></p><p className="mt-1 text-2xl font-semibold text-blue-950">{metrics.approvedCustomers}</p></div>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[1500px] grid-cols-7 gap-3">
              {(["lead", "site_visit", "design_review", "quoted", "approved", "in_production", "installed"] as JobStatus[]).map((stage) => {
                const rows = jobs.filter((j) => effectivePipelineStage(j) === stage);
                return <section key={stage} className={`min-h-52 rounded-xl border bg-white shadow-sm ${stage === "approved" ? "border-emerald-200 ring-1 ring-emerald-100" : "border-gray-200"}`}>
                  <div className="border-b border-gray-200 px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{statusLabels[stage]}</p>
                    <p className="text-lg font-semibold">{rows.length}</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {rows.map((job) => <div key={job.job_id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">{job.client_name}</p>
                          <p className="text-[10px] font-bold text-gray-400">{job.display_job_id}</p>
                        </div>
                        {job.follow_up_status === "approved" && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">Customer approved</span>}
                      </div>
                      <p className="mt-1 text-[10px] text-gray-500">{job.job_name || "Untitled project"}</p>
                      {stage === "site_visit" && <p className={`mt-2 text-[10px] font-medium ${job.site_visit_status === "completed" ? "text-emerald-700" : "text-amber-700"}`}>{siteVisitSummary(job)}</p>}
                      {stage === "approved" && <p className="mt-2 text-[10px] text-gray-500">{job.payment_terms === "50_50" ? (job.deposit_received > 0 ? "Deposit received" : "50% deposit pending") : siteVisitSummary(job)}</p>}
                    </div>)}
                    {rows.length === 0 && <p className="p-3 text-[10px] text-gray-300">No projects</p>}
                  </div>
                </section>;
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "approvals" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[
            { title: "Quotation approval", tip: "Quotations sent to the customer that are still awaiting a decision.", rows: jobs.filter((j) => j.status === "quoted") },
            { title: "Customer approval", tip: "Approved via job status or Sales' follow-up status — the signal Production waits on before starting a Job Order.", rows: jobs.filter((j) => effectivePipelineStage(j) === "approved") },
            { title: "Design approval", tip: "Design revisions waiting on customer sign-off before production can use them.", rows: jobs.filter((j) => j.latest_design_status === "pending") },
            { title: "Job order creation", tip: "Customer has approved but no Job Order exists yet — these are ready to move into Production.", rows: jobs.filter((j) => effectivePipelineStage(j) === "approved" && !j.job_order_status) },
            { title: "Follow-up", tip: "Customers Sales has explicitly flagged as needing a follow-up.", rows: jobs.filter((j) => j.follow_up_status === "follow_up") }
          ].map(({ title, tip, rows }) => (
            <section key={title} className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-4 py-3">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">{title}<InfoTooltip text={tip} /></h2>
                <p className="text-xs text-gray-500">{rows.length} item(s)</p>
              </div>
              {rows.length === 0 && <p className="px-4 py-6 text-xs text-gray-400">Nothing here right now.</p>}
              {rows.slice(0, 10).map((job) => (
                <div key={job.job_id} className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{job.client_name}</p>
                    <p className="text-xs text-gray-500">{job.display_job_id} · {job.job_name || "Untitled project"}</p>
                  </div>
                  <StatusBadge status={effectivePipelineStage(job)} />
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
