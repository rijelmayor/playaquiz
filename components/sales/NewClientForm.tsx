"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";
const labelClass = "mb-1.5 block text-xs font-medium text-gray-600";

// Intake form: creates the client + job row together, and stamps
// booked_by with the current agent — this field is never editable again.
//
// The client_id is generated here (not read back from the insert) on
// purpose. With RLS, `insert(...).select()` on `clients` also has to pass
// the SELECT policy for the returned row, and "sales reads own clients"
// only allows a client already linked to one of the agent's jobs — which
// doesn't exist yet on first insert. Generating the id up front and
// inserting the job in the same breath sidesteps that chicken-and-egg
// entirely.
export function NewClientForm({ agentId }: { agentId: string }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [jobName, setJobName] = useState("");
  const [notes, setNotes] = useState("");
  const [needsSiteVisit, setNeedsSiteVisit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const clientId = crypto.randomUUID();

    const { error: clientError } = await supabase
      .from("clients")
      .insert({ client_id: clientId, name, contact, email: email || null, location });

    if (clientError) {
      setError(clientError.message);
      setSubmitting(false);
      return;
    }

    const { error: jobError } = await supabase.from("jobs").insert({
      client_id: clientId,
      booked_by: agentId,
      job_name: jobName || null,
      notes: notes || null,
      needs_site_visit: needsSiteVisit,
      site_visit_status: needsSiteVisit ? "not_recorded" : "not_required",
      status: needsSiteVisit ? "site_visit" : "design_review"
    });

    if (jobError) {
      setError(jobError.message);
      setSubmitting(false);
      return;
    }

    setName("");
    setContact("");
    setEmail("");
    setLocation("");
    setJobName("");
    setNotes("");
    setNeedsSiteVisit(false);
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border-t-2 border-t-amber-400 bg-white p-5 shadow-sm ring-1 ring-gray-100"
    >
      <h3 className="mb-4 text-sm font-semibold text-gray-900">New client</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Client name</label>
          <input
            placeholder="Reyes Family"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Contact number</label>
          <input
            placeholder="09XX XXX XXXX"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Email address</label>
          <input
            type="email"
            placeholder="client@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Location</label>
          <input
            placeholder="Cebu City"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Job name</label>
          <input
            placeholder="Wedding tarpaulin — Reyes"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Job details / chat transcript notes</label>
          <textarea
            placeholder="What the client needs, sizing, deadline, anything from the Messenger thread…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={needsSiteVisit}
          onChange={(e) => setNeedsSiteVisit(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
        />
        Needs site visit
      </label>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="mt-4 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Add client"}
      </button>
    </form>
  );
}
