import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";
import { buildQuotationPdfBytes } from "@/lib/quotation/buildQuotationPdf";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

async function loadMockupBytes(
  supabase: ReturnType<typeof createClient>,
  jobId: string | null | undefined
): Promise<Uint8Array[]> {
  if (!jobId) return [];

  const { data: attachments } = await supabase
    .from("job_attachments")
    .select("file_path")
    .eq("job_id", jobId)
    .eq("category", "reference")
    .order("created_at", { ascending: true });

  if (!attachments?.length) return [];

  const raw: Uint8Array[] = [];

  for (const row of attachments) {
    try {
      const { data, error } = await supabase.storage
        .from("job-attachments")
        .download(row.file_path);

      if (error || !data) continue;

      const buf = new Uint8Array(await data.arrayBuffer());

      if (buf.length > 0) {
        raw.push(buf);
      }
    } catch {
      // Skip unreadable images; PDF still generates without them.
    }
  }

  // CRM stores optimized photos as WebP.
  // pdf-lib supports PNG/JPEG, so convert everything to PNG server-side.
  const out: Uint8Array[] = [];

  try {
    const sharpMod = await import("sharp");
    const sharp = sharpMod.default ?? sharpMod;

    for (const buf of raw) {
      try {
        const png = await sharp(Buffer.from(buf))
          .png()
          .toBuffer();

        out.push(new Uint8Array(png));
      } catch {
        // Skip undecodable image.
      }
    }
  } catch {
    // If sharp is unavailable, omit mock-ups rather than breaking email.
  }

  return out;
}

