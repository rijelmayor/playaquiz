"use client";

import { useState } from "react";
import type { QuotationItem, QuotationSettings } from "@/lib/types/database";

export interface QuotationForDocument {
  quotation_id: string;
  project_job_id: string | null;
  customer_name: string | null;
  items: QuotationItem[];
  terms: string | null;
  services_note: string | null;
  valid_days: number;
  created_at: string;
  sent_at: string | null;
  sent_to: string | null;
  payment_terms?: "50_50" | "full_on_completion" | "full_on_installation" | "custom";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

// "Download as PDF" builds the file entirely client-side (pdf-lib has no
// DOM dependency), so it works instantly with no server round trip.
// "Send via email" needs SMTP credentials, so that goes through the
// /api/quotations/[id]/email route, which rebuilds the same PDF server-side.
export function QuotationDocumentActions({
  quotation,
  settings,
  defaultEmail
}: {
  quotation: QuotationForDocument;
  settings: QuotationSettings | null;
  defaultEmail: string | null;
}) {
  const [downloading, setDownloading] = useState(false);
  const [showEmailField, setShowEmailField] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(
    quotation.sent_at ? `Sent to ${quotation.sent_to} on ${formatDate(quotation.sent_at)}` : null
  );
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const { buildQuotationPdfBytes } = await import("@/lib/quotation/buildQuotationPdf");
      const logoResponse = await fetch("/dwlogo.jpg");
      const logoBytes = logoResponse.ok ? new Uint8Array(await logoResponse.arrayBuffer()) : undefined;
      const bytes = await buildQuotationPdfBytes({
        companyName: settings?.company_name ?? "Delight Works Advertising Signages",
        companyAddress:
          settings?.company_address ?? "2nd Flr, Unit 15, Ellen's Bldg, Jasmin St., Capitol Site, Cebu City",
        companyContact: settings?.company_contact ?? "09569934866/09329848552/09205102720",
        socialMediaAccount: settings?.social_media_account,
        emailAddress: settings?.email_address,
        website: settings?.website,
        logoBytes,
        dateCreated: formatDate(quotation.created_at),
        customerName: quotation.customer_name ?? "—",
        projectJobId: quotation.project_job_id ?? quotation.quotation_id.slice(0, 8).toUpperCase(),
        items: quotation.items ?? [],
        servicesNote:
          quotation.services_note || settings?.services_note || "Mock-Up/Mobilization/Installation FREE",
        terms: quotation.terms || settings?.terms || "",
        validDays: quotation.valid_days ?? settings?.valid_days ?? 15,
        paymentTerms: quotation.payment_terms ?? "50_50"
      });
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quotation-${quotation.project_job_id ?? quotation.quotation_id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message ?? "Couldn't generate the PDF.");
    } finally {
      setDownloading(false);
    }
  }

  async function sendEmail() {
    if (!email.trim()) {
      setError("Enter a recipient email address.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotations/${quotation.quotation_id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to send email.");
        return;
      }
      setStatus(`Sent to ${email.trim()} just now`);
      setShowEmailField(false);
    } catch (err: any) {
      setError(err?.message ?? "Failed to send email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={download}
        disabled={downloading}
        className="touch-target rounded-lg border border-gray-300 bg-white/80 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-white disabled:opacity-50"
      >
        {downloading ? "Preparing…" : "Download PDF"}
      </button>
      <button
        type="button"
        onClick={() => setShowEmailField((v) => !v)}
        className="touch-target rounded-lg border border-gray-300 bg-white/80 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-white"
      >
        Send via email
      </button>
      {status && !showEmailField && <span className="text-[11px] text-gray-500">{status}</span>}

      {showEmailField && (
        <div className="flex w-full flex-wrap items-center gap-1.5">
          <input
            type="email"
            placeholder="client@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 sm:w-52 sm:flex-none"
          />
          <button
            type="button"
            onClick={sendEmail}
            disabled={sending}
            className="touch-target rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      )}
      {error && <span className="w-full text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
