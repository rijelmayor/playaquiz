"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { QuotationSettings } from "@/lib/types/database";

const MAX_QR_BYTES = 3 * 1024 * 1024;

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";
const labelClass = "mb-1 block text-[11px] font-medium text-gray-500";

// Admin-editable defaults for every quotation's header/terms — the
// variables described in the quotation format (company info, standard
// services line, terms & conditions, validity window). Individual
// quotations can still override any of these per-document.
export function QuotationSettingsForm({ settings }: { settings: QuotationSettings }) {
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState(settings.company_name);
  const [companyAddress, setCompanyAddress] = useState(settings.company_address);
  const [companyContact, setCompanyContact] = useState(settings.company_contact);
  const [socialMediaAccount, setSocialMediaAccount] = useState(settings.social_media_account ?? "");
  const [emailAddress, setEmailAddress] = useState(settings.email_address ?? "");
  const [website, setWebsite] = useState(settings.website ?? "");
  const [servicesNote, setServicesNote] = useState(settings.services_note);
  const [terms, setTerms] = useState(settings.terms);
  const [validDays, setValidDays] = useState(String(settings.valid_days));
  const [bankName, setBankName] = useState(settings.bank_name ?? "");
  const [bankAccountName, setBankAccountName] = useState(settings.bank_account_name ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(settings.bank_account_number ?? "");
  const [gcashNumber, setGcashNumber] = useState(settings.gcash_number ?? "");
  const [gcashAccountName, setGcashAccountName] = useState(settings.gcash_account_name ?? "");
  const [gcashQrUrl, setGcashQrUrl] = useState(settings.gcash_qr_url ?? "");
  const [uploadingQr, setUploadingQr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const qrInputRef = useRef<HTMLInputElement>(null);

  async function uploadQr(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("QR code must be an image file."); return; }
    if (file.size > MAX_QR_BYTES) { setError("QR code image is too large. Please use a file under 3 MB."); return; }

    setUploadingQr(true);
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `gcash-qr/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("quotation-assets")
      .upload(path, file, { upsert: false, contentType: file.type, cacheControl: "31536000" });

    if (uploadError) { setError(uploadError.message); setUploadingQr(false); return; }

    const { data: publicUrlData } = supabase.storage.from("quotation-assets").getPublicUrl(path);
    setGcashQrUrl(publicUrlData.publicUrl);
    setUploadingQr(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error: updateError } = await supabase
      .from("quotation_settings")
      .update({
        company_name: companyName,
        company_address: companyAddress,
        company_contact: companyContact,
        social_media_account: socialMediaAccount.trim(),
        email_address: emailAddress.trim(),
        website: website.trim(),
        services_note: servicesNote,
        terms,
        valid_days: Number(validDays) || 15,
        bank_name: bankName.trim() || null,
        bank_account_name: bankAccountName.trim() || null,
        bank_account_number: bankAccountNumber.trim() || null,
        gcash_number: gcashNumber.trim() || null,
        gcash_account_name: gcashAccountName.trim() || null,
        gcash_qr_url: gcashQrUrl.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", 1);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-gray-500"
      >
        Quotation defaults
        <span className="text-xs text-gray-400">{open ? "Hide" : "Edit"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-gray-100 p-4">
          <div>
            <label className={labelClass}>Company name</label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Address</label>
            <input
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Contact numbers</label>
            <input
              value={companyContact}
              onChange={(e) => setCompanyContact(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Social Media Account</label>
              <input value={socialMediaAccount} onChange={(e) => setSocialMediaAccount(e.target.value)} placeholder="@dwadsign" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Email Address</label>
              <input type="email" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="hello@example.com" className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Website</label>
            <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Services line</label>
            <input value={servicesNote} onChange={(e) => setServicesNote(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Terms and Condition (one per line)</label>
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={7}
              className={inputClass}
            />
          </div>
          <div className="w-32">
            <label className={labelClass}>Quote valid for (days)</label>
            <input
              type="number"
              min="1"
              value={validDays}
              onChange={(e) => setValidDays(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Payment options (printed at the bottom of the quotation PDF)</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Bank name</label>
                <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="BDO" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Account name</label>
                <input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} placeholder="Delight Works AdSign" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Account number</label>
                <input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>GCash number</label>
                <input value={gcashNumber} onChange={(e) => setGcashNumber(e.target.value)} placeholder="09XX XXX XXXX" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>GCash account name</label>
                <input value={gcashAccountName} onChange={(e) => setGcashAccountName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>GCash QR code</label>
                <div className="flex items-center gap-2">
                  {gcashQrUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={gcashQrUrl} alt="GCash QR" className="h-10 w-10 rounded border border-gray-200 object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => qrInputRef.current?.click()}
                    disabled={uploadingQr}
                    className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 disabled:opacity-50"
                  >
                    {uploadingQr ? "Uploading…" : gcashQrUrl ? "Replace" : "Upload"}
                  </button>
                  {gcashQrUrl && (
                    <button type="button" onClick={() => setGcashQrUrl("")} className="text-[11px] text-red-600">
                      Remove
                    </button>
                  )}
                </div>
                <input ref={qrInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={uploadQr} />
              </div>
            </div>
            <p className="mt-2 text-[10px] text-gray-400">Leave any of these blank to skip that payment method on the quotation. The QR only appears if uploaded.</p>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {saving && <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}{saving ? "Saving…" : "Save defaults"}
            </button>
            {saved && <span className="text-xs text-emerald-600">Saved.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
