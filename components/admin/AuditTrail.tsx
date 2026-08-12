interface AuditRow {
  audit_id: string;
  action: string;
  table_name: string;
  record_id: string;
  actor_name: string | null;
  created_at: string;
}

export function AuditTrail({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">Recent audit trail</p>
        <p className="text-xs text-gray-500">Commercial and workflow changes are recorded with the user and timestamp.</p>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.slice(0, 12).map((row) => (
          <div key={row.audit_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-gray-800">{row.action.replaceAll("_", " ")}</p>
              <p className="text-[11px] text-gray-500">{row.table_name} · {row.record_id.slice(0, 12)} · {row.actor_name ?? "System"}</p>
            </div>
            <span className="text-[10px] text-gray-400">{new Date(row.created_at).toLocaleString("en-PH")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
