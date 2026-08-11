"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface JobOrderRow {
  job_order_id: string;
  client_name: string;
  estimated_materials_cost: number | null;
  estimated_labor_cost: number | null;
  estimated_logistics_cost: number | null;
  funds_release_status: string;
}

// Handles releases to fabrication for materials/labor/logistics.
// Deliberately separate from commission payout below — different
// trigger, different timing, easy to mix up if merged into one list.
export function FundReleaseQueue({ rows, accountingUserId }: { rows: JobOrderRow[]; accountingUserId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<"materials" | "labor" | "logistics">("materials");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const actionLock = useRef(false);
  const router = useRouter();
  const supabase = createClient();

  async function release(jobOrderId: string) {
    if (!amount || Number(amount) <= 0 || saving || actionLock.current) return;
    actionLock.current = true; setSaving(true);
    const { error } = await supabase.from("fund_releases").insert({
      job_order_id: jobOrderId,
      released_by: accountingUserId,
      category,
      amount: Number(amount),
      note
    });
    actionLock.current = false; setSaving(false);
    if (error) return;
    setOpenId(null);
    setAmount("");
    setNote("");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-gray-200">
      <div className="border-b border-gray-200 px-4 py-3 text-sm text-gray-500">
        Release funds to fabrication
      </div>
      {rows.map((row) => (
        <div key={row.job_order_id} className="border-b border-gray-100 px-4 py-3 last:border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{row.client_name}</p>
              <p className="text-xs text-gray-500">
                est. materials ₱{(row.estimated_materials_cost ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · labor ₱
                {(row.estimated_labor_cost ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · logistics ₱
                {(row.estimated_logistics_cost ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={row.funds_release_status} />
              <button
                onClick={() => setOpenId(openId === row.job_order_id ? null : row.job_order_id)}
                className="rounded-md border border-gray-800 px-3 py-1.5 text-xs font-medium"
              >
                Release
              </button>
            </div>
          </div>
          {openId === row.job_order_id && (
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              >
                <option value="materials">Materials</option>
                <option value="labor">Labor</option>
                <option value="logistics">Logistics</option>
              </select>
              <input
                type="number" step="0.01"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              />
              <input
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              />
              <button
                onClick={() => release(row.job_order_id)}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-wait disabled:opacity-60"
              >
                {saving && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
