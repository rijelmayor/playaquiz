"use client";

import { useState } from "react";

// Commission is sensitive — hidden by default, agent taps the eye to reveal.
export function CommissionMetric({ amount }: { amount: number }) {
  const [visible, setVisible] = useState(false);
  const formatted = `₱${amount.toLocaleString()}`;

  return (
    <div className="rounded-xl border-t-2 border-t-amber-400 bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Commission pending
        </p>
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide commission" : "Show commission"}
          className="text-gray-400 transition hover:text-gray-700"
        >
          {visible ? (
            // eye-off icon
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            // eye icon
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      <p className="text-2xl font-semibold tabular-nums text-gray-900">
        {visible ? formatted : "₱ ••••••"}
      </p>
    </div>
  );
}
