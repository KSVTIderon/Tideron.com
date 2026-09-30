"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fmtKw, fmtKwh } from "@/lib/units";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  beregnArligKwh, beregnContainerCapex, nominalKwFraAreal,
  rhoFraVanntype, summerRotorEffektKw, summerRotorArealM2, sjekkFysiskTak,
} from "@/lib/finans";
import { LAND } from "@/lib/land";
import NyttProsjektModal from "@/components/NyttProsjektModal";

const TideronKart = dynamic(() => import("@/components/TideronKart"), { ssr: false });

const KR_PER_KW = 50000;
const STADIE_FARGE: Record<string, string> = {
  "Prospektering":     "bg-slate-100 text-slate-600",
  "Forhandsutredning": "bg-blue-50 text-blue-700",
  "Godkjent":          "bg-teal-50 text-teal-700",
  "Pilot":             "bg-indigo-50 text-indigo-700",
  "Utbygging":         "bg-amber-50 text-amber-700",
  "Ferdig utbygd":     "bg-green-50 text-green-700",
};
const STADIER = Object.keys(STADIE_FARGE);
const AKTIVE_STADIER = ["Pilot", "Utbygging", "Ferdig utbygd"];

type ProsjektRad = {
  id: string; navn: string; sted: string; stadie: string;
  totalKw: number; arligKwh: number; capex: number;
  lat?: number | null; lon?: number | null;
  overBetz?: boolean; overBlokkering?: boolean;
  parentId?: string | null;
  createdBy?: string | null;
  inviterte?: string[];
  countryCode?: string | null;
};

const LAND_INFO: Record<string, { navn: string; flagg: string }> = {
  NO: { navn: "Norge",        flagg: "🇳🇴" },
  SE: { navn: "Sverige",      flagg: "🇸🇪" },
  DK: { navn: "Danmark",      flagg: "🇩🇰" },
  FI: { navn: "Finland",      flagg: "🇫🇮" },
  IS: { navn: "Island",       flagg: "🇮🇸" },
  GB: { navn: "Storbritannia",flagg: "🇬🇧" },
  DE: { navn: "Tyskland",     flagg: "🇩🇪" },
  FR: { navn: "Frankrike",    flagg: "🇫🇷" },
  ES: { navn: "Spania",       flagg: "🇪🇸" },
  PT: { navn: "Portugal",     flagg: "🇵🇹" },
  IT: { navn: "Italia",       flagg: "🇮🇹" },
  NL: { navn: "Nederland",    flagg: "🇳🇱" },
  BE: { navn: "Belgia",       flagg: "🇧🇪" },
  PL: { navn: "Polen",        flagg: "🇵🇱" },
  IE: { navn: "Irland",       flagg: "🇮🇪" },
  UA: { navn: "Ukraina",      flagg: "🇺🇦" },
  RO: { navn: "Romania",      flagg: "🇷🇴" },
  HR: { navn: "Kroatia",      flagg: "🇭🇷" },
  TR: { navn: "Tyrkia",       flagg: "🇹🇷" },
  US: { navn: "USA",          flagg: "🇺🇸" },
  CA: { navn: "Canada",       flagg: "🇨🇦" },
  AU: { navn: "Australia",    flagg: "🇦🇺" },
  NZ: { navn: "New Zealand",  flagg: "🇳🇿" },
  PH: { navn: "Filippinene",  flagg: "🇵🇭" },
  ID: { navn: "Indonesia",    flagg: "🇮🇩" },
  GH: { navn: "Ghana",        flagg: "🇬🇭" },
  NG: { navn: "Nigeria",      flagg: "🇳🇬" },
  KE: { navn: "Kenya",        flagg: "🇰🇪" },
  TZ: { navn: "Tanzania",     flagg: "🇹🇿" },
  ZA: { navn: "Sør-Afrika",   flagg: "🇿🇦" },
  CO: { navn: "Colombia",     flagg: "🇨🇴" },
  PE: { navn: "Peru",         flagg: "🇵🇪" },
};

function landLabel(code: string | null | undefined) {
  if (!code) return { navn: "Ikke spesifisert", flagg: "🌍" };
  return LAND_INFO[code.toUpperCase()] ?? { navn: code.toUpperCase(), flagg: "🌍" };
}

