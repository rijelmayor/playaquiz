"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DiscountType, PaymentTerms, Quotation } from "@/lib/types/database";

const inputClass = "rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-900 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600";

type EditableItem = { id: string; description: string; quantity: string; unit_price: string };

export function QuotationEditForm({ quotation, returnPath }: { quotation: Quotation; returnPath: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState<EditableItem[]>((quotation.items ?? []).map((i) => ({ ...i, quantity: String(i.quantity), unit_price: String(i.unit_price) })));
  const [customerName, setCustomerName] = useState(quotation.customer_name ?? "");
  const [validDays, setValidDays] = useState(String(quotation.valid_days ?? 15));
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(quotation.payment_terms ?? "50_50");
  const [discountType, setDiscountType] = useState<DiscountType>(quotation.discount_type ?? "none");
  const [discountValue, setDiscountValue] = useState(String(quotation.discount_value ?? 0));
  const [taxEnabled, setTaxEnabled] = useState(Boolean(quotation.tax_enabled));
  const [taxRate, setTaxRate] = useState(String(quotation.tax_rate ?? 12));
  const [otherCharges, setOtherCharges] = useState(String(quotation.other_charges ?? 0));
  const [otherChargesNote, setOtherChargesNote] = useState(quotation.other_charges_note ?? "");
  const [additionalNotes, setAdditionalNotes] = useState(quotation.additional_notes ?? "");
  const [servicesNote, setServicesNote] = useState(quotation.services_note ?? "");
  const [terms, setTerms] = useState(quotation.terms ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = useMemo(() => items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0), [items]);
  const discountAmount = discountType === "percentage"
    ? Math.min(subtotal, subtotal * Math.max(0, Number(discountValue) || 0) / 100)
    : discountType === "fixed" ? Math.min(subtotal, Math.max(0, Number(discountValue) || 0)) : 0;
  const taxableBase = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxEnabled ? taxableBase * Math.max(0, Number(taxRate) || 0) / 100 : 0;
  const total = Math.max(0, taxableBase + taxAmount + Math.max(0, Number(otherCharges) || 0));

  function updateItem(id: string, patch: Partial<EditableItem>) { setItems((p) => p.map((i) => i.id === id ? { ...i, ...patch } : i)); }
  function addItem() { setItems((p) => [...p, { id: crypto.randomUUID(), description: "", quantity: "1", unit_price: "" }]); }
  function removeItem(id: string) { setItems((p) => p.length > 1 ? p.filter((i) => i.id !== id) : p); }

  async function saveRevision() {
    const cleanItems = items.filter((i) => i.description.trim()).map((i) => ({ id: i.id, description: i.description.trim(), quantity: Number(i.quantity) || 0, unit_price: Number(i.unit_price) || 0 }));
    if (!cleanItems.length) { setError("Add at least one quotation item."); return; }
    setSaving(true); setError(null);
    const days = Math.max(1, Number(validDays) || 15);
    const validUntil = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const nextVersion = Number(quotation.version || 1) + 1;

    const { data: inserted, error: insertError } = await supabase.from("quotations").insert({
      job_id: quotation.job_id,
      version: nextVersion,
      items: cleanItems,
      total: Math.round(total * 100) / 100,
      valid_until: validUntil,
      valid_days: days,
      project_job_id: quotation.project_job_id,
      customer_name: customerName,
      services_note: servicesNote || null,
      terms: terms || null,
      additional_notes: additionalNotes || null,
      discount_type: discountType,
      discount_value: Number(discountValue) || 0,
      discount_amount: Math.round(discountAmount * 100) / 100,
      tax_enabled: taxEnabled,
      tax_rate: Number(taxRate) || 0,
      tax_amount: Math.round(taxAmount * 100) / 100,
      other_charges: Number(otherCharges) || 0,
      other_charges_note: otherChargesNote || null,
      quotation_status: "draft",
      payment_terms: paymentTerms,
      created_by: quotation.created_by
    }).select("quotation_id").single();

    if (insertError || !inserted) { setError(insertError?.message ?? "Could not create the new quotation revision."); setSaving(false); return; }

    await supabase.from("quotations").update({ quotation_status: "superseded" }).eq("quotation_id", quotation.quotation_id);
    await supabase.from("quotations").update({ supersedes_quotation_id: quotation.quotation_id }).eq("quotation_id", inserted.quotation_id);
    await supabase.from("jobs").update({ quoted_value: Math.round(total * 100) / 100, payment_terms: paymentTerms }).eq("job_id", quotation.job_id);

    // Keep standard milestone amounts aligned with the revised quotation. Existing custom schedules are preserved.
    if (paymentTerms !== "custom") await supabase.from("payment_schedules").delete().eq("job_id", quotation.job_id).eq("status", "pending");
    if (paymentTerms === "50_50") await supabase.from("payment_schedules").insert([
      { job_id: quotation.job_id, sequence_no: 1, label: "Down Payment", percentage: 50, amount: Math.round(total * 0.5 * 100) / 100, due_stage: "approval" },
      { job_id: quotation.job_id, sequence_no: 2, label: "Completion Payment", percentage: 50, amount: Math.round(total * 0.5 * 100) / 100, due_stage: "completion" }
    ]);
    else if (paymentTerms === "full_on_completion") await supabase.from("payment_schedules").insert([{ job_id: quotation.job_id, sequence_no: 1, label: "Completion Payment", percentage: 100, amount: Math.round(total * 100) / 100, due_stage: "completion" }]);
    else if (paymentTerms === "full_on_installation") await supabase.from("payment_schedules").insert([{ job_id: quotation.job_id, sequence_no: 1, label: "Installation Payment", percentage: 100, amount: Math.round(total * 100) / 100, due_stage: "installation" }]);

    setSaving(false);
    router.push(returnPath);
    router.refresh();
  }

  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#087eb9]">Quotation revision</p><h1 className="mt-1 text-xl font-bold text-gray-900">{quotation.project_job_id ?? "Quotation"} · v{quotation.version}</h1><p className="mt-1 text-xs text-gray-500">Saving creates a new version. The existing document remains preserved for audit history.</p></div><button onClick={() => router.push(returnPath)} className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium">Back</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-1 block text-[11px] font-medium text-gray-500">Customer</label><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={`${inputClass} w-full`} /></div><div><label className="mb-1 block text-[11px] font-medium text-gray-500">Valid for</label><div className="flex items-center gap-2"><input type="number" min="1" value={validDays} onChange={(e) => setValidDays(e.target.value)} className={`${inputClass} w-20`} /><span className="text-xs text-gray-500">days</span></div></div></div>
    </div>

    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Items & pricing</h2><button onClick={addItem} className="text-xs font-semibold text-[#087eb9]">+ Add item</button></div><div className="space-y-2">{items.map((i) => <div key={i.id} className="grid grid-cols-[1fr_70px_120px_auto] gap-2"><input value={i.description} onChange={(e) => updateItem(i.id, { description: e.target.value })} placeholder="Description" className={inputClass} /><input type="number" min="0" value={i.quantity} onChange={(e) => updateItem(i.id, { quantity: e.target.value })} className={inputClass} /><input type="number" min="0" value={i.unit_price} onChange={(e) => updateItem(i.id, { unit_price: e.target.value })} className={inputClass} /><button onClick={() => removeItem(i.id)} className="rounded border border-gray-300 px-2 text-xs text-gray-500">✕</button></div>)}</div>
      <div className="mt-5 grid gap-3 md:grid-cols-3"><div><label className="mb-1 block text-[11px] font-medium text-gray-500">Discount</label><div className="flex gap-2"><select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)} className={`${inputClass} flex-1`}><option value="none">None</option><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select>{discountType !== "none" && <input type="number" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className={`${inputClass} w-24`} />}</div></div><div><label className="mb-1 block text-[11px] font-medium text-gray-500">VAT / Tax</label><div className="flex gap-2"><label className="flex items-center gap-1.5 rounded-md border px-2 text-xs"><input type="checkbox" checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} /> Apply</label>{taxEnabled && <input type="number" min="0" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={`${inputClass} w-20`} />}</div></div><div><label className="mb-1 block text-[11px] font-medium text-gray-500">Other charges</label><input type="number" min="0" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} className={`${inputClass} w-full`} /></div></div>
      {Number(otherCharges) > 0 && <input value={otherChargesNote} onChange={(e) => setOtherChargesNote(e.target.value)} className={`${inputClass} mt-2 w-full`} placeholder="Other charge description" />}
      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-right text-xs leading-6"><div>Subtotal <b>₱{subtotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</b></div>{discountAmount > 0 && <div className="text-rose-600">Discount -₱{discountAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</div>}{taxEnabled && <div>VAT {Number(taxRate) || 0}% <b>₱{taxAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</b></div>}{Number(otherCharges) > 0 && <div>Other charges <b>₱{Number(otherCharges).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</b></div>}<div className="mt-1 border-t border-gray-300 pt-1 text-base font-bold">TOTAL ₱{total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</div></div>
    </section>

    <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="mb-3 text-sm font-semibold">Customer-facing notes</h2><label className="mb-1 block text-[11px] font-medium text-gray-500">Additional notes / comments on quote</label><textarea rows={6} value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} className={`${inputClass} w-full`} placeholder="Comments, exclusions, scope notes, special requests…" /></div><div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="mb-3 text-sm font-semibold">Terms & payment</h2><select value={paymentTerms} disabled={quotation.payment_terms === "custom"} onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)} className={`${inputClass} mb-3 w-full disabled:bg-gray-100`}><option value="50_50">50% downpayment / 50% after completion</option><option value="full_on_completion">Full payment on completion</option><option value="full_on_installation">Full payment on installation</option>{quotation.payment_terms === "custom" && <option value="custom">Custom payment schedule (preserved)</option>}</select><input value={servicesNote} onChange={(e) => setServicesNote(e.target.value)} className={`${inputClass} mb-3 w-full`} placeholder="Services line" /><textarea rows={7} value={terms} onChange={(e) => setTerms(e.target.value)} className={`${inputClass} w-full`} placeholder="Terms and conditions" /></div></section>

    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
    <div className="flex justify-end gap-2"><button onClick={() => router.push(returnPath)} className="rounded-md border border-gray-300 px-4 py-2 text-xs font-medium">Cancel</button><button onClick={saveRevision} disabled={saving} className="rounded-md bg-[#0784c8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#006da9] disabled:opacity-50">{saving ? "Saving revision…" : `Save as v${Number(quotation.version) + 1}`}</button></div>
  </div>;
}
