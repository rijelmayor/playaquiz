export type JobControlTier = "fast" | "standard" | "full";

/**
 * Operational control level is based on final selling value.
 * This is intentionally application-only: no schema change is required.
 */
export function getJobControlTier(value: number | null | undefined): JobControlTier {
  const amount = Number(value ?? 0);
  if (amount < 10_000) return "fast";
  if (amount < 50_000) return "standard";
  return "full";
}

export const JOB_CONTROL_TIER_META: Record<JobControlTier, {
  label: string;
  shortLabel: string;
  description: string;
  badge: string;
}> = {
  fast: {
    label: "Fast Close",
    shortLabel: "FAST",
    description: "Small/simple job. Keep the operational path short while retaining payment and actual-cost accountability.",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700"
  },
  standard: {
    label: "Standard Control",
    shortLabel: "STANDARD",
    description: "Normal project controls: production, QC, installation, payment and actual-cost reconciliation.",
    badge: "border-amber-200 bg-amber-50 text-amber-700"
  },
  full: {
    label: "Full Control",
    shortLabel: "FULL",
    description: "Higher-value project. Use the complete production, verification and accounting controls.",
    badge: "border-red-200 bg-red-50 text-red-700"
  }
};

export function jobControlMeta(value: number | null | undefined) {
  return JOB_CONTROL_TIER_META[getJobControlTier(value)];
}
