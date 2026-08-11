"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface DesignRow {
  design_id: string;
  job_id: string;
  client_name: string;
  revision_no: number;
  status: string;
  file_url: string | null;
}

export function DesignApprovalQueue({ rows }: { rows: DesignRow[] }) {
  const [newLink, setNewLink] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const actionLock = useRef(false);
  const router = useRouter();
  const supabase = createClient();

  async function approve(designId: string) {
    if (actionLock.current) return;
    actionLock.current = true; setSavingId(designId);
    await supabase.from("designs").update({ status: "approved" }).eq("design_id", designId);
    actionLock.current = false; setSavingId(null);
    router.refresh();
  }

  async function requestRevision(designId: string, jobId: string, revisionNo: number) {
    if (actionLock.current) return;
    actionLock.current = true; setSavingId(designId);
    await supabase.from("designs").update({ status: "revision_requested" }).eq("design_id", designId);
    const link = newLink[jobId];
    if (link) {
      await supabase.from("designs").insert({
        job_id: jobId,
        revision_no: revisionNo + 1,
        status: "pending",
        file_url: link
      });
    }
    setNewLink((s) => ({ ...s, [jobId]: "" }));
    actionLock.current = false; setSavingId(null);
    router.refresh();
  }

  if (rows.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-gray-200">
      <div className="border-b border-gray-200 px-4 py-3 text-sm text-gray-500">
        Design approvals
      </div>
      {rows.map((row) => (
        <div key={row.design_id} className="border-b border-gray-100 px-4 py-3 last:border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {row.client_name}
                <span className="ml-2 text-xs text-gray-400">rev {row.revision_no}</span>
                {row.revision_no > 2 && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                    revision fee applies
                  </span>
                )}
              </p>
              {row.file_url && (
                <a
                  href={row.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 underline"
                >
                  view mockup
                </a>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => approve(row.design_id)}
                disabled={savingId !== null}
                className="rounded-md border border-gray-800 px-3 py-1.5 text-xs font-medium"
              >
                {savingId === row.design_id ? "Saving…" : "Approve"}
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              placeholder="New revision link (if requesting changes)"
              value={newLink[row.job_id] ?? ""}
              onChange={(e) => setNewLink((s) => ({ ...s, [row.job_id]: e.target.value }))}
              className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
            />
            <button
              onClick={() => requestRevision(row.design_id, row.job_id, row.revision_no)}
              disabled={savingId !== null}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600"
            >
              {savingId === row.design_id ? "Saving…" : "Request revision"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
