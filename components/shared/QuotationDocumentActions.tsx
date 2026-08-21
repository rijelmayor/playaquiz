"use client";

import { useState } from "react";
import type { QuotationItem, QuotationSettings } from "@/lib/types/database";

export interface QuotationForDocument {
  quotation_id: string;
  job_id?: string | null;
  project_job_id: string | null;

  // Job name is the value displayed under PROJECT DESCRIPTION.
  job_name?: string | null;

  customer_name: string | null;
  items: QuotationItem[];

  subtotal?: number;
  discount_type?: "none" | "percentage" | "fixed";
  discount_value?: number;
  discount_amount?: number;

  tax_enabled?: boolean;
  tax_rate?: number;
  tax_amount?: number;

  other_charges?: number;
  other_charges_note?: string | null;

  additional_notes?: string | null;

  quotation_status?: string;
  version?: number;

  valid_until?: string | null;
  terms: string | null;
  services_note: string | null;
  valid_days: number;

  created_at: string;
  sent_at: string | null;
  sent_to: string | null;

  payment_terms?:
    | "50_50"
    | "full_on_completion"
    | "full_on_installation"
    | "custom";

  customer_contact?: string | null;
  customer_email?: string | null;
  customer_location?: string | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

async function fetchImageBytes(
  url: string
): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);

    if (!res.ok) {
      return null;
    }

    return new Uint8Array(
      await res.arrayBuffer()
    );
  } catch {
    return null;
  }
}

/**
 * Fetch mock-up URLs and convert WebP → PNG
 * so pdf-lib can embed them.
 */
async function collectMockupBytes(
  urls: (string | null | undefined)[]
): Promise<Uint8Array[]> {
  const valid = (urls ?? []).filter(
    (u): u is string => Boolean(u)
  );

  if (valid.length === 0) {
    return [];
  }

  const {
    toPdfImageBytesList
  } = await import(
    "@/lib/quotation/toPdfImageBytes"
  );

  const raw = await Promise.all(
    valid.map(fetchImageBytes)
  );

  return toPdfImageBytesList(
    raw.filter(
      (b): b is Uint8Array => Boolean(b)
    )
  );
}

