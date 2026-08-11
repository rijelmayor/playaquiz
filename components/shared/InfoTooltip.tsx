"use client";

// Small "ⓘ" affordance that reveals an explanation on hover/focus.
// Used throughout the Admin portal so every metric, badge and label can
// answer "what does this mean?" without leaving the page.
export function InfoTooltip({ text, side = "top" }: { text: string; side?: "top" | "bottom" }) {
  return (
    <span className="group relative inline-flex align-middle">
      <span
        tabIndex={0}
        aria-label={text}
        className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-gray-300 text-[9px] font-bold leading-none text-gray-400 outline-none transition hover:border-gray-500 hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-gray-400"
      >
        i
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-30 w-56 -translate-x-1/2 rounded-lg bg-gray-900 px-2.5 py-2 text-[11px] font-normal leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${
          side === "top" ? "bottom-full mb-2" : "top-full mt-2"
        }`}
      >
        {text}
        <span
          className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${
            side === "top" ? "top-full border-t-gray-900" : "bottom-full border-b-gray-900"
          }`}
        />
      </span>
    </span>
  );
}

// Wraps a label + tooltip together so callers don't have to repeat the
// flex/gap markup everywhere.
export function LabelWithTip({ label, tip, className = "" }: { label: string; tip: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {label}
      <InfoTooltip text={tip} />
    </span>
  );
}
