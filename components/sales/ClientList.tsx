"use client";

import { useState } from "react";
import { CustomerStatusEditor } from "@/components/shared/CustomerStatusEditor";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { AttachmentGallery } from "@/components/shared/AttachmentGallery";
import { EditJobDetails } from "@/components/sales/EditJobDetails";
import { QuotationList } from "@/components/shared/QuotationList";
import { SiteVisitEditor } from "@/components/sales/SiteVisitEditor";
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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

// Sales only ever sees jobs where booked_by = them — enforced by RLS,
// so this component doesn't need to filter, just render what it's given.
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

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center">
        <p className="text-sm text-gray-500">No clients yet — add one above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {jobs.map((job, index) => {
        const cardBackgrounds = [
          "bg-sky-50/95 ring-sky-200/80",
          "bg-violet-50/95 ring-violet-200/80",
          "bg-amber-50/95 ring-amber-200/80",
          "bg-emerald-50/95 ring-emerald-200/80",
          "bg-rose-50/95 ring-rose-200/80",
          "bg-cyan-50/95 ring-cyan-200/80"
        ];

        return (
        <div
          key={job.job_id}
          className={`crm-card-pattern relative overflow-hidden rounded-2xl p-3.5 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md sm:p-4 ${cardBackgrounds[index % cardBackgrounds.length]}`}
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full border-[10px] border-white/35" />
          <div aria-hidden="true" className="pointer-events-none absolute bottom-2 right-3 h-8 w-8 rotate-45 rounded-lg bg-white/25" />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {job.job_name || job.client_name}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {job.client_name}
                {job.contact && <span className="text-gray-300"> · </span>}
                {job.contact}
                {job.email && <span className="text-gray-300"> · </span>}
                {job.email}
                {job.location && <span className="text-gray-300"> · </span>}
                {job.location}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-gray-900 px-2 py-1 text-[10px] font-bold tracking-wide text-white">
                  {job.quotations[0]?.project_job_id ?? `JOB-${job.job_id.slice(0, 8).toUpperCase()}`}
                </span>
                <p className="text-xs font-medium text-gray-600">
                  {job.quoted_value ? `₱${job.quoted_value.toLocaleString()}` : "No quote yet"}
                </p>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                Saved {formatDateTime(job.created_at)}
                {job.updated_at && job.updated_at !== job.created_at && (
                  <> · Updated {formatDateTime(job.updated_at)}</>
                )}
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
              <CustomerStatusEditor
                jobId={job.job_id}
                status={job.follow_up_status}
                note={job.follow_up_note}
              />
              <button
                onClick={() => setEditingJobId(editingJobId === job.job_id ? null : job.job_id)}
                className="touch-target rounded-lg border border-gray-300/80 bg-white/70 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-white"
              >
                Edit
              </button>
            </div>
          </div>

          {job.follow_up_status === "other" && job.follow_up_note && (
            <p className="mt-2 rounded-md bg-purple-50 px-2.5 py-1.5 text-xs text-purple-700">
              {job.follow_up_note}
            </p>
          )}

          {job.notes && (
            <p className="mt-3 whitespace-pre-wrap border-l-2 border-gray-200 pl-3 text-xs leading-relaxed text-gray-600">
              {job.notes}
            </p>
          )}

          {editingJobId === job.job_id && (
            <EditJobDetails
              job={{
                job_id: job.job_id,
                client_id: job.client_id,
                client_name: job.client_name,
                contact: job.contact,
                email: job.email,
                location: job.location,
                job_name: job.job_name,
                notes: job.notes
              }}
              onClose={() => setEditingJobId(null)}
            />
          )}

          {/* Always rendered — even for jobs originally marked "no site visit
              needed" — so Sales can still flip the status and record a visit
              later. Previously this was gated on job.needs_site_visit, which
              meant a visit recorded outside that initial flag never showed
              up anywhere, including in Admin. */}
          <SiteVisitEditor
            jobId={job.job_id}
            agentId={agentId}
            status={job.site_visit_status}
            date={job.site_visit_date}
            note={job.site_visit_note}
          />

          <div className="mt-3 flex flex-wrap gap-2 border-t border-black/5 pt-3">
            <ImageUpload jobId={job.job_id} category="transaction" uploadedBy={agentId} />
            <ImageUpload jobId={job.job_id} category="site_visit" uploadedBy={agentId} />
            <ImageUpload jobId={job.job_id} category="reference" uploadedBy={agentId} />
          </div>

          {job.reference_photos.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Desired sample / reference
              </p>
              <AttachmentGallery attachments={job.reference_photos} />
            </div>
          )}

          {/* Transaction photo and site photo shown side by side, not stacked */}
          {(job.transaction_photos.length > 0 || job.site_visit_photos.length > 0) && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Transaction photos
                </p>
                {job.transaction_photos.length > 0 ? (
                  <AttachmentGallery attachments={job.transaction_photos} />
                ) : (
                  <p className="mt-1 text-[11px] text-gray-300">None yet</p>
                )}
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Site visit photos
                </p>
                {job.site_visit_photos.length > 0 ? (
                  <AttachmentGallery attachments={job.site_visit_photos} />
                ) : (
                  <p className="mt-1 text-[11px] text-gray-300">None yet</p>
                )}
              </div>
            </div>
          )}

          <QuotationList
            quotations={job.quotations}
            settings={quotationSettings}
            defaultEmail={job.email}
          />
        </div>
        );
      })}
    </div>
  );
}