export function QuotationDocumentActions({
  quotation,
  settings,
  defaultEmail,
  editHref = `/sales/quotations/${quotation.quotation_id}/edit`,
  mockupUrls = []
}: {
  quotation: QuotationForDocument;
  settings: QuotationSettings | null;
  defaultEmail: string | null;
  editHref?: string;

  /**
   * Signed URLs for Sample Mock-Up / reference photos
   * to embed in the PDF.
   */
  mockupUrls?: (
    | string
    | null
    | undefined
  )[];
}) {
  const [downloading, setDownloading] =
    useState(false);

  const [showEmailField, setShowEmailField] =
    useState(false);

  const [email, setEmail] =
    useState(defaultEmail ?? "");

  const [sending, setSending] =
    useState(false);

  const [status, setStatus] =
    useState<string | null>(
      quotation.sent_at
        ? `Sent to ${quotation.sent_to} on ${formatDate(
            quotation.sent_at
          )}`
        : null
    );

  const [error, setError] =
    useState<string | null>(null);

  async function buildAndDownload() {
    setDownloading(true);
    setError(null);

    try {
      const {
        buildQuotationPdfBytes
      } = await import(
        "@/lib/quotation/buildQuotationPdf"
      );

      // ----------------------------------------------------------
      // LOGO
      // ----------------------------------------------------------

      const logoResponse =
        await fetch("/dwlogo.jpg");

      const logoBytes =
        logoResponse.ok
          ? new Uint8Array(
              await logoResponse.arrayBuffer()
            )
          : undefined;

      // ----------------------------------------------------------
      // GCASH QR
      // ----------------------------------------------------------

      let gcashQrBytes:
        | Uint8Array
        | undefined;

      if (settings?.gcash_qr_url) {
        const qrResponse =
          await fetch(
            settings.gcash_qr_url
          );

        if (qrResponse.ok) {
          gcashQrBytes =
            new Uint8Array(
              await qrResponse.arrayBuffer()
            );
        }
      }

      // ----------------------------------------------------------
      // SAMPLE MOCK-UP IMAGES
      // ----------------------------------------------------------

      const mockupImageBytes =
        await collectMockupBytes(
          mockupUrls
        );

      // ----------------------------------------------------------
      // DATES
      // ----------------------------------------------------------

      const created =
        new Date(
          quotation.created_at
        );

      const valid =
        quotation.valid_until
          ? new Date(
              quotation.valid_until
            )
          : new Date(
              created.getTime() +
                (quotation.valid_days ??
                  15) *
                  86400000
            );

      // ----------------------------------------------------------
      // JOB NAME
      // ----------------------------------------------------------
      //
      // THIS is the value used by:
      //
      // PROJECT DESCRIPTION
      //
      // It intentionally does NOT use services_note.
      //
      const jobName =
        quotation.job_name?.trim() ||
        "Signage Project";

      // ----------------------------------------------------------
      // BUILD PDF
      // ----------------------------------------------------------

      const bytes =
        await buildQuotationPdfBytes({
          companyName:
            settings?.company_name ??
            "Delight Works Advertising Signages",

          companyAddress:
            settings?.company_address ??
            "2nd Flr, Unit 15, Ellen's Bldg, Jasmin St., Capitol Site, Cebu City",

          companyContact:
            settings?.company_contact ??
            "09569934866/09329848552/09205102720",

          socialMediaAccount:
            settings?.social_media_account,

          emailAddress:
            settings?.email_address,

          website:
            settings?.website,

          logoBytes,

          dateCreated:
            formatDate(
              quotation.created_at
            ),

          validUntil:
            valid.toLocaleDateString(
              "en-PH",
              {
                year: "numeric",
                month: "short",
                day: "numeric"
              }
            ),

          customerName:
            quotation.customer_name ??
            "—",

          customerContact:
            quotation.customer_contact,

          customerEmail:
            quotation.customer_email,

          customerLocation:
            quotation.customer_location,

          projectJobId:
            quotation.project_job_id ??
            quotation.quotation_id
              .slice(0, 8)
              .toUpperCase(),

          // ------------------------------------------------------
          // IMPORTANT:
          // Actual job name for PROJECT DESCRIPTION.
          // ------------------------------------------------------
          jobName,

          version:
            quotation.version ?? 1,

          items:
            quotation.items ?? [],

          // Keep services_note as separate quotation information.
          // It is NOT used for PROJECT DESCRIPTION anymore.
          servicesNote:
            quotation.services_note ??
            settings?.services_note ??
            "",

          terms:
            quotation.terms ??
            settings?.terms ??
            "",

          additionalNotes:
            quotation.additional_notes,

          validDays:
            quotation.valid_days ??
            settings?.valid_days ??
            15,

          discountType:
            quotation.discount_type,

          discountValue:
            quotation.discount_value,

          discountAmount:
            quotation.discount_amount,

          taxEnabled:
            quotation.tax_enabled,

          taxRate:
            quotation.tax_rate,

          taxAmount:
            quotation.tax_amount,

          otherCharges:
            quotation.other_charges,

          otherChargesNote:
            quotation.other_charges_note,

          paymentTerms:
            quotation.payment_terms ??
            "50_50",

          bankName:
            settings?.bank_name,

          bankAccountName:
            settings?.bank_account_name,

          bankAccountNumber:
            settings?.bank_account_number,

          gcashNumber:
            settings?.gcash_number,

          gcashAccountName:
            settings?.gcash_account_name,

          gcashQrBytes,

          mockupImageBytes
        });

      // ----------------------------------------------------------
      // DOWNLOAD PDF
      // ----------------------------------------------------------

      const blob =
        new Blob(
          [bytes as BlobPart],
          {
            type: "application/pdf"
          }
        );

      const url =
        URL.createObjectURL(blob);

      const a =
        document.createElement("a");

      a.href = url;

      a.download =
        `quotation-${
          quotation.project_job_id ??
          quotation.quotation_id.slice(
            0,
            8
          )
        }-v${
          quotation.version ?? 1
        }.pdf`;

      a.click();

      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(
        err?.message ??
          "Couldn't generate the PDF."
      );
    } finally {
      setDownloading(false);
    }
  }

  async function sendEmail() {
    if (!email.trim()) {
      setError(
        "Enter a recipient email address."
      );
      return;
    }

    setSending(true);
    setError(null);

    try {
      const res =
        await fetch(
          `/api/quotations/${quotation.quotation_id}/email`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              email: email.trim()
            })
          }
        );

      const body =
        await res
          .json()
          .catch(() => ({}));

      if (!res.ok) {
        setError(
          body.error ??
            "Failed to send email."
        );
        return;
      }

      setStatus(
        `Sent to ${email.trim()} just now`
      );

      setShowEmailField(false);
    } catch (err: any) {
      setError(
        err?.message ??
          "Failed to send email."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={buildAndDownload}
        disabled={downloading}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:border-cyan-500 disabled:opacity-50"
      >
        {downloading
          ? "Preparing…"
          : "Download PDF"}
      </button>

      <a
        href={editHref}
        className="rounded-lg border border-cyan-600/40 bg-cyan-50 px-3 py-2 text-xs font-semibold text-[#087eb9]"
      >
        Edit / Revise
      </a>

      <button
        type="button"
        onClick={() =>
          setShowEmailField(
            (v) => !v
          )
        }
        className="rounded-lg bg-[#0784c8] px-3 py-2 text-xs font-semibold text-white hover:bg-[#006da9]"
      >
        {quotation.sent_at
          ? "Resend email"
          : "Send via email"}
      </button>

      {status &&
        !showEmailField && (
          <span className="text-[11px] text-gray-500">
            {status}
          </span>
        )}

      {showEmailField && (
        <div className="flex w-full flex-wrap items-center gap-1.5">
          <input
            type="email"
            placeholder="client@email.com"
            value={email}
            onChange={(e) =>
              setEmail(
                e.target.value
              )
            }
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs sm:w-64 sm:flex-none"
          />

          <button
            type="button"
            onClick={sendEmail}
            disabled={sending}
            className="rounded-lg bg-[#0784c8] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {sending
              ? "Sending…"
              : "Send"}
          </button>
        </div>
      )}

      {error && (
        <span className="w-full text-[11px] text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
