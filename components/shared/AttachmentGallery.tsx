// Renders small thumbnails for a set of attachments. Expects signed_url to
// already be resolved (server components fetch these via
// supabase.storage.from("job-attachments").createSignedUrl before passing
// attachments down, since the bucket is private).
export function AttachmentGallery({
  attachments
}: {
  attachments: { attachment_id: string; signed_url: string | null }[];
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a) =>
        a.signed_url ? (
          <a key={a.attachment_id} href={a.signed_url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.signed_url}
              alt="attachment"
              className="h-16 w-16 rounded-lg sm:h-14 sm:w-14 border border-gray-200 object-cover shadow-sm transition hover:opacity-80"
            />
          </a>
        ) : null
      )}
    </div>
  );
}
