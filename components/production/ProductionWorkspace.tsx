"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { AttachmentGallery } from "@/components/shared/AttachmentGallery";
import { jobControlMeta } from "@/lib/workflow/jobControl";

const STAGES = [
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
] as const;

// Big, unambiguous pictograms per stage — the point is that a fabricator can
// tell what a level means at a glance without reading the label closely.
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

type Stage = typeof STAGES[number][0] | "on_hold";

type ProductionRow = {
  job_order_id: string;
  job_id: string;
  fabricator_id: string | null;
  materials: string | null;
  estimated_materials_cost: number | null;
  actual_materials_cost: number | null;
  estimated_labor_cost: number | null;
  actual_labor_cost: number | null;
  estimated_logistics_cost: number | null;
  actual_logistics_cost: number | null;
  logistics_vendor: string | null;
  funds_release_status: string;
  deadline: string | null;
  status: string;
  order_description: string | null;
  dimensions: string | null;
  quantity: number | null;
  specifications: string | null;
  installation_notes: string | null;
  production_notes: string | null;
  priority: string;
  production_stage: Stage;
  started_at: string | null;
  completed_at: string | null;
  hold_reason: string | null;
  scheduled_installation_date: string | null;
  client_name: string;
  location: string | null;
  job_name: string | null;
  approved_value: number;
  approved_design_url: string | null;
  attachments: Record<string, { attachment_id: string; signed_url: string | null; caption?: string | null }[]>;
  materials_rows: any[];
  labor_rows: any[];
  requests: any[];
  qc_rows: any[];
  deliveries: any[];
  installations: any[];
  history: any[];
};

