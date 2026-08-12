"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CommissionType } from "@/lib/types/database";

export interface CommissionSettingsRow {
  settings_id: number;
  commission_type: CommissionType;
  commission_value: number;
  updated_at: string;
}

export function CommissionSettingsForm({ settings, adminId }: { settings: CommissionSettingsRow | null; adminId?: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [type, setType] = useState<CommissionType>(settings?.commission_type ?? "percentage");
  const [value, setValue] = useState(String(settings?.commission_value ?? 10));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const amount = Math.max(0, Number(value) || 0);
    setSaving(true); setMessage(null); setError(null);
    const { error: saveError } = await supabase.from("commission_settings").upsert({
      settings_id: 1,
      commission_type: type,
      commission_value: amount,
      updated_by: adminId || null,
      updated_at: new Date().toISOString()
    }, { onConflict: "settings_id" });
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    setMessage(type === "percentage" ? `New jobs will default to ${amount}% commission.` : `New jobs will default to PHP ${amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })} commission.`);
    router.refresh();
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">Commission settings</p>
        <p className="text-xs text-gray-500">Admin controls the default used when a new job commission is created. Existing job commissions keep their saved terms.</p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-[180px_180px_auto] sm:items-end">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Default type</label>
          <select value={type} onChange={(e) => setType(e.target.value as CommissionType)} className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs">
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Default value</label>
          <div className="relative">
            <input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="w-full rounded-md border border-gray-300 px-2.5 py-2 pr-9 text-xs" />
            <span className="pointer-events-none absolute right-2.5 top-2 text-xs text-gray-400">{type === "percentage" ? "%" : "PHP"}</span>
          </div>
        </div>
        <button onClick={save} disabled={saving} className="rounded-md bg-[#0784c8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#006da9] disabled:opacity-50">
          {saving ? "Saving…" : "Save default"}
        </button>
      </div>
      {message && <div className="border-t border-gray-100 px-4 py-3 text-xs text-[#087eb9]">{message}</div>}
      {error && <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
    </div>
  );
}
