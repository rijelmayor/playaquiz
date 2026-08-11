import type { JobProfitability } from "@/lib/types/database";

// Renders the job_profitability view as-is — all margin math already
// happened in Postgres, this component only formats and flags.
export function ProfitabilityView({
  rows
}: {
  rows: (JobProfitability & { client_name: string })[];
}) {
  return (
    <div className="rounded-xl border border-gray-200">
      <div className="border-b border-gray-200 px-4 py-3 text-sm text-gray-500">
        Per job
      </div>
      {rows.map((row) => (
        <div
          key={row.job_id}
          className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-0"
        >
          <div>
            <p className="text-sm font-medium">
              {row.client_name}
              {row.is_estimated && (
                <span className="ml-2 text-xs text-gray-400">(estimated)</span>
              )}
            </p>
            <p className="text-xs text-gray-500">
              value ₱{row.final_value?.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"} · materials ₱
              {row.materials_cost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · labor ₱
              {row.labor_cost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · logistics ₱
              {row.logistics_cost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · commission ₱
              {row.commission_cost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <p
              className={`text-sm font-medium ${
                (row.margin_pct ?? 0) < 20 ? "text-amber-600" : "text-green-700"
              }`}
            >
              ₱{row.net_profit?.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}
            </p>
            <p className="text-xs text-gray-500">{row.margin_pct ?? "—"}% margin</p>
          </div>
        </div>
      ))}
    </div>
  );
}
