"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface QuotationRow {
  job_id: string;
  client_name: string;
  quoted_value: number;
  quotation_id: string | null;
  version: number | null;
}

export function QuotationQueue({ rows }: { rows: QuotationRow[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const actionLock = useRef(false);

  async function approve(jobId: string) {
    if (actionLock.current) return;
    actionLock.current = true; setSavingId(jobId);
    await supabase.from("jobs").update({ status: "approved" }).eq("job_id", jobId);
    await supabase.from("quotations").update({ quotation_status: "accepted" }).eq("job_id", jobId).in("quotation_status", ["draft", "sent"]);
    actionLock.current = false; setSavingId(null);
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
            <p className="text-xs text-gray-500">₱{row.quoted_value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.version ? `· v${row.version}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            {row.quotation_id && <a href={`/admin/quotations/${row.quotation_id}/edit`} className="rounded-md border border-cyan-600/40 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-[#087eb9]">Edit quote</a>}
          <button
            onClick={() => approve(row.job_id)}
            disabled={savingId !== null}
            className="rounded-md border border-gray-800 px-3 py-1.5 text-xs font-medium"
          >
            Approve
          </button>
          </div>
        </div>
      ))}
    </div>
  );
}
