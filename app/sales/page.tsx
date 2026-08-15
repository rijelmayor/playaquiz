import { createClient } from "@/lib/supabase/server";
import { signAttachmentUrls } from "@/lib/supabase/signedUrls";
import { MetricCard } from "@/components/shared/MetricCard";
import { PortalShell } from "@/components/shared/PortalShell";
import { renderPortal } from "@/components/shared/renderPortal";
import { ClientList } from "@/components/sales/ClientList";
import { NewClientForm } from "@/components/sales/NewClientForm";
import { CommissionMetric } from "@/components/sales/CommissionMetric";
import { PaidCommissions } from "@/components/sales/PaidCommissions";
import { QuotationCreateForm } from "@/components/shared/QuotationCreateForm";

export default async function SalesPortal() {
  return renderPortal("Sales", async () => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error(
      "No signed-in session was found for this request. If this happens on every load, check that the Supabase env vars in Vercel match the project the person logged into."
    );
  }

  const { data: agent } = await supabase
    .from("users")
    .select("user_id, name")
    .eq("auth_id", session.user.id)
    .single();

  // jobs + commissions + quotation settings don't depend on each other —
  // run them together instead of one after another.
  const [jobsResult, commissionsResult, settingsResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("*, clients(name, contact, email, location)")
      .eq("booked_by", agent?.user_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("job_commissions")
      .select("commission_id, job_id, amount, status")
      .eq("agent_id", agent?.user_id),
    supabase.from("quotation_settings").select("*").eq("id", 1).single()
  ]);

  if (jobsResult.error) throw new Error(`Query "jobs" failed: ${jobsResult.error.message}`);
  if (commissionsResult.error) throw new Error(`Query "job_commissions" failed: ${commissionsResult.error.message}`);
  // quotation_settings is a singleton the app seeds itself the first time
  // Admin saves quotation defaults — a missing row just means "use the
  // built-in defaults" below, not a real failure.
  if (settingsResult.error && settingsResult.error.code !== "PGRST116") {
    throw new Error(`Query "quotation_settings" failed: ${settingsResult.error.message}`);
  }

  const { data: jobs } = jobsResult;
  const { data: commissions } = commissionsResult;
  const { data: quotationSettings } = settingsResult;

  const pending = commissions
    ?.filter((c) => c.status === "pending" || c.status === "payable")
    .reduce((sum, c) => sum + (c.amount ?? 0), 0) ?? 0;

  // Commission is only "complete" once accounting has actually released it —
  // that's the `paid` status set by CommissionQueue.markPaid in Accounting.
  // One row per project, not summed, so the agent can see which job it came from.
  const paidCommissions = (commissions ?? [])
    .filter((c) => c.status === "paid")
    .map((c: any) => ({
      commission_id: c.commission_id,
      client_name:
        (jobs ?? []).find((j: any) => j.job_id === c.job_id)?.clients?.name ?? "Unknown",
      amount: c.amount ?? 0
    }));

  const jobIds = (jobs ?? []).map((j: any) => j.job_id);

  const [{ data: attachments }, { data: quotations }] = await Promise.all([
    jobIds.length
      ? supabase
          .from("job_attachments")
          .select("attachment_id, job_id, category, file_path")
          .in("job_id", jobIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    jobIds.length
      ? supabase
          .from("quotations")
          .select("*")
          .in("job_id", jobIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] })
  ]);

  // one signing call for every photo, instead of one call per photo
  const attachmentsWithUrls = await signAttachmentUrls(supabase, attachments ?? []);

  const jobsWithClientName = (jobs ?? []).map((j: any) => ({
    ...j,
    client_name: j.clients?.name ?? "Unknown",
    contact: j.clients?.contact ?? null,
    email: j.clients?.email ?? null,
    location: j.clients?.location ?? null,
    transaction_photos: attachmentsWithUrls.filter(
      (a) => a.job_id === j.job_id && a.category === "transaction"
    ),
    site_visit_photos: attachmentsWithUrls.filter(
      (a) => a.job_id === j.job_id && a.category === "site_visit"
    ),
    reference_photos: attachmentsWithUrls.filter(
      (a) => a.job_id === j.job_id && a.category === "reference"
    ),
    quotations: (quotations ?? []).filter((q: any) => q.job_id === j.job_id)
  }));

  // Jobs that still need a quotation created — mirrors the same logic
  // admin uses, scoped to this agent's own bookings.
  const preQuoteRows = (jobs ?? [])
    .filter((j: any) => ["site_visit", "design_review"].includes(j.status))
    .map((j: any) => ({
      job_id: j.job_id,
      client_name: j.clients?.name ?? "Unknown",
      next_version:
        ((quotations ?? []).filter((q: any) => q.job_id === j.job_id).length ?? 0) + 1
    }));

  return (
    <PortalShell
      active="/sales"
      eyebrow="Sales portal"
      title="Your clients"
      roleLabel="Agent"
      personName={agent?.name ?? "—"}
    >
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Active leads" value={String(jobsWithClientName.length)} />
        <MetricCard
          label="Booked this month"
          value={String(jobsWithClientName.filter((j) => j.status !== "lead").length)}
        />
        <CommissionMetric amount={pending} />
      </div>
      <PaidCommissions rows={paidCommissions} />
      <div className="mb-6">
        <NewClientForm agentId={agent?.user_id ?? ""} />
      </div>
      <QuotationCreateForm
        rows={preQuoteRows}
        settings={quotationSettings ?? null}
        createdBy={agent?.user_id ?? ""}
      />
      <ClientList
        jobs={jobsWithClientName}
        agentId={agent?.user_id ?? ""}
        quotationSettings={quotationSettings ?? null}
      />
    </PortalShell>
  );
  });
}
