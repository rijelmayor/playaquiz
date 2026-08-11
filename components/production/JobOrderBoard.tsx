"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { AttachmentGallery } from "@/components/shared/AttachmentGallery";
import type { JobOrder } from "@/lib/types/database";

const NEXT_STATUS: Record<string, JobOrder["status"]> = {
  sourcing: "in_production",
  in_production: "qa",
  qa: "ready_for_install",
  ready_for_install: "installed"
};

type JobOrderWithExtras = JobOrder & {
  client_name: string;
  approved_design_photos: { attachment_id: string; signed_url: string | null }[];
};

export function JobOrderBoard({
  rows,
  fabricatorId
}: {
  rows: JobOrderWithExtras[];
  fabricatorId: string;
}) {
  const supabase = createClient();
  const router = useRouter();

  async function advance(jobOrderId: string, current: string) {
    const next = NEXT_STATUS[current];
    if (!next) return;
    await supabase.from("job_orders").update({ status: next }).eq("job_order_id", jobOrderId);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-gray-200">
      <div className="border-b border-gray-200 px-4 py-3 text-sm text-gray-500">
        Job orders
      </div>
      {rows.map((row) => (
        <div key={row.job_order_id} className="border-b border-gray-100 px-4 py-3 last:border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{row.client_name}</p>
              <p className="text-xs text-gray-500">
                deadline {row.deadline ?? "—"}
                {row.logistics_vendor && ` · via ${row.logistics_vendor}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={row.status} />
              {NEXT_STATUS[row.status] && (
                <button
                  onClick={() => advance(row.job_order_id, row.status)}
                  className="rounded-md border border-gray-800 px-3 py-1.5 text-xs font-medium"
                >
                  Advance
                </button>
              )}
            </div>
          </div>

          <div className="mt-3">
            <ImageUpload
              jobId={row.job_id}
              jobOrderId={row.job_order_id}
              category="approved_design"
              uploadedBy={fabricatorId}
            />
          </div>

          {row.approved_design_photos.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-400">Approved design</p>
              <AttachmentGallery attachments={row.approved_design_photos} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
