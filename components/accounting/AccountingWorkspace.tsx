"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/shared/StatusBadge";

const peso = (n: number | null | undefined) => `₱${Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PRODUCTION_STAGES = ["materials", "fabrication", "printing", "finishing", "electrical", "assembly", "qc", "ready_for_delivery", "installation", "completed"];
const stageLabel = (stage: string) => stage.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

export interface AccountingJob {
  job_id: string;
  client_name: string;
  status: string;
  production_stage: string;
  priority: string;
  production_deadline: string | null;
  latest_qc_result: string | null;
  latest_qc_rework: boolean;
  installation_status: string | null;
  installation_verified: boolean;
  pending_material_requests: number;
  material_count: number;
  actual_cost_recorded: boolean;
  final_value: number;
  quoted_value: number;
  received: number;
  receivable: number;
  est_materials: number;
  actual_materials: number | null;
  est_labor: number;
  actual_labor: number | null;
  est_logistics: number;
  actual_logistics: number | null;
  commission: number;
  commission_paid: number;
  funds_released: number;
  expenses: number;
  closed: boolean;
}

export interface AccountingExpense {
  expense_id: string;
  job_id: string | null;
  client_name: string;
  category: string;
  description: string;
  payee: string | null;
  amount: number;
  status: string;
  expense_date: string;
  reference_no: string | null;
}

interface OpeningBalance {
  opening_balance_id?: string;
  period_start: string;
  cash_on_hand: number;
  bank_balance: number;
  opening_receivables: number;
  opening_payables: number;
  note: string | null;
}

export function AccountingWorkspace({
  jobs,
  expenses,
  openingBalance,
  accountingUserId,
  currentMonth,
  cashMovement
}: {
  jobs: AccountingJob[];
  expenses: AccountingExpense[];
  openingBalance: OpeningBalance | null;
  accountingUserId: string;
  currentMonth: string;
  cashMovement: { collections: number; releases: number; commissionPayouts: number; paidExpenses: number };
}) {
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<"overview" | "jobs" | "receivables" | "disbursements" | "reports">("overview");
  const [jobSearch, setJobSearch] = useState("");
  const [showExpense, setShowExpense] = useState(false);
  const [showOpening, setShowOpening] = useState(false);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [expense, setExpense] = useState({ category: "office", description: "", payee: "", amount: "", reference_no: "", expense_date: currentMonth });
  const [opening, setOpening] = useState({
    cash_on_hand: String(openingBalance?.cash_on_hand ?? 0),
    bank_balance: String(openingBalance?.bank_balance ?? 0),
    opening_receivables: String(openingBalance?.opening_receivables ?? 0),
    opening_payables: String(openingBalance?.opening_payables ?? 0),
    note: openingBalance?.note ?? ""
  });

  const totals = useMemo(() => {
    const revenue = jobs.reduce((s, j) => s + j.final_value, 0);
    const received = jobs.reduce((s, j) => s + j.received, 0);
    const receivable = jobs.reduce((s, j) => s + j.receivable, 0);
    const estimatedCost = jobs.reduce((s, j) => s + j.est_materials + j.est_labor + j.est_logistics + j.commission, 0);
    const actualCost = jobs.reduce((s, j) => s + (j.actual_materials ?? j.est_materials) + (j.actual_labor ?? j.est_labor) + (j.actual_logistics ?? j.est_logistics) + j.commission + j.expenses, 0);
    const released = jobs.reduce((s, j) => s + j.funds_released, 0);
    const paidCommissions = jobs.reduce((s, j) => s + j.commission_paid, 0);
    const paidExpenses = expenses.filter(e => e.status === "paid").reduce((s, e) => s + e.amount, 0);
    const openingCash = (openingBalance?.cash_on_hand ?? 0) + (openingBalance?.bank_balance ?? 0);
    return { revenue, received, receivable, estimatedCost, actualCost, released, paidCommissions, paidExpenses, openingCash, currentCash: openingCash + cashMovement.collections - cashMovement.releases - cashMovement.commissionPayouts - cashMovement.paidExpenses };
  }, [jobs, expenses, openingBalance]);

  const filteredJobs = jobs.filter(j => j.client_name.toLowerCase().includes(jobSearch.toLowerCase()) || j.job_id.toLowerCase().includes(jobSearch.toLowerCase()));

  async function saveExpense() {
    if (!expense.description || Number(expense.amount) <= 0) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    await supabase.from("accounting_expenses").insert({
      ...expense,
      amount: Number(expense.amount),
      created_by: accountingUserId,
      status: "paid"
    });
    actionLock.current = false;
    setBusy(false);
    setShowExpense(false);
    setExpense({ category: "office", description: "", payee: "", amount: "", reference_no: "", expense_date: currentMonth });
    router.refresh();
  }

  async function saveOpening() {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    await supabase.from("accounting_opening_balances").upsert({
      period_start: `${currentMonth}-01`,
      cash_on_hand: Number(opening.cash_on_hand) || 0,
      bank_balance: Number(opening.bank_balance) || 0,
      opening_receivables: Number(opening.opening_receivables) || 0,
      opening_payables: Number(opening.opening_payables) || 0,
      note: opening.note || null,
      created_by: accountingUserId,
      updated_at: new Date().toISOString()
    }, { onConflict: "period_start" });
    actionLock.current = false;
    setBusy(false);
    setShowOpening(false);
    router.refresh();
  }

  async function closeJob(job: AccountingJob) {
    if (busy || !isCloseReady(job)) return;
    const actualCost = (job.actual_materials ?? job.est_materials) + (job.actual_labor ?? job.est_labor) + (job.actual_logistics ?? job.est_logistics) + job.commission + job.expenses;
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    await supabase.from("accounting_job_closures").upsert({
      job_id: job.job_id,
      closed_by: accountingUserId,
      final_revenue: job.final_value,
      final_cost: actualCost,
      final_profit: job.final_value - actualCost
    }, { onConflict: "job_id" });
    actionLock.current = false;
    setBusy(false);
    router.refresh();
  }

  function isCloseReady(job: AccountingJob) {
    return job.production_stage === "completed"
      && job.latest_qc_result === "pass"
      && !job.latest_qc_rework
      && job.installation_status === "completed"
      && job.installation_verified
      && job.pending_material_requests === 0
      && job.actual_cost_recorded
      && job.receivable <= 0.01
      && ["installed", "paid", "closed"].includes(job.status);
  }

  const tabs = [
    ["overview", "Dashboard"], ["jobs", "Job Financials"], ["receivables", "Receivables"], ["disbursements", "Disbursements"], ["reports", "Reports"]
  ] as const;

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === id ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Current cash position" value={peso(totals.currentCash)} />
            <Metric label="Customer receivables" value={peso(totals.receivable)} />
            <Metric label="Revenue on approved jobs" value={peso(totals.revenue)} />
            <Metric label="Estimated job profit" value={peso(totals.revenue - totals.estimatedCost)} />
          </section>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Beginning balance" action={<button onClick={() => setShowOpening(true)} className="text-xs font-semibold text-gray-900 underline">{openingBalance ? "Edit" : "Set balance"}</button>}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Mini label="Cash on hand" value={peso(openingBalance?.cash_on_hand)} />
                <Mini label="Bank" value={peso(openingBalance?.bank_balance)} />
                <Mini label="Opening receivables" value={peso(openingBalance?.opening_receivables)} />
                <Mini label="Opening payables" value={peso(openingBalance?.opening_payables)} />
              </div>
              {!openingBalance && <p className="mt-3 text-xs text-amber-700">Set the opening cash/bank position before relying on current cash calculations.</p>}
            </Panel>
            <Panel title="Cash movement this period">
              <div className="space-y-2 text-sm">
                <Line label="Opening cash" value={peso(totals.openingCash)} />
                <Line label="Customer collections" value={`+ ${peso(cashMovement.collections)}`} positive />
                <Line label="Production fund releases" value={`− ${peso(cashMovement.releases)}`} />
                <Line label="Commission payouts" value={`− ${peso(cashMovement.commissionPayouts)}`} />
                <Line label="Other paid expenses" value={`− ${peso(cashMovement.paidExpenses)}`} />
                <div className="border-t pt-2"><Line label="Current cash position" value={peso(totals.currentCash)} strong /></div>
              </div>
            </Panel>
          </div>
          <Panel title="Profitability watchlist">
            <div className="overflow-x-auto"><JobTable jobs={jobs.slice(0, 8)} onSelect={setSelectedJob} selectedJob={selectedJob} onClose={closeJob} closing={busy} /></div>
          </Panel>
        </div>
      )}

      {tab === "jobs" && (
        <Panel title="Job financial ledger" right={<input value={jobSearch} onChange={e => setJobSearch(e.target.value)} placeholder="Search customer or Job ID" className="w-52 rounded-lg border px-3 py-2 text-xs" />}>
          <div className="overflow-x-auto"><JobTable jobs={filteredJobs} onSelect={setSelectedJob} selectedJob={selectedJob} onClose={closeJob} closing={busy} detailed /></div>
        </Panel>
      )}

      {tab === "receivables" && (
        <Panel title="Accounts receivable">
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b text-gray-500"><th className="px-3 py-2">Customer</th><th>Job</th><th>Approved value</th><th>Received</th><th>Balance</th><th>Status</th></tr></thead><tbody>{jobs.filter(j => j.receivable > 0).map(j => <tr key={j.job_id} className="border-b last:border-0"><td className="px-3 py-3 font-medium">{j.client_name}</td><td className="font-mono text-[10px]">{j.job_id.slice(0, 8)}</td><td><StatusBadge status={j.production_stage} /></td><td>{peso(j.final_value)}</td><td>{peso(j.received)}</td><td className="font-semibold">{peso(j.receivable)}</td><td><StatusBadge status={j.receivable > 0 && j.received > 0 ? "partial" : "pending"} /></td></tr>)}</tbody></table></div>
          {jobs.filter(j => j.receivable > 0).length === 0 && <Empty text="No outstanding customer balances." />}
        </Panel>
      )}

      {tab === "disbursements" && (
        <div className="space-y-5">
          <div className="flex justify-end"><button onClick={() => setShowExpense(true)} className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white">+ Record expense</button></div>
          <Panel title="Production fund releases"><div className="grid gap-3 md:grid-cols-3"><Mini label="Released" value={peso(totals.released)} /><Mini label="Paid commissions" value={peso(totals.paidCommissions)} /><Mini label="Other paid expenses" value={peso(totals.paidExpenses)} /></div><p className="mt-3 text-xs text-gray-500">Production remains the source of actual material/labor/logistics cost. Accounting records the cash release and reconciles it against those actuals.</p></Panel>
          <Panel title="Other accounting expenses"><ExpenseTable expenses={expenses} /></Panel>
        </div>
      )}

      {tab === "reports" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Monthly performance"><div className="space-y-2 text-sm"><Line label="Revenue" value={peso(totals.revenue)} strong /><Line label="Estimated direct cost + commission" value={peso(totals.estimatedCost)} /><Line label="Estimated gross job profit" value={peso(totals.revenue - totals.estimatedCost)} positive={totals.revenue - totals.estimatedCost >= 0} strong /><Line label="Actual/provisional job cost" value={peso(totals.actualCost)} /><Line label="Actual/provisional profit" value={peso(totals.revenue - totals.actualCost)} positive={totals.revenue - totals.actualCost >= 0} strong /></div></Panel>
          <Panel title="Control totals"><div className="space-y-2 text-sm"><Line label="Approved/active jobs" value={String(jobs.length)} /><Line label="Jobs with receivables" value={String(jobs.filter(j => j.receivable > 0.01).length)} /><Line label="Jobs ready for financial close" value={String(jobs.filter(j => j.receivable <= 0.01 && !j.closed).length)} /><Line label="Financially closed jobs" value={String(jobs.filter(j => j.closed).length)} /><Line label="Recorded expense entries" value={String(expenses.length)} /></div></Panel>
        </div>
      )}

      {showExpense && <Modal title="Record accounting expense" onClose={() => setShowExpense(false)}><div className="grid gap-3 sm:grid-cols-2"><Field label="Category"><select value={expense.category} onChange={e => setExpense({...expense, category: e.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"><option>office</option><option>utilities</option><option>rent</option><option>transportation</option><option>software</option><option>marketing</option><option>supplies</option><option>other</option></select></Field><Field label="Amount"><input type="number" step="0.01" value={expense.amount} onChange={e => setExpense({...expense, amount: e.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200" /></Field><Field label="Description"><input value={expense.description} onChange={e => setExpense({...expense, description: e.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200" /></Field><Field label="Payee"><input value={expense.payee} onChange={e => setExpense({...expense, payee: e.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200" /></Field><Field label="Reference no."><input value={expense.reference_no} onChange={e => setExpense({...expense, reference_no: e.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200" /></Field><Field label="Expense date"><input type="date" value={expense.expense_date} onChange={e => setExpense({...expense, expense_date: e.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200" /></Field></div><ModalActions onCancel={() => setShowExpense(false)} onSave={saveExpense} busy={busy} /></Modal>}

      {showOpening && <Modal title="Beginning balance" onClose={() => setShowOpening(false)}><div className="grid gap-3 sm:grid-cols-2"><Field label="Cash on hand"><input type="number" step="0.01" value={opening.cash_on_hand} onChange={e => setOpening({...opening, cash_on_hand: e.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200" /></Field><Field label="Bank balance"><input type="number" step="0.01" value={opening.bank_balance} onChange={e => setOpening({...opening, bank_balance: e.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200" /></Field><Field label="Opening receivables"><input type="number" step="0.01" value={opening.opening_receivables} onChange={e => setOpening({...opening, opening_receivables: e.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200" /></Field><Field label="Opening payables"><input type="number" step="0.01" value={opening.opening_payables} onChange={e => setOpening({...opening, opening_payables: e.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200" /></Field><Field label="Note"><input value={opening.note} onChange={e => setOpening({...opening, note: e.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200" /></Field></div><ModalActions onCancel={() => setShowOpening(false)} onSave={saveOpening} busy={busy} /></Modal>}
    </>
  );
}

function JobTable({ jobs, onSelect, selectedJob, onClose, closing, detailed = false }: { jobs: AccountingJob[]; onSelect: (id: string | null) => void; selectedJob: string | null; onClose: (job: AccountingJob) => void; closing: boolean; detailed?: boolean }) {
  return <table className="w-full min-w-[880px] text-left text-xs"><thead><tr className="border-b text-gray-500"><th className="px-3 py-2">Customer</th><th>Job</th><th>Production</th><th>Revenue</th><th>Collected</th><th>Receivable</th><th>Est. cost</th><th>Actual/provisional cost</th><th>Profit</th><th>Margin</th><th></th></tr></thead><tbody>{jobs.map(j => { const cost = (j.actual_materials ?? j.est_materials) + (j.actual_labor ?? j.est_labor) + (j.actual_logistics ?? j.est_logistics) + j.commission + j.expenses; const profit = j.final_value - cost; const margin = j.final_value ? profit / j.final_value * 100 : 0; return <tr key={j.job_id} className="border-b last:border-0"><td className="px-3 py-3 font-medium">{j.client_name}</td><td className="font-mono text-[10px]">{j.job_id.slice(0, 8)}</td><td><StatusBadge status={j.production_stage} /></td><td>{peso(j.final_value)}</td><td>{peso(j.received)}</td><td className={j.receivable > 0 ? "font-semibold text-amber-700" : "text-gray-400"}>{peso(j.receivable)}</td><td>{peso(j.est_materials + j.est_labor + j.est_logistics + j.commission)}</td><td>{peso(cost)}</td><td className={profit < 0 ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>{peso(profit)}</td><td>{margin.toFixed(1)}%</td><td><button onClick={() => onSelect(selectedJob === j.job_id ? null : j.job_id)} className="rounded-md border px-2 py-1 font-semibold">{selectedJob === j.job_id ? "Hide" : "View"}</button></td></tr>})}</tbody>{selectedJob && jobs.filter(j => j.job_id === selectedJob).map(j => <tfoot key={j.job_id}><tr><td colSpan={11} className="bg-gray-50 p-4"><div className="grid gap-3 sm:grid-cols-4"><Mini label="Materials" value={`${peso(j.actual_materials ?? j.est_materials)}${j.actual_materials == null ? " est." : " actual"}`} /><Mini label="Labor" value={`${peso(j.actual_labor ?? j.est_labor)}${j.actual_labor == null ? " est." : " actual"}`} /><Mini label="Logistics" value={`${peso(j.actual_logistics ?? j.est_logistics)}${j.actual_logistics == null ? " est." : " actual"}`} /><Mini label="Funds released" value={peso(j.funds_released)} /></div><div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
  <div className="mb-2 flex flex-wrap items-center gap-2"><StatusBadge status={j.status} /><StatusBadge status={j.production_stage} />{j.closed && <StatusBadge status="closed" />}</div>
  <div className="mb-3 flex flex-wrap gap-1.5">{PRODUCTION_STAGES.map((stage, index) => <span key={stage} className={`rounded-full border px-2 py-1 text-[9px] font-semibold capitalize ${j.production_stage === stage ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-gray-50 text-gray-500"}`}>{index + 1}. {stage.replaceAll("_", " ")}</span>)}</div>
  <div className="grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
    <ReadinessItem label="Production" ok={j.production_stage === "completed"} value={stageLabel(j.production_stage)} />
    <ReadinessItem label="Final QC" ok={j.latest_qc_result === "pass" && !j.latest_qc_rework} value={j.latest_qc_result ? `${j.latest_qc_result}${j.latest_qc_rework ? " / rework" : ""}` : "Not recorded"} />
    <ReadinessItem label="Installation" ok={j.installation_status === "completed" && j.installation_verified} value={j.installation_status ? `${stageLabel(j.installation_status)}${j.installation_verified ? " / verified" : " / unverified"}` : "Not recorded"} />
    <ReadinessItem label="Customer payment" ok={j.receivable <= 0.01} value={j.receivable <= 0.01 ? "Fully received" : `${peso(j.receivable)} outstanding`} />
    <ReadinessItem label="Cost reconciliation" ok={j.actual_cost_recorded} value={j.actual_cost_recorded ? "Actual costs recorded" : "Actual cost incomplete"} />
    <ReadinessItem label="Material requests" ok={j.pending_material_requests === 0} value={j.pending_material_requests === 0 ? "Resolved" : `${j.pending_material_requests} pending`} />
  </div>
  <div className="mt-3 flex flex-wrap items-center gap-2">
    {j.closed ? <span className="text-xs font-semibold text-emerald-700">Financially closed</span> : <button disabled={closing || j.receivable > 0.01 || j.production_stage !== "completed" || j.latest_qc_result !== "pass" || j.latest_qc_rework || j.installation_status !== "completed" || !j.installation_verified || j.pending_material_requests > 0 || !j.actual_cost_recorded} title={j.receivable > 0.01 ? "Customer balance must be fully received before closing." : "Production, final QC, verified installation, reconciled actual costs, resolved material requests and full payment are required."} onClick={() => onClose(j)} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{closing && <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}{closing ? "Closing…" : "Close project financially"}</button>}
  </div>
</div></td></tr></tfoot>)}</table>;
}

