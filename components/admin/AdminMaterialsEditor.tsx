"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type MaterialRow = {
  material_id: string;
  job_order_id: string;
  material_name: string | null;
  specification: string | null;
  unit: string | null;
  estimated_qty: number | null;
  estimated_unit_cost: number | null;
  actual_qty: number | null;
  actual_unit_cost: number | null;
  status: string | null;
};

function money(n: number | null | undefined) {
  return `₱${Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

/** Material expenses per job order — post new lines and edit any field if entered by mistake. */
export function AdminMaterialsEditor({
  jobOrderId,
  jobId,
  materials
}: {
  jobOrderId: string;
  jobId: string;
  materials: MaterialRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recordedMaterials, setRecordedMaterials] = useState<MaterialRow[]>(materials);
  const [recordedLoading, setRecordedLoading] = useState(false);
  const [actualJobMaterialCost, setActualJobMaterialCost] = useState<number>(0);
  const [draft, setDraft] = useState<Partial<MaterialRow>>({});
  const [showRecordedExpenses, setShowRecordedExpenses] = useState(false);
  const [form, setForm] = useState({
    material_name: "",
    specification: "",
    actual_amount: ""
  });

  async function openRecordedExpenses() {
    setShowRecordedExpenses(true);
    setRecordedLoading(true);
    setError(null);

    const [materialsResult, jobOrderResult] = await Promise.all([
      supabase
        .from("job_order_materials")
        .select("material_id,job_order_id,material_name,specification,unit,estimated_qty,estimated_unit_cost,actual_qty,actual_unit_cost,status,created_at")
        .eq("job_order_id", jobOrderId)
        .order("created_at", { ascending: true }),
      supabase
        .from("job_orders")
        .select("actual_materials_cost")
        .eq("job_order_id", jobOrderId)
        .single()
    ]);

    setRecordedLoading(false);
    if (materialsResult.error || jobOrderResult.error) {
      const message = materialsResult.error?.message || jobOrderResult.error?.message || "Unknown database error";
      setError(`Could not load recorded material expenses: ${message}`);
      setRecordedMaterials(materials);
      return;
    }

    setRecordedMaterials((materialsResult.data ?? []).map((m: any) => ({
      material_id: m.material_id,
      job_order_id: m.job_order_id,
      material_name: m.material_name ?? null,
      specification: m.specification ?? null,
      unit: m.unit ?? null,
      estimated_qty: m.estimated_qty ?? null,
      estimated_unit_cost: m.estimated_unit_cost ?? null,
      actual_qty: m.actual_qty ?? null,
      actual_unit_cost: m.actual_unit_cost ?? null,
      status: m.status ?? null
    })));
    setActualJobMaterialCost(Number(jobOrderResult.data?.actual_materials_cost ?? 0));
  }

  function startEdit(row: MaterialRow) {
    setEditingId(row.material_id);
    setDraft({
      material_name: row.material_name ?? "",
      specification: row.specification ?? "",
      unit: row.unit ?? "unit",
      estimated_qty: row.estimated_qty,
      estimated_unit_cost: row.estimated_unit_cost,
      actual_qty: row.actual_qty,
      actual_unit_cost: row.actual_unit_cost,
      status: row.status ?? "planned"
    });
    setError(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    setBusy(true);
    setError(null);

    const toNum = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const { error: err } = await supabase
      .from("job_order_materials")
      .update({
        material_name: String(draft.material_name ?? "").trim() || null,
        specification: String(draft.specification ?? "").trim() || null,
        unit: String(draft.unit ?? "").trim() || "unit",
        estimated_qty: toNum(draft.estimated_qty),
        estimated_unit_cost: toNum(draft.estimated_unit_cost),
        actual_qty: toNum(draft.actual_qty),
        actual_unit_cost: toNum(draft.actual_unit_cost),
        status: (draft.status as string) || "planned"
      })
      .eq("material_id", editingId);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditingId(null);
    await openRecordedExpenses();
    router.refresh();
  }

  async function addMaterial() {
    if (!form.material_name.trim()) {
      setError("Material name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const actualAmount = Number(form.actual_amount);
    if (!Number.isFinite(actualAmount) || actualAmount <= 0) {
      setBusy(false);
      setError("Actual expense amount is required and must be greater than zero.");
      return;
    }

    const { error: err } = await supabase.from("job_order_materials").insert({
      job_order_id: jobOrderId,
      material_name: form.material_name.trim(),
      specification: form.specification.trim() || null,
      unit: "expense",
      estimated_qty: null,
      estimated_unit_cost: null,
      actual_qty: 1,
      actual_unit_cost: actualAmount,
      status: "used"
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setForm({
      material_name: "",
      specification: "",
      actual_amount: ""
    });
    await openRecordedExpenses();
    router.refresh();
  }

  async function removeMaterial(materialId: string) {
    if (!confirm("Delete this material line? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("job_order_materials")
      .delete()
      .eq("material_id", materialId);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (editingId === materialId) setEditingId(null);
    setRecordedMaterials((rows) => rows.filter((row) => row.material_id !== materialId));
    router.refresh();
  }

  const totalEst = materials.reduce(
    (s, m) =>
      s + Number(m.estimated_qty ?? 0) * Number(m.estimated_unit_cost ?? 0),
    0
  );
  const detailActual = materials.reduce(
    (s, m) => s + Number(m.actual_qty ?? 0) * Number(m.actual_unit_cost ?? 0),
    0
  );
  const totalAct = actualJobMaterialCost > 0 ? actualJobMaterialCost : detailActual;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-800">
          📦 Material expenses
        </p>
        <div className="flex gap-3 text-[11px]">
          <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600">
            Est. {money(totalEst)}
          </span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
            Actual {money(totalAct)}
          </span>
        </div>
      </div>

      {materials.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-400">
          No materials posted yet for this job.
        </p>
      )}

      <div className="space-y-2">
        {materials.map((m) => {
          const isEditing = editingId === m.material_id;
          const estLine =
            Number(m.estimated_qty ?? 0) * Number(m.estimated_unit_cost ?? 0);
          const actLine =
            Number(m.actual_qty ?? 0) * Number(m.actual_unit_cost ?? 0);

          if (isEditing) {
            return (
              <div
                key={m.material_id}
                className="rounded-xl border-2 border-amber-300 bg-amber-50/50 p-3"
              >
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                  Editing — correct any field
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="mb-0.5 block text-[10px] text-gray-500">
                      Name
                    </label>
                    <input
                      className={inputClass}
                      value={(draft.material_name as string) ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, material_name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-gray-500">
                      Spec
                    </label>
                    <input
                      className={inputClass}
                      value={(draft.specification as string) ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, specification: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-gray-500">
                      Unit
                    </label>
                    <input
                      className={inputClass}
                      value={(draft.unit as string) ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, unit: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-gray-500">
                      Est. qty
                    </label>
                    <input
                      type="number"
                      className={inputClass}
                      value={
                        draft.estimated_qty === null ||
                        draft.estimated_qty === undefined
                          ? ""
                          : String(draft.estimated_qty)
                      }
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          estimated_qty:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value)
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-gray-500">
                      Est. unit ₱
                    </label>
                    <input
                      type="number"
                      className={inputClass}
                      value={
                        draft.estimated_unit_cost === null ||
                        draft.estimated_unit_cost === undefined
                          ? ""
                          : String(draft.estimated_unit_cost)
                      }
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          estimated_unit_cost:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value)
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-gray-500">
                      Actual qty
                    </label>
                    <input
                      type="number"
                      className={inputClass}
                      value={
                        draft.actual_qty === null ||
                        draft.actual_qty === undefined
                          ? ""
                          : String(draft.actual_qty)
                      }
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          actual_qty:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value)
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-gray-500">
                      Actual unit ₱
                    </label>
                    <input
                      type="number"
                      className={inputClass}
                      value={
                        draft.actual_unit_cost === null ||
                        draft.actual_unit_cost === undefined
                          ? ""
                          : String(draft.actual_unit_cost)
                      }
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          actual_unit_cost:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value)
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-gray-500">
                      Status
                    </label>
                    <select
                      className={inputClass}
                      value={(draft.status as string) ?? "planned"}
                      onChange={(e) =>
                        setDraft({ ...draft, status: e.target.value })
                      }
                    >
                      <option value="planned">Planned</option>
                      <option value="ordered">Ordered</option>
                      <option value="available">Available</option>
                      <option value="used">Used</option>
                      <option value="shortage">Shortage</option>
                    </select>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={saveEdit}
                    className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={m.material_id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {m.material_name || "Unnamed material"}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {m.specification || "—"} · {m.unit || "unit"} ·{" "}
                  <span className="capitalize">{m.status || "planned"}</span>
                </p>
                <p className="mt-1 text-[11px] text-gray-600">
                  Est: {m.estimated_qty ?? "—"} ×{" "}
                  {money(m.estimated_unit_cost)} = {money(estLine)}
                  {" · "}
                  Act: {m.actual_qty ?? "—"} × {money(m.actual_unit_cost)} ={" "}
                  {money(actLine)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => startEdit(m)}
                  className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeMaterial(m.material_id)}
                  className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add new material */}
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          + Post actual material expense
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            placeholder="Material / expense description *"
            className={inputClass}
            value={form.material_name}
            onChange={(e) =>
              setForm({ ...form, material_name: e.target.value })
            }
          />
          <input
            placeholder="Receipt / specification (optional)"
            className={inputClass}
            value={form.specification}
            onChange={(e) =>
              setForm({ ...form, specification: e.target.value })
            }
          />
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Actual amount ₱ *"
            className={inputClass}
            value={form.actual_amount}
            onChange={(e) =>
              setForm({ ...form, actual_amount: e.target.value })
            }
          />
        </div>
        <p className="mt-1 text-[10px] text-gray-500">
          This posting is immediately treated as an actual cost for this Job ID. Evidence/receipt images remain handled by the existing job evidence feature.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openRecordedExpenses}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          📋 View recorded expenses
        </button>
        <button
          type="button"
          disabled={busy || !form.material_name.trim()}
          onClick={addMaterial}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? "Saving…" : "+ Record expense"}
        </button>
        </div>
      </div>

      {showRecordedExpenses && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div>
                <p className="text-sm font-bold text-gray-900">
                  📋 Recorded material expenses
                </p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  All material expense lines currently recorded for Job ID <span className="font-semibold text-gray-700">{jobId}</span>. This list is re-read directly from the database when opened, so older recordings are included.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRecordedExpenses(false);
                  setEditingId(null);
                }}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {recordedLoading ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-xs text-gray-400">Loading recorded expenses…</div>
              ) : recordedMaterials.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-xs text-gray-400">
                  No material expenses have been recorded for this job yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {recordedMaterials.map((m) => {
                    const isEditing = editingId === m.material_id;
                    const estLine =
                      Number(m.estimated_qty ?? 0) * Number(m.estimated_unit_cost ?? 0);
                    const actLine =
                      Number(m.actual_qty ?? 0) * Number(m.actual_unit_cost ?? 0);

                    if (isEditing) {
                      return (
                        <div
                          key={m.material_id}
                          className="rounded-xl border-2 border-amber-300 bg-amber-50/50 p-4"
                        >
                          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                            Editing — correct any field
                          </p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            <div className="col-span-2 sm:col-span-1">
                              <label className="mb-0.5 block text-[10px] text-gray-500">Name</label>
                              <input className={inputClass} value={(draft.material_name as string) ?? ""} onChange={(e) => setDraft({ ...draft, material_name: e.target.value })} />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-gray-500">Spec</label>
                              <input className={inputClass} value={(draft.specification as string) ?? ""} onChange={(e) => setDraft({ ...draft, specification: e.target.value })} />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-gray-500">Unit</label>
                              <input className={inputClass} value={(draft.unit as string) ?? ""} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-gray-500">Est. qty</label>
                              <input type="number" className={inputClass} value={draft.estimated_qty == null ? "" : String(draft.estimated_qty)} onChange={(e) => setDraft({ ...draft, estimated_qty: e.target.value === "" ? null : Number(e.target.value) })} />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-gray-500">Est. unit ₱</label>
                              <input type="number" className={inputClass} value={draft.estimated_unit_cost == null ? "" : String(draft.estimated_unit_cost)} onChange={(e) => setDraft({ ...draft, estimated_unit_cost: e.target.value === "" ? null : Number(e.target.value) })} />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-gray-500">Actual qty</label>
                              <input type="number" className={inputClass} value={draft.actual_qty == null ? "" : String(draft.actual_qty)} onChange={(e) => setDraft({ ...draft, actual_qty: e.target.value === "" ? null : Number(e.target.value) })} />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-gray-500">Actual unit ₱</label>
                              <input type="number" className={inputClass} value={draft.actual_unit_cost == null ? "" : String(draft.actual_unit_cost)} onChange={(e) => setDraft({ ...draft, actual_unit_cost: e.target.value === "" ? null : Number(e.target.value) })} />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-gray-500">Status</label>
                              <select className={inputClass} value={(draft.status as string) ?? "planned"} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                                <option value="planned">Planned</option>
                                <option value="ordered">Ordered</option>
                                <option value="available">Available</option>
                                <option value="used">Used</option>
                                <option value="shortage">Shortage</option>
                              </select>
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button type="button" disabled={busy} onClick={saveEdit} className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
                            <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600">Cancel</button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={m.material_id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900">{m.material_name || "Unnamed material"}</p>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium capitalize text-gray-600">{m.status || "planned"}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-gray-500">{m.specification || "No specification"} · {m.unit || "unit"}</p>
                          <div className="mt-2 grid gap-1 text-[11px] text-gray-600 sm:grid-cols-2">
                            <p>Estimated: {m.estimated_qty ?? "—"} × {money(m.estimated_unit_cost)} = <strong>{money(estLine)}</strong></p>
                            <p>Actual: {m.actual_qty ?? "—"} × {money(m.actual_unit_cost)} = <strong>{money(actLine)}</strong></p>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button type="button" onClick={() => startEdit(m)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50">Edit</button>
                          <button type="button" disabled={busy} onClick={() => removeMaterial(m.material_id)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
              <div className="flex gap-2 text-[11px]">
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-gray-600">Est. {money(totalEst)}</span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">Actual {money(totalAct)}</span>
              </div>
              <button type="button" onClick={() => { setShowRecordedExpenses(false); setEditingId(null); }} className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white">Done</button>
            </div>
          </div>
        </div>
      )}


      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
