"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AttachmentCategory } from "@/lib/types/database";

const CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  transaction: "Transaction photo",
  site_visit: "Site visit photo",
  approved_design: "Approved design photo",
  reference: "Desired sample photo"
};

// Uploads a photo to the private job-attachments bucket, then records it
// in job_attachments so it can be looked up later. Storage RLS enforces
// who's allowed to write into which job's folder — this component doesn't
// need to know the rules, just call it with the right ids.
//
// Bug fix: the "Desired sample photo" (category="reference") button used
// to force `capture="environment"` on the file input. On mobile browsers
// that opens the camera directly and skips the photo gallery entirely —
// but a "desired sample" is almost always something the client already
// sent (a screenshot, a photo from Messenger), not something taken on
// the spot. Forcing the camera made it look like the button did nothing,
// since there was no way to pick an existing photo. Camera capture now
// only applies to "site_visit" photos, where taking a photo on location
// is actually the point.
export function ImageUpload({
  jobId,
  jobOrderId,
  category,
  uploadedBy
}: {
  jobId: string;
  jobOrderId?: string;
  category: AttachmentCategory;
  uploadedBy: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `${jobId}/${category}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("job-attachments")
      .upload(path, file, { upsert: false });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { error: insertError } = await supabase.from("job_attachments").insert({
      job_id: jobId,
      job_order_id: jobOrderId ?? null,
      uploaded_by: uploadedBy,
      category,
      file_path: path
    });

    if (insertError) {
      setError(insertError.message);
      setUploading(false);
      return;
    }

    setUploading(false);
    e.target.value = "";
    router.refresh();
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="touch-target inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white/80 px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-white disabled:cursor-wait"
      >
        {uploading ? "Uploading…" : `+ ${CATEGORY_LABELS[category]}`}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={category === "site_visit" ? "environment" : undefined}
        className="hidden"
        onChange={handleFile}
        disabled={uploading}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
