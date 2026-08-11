"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ApprovedJob {
  job_id: string;
  client_name: string;
  down_payment_received: boolean;
  payment_terms: "50_50" | "full_on_completion" | "full_on_installation" | "custom";
}

interface Fabricator {
  user_id: string;
  name: string;
}

export function JobOrderCreateForm({
  rows,
  fabricators
}: {
  rows: ApprovedJob[];
  fabricators: Fabricator[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [fabricatorId, setFabricatorId] = useState("");
  const [materials, setMaterials] = useState("");
  const [estMaterials, setEstMaterials] = useState("");
  const [estLabor, setEstLabor] = useState("");
  const [estLogistics, setEstLogistics] = useState("");
  const [vendor, setVendor] = useState("");
  const [deadline, setDeadline] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function create(jobId: string) {
    if (!fabricatorId) return;
    const { error } = await supabase.from("job_orders").insert({
      job_id: jobId,
      fabricator_id: fabricatorId,
      materials,
      estimated_materials_cost: estMaterials ? Number(estMaterials) : null,
      estimated_labor_cost: estLabor ? Number(estLabor) : null,
      estimated_logistics_cost: estLogistics ? Number(estLogistics) : null,
      logistics_vendor: vendor || null,
      deadline: deadline || null
    });
    if (error) return;
    await supabase.from("jobs").update({ status: "in_production" }).eq("job_id", jobId);
    setOpenId(null);
    router.refresh();
  }

  if (rows.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-gray-200">
      <div className="border-b border-gray-200 px-4 py-3 text-sm text-gray-500">
        Forward to fabrication
      </div>
      {rows.map((row) => (
        <div key={row.job_id} className="border-b border-gray-100 px-4 py-3 last:border-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {row.client_name}
              <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                {row.payment_terms === "50_50" ? "50% downpayment" : row.payment_terms === "full_on_completion" ? "full payment on completion" : row.payment_terms === "full_on_installation" ? "full payment on installation" : "custom payment schedule"}
              </span>
              {!row.down_payment_received && row.payment_terms === "50_50" && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                  awaiting deposit
                </span>
              )}
            </p>
            <button
              onClick={() => setOpenId(openId === row.job_id ? null : row.job_id)}
              className="rounded-md border border-gray-800 px-3 py-1.5 text-xs font-medium"
            >
              Create job order
            </button>
          </div>
          {openId === row.job_id && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                value={fabricatorId}
                onChange={(e) => setFabricatorId(e.target.value)}
                className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              >
                <option value="">Assign fabricator…</option>
                {fabricators.map((f) => (
                  <option key={f.user_id} value={f.user_id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <input
                placeholder="Materials"
                value={materials}
                onChange={(e) => setMaterials(e.target.value)}
                className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              />
              <input
                type="number"
                placeholder="Est. materials ₱"
                value={estMaterials}
                onChange={(e) => setEstMaterials(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              />
              <input
                type="number"
                placeholder="Est. labor ₱"
                value={estLabor}
                onChange={(e) => setEstLabor(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              />
              <input
                type="number"
                placeholder="Est. logistics ₱"
                value={estLogistics}
                onChange={(e) => setEstLogistics(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              />
              <input
                placeholder="Logistics vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              />
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              />
              <button
                onClick={() => create(row.job_id)}
                className="col-span-2 rounded-md bg-gray-900 py-1.5 text-xs font-medium text-white"
              >
                Forward to fabrication
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
