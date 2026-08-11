"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { QuotationSettings } from "@/lib/types/database";

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const supabase = createClient();

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
