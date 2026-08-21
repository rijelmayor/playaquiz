interface PaidCommissionRow {
  commission_id: string;
  client_name: string;
  amount: number;
}

// Sales only needs to see commissions that are fully settled — accounting
// still owns the pending/payable workflow in their own portal. This is a
// simple read-only per-project breakdown, no status column since every
// row here is already "paid" by definition of the filter upstream.
export function PaidCommissions({ rows }: { rows: PaidCommissionRow[] }) {
  if (rows.length === 0) return null;

  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="mb-6 rounded-xl border border-gray-200">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <p className="text-sm text-gray-500">Commission paid per project</p>
        <p className="text-sm font-medium tabular-nums text-gray-900">
          ₱{total.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
      {rows.map((row) => (
        <div
          key={row.commission_id}
          className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-0"
        >
          <p className="text-sm font-medium text-gray-800">{row.client_name}</p>
          <p className="text-sm tabular-nums text-emerald-700">
            ₱{row.amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      ))}
    </div>
  );
}
