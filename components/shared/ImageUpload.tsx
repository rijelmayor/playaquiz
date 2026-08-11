"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AttachmentCategory } from "@/lib/types/database";

const CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  transaction: "Transaction photo",
  site_visit: "Site visit photo",
  approved_design: "Approved design photo",
  reference: "Desired sample photo",
  order_reference: "Order reference image",
  production_progress: "Production progress photo",
  qc: "QC photo",
  installation_proof: "Installation proof"
};

// Free-tier storage protection:
// - Reject unusually large source files before decoding them.
// - Resize to a sensible CRM viewing size.
// - Compress to WebP and keep each stored image <= 1.5 MB.
// Supabase independently enforces a hard 2 MB bucket limit.
const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024;
const TARGET_BYTES = 1.5 * 1024 * 1024;
const MAX_DIMENSION = 2200;
const START_QUALITY = 0.82;
const MIN_QUALITY = 0.55;
const QUALITY_STEP = 0.07;
const MAX_FILES_PER_ACTION = 10;

// Approved design is the single current fabrication reference.
// Evidence categories intentionally keep their history.
const REPLACE_EXISTING_CATEGORIES = new Set<AttachmentCategory>(["approved_design"]);

function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function newStoragePath(jobId: string, category: AttachmentCategory, jobOrderId?: string) {
  const token = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (category === "approved_design") {
    return `${jobId}/${category}/current-${jobOrderId}-${token}.webp`;
  }

  return `${jobId}/${category}/${token}.webp`;
}

async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please select an image file.");
  }

  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error(`That image is ${formatMb(file.size)}. Please choose an image below 10 MB.`);
  }

  const bitmap = await createImageBitmap(file);

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Your browser could not prepare this image. Try another image.");
    }

    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = START_QUALITY;
    let blob: Blob | null = null;

    while (quality >= MIN_QUALITY) {
      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/webp", quality);
      });

      if (blob && blob.size <= TARGET_BYTES) {
        break;
      }

      quality -= QUALITY_STEP;
    }

    if (!blob) {
      throw new Error("The image could not be compressed.");
    }

    if (blob.size > TARGET_BYTES) {
      throw new Error(
        `This image could not be reduced below ${formatMb(TARGET_BYTES)}. Please choose a smaller image.`
      );
    }

    return blob;
  } finally {
    bitmap.close();
  }
}

export function ImageUpload({
  jobId,
  jobOrderId,
  category,
  uploadedBy,
  multiple = false
}: {
  jobId: string;
  jobOrderId?: string;
  category: AttachmentCategory;
  uploadedBy: string;
  multiple?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const uploadLock = useRef(false);
  const supabase = createClient();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const replace = REPLACE_EXISTING_CATEGORIES.has(category);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);

    if (files.length === 0 || uploadLock.current) return;

    uploadLock.current = true;
    setUploading(true);
    setError(null);
    setProgress("Preparing image…");

    let cleanupWarning = false;

    try {
      if (replace && !jobOrderId) {
        throw new Error("Approved design replacement requires a Job Order.");
      }

      if (files.length > MAX_FILES_PER_ACTION) {
        throw new Error(`Please upload no more than ${MAX_FILES_PER_ACTION} images at one time.`);
      }

      // Approved design is always one current source of truth.
      const filesToUpload = replace ? files.slice(0, 1) : files;

      if (replace && files.length > 1) {
        setProgress("Only the first approved design image will be used…");
      }

      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];

        setProgress(`Optimizing image ${i + 1} of ${filesToUpload.length}…`);
        const blob = await compressImage(file);

        const path = newStoragePath(jobId, category, jobOrderId);

        // Read the current design BEFORE uploading the replacement.
        // If optimization/upload/insert fails, the existing design remains intact.
        let previous: { attachment_id: string; file_path: string }[] = [];

        if (replace) {
          const { data, error: previousError } = await supabase
            .from("job_attachments")
            .select("attachment_id,file_path")
            .eq("job_id", jobId)
            .eq("job_order_id", jobOrderId!)
            .eq("category", category);

          if (previousError) throw previousError;
          previous = data ?? [];
        }

        setProgress(`Uploading optimized image ${i + 1} of ${filesToUpload.length}…`);

        const { error: uploadError } = await supabase.storage
          .from("job-attachments")
          .upload(path, blob, {
            upsert: false,
            contentType: "image/webp",
            cacheControl: "31536000"
          });

        if (uploadError) throw uploadError;

        const { data: inserted, error: insertError } = await supabase
          .from("job_attachments")
          .insert({
            job_id: jobId,
            job_order_id: jobOrderId ?? null,
            uploaded_by: uploadedBy,
            category,
            file_path: path,
            caption: `${file.name} · optimized ${formatMb(blob.size)}`
          })
          .select("attachment_id")
          .single();

        if (insertError || !inserted) {
          // New file has no DB reference; remove it and leave the old design untouched.
          await supabase.storage.from("job-attachments").remove([path]);
          throw insertError ?? new Error("The attachment record could not be created.");
        }

        if (replace && previous.length > 0) {
          setProgress("Removing previous approved design…");

          // Remove old DB rows first. If this fails, keep the old storage files too;
          // the new design is already safely stored and visible.
          const oldIds = previous
            .map((row) => row.attachment_id)
            .filter((id) => id !== inserted.attachment_id);

          const { error: deleteRowsError } = await supabase
            .from("job_attachments")
            .delete()
            .in("attachment_id", oldIds);

          if (deleteRowsError) {
            cleanupWarning = true;
            setError(
              "New approved design was saved, but the previous record could not be cleaned up. Please contact Admin."
            );
            continue;
          }

          const oldPaths = previous
            .map((row) => row.file_path)
            .filter((oldPath) => oldPath !== path);

          if (oldPaths.length > 0) {
            const { error: removeError } = await supabase
              .storage
              .from("job-attachments")
              .remove(oldPaths);

            if (removeError) {
              // The DB is already correct. The old files can be cleaned up later
              // without affecting the current approved design.
              cleanupWarning = true;
              setError(
                "New approved design was saved, but an older file could not be removed from Storage."
              );
            }
          }
        }
      }

      if (!cleanupWarning) {
        setProgress("Saved.");
      }

      e.target.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      uploadLock.current = false;
      setUploading(false);
      setTimeout(() => setProgress(""), 1600);
    }
  }

  const buttonLabel = replace
    ? "Replace approved design"
    : `+ ${CATEGORY_LABELS[category]}${multiple ? "s" : ""}`;

  return (
    <div className="inline-flex max-w-full flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="touch-target inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white/80 px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-white disabled:cursor-wait disabled:opacity-60"
      >
        {uploading && (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800" />
        )}
        {uploading ? progress || "Saving…" : buttonLabel}
      </button>

      <p className="text-[10px] text-gray-400">
        {replace
          ? "Replaces the current approved design. The old design is removed after the new one is saved."
          : "Images are automatically resized/compressed to help conserve storage."}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={replace ? false : multiple}
        capture={category === "site_visit" ? "environment" : undefined}
        className="hidden"
        onChange={handleFile}
        disabled={uploading}
      />

      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
