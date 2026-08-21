"use client";

import { useMemo, useState } from "react";

type EvidenceImage = {
  attachment_id: string;
  signed_url: string | null;
  caption?: string | null;
};

type EvidenceGroup = {
  key: "transaction" | "site_visit" | "reference";
  label: string;
  images: EvidenceImage[];
  badgeClass: string;
};

export function AdminJobEvidencePreview({
  jobId,
  transactionPhotos,
  siteVisitPhotos,
  referencePhotos
}: {
  jobId: string;
  transactionPhotos: EvidenceImage[];
  siteVisitPhotos: EvidenceImage[];
  referencePhotos: EvidenceImage[];
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [hovered, setHovered] = useState<EvidenceImage | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  const groups = useMemo<EvidenceGroup[]>(
    () => [
      {
        key: "transaction",
        label: "Transaction Photo",
        images: transactionPhotos,
        badgeClass: "bg-sky-50 text-sky-700 ring-sky-200"
      },
      {
        key: "site_visit",
        label: "Site Visit Photo",
        images: siteVisitPhotos,
        badgeClass: "bg-amber-50 text-amber-700 ring-amber-200"
      },
      {
        key: "reference",
        label: "Sample Mock Up",
        images: referencePhotos,
        badgeClass: "bg-violet-50 text-violet-700 ring-violet-200"
      }
    ],
    [transactionPhotos, siteVisitPhotos, referencePhotos]
  );

  const availableGroups = groups.filter((group) => group.images.some((image) => image.signed_url));
  const allImages = availableGroups.flatMap((group) =>
    group.images
      .filter((image) => image.signed_url)
      .map((image) => ({ ...image, label: group.label, groupKey: group.key }))
  );

  if (allImages.length === 0) {
    return (
      <div className="flex min-w-[120px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-2 py-2 text-[10px] text-gray-400">
        No images
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setViewerOpen(true)}
        onMouseLeave={() => setHovered(null)}
        className="group flex min-w-[170px] items-center gap-2 rounded-xl border border-gray-200 bg-white p-1.5 text-left shadow-sm transition hover:border-gray-300 hover:shadow-md"
        aria-label={`View all ${allImages.length} images for ${jobId}`}
      >
        <div className="flex shrink-0 items-start gap-1.5">
          {groups.map((group) => {
            const image = group.images.find((item) => item.signed_url);
            if (!image?.signed_url) return null;
            return (
              <div
                key={group.key}
                className="relative flex w-14 flex-col items-center"
                onMouseEnter={() => setHovered(image)}
                onMouseMove={(event) =>
                  setPointer({
                    x: Math.min(event.clientX + 18, Math.max(12, window.innerWidth - 300)),
                    y: Math.min(event.clientY + 18, Math.max(12, window.innerHeight - 250))
                  })
                }
              >
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.signed_url}
                    alt={group.label}
                    className="h-11 w-11 rounded-lg border border-gray-200 object-cover transition duration-150 group-hover:scale-[1.02]"
                  />
                  {group.images.length > 1 && (
                    <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-gray-900 px-1 text-center text-[8px] font-bold leading-4 text-white">
                      {group.images.length}
                    </span>
                  )}
                </div>
                <span className="mt-1 w-full truncate text-center text-[8px] font-semibold leading-3 text-gray-500">
                  {group.key === "transaction" ? "Transaction" : group.key === "site_visit" ? "Site Visit" : "Mock Up"}
                </span>
              </div>
            );
          })}
        </div>
        <div className="min-w-0 pr-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Job evidence</p>
          <p className="mt-0.5 text-[11px] font-semibold text-gray-800">
            {allImages.length} photo{allImages.length === 1 ? "" : "s"}
          </p>
          <p className="text-[9px] text-gray-400">Hover · Click for all</p>
        </div>
      </button>

      {hovered?.signed_url && (
        <div
          className="pointer-events-none fixed z-[80] hidden w-[280px] overflow-hidden rounded-xl border border-gray-200 bg-white p-2 shadow-2xl sm:block"
          style={{
            left: pointer.x,
            top: pointer.y
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hovered.signed_url}
            alt="Expanded job evidence preview"
            className="h-[190px] w-full rounded-lg object-contain bg-gray-50"
          />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-gray-600">
            {groups.find((group) => group.images.some((image) => image.attachment_id === hovered.attachment_id))?.label ?? "Job evidence"}
          </p>
          {hovered.caption && (
            <p className="mt-0.5 line-clamp-2 text-[10px] text-gray-400">{hovered.caption}</p>
          )}
        </div>
      )}

      {viewerOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={() => setViewerOpen(false)}
            aria-label="Close image viewer"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Job evidence for ${jobId}`}
            className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Job evidence</p>
                <h3 className="truncate text-sm font-bold text-gray-900 sm:text-base">{jobId}</h3>
                <p className="text-[10px] text-gray-400">All Sales portal images attached to this Job ID</p>
              </div>
              <button
                type="button"
                onClick={() => setViewerOpen(false)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto p-4 sm:p-5">
              <div className="grid gap-5 sm:grid-cols-2">
                {availableGroups.map((group) => (
                  <section key={group.key} className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ring-1 ${group.badgeClass}`}>
                        {group.label}
                      </span>
                      <span className="text-[10px] font-semibold text-gray-400">
                        {group.images.filter((image) => image.signed_url).length} image{group.images.filter((image) => image.signed_url).length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {group.images.filter((image) => image.signed_url).map((image) => (
                        <figure key={image.attachment_id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={image.signed_url!}
                            alt={group.label}
                            className="aspect-[4/3] w-full object-contain bg-gray-50"
                          />
                          <figcaption className="border-t border-gray-100 px-2.5 py-2">
                            <p className="text-[10px] font-bold text-gray-700">{group.label}</p>
                            {image.caption && <p className="mt-0.5 text-[9px] text-gray-400">{image.caption}</p>}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
