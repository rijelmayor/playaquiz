"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FOLLOW_UP_STATUS_LABELS, type FollowUpStatus } from "@/lib/types/database";

const STATUS_OPTIONS: FollowUpStatus[] = ["follow_up", "drawing", "approved", "other"];

const selectClass =
  "rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

// Sales sets this on their own jobs day-to-day; admin can edit/override
// any job's value (RLS: "sales updates own jobs" + "admin full access
// jobs" both already allow writes to follow_up_status/follow_up_note).
export function CustomerStatusEditor({
  jobId,
  status,
  note
}: {
  jobId: string;
  status: FollowUpStatus;
  note: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<FollowUpStatus>(status);
  const [noteValue, setNoteValue] = useState(note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function save() {
    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("jobs")
      .update({
        follow_up_status: value,
        follow_up_note: value === "other" ? noteValue || null : null
      })
      .eq("job_id", jobId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(status);
          setNoteValue(note ?? "");
          setEditing(true);
        }}
        className="inline-flex items-center gap-1"
        title="Edit status"
      >
        <StatusBadge status={status} />
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5 rounded-md border border-gray-200 bg-gray-50 p-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value as FollowUpStatus)}
        className={selectClass}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {FOLLOW_UP_STATUS_LABELS[opt]}
          </option>
        ))}
      </select>
      {value === "other" && (
        <input
          value={noteValue}
          onChange={(e) => setNoteValue(e.target.value)}
          placeholder="Note for 'Others'"
          className={`${selectClass} w-40`}
        />
      )}
      {error && <p className="max-w-[10rem] text-right text-[11px] text-red-600">{error}</p>}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
