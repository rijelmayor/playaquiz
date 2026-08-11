"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface JobForPayment {
  job_id: string;
  client_name: string;
  quoted_value: number | null;
  final_value: number | null;
}

// Logging a 'balance' payment here is what lets the pending → payable
// commission trigger fire, once the job also shows installed/paid/closed.
export function PaymentLogger({ rows }: { rows: JobForPayment[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [type, setType] = useState<"down_payment" | "balance">("down_payment");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const actionLock = useRef(false);
  const router = useRouter();
  const supabase = createClient();

  async function logPayment(jobId: string) {
    if (!amount || saving || actionLock.current) return;
    actionLock.current = true; setSaving(true);
    const { error } = await supabase.from("payments").insert({
      job_id: jobId,
      type,
      amount: Number(amount),
      status: "received",
      paid_date: new Date().toISOString()
    });
    actionLock.current = false; setSaving(false);
    if (error) return;
    setOpenId(null);
    setAmount("");
    router.refresh();
  }

  if (rows.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-gray-200">
      <div className="border-b border-gray-200 px-4 py-3 text-sm text-gray-500">
        Log a payment
      </div>
      {rows.map((row) => (
        <div key={row.job_id} className="border-b border-gray-100 px-4 py-3 last:border-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {row.client_name}
              <span className="ml-2 text-xs text-gray-500">
                ₱{(row.final_value ?? row.quoted_value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </p>
            <button
              onClick={() => setOpenId(openId === row.job_id ? null : row.job_id)}
              className="rounded-md border border-gray-800 px-3 py-1.5 text-xs font-medium"
            >
              Log payment
            </button>
          </div>
          {openId === row.job_id && (
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              >
                <option value="down_payment">Down payment</option>
                <option value="balance">Balance</option>
              </select>
              <input
                type="number" step="0.01"
                placeholder="Amount ₱"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              />
              <button
                onClick={() => logPayment(row.job_id)}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-wait disabled:opacity-60"
              >
                {saving && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {saving ? "Saving…" : "Confirm received"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
