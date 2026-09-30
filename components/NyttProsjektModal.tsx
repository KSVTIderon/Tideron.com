"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import Modal from "@/components/Modal";
import LandVelger from "@/components/LandVelger";
import ValutaVelger from "@/components/ValutaVelger";
import { createClient } from "@/lib/supabase/client";
import { finnLand } from "@/lib/land";

const PosisjonKart = dynamic(() => import("@/components/PosisjonKart"), { ssr: false });

const STADIER = ["Prospektering","Forhandsutredning","Godkjent","Pilot","Utbygging","Ferdig utbygd"];
const STREAM_TYPER = ["tidevann","elv","havstrøm"];

interface GeoResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: { country_code?: string };
}

export default function NyttProsjektModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [visKart, setVisKart] = useState(false);
  const [paraplyer, setParaplyer] = useState<{ id: string; navn: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    const sb = createClient();
    sb.from("projects")
      .select("id,navn,parent_project_id")
      .order("navn")
      .then(({ data }) => {
        // Kun frittstående prosjekter kan være paraply (ikke selv barn)
        setParaplyer((data ?? []).filter((p: any) => !p.parent_project_id));
      });
  }, [open]);

  // Place search
  const [stedSok, setStedSok]         = useState("");
  const [geoResultater, setGeoResultater] = useState<GeoResult[]>([]);
  const [sokLoading, setSokLoading]   = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sokSteder = useCallback((q: string) => {
    setStedSok(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim() || q.length < 2) { setGeoResultater([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSokLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`,
          { headers: { "User-Agent": "Tideron/1.0 (ksv@tideron.com)" } }
        );
        if (res.ok) setGeoResultater(await res.json());
      } catch { /* ignore */ }
      finally { setSokLoading(false); }
    }, 350);
  }, []);

  const velgGeoResultat = (r: GeoResult) => {
    const cc = (r.address?.country_code ?? "NO").toUpperCase();
    const land = finnLand(cc);
    const kortNavn = r.display_name.split(",").slice(0, 2).join(",").trim();
    setForm(prev => ({
      ...prev,
      sted: kortNavn,
      lat:  parseFloat(r.lat).toFixed(6),
      lon:  parseFloat(r.lon).toFixed(6),
      country_code: cc,
      currency_code: land?.currency_code ?? prev.currency_code,
    }));
    setStedSok(kortNavn);
    setGeoResultater([]);
  };

  const [form, setForm] = useState({
    navn: "", sted: "", lat: "", lon: "",
    stadie: "Prospektering",
    country_code: "NO",
    currency_code: "NOK",
    stream_type: "tidevann",
    peak_velocity: "", avg_velocity: "",
    parent_project_id: "",
  });

  const set = (k: string, v: string) => {
    const next = { ...form, [k]: v };
    // Auto-update currency when country changes (unless user already overrode it manually)
    if (k === "country_code") {
      const land = finnLand(v);
      if (land) next.currency_code = land.currency_code;
    }
    if (k === "peak_velocity") {
      const peak = parseFloat(v);
      if (next.stream_type === "tidevann") {
        next.avg_velocity = isNaN(peak) ? "" : (peak * 0.637).toFixed(3);
      }
    }
    if (k === "stream_type" && v !== "tidevann") {
      next.avg_velocity = "";
    }
    setForm(next);
  };

  const onKartKlikk = (lat: number, lon: number) => {
    setForm(prev => ({
      ...prev,
      lat: lat.toFixed(6),
      lon: lon.toFixed(6),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();

    const { data: prosjekt, error: pErr } = await supabase
      .from("projects")
      .insert({
        navn: form.navn,
        sted: form.sted,
        lat: form.lat ? parseFloat(form.lat) : null,
        lon: form.lon ? parseFloat(form.lon) : null,
        stadie: form.stadie,
        country_code: form.country_code,
        currency_code: form.currency_code,
        created_by: session?.user?.email ?? null,
        parent_project_id: form.parent_project_id || null,
      })
      .select("id")
      .single();

    if (pErr || !prosjekt) { alert("Feil: " + pErr?.message); setLoading(false); return; }

    if (form.peak_velocity || form.avg_velocity) {
      await supabase.from("streams").insert({
        project_id: prosjekt.id,
        stream_type: form.stream_type,
        peak_velocity_m_s: form.peak_velocity ? parseFloat(form.peak_velocity) : null,
        avg_velocity_m_s: form.avg_velocity ? parseFloat(form.avg_velocity) : null,
      });
    }

    onClose();
    router.push(`/prosjekter/${prosjekt.id}`);
    router.refresh();
  };

  const parsedLat = form.lat ? parseFloat(form.lat) : null;
  const parsedLon = form.lon ? parseFloat(form.lon) : null;

  return (
    <Modal open={open} onClose={onClose} title="Nytt prosjekt">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Prosjektnavn *</label>
            <input required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={form.navn} onChange={e => set("navn", e.target.value)} placeholder="f.eks. Akselsundet Pilot" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Sted</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={form.sted} onChange={e => set("sted", e.target.value)} placeholder="f.eks. Akselsundet, Nordland" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Land</label>
            <LandVelger value={form.country_code} onChange={v => set("country_code", v)} className="w-full" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Valuta</label>
            <ValutaVelger value={form.currency_code} onChange={v => set("currency_code", v)} className="w-full" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Stadie</label>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={form.stadie} onChange={e => set("stadie", e.target.value)}>
              {STADIER.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Paraplyprosjekt</label>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={form.parent_project_id}
              onChange={e => set("parent_project_id", e.target.value)}
            >
              <option value="">— Frittstående prosjekt —</option>
              {paraplyer.map(p => (
                <option key={p.id} value={p.id}>{p.navn}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Posisjon */}
        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-400 uppercase tracking-wider">Posisjon</p>
            <button
              type="button"
              onClick={() => setVisKart(v => !v)}
              className="text-xs text-[#0F2A5A] hover:underline"
            >
              {visKart ? "Skjul kart" : "Velg pa kart"}
            </button>
          </div>

          {/* Place search */}
          <div className="relative mb-3">
            <label className="block text-xs text-slate-400 mb-1">Søk på stedsnavn</label>
            <div className="relative">
              <input
                type="text"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 pr-8"
                value={stedSok}
                onChange={e => sokSteder(e.target.value)}
                placeholder="f.eks. Akselsundet, Faroe Islands, Skien…"
                autoComplete="off"
              />
              {sokLoading && (
                <svg className="absolute right-2.5 top-2.5 w-4 h-4 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10"/>
                </svg>
              )}
            </div>
            {geoResultater.length > 0 && (
              <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden text-sm">
                {geoResultater.map(r => (
                  <li key={r.place_id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0 text-slate-800 truncate"
                      onClick={() => velgGeoResultat(r)}
                    >
                      {r.display_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {visKart && (
            <div className="mb-3 rounded-xl overflow-hidden border border-slate-200">
              <PosisjonKart
                lat={parsedLat}
                lon={parsedLon}
                onChange={onKartKlikk}
                height="240px"
              />
              <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
                Klikk pa kartet for a sette posisjon — marker kan dras
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Lat</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                value={form.lat} onChange={e => set("lat", e.target.value)} placeholder="68.1234" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Lon</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                value={form.lon} onChange={e => set("lon", e.target.value)} placeholder="14.5678" />
            </div>
          </div>
        </div>

        {/* Strom */}
        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">Strominformasjon</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Type</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                value={form.stream_type} onChange={e => set("stream_type", e.target.value)}>
                {STREAM_TYPER.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {form.stream_type === "tidevann" ? "Topphastighet (m/s)" : "Gjennomsnitt (m/s)"}
              </label>
              <input type="number" step="0.01" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                value={form.stream_type === "tidevann" ? form.peak_velocity : form.avg_velocity}
                onChange={e => set(form.stream_type === "tidevann" ? "peak_velocity" : "avg_velocity", e.target.value)}
                placeholder="0.00" />
            </div>
            {form.stream_type === "tidevann" && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Avg (peak × 0.637)</label>
                <input readOnly className="w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-400"
                  value={form.avg_velocity} placeholder="Auto" />
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Avbryt</button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Oppretter..." : "Opprett prosjekt"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
