export function BrandLogo({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
      <img
        src="/dwlogo.jpg"
        alt="DW Advertising Signages"
        className={compact
          ? "h-10 w-[62px] rounded-md object-contain shadow-sm"
          : "h-[58px] w-[90px] rounded-md object-contain shadow-sm"}
      />
      {!compact && (
        <div>
          <p className={`text-sm font-semibold tracking-wide ${dark ? "text-white" : "text-gray-900"}`}>
            DW ADSIGN
          </p>
          <p className="text-xs text-gray-500">Ops CRM</p>
        </div>
      )}
    </div>
  );
}
