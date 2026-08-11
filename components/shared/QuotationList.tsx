import { QuotationDocumentActions, type QuotationForDocument } from "@/components/shared/QuotationDocumentActions";
import type { QuotationSettings } from "@/lib/types/database";

export function QuotationList({
  quotations,
  settings,
  defaultEmail
}: {
  quotations: QuotationForDocument[];
  settings: QuotationSettings | null;
  defaultEmail: string | null;
}) {
  if (quotations.length === 0) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Quotations</p>
      {quotations.map((q) => (
        <div key={q.quotation_id} className="rounded-xl border border-black/10 bg-white/60 p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-medium text-gray-700">
              {q.project_job_id ?? q.quotation_id.slice(0, 8).toUpperCase()}
            </p>
            <p className="text-xs text-gray-400">
              {new Date(q.created_at).toLocaleDateString("en-PH", {
                year: "numeric",
                month: "short",
                day: "numeric"
              })}
            </p>
          </div>
          <QuotationDocumentActions quotation={q} settings={settings} defaultEmail={defaultEmail} />
        </div>
      ))}
    </div>
  );
}
