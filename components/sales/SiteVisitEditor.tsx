"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import type { SiteVisitStatus } from "@/lib/types/database";

const statusOptions: { value: SiteVisitStatus; label: string }[] = [
  { value: "not_required", label: "Not required for this project" },
  { value: "not_recorded", label: "Required — not recorded yet" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed — customer visited" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "cancelled", label: "Cancelled" }
];

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function SiteVisitEditor({
  jobId,
  agentId,
  status,
  date,
  note
}: {
  jobId: string;
  agentId: string;
  status: SiteVisitStatus;
  date: string | null;
  note: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [visitStatus, setVisitStatus] = useState<SiteVisitStatus>(status);
  const [visitDate, setVisitDate] = useState(toLocalInput(date));
  const [visitNote, setVisitNote] = useState(note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function save() {
    setSaving(true);
    setError(null);
    const dateValue = visitStatus === "not_required" ? null : visitDate ? new Date(visitDate).toISOString() : null;
    if (visitStatus === "completed" && !dateValue) {
      setError("Enter the actual site-visit date and time before marking the visit completed.");
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.from("jobs").update({
      site_visit_status: visitStatus,
      // needs_site_visit is also kept in sync by a database trigger — set it
      // here too so the UI reflects the change immediately without waiting
      // on a round-trip re-read.
      needs_site_visit: visitStatus !== "not_required",
      site_visit_date: dateValue,
      site_visit_by: visitStatus === "completed" ? agentId : null,
      site_visit_note: visitStatus === "not_required" ? null : (visitNote.trim() || null)
    }).eq("job_id", jobId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setOpen(false);
    setSaving(false);
    router.refresh();
  }

  const label = visitStatus === "completed"
    ? "✓ Site visit completed"
    : visitStatus === "not_recorded"
      ? "Site visit not yet recorded"
      : visitStatus === "scheduled"
      ? "◷ Site visit scheduled"
      : visitStatus === "rescheduled"
        ? "↻ Site visit rescheduled"
        : visitStatus === "cancelled"
          ? "Site visit cancelled"
          : "Not required for this project";

  const isRequired = visitStatus !== "not_required";
  const wrapClass = isRequired
    ? "mt-3 rounded-lg border border-amber-100 bg-amber-50/70 p-3"
    : "mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3";
  const eyebrowClass = isRequired ? "text-amber-700" : "text-gray-500";
  const labelClass = isRequired ? "text-amber-950" : "text-gray-700";
  const buttonClass = isRequired
    ? "rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50"
    : "rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100";

  return (
    <div className={wrapClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${eyebrowClass}`}>
            Site visit
            <InfoTooltip text="Only marked Completed once you explicitly record the visit here. Uploading a photo, or the customer approving, does not count as a completed visit." />
          </p>
          <p className={`mt-0.5 text-xs font-semibold ${labelClass}`}>{label}</p>
          {visitDate && isRequired && <p className="mt-0.5 text-[11px] text-amber-800">{new Date(visitDate).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</p>}
        </div>
        <button onClick={() => setOpen(!open)} className={buttonClass}>
          {open ? "Close" : "Update visit"}
        </button>
      </div>

      {open && (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-black/5 pt-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-700">Visit status</label>
            <select value={visitStatus} onChange={(e) => setVisitStatus(e.target.value as SiteVisitStatus)} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs">
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-700">Visit date & time</label>
            <input type="datetime-local" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} disabled={visitStatus === "not_required"} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs disabled:bg-gray-100 disabled:text-gray-400" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[11px] font-medium text-gray-700">Visit notes</label>
            <textarea value={visitNote} onChange={(e) => setVisitNote(e.target.value)} rows={2} disabled={visitStatus === "not_required"} placeholder="What was observed or agreed on site?" className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs disabled:bg-gray-100 disabled:text-gray-400" />
          </div>
          {error && <p className="sm:col-span-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div className="sm:col-span-2 flex justify-end">
            <button onClick={save} disabled={saving} className="rounded-md bg-gray-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {saving ? "Saving…" : "Save site visit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
