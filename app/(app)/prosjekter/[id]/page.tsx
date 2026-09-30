"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { fmtKw, fmtKwh } from "@/lib/units";
import { createClient } from "@/lib/supabase/client";
import {
  beregnEffektKw, beregnEffektKwFlateareal, beregnArligKwh, beregnLCOE, beregnIRR,
  beregnContainerCapex, nominalKwFraAreal,
  rhoFraVanntype, summerRotorEffektKw, summerRotorArealM2, sjekkFysiskTak,
} from "@/lib/finans";

// $0.5/W = 5 000 kr/kW som basis-CAPEX per installert kW nominell
const KR_PER_KW = 50000;

const STADIER = ["Prospektering","Forhandsutredning","Godkjent","Pilot","Utbygging","Ferdig utbygd"];

const MAANEDER = ["Jan","Feb","Mar","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Des"];
const DAGER   = [31,28,31,30,31,30,31,31,30,31,30,31];

// Sektor-standardverdier (kWh/ar)
const SEKTORER: Record<string, { label: string; kwhAr: number; info: string }> = {
  "Oppdrett lite":     { label: "Oppdrettsanlegg lite (< 500 t)",     kwhAr: 1_500_000, info: "~500 tonn arskapasitet" },
  "Oppdrett medium":   { label: "Oppdrettsanlegg medium (500-2000 t)", kwhAr: 5_000_000, info: "~1500 tonn arskapasitet" },
  "Oppdrett stort":    { label: "Oppdrettsanlegg stort (> 2000 t)",    kwhAr: 15_000_000, info: "> 2000 tonn arskapasitet" },
  "Husstand":          { label: "Husstand (per stk)",                  kwhAr: 16_000,     info: "Norsk snitt per husstand" },
  "Liten bedrift":     { label: "Liten bedrift",                       kwhAr: 100_000,    info: "Kontor/butikk" },
  "Industri":          { label: "Industriell virksomhet",              kwhAr: 2_000_000,  info: "Tyngre industri" },
  "Egendefinert":      { label: "Egendefinert",                        kwhAr: 0,          info: "Skriv inn eget tall" },
};

// Effektsum + tetthet + fysisk-tak-sjekk: se lib/finans.ts (summerRotorEffektKw / sjekkFysiskTak).
// IKKE dupliser reduce()-logikken lokalt her igjen — det var nettopp det som gjorde at
// ρ-defaulten (sjøvann) og manglende energitak sneik seg inn på flere sider samtidig.

// Enkel SVG stolpediagram
function ProduksjonChart({
  monthlyProd, monthlyForbruk, streamType,
}: {
  monthlyProd: number[];
  monthlyForbruk: number[];
  streamType: string;
}) {
  const W = 600, H = 180, PAD = { t: 16, r: 8, b: 32, l: 52 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const maxVal = Math.max(...monthlyProd, ...monthlyForbruk, 1);
  const barW = innerW / 12;
  const scale = (v: number) => innerH - (v / maxVal) * innerH;

  
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(f => ({ y: scale(f * maxVal), label: fmtKwh(f * maxVal) }));

  const forbrukPath = monthlyForbruk.length === 12
    ? monthlyForbruk.map((v, i) => {
        const x = PAD.l + i * barW + barW / 2;
        const y = PAD.t + scale(v);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      }).join(" ")
    : "";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
      {/* Y-ticks */}
      {yTicks.map(({ y, label }) => (
        <g key={label}>
          <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + y} y2={PAD.t + y}
            stroke="#e2e8f0" strokeWidth="1" />
          <text x={PAD.l - 4} y={PAD.t + y + 4} textAnchor="end"
            fontSize="8" fill="#94a3b8">{label}</text>
        </g>
      ))}

      {/* Stolper */}
      {monthlyProd.map((v, i) => {
        const x = PAD.l + i * barW + barW * 0.15;
        const bw = barW * 0.7;
        const h = (v / maxVal) * innerH;
        const over = monthlyForbruk.length === 12 && v >= monthlyForbruk[i];
        return (
          <g key={i}>
            <rect x={x} y={PAD.t + innerH - h} width={bw} height={h}
              fill={over ? "#0D9488" : "#5FAFD7"} rx="2" opacity="0.85" />
            <text x={PAD.l + i * barW + barW / 2} y={H - PAD.b + 14}
              textAnchor="middle" fontSize="9" fill="#64748b">
              {MAANEDER[i]}
            </text>
          </g>
        );
      })}

      {/* Forbrukslinje */}
      {forbrukPath && (
        <>
          <path d={forbrukPath} fill="none" stroke="#F97316" strokeWidth="2"
            strokeDasharray="5,3" />
          {monthlyForbruk.map((v, i) => (
            <circle key={i}
              cx={PAD.l + i * barW + barW / 2}
              cy={PAD.t + scale(v)}
              r="3" fill="#F97316" />
          ))}
        </>
      )}

      {/* Legende */}
      <rect x={PAD.l} y={4} width={10} height={8} fill="#5FAFD7" rx="1" />
      <text x={PAD.l + 13} y={11} fontSize="8" fill="#64748b">Produksjon</text>
      {forbrukPath && (
        <>
          <line x1={PAD.l + 75} x2={PAD.l + 85} y1={8} y2={8}
            stroke="#F97316" strokeWidth="2" strokeDasharray="4,2" />
          <text x={PAD.l + 88} y={11} fontSize="8" fill="#64748b">Forbruk</text>
        </>
      )}
    </svg>
  );
}

