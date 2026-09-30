"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import NyttProsjektModal from "@/components/NyttProsjektModal";

const STADIER_COLOR: Record<string, string> = {
  "Prospektering":     "bg-slate-100 text-slate-600",
  "Forhandsutredning": "bg-blue-50 text-blue-700",
  "Godkjent":          "bg-teal-50 text-teal-700",
  "Pilot":             "bg-amber-50 text-amber-700",
  "Utbygging":         "bg-orange-50 text-orange-700",
  "Ferdig utbygd":     "bg-green-50 text-green-700",
};

// Knapp for nytt prosjekt (brukes i PageHeader)
export default function NyttProsjektKnapp() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary">+ Nytt prosjekt</button>
      <NyttProsjektModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

type Prosjekt = { id: string; navn: string; sted: string | null; stadie: string };

interface SlettBobbelProps {
  onAvbryt: () => void;
  onBekreft: () => void;
  laster: boolean;
}

function SlettBobbel({ onAvbryt, onBekreft, laster }: SlettBobbelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onAvbryt();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [onAvbryt]);

  return (
    <div ref={ref}
      className="absolute right-8 top-1/2 -translate-y-1/2 z-20 bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 whitespace-nowrap"
      onClick={e => e.stopPropagation()}>
      <span className="text-sm text-slate-700">Slette prosjektet?</span>
      <button onClick={onAvbryt}
        className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5">
        Avbryt
      </button>
      <button onClick={onBekreft} disabled={laster}
        className="text-xs text-white bg-red-500 hover:bg-red-600 rounded-lg px-2.5 py-1.5 font-medium">
        {laster ? "Sletter..." : "Ja, slett"}
      </button>
    </div>
  );
}

// Prosjektliste med slett-funksjon (brukes i page.tsx)
export function ProsjektListeClient({ prosjekter: init }: { prosjekter: Prosjekt[] }) {
  const router = useRouter();
  const [prosjekter, setProsjekter] = useState<Prosjekt[]>(init);
  const [slettId, setSlettId]       = useState<string | null>(null);
  const [sletter, setSletter]       = useState(false);

  const slettProsjekt = async (id: string) => {
    setSletter(true);
    const sb = createClient();
    // Slett relaterte tabeller forst
    await Promise.allSettled([
      sb.from("rotors").delete().eq("project_id", id),
      sb.from("streams").delete().eq("project_id", id),
      sb.from("battery_packs").delete().eq("project_id", id),
      sb.from("project_invites").delete().eq("project_id", id),
      sb.from("utstyr_tilgang").delete().eq("project_id", id),
    ]);
    // Slett selve prosjektet
    const { error } = await sb.from("projects").delete().eq("id", id);
    setSletter(false);
    if (error) { alert("Feil: " + error.message); return; }
    setProsjekter(prev => prev.filter(p => p.id !== id));
    setSlettId(null);
    router.refresh();
  };

  if (prosjekter.length === 0) {
    return (
      <div className="p-12 text-center text-slate-400">
        <p className="text-3xl mb-3">⚡</p>
        <p className="font-medium text-slate-600 mb-1">Ingen prosjekter enna</p>
        <p className="text-sm">Klikk &quot;+ Nytt prosjekt&quot; for a komme i gang</p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 border-b border-slate-200">
        <tr>
          <th className="text-left px-4 py-3 text-slate-500 font-medium">Prosjekt</th>
          <th className="text-left px-4 py-3 text-slate-500 font-medium">Sted</th>
          <th className="text-left px-4 py-3 text-slate-500 font-medium">Stadie</th>
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {prosjekter.map(p => (
          <tr key={p.id} className="hover:bg-slate-50 transition-colors group relative">
            <td className="px-4 py-3">
              <Link href={`/prosjekter/${p.id}`} className="font-medium text-[#0F2A5A] hover:underline">
                {p.navn}
              </Link>
            </td>
            <td className="px-4 py-3 text-slate-500">{p.sted}</td>
            <td className="px-4 py-3">
              <span className={`badge ${STADIER_COLOR[p.stadie] ?? "bg-slate-100 text-slate-600"}`}>
                {p.stadie}
              </span>
            </td>
            <td className="px-4 py-3 text-right relative">
              {slettId === p.id ? (
                <SlettBobbel
                  onAvbryt={() => setSlettId(null)}
                  onBekreft={() => slettProsjekt(p.id)}
                  laster={sletter}
                />
              ) : (
                <button
                  onClick={() => setSlettId(p.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-400 p-1 rounded"
                  title="Slett prosjekt"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <path d="M5.5 1h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1 0-1zM2 3h10v1H2V3zm1.5 1.5 .5 8h6l.5-8H3.5zm2 1 .5 5.5h1l.5-5.5h-2z"/>
                  </svg>
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
