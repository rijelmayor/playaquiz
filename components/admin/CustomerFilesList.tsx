import { CustomerStatusEditor } from "@/components/shared/CustomerStatusEditor";
import type { FollowUpStatus } from "@/lib/types/database";

interface CustomerFileRow {
  job_id: string;
  client_name: string;
  job_name: string | null;
  follow_up_status: FollowUpStatus;
  follow_up_note: string | null;
}

// Admin can edit the customer follow-up status on any job, not just their
// own — RLS ("admin full access jobs") already allows the write, this is
// just the view. Sales edits the same field from their own portal.
export function CustomerFilesList({ rows }: { rows: CustomerFileRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-gray-200">
      <div className="border-b border-gray-200 px-4 py-3 text-sm text-gray-500">
        Customer files
      </div>
      {rows.map((row) => (
        <div
          key={row.job_id}
          className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-0"
        >
          <div>
            <p className="text-sm font-medium">{row.job_name || row.client_name}</p>
            <p className="text-xs text-gray-500">{row.client_name}</p>
          </div>
          <CustomerStatusEditor
            jobId={row.job_id}
            status={row.follow_up_status}
            note={row.follow_up_note}
          />
        </div>
      ))}
    </div>
  );
}
