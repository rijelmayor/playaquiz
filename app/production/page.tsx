import { createClient } from "@/lib/supabase/server";
import { signAttachmentUrls } from "@/lib/supabase/signedUrls";
import { MetricCard } from "@/components/shared/MetricCard";
import { PortalShell } from "@/components/shared/PortalShell";
import { JobOrderBoard } from "@/components/production/JobOrderBoard";

export default async function ProductionPortal() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const { data: fabricator } = await supabase
    .from("users")
    .select("user_id, name")
    .eq("auth_id", session!.user.id)
    .single();

  const { data: jobOrders } = await supabase
    .from("job_orders")
    .select("*, jobs(clients(name))")
    .eq("fabricator_id", fabricator?.user_id);

  const jobOrderIds = (jobOrders ?? []).map((jo: any) => jo.job_order_id);

  const { data: attachments } = jobOrderIds.length
    ? await supabase
        .from("job_attachments")
        .select("attachment_id, job_order_id, file_path")
        .eq("category", "approved_design")
        .in("job_order_id", jobOrderIds)
        .order("created_at", { ascending: false })
    : { data: [] as any[] };

  const attachmentsWithUrls = await signAttachmentUrls(supabase, attachments ?? []);

  const rows = (jobOrders ?? []).map((jo: any) => ({
    ...jo,
    client_name: jo.jobs?.clients?.name ?? "Unknown",
    approved_design_photos: attachmentsWithUrls.filter((a) => a.job_order_id === jo.job_order_id)
  }));

  const counts = {
    sourcing: rows.filter((r) => r.status === "sourcing").length,
    in_production: rows.filter((r) => r.status === "in_production").length,
    ready: rows.filter((r) => r.status === "ready_for_install").length
  };

  return (
    <PortalShell
      active="/production"
      eyebrow="Production portal"
      title="Job orders"
      roleLabel="Fabricator"
      personName={fabricator?.name ?? "—"}
    >
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Sourcing materials" value={String(counts.sourcing)} />
        <MetricCard label="In production" value={String(counts.in_production)} />
        <MetricCard label="Ready for install" value={String(counts.ready)} />
      </div>
      <JobOrderBoard rows={rows} fabricatorId={fabricator?.user_id ?? ""} />
    </PortalShell>
  );
}
