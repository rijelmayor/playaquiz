import { createClient } from "@/lib/supabase/server";
import { signAttachmentUrls } from "@/lib/supabase/signedUrls";
import { PortalShell } from "@/components/shared/PortalShell";
import { renderPortal } from "@/components/shared/renderPortal";
import { QuotationCreateForm } from "@/components/shared/QuotationCreateForm";
import { QuotationSettingsForm } from "@/components/admin/QuotationSettingsForm";
import { QuotationQueue } from "@/components/admin/QuotationQueue";
import { DesignApprovalQueue } from "@/components/admin/DesignApprovalQueue";
import { JobOrderCreateForm } from "@/components/admin/JobOrderCreateForm";
import { JobOrderDetailManager, type AdminJobOrderDetailRow } from "@/components/admin/JobOrderDetailManager";
import { CommissionControl, type AdminCommissionRow } from "@/components/admin/CommissionControl";
import { CommissionSettingsForm, type CommissionSettingsRow } from "@/components/admin/CommissionSettingsForm";
import { AuditTrail } from "@/components/admin/AuditTrail";
import { CompletionAcknowledgment, type CompletionRow } from "@/components/admin/CompletionAcknowledgment";
import { AdminWorkspace, type AdminJobRow } from "@/components/admin/AdminWorkspace";
import { type AdminPaymentJob } from "@/components/admin/AdminPaymentManager";
import type { PaymentTerms } from "@/lib/types/database";

