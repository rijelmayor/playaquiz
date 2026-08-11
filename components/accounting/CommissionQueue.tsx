"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface CommissionRow {
  commission_id: string;
  agent_name: string;
  client_name: string;
  amount: number;
  status: string;
}

// Commission only releases once a job is complete and paid — the payable
// status is already set by the app logic that watches payments + job status,
// this component just lets accounting confirm and log the payout.
export function CommissionQueue({ rows }: { rows: CommissionRow[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const actionLock = useRef(false);

  async function markPaid(commissionId: string) {
    if (actionLock.current) return;
    actionLock.current = true; setSavingId(commissionId);
    const { error } = await supabase
      .from("job_commissions")
      .update({ status: "paid", paid_date: new Date().toISOString() })
      .eq("commission_id", commissionId);
    actionLock.current = false; setSavingId(null);
    if (!error) router.refresh();
  }

  return (
    <div className="rounded-xl border border-gray-200">
      <div className="border-b border-gray-200 px-4 py-3 text-sm text-gray-500">
        Commission payouts
      </div>
      {rows.map((row) => (
        <div
          key={row.commission_id}
          className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-0"
        >
          <div>
            <p className="text-sm font-medium">
              {row.client_name} - agent {row.agent_name}
            </p>
            <p className="text-xs text-gray-500">₱{row.amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          {row.status === "payable" ? (
            <button
              onClick={() => markPaid(row.commission_id)}
              disabled={savingId !== null}
              className="inline-flex items-center gap-2 rounded-md border border-gray-800 px-3 py-1.5 text-xs font-medium disabled:cursor-wait disabled:opacity-60"
            >
              {savingId === row.commission_id ? "Saving…" : "Release ₱"}{row.amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </button>
          ) : (
            <StatusBadge status={row.status} />
          )}
        </div>
      ))}
    </div>
  );
}
