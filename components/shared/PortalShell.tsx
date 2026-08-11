import { LogoutButton } from "@/components/shared/LogoutButton";
import { BrandLogo } from "@/components/shared/BrandLogo";

const PORTAL_LABELS: Record<string, string> = {
  "/sales": "Sales",
  "/production": "Production",
  "/admin": "Admin",
  "/accounting": "Accounting"
};

export function PortalShell({
  active,
  eyebrow,
  title,
  roleLabel,
  personName,
  children
}: {
  active: "/sales" | "/admin" | "/accounting" | "/production";
  eyebrow: string;
  title: string;
  roleLabel: string;
  personName: string;
  children: React.ReactNode;
}) {
  const portalLabel = PORTAL_LABELS[active] ?? "Dashboard";

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-slate-100">
      {/* Lightweight SVG decoration keeps the dashboard lively without images/assets. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <svg className="absolute -right-24 -top-24 h-72 w-72 text-amber-300/30" viewBox="0 0 300 300" fill="none">
          <circle cx="150" cy="150" r="105" stroke="currentColor" strokeWidth="18" />
          <circle cx="150" cy="150" r="58" stroke="currentColor" strokeWidth="7" />
          <path d="M150 18v264M18 150h264" stroke="currentColor" strokeWidth="4" strokeDasharray="10 14" />
        </svg>
        <svg className="absolute -bottom-28 -left-20 h-80 w-80 text-cyan-300/25" viewBox="0 0 320 320" fill="none">
          <path d="M20 230C85 80 165 300 300 72" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
          <circle cx="72" cy="116" r="20" fill="currentColor" />
          <circle cx="238" cy="188" r="13" fill="currentColor" />
        </svg>
        <div className="absolute left-1/3 top-24 h-20 w-20 rotate-12 rounded-3xl bg-fuchsia-300/15" />
        <div className="absolute right-1/4 bottom-20 h-14 w-14 rounded-full bg-emerald-300/20" />
      </div>

      <aside className="relative hidden w-60 shrink-0 flex-col bg-gray-900 px-4 py-6 text-gray-300 md:flex">
        <div className="mb-10"><BrandLogo dark /></div>
        <div className="flex items-center rounded-md border-l-2 border-amber-400 bg-gray-800/80 py-2 pl-3 pr-3 text-sm font-medium text-white">
          {portalLabel}
        </div>
        <div className="mt-auto">
          <svg viewBox="0 0 40 40" className="mb-4 h-6 w-6 text-gray-700">
            <circle cx="20" cy="20" r="9" stroke="currentColor" strokeWidth="1" fill="none" />
            <line x1="20" y1="0" x2="20" y2="40" stroke="currentColor" strokeWidth="1" />
            <line x1="0" y1="20" x2="40" y2="20" stroke="currentColor" strokeWidth="1" />
          </svg>
          <LogoutButton />
        </div>
      </aside>

      <main className="relative flex-1 px-3 py-4 sm:px-5 sm:py-6 md:px-8 md:py-7">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-4 flex items-center justify-between gap-3 sm:mb-5">
            <div className="flex min-w-0 items-center gap-2">
              <img src="/dwlogo.jpg" alt="DW Advertising Signages" className="h-10 w-[62px] shrink-0 rounded-md object-contain shadow-sm md:hidden" />
              <p className="truncate text-[11px] font-medium uppercase tracking-wider text-gray-500 sm:text-xs">
                {eyebrow}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <p className="max-w-[52vw] truncate rounded-full bg-white/90 px-2.5 py-1.5 text-[11px] text-gray-600 shadow-sm ring-1 ring-gray-200 sm:px-3 sm:text-xs">
                {roleLabel} <span className="text-gray-300">·</span> {personName}
              </p>
              <div className="md:hidden">
                <LogoutButton />
              </div>
            </div>
          </div>
          <h1 className="mb-5 text-xl font-bold tracking-tight text-gray-900 sm:mb-6 sm:text-2xl">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
