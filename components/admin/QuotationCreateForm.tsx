"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface JobNeedingQuote {
  job_id: string;
  client_name: string;
  next_version: number;
}

// Jobs land here (site_visit / design_review, no live quotation yet)
// before they ever hit the QuotationQueue approval list — that queue only
// shows jobs already in status 'quoted', which nothing sets without this.
export function QuotationCreateForm({ rows }: { rows: JobNeedingQuote[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [total, setTotal] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const actionLock = useRef(false);
  const router = useRouter();
  const supabase = createClient();

  async function create(jobId: string, version: number) {
    if (!total || saving || actionLock.current) return;
    actionLock.current = true; setSaving(true);
    const { error } = await supabase.from("quotations").insert({
      job_id: jobId,
      version,
      total: Number(total),
      valid_until: validUntil || null
    });
    if (error) {
      actionLock.current = false; setSaving(false);
      return;
    }
    await supabase
      .from("jobs")
      .update({ status: "quoted", quoted_value: Number(total) })
      .eq("job_id", jobId);
    setOpenId(null);
    setTotal("");
    setValidUntil("");
    actionLock.current = false; setSaving(false);
    router.refresh();
  }

  if (rows.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-gray-200">
      <div className="border-b border-gray-200 px-4 py-3 text-sm text-gray-500">
        Needs quotation
      </div>
      {rows.map((row) => (
        <div key={row.job_id} className="border-b border-gray-100 px-4 py-3 last:border-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {row.client_name}
              {row.next_version > 1 && (
                <span className="ml-2 text-xs text-gray-400">rev v{row.next_version}</span>
              )}
            </p>
            <button
              onClick={() => setOpenId(openId === row.job_id ? null : row.job_id)}
              className="rounded-md border border-gray-800 px-3 py-1.5 text-xs font-medium"
            >
              Create quotation
            </button>
          </div>
          {openId === row.job_id && (
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                type="number" step="0.01"
                placeholder="Total (₱)"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                className="w-32 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              />
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              />
              <button
                onClick={() => create(row.job_id, row.next_version)}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-wait disabled:opacity-60"
              >
                {saving && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {saving ? "Saving…" : "Send to client"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
