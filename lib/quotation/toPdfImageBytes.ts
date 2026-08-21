/**
 * Browser-only: convert arbitrary image bytes into PNG/JPEG for pdf-lib.
 *
 * CRM uploads are stored as WebP. pdf-lib cannot embed WebP. This module is
 * safe to import from client components — it never touches Node/sharp.
 *
 * Server-side conversion is handled in the email route with sharp so webpack
 * does not try to bundle native modules into the browser build.
 */

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Browser-side any raster format → PNG via createImageBitmap + canvas. */
async function browserToPng(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof createImageBitmap === "undefined" || typeof document === "undefined") {
    return null;
  }
  try {
    const blob = new Blob([bytes as BlobPart]);
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      const pngBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!pngBlob) return null;
      return new Uint8Array(await pngBlob.arrayBuffer());
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/**
 * Ensure bytes are PNG or JPEG so pdf-lib can embed them (browser only).
 */
export async function toPdfImageBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (!bytes?.length) return null;
  if (isPng(bytes) || isJpeg(bytes)) return bytes;
  return browserToPng(bytes);
}

/** Convert a list of image buffers; drops any that cannot be made PDF-safe. */
export async function toPdfImageBytesList(list: Uint8Array[]): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (const bytes of list) {
    const safe = await toPdfImageBytes(bytes);
    if (safe) out.push(safe);
  }
  return out;
}
