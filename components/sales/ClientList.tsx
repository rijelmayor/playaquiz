"use client";

import { useState, useEffect, useMemo } from "react";
import { CustomerStatusEditor } from "@/components/shared/CustomerStatusEditor";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { AttachmentGallery } from "@/components/shared/AttachmentGallery";
import { EditJobDetails } from "@/components/sales/EditJobDetails";
import { QuotationList } from "@/components/shared/QuotationList";
import { QuotationCreateForm } from "@/components/shared/QuotationCreateForm";
import { SiteVisitEditor } from "@/components/sales/SiteVisitEditor";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { QuotationForDocument } from "@/components/shared/QuotationDocumentActions";
import type { Job, QuotationSettings, SiteVisitStatus } from "@/lib/types/database";

type JobWithExtras = Job & {
  client_name: string;
  contact: string | null;
  email: string | null;
  location: string | null;
  transaction_photos: { attachment_id: string; signed_url: string | null }[];
  site_visit_photos: { attachment_id: string; signed_url: string | null }[];
  reference_photos: { attachment_id: string; signed_url: string | null }[];
  quotations: QuotationForDocument[];
  site_visit_status: SiteVisitStatus;
  site_visit_date: string | null;
  site_visit_by: string | null;
  site_visit_note: string | null;
};

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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function jobIdLabel(job: JobWithExtras) {
  return (
    job.quotations[0]?.project_job_id ??
    `JOB-${job.job_id.slice(0, 8).toUpperCase()}`
  );
}

function projectName(job: JobWithExtras) {
  return job.job_name || job.client_name || "—";
}

