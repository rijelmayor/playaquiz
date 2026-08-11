import type { SupabaseClient } from "@supabase/supabase-js";

// createSignedUrls (plural) signs every path in a single Storage API call,
// instead of one round-trip per photo — the page used to await
// createSignedUrl() in a loop, so load time scaled with photo count.
export async function signAttachmentUrls<T extends { file_path: string }>(
  supabase: SupabaseClient,
  attachments: T[]
): Promise<(T & { signed_url: string | null })[]> {
  if (attachments.length === 0) return [];

  const { data: signed } = await supabase.storage
    .from("job-attachments")
    .createSignedUrls(
      attachments.map((a) => a.file_path),
      3600
    );

  return attachments.map((a, i) => ({
    ...a,
    signed_url: signed?.[i]?.signedUrl ?? null
  }));
}
