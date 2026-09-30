"use client";
import { useState } from "react";

export default function InnloggingPage() {
  const [epost,   setEpost]   = useState("");
  const [passord, setPassord] = useState("");
  const [feil,    setFeil]    = useState<string | null>(null);
  const [laster,  setLaster]  = useState(false);

  const loggInn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeil(null);
    setLaster(true);

    try {
      // 1. Hent CSRF-token fra NextAuth
      const csrfRes = await fetch("/planner/api/auth/csrf");
      const { csrfToken } = await csrfRes.json();

      // 2. POST direkte til credentials-endepunktet
      const res = await fetch("/planner/api/auth/callback/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email:     epost.trim().toLowerCase(),
          password:  passord,
          csrfToken,
          callbackUrl: "/planner/prosjekter",
          json: "true",
        }),
        redirect: "manual",
      });

      if (res.ok || res.status === 302 || res.type === "opaqueredirect") {
        window.location.replace("/planner/prosjekter");
      } else {
        // Prøv å lese feilmelding fra NextAuth (rate limit e.l.)
        try {
          const body = await res.json();
          if (body?.error && body.error !== "CredentialsSignin") {
            setFeil(body.error);
          } else {
            setFeil("Feil e-post eller passord. Prøv igjen.");
          }
        } catch {
          setFeil("Feil e-post eller passord. Prøv igjen.");
        }
      }
    } catch (err) {
      setFeil("Nettverksfeil. Prøv igjen.");
    } finally {
      setLaster(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F2A5A] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🌊</div>
          <h1 className="text-2xl font-semibold text-[#0F2A5A] mb-1">Tideron</h1>
          <p className="text-slate-400 text-sm">Logg inn for å fortsette</p>
        </div>

        <form onSubmit={loggInn} className="space-y-4">
          {feil && (
            <div className="rounded-lg px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200">
              {feil}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              E-postadresse
            </label>
            <input
              type="email"
              autoComplete="email"
              value={epost}
              onChange={e => setEpost(e.target.value)}
              placeholder="din@epost.com"
              required
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 focus:border-[#0F2A5A]/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Passord
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={passord}
              onChange={e => setPassord(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 focus:border-[#0F2A5A]/40"
            />
          </div>

          <button
            type="submit"
            disabled={laster || !epost || !passord}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: "#0F2A5A" }}
          >
            {laster ? "Logger inn…" : "Logg inn"}
          </button>
        </form>

        <p className="text-xs text-slate-300 text-center mt-6">
          Kun for Tideron-ansatte og inviterte samarbeidspartnere
        </p>
      </div>
    </div>
  );
}
