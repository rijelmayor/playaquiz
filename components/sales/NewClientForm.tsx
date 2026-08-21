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
  const [open, setOpen] = useState(false);
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

  function reset() {
    setName("");
    setContact("");
    setEmail("");
    setLocation("");
    setJobName("");
    setNotes("");
    setNeedsSiteVisit(false);
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

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

    setSubmitting(false);
    close();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-sky-200/50 transition hover:from-sky-500 hover:to-violet-500 hover:shadow-lg active:scale-95"
        aria-label="Add new client"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-base leading-none">
          +
        </span>
        Add client
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={close}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-client-title"
            className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-gray-200 sm:p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-xl">🎯</span>
                <div>
                  <h3 id="new-client-title" className="text-base font-bold text-gray-900">
                    New lead
                  </h3>
                  <p className="text-[11px] text-gray-500">Log a prospect and start the pipeline</p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Client name</label>
                  <input
                    placeholder="Reyes Family"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                    required
                    autoFocus
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
                <div className="sm:col-span-2">
                  <label className={labelClass}>Email address</label>
                  <input
                    type="email"
                    placeholder="client@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Location</label>
                  <input
                    placeholder="Cebu City"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Job / Project name</label>
                  <input
                    placeholder="Wedding tarpaulin — Reyes"
                    value={jobName}
                    onChange={(e) => setJobName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
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
              <div className="mt-5 flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
                >
                  {submitting ? "Saving…" : "Add client"}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
