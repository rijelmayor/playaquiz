import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Root just routes people to their portal based on role. No UI of its own.
export default async function Home() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("auth_id", session.user.id)
    .single();

  const portalByRole: Record<string, string> = {
    sales: "/sales",
    admin: "/admin",
    accounting: "/accounting",
    fabricator: "/production"
  };

  redirect(portalByRole[userRow?.role ?? ""] ?? "/login");
}
