"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { AttachmentGallery } from "@/components/shared/AttachmentGallery";
import { jobControlMeta } from "@/lib/workflow/jobControl";
import { StatusBadge } from "@/components/shared/StatusBadge";

const PRODUCTION_STAGES = [
  "materials",
  "fabrication",
  "printing",
  "finishing",
  "electrical",
  "assembly",
  "qc",
  "ready_for_delivery",
  "installation",
  "completed"
] as const;

const STAGE_ICONS: Record<string, string> = {
  materials: "📦",
  fabrication: "🔨",
  printing: "🖨️",
  finishing: "🎨",
  electrical: "⚡",
  assembly: "🔧",
  qc: "🔍",
  ready_for_delivery: "🚚",
  installation: "🏗️",
  completed: "🏆",
  on_hold: "⏸️"
};

const PARENT_JOB_STATUSES = [
  "approved",
  "in_production",
  "installed",
  "paid",
  "closed",
  "cancelled"
] as const;

export interface AdminJobOrderDetailRow {
  job_order_id: string;
  job_id: string;
  client_name: string;
  job_name: string | null;
  fabricator_name: string | null;
  status: string;
  job_status: string;
  job_value: number;
  production_stage: string;
  deadline: string | null;
  material_summary: { total: number; completed: number; shortages: number };
  pending_material_requests: number;
  latest_qc: { result: string; rework_required: boolean; inspected_at: string } | null;
  latest_installation: {
    installation_id: string;
    status: string;
    verified: boolean;
    scheduled_date: string | null;
  } | null;
  stage_history: {
    history_id: string;
    from_stage: string | null;
    to_stage: string;
    changed_at: string;
    note: string | null;
  }[];
  quantity: number | null;
  priority: string;
  order_description: string | null;
  dimensions: string | null;
  specifications: string | null;
  installation_notes: string | null;
  production_notes: string | null;
  approved_design: {
    attachment_id: string;
    signed_url: string | null;
    caption?: string | null;
  }[];
  order_reference: {
    attachment_id: string;
    signed_url: string | null;
    caption?: string | null;
  }[];
}

