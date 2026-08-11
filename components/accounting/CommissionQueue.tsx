"use client";

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

  async function markPaid(commissionId: string) {
    await supabase
      .from("job_commissions")
      .update({ status: "paid", paid_date: new Date().toISOString() })
      .eq("commission_id", commissionId);
    router.refresh();
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
            <p className="text-xs text-gray-500">₱{row.amount.toLocaleString()}</p>
          </div>
          {row.status === "payable" ? (
            <button
              onClick={() => markPaid(row.commission_id)}
              className="rounded-md border border-gray-800 px-3 py-1.5 text-xs font-medium"
            >
              Release ₱{row.amount.toLocaleString()}
            </button>
          ) : (
            <StatusBadge status={row.status} />
          )}
        </div>
      ))}
    </div>
  );
}