export function ClientList({
  jobs,
  agentId,
  quotationSettings
}: {
  jobs: JobWithExtras[];
  agentId: string;
  quotationSettings: QuotationSettings | null;
}) {
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter !== "all" && job.status !== statusFilter) return false;
      if (!q) return true;
      return [
        jobIdLabel(job),
        job.client_name,
        job.job_name,
        job.contact,
        job.email,
        job.location
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [jobs, search, statusFilter]);

  if (jobs.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-sky-200 bg-gradient-to-br from-sky-50/80 to-white px-4 py-14 text-center shadow-sm">
        <p className="text-3xl">🎯</p>
        <p className="mt-3 text-sm font-semibold text-gray-800">
          No leads yet — time to hunt!
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Hit + Add client above to log your first prospect.
        </p>
      </div>
    );
  }

  const needsQuote =
    detailJob && ["site_visit", "design_review"].includes(detailJob.status)
      ? [
          {
            job_id: detailJob.job_id,
            client_name: detailJob.client_name,
            next_version: (detailJob.quotations?.length ?? 0) + 1
          }
        ]
      : [];

  return (
    <>
      {/* Search + filter bar */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            🔍
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job, client, contact…"
            className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm"
        >
          <option value="all">All statuses</option>
          <option value="lead">🌱 Lead</option>
          <option value="site_visit">📍 Site visit</option>
          <option value="design_review">✏️ Design review</option>
          <option value="quoted">📄 Quoted</option>
          <option value="approved">✅ Approved</option>
          <option value="in_production">⚙️ In production</option>
          <option value="installed">🏗️ Installed</option>
          <option value="paid">💰 Paid</option>
          <option value="closed">🔒 Closed</option>
        </select>
        <p className="text-xs text-gray-400 sm:ml-1">
          {filtered.length} of {jobs.length}
        </p>
      </div>

      {/* Interactive client table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gradient-to-r from-slate-50 to-sky-50/50">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Job ID
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Project
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Open
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((job) => (
                <tr
                  key={job.job_id}
                  onClick={() => {
                    setDetailJobId(job.job_id);
                    setEditingJobId(null);
                  }}
                  className="cursor-pointer transition hover:bg-sky-50/70 active:bg-sky-100/60"
                >
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-2 py-1 text-[11px] font-bold tracking-wide text-white shadow-sm">
                      <span className="text-sm leading-none">
                        {STATUS_ICONS[job.status] ?? "•"}
                      </span>
                      {jobIdLabel(job)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">
                      {projectName(job)}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {job.client_name}
                      {job.contact ? ` · ${job.contact}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={job.status} />
                    {job.follow_up_status === "follow_up" && (
                      <span className="ml-1.5 inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">
                        🔔 Follow up
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailJobId(job.job_id);
                        setEditingJobId(null);
                      }}
                      className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 shadow-sm transition hover:border-sky-600 hover:bg-sky-600 hover:text-white active:scale-95"
                    >
                      Open →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-gray-500">
            No clients match these filters.
          </p>
        )}
      </div>

      {/* Detail modal */}
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
            aria-labelledby="client-detail-title"
            className="relative z-10 my-2 w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-gray-200"
          >
            {/* Colorful header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-violet-50 px-4 py-3.5 backdrop-blur sm:px-5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-md ring-1 ring-sky-100">
                  {STATUS_ICONS[detailJob.status] ?? "📋"}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-sky-600/80">
                    {jobIdLabel(detailJob)}
                  </p>
                  <h2
                    id="client-detail-title"
                    className="truncate text-base font-bold text-gray-900 sm:text-lg"
                  >
                    {projectName(detailJob)}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {detailJob.client_name}
                    {detailJob.contact && (
                      <span className="text-gray-300"> · </span>
                    )}
                    {detailJob.contact}
                    {detailJob.email && (
                      <span className="text-gray-300"> · </span>
                    )}
                    {detailJob.email}
                    {detailJob.location && (
                      <span className="text-gray-300"> · </span>
                    )}
                    {detailJob.location}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={detailJob.status} />
                <button
                  type="button"
                  onClick={() => setDetailJobId(null)}
                  className="rounded-xl p-1.5 text-gray-400 transition hover:bg-white hover:text-gray-700 hover:shadow-sm"
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
              {/* Quick stats */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">
                    Quote
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-gray-900">
                    {detailJob.quoted_value != null
                      ? `₱${detailJob.quoted_value.toLocaleString()}`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-sky-50 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-sky-600">
                    Saved
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-sky-900">
                    {formatDateTime(detailJob.created_at).split(",")[0]}
                  </p>
                </div>
                <div className="col-span-2 rounded-xl bg-violet-50 p-3 sm:col-span-1">
                  <p className="text-[10px] uppercase tracking-wide text-violet-600">
                    Quotes
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-violet-900">
                    {detailJob.quotations?.length ?? 0}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-gray-400">
                  {detailJob.updated_at &&
                    detailJob.updated_at !== detailJob.created_at && (
                      <>Updated {formatDateTime(detailJob.updated_at)}</>
                    )}
                </p>
                <CustomerStatusEditor
                  jobId={detailJob.job_id}
                  status={detailJob.follow_up_status}
                  note={detailJob.follow_up_note}
                />
              </div>

              {detailJob.follow_up_status === "other" &&
                detailJob.follow_up_note && (
                  <p className="rounded-xl bg-purple-50 px-3 py-2 text-xs text-purple-700 ring-1 ring-purple-100">
                    {detailJob.follow_up_note}
                  </p>
                )}

              {detailJob.notes && (
                <p className="whitespace-pre-wrap rounded-xl border-l-4 border-sky-300 bg-sky-50/50 py-2 pl-3 pr-2 text-xs leading-relaxed text-gray-700">
                  {detailJob.notes}
                </p>
              )}

              {/* Edit details */}
              <div>
                <button
                  type="button"
                  onClick={() =>
                    setEditingJobId(
                      editingJobId === detailJob.job_id
                        ? null
                        : detailJob.job_id
                    )
                  }
                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm transition hover:border-gray-900 hover:bg-gray-900 hover:text-white active:scale-95"
                >
                  {editingJobId === detailJob.job_id
                    ? "Hide details form"
                    : "✏️ Edit client & job details"}
                </button>
                {editingJobId === detailJob.job_id && (
                  <EditJobDetails
                    job={{
                      job_id: detailJob.job_id,
                      client_id: detailJob.client_id,
                      client_name: detailJob.client_name,
                      contact: detailJob.contact,
                      email: detailJob.email,
                      location: detailJob.location,
                      job_name: detailJob.job_name,
                      notes: detailJob.notes
                    }}
                    onClose={() => setEditingJobId(null)}
                  />
                )}
              </div>

              {/* Site visit */}
              <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-3">
                <p className="mb-2 text-xs font-bold text-amber-800">
                  📍 Site visit
                </p>
                <SiteVisitEditor
                  jobId={detailJob.job_id}
                  agentId={agentId}
                  status={detailJob.site_visit_status}
                  date={detailJob.site_visit_date}
                  note={detailJob.site_visit_note}
                />
              </div>

              {/* Photos */}
              <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                <p className="mb-2 text-xs font-bold text-gray-800">
                  📷 Photos
                </p>
                <div className="flex flex-wrap gap-2">
                  <ImageUpload
                    jobId={detailJob.job_id}
                    category="transaction"
                    uploadedBy={agentId}
                  />
                  <ImageUpload
                    jobId={detailJob.job_id}
                    category="site_visit"
                    uploadedBy={agentId}
                  />
                  <ImageUpload
                    jobId={detailJob.job_id}
                    category="reference"
                    uploadedBy={agentId}
                  />
                </div>

                {detailJob.reference_photos.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Sample mock up
                    </p>
                    <AttachmentGallery
                      attachments={detailJob.reference_photos}
                      jobId={detailJob.job_id}
                      category="reference"
                      uploadedBy={agentId}
                      editable
                    />
                  </div>
                )}

                {(detailJob.transaction_photos.length > 0 ||
                  detailJob.site_visit_photos.length > 0) && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        Transaction photos
                      </p>
                      {detailJob.transaction_photos.length > 0 ? (
                        <AttachmentGallery
                          attachments={detailJob.transaction_photos}
                          jobId={detailJob.job_id}
                          category="transaction"
                          uploadedBy={agentId}
                          editable
                        />
                      ) : (
                        <p className="mt-1 text-[11px] text-gray-300">
                          None yet
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        Site visit photos
                      </p>
                      {detailJob.site_visit_photos.length > 0 ? (
                        <AttachmentGallery
                          attachments={detailJob.site_visit_photos}
                          jobId={detailJob.job_id}
                          category="site_visit"
                          uploadedBy={agentId}
                          editable
                        />
                      ) : (
                        <p className="mt-1 text-[11px] text-gray-300">
                          None yet
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Quotations */}
              <QuotationList
                quotations={detailJob.quotations}
                settings={quotationSettings}
                defaultEmail={detailJob.email}
                mockupUrls={detailJob.reference_photos.map((p) => p.signed_url)}
              />

              {needsQuote.length > 0 && (
                <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-3">
                  <p className="mb-2 text-xs font-bold text-violet-800">
                    📄 Create quotation
                  </p>
                  <QuotationCreateForm
                    rows={needsQuote}
                    settings={quotationSettings}
                    createdBy={agentId}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