export default async function AdminPortal() {
  return renderPortal("Admin", async () => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error(
      "No signed-in session was found for this request. If this happens on every load, the auth cookie likely isn't reaching the server — check that middleware.ts is running for /admin (see the `matcher` export) and that the Supabase env vars match the project the person logged into."
    );
  }

  const { data: admin } = await supabase
    .from("users")
    .select("user_id, name")
    .eq("auth_id", session.user.id)
    .single();

  const results = await Promise.all([
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
      .select("design_id, job_id, revision_no, status, file_url, revision_note, file_name")
      .order("created_at", { ascending: false }),
    supabase
      .from("job_orders")
      .select("job_order_id, job_id, fabricator_id, status, production_stage, deadline, quantity, priority, order_description, dimensions, specifications, installation_notes, production_notes")
      .order("job_order_id", { ascending: false }),
    supabase
      .from("job_attachments")
      .select("attachment_id, job_id, job_order_id, category, file_path, caption, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("users").select("user_id, name").eq("role", "fabricator"),
    supabase.from("quotation_settings").select("*").eq("id", 1).single(),
    supabase.from("job_commissions").select("commission_id, job_id, agent_id, split_pct, commission_type, commission_value, commission_rate, amount, status"),
    supabase.from("users").select("user_id, name").in("role", ["sales", "admin"]),
    supabase.from("job_acknowledgments").select("*").order("updated_at", { ascending: false }),
    supabase.from("commission_settings").select("settings_id, commission_type, commission_value, updated_at").eq("settings_id", 1).maybeSingle(),
    supabase.from("audit_logs").select("audit_id, action, table_name, record_id, created_at, users!audit_logs_actor_id_fkey(name)").order("created_at", { ascending: false }).limit(30)
  ] as const);

  // Supabase queries return { data, error } instead of throwing — surface
  // the first real error here (with which query it came from) so it hits
  // the diagnostic panel in renderPortal, instead of silently falling back
  // to `?? []` and rendering a page that looks loaded but is missing data.
  const queryNames = [
    "jobs", "quotations", "payments", "payment_schedules", "designs",
    "job_orders", "job_attachments", "fabricators", "quotation_settings", "job_commissions", "commission_users", "job_acknowledgments", "commission_settings", "audit_logs"
  ];
  results.forEach((r, i) => {
    if (!r.error) return;
    // quotation_settings is a singleton the app seeds itself the first
    // time Admin saves quotation defaults — a missing row there just
    // means "use the built-in defaults" (handled below), not a real
    // failure, so it shouldn't trip the diagnostic panel.
    if (queryNames[i] === "quotation_settings" && r.error.code === "PGRST116") return;
    throw new Error(`Query "${queryNames[i]}" failed: ${r.error.message}`);
  });

  const [
    { data: jobs },
    { data: quotations },
    { data: payments },
    { data: paymentSchedules },
    { data: designs },
    { data: jobOrders },
    { data: attachments },
    { data: fabricators },
    { data: quotationSettings },
    { data: commissionRows },
    { data: commissionUsers },
    { data: acknowledgments },
    { data: commissionSettings },
    { data: auditRows }
  ] = results;

  const quotationRows = quotations ?? [];
  const paymentRows = payments ?? [];
  const paymentScheduleRows = paymentSchedules ?? [];
  const designRows = designs ?? [];
  const orderRows = jobOrders ?? [];
  const attachmentRows = attachments ?? [];
  const attachmentsWithUrls = await signAttachmentUrls(supabase, attachmentRows);
  const commissionUserNames = new Map((commissionUsers ?? []).map((u: any) => [u.user_id, u.name]));
  const auditTrailRows = (auditRows ?? []).map((r: any) => ({ audit_id: r.audit_id, action: r.action, table_name: r.table_name, record_id: r.record_id, actor_name: r.users?.name ?? null, created_at: r.created_at }));

  const adminJobOrderIds = orderRows.map((o: any) => o.job_order_id).filter(Boolean);
  const [adminMaterials, adminQc, adminInstallations, adminRequests, adminHistory] = await Promise.all([
    adminJobOrderIds.length ? supabase.from("job_order_materials").select("material_id,job_order_id,status,estimated_qty,actual_qty,estimated_unit_cost,actual_unit_cost").in("job_order_id", adminJobOrderIds) : Promise.resolve({ data: [], error: null } as any),
    adminJobOrderIds.length ? supabase.from("job_order_qc_checks").select("qc_id,job_order_id,result,rework_required,inspected_at").in("job_order_id", adminJobOrderIds).order("inspected_at", { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
    adminJobOrderIds.length ? supabase.from("job_order_installations").select("installation_id,job_order_id,status,verified,scheduled_date,updated_at,created_at").in("job_order_id", adminJobOrderIds).order("updated_at", { ascending: false, nullsFirst: false }) : Promise.resolve({ data: [], error: null } as any),
    adminJobOrderIds.length ? supabase.from("job_order_material_requests").select("request_id,job_order_id,status").in("job_order_id", adminJobOrderIds) : Promise.resolve({ data: [], error: null } as any),
    adminJobOrderIds.length ? supabase.from("job_order_stage_history").select("history_id,job_order_id,from_stage,to_stage,changed_at,note").in("job_order_id", adminJobOrderIds).order("changed_at", { ascending: false }) : Promise.resolve({ data: [], error: null } as any)
  ]);
  for (const [name, result] of [["job_order_materials", adminMaterials], ["job_order_qc_checks", adminQc], ["job_order_installations", adminInstallations], ["job_order_material_requests", adminRequests], ["job_order_stage_history", adminHistory]] as const) {
    if (result.error) throw new Error(`Query "${name}" failed: ${result.error.message}`);
  }

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


  const adminCommissionRows: AdminCommissionRow[] = (commissionRows ?? []).map((row: any) => ({
    commission_id: row.commission_id, job_id: row.job_id, agent_name: commissionUserNames.get(row.agent_id) ?? "Agent",
    client_name: (jobs ?? []).find((j: any) => j.job_id === row.job_id)?.clients?.name ?? "Unknown",
    commission_type: row.commission_type ?? "percentage", commission_value: Number(row.commission_value ?? row.commission_rate ?? 0),
    split_pct: Number(row.split_pct ?? 100), amount: row.amount == null ? null : Number(row.amount), status: row.status
  }));

  const completionRows: CompletionRow[] = (acknowledgments ?? [])
    .filter((a: any) => (jobs ?? []).some((j: any) => j.job_id === a.job_id && ["installed", "paid", "closed"].includes(j.status)))
    .map((a: any) => {
      const job = (jobs ?? []).find((j: any) => j.job_id === a.job_id);
      const quote = latestQuotation.get(a.job_id);
      return { acknowledgment_id: a.acknowledgment_id, job_id: a.job_id, client_name: job?.clients?.name ?? "Unknown", display_job_id: quote?.project_job_id ?? `JOB-${a.job_id.slice(0, 8).toUpperCase()}`, status: a.status, customer_name: a.customer_name, authorized_representative: a.authorized_representative, signature_name: a.signature_name, remarks: a.remarks, installation_checked: Boolean(a.installation_checked), project_received: Boolean(a.project_received) };
    });

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
    .map((job) => ({ job_id: job.job_id, client_name: job.client_name, quoted_value: job.latest_quotation_total ?? job.quoted_value ?? 0, quotation_id: job.latest_quotation_id, version: quotationRows.find((q: any) => q.quotation_id === job.latest_quotation_id)?.version ?? null }));

  const pendingDesignRows = designRows
    .filter((d: any) => d.status === "pending")
    .map((d: any) => ({
      design_id: d.design_id,
      job_id: d.job_id,
      client_name: adminJobs.find((j) => j.job_id === d.job_id)?.client_name ?? "Unknown",
      revision_no: d.revision_no,
      status: d.status,
      file_url: d.file_url,
      revision_note: d.revision_note ?? null,
      file_name: d.file_name ?? null
    }));

  const jobOrderCandidateRows = adminJobs
    .filter((job) => job.status === "approved" && !job.job_order_status)
    .map((job) => ({
      job_id: job.job_id,
      client_name: job.client_name,
      payment_terms: job.payment_terms,
      down_payment_received: job.payment_terms !== "50_50" || job.deposit_received > 0
    }));

  const latestQcByOrder = new Map<string, any>();
  for (const q of adminQc.data ?? []) if (!latestQcByOrder.has(q.job_order_id)) latestQcByOrder.set(q.job_order_id, q);
  const latestInstallationByOrder = new Map<string, any>();
  for (const i of adminInstallations.data ?? []) if (!latestInstallationByOrder.has(i.job_order_id)) latestInstallationByOrder.set(i.job_order_id, i);
  const materialCountsByOrder = new Map<string, { total: number; completed: number; shortages: number }>();
  for (const m of adminMaterials.data ?? []) {
    const current = materialCountsByOrder.get(m.job_order_id) ?? { total: 0, completed: 0, shortages: 0 };
    current.total += 1;
    if (["used", "available"].includes(m.status) || (m.actual_qty != null && m.actual_qty > 0)) current.completed += 1;
    if (m.status === "shortage") current.shortages += 1;
    materialCountsByOrder.set(m.job_order_id, current);
  }
  const pendingRequestsByOrder = new Map<string, number>();
  for (const r of adminRequests.data ?? []) if (r.status === "pending") pendingRequestsByOrder.set(r.job_order_id, (pendingRequestsByOrder.get(r.job_order_id) ?? 0) + 1);

  const fabricatorNames = new Map((fabricators ?? []).map((f: any) => [f.user_id, f.name]));
  const jobOrderDetailRows: AdminJobOrderDetailRow[] = orderRows.map((order: any) => {
    const job = adminJobs.find((j) => j.job_id === order.job_id);
    return {
      job_order_id: order.job_order_id,
      job_id: order.job_id,
      client_name: job?.client_name ?? "Unknown",
      job_name: job?.job_name ?? null,
      fabricator_name: fabricatorNames.get(order.fabricator_id) ?? null,
      status: order.status,
      production_stage: order.production_stage ?? "materials",
      deadline: order.deadline ?? null,
      material_summary: materialCountsByOrder.get(order.job_order_id) ?? { total: 0, completed: 0, shortages: 0 },
      pending_material_requests: pendingRequestsByOrder.get(order.job_order_id) ?? 0,
      latest_qc: latestQcByOrder.get(order.job_order_id) ?? null,
      latest_installation: latestInstallationByOrder.get(order.job_order_id) ?? null,
      stage_history: (adminHistory.data ?? []).filter((h: any) => h.job_order_id === order.job_order_id),

      quantity: order.quantity ?? 1,
      priority: order.priority ?? "normal",
      order_description: order.order_description ?? null,
      dimensions: order.dimensions ?? null,
      specifications: order.specifications ?? null,
      installation_notes: order.installation_notes ?? null,
      production_notes: order.production_notes ?? null,
      approved_design: attachmentsWithUrls.filter((a) => a.job_order_id === order.job_order_id && a.category === "approved_design"),
      order_reference: attachmentsWithUrls.filter((a) => a.job_order_id === order.job_order_id && a.category === "order_reference")
    };
  });

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
        <CommissionSettingsForm settings={commissionSettings as CommissionSettingsRow | null} adminId={admin?.user_id ?? ""} />
        <CommissionControl rows={adminCommissionRows} />
        <CompletionAcknowledgment rows={completionRows} adminId={admin?.user_id ?? ""} />

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
        <JobOrderDetailManager rows={jobOrderDetailRows} adminId={admin?.user_id ?? ""} />
        <AuditTrail rows={auditTrailRows} />
      </div>
    </PortalShell>
  );
  });
}
