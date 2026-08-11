// One badge component, one place to change status colors for the whole CRM.
const STATUS_STYLES: Record<string, string> = {
  lead: "bg-gray-50 text-gray-600 ring-gray-200",
  site_visit: "bg-amber-50 text-amber-700 ring-amber-200",
  design_review: "bg-blue-50 text-blue-700 ring-blue-200",
  quoted: "bg-blue-50 text-blue-700 ring-blue-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  in_production: "bg-amber-50 text-amber-700 ring-amber-200",
  installed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-gray-50 text-gray-600 ring-gray-200",
  cancelled: "bg-red-50 text-red-700 ring-red-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  payable: "bg-blue-50 text-blue-700 ring-blue-200",
  void: "bg-red-50 text-red-700 ring-red-200",
  // Customer follow-up statuses (separate from pipeline status above)
  follow_up: "bg-amber-50 text-amber-700 ring-amber-200",
  drawing: "bg-blue-50 text-blue-700 ring-blue-200",
  other: "bg-purple-50 text-purple-700 ring-purple-200"
};

const STATUS_LABELS: Record<string, string> = {
  follow_up: "Follow Up",
  drawing: "Drawing",
  other: "Others"
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-gray-50 text-gray-600 ring-gray-200";
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${style}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
