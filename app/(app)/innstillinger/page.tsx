"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function BrukerInnstillingerPage() {
  const { data: session } = useSession();
  const supabase = createClient();
  const [profil, setProfil] = useState<any>(null);
  const [lagrer, setLagrer] = useState(false);
  const [lagret, setLagret] = useState(false);

  useEffect(() => {
    const userId = (session?.user as { id?: string })?.id;
    if (!userId) return;
    supabase.from("profiles").select("*").eq("id", userId).single()
      .then(({ data }) => { if (data) setProfil(data); });
  }, [session]);

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    setLagrer(true);
    const userId = (session?.user as { id?: string })?.id;
    await supabase.from("profiles").upsert({ id: userId, navn: profil.navn, varsler_epost: profil.varsler_epost });
    setLagrer(false);
    setLagret(true);
    setTimeout(() => setLagret(false), 2500);
  };

  const navn = session?.user?.name ?? "Bruker";
  const epost = session?.user?.email ?? "";
  const initial = navn.charAt(0).toUpperCase();

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Brukerinnstillinger</h1>
        <p className="text-slate-500 text-sm mt-1">Administrer din profil og varslingsinnstillinger</p>
      </div>

      {/* Profilkort */}
      <div className="card p-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-[#0F2A5A] flex items-center justify-center text-white text-xl font-semibold">
          {initial}
        </div>
        <div>
          <p className="font-semibold text-slate-900">{navn}</p>
          <p className="text-slate-500 text-sm">{epost}</p>
          <p className="text-xs text-slate-400 mt-0.5">Innlogget med e-post og passord</p>
        </div>
      </div>

      {profil !== null && (
        <form onSubmit={lagre} className="card p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Visningsnavn</h2>
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Navn i appen</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={profil.navn ?? ""} onChange={e => setProfil((p: any) => ({ ...p, navn: e.target.value }))}
              placeholder={navn} />
            <p className="text-xs text-slate-400 mt-1">Vises i oppgavetildelinger og kommentarer</p>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h2 className="font-semibold text-slate-900 mb-3">Varslinger</h2>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox"
                checked={profil.varsler_epost ?? true}
                onChange={e => setProfil((p: any) => ({ ...p, varsler_epost: e.target.checked }))}
                className="w-4 h-4 rounded accent-[#0F2A5A]" />
              <div>
                <p className="text-sm font-medium text-slate-900">E-postvarsler for oppgaver</p>
                <p className="text-xs text-slate-400">Motta e-post nar du blir tildelt en oppgave</p>
              </div>
            </label>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={lagrer} className="btn-primary">
              {lagrer ? "Lagrer..." : "Lagre"}
            </button>
            {lagret && <span className="text-sm text-green-600">Lagret!</span>}
          </div>
        </form>
      )}

      <div className="card p-6 flex items-center justify-between">
        <div>
          <p className="font-semibold text-slate-900">Logg ut</p>
          <p className="text-sm text-slate-400">Avslutt økten din</p>
        </div>
        <Link href="/planner/api/logg-ut"
          className="btn-secondary text-red-500 border-red-200 hover:bg-red-50">
          Logg ut
        </Link>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-slate-900 mb-3">Om plattformen</h2>
        <dl className="text-sm space-y-2">
          {[
            { k: "Versjon", v: "1.0.0" },
            { k: "Miljo", v: "Production" },
            { k: "Support", v: "ksv@tideron.com" },
          ].map(({ k, v }) => (
            <div key={k} className="flex justify-between">
              <dt className="text-slate-400">{k}</dt>
              <dd className="text-slate-700">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
