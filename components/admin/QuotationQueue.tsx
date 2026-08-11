"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface QuotationRow {
  job_id: string;
  client_name: string;
  quoted_value: number;
}

export function QuotationQueue({ rows }: { rows: QuotationRow[] }) {
  const supabase = createClient();
  const router = useRouter();

  async function approve(jobId: string) {
    await supabase.from("jobs").update({ status: "approved" }).eq("job_id", jobId);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-gray-200">
      <div className="border-b border-gray-200 px-4 py-3 text-sm text-gray-500">
        Quotation approvals
      </div>
      {rows.map((row) => (
        <div
          key={row.job_id}
          className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-0"
        >
          <div>
            <p className="text-sm font-medium">{row.client_name}</p>
            <p className="text-xs text-gray-500">₱{row.quoted_value.toLocaleString()}</p>
          </div>
          <button
            onClick={() => approve(row.job_id)}
            className="rounded-md border border-gray-800 px-3 py-1.5 text-xs font-medium"
          >
            Approve
          </button>
        </div>
      ))}
    </div>
  );
}
