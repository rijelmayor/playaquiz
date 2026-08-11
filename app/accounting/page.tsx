import { createClient } from "@/lib/supabase/server";
import { MetricCard } from "@/components/shared/MetricCard";
import { PortalShell } from "@/components/shared/PortalShell";
import { FundReleaseQueue } from "@/components/accounting/FundReleaseQueue";
import { PaymentLogger } from "@/components/accounting/PaymentLogger";
import { CommissionQueue } from "@/components/accounting/CommissionQueue";

export default async function AccountingPortal() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const { data: accountingUser } = await supabase
    .from("users")
    .select("user_id, name")
    .eq("auth_id", session!.user.id)
    .single();

  const [
    { data: jobOrders },
    { data: commissions },
    { data: balances },
    { data: jobsForPayment }
  ] = await Promise.all([
    supabase.from("job_orders").select("*, jobs(clients(name))"),
    supabase
      .from("job_commissions")
      .select("*, jobs(clients(name)), users(name)")
      .in("status", ["payable", "paid"]),
    supabase.from("payments").select("amount").eq("type", "balance").eq("status", "pending"),
    // Jobs still missing a down payment or balance payment record —
    // logging one here is what the payable-commission automation watches.
    supabase
      .from("jobs")
      .select("job_id, quoted_value, final_value, clients(name), payments(type, status)")
      .in("status", ["approved", "in_production", "installed"])
  ]);

  const paymentRows = (jobsForPayment ?? [])
    .filter((j: any) => {
      const hasDown = (j.payments ?? []).some(
        (p: any) => p.type === "down_payment" && p.status === "received"
      );
      const hasBalance = (j.payments ?? []).some(
        (p: any) => p.type === "balance" && p.status === "received"
      );
      return !hasDown || !hasBalance;
    })
    .map((j: any) => ({
      job_id: j.job_id,
      client_name: j.clients?.name ?? "Unknown",
      quoted_value: j.quoted_value,
      final_value: j.final_value
    }));

  const jobOrderRows = (jobOrders ?? []).map((jo: any) => ({
    job_order_id: jo.job_order_id,
    client_name: jo.jobs?.clients?.name ?? "Unknown",
    estimated_materials_cost: jo.estimated_materials_cost,
    estimated_labor_cost: jo.estimated_labor_cost,
    estimated_logistics_cost: jo.estimated_logistics_cost,
    funds_release_status: jo.funds_release_status
  }));

  const commissionRows = (commissions ?? []).map((c: any) => ({
    commission_id: c.commission_id,
    agent_name: c.users?.name ?? "Unknown",
    client_name: c.jobs?.clients?.name ?? "Unknown",
    amount: c.amount ?? 0,
    status: c.status
  }));

  const balanceDue = (balances ?? []).reduce((sum, b) => sum + (b.amount ?? 0), 0);
  const commissionPayable = commissionRows
    .filter((c) => c.status === "payable")
    .reduce((sum, c) => sum + c.amount, 0);

  return (
    <PortalShell
      active="/accounting"
      eyebrow="Accounting portal"
      title="Funds and payouts"
      roleLabel="Accounting"
      personName={accountingUser?.name ?? "—"}
    >
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Balances due" value={`₱${balanceDue.toLocaleString()}`} />
        <MetricCard label="Commissions payable" value={`₱${commissionPayable.toLocaleString()}`} />
        <MetricCard label="Job orders tracked" value={String(jobOrderRows.length)} />
      </div>
      <PaymentLogger rows={paymentRows} />
      <div className="mb-6">
        <FundReleaseQueue rows={jobOrderRows} accountingUserId={accountingUser?.user_id ?? ""} />
      </div>
      <CommissionQueue rows={commissionRows} />
    </PortalShell>
  );
}
