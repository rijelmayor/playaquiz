import { createClient } from "@/lib/supabase/server";
import { signAttachmentUrls } from "@/lib/supabase/signedUrls";
import { PortalShell } from "@/components/shared/PortalShell";
import { QuotationCreateForm } from "@/components/shared/QuotationCreateForm";
import { QuotationSettingsForm } from "@/components/admin/QuotationSettingsForm";
import { QuotationQueue } from "@/components/admin/QuotationQueue";
import { DesignApprovalQueue } from "@/components/admin/DesignApprovalQueue";
import { JobOrderCreateForm } from "@/components/admin/JobOrderCreateForm";
import { AdminWorkspace, type AdminJobRow } from "@/components/admin/AdminWorkspace";
import { type AdminPaymentJob } from "@/components/admin/AdminPaymentManager";
import type { PaymentTerms } from "@/lib/types/database";

export default async function AdminPortal() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const { data: admin } = await supabase
    .from("users")
    .select("user_id, name")
    .eq("auth_id", session!.user.id)
    .single();

  const [
    { data: jobs },
    { data: quotations },
    { data: payments },
    { data: paymentSchedules },
    { data: designs },
    { data: jobOrders },
    { data: attachments },
    { data: fabricators },
    { data: quotationSettings }
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("job_id, client_id, booked_by, job_name, notes, status, follow_up_status, follow_up_note, quoted_value, final_value, payment_terms, needs_site_visit, site_visit_status, site_visit_date, site_visit_by, site_visit_note, created_at, updated_at, clients(name, contact, email, location), users!jobs_booked_by_fkey(name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("quotations")
      .select("quotation_id, job_id, version, total, project_job_id, created_at, payment_terms")
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("payment_id, job_id, payment_schedule_id, type, amount, status, paid_date, reference_no, note")
      .order("paid_date", { ascending: false }),
    supabase
      .from("payment_schedules")
      .select("payment_schedule_id, job_id, sequence_no, label, percentage, amount, due_stage, status")
      .order("sequence_no", { ascending: true }),
    supabase
      .from("designs")
      .select("design_id, job_id, revision_no, status, file_url")
      .order("created_at", { ascending: false }),
    supabase
      .from("job_orders")
      .select("job_order_id, job_id, status")
      .order("job_order_id", { ascending: false }),
    supabase
      .from("job_attachments")
      .select("attachment_id, job_id, category, file_path, caption, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("users").select("user_id, name").eq("role", "fabricator"),
    supabase.from("quotation_settings").select("*").eq("id", 1).single()
  ]);

  const quotationRows = quotations ?? [];
  const paymentRows = payments ?? [];
  const paymentScheduleRows = paymentSchedules ?? [];
  const designRows = designs ?? [];
  const orderRows = jobOrders ?? [];
  const attachmentRows = attachments ?? [];
  const attachmentsWithUrls = await signAttachmentUrls(supabase, attachmentRows);

  const latestQuotation = new Map<string, any>();
  for (const quotation of quotationRows) {
    if (!latestQuotation.has(quotation.job_id)) latestQuotation.set(quotation.job_id, quotation);
  }

  const latestDesign = new Map<string, any>();
  for (const design of designRows) {
    if (!latestDesign.has(design.job_id)) latestDesign.set(design.job_id, design);
  }

  const latestOrder = new Map<string, any>();
  for (const order of orderRows) {
    if (!latestOrder.has(order.job_id)) latestOrder.set(order.job_id, order);
  }

  const totals = new Map<string, { deposit: number; balance: number; received: number }>();
  for (const payment of paymentRows) {
    if (payment.status !== "received") continue;
    const current = totals.get(payment.job_id) ?? { deposit: 0, balance: 0, received: 0 };
    current.received += Number(payment.amount ?? 0);
    if (payment.type === "down_payment") current.deposit += Number(payment.amount ?? 0);
    if (payment.type === "balance") current.balance += Number(payment.amount ?? 0);
    totals.set(payment.job_id, current);
  }

  const adminJobs: AdminJobRow[] = (jobs ?? []).map((job: any) => {
    const quote = latestQuotation.get(job.job_id);
    const design = latestDesign.get(job.job_id);
    const order = latestOrder.get(job.job_id);
    const payment = totals.get(job.job_id) ?? { deposit: 0, balance: 0, received: 0 };
    const paymentTerms: PaymentTerms = job.payment_terms ?? quote?.payment_terms ?? "50_50";

    return {
      job_id: job.job_id,
      display_job_id: quote?.project_job_id ?? `JOB-${job.job_id.slice(0, 8).toUpperCase()}`,
      job_name: job.job_name,
      client_name: job.clients?.name ?? "Unknown",
      contact: job.clients?.contact ?? null,
      email: job.clients?.email ?? null,
      location: job.clients?.location ?? null,
      booked_by_name: job.users?.name ?? "Unknown",
      status: job.status,
      follow_up_status: job.follow_up_status,
      follow_up_note: job.follow_up_note,
      // site_visit_status is the single source of truth (see migration
      // 0014) — needs_site_visit is derived from it, not the other way
      // around, so it's only kept here for components that still read it.
      needs_site_visit: Boolean(job.needs_site_visit),
      site_visit_status: job.site_visit_status ?? "not_required",
      site_visit_date: job.site_visit_date ?? null,
      site_visit_by: job.site_visit_by ?? null,
      site_visit_note: job.site_visit_note ?? null,
      notes: job.notes,
      quoted_value: job.quoted_value,
      final_value: job.final_value,
      payment_terms: paymentTerms,
      created_at: job.created_at,
      updated_at: job.updated_at,
      quotation_count: quotationRows.filter((q) => q.job_id === job.job_id).length,
      latest_quotation_id: quote?.quotation_id ?? null,
      latest_quotation_total: quote?.total ?? null,
      latest_quotation_created_at: quote?.created_at ?? null,
      latest_design_status: design?.status ?? null,
      latest_design_revision: design?.revision_no ?? null,
      job_order_status: order?.status ?? null,
      deposit_received: payment.deposit,
      balance_received: payment.balance,
      total_received: payment.received,
      reference_photos: attachmentsWithUrls.filter((a) => a.job_id === job.job_id && a.category === "reference"),
      transaction_photos: attachmentsWithUrls.filter((a) => a.job_id === job.job_id && a.category === "transaction"),
      site_visit_photos: attachmentsWithUrls.filter((a) => a.job_id === job.job_id && a.category === "site_visit")
    };
  });

  const adminPaymentJobs: AdminPaymentJob[] = adminJobs.map((job) => ({
    job_id: job.job_id,
    display_job_id: job.display_job_id,
    client_name: job.client_name,
    job_name: job.job_name,
    status: job.status,
    job_order_status: job.job_order_status,
    quote_total: job.latest_quotation_total ?? job.quoted_value ?? job.final_value ?? 0,
    payment_terms: job.payment_terms,
    schedules: paymentScheduleRows
      .filter((schedule: any) => schedule.job_id === job.job_id)
      .map((schedule: any) => ({
        payment_schedule_id: schedule.payment_schedule_id,
        sequence_no: schedule.sequence_no,
        label: schedule.label,
        percentage: Number(schedule.percentage),
        amount: Number(schedule.amount),
        due_stage: schedule.due_stage,
        status: schedule.status
      })),
    payments: paymentRows
      .filter((payment: any) => payment.job_id === job.job_id)
      .map((payment: any) => ({
        payment_id: payment.payment_id,
        payment_schedule_id: payment.payment_schedule_id,
        type: payment.type,
        amount: Number(payment.amount ?? 0),
        status: payment.status,
        paid_date: payment.paid_date,
        reference_no: payment.reference_no,
        note: payment.note
      }))
  }));

  const preQuoteRows = adminJobs
    .filter((job) => ["site_visit", "design_review"].includes(job.status))
    .map((job) => ({
      job_id: job.job_id,
      client_name: job.client_name,
      next_version: job.quotation_count + 1,
      payment_terms: job.payment_terms
    }));

  const pendingQuoteRows = adminJobs
    .filter((job) => job.status === "quoted")
    .map((job) => ({ job_id: job.job_id, client_name: job.client_name, quoted_value: job.latest_quotation_total ?? job.quoted_value ?? 0 }));

  const pendingDesignRows = designRows
    .filter((d: any) => d.status === "pending")
    .map((d: any) => ({
      design_id: d.design_id,
      job_id: d.job_id,
      client_name: adminJobs.find((j) => j.job_id === d.job_id)?.client_name ?? "Unknown",
      revision_no: d.revision_no,
      status: d.status,
      file_url: d.file_url
    }));

  const jobOrderCandidateRows = adminJobs
    .filter((job) => job.status === "approved" && !job.job_order_status)
    .map((job) => ({
      job_id: job.job_id,
      client_name: job.client_name,
      payment_terms: job.payment_terms,
      down_payment_received: job.payment_terms !== "50_50" || job.deposit_received > 0
    }));

  return (
    <PortalShell
      active="/admin"
      eyebrow="Admin portal"
      title="Operations command center"
      roleLabel="Owner"
      personName={admin?.name ?? "—"}
    >
      <AdminWorkspace jobs={adminJobs} paymentJobs={adminPaymentJobs} />

      <div className="mt-6 space-y-6">
        <QuotationSettingsForm settings={quotationSettings ?? {
          id: 1,
          company_name: "Delight Works Advertising Signages",
          company_address: "2nd Flr, Unit 15, Ellen's Bldg, Jasmin St., Capitol Site, Cebu City",
          company_contact: "09569934866/09329848552/09205102720",
          social_media_account: "",
          email_address: "",
          website: "",
          services_note: "Mock-Up/Mobilization/Installation FREE",
          terms: "1. Estimated days to finish the project is 5-7 working days from approval and downpayment.\n2. Price Quote Valid 15 days\n3. Mode of payment: 50% downpayment and 50% after completion\n4. All Payments shall be made via Cash, Check or Credit Card\n5. All Checks Payable to: __________",
          valid_days: 15,
          updated_by: null,
          updated_at: new Date().toISOString()
        }} />

        <QuotationCreateForm rows={preQuoteRows} settings={quotationSettings ?? null} createdBy={admin?.user_id ?? ""} />
        <QuotationQueue rows={pendingQuoteRows} />
        <DesignApprovalQueue rows={pendingDesignRows} />
        <JobOrderCreateForm rows={jobOrderCandidateRows} fabricators={fabricators ?? []} />
      </div>
    </PortalShell>
  );
}
