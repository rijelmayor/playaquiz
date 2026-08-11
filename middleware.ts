import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Which role is allowed on which portal route. Add new portals here only.
const PORTAL_ROLES: Record<string, string> = {
  "/sales": "sales",
  "/admin": "admin",
  "/accounting": "accounting",
  "/production": "fabricator"
};

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        }
      }
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  const path = request.nextUrl.pathname;
  const matchedPortal = Object.keys(PORTAL_ROLES).find((p) => path.startsWith(p));

  if (!matchedPortal) return response;

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("auth_id", session.user.id)
    .single();

  if (userRow?.role !== PORTAL_ROLES[matchedPortal] && userRow?.role !== "admin") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/sales/:path*", "/admin/:path*", "/accounting/:path*", "/production/:path*"]
};