function ReadinessItem({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return <div className={`rounded-lg border px-2.5 py-2 ${ok ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}>
    <p className="font-semibold uppercase tracking-wide text-[9px] text-gray-500">{label}</p>
    <p className={`mt-0.5 font-semibold ${ok ? "text-emerald-700" : "text-amber-800"}`}>{ok ? "✓ " : "⚠ "}{value}</p>
  </div>;
}

function ExpenseTable({ expenses }: { expenses: AccountingExpense[] }) { return <table className="w-full min-w-[650px] text-left text-xs"><thead><tr className="border-b text-gray-500"><th className="px-3 py-2">Date</th><th>Category</th><th>Description</th><th>Payee</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead><tbody>{expenses.map(e => <tr key={e.expense_id} className="border-b last:border-0"><td className="px-3 py-3">{e.expense_date}</td><td className="capitalize">{e.category}</td><td>{e.description}</td><td>{e.payee ?? "—"}</td><td>{e.reference_no ?? "—"}</td><td className="font-semibold">{peso(e.amount)}</td><td><StatusBadge status={e.status} /></td></tr>)}</tbody></table>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{value}</p></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-gray-50 p-3"><p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p><p className="mt-1 font-semibold tabular-nums text-gray-900">{value}</p></div>; }
function Line({ label, value, positive, strong }: { label: string; value: string; positive?: boolean; strong?: boolean }) { return <div className={`flex items-center justify-between ${strong ? "font-bold" : ""}`}><span className="text-gray-500">{label}</span><span className={positive ? "text-emerald-700" : "text-gray-900"}>{value}</span></div>; }
function Panel({ title, children, action, right }: { title: string; children: React.ReactNode; action?: React.ReactNode; right?: React.ReactNode }) { return <section className="rounded-xl border border-gray-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3"><h2 className="text-sm font-semibold text-gray-900">{title}</h2>{action ?? right}</div><div className="p-4">{children}</div></section>; }
function Empty({ text }: { text: string }) { return <p className="p-5 text-center text-xs text-gray-500">{text}</p>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-xs font-medium text-gray-600">{label}<div className="mt-1">{children}</div></label>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">{title}</h3><button onClick={onClose} className="text-gray-500">✕</button></div>{children}</div></div>; }
function ModalActions({ onCancel, onSave, busy }: { onCancel: () => void; onSave: () => void; busy: boolean }) { return <div className="mt-5 flex justify-end gap-2"><button onClick={onCancel} className="rounded-lg border px-3 py-2 text-xs font-semibold">Cancel</button><button disabled={busy} onClick={onSave} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy && <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}{busy ? "Saving…" : "Save"}</button></div>; }
