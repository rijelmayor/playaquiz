export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-t-2 border-t-amber-400 bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}
