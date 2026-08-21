import { createClient } from "@/lib/supabase/server";
import { signAttachmentUrls } from "@/lib/supabase/signedUrls";
import { PortalShell } from "@/components/shared/PortalShell";
import { renderPortal } from "@/components/shared/renderPortal";
import { ClientList } from "@/components/sales/ClientList";
import { NewClientForm } from "@/components/sales/NewClientForm";
import { CommissionMetric } from "@/components/sales/CommissionMetric";

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

  const [jobsResult, commissionsResult, settingsResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("*, clients(name, contact, email, location)")
      .eq("booked_by", agent?.user_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("job_commissions")
      .select("amount, status")
      .eq("agent_id", agent?.user_id),
    supabase.from("quotation_settings").select("*").eq("id", 1).single()
  ]);

  if (jobsResult.error) throw new Error(`Query "jobs" failed: ${jobsResult.error.message}`);
  if (commissionsResult.error) throw new Error(`Query "job_commissions" failed: ${commissionsResult.error.message}`);
  if (settingsResult.error && settingsResult.error.code !== "PGRST116") {
    throw new Error(`Query "quotation_settings" failed: ${settingsResult.error.message}`);
  }

  const { data: jobs } = jobsResult;
  const { data: commissions } = commissionsResult;
  const { data: quotationSettings } = settingsResult;

  const pending = commissions
    ?.filter((c) => c.status === "payable")
    .reduce((sum, c) => sum + (c.amount ?? 0), 0) ?? 0;

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

  const activeLeads = jobsWithClientName.length;
  const booked = jobsWithClientName.filter((j) => j.status !== "lead").length;
  const needsQuote = jobsWithClientName.filter((j) =>
    ["site_visit", "design_review"].includes(j.status)
  ).length;
  const followUps = jobsWithClientName.filter(
    (j) => j.follow_up_status === "follow_up"
  ).length;

  return (
    <PortalShell
      active="/sales"
      eyebrow="Sales portal"
      title="Lead arena"
      roleLabel="Agent"
      personName={agent?.name ?? "—"}
    >
      {/* Game-style metric tiles */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <div className="relative overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-md">
          <div className="pointer-events-none absolute -right-3 -top-3 h-14 w-14 rounded-full bg-sky-200/30" />
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 text-lg shadow-sm ring-1 ring-sky-100">
            🎯
          </span>
          <p className="relative mt-2 text-[11px] font-semibold uppercase tracking-wide text-sky-700/80">
            Active leads
          </p>
          <p className="relative mt-0.5 text-2xl font-bold tracking-tight text-gray-900">
            {activeLeads}
          </p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md">
          <div className="pointer-events-none absolute -right-3 -top-3 h-14 w-14 rounded-full bg-emerald-200/30" />
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 text-lg shadow-sm ring-1 ring-emerald-100">
            🤝
          </span>
          <p className="relative mt-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700/80">
            Booked
          </p>
          <p className="relative mt-0.5 text-2xl font-bold tracking-tight text-gray-900">
            {booked}
          </p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-md">
          <div className="pointer-events-none absolute -right-3 -top-3 h-14 w-14 rounded-full bg-violet-200/30" />
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 text-lg shadow-sm ring-1 ring-violet-100">
            📄
          </span>
          <p className="relative mt-2 text-[11px] font-semibold uppercase tracking-wide text-violet-700/80">
            Needs quote
          </p>
          <p className="relative mt-0.5 text-2xl font-bold tracking-tight text-gray-900">
            {needsQuote}
          </p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-400 hover:shadow-md">
          <div className="pointer-events-none absolute -right-3 -top-3 h-14 w-14 rounded-full bg-rose-200/30" />
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 text-lg shadow-sm ring-1 ring-rose-100">
            🔔
          </span>
          <p className="relative mt-2 text-[11px] font-semibold uppercase tracking-wide text-rose-700/80">
            Follow-ups
          </p>
          <p className="relative mt-0.5 text-2xl font-bold tracking-tight text-gray-900">
            {followUps}
          </p>
        </div>

        <div className="col-span-2 sm:col-span-1">
          <CommissionMetric amount={pending} />
        </div>
      </div>

      {/* Header row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Your pipeline</h2>
          <p className="text-[11px] text-gray-500">
            Tap a row to open the full client workspace
          </p>
        </div>
        <NewClientForm agentId={agent?.user_id ?? ""} />
      </div>

      <ClientList
        jobs={jobsWithClientName}
        agentId={agent?.user_id ?? ""}
        quotationSettings={quotationSettings ?? null}
      />
    </PortalShell>
  );
  });
}