function eksporterCsv(rader: ProsjektRad[]) {
  const header = ["Prosjekt", "Sted", "Stadie", "Effekt (kW)", "Produksjon (kWh/ar)", "CAPEX (kr)"];
  const rows = rader.map(r => [
    r.navn, r.sted, r.stadie,
    r.totalKw > 0 ? r.totalKw.toFixed(1) : "",
    r.arligKwh > 0 ? Math.round(r.arligKwh) : "",
    r.capex > 0 ? Math.round(r.capex) : "",
  ]);
  const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "tideron-prosjekter.csv"; a.click();
  URL.revokeObjectURL(url);
}

function SlettBobbel({ onAvbryt, onBekreft, laster }: { onAvbryt: () => void; onBekreft: () => void; laster: boolean }) {
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
      <button onClick={onAvbryt} className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5">
        Avbryt
      </button>
      <button onClick={onBekreft} disabled={laster} className="text-xs text-white bg-red-500 hover:bg-red-600 rounded-lg px-2.5 py-1.5 font-medium">
        {laster ? "Sletter..." : "Ja, slett"}
      </button>
    </div>
  );
}

type SortKol = "navn" | "stadie" | "totalKw" | "arligKwh" | "capex";
const STADIE_ORDEN: Record<string, number> = Object.fromEntries(STADIER.map((s, i) => [s, i]));

function sorterRader(rader: ProsjektRad[], kol: SortKol, retning: "asc" | "desc"): ProsjektRad[] {
  return [...rader].sort((a, b) => {
    let diff = 0;
    if (kol === "navn")      diff = a.navn.localeCompare(b.navn, "nb");
    else if (kol === "stadie") diff = (STADIE_ORDEN[a.stadie] ?? 99) - (STADIE_ORDEN[b.stadie] ?? 99);
    else                       diff = (a[kol] as number) - (b[kol] as number);
    return retning === "asc" ? diff : -diff;
  });
}

type RisikoNivå = "Høy" | "Middels" | "Lav";
function risikoVurdering(r: ProsjektRad): { nivå: RisikoNivå; årsaker: string[] } {
  const årsaker: string[] = [];
  let score = 0;
  if (r.overBetz)        { årsaker.push("Overskrider Betz-grensen"); score += 60; }
  if (r.overBlokkering)  { årsaker.push("Høy blokkering"); score += 30; }
  const stadeScore: Record<string, number> = {
    "Prospektering": 40, "Forhandsutredning": 25, "Godkjent": 15,
    "Pilot": 10, "Utbygging": 5, "Ferdig utbygd": 0,
  };
  score += stadeScore[r.stadie] ?? 30;
  if (r.totalKw === 0)   { årsaker.push("Ingen rotorer konfigurert"); score += 20; }
  if (!r.lat || !r.lon)  { årsaker.push("Mangler GPS"); score += 10; }
  if (r.stadie === "Prospektering")     årsaker.push("Tidlig fase");
  else if (r.stadie === "Forhandsutredning") årsaker.push("Under utredning");
  const nivå: RisikoNivå = score >= 60 ? "Høy" : score >= 30 ? "Middels" : "Lav";
  return { nivå, årsaker };
}
const RISIKO_STIL: Record<RisikoNivå, string> = {
  "Høy":     "bg-red-50 text-red-700",
  "Middels": "bg-amber-50 text-amber-700",
  "Lav":     "bg-green-50 text-green-700",
};