// Sends a quotation PDF by email.
// Runs server-side because it requires SMTP credentials.
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Not signed in." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));

  const recipient =
    typeof body.email === "string"
      ? body.email.trim()
      : "";

  if (!recipient) {
    return NextResponse.json(
      { error: "Recipient email is required." },
      { status: 400 }
    );
  }

  // IMPORTANT:
  // job_name is now explicitly loaded from the related jobs record.
  const { data: quotation, error: quotationError } = await supabase
    .from("quotations")
    .select(
      "*, jobs(job_id, job_name, clients(name, email, contact, location))"
    )
    .eq("quotation_id", params.id)
    .single();

  if (quotationError || !quotation) {
    return NextResponse.json(
      {
        error:
          quotationError?.message ??
          "Quotation not found."
      },
      { status: 404 }
    );
  }

  const { data: settings } = await supabase
    .from("quotation_settings")
    .select("*")
    .eq("id", 1)
    .single();

  const companyName =
    settings?.company_name ??
    "Delight Works Advertising Signages";

  const companyContact =
    settings?.company_contact ??
    "09569934866/09329848552/09205102720";

  const companyEmail =
    settings?.email_address ??
    process.env.SMTP_FROM ??
    "";

  const companyWebsite =
    settings?.website ??
    "";

  const projectRef =
    quotation.project_job_id ??
    String(
      quotation.job_id ??
      quotation.quotation_id
    )
      .slice(0, 8)
      .toUpperCase();

  const customerName =
    quotation.customer_name ??
    quotation.jobs?.clients?.name ??
    "";

  const version =
    quotation.version ?? 1;

  // ------------------------------------------------------------
  // JOB NAME
  // ------------------------------------------------------------
  //
  // This is the value that MUST appear under:
  //
  // PROJECT DESCRIPTION
  //
  // It is intentionally NOT taken from services_note.
  //
  const jobName =
    quotation.jobs?.job_name?.trim() ||
    "Signage Project";

  let pdfBytes: Uint8Array;

  try {
    const logoBytes = await readFile(
      path.join(
        process.cwd(),
        "public",
        "dwlogo.jpg"
      )
    );

    let gcashQrBytes: Uint8Array | undefined;

    if (settings?.gcash_qr_url) {
      const qrResponse = await fetch(
        settings.gcash_qr_url
      );

      if (qrResponse.ok) {
        gcashQrBytes = new Uint8Array(
          await qrResponse.arrayBuffer()
        );
      }
    }

    const mockupImageBytes =
      await loadMockupBytes(
        supabase,
        quotation.job_id ??
          quotation.jobs?.job_id
      );

    pdfBytes =
      await buildQuotationPdfBytes({
        companyName,

        companyAddress:
          settings?.company_address ??
          "2nd Flr, Unit 15, Ellen's Bldg, Jasmin St., Capitol Site, Cebu City",

        companyContact,

        socialMediaAccount:
          settings?.social_media_account,

        emailAddress:
          settings?.email_address,

        website:
          settings?.website,

        logoBytes,

        dateCreated:
          formatDate(quotation.created_at),

        validUntil:
          quotation.valid_until
            ? formatDate(quotation.valid_until)
            : undefined,

        customerName:
          customerName || "—",

        customerContact:
          quotation.customer_contact ??
          quotation.jobs?.clients?.contact ??
          null,

        customerEmail:
          quotation.customer_email ??
          quotation.jobs?.clients?.email ??
          null,

        customerLocation:
          quotation.customer_location ??
          quotation.jobs?.clients?.location ??
          null,

        projectJobId:
          projectRef,

        // ------------------------------------------------------
        // THIS IS THE IMPORTANT FIX
        // ------------------------------------------------------
        jobName,

        version,

        items:
          quotation.items ?? [],

        // servicesNote remains available as quotation data,
        // but it is NO LONGER used as PROJECT DESCRIPTION.
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

        validDays:
          quotation.valid_days ??
          settings?.valid_days ??
          15,

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
  } catch (err: any) {
    return NextResponse.json(
      {
        error:
          `Couldn't generate the PDF: ${
            err?.message ??
            "unknown error"
          }`
      },
      { status: 500 }
    );
  }

  // ------------------------------------------------------------
  // SMTP VALIDATION
  // ------------------------------------------------------------

  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS ||
    !process.env.SMTP_FROM
  ) {
    return NextResponse.json(
      {
        error:
          "Email sending is not fully configured. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS and SMTP_FROM in Vercel Environment Variables."
      },
      { status: 500 }
    );
  }

  const rawFrom =
    process.env.SMTP_FROM.trim();

  const fromAddress =
    rawFrom.includes("<")
      ? rawFrom
      : `"${companyName.replace(
          /"/g,
          ""
        )}" <${rawFrom}>`;

  const transporter =
    nodemailer.createTransport({
      host: process.env.SMTP_HOST,

      port: Number(
        process.env.SMTP_PORT ?? 587
      ),

      secure:
        process.env.SMTP_SECURE === "true",

      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        : undefined,

      tls: {
        minVersion: "TLSv1.2"
      }
    });

  // ------------------------------------------------------------
  // EMAIL CONTENT
  // ------------------------------------------------------------

  const greeting =
    customerName
      ? `Good day ${customerName},`
      : "Good day,";

  const contactLine =
    companyContact
      ? `\nYou may reach us at ${companyContact}${
          companyEmail
            ? ` or ${companyEmail}`
            : ""
        }.`
      : companyEmail
        ? `\nYou may reach us at ${companyEmail}.`
        : "";

  const websiteLine =
    companyWebsite
      ? `\nWebsite: ${companyWebsite}`
      : "";

  const textBody =
    `${greeting}\n\n` +
    `Please find attached our quotation (${projectRef}, version ${version}) for your signage project.\n\n` +
    `If you have any questions or would like any revisions, please reply to this email or contact us directly.` +
    `${contactLine}${websiteLine}\n\n` +
    `Thank you for considering ${companyName}.\n\n` +
    `Best regards,\n` +
    `${companyName}\n` +
    `${companyContact}`;

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f4f6f8;
    font-family:Arial,Helvetica,sans-serif;
    color:#1a1a1a;
  "
>
  <table
    role="presentation"
    width="100%"
    cellpadding="0"
    cellspacing="0"
    style="
      background:#f4f6f8;
      padding:24px 12px;
    "
  >
    <tr>
      <td align="center">

        <table
          role="presentation"
          width="560"
          cellpadding="0"
          cellspacing="0"
          style="
            background:#ffffff;
            border-radius:8px;
            overflow:hidden;
            border:1px solid #e5e7eb;
          "
        >

          <tr>
            <td
              style="
                background:#0a1520;
                padding:18px 24px;
              "
            >
              <p
                style="
                  margin:0;
                  font-size:16px;
                  font-weight:700;
                  color:#ffffff;
                "
              >
                ${escapeHtml(companyName)}
              </p>

              <p
                style="
                  margin:4px 0 0;
                  font-size:12px;
                  color:#a8c5d4;
                "
              >
                Quotation
                ${escapeHtml(projectRef)}
                · v${version}
              </p>
            </td>
          </tr>

          <tr>
            <td
              style="
                padding:24px;
              "
            >

              <p
                style="
                  margin:0 0 12px;
                  font-size:14px;
                  line-height:1.5;
                "
              >
                ${escapeHtml(greeting)}
              </p>

              <p
                style="
                  margin:0 0 12px;
                  font-size:14px;
                  line-height:1.5;
                "
              >
                Please find attached our quotation
                for your signage project. If you have
                any questions or would like any revisions,
                please reply to this email or contact us
                directly.
              </p>

              <p
                style="
                  margin:0 0 4px;
                  font-size:13px;
                  color:#4b5563;
                "
              >
                Contact:
                ${escapeHtml(companyContact)}
              </p>

              ${
                companyEmail
                  ? `
                    <p
                      style="
                        margin:0 0 4px;
                        font-size:13px;
                        color:#4b5563;
                      "
                    >
                      Email:
                      ${escapeHtml(companyEmail)}
                    </p>
                  `
                  : ""
              }

              ${
                companyWebsite
                  ? `
                    <p
                      style="
                        margin:0 0 12px;
                        font-size:13px;
                        color:#4b5563;
                      "
                    >
                      Website:
                      ${escapeHtml(companyWebsite)}
                    </p>
                  `
                  : `
                    <p style="margin:0 0 12px;"></p>
                  `
              }

              <p
                style="
                  margin:16px 0 0;
                  font-size:14px;
                  line-height:1.5;
                "
              >
                Thank you for considering
                ${escapeHtml(companyName)}.
              </p>

              <p
                style="
                  margin:16px 0 0;
                  font-size:14px;
                  line-height:1.5;
                "
              >
                Best regards,<br>
                <strong>
                  ${escapeHtml(companyName)}
                </strong>
              </p>

            </td>
          </tr>

          <tr>
            <td
              style="
                background:#f9fafb;
                padding:12px 24px;
                border-top:1px solid #e5e7eb;
              "
            >
              <p
                style="
                  margin:0;
                  font-size:11px;
                  color:#9ca3af;
                "
              >
                This message was sent by
                ${escapeHtml(companyName)}.
                The PDF quotation is attached
                for your records.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

  // ------------------------------------------------------------
  // MESSAGE ID
  // ------------------------------------------------------------

  const messageIdDomain = (() => {
    const match =
      rawFrom.match(/@([^\s>]+)/);

    return (
      match?.[1] ??
      "delightworks.local"
    );
  })();

  const messageId =
    `<${randomUUID()}@${messageIdDomain}>`;

  // ------------------------------------------------------------
  // SEND EMAIL
  // ------------------------------------------------------------

  try {
    await transporter.sendMail({
      from: fromAddress,

      replyTo:
        companyEmail ||
        rawFrom,

      to: recipient,

      subject:
        `Quotation ${projectRef}${
          customerName
            ? ` for ${customerName}`
            : ""
        } — ${companyName}`,

      text: textBody,

      html: htmlBody,

      messageId,

      headers: {
        "X-Mailer": "Delight Works CRM",
        "X-Priority": "3",
        Importance: "normal",
        "X-MSMail-Priority": "Normal"
      },

      attachments: [
        {
          filename:
            `quotation-${projectRef}-v${version}.pdf`,

          content:
            Buffer.from(pdfBytes),

          contentType:
            "application/pdf",

          contentDisposition:
            "attachment"
        }
      ]
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error:
          `Failed to send email: ${
            err?.message ??
            "unknown error"
          }`
      },
      { status: 500 }
    );
  }

  // ------------------------------------------------------------
  // UPDATE QUOTATION STATUS
  // ------------------------------------------------------------

  const {
    error: sentUpdateError
  } = await supabase
    .from("quotations")
    .update({
      sent_at:
        new Date().toISOString(),

      sent_to:
        recipient,

      quotation_status:
        "sent"
    })
    .eq(
      "quotation_id",
      params.id
    );

  if (sentUpdateError) {
    return NextResponse.json(
      {
        error:
          `Email was sent, but the quotation status could not be updated: ${sentUpdateError.message}`
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true
  });
}

function escapeHtml(value: string) {
  return value
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    );
}
