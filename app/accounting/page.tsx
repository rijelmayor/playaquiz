import { createClient } from "@/lib/supabase/server";
import { PortalShell } from "@/components/shared/PortalShell";
import { renderPortal } from "@/components/shared/renderPortal";
import { AccountingWorkspace, type AccountingExpense, type AccountingJob } from "@/components/accounting/AccountingWorkspace";
import { PaymentLogger } from "@/components/accounting/PaymentLogger";
import { CommissionQueue } from "@/components/accounting/CommissionQueue";
import { CommissionControl, type AdminCommissionRow } from "@/components/accounting/CommissionControl";
import { CommissionSettingsForm, type CommissionSettingsRow } from "@/components/accounting/CommissionSettingsForm";
import { getJobControlTier } from "@/lib/workflow/jobControl";

export default async function AccountingPortal() {
  return renderPortal("Accounting", async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("No signed-in session was found for this request.");

    const { data: accountingUser } = await supabase.from("users").select("user_id, name").eq("auth_id", session.user.id).single();
    if (!accountingUser) throw new Error("The signed-in account is not linked to an Accounting user record.");

    const [jobsResult, expensesResult, openingResult, cashTrendResult, dashboardCashResult, dashboardReceivableResult, dashboardRevenueResult, dashboardProfitResult] = await Promise.all([
      supabase.from("jobs").select(`job_id,status,quoted_value,final_value,clients(name),job_orders(job_order_id,estimated_materials_cost,actual_materials_cost,estimated_labor_cost,actual_labor_cost,estimated_logistics_cost,actual_logistics_cost,production_stage,priority,deadline),payments(amount,status,type,paid_date),job_commissions(commission_id,agent_id,split_pct,commission_type,commission_value,commission_rate,amount,status,paid_date,users(name))`)
        .in("status", ["approved", "in_production", "installed", "paid", "closed"]),
      supabase.from("accounting_expenses").select("expense_id,job_id,category,description,payee,amount,status,expense_date,reference_no,jobs(clients(name))").order("expense_date", { ascending: false }),
      supabase.from("accounting_opening_balances").select("*").eq("period_start", `${new Date().toISOString().slice(0, 7)}-01`).maybeSingle(),
      supabase.from("payments").select("amount,paid_date,status").in("status", ["received","paid","completed"]).gte("paid_date", new Date(Date.now() - 365*24*60*60*1000).toISOString()).order("paid_date", { ascending: true }),
      supabase.from("accounting_cash_position").select("current_cash_position").maybeSingle(),
      supabase.from("accounting_customer_receivables").select("customer_receivables").maybeSingle(),
      supabase.from("accounting_approved_revenue").select("approved_revenue").maybeSingle(),
      supabase.from("accounting_estimated_job_profit").select("estimated_job_profit").maybeSingle()
    ]);

    const commissionSettingsResult = await supabase.from("commission_settings").select("settings_id, commission_type, commission_value, updated_at").eq("settings_id", 1).maybeSingle();
    if (commissionSettingsResult.error) throw new Error(`Commission settings query failed: ${commissionSettingsResult.error.message}`);
    const commissionSettings = commissionSettingsResult.data;

    if (jobsResult.error) throw new Error(`Accounting jobs query failed: ${jobsResult.error.message}`);
    if (expensesResult.error) throw new Error(`Accounting expenses query failed: ${expensesResult.error.message}`);
    if (openingResult.error) throw new Error(`Opening balance query failed: ${openingResult.error.message}`);
    if (cashTrendResult.error) throw new Error(`Payment trend query failed: ${cashTrendResult.error.message}`);
    if (dashboardCashResult.error) throw new Error(`Cash dashboard query failed: ${dashboardCashResult.error.message}`);
    if (dashboardReceivableResult.error) throw new Error(`Receivables dashboard query failed: ${dashboardReceivableResult.error.message}`);
    if (dashboardRevenueResult.error) throw new Error(`Revenue dashboard query failed: ${dashboardRevenueResult.error.message}`);
    if (dashboardProfitResult.error) throw new Error(`Profit dashboard query failed: ${dashboardProfitResult.error.message}`);

    const jobOrderIds = (jobsResult.data ?? []).flatMap((j: any) => (j.job_orders ?? []).map((jo: any) => jo.job_order_id)).filter(Boolean);
    const [materialResult, qcResult, installationResult, requestResult] = await Promise.all([
      jobOrderIds.length ? supabase.from("job_order_materials").select("material_id,job_order_id,status,actual_qty,actual_unit_cost").in("job_order_id", jobOrderIds) : Promise.resolve({ data: [], error: null } as any),
      jobOrderIds.length ? supabase.from("job_order_qc_checks").select("qc_id,job_order_id,result,rework_required,inspected_at").in("job_order_id", jobOrderIds).order("inspected_at", { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
      jobOrderIds.length ? supabase.from("job_order_installations").select("installation_id,job_order_id,status,verified,updated_at,created_at").in("job_order_id", jobOrderIds).order("updated_at", { ascending: false, nullsFirst: false }) : Promise.resolve({ data: [], error: null } as any),
      jobOrderIds.length ? supabase.from("job_order_material_requests").select("request_id,job_order_id,status").in("job_order_id", jobOrderIds) : Promise.resolve({ data: [], error: null } as any)
    ]);
    if (materialResult.error) throw new Error(`Production materials query failed: ${materialResult.error.message}`);
    if (qcResult.error) throw new Error(`Production QC query failed: ${qcResult.error.message}`);
    if (installationResult.error) throw new Error(`Production installation query failed: ${installationResult.error.message}`);
    if (requestResult.error) throw new Error(`Production material requests query failed: ${requestResult.error.message}`);

    const materialsByOrder = new Map<string, any[]>();
    for (const item of materialResult.data ?? []) {
      const list = materialsByOrder.get(item.job_order_id) ?? [];
      list.push(item);
      materialsByOrder.set(item.job_order_id, list);
    }
    const qcByOrder = new Map<string, any>();
    for (const item of qcResult.data ?? []) if (!qcByOrder.has(item.job_order_id)) qcByOrder.set(item.job_order_id, item);
    const installationByOrder = new Map<string, any>();
    for (const item of installationResult.data ?? []) if (!installationByOrder.has(item.job_order_id)) installationByOrder.set(item.job_order_id, item);
    const pendingRequestsByOrder = new Map<string, number>();
    for (const item of requestResult.data ?? []) if (item.status === "pending") pendingRequestsByOrder.set(item.job_order_id, (pendingRequestsByOrder.get(item.job_order_id) ?? 0) + 1);

    const expenses: AccountingExpense[] = (expensesResult.data ?? []).map((e: any) => ({
      expense_id: e.expense_id,
      job_id: e.job_id,
      client_name: e.jobs?.clients?.name ?? "Company expense",
      category: e.category,
      description: e.description,
      payee: e.payee,
      amount: Number(e.amount ?? 0),
      status: e.status,
      expense_date: e.expense_date,
      reference_no: e.reference_no
    }));

    const jobExpenseTotals = new Map<string, number>();
    expenses.filter(e => e.status !== "void" && e.job_id).forEach(e => jobExpenseTotals.set(e.job_id!, (jobExpenseTotals.get(e.job_id!) ?? 0) + e.amount));

    const jobs: AccountingJob[] = (jobsResult.data ?? []).map((j: any) => {
      const jo = j.job_orders?.[0] ?? j.job_orders ?? {};
      const received = (j.payments ?? []).filter((p: any) => p.status === "received").reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
      const commission = (j.job_commissions ?? []).filter((c: any) => c.status !== "void").reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0);
      const commissionPaid = (j.job_commissions ?? []).filter((c: any) => c.status === "paid").reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0);
      const finalValue = Number(j.final_value ?? j.quoted_value ?? 0);
      return {
        job_id: j.job_id,
        client_name: j.clients?.name ?? "Unknown",
        status: j.status,
        production_stage: jo.production_stage ?? "materials",
        priority: jo.priority ?? "normal",
        production_deadline: jo.deadline ?? null,
        latest_qc_result: jo.job_order_id ? (qcByOrder.get(jo.job_order_id)?.result ?? null) : null,
        latest_qc_rework: jo.job_order_id ? Boolean(qcByOrder.get(jo.job_order_id)?.rework_required) : false,
        installation_status: jo.job_order_id ? (installationByOrder.get(jo.job_order_id)?.status ?? null) : null,
        installation_verified: jo.job_order_id ? Boolean(installationByOrder.get(jo.job_order_id)?.verified) : false,
        pending_material_requests: jo.job_order_id ? (pendingRequestsByOrder.get(jo.job_order_id) ?? 0) : 0,
        material_count: jo.job_order_id ? (materialsByOrder.get(jo.job_order_id)?.length ?? 0) : 0,
        actual_cost_recorded: jo.actual_materials_cost != null && jo.actual_labor_cost != null && jo.actual_logistics_cost != null,
        final_value: finalValue,
        quoted_value: Number(j.quoted_value ?? 0),
        received,
        receivable: Math.max(0, finalValue - received),
        est_materials: Number(jo.estimated_materials_cost ?? 0),
        actual_materials: jo.actual_materials_cost == null ? null : Number(jo.actual_materials_cost),
        est_labor: Number(jo.estimated_labor_cost ?? 0),
        actual_labor: jo.actual_labor_cost == null ? null : Number(jo.actual_labor_cost),
        est_logistics: Number(jo.estimated_logistics_cost ?? 0),
        actual_logistics: jo.actual_logistics_cost == null ? null : Number(jo.actual_logistics_cost),
        commission,
        commission_paid: commissionPaid,
        expenses: jobExpenseTotals.get(j.job_id) ?? 0,
        closed: false,
        override: false,
        override_reason: null,
        control_tier: getJobControlTier(finalValue)
      };
    });

    const closureResult = jobs.length
      ? await supabase.from("accounting_job_closures").select("job_id, override, override_reason").in("job_id", jobs.map(j => j.job_id))
      : { data: [], error: null };
    if (closureResult.error) throw new Error(`Accounting closure query failed: ${closureResult.error.message}`);
    const closuresById = new Map((closureResult.data ?? []).map((r: any) => [r.job_id, r]));
    jobs.forEach(j => {
      const closure = closuresById.get(j.job_id);
      j.closed = Boolean(closure);
      j.override = Boolean(closure?.override);
      j.override_reason = closure?.override_reason ?? null;
    });

    const commissionRows = (jobsResult.data ?? []).flatMap((j: any) => (j.job_commissions ?? []).map((c: any) => ({
      commission_id: c.commission_id ?? `${j.job_id}-commission`,
      agent_name: c.users?.name ?? "Sales agent",
      client_name: j.clients?.name ?? "Unknown",
      amount: Number(c.amount ?? 0),
      status: c.status
    })));

    const commissionControlRows: AdminCommissionRow[] = (jobsResult.data ?? []).flatMap((j: any) => (j.job_commissions ?? []).map((c: any) => ({
      commission_id: c.commission_id ?? `${j.job_id}-commission`,
      job_id: j.job_id,
      agent_name: c.users?.name ?? "Sales agent",
      client_name: j.clients?.name ?? "Unknown",
      commission_type: c.commission_type ?? "percentage",
      commission_value: Number(c.commission_value ?? c.commission_rate ?? 0),
      split_pct: Number(c.split_pct ?? 100),
      amount: c.amount == null ? null : Number(c.amount),
      status: c.status
    })));

    const paymentRows = (jobsResult.data ?? []).filter((j: any) => {
      const payments = j.payments ?? [];
      return !payments.some((p: any) => p.status === "received" && p.type === "down_payment") || !payments.some((p: any) => p.status === "received" && p.type === "balance");
    }).map((j: any) => ({ job_id: j.job_id, client_name: j.clients?.name ?? "Unknown", quoted_value: j.quoted_value, final_value: j.final_value }));

    const opening = openingResult.data;
    const trendMap = new Map<string, { month: string; collections: number; expenses: number }>();
    const monthKey = (value: string) => value.slice(0, 7);
    for (const p of cashTrendResult.data ?? []) {
      const key = monthKey(p.paid_date);
      const row = trendMap.get(key) ?? { month: key, collections: 0, expenses: 0 };
      row.collections += Number(p.amount ?? 0);
      trendMap.set(key, row);
    }
    for (const e of expensesResult.data ?? []) if (e.status === "paid" && !e.job_id) {
      const key = String(e.expense_date).slice(0, 7);
      const row = trendMap.get(key) ?? { month: key, collections: 0, expenses: 0 };
      row.expenses += Number(e.amount ?? 0);
      trendMap.set(key, row);
    }
    const cashTrend = Array.from(trendMap.values()).sort((a,b) => a.month.localeCompare(b.month)).slice(-12);
    const dashboardMetrics = {
      currentCash: Number(dashboardCashResult.data?.current_cash_position ?? 0),
      receivable: Number(dashboardReceivableResult.data?.customer_receivables ?? 0),
      revenue: Number(dashboardRevenueResult.data?.approved_revenue ?? 0),
      profit: Number(dashboardProfitResult.data?.estimated_job_profit ?? 0)
    };
    const currentMonth = new Date().toISOString().slice(0, 7);
    const inCurrentMonth = (value: string | null | undefined) => Boolean(value && value.slice(0, 7) === currentMonth);
    const cashMovement = {
      collections: (jobsResult.data ?? []).reduce((sum: number, j: any) => sum + (j.payments ?? []).filter((p: any) => p.status === "received" && inCurrentMonth(p.paid_date)).reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0), 0),
      releases: 0,
      commissionPayouts: (jobsResult.data ?? []).reduce((sum: number, j: any) => sum + (j.job_commissions ?? []).filter((c: any) => c.status === "paid" && inCurrentMonth(c.paid_date)).reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0), 0),
      paidExpenses: expenses.filter(e => e.status === "paid" && e.expense_date.slice(0, 7) === currentMonth).reduce((s, e) => s + e.amount, 0)
    };


    return <PortalShell active="/accounting" eyebrow="Accounting portal" title="Financial control center" roleLabel="Accounting" personName={accountingUser.name}>
      <AccountingWorkspace jobs={jobs} expenses={expenses} openingBalance={opening} accountingUserId={accountingUser.user_id} currentMonth={currentMonth} cashMovement={cashMovement} dashboardMetrics={dashboardMetrics} cashTrend={cashTrend} />
      <div className="mt-5"><PaymentLogger rows={paymentRows} /></div>
            <div className="mt-5 space-y-5">
        <CommissionSettingsForm settings={commissionSettings as CommissionSettingsRow | null} accountingUserId={accountingUser.user_id} />
        <CommissionControl rows={commissionControlRows} />
        <CommissionQueue rows={commissionRows} />
      </div>
    </PortalShell>;
  });
}
