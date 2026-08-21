"use client";

import { useState } from "react";

// Commission is sensitive — hidden by default, agent taps the eye to reveal.
export function CommissionMetric({ amount }: { amount: number }) {
  const [visible, setVisible] = useState(false);
  const formatted = `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 0 })}`;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md">
      <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-amber-200/30" />
      <div className="relative flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 text-lg shadow-sm ring-1 ring-amber-100">
          💰
        </span>
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide commission" : "Show commission"}
          className="rounded-lg p-1 text-amber-600/70 transition hover:bg-amber-100 hover:text-amber-800"
        >
          {visible ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      <p className="relative mt-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700/80">
        Commission pending
      </p>
      <p className="relative mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-gray-900">
        {visible ? formatted : "₱ ••••••"}
      </p>
    </div>
  );
}
