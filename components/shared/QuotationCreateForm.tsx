"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PaymentTerms, QuotationSettings } from "@/lib/types/database";

interface JobNeedingQuote {
  job_id: string;
  client_name: string;
  next_version: number;
  payment_terms?: PaymentTerms;
}

interface ItemRow {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
}

interface ScheduleRow {
  id: string;
  label: string;
  percentage: string;
  due_stage: "approval" | "production" | "completion" | "installation" | "custom";
}

const inputClass =
  "rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

function emptyRow(): ItemRow {
  return { id: crypto.randomUUID(), description: "", quantity: "1", unit_price: "" };
}

export function QuotationCreateForm({
  rows,
  settings,
  createdBy
}: {
  rows: JobNeedingQuote[];
  settings: QuotationSettings | null;
  createdBy: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [projectJobId, setProjectJobId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [validDays, setValidDays] = useState(String(settings?.valid_days ?? 15));
  const [servicesNote, setServicesNote] = useState(
    settings?.services_note ?? "Mock-Up/Mobilization/Installation FREE"
  );
  const [terms, setTerms] = useState(settings?.terms ?? "");
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>("50_50");
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  function openFor(row: JobNeedingQuote) {
    setOpenId(row.job_id);
    setItems([emptyRow()]);
    const generatedId = `JOB-${row.job_id.slice(0, 8).toUpperCase()}`;
    setProjectJobId(generatedId);
    setCustomerName(row.client_name);
    setValidDays(String(settings?.valid_days ?? 15));
    setServicesNote(settings?.services_note ?? "Mock-Up/Mobilization/Installation FREE");
    setTerms(settings?.terms ?? "");
    setPaymentTerms(row.payment_terms ?? "50_50");
    setScheduleRows([{ id: crypto.randomUUID(), label: "Payment", percentage: "100", due_stage: "custom" }]);
    setShowAdvanced(false);
    setError(null);
  }

  function updateItem(id: string, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyRow()]);
  }

  function removeItem(id: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  }

  function updateSchedule(id: string, patch: Partial<ScheduleRow>) {
    setScheduleRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addSchedule() {
    setScheduleRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: `Payment ${prev.length + 1}`, percentage: "", due_stage: "custom" }
    ]);
  }

  function removeSchedule(id: string) {
    setScheduleRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  }

  const total = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    0
  );

  async function create(jobId: string, version: number) {
    const cleanItems = items
      .filter((it) => it.description.trim())
      .map((it) => ({
        id: it.id,
        description: it.description.trim(),
        quantity: Number(it.quantity) || 0,
        unit_price: Number(it.unit_price) || 0
      }));

    if (cleanItems.length === 0) {
      setError("Add at least one item.");
      return;
    }

    if (paymentTerms === "custom") {
      const customTotal = scheduleRows.reduce((sum, row) => sum + (Number(row.percentage) || 0), 0);
      if (scheduleRows.length === 0 || Math.abs(customTotal - 100) > 0.01) {
        setError("Custom payment schedule must total exactly 100%.");
        return;
      }
      if (scheduleRows.some((row) => !row.label.trim() || (Number(row.percentage) || 0) <= 0)) {
        setError("Every custom payment milestone needs a label and a percentage greater than 0.");
        return;
      }
    }

    setSaving(true);
    setError(null);

    const days = Number(validDays) || 15;
    const validUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const { error: insertError } = await supabase.from("quotations").insert({
      job_id: jobId,
      version,
      items: cleanItems,
      total,
      valid_until: validUntil,
      valid_days: days,
      // This ID is generated from the job and is intentionally not editable.
      project_job_id: projectJobId,
      customer_name: customerName,
      services_note: servicesNote || null,
      terms: terms || null,
      payment_terms: paymentTerms,
      created_by: createdBy || null
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    await supabase
      .from("jobs")
      .update({ status: "quoted", quoted_value: total, payment_terms: paymentTerms })
      .eq("job_id", jobId);

    // Explicitly synchronize payment milestones after the quotation is saved.
    // This keeps the payment picker populated even if a database trigger is not firing.
    await supabase.from("payment_schedules").delete().eq("job_id", jobId).eq("status", "pending");

    if (paymentTerms === "50_50") {
      await supabase.from("payment_schedules").insert([
        { job_id: jobId, sequence_no: 1, label: "Down Payment", percentage: 50, amount: Math.round(total * 0.5 * 100) / 100, due_stage: "approval" },
        { job_id: jobId, sequence_no: 2, label: "Completion Payment", percentage: 50, amount: Math.round(total * 0.5 * 100) / 100, due_stage: "completion" }
      ]);
    } else if (paymentTerms === "full_on_completion") {
      await supabase.from("payment_schedules").insert([
        { job_id: jobId, sequence_no: 1, label: "Completion Payment", percentage: 100, amount: Math.round(total * 100) / 100, due_stage: "completion" }
      ]);
    } else if (paymentTerms === "full_on_installation") {
      await supabase.from("payment_schedules").insert([
        { job_id: jobId, sequence_no: 1, label: "Installation Payment", percentage: 100, amount: Math.round(total * 100) / 100, due_stage: "installation" }
      ]);
    } else if (paymentTerms === "custom") {
      await supabase.from("payment_schedules").insert(
        scheduleRows.map((row, index) => ({
          job_id: jobId,
          sequence_no: index + 1,
          label: row.label.trim(),
          percentage: Number(row.percentage),
          amount: Math.round(total * (Number(row.percentage) / 100) * 100) / 100,
          due_stage: row.due_stage
        }))
      );
    }

    setOpenId(null);
    setSaving(false);
    router.refresh();
  }

  if (rows.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">Needs quotation</p>
        <p className="text-xs text-gray-500">Project/Job ID is generated automatically and stays consistent across the CRM.</p>
      </div>
      {rows.map((row) => (
        <div key={row.job_id} className="border-b border-gray-100 px-4 py-3 last:border-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{row.client_name}</p>
              <p className="text-xs font-semibold text-gray-500">JOB-{row.job_id.slice(0, 8).toUpperCase()}</p>
              {row.next_version > 1 && (
                <span className="text-xs text-gray-400">rev v{row.next_version}</span>
              )}
            </div>
            <button
              onClick={() => (openId === row.job_id ? setOpenId(null) : openFor(row))}
              className="rounded-md border border-gray-800 px-3 py-1.5 text-xs font-medium"
            >
              {openId === row.job_id ? "Close" : "Create quotation"}
            </button>
          </div>

          {openId === row.job_id && (
            <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-500">Customer Name</label>
                  <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={`${inputClass} w-full`} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-500">Project/Job ID</label>
                  <input value={projectJobId} readOnly className={`${inputClass} w-full bg-gray-100 font-semibold text-gray-600`} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">Payment arrangement</label>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}
                  className={`${inputClass} w-full`}
                >
                  <option value="50_50">50% downpayment / 50% after completion</option>
                  <option value="full_on_completion">Full payment on completion</option>
                  <option value="full_on_installation">Full payment on installation</option>
                  <option value="custom">Custom payment schedule</option>
                </select>
              </div>

              {paymentTerms === "custom" && (
                <div className="space-y-2 rounded-md border border-gray-200 bg-white p-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold text-gray-700">Custom payment milestones</p>
                      <p className="text-[10px] text-gray-400">The percentages must total 100%.</p>
                    </div>
                    <p className={`text-xs font-semibold ${Math.abs(scheduleRows.reduce((sum, row) => sum + (Number(row.percentage) || 0), 0) - 100) < 0.01 ? "text-green-700" : "text-amber-700"}`}>
                      {scheduleRows.reduce((sum, row) => sum + (Number(row.percentage) || 0), 0)}%
                    </p>
                  </div>
                  {scheduleRows.map((row) => (
                    <div key={row.id} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1.5fr_90px_1.2fr_auto]">
                      <input value={row.label} onChange={(e) => updateSchedule(row.id, { label: e.target.value })} placeholder="Milestone label" className={inputClass} />
                      <input type="number" min="0" max="100" value={row.percentage} onChange={(e) => updateSchedule(row.id, { percentage: e.target.value })} placeholder="%" className={inputClass} />
                      <select value={row.due_stage} onChange={(e) => updateSchedule(row.id, { due_stage: e.target.value as ScheduleRow["due_stage"] })} className={inputClass}>
                        <option value="approval">Upon approval</option>
                        <option value="production">Production milestone</option>
                        <option value="completion">Project completion</option>
                        <option value="installation">Installation</option>
                        <option value="custom">Custom milestone</option>
                      </select>
                      <button type="button" onClick={() => removeSchedule(row.id)} className="rounded-md border border-gray-300 px-2 text-xs text-gray-500">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={addSchedule} className="text-xs font-medium text-gray-600 underline">+ Add payment milestone</button>
                </div>
              )}

              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">Items</label>
                <div className="space-y-1.5">
                  {items.map((it) => (
                    <div key={it.id} className="flex gap-1.5">
                      <input placeholder="Description" value={it.description} onChange={(e) => updateItem(it.id, { description: e.target.value })} className={`${inputClass} flex-1`} />
                      <input type="number" min="0" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(it.id, { quantity: e.target.value })} className={`${inputClass} w-16`} />
                      <input type="number" min="0" placeholder="Price" value={it.unit_price} onChange={(e) => updateItem(it.id, { unit_price: e.target.value })} className={`${inputClass} w-24`} />
                      <button type="button" onClick={() => removeItem(it.id)} className="rounded-md border border-gray-300 px-2 text-xs text-gray-500 hover:bg-white">✕</button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addItem} className="mt-1.5 text-xs font-medium text-gray-600 underline">+ Add item</button>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  Valid for
                  <input type="number" min="1" value={validDays} onChange={(e) => setValidDays(e.target.value)} className={`${inputClass} w-14`} /> days
                </label>
                <p className="text-sm font-semibold text-gray-900">Total: ₱{total.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>

              <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-xs font-medium text-gray-600 underline">
                {showAdvanced ? "Hide" : "Edit"} services / terms text
              </button>
              {showAdvanced && (
                <div className="space-y-2 rounded-md border border-gray-200 bg-white p-2.5">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-gray-500">Services</label>
                    <input value={servicesNote} onChange={(e) => setServicesNote(e.target.value)} className={`${inputClass} w-full`} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-gray-500">Terms and Condition</label>
                    <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={6} className={`${inputClass} w-full`} />
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}
              <button onClick={() => create(row.job_id, row.next_version)} disabled={saving} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                {saving ? "Saving…" : "Save quotation"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