// Solcelle: spesifikt utbytte ~900 kWh/kWp/år (konservativt for Norge ~60°N)
const SOLAR_UTBYTTE_KWH_KWP = 900;
// Månedlig fordeling av solproduksjon (normalisert, norsk sesongmønster)
const SOLAR_MAANED = [0.025, 0.050, 0.078, 0.100, 0.127, 0.143, 0.137, 0.112, 0.082, 0.052, 0.030, 0.024];

function beregnSolKwp(felt: any[]): number {
  return felt.reduce((s, f) => {
    const eff = f.effektivitet_pst ?? 21;
    return s + (f.areal_m2 ?? 0) * (eff / 100);
  }, 0);
}

export default function ProsjektOversikt({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [rotorer, setRotorer]         = useState<any[]>([]);
  const [stream, setStream]           = useState<any>(null);
  const [prosjekt, setProsjekt]       = useState<any>(null);
  const [solcelleFelt, setSolcelleFelt] = useState<any[]>([]);
  const [sektor, setSektor]           = useState("Egendefinert");
  const [forbrukInput, setForbrukInput] = useState("");
  const [lagrerForbruk, setLagrerForbruk] = useState(false);
  const [barnProsjekter, setBarnProsjekter] = useState<{ id: string; navn: string }[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchParams = useSearchParams();
  const tekniskModus = searchParams.get("mode") === "teknisk";

  useEffect(() => {
    async function load() {
      // Hent prosjekt og eventuelle underprosjekter parallelt
      const [{ data: p }, { data: barn }] = await Promise.all([
        supabase.from("projects").select("*").eq("id", params.id).single(),
        supabase.from("projects").select("id,navn").eq("parent_project_id", params.id),
      ]);

      setProsjekt(p);
      const barnListe = barn ?? [];
      setBarnProsjekter(barnListe);

      // Hvilke prosjekt-IDer skal rotorer/sol hentes fra?
      // Paraply: kun underprosjekter (rotorer er ikke lagt på selve paraplyen)
      // Vanlig: kun seg selv
      const childIds = barnListe.map((b: any) => b.id as string);
      const rotorIds = childIds.length > 0 ? childIds : [params.id];

      // Hent rotors, solar_fields og streams fra alle relevante IDer
      const [{ data: r }, { data: sol }, { data: alleStrommar }] = await Promise.all([
        supabase.from("rotors").select("*").in("project_id", rotorIds),
        supabase.from("solar_fields").select("*").in("project_id", rotorIds),
        supabase.from("streams").select("*").in("project_id", [params.id, ...childIds]),
      ]);

      setRotorer(r ?? []);
      setSolcelleFelt(sol ?? []);

      // Foretrekk parentens egen strøm; fall tilbake til første barn-strøm
      const parentStream = (alleStrommar ?? []).find((s: any) => s.project_id === params.id);
      setStream(parentStream ?? (alleStrommar ?? [])[0] ?? null);

      if (p?.forbruk_sektor) setSektor(p.forbruk_sektor);
      if (p?.arlig_forbruk_kwh != null) setForbrukInput(String(p.arlig_forbruk_kwh));
    }
    load();
  }, [params.id]);

  const lagreForbruk = async (kwhAr: number, sek: string) => {
    setLagrerForbruk(true);
    await supabase.from("projects").update({
      arlig_forbruk_kwh: kwhAr || null,
      forbruk_sektor: sek,
    }).eq("id", params.id);
    setLagrerForbruk(false);
  };

  const velgSektor = (s: string) => {
    setSektor(s);
    const kwhAr = SEKTORER[s]?.kwhAr ?? 0;
    if (s !== "Egendefinert") {
      setForbrukInput(kwhAr > 0 ? String(kwhAr) : "");
      lagreForbruk(kwhAr, s);
    } else {
      lagreForbruk(parseFloat(forbrukInput) || 0, s);
    }
  };

  const onForbrukChange = (val: string) => {
    setForbrukInput(val);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => lagreForbruk(parseFloat(val) || 0, sektor), 800);
  };

  if (!prosjekt) return <div className="text-slate-400 text-sm p-4">Laster...</div>;

  const avgV = stream?.avg_velocity_m_s
    ?? (null)
    ?? 0;
  const streamType = stream?.stream_type ?? "tidevann";
  const rho        = rhoFraVanntype(prosjekt?.vann_type);
  const totalKw    = rotorer.length > 0 ? summerRotorEffektKw(rotorer, avgV, rho) : 0;
  const arligKwh   = totalKw > 0 ? beregnArligKwh(totalKw, streamType) : 0;

  // Solceller
  const solarKwp      = beregnSolKwp(solcelleFelt);
  const arligKwhSolar = solarKwp * SOLAR_UTBYTTE_KWH_KWP;
  const solarArealM2  = solcelleFelt.reduce((s, f) => s + (f.areal_m2 ?? 0), 0);
  const totalKwhAlt   = arligKwh + arligKwhSolar; // hydro + sol kombinert

  // Fysisk-tak-varsel: kan installert effekt faktisk hentes ut av dette elvestrekket?
  // null = mangler tverrsnitt (bredde × dybde) og kan ikke sjekkes — ikke det samme som "ok".
  const fysiskTak = sjekkFysiskTak(
    totalKw, rho,
    prosjekt?.elv_bredde_m, prosjekt?.elv_dybde_m,
    avgV, summerRotorArealM2(rotorer),
    prosjekt?.blokkering_pst ?? 20
  );

  const antall   = rotorer.length;
  const rotorCapex = rotorer.reduce((s, r) => {
    const kw = r.nominell_kw_1_8 ?? (r.lengde_m && r.hoyde_m ? nominalKwFraAreal(r.lengde_m * r.hoyde_m) : 0);
    return s + (kw > 0 ? kw * KR_PER_KW : KR_PER_KW * 5); // fallback: 5 kW standard
  }, 0);
  const containerCapex = antall > 0 ? beregnContainerCapex(antall) : 0;
  const totalCapex    = rotorCapex + containerCapex + 120000 + 200000;
  const arligOverskudd = arligKwh * 0.65 - 48000;
  const cfs  = [-totalCapex, ...Array(20).fill(arligOverskudd)];
  const irr  = totalCapex > 0 ? beregnIRR(cfs) : 0;
  const lcoe = totalKw > 0 ? beregnLCOE(totalCapex, 48000, arligKwh, 20, 0.08) : 0;
  const tilbake = arligOverskudd > 0 ? totalCapex / arligOverskudd : 0;
  const nok = (v: number) => Math.round(v).toLocaleString("nb-NO");
  const stadieIdx = STADIER.indexOf(prosjekt.stadie);

  // Forbruk (bruker kombinert hydro + sol)
  const arligForbruk = parseFloat(forbrukInput) || prosjekt?.arlig_forbruk_kwh || 0;
  const dekning = arligForbruk > 0 ? Math.min((totalKwhAlt / arligForbruk) * 100, 999) : 0;
  const overskuddKwh = totalKwhAlt - arligForbruk;

  // Månedlig produksjon
  const hPerDay   = streamType === "tidevann" ? 2 * 6 * 0.637 : 24 * 0.7;
  const monthlyProd   = DAGER.map(d => totalKw * d * hPerDay);
  const monthlyForbruk = arligForbruk > 0 ? DAGER.map(d => (arligForbruk / 365) * d) : [];

  // Batteribehov
  // Tidevann: bro over 6h stille vann = max last × 6h
  // Elv: buffer mot variasjon = 4h
  const bridgeH    = streamType === "tidevann" ? 6 : 4;
  const lastKw     = arligForbruk > 0 ? arligForbruk / 8760 : totalKw;
  const batteriKwh = lastKw * bridgeH;
  const batteriKw  = lastKw; // ladeeffekt ≈ last

  
  return (
    <div className="space-y-4">
      {/* ── Paraply-banner ── */}
      {barnProsjekter.length > 0 && (
        <div className="card p-4 flex items-start gap-3 border border-[#0F2A5A]/20 bg-blue-50">
          <span className="text-lg mt-0.5">🗂</span>
          <div>
            <p className="text-sm font-semibold text-[#0F2A5A]">Paraplyprojekt — aggregerte tall</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Viser summerte data fra {barnProsjekter.length} underprosjekter:{" "}
              {barnProsjekter.map(b => b.navn).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* ── Nøkkeltall ── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "Installert effekt",
            value: (totalKw > 0 || solarKwp > 0) ? fmtKw(totalKw + solarKwp) : "—",
            sub: [antall > 0 ? `${antall} rotorer` : null, solarKwp > 0 ? `+ ${solarKwp.toFixed(1)} kWp sol` : null].filter(Boolean).join(" · ") || "0 rotorer",
          },
          {
            label: "Estimert produksjon",
            value: totalKwhAlt > 0 ? fmtKwh(totalKwhAlt) + "/ar" : "—",
            sub: [arligKwh > 0 ? `hydro ${fmtKwh(arligKwh)}` : null, arligKwhSolar > 0 ? `sol ${fmtKwh(arligKwhSolar)}` : null].filter(Boolean).join(" + ") || streamType,
          },
          ...(!tekniskModus ? [
            { label: "LCOE",                value: lcoe > 0 ? `${lcoe.toFixed(2)} kr/kWh` : "—",             sub: "Over 20 ar" },
            { label: "CAPEX",               value: totalCapex > 320000 ? `${nok(totalCapex)} kr` : "—",      sub: "" },
            { label: "IRR",                 value: irr > 0 && isFinite(irr) && irr < 10 ? `${(irr*100).toFixed(1)} %` : "—", sub: "Egenkapital" },
            { label: "Tilbakebetalingstid", value: tilbake > 0 ? `${tilbake.toFixed(1)} ar` : "—",           sub: "" },
          ] : []),
        ].map(k => (
          <div key={k.label} className="card p-5">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
            <p className="text-lg sm:text-2xl font-semibold text-slate-900">{k.value}</p>
            {k.sub && <p className="text-xs text-slate-400 mt-1">{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Fysisk-tak-varsel ── */}
      {fysiskTak && (fysiskTak.overBetz || fysiskTak.overBlokkering) && (
        <div className={`card p-4 border ${fysiskTak.overBetz ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <p className={`text-sm font-semibold ${fysiskTak.overBetz ? "text-red-700" : "text-amber-700"}`}>
            {fysiskTak.overBetz
              ? "⚠ Installert effekt er fysisk umulig for dette elvestrekket"
              : "⚠ Installert effekt overstiger realistisk uttak for valgt antall rotorer / blokkeringsgrad"}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            {fmtKw(totalKw)} installert vs. maks {fmtKw(fysiskTak.pBetzKw)} (Betz-grense) /{" "}
            {fmtKw(fysiskTak.pEkstraherbarKw)} realistisk uttak ved {avgV.toFixed(2)} m/s.
            Sjekk antall rotorer, rotorareal eller hastighetsverdien i Innstillinger.
          </p>
        </div>
      )}

      {/* ── Produksjon og forbruk ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">Produksjon og forbruk</h2>
          {lagrerForbruk && <span className="text-xs text-slate-400">Lagrer...</span>}
        </div>

        {/* Forbruksinnstilling */}
        <div className="flex gap-3 mb-5 flex-wrap">
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Sektor</label>
            <select
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={sektor}
              onChange={e => velgSektor(e.target.value)}>
              {Object.entries(SEKTORER).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
              Estimert forbruk (kWh/ar)
            </label>
            <input
              type="number"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 w-44"
              value={forbrukInput}
              onChange={e => onForbrukChange(e.target.value)}
              placeholder="f.eks. 5000000"
            />
            {sektor !== "Egendefinert" && SEKTORER[sektor] && (
              <p className="text-xs text-slate-400 mt-1">{SEKTORER[sektor].info}</p>
            )}
          </div>

          {/* Dekning-kort */}
          {arligForbruk > 0 && arligKwh > 0 && (
            <div className="ml-auto flex gap-3">
              <div className="bg-slate-50 rounded-xl px-4 py-2 text-center border border-slate-100">
                <p className="text-xs text-slate-400 mb-0.5">Dekningsgrad</p>
                <p className={`text-lg sm:text-2xl font-bold ${dekning >= 100 ? "text-[#0D9488]" : dekning >= 75 ? "text-amber-500" : "text-red-500"}`}>
                  {dekning.toFixed(0)}%
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl px-4 py-2 text-center border border-slate-100">
                <p className="text-xs text-slate-400 mb-0.5">{overskuddKwh >= 0 ? "Overskudd" : "Underskudd"}</p>
                <p className={`text-base sm:text-xl font-bold ${overskuddKwh >= 0 ? "text-[#0D9488]" : "text-red-500"}`}>
                  {fmtKwh(Math.abs(overskuddKwh))}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Månedlig graf */}
        {totalKw > 0 ? (
          <ProduksjonChart
            monthlyProd={monthlyProd}
            monthlyForbruk={monthlyForbruk}
            streamType={streamType}
          />
        ) : (
          <div className="text-center text-slate-400 text-sm py-8">
            Legg til rotorer i Utstyr-fanen for a se produksjonskurven
          </div>
        )}
      </div>

      {/* ── Batteribehov ── */}
      {totalKw > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Batteribehov</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <p className="text-xs text-slate-500 mb-1">Anbefalt kapasitet</p>
              <p className="text-lg sm:text-2xl font-bold text-[#0F2A5A]">{fmtKwh(batteriKwh)}</p>
              <p className="text-xs text-slate-400 mt-1">
                {bridgeH}h bro x {fmtKw(lastKw)} last
              </p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <p className="text-xs text-slate-500 mb-1">Ladeeffekt</p>
              <p className="text-lg sm:text-2xl font-bold text-[#0F2A5A]">{fmtKw(batteriKw)}</p>
              <p className="text-xs text-slate-400 mt-1">C-rate basert pa last</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <p className="text-xs text-slate-500 mb-1">Logikk</p>
              <p className="text-sm font-medium text-slate-700 mt-1">
                {streamType === "tidevann"
                  ? "Tidevann: 6h produksjon, 6h stille. Batteri dekker stille-perioden."
                  : "Elv: jevn strom. Batteri som buffer ved vedlikehold (4h)."}
              </p>
            </div>
          </div>

          {/* Enkel visuell syklus for tidevann */}
          {streamType === "tidevann" && (
            <div className="mt-2">
              <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider">24-timers tidvannssyklus</p>
              <div className="flex h-8 rounded-lg overflow-hidden text-xs font-medium">
                {[
                  { label: "Produksjon →", bg: "#5FAFD7", w: "25%" },
                  { label: "Stille (batteri)", bg: "#CBD5E1", w: "25%" },
                  { label: "← Produksjon", bg: "#5FAFD7", w: "25%" },
                  { label: "Stille (batteri)", bg: "#CBD5E1", w: "25%" },
                ].map((s, i) => (
                  <div key={i} style={{ background: s.bg, width: s.w }}
                    className="flex items-center justify-center text-white text-xs px-1 truncate">
                    {s.label}
                  </div>
                ))}
              </div>
              <div className="flex text-xs text-slate-400 mt-1">
                <span className="w-1/4 text-center">00:00</span>
                <span className="w-1/4 text-center">06:00</span>
                <span className="w-1/4 text-center">12:00</span>
                <span className="w-1/4 text-center">18:00</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Solcellefelt ── */}
      {solcelleFelt.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">☀️ Solcellefelt</h2>
            <span className="text-xs text-slate-400">{solcelleFelt.length} felt · {solarArealM2 >= 10000 ? `${(solarArealM2/10000).toFixed(2)} ha` : `${Math.round(solarArealM2)} m²`} totalt</span>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
              <p className="text-xs text-slate-500 mb-1">Installert effekt</p>
              <p className="text-lg sm:text-2xl font-bold text-amber-700">{solarKwp.toFixed(1)} kWp</p>
              <p className="text-xs text-slate-400 mt-1">ved standardbetingelser (STC)</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
              <p className="text-xs text-slate-500 mb-1">Estimert produksjon</p>
              <p className="text-lg sm:text-2xl font-bold text-amber-700">{fmtKwh(arligKwhSolar)}/år</p>
              <p className="text-xs text-slate-400 mt-1">{SOLAR_UTBYTTE_KWH_KWP} kWh/kWp/år</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
              <p className="text-xs text-slate-500 mb-1">Snitteffektivitet</p>
              <p className="text-lg sm:text-2xl font-bold text-amber-700">
                {solcelleFelt.length > 0
                  ? (solcelleFelt.reduce((s, f) => s + (f.effektivitet_pst ?? 21), 0) / solcelleFelt.length).toFixed(1)
                  : "21"} %
              </p>
              <p className="text-xs text-slate-400 mt-1">vektet snitt</p>
            </div>
          </div>
          <div className="space-y-2">
            {solcelleFelt.map(f => {
              const kwp = (f.areal_m2 ?? 0) * ((f.effektivitet_pst ?? 21) / 100);
              const arealTekst = f.areal_m2 >= 10000
                ? `${(f.areal_m2 / 10000).toFixed(2)} ha`
                : `${Math.round(f.areal_m2 ?? 0)} m²`;
              return (
                <div key={f.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2 text-sm">
                  <div>
                    <span className="font-medium text-slate-800">{f.navn ?? "Solcellefelt"}</span>
                    <span className="text-slate-400 text-xs ml-2">{arealTekst} · {f.panel_type ?? "ukjent"} · {f.effektivitet_pst ?? 21} %{f.installasjonsar ? ` · ${f.installasjonsar}` : ""}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-amber-700">{kwp.toFixed(1)} kWp</span>
                    <span className="text-xs text-slate-400 ml-2">{fmtKwh(kwp * SOLAR_UTBYTTE_KWH_KWP)}/år</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Strom + stadie ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5 col-span-2">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Strominformasjon</h2>
          {stream ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-slate-400">Type</dt><dd className="text-slate-900">{stream.stream_type}</dd>
              <dt className="text-slate-400">Topphastighet</dt><dd className="text-slate-900">{stream.peak_velocity_m_s ? `${stream.peak_velocity_m_s} m/s` : "—"}</dd>
              <dt className="text-slate-400">Gjennomsnittshastighet</dt><dd className="text-slate-900">{avgV ? `${avgV.toFixed(3)} m/s` : "—"}</dd>
              <dt className="text-slate-400">Datakilde</dt><dd className="text-slate-900">{stream.datakilde ?? "—"}</dd>
            </dl>
          ) : (
            <p className="text-sm text-amber-600">Ingen strominformasjon — legg inn i Innstillinger</p>
          )}
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Prosjektstadie</h2>
          <div className="space-y-2">
            {STADIER.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${i <= stadieIdx ? "bg-[#0F2A5A]" : "bg-slate-200"}`} />
                <span className={`text-sm ${i === stadieIdx ? "font-semibold text-[#0F2A5A]" : i < stadieIdx ? "text-slate-400" : "text-slate-300"}`}>
                  {s}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
