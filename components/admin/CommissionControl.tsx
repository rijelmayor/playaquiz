"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CommissionType } from "@/lib/types/database";

export interface AdminCommissionRow {
  commission_id: string;
  job_id: string;
  agent_name: string;
  client_name: string;
  commission_type: CommissionType;
  commission_value: number;
  split_pct: number;
  amount: number | null;
  status: string;
}

export function CommissionControl({ rows }: { rows: AdminCommissionRow[] }) {
  const supabase = createClient(); const router = useRouter();
  const [values, setValues] = useState<Record<string, { type: CommissionType; value: string }>>(
    Object.fromEntries(rows.map((r) => [r.commission_id, { type: r.commission_type ?? "percentage", value: String(r.commission_value ?? 0) }]))
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save(row: AdminCommissionRow) {
    const current = values[row.commission_id];
    const value = Math.max(0, Number(current?.value) || 0);
    setSaving(row.commission_id); setMessage(null);
    const { error } = await supabase.from("job_commissions").update({ commission_type: current?.type ?? "percentage", commission_value: value }).eq("commission_id", row.commission_id);
    setSaving(null);
    if (error) { setMessage(error.message); return; }
    setMessage("Commission rule saved. Amount recalculated automatically."); router.refresh();
  }

  if (!rows.length) return <div className="rounded-xl border border-dashed border-gray-300 bg-white p-5 text-center text-xs text-gray-500">No commission records yet.</div>;
  return <div className="rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-200 px-4 py-3"><p className="text-sm font-semibold text-gray-900">Commission control</p><p className="text-xs text-gray-500">Admin sets each commission as a percentage of the job value or as a fixed amount. Paid/void records are protected from recalculation.</p></div>{rows.map((row) => { const v = values[row.commission_id]; return <div key={row.commission_id} className="border-b border-gray-100 px-4 py-4 last:border-0"><div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-gray-900">{row.client_name}</p><p className="text-xs text-gray-500">{row.agent_name} · JOB-{row.job_id.slice(0, 8).toUpperCase()}</p></div><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{row.status}</span></div><div className="grid gap-2 sm:grid-cols-[160px_150px_1fr_auto] sm:items-end"><div><label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Commission type</label><select value={v?.type ?? "percentage"} onChange={(e) => setValues((p) => ({ ...p, [row.commission_id]: { ...(p[row.commission_id] ?? { value: "0" }), type: e.target.value as CommissionType } }))} disabled={row.status === "paid" || row.status === "void"} className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs"><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></div><div><label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Value</label><div className="relative"><input type="number" min="0" value={v?.value ?? "0"} onChange={(e) => setValues((p) => ({ ...p, [row.commission_id]: { ...(p[row.commission_id] ?? { type: "percentage" }), value: e.target.value } }))} disabled={row.status === "paid" || row.status === "void"} className="w-full rounded-md border border-gray-300 px-2.5 py-2 pr-8 text-xs" />{(v?.type ?? row.commission_type) === "percentage" && <span className="pointer-events-none absolute right-2 top-2 text-xs text-gray-400">%</span>}</div></div><div className="rounded-md bg-gray-50 px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-gray-400">Calculated commission</p><p className="text-sm font-bold text-gray-900">₱{(row.amount ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div><button onClick={() => save(row)} disabled={saving !== null || row.status === "paid" || row.status === "void"} className="rounded-md bg-[#0784c8] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving === row.commission_id ? "Saving…" : "Save"}</button></div></div>})}{message && <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-600">{message}</div>}</div>;
}
