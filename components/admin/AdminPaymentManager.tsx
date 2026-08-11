"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import type { PaymentScheduleDueStage } from "@/lib/types/database";

export interface AdminPaymentSchedule {
  payment_schedule_id: string;
  sequence_no: number;
  label: string;
  percentage: number;
  amount: number;
  due_stage: PaymentScheduleDueStage;
  status: "pending" | "partial" | "paid";
}

export interface AdminPaymentRecord {
  payment_id: string;
  payment_schedule_id: string | null;
  type: "down_payment" | "balance";
  amount: number;
  status: "pending" | "received";
  paid_date: string | null;
  reference_no: string | null;
  note: string | null;
}

export interface AdminPaymentJob {
  job_id: string;
  display_job_id: string;
  client_name: string;
  job_name: string | null;
  status: string;
  job_order_status: string | null;
  quote_total: number;
  payment_terms: string;
  schedules: AdminPaymentSchedule[];
  payments: AdminPaymentRecord[];
}

function money(value: number) {
  return `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dueStageLabel(stage: PaymentScheduleDueStage) {
  return {
    approval: "Upon approval",
    production: "Production milestone",
    completion: "Project completion",
    installation: "Installation",
    custom: "Custom milestone"
  }[stage];
}

function paymentStatusLabel(status: AdminPaymentSchedule["status"]) {
  return status === "paid" ? "Paid" : status === "partial" ? "Partially paid" : "Pending";
}

function isDueNow(job: AdminPaymentJob, schedule: AdminPaymentSchedule) {
  if (schedule.status === "paid") return false;
  if (schedule.due_stage === "approval") return ["approved", "in_production", "installed", "paid", "closed"].includes(job.status);
  if (schedule.due_stage === "production") return ["in_production", "installed", "paid", "closed"].includes(job.status);
  if (schedule.due_stage === "completion") return ["installed", "paid", "closed"].includes(job.status) || ["qa", "ready_for_install", "installed"].includes(job.job_order_status ?? "");
  if (schedule.due_stage === "installation") return ["installed", "paid", "closed"].includes(job.status) || job.job_order_status === "installed";
  return true;
}

export function AdminPaymentManager({ jobs }: { jobs: AdminPaymentJob[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [scheduleId, setScheduleId] = useState("");
  const [amount, setAmount] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState("");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const visible = useMemo(() => jobs, [jobs]);

  function openPayment(job: AdminPaymentJob) {
    const firstDue = job.schedules.find((schedule) => schedule.status !== "paid" && isDueNow(job, schedule));
    const fallback = job.schedules.find((schedule) => schedule.status !== "paid");
    const selected = firstDue ?? fallback;
    setOpenId(job.job_id);
    setScheduleId(selected?.payment_schedule_id ?? "");
    setAmount(selected ? String(Math.max(0, selected.amount - job.payments.filter((p) => p.payment_schedule_id === selected.payment_schedule_id && p.status === "received").reduce((sum, p) => sum + p.amount, 0))) : "");
    setReferenceNo("");
    setNote("");
    setPaidDate(new Date().toISOString().slice(0, 10));
    setError(null);
  }

  function changeSchedule(job: AdminPaymentJob, id: string) {
    const selected = job.schedules.find((schedule) => schedule.payment_schedule_id === id);
    if (!selected) return;
    const received = job.payments.filter((p) => p.payment_schedule_id === id && p.status === "received").reduce((sum, p) => sum + p.amount, 0);
    setScheduleId(id);
    setAmount(String(Math.max(0, selected.amount - received)));
  }

  async function recordPayment(job: AdminPaymentJob) {
    const schedule = job.schedules.find((row) => row.payment_schedule_id === scheduleId);
    const value = Number(amount);
    if (!schedule) {
      setError("Select a payment milestone.");
      return;
    }
    if (!value || value <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    const alreadyReceived = job.payments
      .filter((p) => p.payment_schedule_id === schedule.payment_schedule_id && p.status === "received")
      .reduce((sum, p) => sum + p.amount, 0);
    if (alreadyReceived + value > schedule.amount + 0.01) {
      setError(`This milestone has only ${money(Math.max(0, schedule.amount - alreadyReceived))} remaining.`);
      return;
    }

    setSaving(true);
    setError(null);
    const type = schedule.sequence_no === 1 && schedule.due_stage === "approval" ? "down_payment" : "balance";
    const { error: insertError } = await supabase.from("payments").insert({
      job_id: job.job_id,
      payment_schedule_id: schedule.payment_schedule_id,
      type,
      amount: value,
      status: "received",
      paid_date: new Date(`${paidDate}T12:00:00`).toISOString(),
      reference_no: referenceNo.trim() || null,
      note: note.trim() || null
    });
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setOpenId(null);
    setSaving(false);
    router.refresh();
  }

  if (visible.length === 0) {
    return <p className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">No payment records yet.</p>;
  }

  return (
    <div className="space-y-3">
      {visible.map((job) => {
        const received = job.payments.filter((p) => p.status === "received").reduce((sum, p) => sum + p.amount, 0);
        const balance = Math.max(0, job.quote_total - received);
        const dueNow = job.schedules.filter((schedule) => isDueNow(job, schedule));
        return (
          <article key={job.job_id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{job.client_name}</p>
                  <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-700">{job.display_job_id}</span>
                </div>
                <p className="flex items-center gap-1 text-xs text-gray-500">
                  {job.job_name || "Untitled project"} · {job.payment_terms.replaceAll("_", " ")}
                  <InfoTooltip text="Payment terms = what the customer agreed to. Received/Balance below = what has actually been paid so far." />
                </p>
                <p className="mt-1 text-xs text-gray-400">Received {money(received)} · Balance {money(balance)}</p>
              </div>
              <button onClick={() => (openId === job.job_id ? setOpenId(null) : openPayment(job))} className="rounded-md border border-gray-800 px-3 py-1.5 text-xs font-medium">
                {openId === job.job_id ? "Close" : "Record payment"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 p-4 md:grid-cols-2 xl:grid-cols-4">
              {job.schedules.map((schedule) => {
                const scheduleReceived = job.payments.filter((p) => p.payment_schedule_id === schedule.payment_schedule_id && p.status === "received").reduce((sum, p) => sum + p.amount, 0);
                const remaining = Math.max(0, schedule.amount - scheduleReceived);
                return (
                  <div key={schedule.payment_schedule_id} className="rounded-lg bg-gray-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-900">{schedule.label}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${schedule.status === "paid" ? "bg-green-50 text-green-700" : schedule.status === "partial" ? "bg-amber-50 text-amber-700" : isDueNow(job, schedule) ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                        {paymentStatusLabel(schedule.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">{schedule.percentage}% · {dueStageLabel(schedule.due_stage)}</p>
                    <p className="mt-2 text-sm font-semibold">{money(schedule.amount)}</p>
                    {scheduleReceived > 0 && <p className="text-[11px] text-gray-500">Received {money(scheduleReceived)} · Remaining {money(remaining)}</p>}
                    {isDueNow(job, schedule) && schedule.status !== "paid" && <p className="mt-1 text-[10px] font-semibold text-red-600">Payment due now</p>}
                  </div>
                );
              })}
            </div>

            {openId === job.job_id && (
              <div className="border-t border-gray-100 bg-gray-50 p-4">
                <div className="mb-2 flex items-center gap-1 text-[11px] text-gray-500">
                  <span>Milestones are generated automatically from this project's payment terms</span>
                  <InfoTooltip text="You never create the standard 50/50, full-on-completion, full-on-installation, or custom milestones by hand — they come from the project's Payment Terms. Just pick which milestone this payment applies to." />
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <select value={scheduleId} onChange={(e) => changeSchedule(job, e.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-2 text-xs">
                    <option value="">Select milestone…</option>
                    {job.schedules.filter((s) => s.status !== "paid").map((s) => <option key={s.payment_schedule_id} value={s.payment_schedule_id}>{s.label} · {money(s.amount)}</option>)}
                  </select>
                  <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount received ₱" className="rounded-md border border-gray-300 bg-white px-2 py-2 text-xs" />
                  <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-2 text-xs" />
                  <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="OR / reference no." className="rounded-md border border-gray-300 bg-white px-2 py-2 text-xs" />
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Payment note (optional)" className="min-h-16 rounded-md border border-gray-300 bg-white px-2 py-2 text-xs md:col-span-2" />
                  <div className="flex items-end gap-2 md:col-span-2 xl:justify-end">
                    {error && <p className="mr-auto text-xs text-red-600">{error}</p>}
                    <button disabled={saving} onClick={() => recordPayment(job)} className="rounded-md bg-gray-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving && <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}{saving ? "Saving…" : "Confirm payment received"}</button>
                  </div>
                </div>
              </div>
            )}

            {job.payments.length > 0 && (
              <div className="border-t border-gray-100 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Payment history</p>
                <div className="mt-2 divide-y divide-gray-100">
                  {job.payments.map((payment) => (
                    <div key={payment.payment_id} className="flex flex-col gap-1 py-2 text-xs md:flex-row md:items-center md:justify-between">
                      <div><span className="font-medium">{money(payment.amount)}</span> · {payment.type === "down_payment" ? "Down payment" : "Milestone payment"}{payment.reference_no ? ` · ${payment.reference_no}` : ""}</div>
                      <div className="text-gray-400">{payment.paid_date ? new Date(payment.paid_date).toLocaleDateString("en-PH") : "—"}{payment.note ? ` · ${payment.note}` : ""}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