export function JobOrderDetailManager({
  rows,
  adminId
}: {
  rows: AdminJobOrderDetailRow[];
  adminId: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<AdminJobOrderDetailRow>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [overrideNote, setOverrideNote] = useState<Record<string, string>>({});
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  function draft(row: AdminJobOrderDetailRow) {
    return { ...row, ...(drafts[row.job_order_id] ?? {}) };
  }

  async function verifyInstallation(row: AdminJobOrderDetailRow, verified: boolean) {
    if (!row.latest_installation?.installation_id) return;
    setSaving(row.job_order_id);
    const { error } = await supabase
      .from("job_order_installations")
      .update({ verified, updated_at: new Date().toISOString() })
      .eq("installation_id", row.latest_installation.installation_id);
    setSaving(null);
    if (!error) router.refresh();
  }

  async function syncParentJobStatus(row: AdminJobOrderDetailRow) {
    if (!row.job_id || row.job_status !== "in_production" || row.production_stage !== "completed")
      return;
    setSaving(row.job_order_id);
    const { error } = await supabase
      .from("jobs")
      .update({ status: "installed" })
      .eq("job_id", row.job_id);
    setSaving(null);
    if (!error) router.refresh();
  }

  async function completeProduction(row: AdminJobOrderDetailRow) {
    const qcPassed = row.latest_qc?.result === "pass" && !row.latest_qc?.rework_required;
    const installationReady =
      row.latest_installation?.status === "completed" && row.latest_installation?.verified;
    const materialsReady =
      row.material_summary.total === 0 ||
      (row.material_summary.shortages === 0 &&
        row.material_summary.completed === row.material_summary.total);
    const requestsResolved = row.pending_material_requests === 0;
    if (!qcPassed || !installationReady || !materialsReady || !requestsResolved) return;
    setSaving(row.job_order_id);
    const { error } = await supabase
      .from("job_orders")
      .update({
        production_stage: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("job_order_id", row.job_order_id);
    if (!error) {
      await supabase
        .from("jobs")
        .update({ status: "installed" })
        .eq("job_id", row.job_id)
        .in("status", ["in_production", "approved"]);
    }
    setSaving(null);
    if (!error) router.refresh();
  }

  /** Admin override: jump to any production stage without gates. */
  async function overrideStage(row: AdminJobOrderDetailRow, nextStage: string) {
    if (saving) return;
    const note =
      overrideNote[row.job_order_id]?.trim() ||
      `Admin override → ${nextStage.replaceAll("_", " ")}`;
    if (
      !confirm(
        `Override production stage to "${nextStage.replaceAll("_", " ")}"?\n\nThis skips normal process gates. Stage history will still be recorded.`
      )
    ) {
      return;
    }
    setSaving(row.job_order_id);
    setOverrideError(null);
    const patch: Record<string, unknown> = {
      production_stage: nextStage,
      hold_reason: nextStage === "on_hold" ? note : null
    };
    if (nextStage === "completed") {
      patch.completed_at = new Date().toISOString();
    }
    if (nextStage !== "materials" && nextStage !== "on_hold") {
      // ensure started_at is set if jumping past start
      patch.started_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("job_orders")
      .update(patch)
      .eq("job_order_id", row.job_order_id);

    if (error) {
      setOverrideError(error.message);
      setSaving(null);
      return;
    }

    // Sync parent job when completing via override
    if (nextStage === "completed") {
      await supabase
        .from("jobs")
        .update({ status: "installed" })
        .eq("job_id", row.job_id)
        .in("status", ["in_production", "approved"]);
    }

    // Optional: write explicit note into stage history if trigger doesn't capture note
    // (DB trigger logs from/to; we also insert a note row for audit clarity)
    try {
      await supabase.from("job_order_stage_history").insert({
        job_order_id: row.job_order_id,
        from_stage: row.production_stage,
        to_stage: nextStage,
        note: `[ADMIN OVERRIDE] ${note}`,
        changed_by: adminId || null
      });
    } catch {
      // trigger may already have logged the change; ignore duplicate/policy noise
    }

    setSaving(null);
    setOverrideNote((s) => ({ ...s, [row.job_order_id]: "" }));
    router.refresh();
  }

  /** Admin override parent jobs.status (e.g. force installed / paid / closed). */
  async function overrideParentJobStatus(row: AdminJobOrderDetailRow, status: string) {
    if (saving) return;
    if (
      !confirm(
        `Override parent job status to "${status.replaceAll("_", " ")}"?\n\nUse this when the pipeline is stuck or a stage was skipped on purpose.`
      )
    ) {
      return;
    }
    setSaving(row.job_order_id);
    setOverrideError(null);
    const { error } = await supabase
      .from("jobs")
      .update({ status })
      .eq("job_id", row.job_id);
    if (error) {
      setOverrideError(error.message);
      setSaving(null);
      return;
    }
    setSaving(null);
    router.refresh();
  }

  async function save(row: AdminJobOrderDetailRow) {
    const d = draft(row);
    setSaving(row.job_order_id);
    await supabase
      .from("job_orders")
      .update({
        order_description: d.order_description || null,
        dimensions: d.dimensions || null,
        quantity:
          d.quantity == null || (d.quantity as any) === "" ? 1 : Number(d.quantity),
        specifications: d.specifications || null,
        installation_notes: d.installation_notes || null,
        production_notes: d.production_notes || null,
        priority: d.priority || "normal",
        deadline: d.deadline || null
      })
      .eq("job_order_id", row.job_order_id);
    setSaving(null);
    router.refresh();
  }

  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <p className="text-sm font-semibold">Production job-order brief</p>
        <p className="text-xs text-gray-500">
          Admin completes the production brief and can override stages when the
          normal process is not needed.
        </p>
      </div>
      {rows.map((row) => {
        const d = draft(row);
        const isOpen = open === row.job_order_id;
        return (
          <div key={row.job_order_id} className="border-b border-gray-100 last:border-0">
            <button
              onClick={() => setOpen(isOpen ? null : row.job_order_id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{row.client_name}</p>
                <p className="truncate text-xs text-gray-500">
                  {row.job_name || "Untitled project"} ·{" "}
                  {row.job_order_id.slice(0, 8).toUpperCase()} ·{" "}
                  {row.fabricator_name || "Unassigned"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={row.production_stage} />
                <span
                  className={`rounded-full border px-2 py-1 text-[9px] font-bold ${jobControlMeta(row.job_value).badge}`}
                >
                  {jobControlMeta(row.job_value).shortLabel}
                </span>
                <span className="text-xs text-gray-400">
                  {isOpen ? "Hide" : "Details"}
                </span>
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-gray-100 bg-gray-50/50 p-4">
                {/* Production status + gates */}
                <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Production status
                      </p>
                      <p className="mt-1 text-sm font-semibold capitalize">
                        {row.production_stage.replaceAll("_", " ")}
                      </p>
                    </div>
                    <StatusBadge status={row.production_stage} />
                  </div>

                  {/* Read-only progress chips */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {PRODUCTION_STAGES.map((stage, index) => (
                      <span
                        key={stage}
                        className={`rounded-full border px-2 py-1 text-[9px] font-semibold capitalize ${
                          row.production_stage === stage
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 bg-gray-50 text-gray-500"
                        }`}
                      >
                        {index + 1}. {stage.replaceAll("_", " ")}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-5">
                    <ProductionCheck
                      label="Materials"
                      ok={
                        row.material_summary.total > 0
                          ? row.material_summary.shortages === 0 &&
                            row.material_summary.completed ===
                              row.material_summary.total
                          : row.production_stage !== "materials"
                      }
                      value={
                        row.material_summary.total
                          ? `${row.material_summary.completed}/${row.material_summary.total} ready${
                              row.material_summary.shortages
                                ? ` · ${row.material_summary.shortages} shortage`
                                : ""
                            }`
                          : "No material lines"
                      }
                    />
                    <ProductionCheck
                      label="QC"
                      ok={
                        row.latest_qc?.result === "pass" &&
                        !row.latest_qc?.rework_required
                      }
                      value={
                        row.latest_qc
                          ? `${row.latest_qc.result}${
                              row.latest_qc.rework_required ? " · rework" : ""
                            }`
                          : "Not recorded"
                      }
                    />
                    <ProductionCheck
                      label="Installation"
                      ok={
                        row.latest_installation?.status === "completed" &&
                        row.latest_installation.verified
                      }
                      value={
                        row.latest_installation
                          ? `${row.latest_installation.status}${
                              row.latest_installation.verified
                                ? " · verified"
                                : " · unverified"
                            }`
                          : "Not recorded"
                      }
                    />
                    {row.latest_installation?.status === "completed" && (
                      <button
                        onClick={() =>
                          verifyInstallation(
                            row,
                            !row.latest_installation?.verified
                          )
                        }
                        disabled={saving === row.job_order_id}
                        className="rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-[10px] font-semibold text-gray-700 hover:border-gray-500 disabled:opacity-50"
                      >
                        {row.latest_installation.verified
                          ? "Remove verification"
                          : "Verify installation"}
                      </button>
                    )}
                    <ProductionCheck
                      label="Material requests"
                      ok={row.pending_material_requests === 0}
                      value={
                        row.pending_material_requests
                          ? `${row.pending_material_requests} pending`
                          : "Resolved"
                      }
                    />
                    <ProductionCheck
                      label="Completion"
                      ok={row.production_stage === "completed"}
                      value={
                        row.production_stage === "completed"
                          ? "Production complete"
                          : "Still in production"
                      }
                    />
                    {row.production_stage === "completed" &&
                      row.job_status === "in_production" && (
                        <button
                          onClick={() => syncParentJobStatus(row)}
                          disabled={saving === row.job_order_id}
                          className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-2 text-[10px] font-semibold text-blue-800 disabled:opacity-50"
                        >
                          {saving === row.job_order_id
                            ? "Syncing…"
                            : "Sync job status"}
                        </button>
                      )}
                  </div>

                  {row.production_stage !== "completed" &&
                    (() => {
                      const qcPassed =
                        row.latest_qc?.result === "pass" &&
                        !row.latest_qc?.rework_required;
                      const installationReady =
                        row.latest_installation?.status === "completed" &&
                        row.latest_installation?.verified;
                      const materialsReady =
                        row.material_summary.total === 0 ||
                        (row.material_summary.shortages === 0 &&
                          row.material_summary.completed ===
                            row.material_summary.total);
                      const requestsResolved =
                        row.pending_material_requests === 0;
                      const ready =
                        qcPassed &&
                        installationReady &&
                        materialsReady &&
                        requestsResolved;
                      return (
                        <div
                          className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${
                            ready
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-amber-200 bg-amber-50"
                          }`}
                        >
                          <div>
                            <p
                              className={`text-xs font-semibold ${
                                ready ? "text-emerald-900" : "text-amber-900"
                              }`}
                            >
                              {ready
                                ? "Ready to complete production"
                                : "Completion is locked"}
                            </p>
                            <p
                              className={`mt-1 text-[11px] ${
                                ready ? "text-emerald-800" : "text-amber-800"
                              }`}
                            >
                              {ready
                                ? "All production gates are satisfied. Admin can now complete the job."
                                : "Requires passing QC, completed + verified installation, resolved materials, and no pending material requests — or use Override below."}
                            </p>
                          </div>
                          <button
                            onClick={() => completeProduction(row)}
                            disabled={!ready || saving === row.job_order_id}
                            className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {saving === row.job_order_id
                              ? "Completing…"
                              : "Mark production completed"}
                          </button>
                        </div>
                      );
                    })()}

                  {row.stage_history.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {row.stage_history.slice(0, 10).map((h) => (
                        <span
                          key={h.history_id}
                          className="rounded-full border bg-gray-50 px-2 py-1 text-[10px] text-gray-600"
                        >
                          {h.to_stage.replaceAll("_", " ")} ·{" "}
                          {new Date(h.changed_at).toLocaleDateString("en-PH")}
                          {h.note?.startsWith("[ADMIN OVERRIDE]") ? " ⚡" : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Admin override zone ── */}
                <div className="mb-4 rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50/40 p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-rose-800">
                        ⚡ Admin override
                      </p>
                      <p className="mt-0.5 text-[11px] text-rose-700/80">
                        Jump to any stage or parent job status when the normal
                        process is not required. Confirmations are required.
                      </p>
                    </div>
                  </div>

                  <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-rose-700">
                    Override note (optional — recorded in history)
                  </label>
                  <input
                    value={overrideNote[row.job_order_id] ?? ""}
                    onChange={(e) =>
                      setOverrideNote((s) => ({
                        ...s,
                        [row.job_order_id]: e.target.value
                      }))
                    }
                    placeholder="e.g. Fast-close job — skip QC & installation gates"
                    className="mb-3 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />

                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                    Set production stage
                  </p>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {PRODUCTION_STAGES.map((stage) => {
                      const isCurrent = row.production_stage === stage;
                      return (
                        <button
                          key={stage}
                          type="button"
                          disabled={saving === row.job_order_id || isCurrent}
                          onClick={() => overrideStage(row, stage)}
                          className={`inline-flex items-center gap-1 rounded-xl border-2 px-2.5 py-2 text-[11px] font-semibold capitalize transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                            isCurrent
                              ? "border-gray-900 bg-gray-900 text-white"
                              : "border-rose-200 bg-white text-rose-900 hover:border-rose-500 hover:bg-rose-100"
                          }`}
                        >
                          <span>{STAGE_ICONS[stage] ?? "•"}</span>
                          {stage.replaceAll("_", " ")}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      disabled={
                        saving === row.job_order_id ||
                        row.production_stage === "on_hold"
                      }
                      onClick={() => overrideStage(row, "on_hold")}
                      className="inline-flex items-center gap-1 rounded-xl border-2 border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] font-semibold text-amber-900 transition hover:bg-amber-100 active:scale-95 disabled:opacity-50"
                    >
                      ⏸️ On hold
                    </button>
                  </div>

                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                    Override parent job status
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {PARENT_JOB_STATUSES.map((status) => {
                      const isCurrent = row.job_status === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          disabled={saving === row.job_order_id || isCurrent}
                          onClick={() => overrideParentJobStatus(row, status)}
                          className={`rounded-xl border-2 px-2.5 py-2 text-[11px] font-semibold capitalize transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                            isCurrent
                              ? "border-gray-900 bg-gray-900 text-white"
                              : "border-rose-200 bg-white text-rose-900 hover:border-rose-500 hover:bg-rose-100"
                          }`}
                        >
                          {status.replaceAll("_", " ")}
                        </button>
                      );
                    })}
                  </div>

                  {overrideError && (
                    <p className="mt-3 rounded-md bg-red-100 px-3 py-2 text-xs text-red-800">
                      {overrideError}
                    </p>
                  )}
                  {saving === row.job_order_id && (
                    <p className="mt-2 text-[11px] font-medium text-rose-600">
                      Applying override…
                    </p>
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Order description">
                        <textarea
                          value={d.order_description ?? ""}
                          onChange={(e) =>
                            setDrafts({
                              ...drafts,
                              [row.job_order_id]: {
                                ...d,
                                order_description: e.target.value
                              }
                            })
                          }
                          className="min-h-20 w-full rounded-lg border px-3 py-2 text-xs"
                          placeholder="What exactly is being fabricated?"
                        />
                      </Field>
                      <Field label="Dimensions">
                        <input
                          value={d.dimensions ?? ""}
                          onChange={(e) =>
                            setDrafts({
                              ...drafts,
                              [row.job_order_id]: {
                                ...d,
                                dimensions: e.target.value
                              }
                            })
                          }
                          className="w-full rounded-lg border px-3 py-2 text-xs"
                          placeholder="e.g. 4ft × 8ft"
                        />
                      </Field>
                      <Field label="Quantity">
                        <input
                          type="number"
                          step="0.01"
                          value={d.quantity ?? 1}
                          onChange={(e) =>
                            setDrafts({
                              ...drafts,
                              [row.job_order_id]: {
                                ...d,
                                quantity: e.target.value as any
                              }
                            })
                          }
                          className="w-full rounded-lg border px-3 py-2 text-xs"
                        />
                      </Field>
                      <Field label="Priority">
                        <select
                          value={d.priority ?? "normal"}
                          onChange={(e) =>
                            setDrafts({
                              ...drafts,
                              [row.job_order_id]: {
                                ...d,
                                priority: e.target.value
                              }
                            })
                          }
                          className="w-full rounded-lg border px-3 py-2 text-xs"
                        >
                          <option>low</option>
                          <option>normal</option>
                          <option>high</option>
                          <option>urgent</option>
                        </select>
                      </Field>
                      <Field label="Deadline">
                        <input
                          type="date"
                          value={d.deadline ?? ""}
                          onChange={(e) =>
                            setDrafts({
                              ...drafts,
                              [row.job_order_id]: {
                                ...d,
                                deadline: e.target.value
                              }
                            })
                          }
                          className="w-full rounded-lg border px-3 py-2 text-xs"
                        />
                      </Field>
                      <Field label="Specifications">
                        <textarea
                          value={d.specifications ?? ""}
                          onChange={(e) =>
                            setDrafts({
                              ...drafts,
                              [row.job_order_id]: {
                                ...d,
                                specifications: e.target.value
                              }
                            })
                          }
                          className="min-h-20 w-full rounded-lg border px-3 py-2 text-xs"
                          placeholder="Material, finish, lighting, colors, mounting, etc."
                        />
                      </Field>
                      <Field label="Installation notes">
                        <textarea
                          value={d.installation_notes ?? ""}
                          onChange={(e) =>
                            setDrafts({
                              ...drafts,
                              [row.job_order_id]: {
                                ...d,
                                installation_notes: e.target.value
                              }
                            })
                          }
                          className="min-h-20 w-full rounded-lg border px-3 py-2 text-xs"
                        />
                      </Field>
                      <Field label="Production notes">
                        <textarea
                          value={d.production_notes ?? ""}
                          onChange={(e) =>
                            setDrafts({
                              ...drafts,
                              [row.job_order_id]: {
                                ...d,
                                production_notes: e.target.value
                              }
                            })
                          }
                          className="min-h-20 w-full rounded-lg border px-3 py-2 text-xs"
                        />
                      </Field>
                    </div>
                    <button
                      onClick={() => save(row)}
                      disabled={saving === row.job_order_id}
                      className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                    >
                      {saving === row.job_order_id && (
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      )}
                      {saving === row.job_order_id
                        ? "Saving…"
                        : "Save production brief"}
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-xs font-semibold text-emerald-900">
                        Approved design — required fabrication reference
                      </p>
                      <p className="mt-1 text-[11px] text-emerald-800">
                        Upload the exact approved design revision here.
                        Fabricators will see this but cannot replace it.
                      </p>
                      <div className="mt-2">
                        <ImageUpload
                          jobId={row.job_id}
                          jobOrderId={row.job_order_id}
                          category="approved_design"
                          uploadedBy={adminId}
                        />
                      </div>
                      <AttachmentGallery attachments={row.approved_design} />
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-3">
                      <p className="text-xs font-semibold">
                        Order / reference images
                      </p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        Add customer reference images, sketches, measurements,
                        or other visuals that help fabrication.
                      </p>
                      <div className="mt-2">
                        <ImageUpload
                          jobId={row.job_id}
                          jobOrderId={row.job_order_id}
                          category="order_reference"
                          uploadedBy={adminId}
                          multiple
                        />
                      </div>
                      <AttachmentGallery attachments={row.order_reference} />
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs">
                      <p className="font-semibold">Assignment</p>
                      <p className="mt-1 text-gray-500">
                        Fabricator:{" "}
                        <b className="text-gray-800">
                          {row.fabricator_name || "Not assigned"}
                        </b>
                      </p>
                      <p className="text-gray-500">
                        Production stage:{" "}
                        <b className="capitalize text-gray-800">
                          {row.production_stage.replaceAll("_", " ")}
                        </b>
                      </p>
                      <p className="text-gray-500">
                        Parent job status:{" "}
                        <b className="capitalize text-gray-800">
                          {row.job_status.replaceAll("_", " ")}
                        </b>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function ProductionCheck({
  label,
  ok,
  value
}: {
  label: string;
  ok: boolean;
  value: string;
}) {
  return (
    <div
      className={`rounded-lg border px-2.5 py-2 ${
        ok ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"
      }`}
    >
      <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p
        className={`mt-0.5 font-semibold capitalize ${
          ok ? "text-emerald-700" : "text-amber-800"
        }`}
      >
        {ok ? "✓ " : "⚠ "}
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-medium text-gray-600">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}
