import type { ReactNode } from "react";

// Every portal page does the same risky thing on load: several Supabase
// queries against a schema that's evolved through 14 migrations. If the
// database a deployment points at hasn't had every migration run (or the
// deployed code expects a column/table a migration adds), Postgrest throws,
// and by default Next.js turns that into an opaque "Application error: a
// client-side exception has occurred" page with nothing actionable in it.
//
// This wraps a portal page's loader so that failure instead renders the
// real error message plus the most common causes — which are almost
// always one of: (1) NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set for this
// Vercel environment, (2) the connected Supabase project is missing one or
// more migrations, (3) RLS is blocking the signed-in user's role.
export async function renderPortal(
  portalName: string,
  load: () => Promise<ReactNode>
): Promise<ReactNode> {
  try {
    return await load();
  } catch (err: any) {
    const message = err?.message ?? String(err);
    const code = err?.code ? ` (code: ${err.code})` : "";

    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-800">
            {portalName} couldn't load its data.
          </p>
          <p className="mt-2 rounded-md bg-white px-3 py-2 font-mono text-xs text-red-700">
            {message}
            {code}
          </p>
          <div className="mt-4 text-xs leading-relaxed text-red-900">
            <p className="font-semibold">Most likely cause:</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>
                <span className="font-medium">Missing/mismatched env vars</span> — in
                Vercel, Project Settings → Environment Variables, confirm{" "}
                <code className="rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
                and{" "}
                <code className="rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
                are set for the <strong>Production</strong> environment (not just
                Preview/Development) and point at the right Supabase project.
              </li>
              <li>
                <span className="font-medium">A migration hasn't been run yet</span> — if
                the error mentions a column or table (e.g. "does not exist"), open the
                Supabase SQL Editor and run any files in{" "}
                <code className="rounded bg-white px-1">supabase/migrations/</code> that
                haven't been applied yet, in order (0001, 0002, …).
              </li>
              <li>
                <span className="font-medium">Row Level Security</span> — if the error
                mentions "permission denied" or "policy", the signed-in user's row in{" "}
                <code className="rounded bg-white px-1">users</code> may have the wrong{" "}
                <code className="rounded bg-white px-1">role</code>, or a migration that
                adds a policy hasn't run.
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }
}
