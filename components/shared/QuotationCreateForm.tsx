"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DiscountType, PaymentTerms, QuotationSettings } from "@/lib/types/database";

interface JobNeedingQuote {
  job_id: string;
  client_name: string;
  next_version: number;
  payment_terms?: PaymentTerms;
}

interface ItemRow { id: string; description: string; quantity: string; unit_price: string; }
interface ScheduleRow {
  id: string;
  label: string;
  percentage: string;
  due_stage: "approval" | "production" | "completion" | "installation" | "custom";
}

const inputClass = "rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-900 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600";
const brandButton = "rounded-md bg-[#0784c8] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#006da9] disabled:opacity-50";

function emptyRow(): ItemRow { return { id: crypto.randomUUID(), description: "", quantity: "1", unit_price: "" }; }

export function QuotationCreateForm({ rows, settings, createdBy }: { rows: JobNeedingQuote[]; settings: QuotationSettings | null; createdBy: string; }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [projectJobId, setProjectJobId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [validDays, setValidDays] = useState(String(settings?.valid_days ?? 15));
  const [servicesNote, setServicesNote] = useState(settings?.services_note ?? "Mock-Up/Mobilization/Installation FREE");
  const [terms, setTerms] = useState(settings?.terms ?? "");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("none");
  const [discountValue, setDiscountValue] = useState("0");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("12");
  const [otherCharges, setOtherCharges] = useState("0");
  const [otherChargesNote, setOtherChargesNote] = useState("");
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>("50_50");
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  function resetForm(row: JobNeedingQuote) {
    setOpenId(row.job_id);
    setItems([emptyRow()]);
    setProjectJobId(`JOB-${row.job_id.slice(0, 8).toUpperCase()}`);
    setCustomerName(row.client_name);
    setValidDays(String(settings?.valid_days ?? 15));
    setServicesNote(settings?.services_note ?? "Mock-Up/Mobilization/Installation FREE");
    setTerms(settings?.terms ?? "");
    setAdditionalNotes("");
    setDiscountType("none"); setDiscountValue("0");
    setTaxEnabled(false); setTaxRate("12");
    setOtherCharges("0"); setOtherChargesNote("");
    setPaymentTerms(row.payment_terms ?? "50_50");
    setScheduleRows([{ id: crypto.randomUUID(), label: "Payment", percentage: "100", due_stage: "custom" }]);
    setShowAdvanced(false); setError(null);
  }

  function updateItem(id: string, patch: Partial<ItemRow>) { setItems((p) => p.map((it) => it.id === id ? { ...it, ...patch } : it)); }
  function addItem() { setItems((p) => [...p, emptyRow()]); }
  function removeItem(id: string) { setItems((p) => p.length > 1 ? p.filter((it) => it.id !== id) : p); }
  function updateSchedule(id: string, patch: Partial<ScheduleRow>) { setScheduleRows((p) => p.map((r) => r.id === id ? { ...r, ...patch } : r)); }
  function addSchedule() { setScheduleRows((p) => [...p, { id: crypto.randomUUID(), label: `Payment ${p.length + 1}`, percentage: "", due_stage: "custom" }]); }
  function removeSchedule(id: string) { setScheduleRows((p) => p.length > 1 ? p.filter((r) => r.id !== id) : p); }

  const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const rawDiscount = Number(discountValue) || 0;
  const discountAmount = discountType === "percentage" ? Math.min(subtotal, subtotal * Math.max(0, rawDiscount) / 100) : discountType === "fixed" ? Math.min(subtotal, Math.max(0, rawDiscount)) : 0;
  const taxableBase = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxEnabled ? taxableBase * Math.max(0, Number(taxRate) || 0) / 100 : 0;
  const charges = Math.max(0, Number(otherCharges) || 0);
  const total = Math.max(0, taxableBase + taxAmount + charges);

  async function create(jobId: string, version: number) {
    const cleanItems = items.filter((it) => it.description.trim()).map((it) => ({ id: it.id, description: it.description.trim(), quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0 }));
    if (!cleanItems.length) { setError("Add at least one item."); return; }
    if (paymentTerms === "custom") {
      const sum = scheduleRows.reduce((s, r) => s + (Number(r.percentage) || 0), 0);
      if (scheduleRows.length === 0 || Math.abs(sum - 100) > 0.01) { setError("Custom payment schedule must total exactly 100%."); return; }
      if (scheduleRows.some((r) => !r.label.trim() || (Number(r.percentage) || 0) <= 0)) { setError("Every custom payment milestone needs a label and a percentage greater than 0."); return; }
    }
    setSaving(true); setError(null);
    const days = Math.max(1, Number(validDays) || 15);
    const validUntil = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const { data: previousQuote } = await supabase.from("quotations").select("quotation_id").eq("job_id", jobId).order("version", { ascending: false }).limit(1).maybeSingle();
    const { error: insertError } = await supabase.from("quotations").insert({
      job_id: jobId, version, items: cleanItems, total: Math.round(total * 100) / 100,
      valid_until: validUntil, valid_days: days, project_job_id: projectJobId, customer_name: customerName,
      services_note: servicesNote || null, terms: terms || null, additional_notes: additionalNotes || null,
      discount_type: discountType, discount_value: rawDiscount, discount_amount: Math.round(discountAmount * 100) / 100,
      tax_enabled: taxEnabled, tax_rate: Number(taxRate) || 0, tax_amount: Math.round(taxAmount * 100) / 100,
      other_charges: charges, other_charges_note: otherChargesNote || null,
      quotation_status: "draft", payment_terms: paymentTerms, created_by: createdBy || null, supersedes_quotation_id: previousQuote?.quotation_id ?? null
    });
    if (insertError) { setError(insertError.message); setSaving(false); return; }
    if (previousQuote?.quotation_id) await supabase.from("quotations").update({ quotation_status: "superseded" }).eq("quotation_id", previousQuote.quotation_id);

    await supabase.from("jobs").update({ status: "quoted", quoted_value: Math.round(total * 100) / 100, payment_terms: paymentTerms }).eq("job_id", jobId);
    await supabase.from("payment_schedules").delete().eq("job_id", jobId).eq("status", "pending");
    if (paymentTerms === "50_50") await supabase.from("payment_schedules").insert([
      { job_id: jobId, sequence_no: 1, label: "Down Payment", percentage: 50, amount: Math.round(total * .5 * 100) / 100, due_stage: "approval" },
      { job_id: jobId, sequence_no: 2, label: "Completion Payment", percentage: 50, amount: Math.round(total * .5 * 100) / 100, due_stage: "completion" }
    ]);
    else if (paymentTerms === "full_on_completion") await supabase.from("payment_schedules").insert([{ job_id: jobId, sequence_no: 1, label: "Completion Payment", percentage: 100, amount: Math.round(total * 100) / 100, due_stage: "completion" }]);
    else if (paymentTerms === "full_on_installation") await supabase.from("payment_schedules").insert([{ job_id: jobId, sequence_no: 1, label: "Installation Payment", percentage: 100, amount: Math.round(total * 100) / 100, due_stage: "installation" }]);
    else await supabase.from("payment_schedules").insert(scheduleRows.map((r, i) => ({ job_id: jobId, sequence_no: i + 1, label: r.label.trim(), percentage: Number(r.percentage), amount: Math.round(total * Number(r.percentage) / 100 * 100) / 100, due_stage: r.due_stage })));
    setOpenId(null); setSaving(false); router.refresh();
  }

  if (!rows.length) return null;
  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3"><p className="text-sm font-semibold text-gray-900">Needs quotation</p><p className="text-xs text-gray-500">Sales can prepare, revise and send customer-ready quotations.</p></div>
      {rows.map((row) => (
        <div key={row.job_id} className="border-b border-gray-100 px-4 py-3 last:border-0">
          <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">{row.client_name}</p><p className="text-xs font-semibold text-gray-500">JOB-{row.job_id.slice(0, 8).toUpperCase()}</p>{row.next_version > 1 && <span className="text-xs text-gray-400">next revision v{row.next_version}</span>}</div><button onClick={() => openId === row.job_id ? setOpenId(null) : resetForm(row)} className="rounded-md border border-gray-800 px-3 py-1.5 text-xs font-medium">{openId === row.job_id ? "Close" : "Create quotation"}</button></div>
          {openId === row.job_id && <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><div><label className="mb-1 block text-[11px] font-medium text-gray-500">Customer Name</label><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={`${inputClass} w-full`} /></div><div><label className="mb-1 block text-[11px] font-medium text-gray-500">Project / Job ID</label><input value={projectJobId} readOnly className={`${inputClass} w-full bg-gray-100 font-semibold`} /></div></div>
            <div><label className="mb-1 block text-[11px] font-medium text-gray-500">Items</label><div className="space-y-1.5">{items.map((it) => <div key={it.id} className="grid grid-cols-[1fr_64px_100px_auto] gap-1.5"><input placeholder="Description" value={it.description} onChange={(e) => updateItem(it.id, { description: e.target.value })} className={inputClass} /><input type="number" min="0" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(it.id, { quantity: e.target.value })} className={inputClass} /><input type="number" min="0" placeholder="Price" value={it.unit_price} onChange={(e) => updateItem(it.id, { unit_price: e.target.value })} className={inputClass} /><button type="button" onClick={() => removeItem(it.id)} className="rounded-md border border-gray-300 px-2 text-xs text-gray-500">✕</button></div>)}</div><button type="button" onClick={addItem} className="mt-1.5 text-xs font-medium text-[#087eb9]">+ Add item</button></div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3"><div><label className="mb-1 block text-[11px] font-medium text-gray-500">Discount</label><div className="flex gap-1.5"><select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)} className={`${inputClass} flex-1`}><option value="none">None</option><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select>{discountType !== "none" && <input type="number" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className={`${inputClass} w-24`} />}</div></div><div><label className="mb-1 block text-[11px] font-medium text-gray-500">VAT / Tax</label><div className="flex gap-1.5"><label className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 text-xs"><input type="checkbox" checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} /> Apply</label>{taxEnabled && <input type="number" min="0" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={`${inputClass} w-20`} />}</div></div><div><label className="mb-1 block text-[11px] font-medium text-gray-500">Other charges</label><input type="number" min="0" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} className={`${inputClass} w-full`} /></div></div>
            {Number(otherCharges) > 0 && <input value={otherChargesNote} onChange={(e) => setOtherChargesNote(e.target.value)} placeholder="Other charge description (e.g. rush delivery)" className={`${inputClass} w-full`} />}
            <div className="rounded-md border border-gray-200 bg-white p-3 text-right text-xs"><div>Subtotal <b>₱{subtotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</b></div>{discountAmount > 0 && <div className="text-rose-600">Discount -₱{discountAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</div>}{taxEnabled && <div>VAT {Number(taxRate) || 0}% <b>₱{taxAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</b></div>}{charges > 0 && <div>Other charges <b>₱{charges.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</b></div>}<div className="mt-1 border-t pt-1 text-sm font-bold text-gray-900">TOTAL ₱{total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</div></div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2"><div><label className="mb-1 block text-[11px] font-medium text-gray-500">Payment arrangement</label><select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)} className={`${inputClass} w-full`}><option value="50_50">50% downpayment / 50% after completion</option><option value="full_on_completion">Full payment on completion</option><option value="full_on_installation">Full payment on installation</option><option value="custom">Custom payment schedule</option></select></div><label className="flex items-center gap-2 text-xs text-gray-600">Valid for <input type="number" min="1" value={validDays} onChange={(e) => setValidDays(e.target.value)} className={`${inputClass} w-16`} /> days</label></div>
            {paymentTerms === "custom" && <div className="space-y-2 rounded-md border border-gray-200 bg-white p-2.5"><p className="text-[11px] font-semibold text-gray-700">Custom payment milestones — total must equal 100%</p>{scheduleRows.map((r) => <div key={r.id} className="grid grid-cols-[1.4fr_80px_1.2fr_auto] gap-1.5"><input value={r.label} onChange={(e) => updateSchedule(r.id, { label: e.target.value })} className={inputClass} placeholder="Milestone" /><input type="number" min="0" max="100" value={r.percentage} onChange={(e) => updateSchedule(r.id, { percentage: e.target.value })} className={inputClass} placeholder="%" /><select value={r.due_stage} onChange={(e) => updateSchedule(r.id, { due_stage: e.target.value as ScheduleRow["due_stage"] })} className={inputClass}><option value="approval">Approval</option><option value="production">Production</option><option value="completion">Completion</option><option value="installation">Installation</option><option value="custom">Custom</option></select><button type="button" onClick={() => removeSchedule(r.id)} className="rounded border px-2 text-xs">✕</button></div>)}<button type="button" onClick={addSchedule} className="text-xs text-[#087eb9]">+ Add milestone</button></div>}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2"><div><label className="mb-1 block text-[11px] font-medium text-gray-500">Additional notes / comments on quote</label><textarea value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} rows={4} className={`${inputClass} w-full`} placeholder="Special comments, exclusions, scope notes, client requests…" /></div><div><label className="mb-1 block text-[11px] font-medium text-gray-500">Services line</label><input value={servicesNote} onChange={(e) => setServicesNote(e.target.value)} className={`${inputClass} w-full`} /><label className="mb-1 mt-2 block text-[11px] font-medium text-gray-500">Terms & Conditions</label><textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={4} className={`${inputClass} w-full`} /></div></div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2"><button type="button" onClick={() => setShowAdvanced((v) => !v)} className="mr-auto text-xs text-gray-500 underline">{showAdvanced ? "Hide advanced" : "Show advanced"}</button><button onClick={() => create(row.job_id, row.next_version)} disabled={saving} className={brandButton}>{saving ? "Saving…" : "Save quotation"}</button></div>
            {showAdvanced && <p className="text-[10px] text-gray-400">The saved quotation becomes the source document for PDF generation, email and later revisions. Previous versions are never overwritten.</p>}
          </div>}
        </div>
      ))}
    </div>
  );
}
