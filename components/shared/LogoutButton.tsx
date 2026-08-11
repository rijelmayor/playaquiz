"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="mt-2 w-full rounded-md border border-gray-700 px-3 py-2 text-left text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
    >
      Sign out
    </button>
  );
}
