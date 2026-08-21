"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AttachmentCategory } from "@/lib/types/database";
import { compressImage, newStoragePath } from "@/components/shared/ImageUpload";

type Attachment = {
  attachment_id: string;
  file_path?: string;
  signed_url: string | null;
};

const LABELS: Record<string, string> = {
  transaction: "Transaction photo",
  site_visit: "Site visit photo",
  reference: "Sample Mock Up"
};

const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024;

export function AttachmentGallery({
  attachments,
  jobId,
  category,
  uploadedBy,
  editable = false
}: {
  attachments: Attachment[];
  jobId?: string;
  category?: AttachmentCategory;
  uploadedBy?: string;
  editable?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (attachments.length === 0) return null;

  const canEdit = editable && Boolean(jobId && category && uploadedBy);

  async function replaceImage(attachment: Attachment, file: File) {
    if (!jobId || !category || !uploadedBy || !attachment.file_path) return;
    setBusyId(attachment.attachment_id);
    setMessage(null);

    try {
      if (!file.type.startsWith("image/")) throw new Error("Please select an image file.");
      if (file.size > MAX_SOURCE_FILE_BYTES) {
        throw new Error("Please choose an image below 10 MB.");
      }

      const blob = await compressImage(file);
      const newPath = newStoragePath(jobId, category);

      const { error: uploadError } = await supabase.storage
        .from("job-attachments")
        .upload(newPath, blob, {
          upsert: false,
          contentType: "image/webp",
          cacheControl: "31536000"
        });
      if (uploadError) throw uploadError;

      const { data: inserted, error: insertError } = await supabase
        .from("job_attachments")
        .insert({
          job_id: jobId,
          uploaded_by: uploadedBy,
          category,
          file_path: newPath,
          caption: "Replaced image · optimized"
        })
        .select("attachment_id")
        .single();

      if (insertError || !inserted) {
        await supabase.storage.from("job-attachments").remove([newPath]);
        throw insertError ?? new Error("The replacement image record could not be created.");
      }

      const { error: deleteRowError } = await supabase
        .from("job_attachments")
        .delete()
        .eq("attachment_id", attachment.attachment_id);

      if (deleteRowError) {
        await supabase.from("job_attachments").delete().eq("attachment_id", inserted.attachment_id);
        await supabase.storage.from("job-attachments").remove([newPath]);
        throw deleteRowError;
      }

      const { error: removeOldError } = await supabase.storage
        .from("job-attachments")
        .remove([attachment.file_path]);

      if (removeOldError) {
        setMessage("Image replaced, but the old storage file could not be removed.");
      } else {
        setMessage("Image replaced.");
      }

      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Image replacement failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteImage(attachment: Attachment) {
    if (!jobId || !category || !uploadedBy || !attachment.file_path) return;
    const confirmed = window.confirm(
      `Delete this ${LABELS[category] ?? "image"}? This cannot be undone.`
    );
    if (!confirmed) return;

    setBusyId(attachment.attachment_id);
    setMessage(null);

    try {
      const { error: deleteRowError } = await supabase
        .from("job_attachments")
        .delete()
        .eq("attachment_id", attachment.attachment_id);

      if (deleteRowError) throw deleteRowError;

      const { error: removeError } = await supabase.storage
        .from("job-attachments")
        .remove([attachment.file_path]);

      if (removeError) {
        setMessage("Image deleted from the record, but its storage file could not be removed.");
      } else {
        setMessage("Image deleted.");
      }

      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Image deletion failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap gap-3">
      {attachments.map((a) =>
        a.signed_url ? (
          <div key={a.attachment_id} className="group relative w-20 sm:w-[72px]">
            <a href={a.signed_url} target="_blank" rel="noreferrer" title="Open image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.signed_url}
                alt={LABELS[category ?? ""] ?? "attachment"}
                className="h-20 w-20 rounded-lg border border-gray-200 object-cover shadow-sm transition group-hover:opacity-90 sm:h-[72px] sm:w-[72px]"
              />
            </a>

            {canEdit && (
              <div className="mt-1 flex gap-1">
                <input
                  ref={(el) => { inputRefs.current[a.attachment_id] = el; }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={busyId === a.attachment_id}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void replaceImage(a, file);
                  }}
                />
                <button
                  type="button"
                  disabled={busyId === a.attachment_id}
                  onClick={() => inputRefs.current[a.attachment_id]?.click()}
                  className="flex-1 rounded-md border border-cyan-200 bg-white px-1.5 py-1 text-[10px] font-semibold text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"
                >
                  {busyId === a.attachment_id ? "…" : "Replace"}
                </button>
                <button
                  type="button"
                  disabled={busyId === a.attachment_id}
                  onClick={() => void deleteImage(a)}
                  className="rounded-md border border-red-200 bg-white px-1.5 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ) : null
      )}

      {message && (
        <p className="w-full text-[10px] text-gray-500">{message}</p>
      )}
    </div>
  );
}