function peso(value: number | null | undefined) {
  return `₱${Number(value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function num2(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function stageLabel(stage: string) {
  return STAGES.find(([id]) => id === stage)?.[1] ?? stage.replaceAll("_", " ");
}

function variance(est: number | null, actual: number | null) {
  const e = Number(est ?? 0);
  const a = Number(actual ?? 0);
  return a - e;
}

export function ProductionWorkspace({ rows, fabricatorId }: { rows: ProductionRow[]; fabricatorId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [selected, setSelected] = useState(rows[0]?.job_order_id ?? null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [materialForm, setMaterialForm] = useState({ material_name: "", specification: "", unit: "unit", estimated_qty: "", estimated_unit_cost: "" });
  const [laborForm, setLaborForm] = useState({ worker_name: "", task: "", work_date: new Date().toISOString().slice(0, 10), hours: "", hourly_rate: "" });
  const [requestForm, setRequestForm] = useState({ material_name: "", quantity: "", unit: "unit", estimated_cost: "", reason: "" });
  const [qcNotes, setQcNotes] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [deliveryForm, setDeliveryForm] = useState({ scheduled_date: "", driver_name: "", vehicle: "", destination: "", actual_cost: "" });
  const [installationForm, setInstallationForm] = useState({ scheduled_date: "", team_name: "", location: "", representative_name: "" });
  const [installationError, setInstallationError] = useState("");

  const filtered = useMemo(() => rows.filter((r) => filter === "all" || r.production_stage === filter), [rows, filter]);
  const row = rows.find((r) => r.job_order_id === selected) ?? filtered[0];

  async function updateStage(next: Stage) {
    if (!row || busy) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    const patch: Record<string, any> = { production_stage: next };
    if (next === "on_hold") patch.hold_reason = holdReason || "Production placed on hold";
    if (next !== "on_hold") patch.hold_reason = null;
    if (!row.started_at && !["materials", "on_hold"].includes(next)) patch.started_at = new Date().toISOString();
    if (next === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from("job_orders").update(patch).eq("job_order_id", row.job_order_id);
    if (!error) router.refresh();
    actionLock.current = false;
    setBusy(false);
  }

  async function addMaterial() {
    if (!row || !materialForm.material_name) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    const { error } = await supabase.from("job_order_materials").insert({
      job_order_id: row.job_order_id,
      material_name: materialForm.material_name,
      specification: materialForm.specification || null,
      unit: materialForm.unit,
      estimated_qty: materialForm.estimated_qty ? Number(materialForm.estimated_qty) : null,
      estimated_unit_cost: materialForm.estimated_unit_cost ? Number(materialForm.estimated_unit_cost) : null,
      created_by: fabricatorId
    });
    if (!error) setMaterialForm({ material_name: "", specification: "", unit: "unit", estimated_qty: "", estimated_unit_cost: "" });
    actionLock.current = false;
    setBusy(false);
    router.refresh();
  }

  async function addLabor() {
    if (!row || !laborForm.worker_name || !laborForm.task) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    const { error } = await supabase.from("job_order_labor_logs").insert({
      job_order_id: row.job_order_id,
      worker_name: laborForm.worker_name,
      task: laborForm.task,
      work_date: laborForm.work_date,
      hours: Number(laborForm.hours || 0),
      hourly_rate: Number(laborForm.hourly_rate || 0),
      logged_by: fabricatorId
    });
    actionLock.current = false;
    setBusy(false);
    if (!error) router.refresh();
  }

  async function addRequest() {
    if (!row || !requestForm.material_name || !requestForm.reason) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    const { error } = await supabase.from("job_order_material_requests").insert({
      job_order_id: row.job_order_id,
      material_name: requestForm.material_name,
      quantity: Number(requestForm.quantity || 0),
      unit: requestForm.unit,
      estimated_cost: requestForm.estimated_cost ? Number(requestForm.estimated_cost) : null,
      reason: requestForm.reason,
      requested_by: fabricatorId
    });
    actionLock.current = false;
    setBusy(false);
    if (!error) router.refresh();
  }

  async function updateMaterialActual(materialId: string, actualQty: string, actualUnitCost: string) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    await supabase.from("job_order_materials").update({ actual_qty: actualQty === "" ? null : Number(actualQty), actual_unit_cost: actualUnitCost === "" ? null : Number(actualUnitCost), status: actualQty ? "used" : "planned" }).eq("material_id", materialId);
    actionLock.current = false;
    setBusy(false);
    router.refresh();
  }

  async function addDelivery() {
    if (!row) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    const { error } = await supabase.from("job_order_deliveries").insert({ job_order_id: row.job_order_id, scheduled_date: deliveryForm.scheduled_date || null, driver_name: deliveryForm.driver_name || null, vehicle: deliveryForm.vehicle || null, destination: deliveryForm.destination || row.location || null, actual_cost: deliveryForm.actual_cost ? Number(deliveryForm.actual_cost) : null, created_by: fabricatorId });
    actionLock.current = false;
    setBusy(false);
    if (!error) router.refresh();
  }

  async function addInstallation() {
    if (!row) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    const { error } = await supabase.from("job_order_installations").insert({ job_order_id: row.job_order_id, scheduled_date: installationForm.scheduled_date || null, team_name: installationForm.team_name || null, location: installationForm.location || row.location || null, representative_name: installationForm.representative_name || null, created_by: fabricatorId });
    actionLock.current = false;
    setBusy(false);
    if (!error) router.refresh();
  }

  async function updateInstallation(installationId: string, status: "on_site" | "in_progress" | "completed") {
    if (!row || busy) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setInstallationError("");
    const patch: Record<string, any> = { status, updated_at: new Date().toISOString() };
    if (status === "on_site") patch.arrival_at = new Date().toISOString();
    if (status === "completed") patch.departure_at = new Date().toISOString();
    const { error } = await supabase.from("job_order_installations").update(patch).eq("installation_id", installationId);
    if (error) setInstallationError(error.message);
    actionLock.current = false;
    setBusy(false);
    if (!error) router.refresh();
  }

  async function submitQc(result: "pass" | "fail" | "conditional") {
    if (!row) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    await supabase.from("job_order_qc_checks").insert({
      job_order_id: row.job_order_id,
      result,
      notes: qcNotes || null,
      rework_required: result === "fail",
      inspected_by: fabricatorId,
      checklist: { design: true, dimensions: true, finish: true, electrical: true, hardware: true }
    });
    if (result === "pass") await supabase.from("job_orders").update({ production_stage: "ready_for_delivery" }).eq("job_order_id", row.job_order_id);
    if (result === "fail") await supabase.from("job_orders").update({ production_stage: "finishing" }).eq("job_order_id", row.job_order_id);
    setQcNotes("");
    actionLock.current = false;
    setBusy(false);
    router.refresh();
  }

  if (rows.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-500">No job orders are currently assigned to you.</div>;
  }

  const latestQc = row.qc_rows?.[0];
  const latestInstallation = row.installations?.[0];
  const qcPassed = latestQc?.result === "pass" && !latestQc?.rework_required;
  const installationCompleted = latestInstallation?.status === "completed";
  const installationVerified = latestInstallation?.verified === true;
  const canComplete = qcPassed && installationCompleted && installationVerified;

  const materialEstimate = Number(row.estimated_materials_cost ?? 0);
  const materialActual = Number(row.actual_materials_cost ?? 0);
  const laborEstimate = Number(row.estimated_labor_cost ?? 0);
  const laborActual = Number(row.actual_labor_cost ?? 0);
  const logisticsEstimate = Number(row.estimated_logistics_cost ?? 0);
  const logisticsActual = Number(row.actual_logistics_cost ?? 0);
  const estimatedTotal = materialEstimate + laborEstimate + logisticsEstimate;
  const actualTotal = materialActual + laborActual + logisticsActual;
  const costVariance = actualTotal - estimatedTotal;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric icon="🗂️" label="All jobs" value={rows.length} color="slate" />
        <Metric icon="⚙️" label="In production" value={rows.filter(r => !["materials","qc","ready_for_delivery","installation","completed"].includes(r.production_stage)).length} color="blue" />
        <Metric icon="🚨" label="Material shortages" value={rows.filter(r => r.requests.some(q => q.status === "pending")).length} color="red" />
        <Metric icon="🔍" label="QC pending" value={rows.filter(r => r.production_stage === "qc").length} color="amber" />
        <Metric icon="🏗️" label="Installation" value={rows.filter(r => r.production_stage === "installation").length} color="purple" />
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
        <select value={filter} onChange={e => setFilter(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs">
          <option value="all">All production stages</option>
          {STAGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <span className="ml-auto self-center text-[11px] text-gray-400">Only jobs assigned to this fabricator are shown.</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[330px_1fr]">
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3"><p className="text-sm font-semibold">Production queue</p><p className="text-xs text-gray-500">Select a job to open its production workspace.</p></div>
          {filtered.map(r => (
            <button key={r.job_order_id} onClick={() => setSelected(r.job_order_id)} className={`w-full border-b border-gray-100 p-4 text-left last:border-0 ${selected === r.job_order_id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
              <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-base">{STAGE_ICONS[r.production_stage] ?? "🛠️"}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{r.client_name}</p><p className="truncate text-xs text-gray-500">{r.job_name || r.order_description || "Untitled job"}</p></div></div><StatusBadge status={r.production_stage} /></div>
              <p className="mt-2 text-[11px] text-gray-400">Due {r.deadline || "—"} · Qty {r.quantity ?? 1}</p>
            </button>
          ))}
        </section>

        {row && <section className="min-w-0 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-2xl">{STAGE_ICONS[row.production_stage] ?? "🛠️"}</span><div><p className="text-lg font-bold text-gray-900">{row.client_name}</p><p className="text-xs text-gray-500">{row.job_name || "Untitled project"} · Job Order {row.job_order_id.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-xs text-gray-500">{row.location || "No installation location recorded"}</p></div></div>
                <div className="text-right"><div className="flex flex-wrap justify-end gap-1.5"><StatusBadge status={row.production_stage} /><span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${jobControlMeta(row.approved_value).badge}`}>{jobControlMeta(row.approved_value).shortLabel}</span></div><p className="mt-1 text-[11px] text-gray-400">Priority: {row.priority}</p></div>
              </div>
              {busy && <div className="mt-3 inline-flex items-center gap-2 text-[11px] font-semibold text-gray-500"><span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800" /> Saving production update…</div>}
              <div className="mt-4 overflow-x-auto pb-1">
                <div className="flex min-w-max items-center gap-1">
                  {STAGES.map(([id, label], i) => {
                    const stageIndex = STAGES.findIndex(([sid]) => sid === row.production_stage);
                    const isDone = stageIndex > i;
                    const isCurrent = stageIndex === i;
                    const isLockedCompleted = id === "completed" && !canComplete;
                    const tileColor = isDone
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : isCurrent
                      ? "border-[#0784c8] bg-[#0784c8] text-white ring-4 ring-blue-100 scale-105"
                      : "border-gray-200 bg-white text-gray-400";
                    return (
                      <div key={id} className="flex items-center">
                        <button
                          disabled={busy || isLockedCompleted}
                          title={isLockedCompleted ? "Locked — pass Final QC and get Admin to verify installation first." : undefined}
                          onClick={() => updateStage(id)}
                          className={`flex w-[86px] flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-center shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${tileColor}`}
                        >
                          <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-2xl">
                            {isDone ? "✅" : isLockedCompleted ? "🔒" : STAGE_ICONS[id]}
                            <span className={`absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${isCurrent || isDone ? "bg-white text-gray-900" : "bg-gray-200 text-gray-500"}`}>{i + 1}</span>
                          </span>
                          <span className="text-[10px] font-bold leading-tight">{label}</span>
                        </button>
                        {i < STAGES.length - 1 && <span className={`mx-0.5 h-1 w-4 rounded-full ${stageIndex > i ? "bg-emerald-400" : "bg-gray-200"}`} />}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-2 text-[10px] text-gray-400">Tap a level to move the job there. Step {Math.max(1, STAGES.findIndex(([sid]) => sid === row.production_stage) + 1)} of {STAGES.length}.</p>
              <div className={`mt-3 rounded-xl border-2 p-3 ${canComplete ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{canComplete ? "🏁" : "🎯"}</span>
                    <div>
                      <p className={`text-xs font-semibold ${canComplete ? "text-emerald-900" : "text-amber-900"}`}>{canComplete ? "Production is ready to complete!" : "3 things to unlock Completed"}</p>
                      <p className={`mt-1 text-[11px] ${canComplete ? "text-emerald-800" : "text-amber-800"}`}>{canComplete ? "All checks passed. You can mark Production Completed." : "Finish the badges below. Admin verifies installation — not you."}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${canComplete ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"}`}>{canComplete ? "✓ READY" : "NOT YET"}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Gate icon="🔍" label="Final QC" ok={qcPassed} value={qcPassed ? "Passed" : "Not passed"} />
                  <Gate icon="🏗️" label="Installation" ok={installationCompleted} value={installationCompleted ? "Completed" : (latestInstallation?.status || "Not recorded")} />
                  <Gate icon="👍" label="Admin verification" ok={installationVerified} value={installationVerified ? "Verified" : "Awaiting Admin"} />
                </div>
                {!installationVerified && installationCompleted && <p className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-[11px] text-amber-800">Installation is completed. Ask Admin to verify the installation; the <b>Completed</b> production action will unlock after verification.</p>}
              </div>
              
              {row.production_stage === "on_hold" && <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-100 p-3 text-xs font-semibold text-amber-900">⏸️ On hold: {row.hold_reason || "No reason recorded"}</div>}
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Order description" value={row.order_description || row.materials || "—"} />
              <Info label="Dimensions" value={row.dimensions || "—"} />
              <Info label="Specifications" value={row.specifications || "—"} />
              <Info label="Installation notes" value={row.installation_notes || "—"} />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Approved design & order references</p><p className="text-xs text-gray-500">The approved design is the fabrication reference. Do not build from an unapproved revision.</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Fabrication reference</span></div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Approved design</p>{row.approved_design_url && <a href={row.approved_design_url} target="_blank" rel="noreferrer" className="mb-2 inline-block text-xs font-semibold text-blue-700 underline">Open approved design revision</a>}<AttachmentGallery attachments={row.attachments.approved_design ?? []} /></div>
              <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Order / reference images</p><AttachmentGallery attachments={row.attachments.order_reference ?? []} /></div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <CostCard title="Job cost control" rows={[["Materials", materialEstimate, materialActual], ["Labor", laborEstimate, laborActual], ["Logistics", logisticsEstimate, logisticsActual]]} total={[estimatedTotal, actualTotal]} />
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-sm font-semibold">Cost warning</p><p className={`mt-2 text-2xl font-bold ${costVariance > 0 ? "text-red-600" : "text-emerald-700"}`}>{costVariance >= 0 ? "+" : "−"}{peso(Math.abs(costVariance))}</p><p className="text-xs text-gray-500">Actual minus estimated production cost. Accounting receives the actuals; Production explains the variance.</p></section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><Header title="Materials plan & usage" /><div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-xs"><thead><tr className="border-b text-gray-400"><th className="py-2">Material</th><th>Plan</th><th>Used</th><th>Status</th></tr></thead><tbody>{row.materials_rows.map(m => <tr key={m.material_id} className="border-b last:border-0"><td className="py-2"><b>{m.material_name}</b><div className="text-[10px] text-gray-400">{m.specification || ""}</div></td><td>{m.estimated_qty == null ? "—" : num2(m.estimated_qty)} {m.unit}</td><td><input defaultValue={m.actual_qty ?? ""} type="number" step="0.01" className="w-20 rounded border px-1.5 py-1" placeholder="Qty" id={`qty-${m.material_id}`} /> <input defaultValue={m.actual_unit_cost ?? ""} type="number" step="0.01" className="w-24 rounded border px-1.5 py-1" placeholder="Unit ₱" id={`cost-${m.material_id}`} /></td><td><button disabled={busy} onClick={() => updateMaterialActual(m.material_id, (document.getElementById(`qty-${m.material_id}`) as HTMLInputElement)?.value ?? "", (document.getElementById(`cost-${m.material_id}`) as HTMLInputElement)?.value ?? "")} className="inline-flex items-center gap-1.5 rounded border px-2 py-1 font-semibold disabled:cursor-wait disabled:opacity-50">{busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />}{busy ? "Saving…" : "Save"}</button></td></tr>)}</tbody></table></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><input placeholder="Material" value={materialForm.material_name} onChange={e=>setMaterialForm({...materialForm,material_name:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input placeholder="Specification" value={materialForm.specification} onChange={e=>setMaterialForm({...materialForm,specification:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input placeholder="Qty" value={materialForm.estimated_qty} onChange={e=>setMaterialForm({...materialForm,estimated_qty:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input placeholder="Est. unit cost" value={materialForm.estimated_unit_cost} onChange={e=>setMaterialForm({...materialForm,estimated_unit_cost:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/></div><button onClick={addMaterial} disabled={busy || !materialForm.material_name} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60">{busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}{busy ? "Saving…" : "Add material"}</button></section>

            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><Header title="Labor work logs" /><div className="space-y-2">{row.labor_rows.map(l => <div key={l.labor_log_id} className="flex justify-between rounded-lg bg-gray-50 p-2 text-xs"><span><b>{l.worker_name}</b> · {l.task}<span className="ml-1 text-gray-400">{l.work_date}</span></span><span className="font-semibold">{num2(l.hours)}h · {peso(l.amount)}</span></div>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-2"><input placeholder="Worker / team" value={laborForm.worker_name} onChange={e=>setLaborForm({...laborForm,worker_name:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input placeholder="Task" value={laborForm.task} onChange={e=>setLaborForm({...laborForm,task:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input type="number" step="0.01" placeholder="Hours" value={laborForm.hours} onChange={e=>setLaborForm({...laborForm,hours:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input type="number" step="0.01" placeholder="Hourly rate" value={laborForm.hourly_rate} onChange={e=>setLaborForm({...laborForm,hourly_rate:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/></div><button onClick={addLabor} disabled={busy || !laborForm.worker_name || !laborForm.task} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60">{busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}{busy ? "Saving…" : "Log labor"}</button></section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><Header title="Material requests" /><div className="space-y-2">{row.requests.map(q => <div key={q.request_id} className="rounded-lg border p-3 text-xs"><div className="flex justify-between"><b>{q.material_name} · {num2(q.quantity)} {q.unit}</b><span className="font-semibold">{q.status}</span></div><p className="mt-1 text-gray-500">{q.reason}</p></div>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-2"><input placeholder="Material" value={requestForm.material_name} onChange={e=>setRequestForm({...requestForm,material_name:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input placeholder="Quantity" value={requestForm.quantity} onChange={e=>setRequestForm({...requestForm,quantity:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input placeholder="Estimated cost" value={requestForm.estimated_cost} onChange={e=>setRequestForm({...requestForm,estimated_cost:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input placeholder="Reason" value={requestForm.reason} onChange={e=>setRequestForm({...requestForm,reason:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/></div><button onClick={addRequest} disabled={busy || !requestForm.material_name || !requestForm.reason} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-gray-900 px-3 py-2 text-xs font-semibold disabled:cursor-wait disabled:opacity-60">{busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-500 border-t-gray-900" />}{busy ? "Submitting…" : "Request material"}</button></section>

            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><Header title="Quality control" /><div className="space-y-2">{row.qc_rows.map(q => <div key={q.qc_id} className={`rounded-lg p-3 text-xs ${q.result === "pass" ? "bg-emerald-50" : "bg-red-50"}`}><div className="flex justify-between"><b>{q.result === "pass" ? "✅ PASS" : "❌ FAIL"}</b><span>{new Date(q.inspected_at).toLocaleDateString("en-PH")}</span></div><p className="mt-1">{q.notes || "No notes"}</p></div>)}</div><textarea value={qcNotes} onChange={e=>setQcNotes(e.target.value)} placeholder="Inspection notes / defects" className="mt-3 min-h-20 w-full rounded-lg border px-3 py-2 text-xs"/><div className="mt-3 grid grid-cols-2 gap-3"><button onClick={()=>submitQc("pass")} disabled={busy} className="flex flex-col items-center gap-1 rounded-2xl border-2 border-emerald-600 bg-emerald-500 py-4 text-white shadow-sm transition active:scale-95 disabled:cursor-wait disabled:opacity-60">{busy ? <span className="h-6 w-6 animate-spin rounded-full border-4 border-white/40 border-t-white" /> : <span className="text-3xl leading-none">✅</span>}<span className="text-sm font-extrabold tracking-wide">PASS QC</span></button><button onClick={()=>submitQc("fail")} disabled={busy} className="flex flex-col items-center gap-1 rounded-2xl border-2 border-red-600 bg-red-500 py-4 text-white shadow-sm transition active:scale-95 disabled:cursor-wait disabled:opacity-60">{busy ? <span className="h-6 w-6 animate-spin rounded-full border-4 border-white/40 border-t-white" /> : <span className="text-3xl leading-none">❌</span>}<span className="text-sm font-extrabold tracking-wide">FAIL / REWORK</span></button></div></section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><Header title="Logistics / dispatch" /><div className="space-y-2">{row.deliveries.map(d => <div key={d.delivery_id} className="rounded-lg bg-gray-50 p-3 text-xs"><div className="flex justify-between"><b>{d.status}</b><span>{d.scheduled_date || "No date"}</span></div><p className="mt-1 text-gray-500">{d.driver_name || "No driver"} · {d.vehicle || "No vehicle"} · {peso(d.actual_cost)}</p></div>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-2"><input type="date" value={deliveryForm.scheduled_date} onChange={e=>setDeliveryForm({...deliveryForm,scheduled_date:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input placeholder="Driver" value={deliveryForm.driver_name} onChange={e=>setDeliveryForm({...deliveryForm,driver_name:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input placeholder="Vehicle" value={deliveryForm.vehicle} onChange={e=>setDeliveryForm({...deliveryForm,vehicle:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input placeholder="Actual logistics cost" value={deliveryForm.actual_cost} onChange={e=>setDeliveryForm({...deliveryForm,actual_cost:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input placeholder="Destination" value={deliveryForm.destination} onChange={e=>setDeliveryForm({...deliveryForm,destination:e.target.value})} className="rounded-lg border px-2 py-2 text-xs sm:col-span-2"/></div><button onClick={addDelivery} disabled={busy} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60">{busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}{busy ? "Saving…" : "Add dispatch record"}</button></section>
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><Header title="Installation" /><p className="mb-3 text-[11px] text-gray-500">Fabrication can update the installation status. Final verification remains an Admin control so the person doing the work does not self-verify the completion gate.</p><div className="space-y-2">{row.installations.map(i => <div key={i.installation_id} className="rounded-lg bg-gray-50 p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><b className="capitalize">{i.status?.replaceAll("_", " ")}</b><span>{i.scheduled_date || "No date"}</span></div><p className="mt-1 text-gray-500">{i.team_name || "No team"} · {i.location || "No location"}</p><p className={`mt-1 font-medium ${i.verified ? "text-emerald-700" : "text-amber-700"}`}>{i.verified ? "✓ Admin verified" : "Awaiting Admin verification"}</p>{i.status !== "completed" && <div className="mt-2 flex flex-wrap gap-2"><button onClick={()=>updateInstallation(i.installation_id,"on_site")} disabled={busy} className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-[10px] font-semibold">On site</button><button onClick={()=>updateInstallation(i.installation_id,"in_progress")} disabled={busy} className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-[10px] font-semibold">Start installation</button><button onClick={()=>updateInstallation(i.installation_id,"completed")} disabled={busy} className="rounded-md bg-gray-900 px-2.5 py-1.5 text-[10px] font-semibold text-white">Mark installation completed</button></div>}</div>)}</div>{installationError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{installationError}</p>}<div className="mt-3 grid gap-2 sm:grid-cols-2"><input type="date" value={installationForm.scheduled_date} onChange={e=>setInstallationForm({...installationForm,scheduled_date:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input placeholder="Installation team" value={installationForm.team_name} onChange={e=>setInstallationForm({...installationForm,team_name:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input placeholder="Location" value={installationForm.location} onChange={e=>setInstallationForm({...installationForm,location:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/><input placeholder="Customer representative" value={installationForm.representative_name} onChange={e=>setInstallationForm({...installationForm,representative_name:e.target.value})} className="rounded-lg border px-2 py-2 text-xs"/></div><button onClick={addInstallation} disabled={busy} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60">{busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}{busy ? "Saving…" : "Schedule installation"}</button></section>
          </div>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">Production evidence</p><p className="text-xs text-gray-500">Upload photos of actual fabrication, QC and installation. Approved design remains controlled by Admin.</p></div><div className="flex flex-wrap gap-2"><ImageUpload jobId={row.job_id} jobOrderId={row.job_order_id} category="production_progress" uploadedBy={fabricatorId}/><ImageUpload jobId={row.job_id} jobOrderId={row.job_order_id} category="qc" uploadedBy={fabricatorId}/><ImageUpload jobId={row.job_id} jobOrderId={row.job_order_id} category="installation_proof" uploadedBy={fabricatorId}/></div></div><div className="mt-3 grid gap-4 sm:grid-cols-3"><div><p className="mb-1 text-[10px] uppercase text-gray-400">Progress</p><AttachmentGallery attachments={row.attachments.production_progress ?? []}/></div><div><p className="mb-1 text-[10px] uppercase text-gray-400">QC</p><AttachmentGallery attachments={row.attachments.qc ?? []}/></div><div><p className="mb-1 text-[10px] uppercase text-gray-400">Installation</p><AttachmentGallery attachments={row.attachments.installation_proof ?? []}/></div></div></section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><Header title="Activity timeline" /><div className="space-y-3">{row.history.map(h => <div key={h.history_id} className="flex gap-3 text-xs"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gray-900"/><div><b>{stageLabel(h.to_stage)}</b><span className="ml-2 text-gray-400">{new Date(h.changed_at).toLocaleString("en-PH")}</span>{h.note && <p className="text-gray-500">{h.note}</p>}</div></div>)}</div></section>

          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-amber-900">Need to pause production?</p><p className="text-xs text-amber-800">Put the job on hold only with a recorded reason. This does not alter customer payment or Accounting records.</p></div><div className="flex gap-2"><input value={holdReason} onChange={e=>setHoldReason(e.target.value)} placeholder="Hold reason" className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs"/><button onClick={()=>updateStage("on_hold")} disabled={busy || !holdReason} className="inline-flex items-center gap-2 rounded-lg bg-amber-800 px-3 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60">{busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}{busy ? "Saving…" : "Put on hold"}</button></div></div></section>
        </section>}
      </div>
    </div>
  );
}

function Gate({ icon, label, ok, value }: { icon?: string; label: string; ok: boolean; value: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 ${ok ? "border-emerald-400 bg-white" : "border-gray-200 bg-white"}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${ok ? "bg-emerald-100" : "bg-gray-100 grayscale"}`}>{ok ? "🏅" : icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <p className={`truncate text-[11px] font-semibold ${ok ? "text-emerald-700" : "text-amber-800"}`}>{ok ? "✓ " : "⏳ "}{value}</p>
      </div>
    </div>
  );
}
function Metric({ icon, label, value, color = "slate" }: { icon?: string; label: string; value: number; color?: "slate" | "blue" | "red" | "amber" | "purple" }) {
  const styles: Record<string, string> = {
    slate: "border-gray-200 bg-white",
    blue: "border-blue-200 bg-blue-50",
    red: value > 0 ? "border-red-300 bg-red-50" : "border-gray-200 bg-white",
    amber: value > 0 ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white",
    purple: "border-purple-200 bg-purple-50"
  };
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${styles[color]}`}>
      <div className="flex items-center gap-2">
        {icon && <span className="text-lg leading-none">{icon}</span>}
        <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-gray-50 p-3"><p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 whitespace-pre-wrap text-xs text-gray-800">{value}</p></div>; }
function Header({ title }: { title: string }) { return <div className="mb-3"><p className="text-sm font-semibold">{title}</p></div>; }
function CostCard({ title, rows, total }: { title: string; rows: [string, number, number][]; total: [number, number] }) { return <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><p className="mb-3 text-sm font-semibold">{title}</p><div className="space-y-2 text-xs">{rows.map(([label,e,a]) => <div key={label} className="flex justify-between border-b border-gray-100 pb-2"><span>{label}</span><span>{peso(e)} planned · <b>{peso(a)}</b> actual <span className={variance(e,a)>0 ? "text-red-600" : "text-emerald-700"}>({variance(e,a)>=0?"+":"−"}{peso(Math.abs(variance(e,a)))})</span></span></div>)}<div className="flex justify-between pt-1 font-semibold"><span>Total</span><span>{peso(total[0])} planned · {peso(total[1])} actual</span></div></div></section>; }
