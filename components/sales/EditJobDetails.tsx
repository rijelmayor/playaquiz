"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface EditableJob {
  job_id: string;
  client_id: string;
  client_name: string;
  contact: string | null;
  email: string | null;
  location: string | null;
  job_name: string | null;
  notes: string | null;
}

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";
const labelClass = "mb-1 block text-[11px] font-medium text-gray-500";

export function EditJobDetails({ job, onClose }: { job: EditableJob; onClose: () => void }) {
  const [name, setName] = useState(job.client_name);
  const [contact, setContact] = useState(job.contact ?? "");
  const [email, setEmail] = useState(job.email ?? "");
  const [location, setLocation] = useState(job.location ?? "");
  const [jobName, setJobName] = useState(job.job_name ?? "");
  const [notes, setNotes] = useState(job.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function save() {
    setSaving(true);
    setError(null);

    const { error: clientError } = await supabase
      .from("clients")
      .update({ name, contact, email: email || null, location })
      .eq("client_id", job.client_id);

    if (clientError) {
      setError(clientError.message);
      setSaving(false);
      return;
    }

    const { error: jobError } = await supabase
      .from("jobs")
      .update({ job_name: jobName || null, notes: notes || null })
      .eq("job_id", job.job_id);

    if (jobError) {
      setError(jobError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    router.refresh();
    onClose();
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3.5">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Client name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Contact number</label>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Job name</label>
          <input
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Job details / chat transcript notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={onClose}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