export default function ProsjekterPage() {
  const supabase = createClient();
  const router = useRouter();
  const [rader, setRader] = useState<ProsjektRad[]>([]);
  const [laster, setLaster] = useState(true);
  const [aktivId, setAktivId] = useState<string | null>(null);
  const [slettId, setSlettId] = useState<string | null>(null);
  const [sletter, setSletter] = useState(false);
  const [nyttOpen, setNyttOpen] = useState(false);
  const [sortKol, setSortKol] = useState<SortKol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [utvidetForeldreIds, setUtvidetForeldreIds] = useState<Set<string>>(new Set());
  const [kollapsetLand, setKollapsetLand] = useState<Set<string>>(new Set());
  const [søkeTekst, setSøkeTekst] = useState("");
  const [filterLand, setFilterLand] = useState<string>(""); // "" = alle
  const [filterStadie, setFilterStadie] = useState<string>(""); // "" = alle
  const [landSøk, setLandSøk] = useState("");
  const [landDropdownÅpen, setLandDropdownÅpen] = useState(false);
  const landDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (landDropdownRef.current && !landDropdownRef.current.contains(e.target as Node))
        setLandDropdownÅpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const toggleLand = (kode: string) => {
    setKollapsetLand(prev => {
      const neste = new Set(prev);
      neste.has(kode) ? neste.delete(kode) : neste.add(kode);
      return neste;
    });
  };
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const toggleForelder = (id: string) => {
    setUtvidetForeldreIds(prev => {
      const neste = new Set(prev);
      neste.has(id) ? neste.delete(id) : neste.add(id);
      return neste;
    });
  };

  const toggleSort = (kol: SortKol) => {
    if (sortKol === kol) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKol(kol); setSortDir("asc"); }
  };

  const hent = useCallback(async () => {
    const [{ data: prosjekter }, { data: alleRotorer }, { data: alleStreams }, { data: alleInvites }] = await Promise.all([
      supabase.from("projects").select("id,navn,sted,stadie,lat,lon,vann_type,elv_bredde_m,elv_dybde_m,blokkering_pst,parent_project_id,created_by,country_code").order("created_at"),
      supabase.from("rotors").select("project_id,modell,diameter_m,lengde_m,hoyde_m,nominell_kw_1_8,hastighet_m_s"),
      supabase.from("streams").select("project_id,stream_type,avg_velocity_m_s"),
      supabase.from("project_invites").select("project_id,email,status"),
    ]);

    const beregnet: ProsjektRad[] = (prosjekter ?? []).map((p: any) => {
      const rotorer = (alleRotorer ?? []).filter((r: any) => r.project_id === p.id);
      const stream  = (alleStreams  ?? []).find((s: any) => s.project_id === p.id);
      const avgV    = stream?.avg_velocity_m_s ?? 0;
      const sType   = stream?.stream_type ?? "tidevann";
      const rho     = rhoFraVanntype(p.vann_type);
      const totalKw = summerRotorEffektKw(rotorer, avgV, rho);
      const fysiskTak = sjekkFysiskTak(
        totalKw, rho, p.elv_bredde_m, p.elv_dybde_m, avgV,
        summerRotorArealM2(rotorer), p.blokkering_pst ?? 20
      );
      const arligKwh   = totalKw > 0 ? beregnArligKwh(totalKw, sType) : 0;
      const antall     = rotorer.length;
      const rotorCapex = rotorer.reduce((s: number, r: any) => {
        const kw = r.nominell_kw_1_8 ?? (r.lengde_m && r.hoyde_m ? nominalKwFraAreal(r.lengde_m * r.hoyde_m) : 0);
        return s + (kw > 0 ? kw * KR_PER_KW : KR_PER_KW * 5);
      }, 0);
      const capex = antall > 0 ? rotorCapex + beregnContainerCapex(antall) + 120000 + 200000 : 0;
      return {
        id: p.id, navn: p.navn, sted: p.sted ?? "", stadie: p.stadie, totalKw, arligKwh, capex,
        lat: p.lat, lon: p.lon,
        overBetz: fysiskTak?.overBetz ?? false, overBlokkering: fysiskTak?.overBlokkering ?? false,
        parentId: p.parent_project_id ?? null,
        createdBy: p.created_by ?? null,
        inviterte: (alleInvites ?? []).filter((i: any) => i.project_id === p.id).map((i: any) => i.email),
        countryCode: p.country_code ?? null,
      };
    });

    setRader(beregnet);
    setLaster(false);
  }, []);

  useEffect(() => { hent(); }, [hent]);

  useEffect(() => {
    if (!aktivId) return;
    rowRefs.current[aktivId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [aktivId]);

  const slettProsjekt = async (id: string) => {
    setSletter(true);
    await Promise.allSettled([
      supabase.from("rotors").delete().eq("project_id", id),
      supabase.from("streams").delete().eq("project_id", id),
      supabase.from("battery_packs").delete().eq("project_id", id),
      supabase.from("project_invites").delete().eq("project_id", id),
      supabase.from("utstyr_tilgang").delete().eq("project_id", id),
    ]);
    const { error } = await supabase.from("projects").delete().eq("id", id);
    setSletter(false);
    if (error) { alert("Feil: " + error.message); return; }
    setRader(prev => prev.filter(r => r.id !== id));
    setSlettId(null);
    router.refresh();
  };

  const baseSortet = (() => {
    const sortert = sortKol ? sorterRader(rader, sortKol, sortDir) : rader;
    return sortert.filter(r => {
      if (filterLand && r.countryCode !== filterLand) return false;
      if (filterStadie && r.stadie !== filterStadie) return false;
      if (søkeTekst.trim()) {
        const q = søkeTekst.trim().toLowerCase();
        return (
          r.navn?.toLowerCase().includes(q) ||
          r.sted?.toLowerCase().includes(q) ||
          r.stadie?.toLowerCase().includes(q) ||
          r.countryCode?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  })();

  // Bygg barn-map
  const barnMap = new Map<string, ProsjektRad[]>();
  baseSortet.forEach(r => {
    if (r.parentId) {
      if (!barnMap.has(r.parentId)) barnMap.set(r.parentId, []);
      barnMap.get(r.parentId)!.push(r);
    }
  });

  // Aggreger barnenes tall inn i paraplyraden
  const aggregerRad = (r: ProsjektRad): ProsjektRad => {
    const barn = barnMap.get(r.id) ?? [];
    if (barn.length === 0) return r;
    return {
      ...r,
      totalKw:  r.totalKw  + barn.reduce((s, b) => s + b.totalKw,  0),
      arligKwh: r.arligKwh + barn.reduce((s, b) => s + b.arligKwh, 0),
      capex:    r.capex    + barn.reduce((s, b) => s + b.capex,    0),
    };
  };

  // Grupper rotnivå-prosjekter (ingen forelder) per land
  const rotRader = baseSortet.filter(r => !r.parentId);
  const landRekkefølge: string[] = [];
  const landGruppe = new Map<string, ProsjektRad[]>();
  rotRader.forEach(r => {
    const kode = r.countryCode ?? "__ukjent__";
    if (!landGruppe.has(kode)) { landGruppe.set(kode, []); landRekkefølge.push(kode); }
    landGruppe.get(kode)!.push(r);
  });

  // Bygg synlige rader: landheader → paraply/standalone → barn
  type SynligRad = (ProsjektRad & { erBarn?: boolean }) | { erLandHeader: true; kode: string };
  const synligeRader: SynligRad[] = [];

  for (const kode of landRekkefølge) {
    const gruppe = landGruppe.get(kode)!;
    // Vis alltid landheader når det finnes minst én gruppe
    synligeRader.push({ erLandHeader: true, kode });
    if (!kollapsetLand.has(kode)) {
      gruppe.forEach(r => {
        synligeRader.push(aggregerRad(r));
        if (utvidetForeldreIds.has(r.id)) {
          (barnMap.get(r.id) ?? []).forEach(b => synligeRader.push({ ...b, erBarn: true }));
        }
      });
    }
  }

  // Prosjekter med ugyldig parentId (forelder slettet) sist
  baseSortet.forEach(r => {
    if (r.parentId && !rader.find(p => p.id === r.parentId)) {
      synligeRader.push({ ...r, erBarn: false });
    }
  });
  const totalKw    = rader.reduce((s, r) => s + r.totalKw, 0);
  const totalKwh   = rader.reduce((s, r) => s + r.arligKwh, 0);
  const totalCapex = rader.reduce((s, r) => s + r.capex, 0);
  const aktive     = rader.filter(r => AKTIVE_STADIER.includes(r.stadie)).length;
  const nok = (v: number) => Math.round(v).toLocaleString("nb-NO");

  const kartPunkter = rader
    .filter(r => r.lat && r.lon)
    .map(r => ({
      id: r.id, navn: r.navn,
      lat: r.lat as number, lon: r.lon as number,
      type: (AKTIVE_STADIER.includes(r.stadie) ? "aktivt" : "planlagt") as "aktivt" | "planlagt",
    }));

  if (laster) return <div className="text-slate-400 text-sm">Laster...</div>;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
      <NyttProsjektModal open={nyttOpen} onClose={() => { setNyttOpen(false); hent(); }} />

      {/* Header + KPI + badges — fast høyde */}
      <div className="flex-none space-y-3 mb-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Prosjekter</h1>
            <p className="text-slate-500 text-sm mt-0.5">Oversikt over alle hydrokinetiske kraftprosjekter</p>
          </div>
          <div className="flex gap-2">
            {rader.length > 0 && (
              <button onClick={() => eksporterCsv(rader)} className="btn-secondary text-sm">
                Eksporter CSV
              </button>
            )}
            <button onClick={() => setNyttOpen(true)} className="btn-primary text-sm">
              + Nytt prosjekt
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Totalt antall",  value: rader.length.toString() },
            { label: "Aktive",         value: aktive.toString() },
            { label: "Samlet effekt",  value: totalKw > 0 ? fmtKw(totalKw) : "—" },
            { label: "Produksjon/år",  value: totalKwh > 0 ? fmtKwh(totalKwh) : "—" },
          ].map(k => (
            <div key={k.label} className="card p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
              <p className="text-base sm:text-xl font-semibold text-slate-900">{k.value}</p>
            </div>
          ))}
        </div>

        {/* Søk + filtre */}
        <div className="flex flex-wrap gap-2">
          {/* Søkefelt */}
          <div className="relative flex-1 min-w-[180px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
            <input
              type="search"
              placeholder="Søk på navn eller sted…"
              value={søkeTekst}
              onChange={e => setSøkeTekst(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 focus:border-[#0F2A5A]/40 placeholder-slate-300"
            />
            {søkeTekst && (
              <button onClick={() => setSøkeTekst("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg leading-none">×</button>
            )}
          </div>
          {/* Land-filter — søkbar kombobox */}
          {(() => {
            const tilgjengeligeLand = [...LAND]
              .sort((a, b) => a.name.localeCompare(b.name, "nb"))
              .map(l => ({ kode: l.code, navn: l.name, flagg: l.flag }));
            const filtrerteLand = landSøk.trim()
              ? tilgjengeligeLand.filter(l =>
                  l.navn.toLowerCase().includes(landSøk.toLowerCase()) ||
                  l.kode.toLowerCase().includes(landSøk.toLowerCase())
                )
              : tilgjengeligeLand;
            const valgtLabel = filterLand ? landLabel(filterLand) : null;
            return (
              <div className="relative" ref={landDropdownRef}>
                <button
                  type="button"
                  onClick={() => { setLandDropdownÅpen(v => !v); setLandSøk(""); }}
                  className="flex items-center gap-1.5 py-2 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 text-slate-600 min-w-[130px]"
                >
                  <span>{valgtLabel ? `${valgtLabel.flagg} ${valgtLabel.navn}` : "🌍 Alle land"}</span>
                  <span className="ml-auto text-slate-300 text-xs">▾</span>
                </button>
                {landDropdownÅpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg w-56 overflow-hidden">
                    <div className="p-2 border-b border-slate-100">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Søk land…"
                        value={landSøk}
                        onChange={e => setLandSøk(e.target.value)}
                        className="w-full text-sm px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      <button
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${!filterLand ? "font-semibold text-[#0F2A5A]" : "text-slate-600"}`}
                        onClick={() => { setFilterLand(""); setLandDropdownÅpen(false); setLandSøk(""); }}
                      >
                        🌍 Alle land
                      </button>
                      {filtrerteLand.map(l => (
                        <button
                          key={l.kode}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${filterLand === l.kode ? "font-semibold text-[#0F2A5A] bg-[#0F2A5A]/5" : "text-slate-600"}`}
                          onClick={() => { setFilterLand(l.kode); setLandDropdownÅpen(false); setLandSøk(""); }}
                        >
                          {l.flagg} {l.navn}
                        </button>
                      ))}
                      {filtrerteLand.length === 0 && (
                        <div className="px-3 py-4 text-xs text-slate-400 text-center">Ingen treff</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {/* Stadie-filter */}
          <select
            value={filterStadie}
            onChange={e => setFilterStadie(e.target.value)}
            className="py-2 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 text-slate-600">
            <option value="">📋 Alle stadier</option>
            {STADIER.filter(s => rader.some(r => r.stadie === s)).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {/* Nullstill filtre */}
          {(filterLand || filterStadie || søkeTekst) && (
            <button
              onClick={() => { setFilterLand(""); setFilterStadie(""); setSøkeTekst(""); }}
              className="py-2 px-3 text-sm text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg bg-white">
              ✕ Nullstill
            </button>
          )}
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          {STADIER.map(s => {
            const n = (søkeTekst ? baseSortet : rader).filter(r => r.stadie === s).length;
            if (n === 0) return null;
            return <span key={s} className={`badge text-xs ${STADIE_FARGE[s]}`}>{s} ({n})</span>;
          })}
          {kartPunkter.length > 0 && (
            <span className="ml-auto text-xs text-slate-400">{kartPunkter.length}/{rader.length} har GPS</span>
          )}
        </div>
      </div>

      {/* Kart + tabell — fyller resten av skjermen */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2 gap-4">

        {kartPunkter.length > 0 ? (
          <div className="card overflow-hidden flex flex-col min-h-0">
            <div className="flex-none px-4 py-3 border-b border-slate-100 text-sm font-medium text-slate-700">
              Kartoversikt
              <span className="text-slate-400 font-normal ml-2">— klikk et punkt for å velge</span>
            </div>
            <div className="flex-1 min-h-0">
              <TideronKart
                punkter={kartPunkter}
                height="100%"
                aktivPunktId={aktivId}
                onMarkerClick={(id) => setAktivId(prev => prev === id ? null : id)}
              />
            </div>
          </div>
        ) : (
          <div className="card flex items-center justify-center text-slate-400 text-sm">
            <div className="text-center">
              <p className="font-medium text-slate-600 mb-1">Ingen kartkoordinater</p>
              <p>Legg til lat/lon i Innstillinger for hvert prosjekt</p>
            </div>
          </div>
        )}

        <div className="card overflow-hidden flex flex-col min-h-0">
          {rader.length > 0 ? (
            <div className="flex-1 overflow-auto min-h-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    {([
                      { kol: "navn"     as SortKol, label: "Prosjekt",  align: "left"  },
                      { kol: "stadie"   as SortKol, label: "Stadie",    align: "left"  },
                      { kol: "totalKw"  as SortKol, label: "Effekt",    align: "right" },
                      { kol: "arligKwh" as SortKol, label: "Prod./år",  align: "right" },
                      { kol: "capex"    as SortKol, label: "CAPEX",     align: "right" },
                    ] as const).map(({ kol, label, align }) => (
                      <th key={kol}
                        onClick={() => toggleSort(kol)}
                        className={`px-4 py-3 text-${align} text-slate-500 font-medium cursor-pointer select-none hover:text-slate-800 transition-colors`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {label}
                          <span className="text-xs">
                            {sortKol === kol ? (sortDir === "asc" ? "▲" : "▼") : <span className="opacity-20">⇅</span>}
                          </span>
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-slate-500 font-medium">Risiko</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {synligeRader.map((r, idx) => {
                    // ── Landheader ────────────────────────────────────────────
                    if ("erLandHeader" in r && r.erLandHeader) {
                      const erUkjent = r.kode === "__ukjent__";
                      const { navn, flagg } = landLabel(erUkjent ? null : r.kode);
                      const antall = landGruppe.get(r.kode)?.length ?? 0;
                      return (
                        <tr key={`land-${r.kode}`}
                          className={`border-y border-slate-200 cursor-pointer select-none ${erUkjent ? "bg-amber-50 hover:bg-amber-100" : "bg-slate-50 hover:bg-slate-100"}`}
                          onClick={() => toggleLand(r.kode)}>
                          <td colSpan={7} className="px-4 py-2">
                            <span className="text-sm font-semibold text-slate-700 flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-slate-400 w-3">{kollapsetLand.has(r.kode) ? "▶" : "▼"}</span>
                              <span className="text-base">{flagg}</span>
                              {navn}
                              <span className="text-xs font-normal text-slate-400 ml-1">{antall} prosjekt{antall !== 1 ? "er" : ""}</span>
                              {erUkjent && (
                                <span className="text-xs font-normal text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                                  ⚠ Land ikke satt — rediger hvert prosjekt i Innstillinger
                                </span>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    }

                    const rad      = r as ProsjektRad & { erBarn?: boolean };
                    const erAktiv  = aktivId === rad.id;
                    const harGps   = !!(rad.lat && rad.lon);
                    const erBarn   = rad.erBarn === true;
                    const harBarn  = barnMap.has(rad.id);
                    const utvidet  = utvidetForeldreIds.has(rad.id);
                    const risiko   = risikoVurdering(rad);
                    return (
                      <tr
                        key={rad.id}
                        ref={el => { rowRefs.current[rad.id] = el; }}
                        className={`transition-colors group relative ${harGps ? "cursor-pointer" : ""} ${
                          erAktiv
                            ? "bg-[#0F2A5A]/5 ring-1 ring-inset ring-[#0F2A5A]/20"
                            : erBarn ? "bg-slate-50/60 hover:bg-slate-100/60"
                            : harGps ? "hover:bg-slate-50" : "hover:bg-slate-50"
                        }`}
                        onClick={() => { if (harGps) setAktivId(prev => prev === rad.id ? null : rad.id); }}
                      >
                        <td className="px-4 py-3">
                          <div className={`flex items-start gap-1.5 ${erBarn ? "pl-5 border-l-2 border-slate-200 ml-1" : ""}`}>
                            {harBarn && (
                              <button
                                onClick={e => { e.stopPropagation(); toggleForelder(rad.id); }}
                                className="mt-0.5 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0 text-xs"
                                title={utvidet ? "Skjul delprosjekter" : "Vis delprosjekter"}
                              >
                                {utvidet ? "▼" : "▶"}
                              </button>
                            )}
                            <div>
                              {erBarn && <span className="text-slate-300 text-xs mr-1">↳</span>}
                              <Link
                                href={`/prosjekter/${rad.id}`}
                                className={`font-medium hover:underline ${erBarn ? "text-slate-600" : "text-[#0F2A5A]"}`}
                                onClick={e => e.stopPropagation()}
                              >
                                {rad.navn}
                              </Link>
                              {harBarn && (
                                <span className="ml-2 text-xs bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">
                                  {barnMap.get(rad.id)!.length} delprosjekter
                                </span>
                              )}
                              <div className="text-xs text-slate-400 mt-0.5">{rad.sted}</div>
                              {!harGps && (
                                <div className="text-xs text-amber-400 mt-0.5">Mangler GPS</div>
                              )}
                              {(rad.createdBy || (rad.inviterte && rad.inviterte.length > 0)) && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {rad.createdBy && (
                                    <span className="inline-flex items-center gap-1 text-xs bg-[#0F2A5A]/8 text-[#0F2A5A] rounded px-1.5 py-0.5" title={`Eier: ${rad.createdBy}`}>
                                      👤 {rad.createdBy.split("@")[0]}
                                    </span>
                                  )}
                                  {(rad.inviterte ?? []).map(e => (
                                    <span key={e} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-500 rounded px-1.5 py-0.5" title={e}>
                                      {e.split("@")[0]}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge text-xs ${STADIE_FARGE[rad.stadie] ?? "bg-slate-100 text-slate-600"}`}>
                            {rad.stadie}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {rad.totalKw > 0 ? fmtKw(rad.totalKw) : "—"}
                          {(rad.overBetz || rad.overBlokkering) && (
                            <span
                              title={rad.overBetz
                                ? "Fysisk umulig for elvestrekket — sjekk rotorantall/hastighet"
                                : "Overstiger realistisk uttak for blokkeringsgrensen"}
                              className={`ml-1.5 inline-block ${rad.overBetz ? "text-red-500" : "text-amber-500"}`}
                            >⚠</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {rad.arligKwh > 0 ? fmtKwh(rad.arligKwh) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {rad.capex > 0 ? `${nok(rad.capex)} kr` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`badge text-xs ${RISIKO_STIL[risiko.nivå]}`}
                            title={risiko.årsaker.join(" · ")}
                          >
                            {risiko.nivå}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right relative">
                          {slettId === rad.id ? (
                            <SlettBobbel
                              onAvbryt={() => setSlettId(null)}
                              onBekreft={() => slettProsjekt(rad.id)}
                              laster={sletter}
                            />
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); setSlettId(rad.id); }}
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
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-200 sticky bottom-0">
                  <tr className="font-semibold text-slate-900">
                    <td className="px-4 py-3" colSpan={2}>Totalt</td>
                    <td className="px-4 py-3 text-right">{totalKw > 0 ? fmtKw(totalKw) : "—"}</td>
                    <td className="px-4 py-3 text-right">{totalKwh > 0 ? fmtKwh(totalKwh) : "—"}</td>
                    <td className="px-4 py-3 text-right">{totalCapex > 0 ? `${nok(totalCapex)} kr` : "—"}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="text-center p-12">
                <p className="text-3xl mb-3">⚡</p>
                <p className="font-medium text-slate-600 mb-1">Ingen prosjekter enna</p>
                <p className="text-sm">Klikk &quot;+ Nytt prosjekt&quot; for å komme i gang</p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
