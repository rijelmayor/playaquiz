"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AttachmentGallery } from "@/components/shared/AttachmentGallery";

const STAGES: [string, string][] = [
  ["materials", "Materials"],
  ["fabrication", "Fabrication"],
  ["printing", "Printing"],
  ["finishing", "Finishing"],
  ["electrical", "Electrical"],
  ["assembly", "Assembly"],
  ["qc", "Quality Control"],
  ["ready_for_delivery", "Ready for Delivery"],
  ["installation", "Installation"],
  ["completed", "Completed"]
];

function stageLabel(stage: string) {
  return STAGES.find(([id]) => id === stage)?.[1] ?? stage.replaceAll("_", " ");
}

function num2(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function peso(value: number | null | undefined) {
  return `₱${Number(value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type ProductionRow = {
  job_order_id: string;
  job_id: string;
  client_name: string;
  job_name: string | null;
  order_description: string | null;
  dimensions: string | null;
  quantity: number | null;
  deadline: string | null;
  priority: string;
  production_stage: string;
  hold_reason: string | null;
  attachments: Record<string, { attachment_id: string; signed_url: string | null; caption?: string | null }[]>;
  requests: { request_id: string; material_name: string; quantity: number; unit: string; estimated_cost: number | null; reason: string; status: string }[];
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-gray-200 bg-white open:shadow-sm" open>
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-semibold text-gray-800">
        {title}
        <span className="text-gray-400 transition group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-gray-100 p-3">{children}</div>
    </details>
  );
}

export function SimpleProductionWorkspace({ rows, fabricatorId }: { rows: ProductionRow[]; fabricatorId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [stageChoice, setStageChoice] = useState<Record<string, string>>({});
  const [holdReason, setHoldReason] = useState<Record<string, string>>({});
  const [requestForm, setRequestForm] = useState<Record<string, { material_name: string; quantity: string; unit: string; estimated_cost: string; reason: string }>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.client_name.toLowerCase().includes(q) || (r.job_name ?? "").toLowerCase().includes(q));
  }, [rows, query]);

  function getRequestForm(id: string) {
    return requestForm[id] ?? { material_name: "", quantity: "", unit: "unit", estimated_cost: "", reason: "" };
  }

  async function updateStage(row: ProductionRow, next: string) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    const patch: Record<string, any> = { production_stage: next };
    patch.hold_reason = next === "on_hold" ? (holdReason[row.job_order_id] || "Production placed on hold") : null;
    if (next === "completed") patch.completed_at = new Date().toISOString();
    await supabase.from("job_orders").update(patch).eq("job_order_id", row.job_order_id);
    actionLock.current = false;
    setBusy(false);
    router.refresh();
  }

  async function addRequest(row: ProductionRow) {
    const form = getRequestForm(row.job_order_id);
    if (!form.material_name || !form.reason) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    const { error } = await supabase.from("job_order_material_requests").insert({
      job_order_id: row.job_order_id,
      material_name: form.material_name,
      quantity: Number(form.quantity || 0),
      unit: form.unit,
      estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
      reason: form.reason,
      requested_by: fabricatorId
    });
    if (!error) setRequestForm((s) => ({ ...s, [row.job_order_id]: { material_name: "", quantity: "", unit: "unit", estimated_cost: "", reason: "" } }));
    actionLock.current = false;
    setBusy(false);
    router.refresh();
  }

  if (rows.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-500">No job orders are currently assigned to you.</div>;
  }

  return (
    <div className="space-y-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search client or project…"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:max-w-xs"
      />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="divide-y divide-gray-100">
          {filtered.map((row) => {
            const isOpen = expanded === row.job_order_id;
            const pendingRequests = row.requests.filter((r) => r.status === "pending").length;
            return (
              <div key={row.job_order_id}>
                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">{row.client_name}</p>
                      <StatusBadge status={row.production_stage} />
                      {pendingRequests > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{pendingRequests} material request(s) pending</span>}
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500">{row.job_name || row.order_description || "Untitled project"} · Due {row.deadline || "—"} · Qty {row.quantity ?? 1}</p>
                  </div>
                  <button onClick={() => setExpanded(isOpen ? null : row.job_order_id)} className="shrink-0 rounded-md border border-gray-800 px-3 py-1.5 text-xs font-semibold">
                    {isOpen ? "Hide details" : "Show details"}
                  </button>
                </div>

                {isOpen && (
                  <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Order details</p>
                        <p>{row.order_description || "No description"}</p>
                        {row.dimensions && <p className="mt-1 text-gray-500">Dimensions: {row.dimensions}</p>}
                        {row.hold_reason && <p className="mt-1 font-medium text-amber-700">On hold: {row.hold_reason}</p>}
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Approved design</p>
                        <AttachmentGallery attachments={row.attachments.approved_design ?? []} />
                      </div>
                    </div>

                    <Section title="Update status">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={stageChoice[row.job_order_id] ?? row.production_stage}
                          onChange={(e) => setStageChoice((s) => ({ ...s, [row.job_order_id]: e.target.value }))}
                          className="rounded-md border border-gray-300 px-2 py-2 text-xs"
                        >
                          {STAGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                        </select>
                        <button
                          disabled={busy}
                          onClick={() => updateStage(row, stageChoice[row.job_order_id] ?? row.production_stage)}
                          className="rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                        >
                          {busy ? "Saving…" : "Update status"}
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                        <input
                          value={holdReason[row.job_order_id] ?? ""}
                          onChange={(e) => setHoldReason((s) => ({ ...s, [row.job_order_id]: e.target.value }))}
                          placeholder="Reason to put on hold"
                          className="min-w-0 flex-1 rounded-md border border-amber-200 bg-white px-2 py-2 text-xs"
                        />
                        <button
                          disabled={busy || !holdReason[row.job_order_id]}
                          onClick={() => updateStage(row, "on_hold")}
                          className="rounded-md bg-amber-800 px-3 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                        >
                          Put on hold
                        </button>
                      </div>
                    </Section>

                    <Section title="Request materials">
                      <div className="space-y-2">
                        {row.requests.map((r) => (
                          <div key={r.request_id} className="flex items-center justify-between rounded-lg border p-2.5 text-xs">
                            <div>
                              <p className="font-semibold">{r.material_name} · {num2(r.quantity)} {r.unit}</p>
                              <p className="text-gray-500">{r.reason}{r.estimated_cost ? ` · Est. ${peso(r.estimated_cost)}` : ""}</p>
                            </div>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold capitalize">{r.status}</span>
                          </div>
                        ))}
                        {row.requests.length === 0 && <p className="text-xs text-gray-400">No material requests yet.</p>}
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input placeholder="Material" value={getRequestForm(row.job_order_id).material_name} onChange={(e) => setRequestForm((s) => ({ ...s, [row.job_order_id]: { ...getRequestForm(row.job_order_id), material_name: e.target.value } }))} className="rounded-lg border px-2 py-2 text-xs" />
                        <input placeholder="Quantity" value={getRequestForm(row.job_order_id).quantity} onChange={(e) => setRequestForm((s) => ({ ...s, [row.job_order_id]: { ...getRequestForm(row.job_order_id), quantity: e.target.value } }))} className="rounded-lg border px-2 py-2 text-xs" />
                        <input placeholder="Estimated cost" value={getRequestForm(row.job_order_id).estimated_cost} onChange={(e) => setRequestForm((s) => ({ ...s, [row.job_order_id]: { ...getRequestForm(row.job_order_id), estimated_cost: e.target.value } }))} className="rounded-lg border px-2 py-2 text-xs" />
                        <input placeholder="Reason" value={getRequestForm(row.job_order_id).reason} onChange={(e) => setRequestForm((s) => ({ ...s, [row.job_order_id]: { ...getRequestForm(row.job_order_id), reason: e.target.value } }))} className="rounded-lg border px-2 py-2 text-xs" />
                      </div>
                      <button
                        onClick={() => addRequest(row)}
                        disabled={busy || !getRequestForm(row.job_order_id).material_name || !getRequestForm(row.job_order_id).reason}
                        className="mt-2 rounded-lg border border-gray-900 px-3 py-2 text-xs font-semibold disabled:cursor-wait disabled:opacity-60"
                      >
                        {busy ? "Submitting…" : "Request material"}
                      </button>
                    </Section>
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
