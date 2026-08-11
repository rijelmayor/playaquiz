"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/shared/BrandLogo";

// Corner registration marks — the crosshair-in-circle guide printers and
// signage shops stamp on proofs to align cuts across layers. Standing in
// for a generic gradient/illustration with something the audience (a
// signage production team) would actually recognize from their own work.
function RegistrationMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none">
      <circle cx="20" cy="20" r="9" stroke="currentColor" strokeWidth="1" />
      <line x1="20" y1="0" x2="20" y2="40" stroke="currentColor" strokeWidth="1" />
      <line x1="0" y1="20" x2="40" y2="20" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Incorrect email or password." : error.message);
      setSubmitting(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gray-900 px-14 py-12 text-gray-300 lg:flex">
        <RegistrationMark className="absolute -left-4 -top-4 h-16 w-16 text-amber-400/30" />
        <RegistrationMark className="absolute -bottom-4 -right-4 h-16 w-16 text-amber-400/30" />

        <BrandLogo dark />

        <div className="max-w-sm">
         <p className="text-xs uppercase tracking-widest text-amber-400/80">
  Create. Achieve. Live.
</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">
            One system, from lead to installation.
          </h1>
          <p className="mt-4 text-sm text-gray-400">
            Sales, design approval, production, and payouts — tracked in one
            place.
          </p>
        </div>

        <p className="text-xs text-gray-600">Delight Works AdSign</p>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center bg-gray-50 px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><BrandLogo /></div>

          <h2 className="text-xl font-semibold text-gray-900">Sign in</h2>
          <p className="mt-1 text-sm text-gray-500">Use the account set up for your role.</p>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Email</label>
              <input
                type="email"
                placeholder="name@dwadsign.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 pr-16 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 hover:text-gray-800"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-xs text-gray-400">
            Accounts are provisioned by your admin — contact them if you need access.
          </p>
        </div>
      </div>
    </div>
  );
}
