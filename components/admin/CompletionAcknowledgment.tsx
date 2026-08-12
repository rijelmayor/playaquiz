"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface CompletionRow {
  acknowledgment_id: string;
  job_id: string;
  client_name: string;
  display_job_id: string;
  status: "pending" | "accepted" | "correction_requested";
  customer_name: string | null;
  authorized_representative: string | null;
  signature_name: string | null;
  remarks: string | null;
  installation_checked: boolean;
  project_received: boolean;
}

export function CompletionAcknowledgment({ rows, adminId }: { rows: CompletionRow[]; adminId: string }) {
  const supabase = createClient(); const router = useRouter();
  const [open, setOpen] = useState<string | null>(null); const [saving, setSaving] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, Partial<CompletionRow>>>({});

  function value(row: CompletionRow) { return { ...row, ...(form[row.acknowledgment_id] ?? {}) }; }
  function patch(id: string, p: Partial<CompletionRow>) { setForm((f) => ({ ...f, [id]: { ...(f[id] ?? {}), ...p } })); }
  async function save(row: CompletionRow) {
    const v = value(row);
    if (!v.customer_name?.trim() || !v.signature_name?.trim()) { setError("Customer name and authorized signature/name are required."); return; }
    if (!v.installation_checked || !v.project_received) { setError("Confirm installation checked and project received before accepting."); return; }
    setSaving(row.acknowledgment_id); setError(null);
    const { error: saveError } = await supabase.from("job_acknowledgments").update({ status: "accepted", customer_name: v.customer_name.trim(), authorized_representative: v.authorized_representative?.trim() || null, signature_name: v.signature_name.trim(), remarks: v.remarks?.trim() || null, installation_checked: true, project_received: true, accepted_at: new Date().toISOString(), updated_by: adminId }).eq("acknowledgment_id", row.acknowledgment_id);
    setSaving(null); if (saveError) { setError(saveError.message); return; } setOpen(null); router.refresh();
  }
  if (!rows.length) return null;
  return <div className="rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-200 px-4 py-3"><p className="text-sm font-semibold text-gray-900">Customer completion acknowledgments</p><p className="text-xs text-gray-500">Complete this after installation to close the customer-facing transaction record.</p></div>{rows.map((row) => { const v = value(row); return <div key={row.acknowledgment_id} className="border-b border-gray-100 px-4 py-4 last:border-0"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{row.client_name}</p><p className="text-xs text-gray-500">{row.display_job_id}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${row.status === "accepted" ? "bg-cyan-50 text-[#087eb9]" : "bg-amber-50 text-amber-700"}`}>{row.status.replace("_", " ")}</span></div>{row.status !== "accepted" && <><button onClick={() => setOpen(open === row.acknowledgment_id ? null : row.acknowledgment_id)} className="mt-3 rounded-md border border-[#087eb9]/40 bg-cyan-50 px-3 py-2 text-xs font-semibold text-[#087eb9]">{open === row.acknowledgment_id ? "Close form" : "Complete acknowledgment"}</button>{open === row.acknowledgment_id && <div className="mt-3 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2"><input value={v.customer_name ?? ""} onChange={(e) => patch(row.acknowledgment_id, { customer_name: e.target.value })} placeholder="Customer / company name" className="rounded-md border border-gray-300 px-3 py-2 text-xs" /><input value={v.authorized_representative ?? ""} onChange={(e) => patch(row.acknowledgment_id, { authorized_representative: e.target.value })} placeholder="Authorized representative" className="rounded-md border border-gray-300 px-3 py-2 text-xs" /><input value={v.signature_name ?? ""} onChange={(e) => patch(row.acknowledgment_id, { signature_name: e.target.value })} placeholder="Signature / printed name" className="rounded-md border border-gray-300 px-3 py-2 text-xs" /><label className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs"><input type="checkbox" checked={Boolean(v.installation_checked)} onChange={(e) => patch(row.acknowledgment_id, { installation_checked: e.target.checked })} /> Installation inspected</label><label className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs"><input type="checkbox" checked={Boolean(v.project_received)} onChange={(e) => patch(row.acknowledgment_id, { project_received: e.target.checked })} /> Project received / accepted</label><textarea value={v.remarks ?? ""} onChange={(e) => patch(row.acknowledgment_id, { remarks: e.target.value })} rows={3} placeholder="Customer remarks" className="sm:col-span-2 rounded-md border border-gray-300 px-3 py-2 text-xs" />{error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}<div className="sm:col-span-2 flex justify-end"><button onClick={() => save(row)} disabled={saving !== null} className="rounded-md bg-[#0784c8] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving === row.acknowledgment_id ? "Saving…" : "Accept & complete transaction"}</button></div></div>}</>}</div>})}</div>;
}
