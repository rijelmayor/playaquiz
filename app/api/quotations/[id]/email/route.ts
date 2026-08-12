import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";
import { buildQuotationPdfBytes } from "@/lib/quotation/buildQuotationPdf";
import { readFile } from "node:fs/promises";
import path from "node:path";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

// Sends a quotation PDF by email. Runs server-side because it needs SMTP
// credentials, which must never reach the browser. Auth/authorization is
// enforced by the same Supabase session + RLS the rest of the app uses —
// this route can only read a quotation the signed-in user is already
// allowed to see (sales: own jobs, admin: any).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const recipient = typeof body.email === "string" ? body.email.trim() : "";
  if (!recipient) {
    return NextResponse.json({ error: "Recipient email is required." }, { status: 400 });
  }

  const { data: quotation, error: quotationError } = await supabase
    .from("quotations")
    .select("*, jobs(job_id, clients(name, email))")
    .eq("quotation_id", params.id)
    .single();

  if (quotationError || !quotation) {
    return NextResponse.json(
      { error: quotationError?.message ?? "Quotation not found." },
      { status: 404 }
    );
  }

  const { data: settings } = await supabase
    .from("quotation_settings")
    .select("*")
    .eq("id", 1)
    .single();

  let pdfBytes: Uint8Array;
  try {
    const logoBytes = await readFile(path.join(process.cwd(), "public", "dwlogo.jpg"));
    pdfBytes = await buildQuotationPdfBytes({
      companyName: settings?.company_name ?? "Delight Works Advertising Signages",
      companyAddress:
        settings?.company_address ??
        "2nd Flr, Unit 15, Ellen's Bldg, Jasmin St., Capitol Site, Cebu City",
      companyContact: settings?.company_contact ?? "09569934866/09329848552/09205102720",
      socialMediaAccount: settings?.social_media_account,
      emailAddress: settings?.email_address,
      website: settings?.website,
      logoBytes,
      dateCreated: formatDate(quotation.created_at),
      validUntil: quotation.valid_until ? formatDate(quotation.valid_until) : undefined,
      customerName: quotation.customer_name ?? quotation.jobs?.clients?.name ?? "—",
      customerContact: quotation.jobs?.clients?.contact ?? null,
      customerEmail: quotation.jobs?.clients?.email ?? null,
      customerLocation: quotation.jobs?.clients?.location ?? null,
      projectJobId: quotation.project_job_id ?? String(quotation.job_id).slice(0, 8).toUpperCase(),
      version: quotation.version ?? 1,
      items: quotation.items ?? [],
      servicesNote:
        quotation.services_note ||
        settings?.services_note ||
        "Mock-Up/Mobilization/Installation FREE",
      terms: quotation.terms || settings?.terms || "",
      additionalNotes: quotation.additional_notes,
      discountType: quotation.discount_type,
      discountValue: quotation.discount_value,
      discountAmount: quotation.discount_amount,
      taxEnabled: quotation.tax_enabled,
      taxRate: quotation.tax_rate,
      taxAmount: quotation.tax_amount,
      otherCharges: quotation.other_charges,
      otherChargesNote: quotation.other_charges_note,
      validDays: quotation.valid_days ?? settings?.valid_days ?? 15,
      paymentTerms: quotation.payment_terms ?? "50_50"
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Couldn't generate the PDF: ${err?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM) {
    return NextResponse.json(
      {
        error:
          "Email sending is not fully configured. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS and SMTP_FROM in Vercel Environment Variables."
      },
      { status: 500 }
    );
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });

  const customerName = quotation.customer_name ?? quotation.jobs?.clients?.name ?? "";

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      replyTo: process.env.SMTP_FROM,
      to: recipient,
      subject: `Quotation ${quotation.project_job_id ?? ""}${customerName ? ` — ${customerName}` : ""}`,
      text: `Good day${customerName ? ` ${customerName}` : ""},\n\nPlease find attached our quotation for your signage project. If you have any questions or would like any revisions, please let us know.\n\nThank you,\nDelight Works Advertising Signages`,
      attachments: [
        {
          filename: `quotation-${quotation.project_job_id ?? quotation.quotation_id.slice(0, 8)}.pdf`,
          content: Buffer.from(pdfBytes)
        }
      ]
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to send email: ${err?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }

  const { error: sentUpdateError } = await supabase
    .from("quotations")
    .update({ sent_at: new Date().toISOString(), sent_to: recipient, quotation_status: "sent" })
    .eq("quotation_id", params.id);

  if (sentUpdateError) {
    return NextResponse.json({ error: `Email was sent, but the quotation status could not be updated: ${sentUpdateError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
