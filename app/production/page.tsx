import { createClient } from "@/lib/supabase/server";
import { signAttachmentUrls } from "@/lib/supabase/signedUrls";
import { PortalShell } from "@/components/shared/PortalShell";
import { renderPortal } from "@/components/shared/renderPortal";
import { ProductionWorkspace } from "@/components/production/ProductionWorkspace";

export default async function ProductionPortal() {
  return renderPortal("Production", async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("No signed-in session was found for this request.");

    const { data: fabricator } = await supabase
      .from("users")
      .select("user_id, name")
      .eq("auth_id", session.user.id)
      .single();

    const jobOrdersResult = await supabase
      .from("job_orders")
      .select("*, jobs(job_name, final_value, clients(name, location))")
      .eq("fabricator_id", fabricator?.user_id)
      .order("deadline", { ascending: true, nullsFirst: false });
    if (jobOrdersResult.error) throw new Error(`Query \"job_orders\" failed: ${jobOrdersResult.error.message}`);
    const orders = jobOrdersResult.data ?? [];
    const ids = orders.map((o: any) => o.job_order_id);

    const [materials, labor, requests, qc, deliveries, installations, history, attachments, designs] = await Promise.all([
      ids.length ? supabase.from("job_order_materials").select("*").in("job_order_id", ids).order("created_at", { ascending: true }) : Promise.resolve({ data: [], error: null } as any),
      ids.length ? supabase.from("job_order_labor_logs").select("*").in("job_order_id", ids).order("work_date", { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
      ids.length ? supabase.from("job_order_material_requests").select("*").in("job_order_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
      ids.length ? supabase.from("job_order_qc_checks").select("*").in("job_order_id", ids).order("inspected_at", { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
      ids.length ? supabase.from("job_order_deliveries").select("*").in("job_order_id", ids).order("scheduled_date", { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
      ids.length ? supabase.from("job_order_installations").select("*").in("job_order_id", ids).order("scheduled_date", { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
      ids.length ? supabase.from("job_order_stage_history").select("*").in("job_order_id", ids).order("changed_at", { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
      ids.length ? supabase.from("job_attachments").select("attachment_id, job_id, job_order_id, category, file_path, caption, created_at").in("job_order_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
      ids.length ? supabase.from("designs").select("design_id, job_id, revision_no, status, file_url, created_at").in("job_id", orders.map((o: any) => o.job_id)).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null } as any)
    ]);

    const queryPairs = [["job_order_materials", materials], ["job_order_labor_logs", labor], ["job_order_material_requests", requests], ["job_order_qc_checks", qc], ["job_order_deliveries", deliveries], ["job_order_installations", installations], ["job_order_stage_history", history], ["job_attachments", attachments], ["designs", designs]] as const;
    for (const [name, result] of queryPairs) if (result.error) throw new Error(`Query \"${name}\" failed: ${result.error.message}`);

    const attachmentRows = await signAttachmentUrls(supabase, attachments.data ?? []);
    const rows = orders.map((o: any) => ({
      job_order_id: o.job_order_id,
      job_id: o.job_id,
      fabricator_id: o.fabricator_id,
      materials: o.materials,
      estimated_materials_cost: o.estimated_materials_cost,
      actual_materials_cost: o.actual_materials_cost,
      estimated_labor_cost: o.estimated_labor_cost,
      actual_labor_cost: o.actual_labor_cost,
      estimated_logistics_cost: o.estimated_logistics_cost,
      actual_logistics_cost: o.actual_logistics_cost,
      logistics_vendor: o.logistics_vendor,
      funds_release_status: o.funds_release_status,
      deadline: o.deadline,
      status: o.status,
      order_description: o.order_description,
      dimensions: o.dimensions,
      quantity: o.quantity,
      specifications: o.specifications,
      installation_notes: o.installation_notes,
      production_notes: o.production_notes,
      priority: o.priority,
      production_stage: o.production_stage,
      started_at: o.started_at,
      completed_at: o.completed_at,
      hold_reason: o.hold_reason,
      scheduled_installation_date: o.scheduled_installation_date,
      client_name: o.jobs?.clients?.name ?? "Unknown",
      location: o.jobs?.clients?.location ?? null,
      job_name: o.jobs?.job_name ?? null,
      approved_value: Number(o.jobs?.final_value ?? 0),
      approved_design_url: (designs.data ?? []).find((d: any) => d.job_id === o.job_id && d.status === "approved")?.file_url ?? null,
      attachments: Object.fromEntries(["approved_design", "order_reference", "production_progress", "qc", "installation_proof"].map(category => [category, attachmentRows.filter((a: any) => a.job_order_id === o.job_order_id && a.category === category)])),
      materials_rows: (materials.data ?? []).filter((x: any) => x.job_order_id === o.job_order_id),
      labor_rows: (labor.data ?? []).filter((x: any) => x.job_order_id === o.job_order_id),
      requests: (requests.data ?? []).filter((x: any) => x.job_order_id === o.job_order_id),
      qc_rows: (qc.data ?? []).filter((x: any) => x.job_order_id === o.job_order_id),
      deliveries: (deliveries.data ?? []).filter((x: any) => x.job_order_id === o.job_order_id),
      installations: (installations.data ?? []).filter((x: any) => x.job_order_id === o.job_order_id),
      history: (history.data ?? []).filter((x: any) => x.job_order_id === o.job_order_id)
    }));

    return (
      <PortalShell active="/production" eyebrow="Production portal" title="Production control center" roleLabel="Fabricator" personName={fabricator?.name ?? "—"}>
        <ProductionWorkspace rows={rows as any} fabricatorId={fabricator?.user_id ?? ""} />
      </PortalShell>
    );
  });
}
