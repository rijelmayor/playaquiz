import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PortalShell } from "@/components/shared/PortalShell";
import { QuotationEditForm } from "@/components/shared/QuotationEditForm";
import type { Quotation } from "@/lib/types/database";

export default async function SalesQuotationEditPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: quotation, error } = await supabase.from("quotations").select("*").eq("quotation_id", params.id).single();
  const { data: sessionData } = await supabase.auth.getSession();
  const { data: person } = sessionData.session ? await supabase.from("users").select("name").eq("auth_id", sessionData.session.user.id).single() : { data: null };
  if (error || !quotation) notFound();
  return <PortalShell active="/sales" eyebrow="Sales portal" title="Edit quotation" roleLabel="Agent" personName={person?.name ?? "—"}>
    <QuotationEditForm quotation={quotation as Quotation} returnPath="/sales" />
  </PortalShell>;
}
