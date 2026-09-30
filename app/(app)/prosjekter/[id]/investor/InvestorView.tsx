"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { fmtKw, fmtKwh } from "@/lib/units";
import { createClient } from "@/lib/supabase/client";
import {
  nominalKwFraAreal, beregnEffektKw, beregnEffektKwFlateareal, beregnArligKwh,
  beregnContainerCapex, beregnLCOE, beregnIRR, beregnNPV, beregnEtterSkattCashflows,
  rhoFraVanntype, RHO_SJOVANN,
} from "@/lib/finans";
import { finnLand } from "@/lib/land";

const RapportKart = dynamic(() => import("@/components/RapportKart"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 260, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}
      className="flex items-center justify-center text-slate-400 text-sm">
      Laster kart…
    </div>
  ),
});

const KR_PER_KW = 50000;

/* ── Pitch-tekst-generatorer (brukes av e-post-sending) ──────────────────── */
interface PitchData {
  navn: string; sted: string; landNavn: string; flag: string;
  streamType: string; avgV: number; antall: number;
  totalKw: number; arligKwh: number; totalCapex: number;
  lcoe: number; irr: number; irrEs: number; tilbakebetaling: number;
  co2TonnAr: number; ppaKr: number; arligInntekt: number; arligOverskudd: number;
  dieselKrKwh: number; stadie: string; npv: number; skattesats: number;
  energikilde: string;
}

function fmtKwT(kw: number): string {
  if (kw >= 1_000_000) return (kw/1_000_000).toFixed(1) + " GW";
  if (kw >= 1_000)     return (kw/1_000).toFixed(1) + " MW";
  return kw.toFixed(0) + " kW";
}
function fmtKwhT(kwh: number): string {
  if (kwh >= 1_000_000_000) return (kwh/1_000_000_000).toFixed(2) + " TWh";
  if (kwh >= 1_000_000)     return (kwh/1_000_000).toFixed(1) + " GWh";
  if (kwh >= 1_000)         return Math.round(kwh/1_000) + " MWh";
  return Math.round(kwh) + " kWh";
}
function nokK(v: number): string {
  if (v >= 1_000_000) return (v/1_000_000).toFixed(1).replace(".", ",") + " MNOK";
  return Math.round(v).toLocaleString("nb-NO") + " kr";
}
function streamNavn(t: string): string {
  if (t === "tidevann") return "tidevann";
  if (t === "elv")      return "elvekraft";
  return "havstrøm";
}

function genererTeaser(d: PitchData): string {
  const dieselRabatt = d.lcoe > 0 && d.dieselKrKwh > d.lcoe
    ? Math.round((1 - d.lcoe / d.dieselKrKwh) * 100) : null;
  const cf = d.totalKw > 0 && d.arligKwh > 0
    ? Math.round(d.arligKwh / (d.totalKw * 8760) * 100) : null;
  return `${d.navn.toUpperCase()}
Hydrokinetisk kraftproduksjon — ${d.sted}${d.flag ? " " + d.flag : ""}

─────────────────────────────────────────────

MULIGHETEN

Verden har et uutnyttet potensial på over 300 GW installert havenergi fra tidevanns- og elvestrøm. En stor del av dette befinner seg nær kystsamfunn og industri som i dag er avhengig av dieselaggregater til 8–12 kr/kWh. Tideron AS tar dette markedet med en enkel, feltbevist teknologi: den vertikale Waterotor-rotoren — installert uten demning, uten bunnforankring til fjell og uten konsesjonspliktig damanlegg.

PROSJEKTET

${d.navn} plasserer ${d.antall > 0 ? d.antall + " Waterotor-rotorer" : "Waterotor-rotorer"} i ${streamNavn(d.streamType)}strømmen ved ${d.sted}. Med en gjennomsnittshastighet på ${d.avgV > 0 ? d.avgV.toFixed(2) + " m/s" : "estimert lokalt nivå"} leverer anlegget:

  • Installert effekt:      ${fmtKwT(d.totalKw)}
  • Arlig produksjon:       ${fmtKwhT(d.arligKwh)}${cf ? " (" + cf + " % kapasitetsfaktor)" : ""}
  • Estimert LCOE:          ${d.lcoe > 0 ? d.lcoe.toFixed(2) + " kr/kWh" : "under kalkulering"}${dieselRabatt ? " — " + dieselRabatt + " % billigere enn diesel" : ""}
  • CO₂ spart/år:           ${d.co2TonnAr > 0 ? "~" + Math.round(d.co2TonnAr) + " tonn vs dieselalternativet" : "positiv klimaeffekt"}

DEN FINANSIELLE CASEN

  Totalt CAPEX:             ${nokK(d.totalCapex)}
  Arlig driftsinntekt:      ${nokK(d.arligInntekt)}
  IRR (før skatt):          ${isFinite(d.irr) ? (d.irr*100).toFixed(1) + " %" : "under kalkulering"}
  IRR (etter ${Math.round(d.skattesats*100)} % skatt): ${isFinite(d.irrEs) ? (d.irrEs*100).toFixed(1) + " %" : "—"}
  Tilbakebetaling:          ${isFinite(d.tilbakebetaling) ? d.tilbakebetaling.toFixed(1) + " år" : "—"}

PPA-inntekten er basert på ${d.ppaKr.toFixed(2)} kr/kWh — en pris som reflekterer lokal strømsituasjon og tilgjengelig infrastruktur.

HVA VI SER ETTER

Vi er i ${d.stadie.toLowerCase()}-fasen og inviterer til en samtale om strategisk eierskap og/eller prosjektfinansiering. Kontakt oss for fullstendig investorpakke med tekniske spesifikasjoner, hydraulisk ressurskartlegging og detaljert finansiell modell.

Kai Svendstad
ksv@tideron.com
Tideron AS — Ortnevik 3, 5962 Bjordal`;
}

function genererFullPitch(d: PitchData): string {
  const dieselRabatt = d.lcoe > 0 && d.dieselKrKwh > d.lcoe
    ? Math.round((1 - d.lcoe / d.dieselKrKwh) * 100) : null;
  const cf = d.totalKw > 0 && d.arligKwh > 0
    ? Math.round(d.arligKwh / (d.totalKw * 8760) * 100) : null;
  const arligDieselSparing = d.arligKwh > 0
    ? Math.round(d.arligKwh * (d.dieselKrKwh - d.ppaKr)) : 0;
  return `${d.navn.toUpperCase()} — FULLSTENDIG INVESTORPITCH
${d.sted}${d.flag ? " " + d.flag : ""} · Tideron AS · ${new Date().toLocaleDateString("nb-NO", { month: "long", year: "numeric" })}

═══════════════════════════════════════════════════════════

1. SAMMENDRAG

${d.navn} er et hydrokinetisk kraftprosjekt som utnytter kinetisk energi fra ${streamNavn(d.streamType)} ved ${d.sted}. Prosjektet leverer ren, stabil strøm til lokalt nett eller direkte til en kraftkjøper (PPA) — uten støy, uten utslipp og uten behov for demning eller bunnfundamentering.

Nøkkeltall:
  Installert effekt:    ${fmtKwT(d.totalKw)}
  Arlig produksjon:     ${fmtKwhT(d.arligKwh)}
  Totalt CAPEX:         ${nokK(d.totalCapex)}
  LCOE:                 ${d.lcoe > 0 ? d.lcoe.toFixed(2) + " kr/kWh" : "under kalkulering"}
  IRR (før skatt):      ${isFinite(d.irr) ? (d.irr*100).toFixed(1) + " %" : "—"}
  NPV (8 %, 20 år):     ${nokK(d.npv)}
  Tilbakebetaling:      ${isFinite(d.tilbakebetaling) ? d.tilbakebetaling.toFixed(1) + " år" : "—"}

═══════════════════════════════════════════════════════════

2. PROBLEM OG MARKEDSMULIGHET

Over 800 millioner mennesker mangler pålitelig tilgang til elektrisitet. Ytterligere hundrevis av millioner — inkludert øysamfunn, kystindustri og maritimt sektor — er avhengige av dieselaggregater som er dyre, forurensende og sårbare for forsyningsbrist.

Hydrokinetisk kraft adresserer dette gapet direkte: teknologien kan installeres nær forbrukerne, krever minimalt med infrastruktur og leverer stabil basisbelastning uavhengig av vær og årstid.

Teknologisammenligning:
  Teknologi           | LCOE (kr/kWh) | Forutsigbarhet
  ─────────────────────────────────────────────────────
  Dieselaggregat      | 8–12          | Høy (men sårbar)
  Havvind             | 0,6–1,2       | Medium
  Solcelle (nord)     | 0,8–2,0       | Lav (sesong)
  Hydro (demning)     | 0,3–0,8       | Høy
  Waterotor/tidevano  | ${d.lcoe > 0 ? d.lcoe.toFixed(2) : "0,40–0,80"}        | Svært høy (50 år frem)

═══════════════════════════════════════════════════════════

3. TEKNOLOGIEN — WATEROTOR

Waterotor-rotoren er en vertikalakset hydrokinetisk turbinrigg som konverterer kinetisk energi fra strømmende vann til elektrisk energi via en permanentmagnetgenerator.

Ytelsesdata:
  Effektkoeffisient (Cp):   0,42
  Driftsvindu:              0,7 – 2,5 m/s
  Dokumentert LCOE:         4–8 ¢/kWh (USD, 2020)
  Testet:                   2011–2021, fullskala prototyper

Nøkkelfordeler:
  • Fungerer fra 0,7 m/s (mange turbiner krever >2 m/s)
  • Tåler turbulent strøm og sedimentbelasting
  • Ingen roterende deler nær bunnen — trygt for fauna
  • Modulær: skalerer fra noen kW til multi-MW

═══════════════════════════════════════════════════════════

4. PROSJEKTET — ${d.navn.toUpperCase()}

Lokasjon:             ${d.sted}${d.landNavn ? ", " + d.landNavn : ""}
Strømtype:            ${streamNavn(d.streamType).charAt(0).toUpperCase() + streamNavn(d.streamType).slice(1)}
Gj.snitt hastighet:   ${d.avgV > 0 ? d.avgV.toFixed(3) + " m/s" : "Under kartlegging"}
Antall rotorenheter:  ${d.antall > 0 ? d.antall + " stk" : "Konfigureres"}
Installert effekt:    ${fmtKwT(d.totalKw)}
Arlig produksjon:     ${fmtKwhT(d.arligKwh)}${cf ? " (" + cf + " % kapasitetsfaktor)" : ""}
CO₂-besparelse/år:    ${d.co2TonnAr > 0 ? "~" + Math.round(d.co2TonnAr) + " tonn CO₂e (vs " + (d.energikilde === "grid" ? "nettstrøm" : "diesel") + ")" : "Positiv klimaeffekt"}

Inntektsmodell: PPA til ${d.ppaKr.toFixed(2)} kr/kWh.
${d.dieselKrKwh > d.ppaKr && d.arligKwh > 0
  ? `For en lokal kraftkjøper som betaler ${d.dieselKrKwh} kr/kWh for ${d.energikilde === "grid" ? "nettstrøm" : "diesel"}, representerer dette en besparelse på ${nokK(arligDieselSparing)}/år.`
  : ""}

═══════════════════════════════════════════════════════════

5. FINANSIELL MODELL

Investeringsstruktur:
  Rotorer og mekanikk         ${nokK(d.totalCapex * 0.65)}
  Elektrisk og kontroll       ${nokK(d.totalCapex * 0.15)}
  Installasjon og mobilisering${nokK(d.totalCapex * 0.12)}
  Ingeniør, tillatelser, misc ${nokK(d.totalCapex * 0.08)}
  TOTALT CAPEX                ${nokK(d.totalCapex)}

Driftsøkonomi (per år):
  Inntekt:    ${nokK(d.arligInntekt)}
  OPEX:       ${nokK(48000)}
  EBITDA:     ${nokK(d.arligOverskudd)}

Avkastning:
  IRR (før skatt):     ${isFinite(d.irr) ? (d.irr*100).toFixed(1) + " %" : "—"}
  IRR (etter skatt):   ${isFinite(d.irrEs) ? (d.irrEs*100).toFixed(1) + " %" : "—"}
  NPV (8%):            ${nokK(d.npv)}
  LCOE:                ${d.lcoe > 0 ? d.lcoe.toFixed(2) + " kr/kWh" : "—"}${dieselRabatt ? " (" + dieselRabatt + " % under diesel)" : ""}
  Tilbakebetaling:     ${isFinite(d.tilbakebetaling) ? d.tilbakebetaling.toFixed(1) + " år" : "—"}

═══════════════════════════════════════════════════════════

6. RISIKO

  Risiko                    | Sannsynlighet | Mitigering
  ──────────────────────────────────────────────────────────────
  Lavere strøm enn antatt   | Middels       | Tidevannsdata fra Kartverket
  PPA-kjøper misligholder   | Lav           | Kontraktsklausuler + batteri
  Regulatoriske forsinkelser | Middels      | Tidlig NVE-dialog, ingen demning
  Teknisk havari            | Lav           | Felttestet 2011–2021
  Kostnadsoverskridelse      | Middels      | Fastpriskontrakter; 10% reserve

═══════════════════════════════════════════════════════════

7. NESTE STEG

  1. Fullføre ressurskartlegging og hydrografisk analyse
  2. Innhente tillatelser (NVE, kommune, Fiskeridirektoratet)
  3. Inngå bindende PPA med lokal kraftkjøper
  4. Gjennomføre investeringsrunde
  5. Kontrahere leverandør og installere
  6. Idriftsettelse og kommersiell drift

Vi inviterer investorer til å delta i tidlig egenkapitalrunde. Detaljerte vilkår deles under NDA.

═══════════════════════════════════════════════════════════

8. SELSKAPET

Tideron AS er et norsk energiutviklingsselskap med base i Bjordal, Sogn og Fjordane.

Daglig leder: Kai Svendstad (ksv@tideron.com)
Registrert adresse: Ortnevik 3, 5962 Bjordal

© Tideron AS ${new Date().getFullYear()} — Konfidensielt`;
}

function kwFraNavn(modell: string): number {
  const m = modell?.match(/(\d+(?:\.\d+)?)\s*(kW|MW)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === "mw" ? n * 1000 : n;
}
function rotorKwNominell(r: any): number {
  if (r.nominell_kw_1_8 && r.nominell_kw_1_8 > 0) return r.nominell_kw_1_8;
  const nom = kwFraNavn(r.modell);
  if (nom > 0) return nom;
  if (r.lengde_m && r.hoyde_m) return nominalKwFraAreal(r.lengde_m * r.hoyde_m);
  return 0;
}
function rotorKwVed(r: any, fallbackV: number, rho = RHO_SJOVANN): number {
  const v = (r.hastighet_m_s && Number(r.hastighet_m_s) > 0) ? Number(r.hastighet_m_s) : fallbackV;
  if (v <= 0) return rotorKwNominell(r);
  if (r.nominell_kw_1_8 && r.nominell_kw_1_8 > 0) return r.nominell_kw_1_8 * Math.pow(v / 1.8, 3);
  if (r.lengde_m && r.hoyde_m) return beregnEffektKwFlateareal(v, r.lengde_m * r.hoyde_m, rho);
  const nom = kwFraNavn(r.modell);
  if (nom > 0) return nom * Math.pow(v / 1.8, 3);
  if (r.diameter_m) return beregnEffektKw(v, r.diameter_m, rho);
  return 0;
}

/* ── McKinsey-stil hjelpere ─────────────────────────────────────────────── */

/** Seksjon med etikettlinje + assertion-overskrift */
function McSection({
  label, headline, children, className = "",
}: {
  label: string; headline: string;
  children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`py-8 border-b border-slate-100 last:border-none ${className}`}>
      <div className="mb-5" style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ width: 3, minHeight: 42, background: "linear-gradient(to bottom, #0F2A5A, #3A8A52)", borderRadius: 2, flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 5 }}>{label}</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#0F2A5A", lineHeight: 1.35, maxWidth: "54ch" }}>{headline}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Stor KPI-celle */
function BigMetric({
  label, value, sub, accent = false, positive = false,
}: { label: string; value: string; sub?: string; accent?: boolean; positive?: boolean }) {
  return (
    <div className="flex flex-col">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold leading-none tracking-tight ${
        positive ? "text-[#059669]" : accent ? "text-[#0F2A5A]" : "text-slate-900"
      }`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
    </div>
  );
}

/** 20-år kumulativ kontantstrøm-kurve */
function CashFlowChart({ totalCapex, arligOverskudd }: { totalCapex: number; arligOverskudd: number }) {
  const W = 600, H = 180;
  const PAD = { t: 16, r: 16, b: 36, l: 72 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const cumCFs: number[] = [];
  let cum = -totalCapex;
  cumCFs.push(cum);
  for (let i = 1; i <= 20; i++) {
    cum += arligOverskudd;
    cumCFs.push(cum);
  }

  const minCF = Math.min(...cumCFs);
  const maxCF = Math.max(...cumCFs);
  const range = maxCF - minCF || 1;

  const xS = (i: number) => PAD.l + (i / 20) * innerW;
  const yS = (v: number) => PAD.t + ((maxCF - v) / range) * innerH;
  const zeroY = yS(0);
  const clampedZeroY = Math.max(PAD.t, Math.min(PAD.t + innerH, zeroY));

  const breakevenIdx = cumCFs.findIndex(v => v >= 0);

  // Build area paths split at zero
  const coords = cumCFs.map((v, i) => [xS(i), yS(v)] as [number, number]);

  // Positive area (above zero)
  let posArea = `M ${PAD.l} ${clampedZeroY}`;
  coords.forEach(([x, y], i) => {
    posArea += ` L ${x} ${Math.min(y, clampedZeroY)}`;
  });
  posArea += ` L ${xS(20)} ${clampedZeroY} Z`;

  // Negative area (below zero)
  let negArea = `M ${PAD.l} ${clampedZeroY}`;
  coords.forEach(([x, y]) => {
    negArea += ` L ${x} ${Math.max(y, clampedZeroY)}`;
  });
  negArea += ` L ${xS(20)} ${clampedZeroY} Z`;

  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");

  // Y ticks
  const ticks = [minCF, 0, maxCF * 0.5, maxCF].filter((v, i, arr) => arr.indexOf(v) === i && v >= minCF && v <= maxCF);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
      {/* Grid lines */}
      {ticks.map((v, i) => (
        <line key={i} x1={PAD.l} x2={W - PAD.r} y1={yS(v)} y2={yS(v)} stroke="#f1f5f9" strokeWidth="1" />
      ))}

      {/* Area fills */}
      <path d={posArea} fill="#D1FAE5" opacity="0.7" />
      <path d={negArea} fill="#FEE2E2" opacity="0.7" />

      {/* Zero line */}
      <line x1={PAD.l} x2={W - PAD.r} y1={clampedZeroY} y2={clampedZeroY}
        stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />

      {/* Break-even marker */}
      {breakevenIdx > 0 && breakevenIdx <= 20 && (
        <g>
          <line x1={xS(breakevenIdx)} x2={xS(breakevenIdx)} y1={PAD.t} y2={PAD.t + innerH}
            stroke="#059669" strokeWidth="1.5" strokeDasharray="3 3" />
          <text x={xS(breakevenIdx) + 4} y={PAD.t + 10}
            fontSize="9" fill="#059669" fontWeight="700">
            Break-even år {breakevenIdx}
          </text>
        </g>
      )}

      {/* Main line */}
      <path d={linePath} fill="none" stroke="#0F2A5A" strokeWidth="2.5" strokeLinejoin="round" />

      {/* Data dots at 5-year intervals */}
      {[0, 5, 10, 15, 20].map(i => (
        <g key={i}>
          <circle cx={xS(i)} cy={yS(cumCFs[i])} r="3.5"
            fill={cumCFs[i] >= 0 ? "#059669" : "#DC2626"} />
          <text x={xS(i)} y={H - PAD.b + 14} textAnchor="middle" fontSize="9" fill="#94a3b8">
            År {i}
          </text>
        </g>
      ))}

      {/* Y axis labels */}
      {ticks.map((v, i) => (
        <text key={i} x={PAD.l - 4} y={yS(v) + 4} textAnchor="end" fontSize="8" fill="#94a3b8">
          {v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v/1_000).toFixed(0)}k` : Math.round(v)}
        </text>
      ))}

      {/* Y axis label */}
      <text x={8} y={PAD.t + innerH / 2} textAnchor="middle" fontSize="8" fill="#94a3b8"
        transform={`rotate(-90, 8, ${PAD.t + innerH / 2})`}>kr</text>
    </svg>
  );
}

/** CAPEX-nedbryting som horisontale søyler */
function CapexBar({ label, amount, total, color }: { label: string; amount: number; total: number; color: string }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-36 text-slate-500 text-xs shrink-0">{label}</div>
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-20 text-right text-xs text-slate-700 font-medium shrink-0">{nokK(amount)}</div>
      <div className="w-10 text-right text-xs text-slate-400 shrink-0">{pct.toFixed(0)}%</div>
    </div>
  );
}

/* ── Translations ───────────────────────────────────────────────────────── */
type PitchLang = "no" | "en" | "es" | "de";
const PT = {
  no: {
    confidential:    "Konfidensielt investordokument · Tideron AS",
    sendBtn:         "Send til investor",
    pdfBtn:          "Last ned PDF",
    installedPower:  "Installert effekt",
    productionKpi:   "Produksjon (100% drift)",
    irrPre:          "IRR (før skatt)",
    payback:         "Tilbakebetaling",
    paybackUnit:     "år",
    prodNote:        "* Produksjon beregnet ved 100 % drift (24 t/dag · 365 dager). Faktisk produksjon avhenger av kapasitetsfaktor for anleggstypen.",
    sec01label:      "01 / Investeringscase",
    sec01head:       (navn: string, irr: string) => `${navn} leverer ${irr} IRR fra forutsigbar, lovregulert strømproduksjon — uten fossilt drivstoff og uten demning`,
    bullet1title:    "① Forutsigbar ressurs",
    bullet1body:     "Tidevann kan modelleres med minutts nøyaktighet 50+ år frem. Ressursrisikoen — typisk den største usikkerhetsfaktoren i fornybarprosjekter — er tilnærmet eliminert.",
    bullet2title:    "② Dokumentert teknologi",
    bullet2body:     "Waterotor er feltprøvd 2011–2021 med en dokumentert Cp på 0,42. Ingen prototype-risiko — vi installerer kommersiell teknologi i en kjent konfigurasjon.",
    sec02label:      "02 / Teknologi",
    sec02head:       "Waterotor er den eneste kommersielt bevist hydrokinetiske lavhastighetsturbinen på markedet — og den eneste som opererer lønnsomt under 1,5 m/s",
    cpLabel:         "Effektkoeff. Cp",
    cpSub:           "Tilnærmet Betz-optimal",
    opwindow:        "Driftsvindu",
    opwindowUnit:    "m/s strøm",
    testedSince:     "Testet siden",
    testedSub:       "Fullskala prototyper",
    cfLabel:         "Kapasitetsfaktor",
    cfSub:           "Tidevann, typisk",
    co2Label:        "CO₂ spart/år",
    co2Sub:          "vs dieselalternativ",
    techTblH:        ["Teknologi","LCOE (kr/kWh)","Forutsigbarhet","Basisbelastning","Krav til installasjon"],
    wRow:            ["Waterotor (dette prosjektet)", "Ingen demning/fundament"],
    dieselRow:       ["Dieselaggregat", "8–12", "Drivstofflogistikk"],
    windRow:         ["Havvind", "0,6–1,2", "Kystlinje, havbunnfeste"],
    solarRow:        ["Solcelle (Nord-Norge)", "0,8–2,0", "Stor flate, sesongavhengig"],
    hydroRow:        ["Konvensjonell vannkraft", "0,3–0,8", "Demningskonsesjon, geologi"],
    sec03label:      "03 / Lokasjon og konfigurasjon",
    sec03head:       (sted: string, avgV: string, antall: string, kw: string) => `${sted} gir ${avgV} og ${antall} for ${kw} installert effekt`,
    strømtype:       "Strømtype",
    gjennomsnitt:    "Gjennomsnittshastighet",
    antallRotorer:   "Antall rotorer",
    modeller:        "Modell(er)",
    installedPower2: "Installert effekt",
    capfaktor:       "Kapasitetsfaktor",
    arligProd:       "Årlig produksjon",
    co2perAr:        "CO₂-besparelse/år",
    sec04label:      "04 / Finansiell modell",
    sec04head:       (irr: string, payback: string) => `${irr} IRR og ${payback} års tilbakebetaling ved standard PPA-betingelser`,
    capex:           "CAPEX",
    opex:            "OPEX",
    revenue:         "Inntekt",
    netIncome:       "Netto (år 1)",
    lcoe:            "LCOE",
    irr:             "IRR (pre-tax)",
    irrPost:         "IRR (post-tax)",
    npv:             "NPV (8%, 20 år)",
    paybackFin:      "Tilbakebetaling",
    capexBreakdown:  "CAPEX-nedbryting",
    rotors:          "Rotorer",
    containers:      "Containere/infrastruktur",
    engineering:     "Ingeniør & installasjon",
    cashflowTitle:   "Kumulativ kontantstrøm (20 år)",
    sensiTitle:      "Sensitivitetsanalyse",
    scenario:        "Scenario",
    irrCol:          "IRR",
    tbCol:           "Tilbakebetaling",
    baseScen:        "Basisscenario",
    capexStress:     "CAPEX +20%",
    prodStress:      "Produksjon −20%",
    bothStress:      "Stresstest (begge)",
    ppaSection:      "PPA-kontrakt",
    ppaKjøper:       "Kjøper",
    ppaVolum:        "Volum",
    ppaPris:         "Pris",
    ppaStatus:       "Status",
    ppaStart:        "Oppstart",
    sec05label:      "05 / Marked og konkurrenter",
    sec05head:       "Det globale markedet for distribuert havenergi passerer 300 GW potensial — Waterotor adresserer det utstyrte segmentet under 2 m/s",
    sec06label:      "06 / Regulatorisk og ESG",
    sec06head:       "Prosjektet er utformet for å minimere regulatorisk risiko og maksimere positiv miljøpåvirkning",
    sec07label:      "07 / Neste steg",
    sec07head:       "Vi inviterer til en samtale om strategisk partnerskap eller prosjektfinansiering",
    sendTitle:       "Send til investor",
    sendEmail:       "Investor-e-post",
    sendName:        "Investornavn (valgfritt)",
    sendPitchType:   "Pitchtype",
    sendTeaser:      "Teaser (kortfattet)",
    sendFull:        "Fullstendig investorpitch",
    sendLinkOnly:    "Bare lenke",
    sendBtn2:        "Send nå",
    sending:         "Sender...",
    sendOk:          "✓ Sendt til investor!",
    sentTo:          "Sendt til",
    sentHistory:     "Utsendelseshistorikk",
    visitedLabel:    "Besøkt",
    notVisited:      "Ikke besøkt",
    visits:          "besøk",
    yrsUnit:         "år",
  },
  en: {
    confidential:    "Confidential investor document · Tideron AS",
    sendBtn:         "Send to investor",
    pdfBtn:          "Download PDF",
    installedPower:  "Installed power",
    productionKpi:   "Production (100% uptime)",
    irrPre:          "IRR (pre-tax)",
    payback:         "Payback period",
    paybackUnit:     "yrs",
    prodNote:        "* Production calculated at 100 % uptime (24 hrs/day · 365 days). Actual production depends on capacity factor for the installation type.",
    sec01label:      "01 / Investment case",
    sec01head:       (navn: string, irr: string) => `${navn} delivers ${irr} IRR from predictable, regulated power production — no fossil fuels and no dam`,
    bullet1title:    "① Predictable resource",
    bullet1body:     "Tidal flow can be modelled to minute accuracy 50+ years ahead. Resource risk — typically the largest uncertainty factor in renewable projects — is effectively eliminated.",
    bullet2title:    "② Proven technology",
    bullet2body:     "Waterotor has been field-tested 2011–2021 with a documented Cp of 0.42. No prototype risk — we install commercial technology in a known configuration.",
    sec02label:      "02 / Technology",
    sec02head:       "Waterotor is the only commercially proven low-velocity hydrokinetic turbine on the market — and the only one operating profitably below 1.5 m/s",
    cpLabel:         "Power coeff. Cp",
    cpSub:           "Near Betz-optimal",
    opwindow:        "Operating window",
    opwindowUnit:    "m/s current",
    testedSince:     "Tested since",
    testedSub:       "Full-scale prototypes",
    cfLabel:         "Capacity factor",
    cfSub:           "Tidal, typical",
    co2Label:        "CO₂ saved/yr",
    co2Sub:          "vs diesel alternative",
    techTblH:        ["Technology","LCOE (NOK/kWh)","Predictability","Base load","Installation requirements"],
    wRow:            ["Waterotor (this project)", "No dam / no foundation"],
    dieselRow:       ["Diesel generator", "8–12", "Fuel logistics"],
    windRow:         ["Offshore wind", "0.6–1.2", "Coastline, seabed anchoring"],
    solarRow:        ["Solar PV (North Norway)", "0.8–2.0", "Large area, seasonal"],
    hydroRow:        ["Conventional hydro", "0.3–0.8", "Dam licence, geology"],
    sec03label:      "03 / Site & configuration",
    sec03head:       (sted: string, avgV: string, antall: string, kw: string) => `${sted} provides ${avgV} and ${antall} for ${kw} installed power`,
    strømtype:       "Stream type",
    gjennomsnitt:    "Average velocity",
    antallRotorer:   "Number of rotors",
    modeller:        "Model(s)",
    installedPower2: "Installed power",
    capfaktor:       "Capacity factor",
    arligProd:       "Annual production",
    co2perAr:        "CO₂ savings/yr",
    sec04label:      "04 / Financial model",
    sec04head:       (irr: string, payback: string) => `${irr} IRR and ${payback}-year payback under standard PPA terms`,
    capex:           "CAPEX",
    opex:            "OPEX",
    revenue:         "Revenue",
    netIncome:       "Net income (yr 1)",
    lcoe:            "LCOE",
    irr:             "IRR (pre-tax)",
    irrPost:         "IRR (post-tax)",
    npv:             "NPV (8%, 20 yrs)",
    paybackFin:      "Payback",
    capexBreakdown:  "CAPEX breakdown",
    rotors:          "Rotors",
    containers:      "Containers / infrastructure",
    engineering:     "Engineering & installation",
    cashflowTitle:   "Cumulative cash flow (20 years)",
    sensiTitle:      "Sensitivity analysis",
    scenario:        "Scenario",
    irrCol:          "IRR",
    tbCol:           "Payback",
    baseScen:        "Base case",
    capexStress:     "CAPEX +20%",
    prodStress:      "Production −20%",
    bothStress:      "Stress test (both)",
    ppaSection:      "PPA contract",
    ppaKjøper:       "Buyer",
    ppaVolum:        "Volume",
    ppaPris:         "Price",
    ppaStatus:       "Status",
    ppaStart:        "Start",
    sec05label:      "05 / Market & competition",
    sec05head:       "The global market for distributed ocean energy exceeds 300 GW of potential — Waterotor addresses the underserved sub-2 m/s segment",
    sec06label:      "06 / Regulatory & ESG",
    sec06head:       "The project is designed to minimise regulatory risk and maximise positive environmental impact",
    sec07label:      "07 / Next steps",
    sec07head:       "We invite a conversation about strategic partnership or project financing",
    sendTitle:       "Send to investor",
    sendEmail:       "Investor email",
    sendName:        "Investor name (optional)",
    sendPitchType:   "Pitch type",
    sendTeaser:      "Teaser (brief overview)",
    sendFull:        "Full investor pitch",
    sendLinkOnly:    "Link only",
    sendBtn2:        "Send now",
    sending:         "Sending...",
    sendOk:          "✓ Sent to investor!",
    sentTo:          "Sent to",
    sentHistory:     "Send history",
    visitedLabel:    "Visited",
    notVisited:      "Not visited",
    visits:          "visits",
    yrsUnit:         "yrs",
  },
  es: {
    confidential:    "Documento confidencial para inversores · Tideron AS",
    sendBtn:         "Enviar al inversor",
    pdfBtn:          "Descargar PDF",
    installedPower:  "Potencia instalada",
    productionKpi:   "Producción (100% operación)",
    irrPre:          "TIR (antes de impuestos)",
    payback:         "Periodo de retorno",
    paybackUnit:     "años",
    prodNote:        "* Producción calculada al 100 % de operación (24 h/día · 365 días). La producción real depende del factor de capacidad del tipo de instalación.",
    sec01label:      "01 / Caso de inversión",
    sec01head:       (navn: string, irr: string) => `${navn} ofrece una TIR del ${irr} a partir de una producción eléctrica predecible y regulada — sin combustibles fósiles y sin presa`,
    bullet1title:    "① Recurso predecible",
    bullet1body:     "La corriente de marea puede modelarse con precisión de minutos durante más de 50 años. El riesgo de recurso — habitualmente el mayor factor de incertidumbre en proyectos renovables — queda prácticamente eliminado.",
    bullet2title:    "② Tecnología probada",
    bullet2body:     "Waterotor ha sido testado en campo entre 2011 y 2021 con un Cp documentado de 0,42. Sin riesgo de prototipo — instalamos tecnología comercial en una configuración conocida.",
    sec02label:      "02 / Tecnología",
    sec02head:       "Waterotor es la única turbina hidrocinética de baja velocidad con pruebas comerciales en el mercado — y la única que opera de forma rentable por debajo de 1,5 m/s",
    cpLabel:         "Coef. de potencia Cp",
    cpSub:           "Cercano al límite de Betz",
    opwindow:        "Ventana operativa",
    opwindowUnit:    "m/s corriente",
    testedSince:     "Probado desde",
    testedSub:       "Prototipos a escala real",
    cfLabel:         "Factor de capacidad",
    cfSub:           "Mareal, típico",
    co2Label:        "CO₂ ahorrado/año",
    co2Sub:          "vs alternativa diésel",
    techTblH:        ["Tecnología","LCOE (NOK/kWh)","Predecibilidad","Carga base","Requisitos de instalación"],
    wRow:            ["Waterotor (este proyecto)", "Sin presa / sin cimentación"],
    dieselRow:       ["Generador diésel", "8–12", "Logística de combustible"],
    windRow:         ["Eólica marina", "0,6–1,2", "Línea costera, fondeo marino"],
    solarRow:        ["Solar FV (norte frío)", "0,8–2,0", "Gran superficie, estacional"],
    hydroRow:        ["Hidroeléctrica convencional", "0,3–0,8", "Licencia de presa, geología"],
    sec03label:      "03 / Emplazamiento y configuración",
    sec03head:       (sted: string, avgV: string, antall: string, kw: string) => `${sted} proporciona ${avgV} y ${antall} para ${kw} de potencia instalada`,
    strømtype:       "Tipo de corriente",
    gjennomsnitt:    "Velocidad media",
    antallRotorer:   "Número de rotores",
    modeller:        "Modelo(s)",
    installedPower2: "Potencia instalada",
    capfaktor:       "Factor de capacidad",
    arligProd:       "Producción anual",
    co2perAr:        "Ahorro de CO₂/año",
    sec04label:      "04 / Modelo financiero",
    sec04head:       (irr: string, payback: string) => `TIR del ${irr} y retorno en ${payback} años en condiciones estándar de PPA`,
    capex:           "CAPEX",
    opex:            "OPEX",
    revenue:         "Ingresos",
    netIncome:       "Ingresos netos (año 1)",
    lcoe:            "LCOE",
    irr:             "TIR (pre-impuestos)",
    irrPost:         "TIR (post-impuestos)",
    npv:             "VAN (8%, 20 años)",
    paybackFin:      "Retorno",
    capexBreakdown:  "Desglose de CAPEX",
    rotors:          "Rotores",
    containers:      "Contenedores / infraestructura",
    engineering:     "Ingeniería e instalación",
    cashflowTitle:   "Flujo de caja acumulado (20 años)",
    sensiTitle:      "Análisis de sensibilidad",
    scenario:        "Escenario",
    irrCol:          "TIR",
    tbCol:           "Retorno",
    baseScen:        "Caso base",
    capexStress:     "CAPEX +20%",
    prodStress:      "Producción −20%",
    bothStress:      "Test de estrés (ambos)",
    ppaSection:      "Contrato PPA",
    ppaKjøper:       "Comprador",
    ppaVolum:        "Volumen",
    ppaPris:         "Precio",
    ppaStatus:       "Estado",
    ppaStart:        "Inicio",
    sec05label:      "05 / Mercado y competencia",
    sec05head:       "El mercado global de energía oceánica distribuida supera un potencial de 300 GW — Waterotor atiende el segmento desatendido por debajo de 2 m/s",
    sec06label:      "06 / Regulatorio y ESG",
    sec06head:       "El proyecto está diseñado para minimizar el riesgo regulatorio y maximizar el impacto ambiental positivo",
    sec07label:      "07 / Próximos pasos",
    sec07head:       "Invitamos a conversar sobre una alianza estratégica o financiación del proyecto",
    sendTitle:       "Enviar al inversor",
    sendEmail:       "Correo del inversor",
    sendName:        "Nombre del inversor (opcional)",
    sendPitchType:   "Tipo de pitch",
    sendTeaser:      "Teaser (resumen breve)",
    sendFull:        "Pitch completo para inversores",
    sendLinkOnly:    "Solo enlace",
    sendBtn2:        "Enviar ahora",
    sending:         "Enviando...",
    sendOk:          "✓ ¡Enviado al inversor!",
    sentTo:          "Enviado a",
    sentHistory:     "Historial de envíos",
    visitedLabel:    "Visitado",
    notVisited:      "No visitado",
    visits:          "visitas",
    yrsUnit:         "años",
  },
  de: {
    confidential:    "Vertrauliches Investorendokument · Tideron AS",
    sendBtn:         "An Investor senden",
    pdfBtn:          "PDF herunterladen",
    installedPower:  "Installierte Leistung",
    productionKpi:   "Produktion (100% Betrieb)",
    irrPre:          "IRR (vor Steuern)",
    payback:         "Amortisationszeit",
    paybackUnit:     "Jahre",
    prodNote:        "* Produktion berechnet bei 100 % Betrieb (24 Std./Tag · 365 Tage). Die tatsächliche Produktion hängt vom Kapazitätsfaktor des Anlagentyps ab.",
    sec01label:      "01 / Investitionsfall",
    sec01head:       (navn: string, irr: string) => `${navn} liefert ${irr} IRR aus vorhersehbarer, regulierter Stromerzeugung — ohne fossile Brennstoffe und ohne Damm`,
    bullet1title:    "① Vorhersehbare Ressource",
    bullet1body:     "Gezeitenströmungen können minutengenau 50+ Jahre im Voraus modelliert werden. Das Ressourcenrisiko — typischerweise der größte Unsicherheitsfaktor bei erneuerbaren Projekten — ist damit nahezu eliminiert.",
    bullet2title:    "② Bewährte Technologie",
    bullet2body:     "Waterotor wurde 2011–2021 im Feld getestet mit einem dokumentierten Cp von 0,42. Kein Prototyp-Risiko — wir installieren kommerzielle Technologie in einer bekannten Konfiguration.",
    sec02label:      "02 / Technologie",
    sec02head:       "Waterotor ist die einzige kommerziell bewährte Niedergeschwindigkeits-Hydrokinetik-Turbine auf dem Markt — und die einzige, die unter 1,5 m/s profitabel arbeitet",
    cpLabel:         "Leistungsbeiwert Cp",
    cpSub:           "Nahe Betz-Grenze",
    opwindow:        "Betriebsfenster",
    opwindowUnit:    "m/s Strömung",
    testedSince:     "Getestet seit",
    testedSub:       "Vollmaßstab-Prototypen",
    cfLabel:         "Kapazitätsfaktor",
    cfSub:           "Gezeit, typisch",
    co2Label:        "CO₂ gespart/Jahr",
    co2Sub:          "vs. Diesel-Alternative",
    techTblH:        ["Technologie","LCOE (NOK/kWh)","Vorhersehbarkeit","Grundlast","Installationsaufwand"],
    wRow:            ["Waterotor (dieses Projekt)", "Kein Damm / kein Fundament"],
    dieselRow:       ["Dieselgenerator", "8–12", "Kraftstofflogistik"],
    windRow:         ["Offshore-Wind", "0,6–1,2", "Küstenlinie, Meeresverankerung"],
    solarRow:        ["Photovoltaik (Norddeutschland)", "0,8–2,0", "Große Fläche, saisonal"],
    hydroRow:        ["Konventionelle Wasserkraft", "0,3–0,8", "Staudammgenehmigung, Geologie"],
    sec03label:      "03 / Standort & Konfiguration",
    sec03head:       (sted: string, avgV: string, antall: string, kw: string) => `${sted} bietet ${avgV} und ${antall} für ${kw} installierte Leistung`,
    strømtype:       "Strömungstyp",
    gjennomsnitt:    "Mittlere Geschwindigkeit",
    antallRotorer:   "Anzahl Rotoren",
    modeller:        "Modell(e)",
    installedPower2: "Installierte Leistung",
    capfaktor:       "Kapazitätsfaktor",
    arligProd:       "Jahresproduktion",
    co2perAr:        "CO₂-Einsparung/Jahr",
    sec04label:      "04 / Finanzmodell",
    sec04head:       (irr: string, payback: string) => `${irr} IRR und ${payback} Jahre Amortisation bei Standard-PPA-Bedingungen`,
    capex:           "CAPEX",
    opex:            "OPEX",
    revenue:         "Einnahmen",
    netIncome:       "Nettoeinkommen (Jahr 1)",
    lcoe:            "LCOE",
    irr:             "IRR (vor Steuern)",
    irrPost:         "IRR (nach Steuern)",
    npv:             "NPV (8%, 20 Jahre)",
    paybackFin:      "Amortisation",
    capexBreakdown:  "CAPEX-Aufschlüsselung",
    rotors:          "Rotoren",
    containers:      "Container / Infrastruktur",
    engineering:     "Engineering & Installation",
    cashflowTitle:   "Kumulierter Cashflow (20 Jahre)",
    sensiTitle:      "Sensitivitätsanalyse",
    scenario:        "Szenario",
    irrCol:          "IRR",
    tbCol:           "Amortisation",
    baseScen:        "Basisszenario",
    capexStress:     "CAPEX +20%",
    prodStress:      "Produktion −20%",
    bothStress:      "Stresstest (beide)",
    ppaSection:      "PPA-Vertrag",
    ppaKjøper:       "Abnehmer",
    ppaVolum:        "Volumen",
    ppaPris:         "Preis",
    ppaStatus:       "Status",
    ppaStart:        "Start",
    sec05label:      "05 / Markt & Wettbewerb",
    sec05head:       "Der globale Markt für dezentrale Meeresenergie überschreitet ein Potenzial von 300 GW — Waterotor adressiert das unterversorgte Sub-2-m/s-Segment",
    sec06label:      "06 / Regulatorisches & ESG",
    sec06head:       "Das Projekt ist darauf ausgerichtet, regulatorisches Risiko zu minimieren und positive Umweltauswirkungen zu maximieren",
    sec07label:      "07 / Nächste Schritte",
    sec07head:       "Wir laden zu einem Gespräch über strategische Partnerschaft oder Projektfinanzierung ein",
    sendTitle:       "An Investor senden",
    sendEmail:       "Investor-E-Mail",
    sendName:        "Investorname (optional)",
    sendPitchType:   "Pitch-Typ",
    sendTeaser:      "Teaser (Kurzübersicht)",
    sendFull:        "Vollständiger Investor-Pitch",
    sendLinkOnly:    "Nur Link",
    sendBtn2:        "Jetzt senden",
    sending:         "Wird gesendet...",
    sendOk:          "✓ An Investor gesendet!",
    sentTo:          "Gesendet an",
    sentHistory:     "Versandhistorie",
    visitedLabel:    "Besucht",
    notVisited:      "Nicht besucht",
    visits:          "Besuche",
    yrsUnit:         "Jahre",
  },
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   Investor pitch — McKinsey-stil
══════════════════════════════════════════════════════════════════════════ */
export function InvestorView({ prosjektId }: { prosjektId: string }) {
  const supabase = createClient();
  const [prosjekt,      setProsjekt]      = useState<any>(null);
  const [rotorer,       setRotorer]       = useState<any[]>([]);
  const [stream,        setStream]        = useState<any>(null);
  const [ppaKontrakter, setPpaKontrakter] = useState<any[]>([]);
  const [pitchModus,    setPitchModus]    = useState<"teaser" | "full" | null>(null);
  const [kopiert,       setKopiert]       = useState(false);
  const [utsendelser,   setUtsendelser]   = useState<any[]>([]);
  const [delModal,      setDelModal]      = useState(false);
  const [delForm,       setDelForm]       = useState({ epost: "", navn: "", pitch_type: "teaser" as "teaser" | "full" | "bare_lenke" });
  const [delSender,     setDelSender]     = useState(false);
  const [delSendt,      setDelSendt]      = useState(false);
  const [delFeil,       setDelFeil]       = useState("");
  const [lang,          setLang]          = useState<PitchLang>("no");

  useEffect(() => {
    Promise.all([
      supabase.from("projects").select("*").eq("id", prosjektId).single(),
      supabase.from("rotors").select("*").eq("project_id", prosjektId),
      supabase.from("streams").select("*").eq("project_id", prosjektId).maybeSingle(),
      supabase.from("ppa_contracts").select("*").eq("project_id", prosjektId).eq("status", "signert"),
      supabase.from("investor_tokens")
        .select("id,email,navn,pitch_type,sent_at,first_visited_at,last_visited_at,visit_count,token")
        .eq("project_id", prosjektId).order("sent_at", { ascending: false }),
    ]).then(([{ data: p }, { data: r }, { data: s }, { data: ppa }, { data: ut }]) => {
      setProsjekt(p); setRotorer(r ?? []); setStream(s);
      setPpaKontrakter(ppa ?? []); setUtsendelser(ut ?? []);
    });
  }, [prosjektId]);

  const sendDel = async (e: React.FormEvent) => {
    e.preventDefault();
    setDelSender(true); setDelFeil("");
    try {
      const pitchData: PitchData = {
        navn: prosjekt.navn, sted: prosjekt.sted ?? "—",
        landNavn: land?.name_en ?? "", flag: land?.flag ?? "",
        streamType, avgV, antall,
        totalKw, arligKwh, totalCapex,
        lcoe, irr, irrEs, tilbakebetaling,
        co2TonnAr, ppaKr, arligInntekt, arligOverskudd,
        dieselKrKwh, stadie: prosjekt.stadie ?? "Prospektering",
        npv, skattesats, energikilde,
      };
      const pitch_tekst = delForm.pitch_type === "teaser"
        ? genererTeaser(pitchData)
        : delForm.pitch_type === "full"
        ? genererFullPitch(pitchData)
        : null;
      const res = await fetch("/planner/api/varsler/investor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: prosjektId,
          investor_epost: delForm.epost,
          investor_navn: delForm.navn,
          pitch_tekst,
          pitch_type: delForm.pitch_type === "bare_lenke" ? null : delForm.pitch_type,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setDelFeil(err?.error ?? `HTTP ${res.status} — prøv igjen`);
        setDelSender(false); return;
      }
      setDelSendt(true);
      supabase.from("investor_tokens")
        .select("id,email,navn,pitch_type,sent_at,first_visited_at,last_visited_at,visit_count,token")
        .eq("project_id", prosjektId).order("sent_at", { ascending: false })
        .then(({ data }) => setUtsendelser(data ?? []));
      setTimeout(() => {
        setDelModal(false); setDelSendt(false);
        setDelForm({ epost: "", navn: "", pitch_type: "teaser" });
      }, 2500);
    } catch (err: any) {
      setDelFeil(err?.message ?? "Network error");
    } finally { setDelSender(false); }
  };

  // ── Odoo KPI-sync (best-effort, fire-and-forget) ──────────────────────────
  useEffect(() => {
    if (!prosjekt || !rotorer.length) return;
    const rho2     = rhoFraVanntype(prosjekt.vann_type);
    const avgV2    = stream?.avg_velocity_m_s ?? 0;
    const st2      = stream?.stream_type ?? "tidevann";
    const rotorData2 = rotorer.map(r => ({
      kwVed:      rotorKwVed(r, avgV2, rho2),
      kwNominell: rotorKwNominell(r),
      basispris:  (() => { const kw = rotorKwNominell(r); return kw > 0 ? kw * KR_PER_KW : KR_PER_KW * 5; })(),
    }));
    const kw2      = rotorData2.reduce((s, r) => s + r.kwVed, 0);
    if (kw2 <= 0) return;
    const kwh2     = beregnArligKwh(kw2, st2);
    const capex2   = rotorData2.reduce((s, r) => s + r.basispris, 0)
                   + beregnContainerCapex(rotorer.length, 80000) + 120000 + 200000;
    const ppa2     = ppaKontrakter.length > 0
      ? ppaKontrakter.reduce((s, p) => s + (p.pris_kr_kwh ?? 0), 0) / ppaKontrakter.length
      : 0.65;
    const skatt2   = (finnLand(prosjekt.country_code ?? "NO")?.corporate_tax_rate ?? 0.22);
    const opex2    = 48000;
    const ovsk2    = kwh2 * ppa2 - opex2;
    const cfs2     = [-capex2, ...Array(20).fill(ovsk2)];
    const irr2     = ovsk2 > 0 ? beregnIRR(cfs2)  : NaN;
    const npv2     = beregnNPV(0.08, cfs2);
    const lcoe2    = beregnLCOE(capex2, opex2, kwh2, 20, 0.08);
    const tb2      = ovsk2 > 0 ? capex2 / ovsk2 : Infinity;
    const co22     = kwh2 * (prosjekt.energikilde === "diesel" ? 0.65 : 0.28) / 1000;

    fetch("/planner/api/odoo/prosjekter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supabaseId:    prosjektId,
        navn:          prosjekt.navn,
        sted:          prosjekt.sted      ?? undefined,
        stadie:        prosjekt.stadie    ?? undefined,
        lat:           prosjekt.lat       ?? null,
        lon:           prosjekt.lon       ?? null,
        streamType:    st2,
        avgVelocity:   avgV2,
        installedKw:   kw2,
        annualKwh:     kwh2,
        irr:           isFinite(irr2)  ? irr2  : undefined,
        npv:           npv2,
        lcoe:          lcoe2 > 0       ? lcoe2 : undefined,
        capexNok:      capex2,
        paybackYr:     isFinite(tb2)   ? tb2   : undefined,
        co2TonnYr:     co22 > 0        ? co22  : undefined,
        ppaKrKwh:      ppa2,
        antallRotorer: rotorer.filter(r => r.lat && r.lon).length,
      }),
    }).catch(() => {/* best-effort */});
  }, [prosjektId, prosjekt, rotorer, stream, ppaKontrakter]);

  if (!prosjekt) return <div className="text-slate-400 text-sm">Laster...</div>;

  const t = PT[lang];
  const dateLocale = lang === "no" ? "nb-NO" : lang === "de" ? "de-DE" : lang === "es" ? "es-ES" : "en-GB";

  /* ── Beregninger ── */
  const land = finnLand(prosjekt.country_code ?? "NO");
  const skattesats = land?.corporate_tax_rate ?? 0.22;
  const rho = rhoFraVanntype(prosjekt?.vann_type);
  const avgV = stream?.avg_velocity_m_s ?? 0;
  const streamType = stream?.stream_type ?? "tidevann";

  const rotorData = rotorer.map(r => ({
    ...r,
    kwVed:      rotorKwVed(r, avgV, rho),
    kwNominell: rotorKwNominell(r),
    basispris:  (() => { const kw = rotorKwNominell(r); return kw > 0 ? kw * KR_PER_KW : KR_PER_KW * 5; })(),
  }));

  const totalKw       = rotorData.reduce((s, r) => s + r.kwVed, 0);
  const antall        = rotorer.length;
  const arligKwh      = totalKw > 0 ? beregnArligKwh(totalKw, streamType) : 0;
  const rotorCapex    = rotorData.reduce((s, r) => s + r.basispris, 0);
  const containerCapex = beregnContainerCapex(antall, 80000);
  const totalCapex    = rotorCapex + containerCapex + 120000 + 200000;

  const ppaKr = ppaKontrakter.length > 0
    ? ppaKontrakter.reduce((s, p) => s + (p.pris_kr_kwh ?? 0), 0) / ppaKontrakter.length
    : 0.65;
  const opex           = 48000;
  const arligInntekt   = arligKwh * ppaKr;
  const arligOverskudd = arligInntekt - opex;

  const cfs   = [-totalCapex, ...Array(20).fill(arligOverskudd)];
  const cfsEs = beregnEtterSkattCashflows(totalCapex, arligOverskudd, 20, skattesats);
  const irr   = arligOverskudd > 0 ? beregnIRR(cfs)   : NaN;
  const irrEs = arligOverskudd > 0 ? beregnIRR(cfsEs) : NaN;
  const npv   = beregnNPV(0.08, cfs);
  const lcoe  = totalKw > 0 ? beregnLCOE(totalCapex, opex, arligKwh, 20, 0.08) : 0;
  const tilbakebetaling = arligOverskudd > 0 ? totalCapex / arligOverskudd : Infinity;

  const energikilde      = prosjekt.energikilde ?? "grid";
  const erDiesel         = energikilde === "diesel";
  const sammenligningKr  = prosjekt.sammenligning_kr_kwh ?? 1.2;
  // CO₂-faktorer: diesel ≈ 0.65 kg/kWh (generator), nett ≈ 0.28 kg/kWh (EU-snitt)
  const co2FaktorKgKwh   = erDiesel ? 0.65 : 0.28;
  const co2TonnAr        = arligKwh * co2FaktorKgKwh / 1000;
  const dieselKrKwh      = sammenligningKr;    // beholdt navn for bakoverkompatibilitet
  const dieselSparing    = arligKwh * (dieselKrKwh - ppaKr);
  const cf = totalKw > 0 && arligKwh > 0
    ? Math.round(arligKwh / (totalKw * 8760) * 100) : 0;

  const plassert = rotorer.filter(r => r.lat && r.lon);
  const centerLat = prosjekt.lat ?? plassert[0]?.lat ?? null;
  const centerLon = prosjekt.lon ?? plassert[0]?.lon ?? null;

  const date = new Date().toLocaleDateString(dateLocale, { month: "long", year: "numeric" });

  // Sensitivity scenarios
  const sensRows = [
    { label: t.baseScen,          capexF: 1.0, prodF: 1.0 },
    { label: t.capexStress,       capexF: 1.2, prodF: 1.0 },
    { label: t.prodStress,        capexF: 1.0, prodF: 0.8 },
    { label: t.bothStress,        capexF: 1.2, prodF: 0.8 },
  ].map(s => {
    const cap = totalCapex * s.capexF;
    const kwh = arligKwh * s.prodF;
    const ovsk = kwh * ppaKr - opex;
    const cfsS = [-cap, ...Array(20).fill(ovsk)];
    const irrS = ovsk > 0 ? beregnIRR(cfsS) : NaN;
    const tb = ovsk > 0 ? cap / ovsk : Infinity;
    return { ...s, irr: irrS, tb };
  });

  const pitchData: PitchData = {
    navn: prosjekt.navn, sted: prosjekt.sted ?? "—",
    landNavn: land?.name_en ?? "", flag: land?.flag ?? "",
    streamType, avgV, antall, totalKw, arligKwh, totalCapex,
    lcoe, irr, irrEs, tilbakebetaling, co2TonnAr, ppaKr,
    arligInntekt, arligOverskudd, dieselKrKwh,
    stadie: prosjekt.stadie ?? "Prospektering", npv, skattesats,
    energikilde,
  };

  const irrFmt = (v: number) =>
    isFinite(v) && v > -1 && v < 50 ? `${(v * 100).toFixed(1)} %` : "—";

  /* ═══════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════ */
  return (
    <>
      <style>{`
        @page { margin: 14mm 10mm 14mm 16mm; size: A4; }
        @media print {
          nav, aside, header, [data-no-print] { display: none !important; }
          body { background: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          main { padding: 0 !important; width: 100% !important; overflow: visible !important; }
          .pitch-doc { padding: 0 !important; max-width: 100% !important; box-shadow: none !important; border: none !important; border-radius: 0 !important; }
          .pitch-section { page-break-inside: avoid; break-inside: avoid; }
          h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
          img { max-width: 100% !important; }
          /* Hide screen stripe/watermark during print */
          .pitch-stripe { display: none !important; }
          .pitch-watermark { display: none !important; }
          /* Left stripe — repeats on every printed page via position:fixed */
          [data-print-stripe] { display: flex !important; position: fixed; left: 0; top: 0; bottom: 0; width: 10px; z-index: 9999; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          [data-print-stripe] .pitch-stripe-navy  { width: 4px; background: #0F2A5A !important; height: 100vh; }
          [data-print-stripe] .pitch-stripe-green { width: 3px; background: #3A8A52 !important; height: 100vh; }
          [data-print-stripe] .pitch-stripe-gold  { width: 3px; background: #F5A623 !important; height: 100vh; }
          /* Logo watermark top-right — repeats on every page */
          [data-print-watermark] { display: block !important; position: fixed; top: 18px; right: 18px; z-index: 9998; opacity: 0.055; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
        .pitch-doc { font-family: 'Inter', sans-serif; }
        /* Screen stripe */
        .pitch-stripe { position: absolute; left: 0; top: 0; bottom: 0; width: 10px; display: flex; z-index: 10; }
        .pitch-stripe-navy  { width: 4px; background: #0F2A5A; }
        .pitch-stripe-green { width: 3px; background: #3A8A52; }
        .pitch-stripe-gold  { width: 3px; background: #F5A623; }
        .pitch-watermark { position: absolute; top: 18px; right: 18px; z-index: 5; opacity: 0.055; pointer-events: none; }
      `}</style>

      {/* ── Toolbar (ikke-print) ── */}
      <div data-no-print className="flex justify-between mb-6 gap-3">
        {/* Language toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-semibold">
          {(["no","en","es","de"] as PitchLang[]).map((l, i) => (
            <button key={l} onClick={() => setLang(l)}
              className={`px-3 py-2 transition-colors ${lang === l ? "bg-[#0F2A5A] text-white" : "bg-white text-slate-500 hover:bg-slate-50"} ${i > 0 ? "border-l border-slate-200" : ""}`}>
              {l === "no" ? "🇳🇴 NO" : l === "en" ? "🇬🇧 EN" : l === "es" ? "🇪🇸 ES" : "🇩🇪 DE"}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => setDelModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            {t.sendBtn}
          </button>
          <button
            onClick={() => {
              const prev = document.title;
              document.title = `Investorpitch – ${prosjekt.navn}`;
              window.print();
              document.title = prev;
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ background: "#0F2A5A" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            {t.pdfBtn}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          PITCH-DOKUMENT
      ══════════════════════════════════════════════════════════ */}
      <div className="pitch-doc bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden" style={{ position: "relative" }}>

        {/* Left accent stripes — screen (position:absolute on wrapper) */}
        <div className="pitch-stripe" aria-hidden="true">
          <div className="pitch-stripe-navy" />
          <div className="pitch-stripe-green" />
          <div className="pitch-stripe-gold" />
        </div>
        {/* Logo watermark top-right — screen */}
        <div className="pitch-watermark" aria-hidden="true">
          <Image src="/logo.png" alt="" width={130} height={121} style={{ filter: "saturate(0)" }} />
        </div>

        {/* Print-only fixed stripe + watermark — hidden on screen, shown via @media print */}
        <div aria-hidden="true" data-print-stripe>
          <div className="pitch-stripe-navy" />
          <div className="pitch-stripe-green" />
          <div className="pitch-stripe-gold" />
        </div>
        <div aria-hidden="true" data-print-watermark>
          <Image src="/logo.png" alt="" width={130} height={121} style={{ filter: "saturate(0)" }} />
        </div>

        {/* ── FORSIDE ── */}
        <div style={{ background: "white", padding: "44px 40px 36px 56px", borderBottom: "2px solid #f1f5f9", position: "relative" }}>
          {/* Header row: title left, logo right */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
            <div>
              <p style={{ fontSize: 9, letterSpacing: "0.20em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 14 }}>
                {t.confidential}
              </p>
              <h1 style={{ fontSize: 38, fontWeight: 800, color: "#0F2A5A", lineHeight: 1.05, letterSpacing: "-0.01em", marginBottom: 10 }}>
                {prosjekt.navn}
              </h1>
              <p style={{ fontSize: 15, color: "#64748b" }}>
                {prosjekt.sted}{land ? ` · ${land.flag} ${land.name_en}` : ""}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
              <Image src="/logo.png" alt="Tideron" width={110} height={102} style={{ height: 38, width: "auto" }} priority />
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{date}</div>
              {prosjekt.stadie && (
                <div style={{ padding: "3px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: "rgba(15,42,90,0.07)", color: "#0F2A5A", letterSpacing: "0.04em" }}>
                  {prosjekt.stadie}
                </div>
              )}
            </div>
          </div>

          {/* Tri-color gradient divider */}
          <div style={{ height: 3, background: "linear-gradient(to right, #0F2A5A 0%, #0F2A5A 40%, #3A8A52 60%, #F5A623 100%)", marginBottom: 28, borderRadius: 2 }} />

          {/* Nøkkeltall-strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: "#e2e8f0", borderRadius: 10, overflow: "hidden" }}>
            {[
              { label: t.installedPower,  val: totalKw > 0 ? fmtKwT(totalKw)                          : "—", unit: "" },
              { label: t.productionKpi,   val: totalKw > 0 ? fmtKwhT(totalKw * 8760)                  : "—", unit: "/yr" },
              { label: t.irrPre,          val: isFinite(irr) && irr > -1 ? `${(irr*100).toFixed(1)}` : "—", unit: isFinite(irr) && irr > -1 ? "%" : "" },
              { label: t.capex,           val: nokK(totalCapex),                                              unit: "" },
              { label: t.payback,         val: isFinite(tilbakebetaling) ? tilbakebetaling.toFixed(1): "—", unit: isFinite(tilbakebetaling) ? ` ${t.paybackUnit}` : "" },
            ].map((k, i) => (
              <div key={i} style={{ padding: "16px 18px", background: i === 2 && isFinite(irr) && irr > 0.15 ? "rgba(15,42,90,0.04)" : "white" }}>
                <p style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "#94a3b8", marginBottom: 6 }}>{k.label}</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: "#0F2A5A", lineHeight: 1 }}>
                  {k.val}<span style={{ fontSize: 13, fontWeight: 500, color: "#94a3b8", marginLeft: 2 }}>{k.unit}</span>
                </p>
              </div>
            ))}
          </div>
          {totalKw > 0 && (
            <p style={{ fontSize: 9, color: "#cbd5e1", marginTop: 8, textAlign: "right", letterSpacing: "0.03em" }}>
              {t.prodNote}
            </p>
          )}
        </div>

        <div className="px-10" style={{ paddingLeft: 56 }}>

          {/* ── 1. INVESTERINGSCASE ── */}
          <McSection
            label={t.sec01label}
            headline={t.sec01head(prosjekt.navn, isFinite(irr) && irr > -1 ? `${(irr*100).toFixed(0)} %` : (lang === "no" ? "sterk" : lang === "de" ? "starker" : lang === "es" ? "fuerte" : "strong"))}
          >
            <div className="grid grid-cols-3 gap-8">
              <div className="border-l-4 border-[#0F2A5A] pl-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-[#0F2A5A] uppercase tracking-wide mb-1">{t.bullet1title}</p>
                  <p className="text-sm text-slate-600 leading-relaxed">{t.bullet1body}</p>
                </div>
              </div>
              <div className="border-l-4 border-[#5FAFD7] pl-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-[#0F2A5A] uppercase tracking-wide mb-1">{t.bullet2title}</p>
                  <p className="text-sm text-slate-600 leading-relaxed">{t.bullet2body}</p>
                </div>
              </div>
            </div>
          </McSection>

          {/* ── 2. TEKNOLOGIDIFFERENSIERING ── */}
          <McSection
            label={t.sec02label}
            headline={t.sec02head}
            className="pitch-section"
          >
            <div className="grid grid-cols-5 gap-4 mb-6">
              {[
                { label: t.cpLabel,    val: "0.42", sub: t.cpSub },
                { label: t.opwindow,   val: "0.7–2.5", sub: t.opwindowUnit },
                { label: t.testedSince,val: "2011",    sub: t.testedSub },
                { label: t.cfLabel,    val: cf > 0 ? `${cf} %` : "~30 %", sub: t.cfSub },
                { label: t.co2Label,   val: co2TonnAr > 0 ? `${Math.round(co2TonnAr)} t` : "—", sub: t.co2Sub },
              ].map(k => (
                <div key={k.label} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">{k.label}</p>
                  <p className="text-xl font-bold text-[#0F2A5A]">{k.val}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>
                </div>
              ))}
            </div>

            {/* Sammenligningstabell */}
            <div className="overflow-hidden border border-slate-200 rounded-lg">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #0F2A5A" }}>
                    {t.techTblH.map((h, i) => (
                      <th key={h} style={{
                        padding: "9px 14px", textAlign: i === 0 ? "left" : "center",
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                        textTransform: "uppercase", color: "#0F2A5A",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { tech: t.wRow[0],     lcoe: lcoe > 0 ? lcoe.toFixed(2) : "0.40–0.80", pred: "★★★★★", base: "★★★★★", krav: t.wRow[1],     highlight: true },
                    { tech: t.dieselRow[0],lcoe: t.dieselRow[1],  pred: "★★★★",  base: "★★★★★", krav: t.dieselRow[2],  highlight: false },
                    { tech: t.windRow[0],  lcoe: t.windRow[1],    pred: "★★★",   base: "★★",   krav: t.windRow[2],    highlight: false },
                    { tech: t.solarRow[0], lcoe: t.solarRow[1],   pred: "★★",    base: "★",    krav: t.solarRow[2],   highlight: false },
                    { tech: t.hydroRow[0], lcoe: t.hydroRow[1],   pred: "★★★★★", base: "★★★★★", krav: t.hydroRow[2],  highlight: false },
                  ].map((r, i) => (
                    <tr key={r.tech} style={{
                      background: r.highlight ? "rgba(15,42,90,0.04)" : i % 2 === 0 ? "#fff" : "#fafafa",
                      borderTop: "1px solid #f1f5f9",
                    }}>
                      <td style={{ padding: "9px 14px", fontWeight: r.highlight ? 700 : 400, color: r.highlight ? "#0F2A5A" : "#334155" }}>
                        {r.highlight && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#059669] mr-2 mb-0.5" />}
                        {r.tech}
                      </td>
                      <td style={{ padding: "9px 14px", textAlign: "center", fontWeight: r.highlight ? 700 : 400, color: r.highlight ? "#059669" : "#475569" }}>{r.lcoe}</td>
                      <td style={{ padding: "9px 14px", textAlign: "center", fontSize: 13 }}>{r.pred}</td>
                      <td style={{ padding: "9px 14px", textAlign: "center", fontSize: 13 }}>{r.base}</td>
                      <td style={{ padding: "9px 14px", textAlign: "center", fontSize: 12, color: "#64748b" }}>{r.krav}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </McSection>

          {/* ── 3. LOKASJON OG ANLEGG ── */}
          <McSection
            label={t.sec03label}
            headline={t.sec03head(
              prosjekt.sted ?? "—",
              avgV > 0 ? `${avgV.toFixed(2)} m/s` : "—",
              antall > 0 ? `${antall}` : "—",
              fmtKwT(totalKw)
            )}
            className="pitch-section"
          >
            <div className="grid grid-cols-2 gap-8">
              {/* Kart */}
              <div>
                {centerLat && centerLon ? (
                  <RapportKart
                    centerLat={+centerLat}
                    centerLon={+centerLon}
                    height={240}
                    rotorer={plassert.map(r => ({
                      lat: +r.lat, lon: +r.lon, modell: r.modell ?? "Waterotor",
                      kw: r.nominell_kw_1_8 ?? null,
                      diameter_m: r.diameter_m, rotor_type: r.rotor_type,
                    }))}
                    visFormer={plassert.length > 0}
                  />
                ) : (
                  <div className="h-60 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center text-sm text-slate-400">
                    Ingen koordinater registrert ennå
                  </div>
                )}
              </div>
              {/* Spesifikasjoner */}
              <div className="space-y-0">
                {[
                  { k: t.strømtype,      v: streamType === "tidevann" ? "Tidal" : streamType === "elv" ? "River" : "Ocean current" },
                  { k: t.gjennomsnitt,   v: avgV > 0 ? `${avgV.toFixed(3)} m/s` : "—" },
                  { k: t.antallRotorer,  v: antall > 0 ? `${antall}` : "—" },
                  { k: t.modeller,       v: Array.from(new Set(rotorer.map(r => r.modell))).join(", ") || "—" },
                  { k: t.installedPower2,v: totalKw > 0 ? fmtKwT(totalKw) : "—" },
                  { k: t.capfaktor,      v: cf > 0 ? `${cf} %` : "—" },
                  { k: t.arligProd,      v: arligKwh > 0 ? fmtKwhT(arligKwh) : "—" },
                  { k: t.co2perAr,       v: co2TonnAr > 0 ? `~${Math.round(co2TonnAr)} t` : "—" },
                ].map(({ k, v }, i) => (
                  <div key={k} className="flex items-center justify-between py-2.5"
                    style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <dt className="text-sm text-slate-400">{k}</dt>
                    <dd className="text-sm font-semibold text-slate-900">{v}</dd>
                  </div>
                ))}
                {dieselSparing > 0 && (
                  <div className="mt-4 bg-amber-50 rounded-lg px-4 py-3 border border-amber-100">
                    <p className="text-xs text-amber-700 font-semibold">
                      Arlig besparelse for kraftkjøper: {nokK(dieselSparing)}
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      vs {dieselKrKwh} kr/kWh {erDiesel ? "dieselgenerering" : "nettstrøm"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </McSection>

          {/* ── 4. FINANSIELL MODELL ── */}
          <McSection
            label={t.sec04label}
            headline={t.sec04head(isFinite(irr) && irr > -1 ? `${(irr*100).toFixed(1)} %` : "—", isFinite(tilbakebetaling) ? tilbakebetaling.toFixed(1) : "—")}
            className="pitch-section"
          >
            <div className="grid grid-cols-3 gap-8">
              {/* CAPEX */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-4">{t.capexBreakdown}</p>
                <div className="space-y-3">
                  <CapexBar label={t.rotors}      amount={totalCapex * 0.65} total={totalCapex} color="#0F2A5A" />
                  <CapexBar label={t.containers}  amount={totalCapex * 0.15} total={totalCapex} color="#5FAFD7" />
                  <CapexBar label={t.engineering} amount={totalCapex * 0.20} total={totalCapex} color="#7C3AED" />
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between text-sm">
                  <span className="font-semibold text-slate-700">Total {t.capex}</span>
                  <span className="font-bold text-[#0F2A5A]">{nokK(totalCapex)}</span>
                </div>
              </div>

              {/* Driftsøkonomi */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-4">{t.netIncome}</p>
                <div className="space-y-2">
                  {[
                    { k: `${t.revenue} (PPA ${ppaKr.toFixed(2)} NOK/kWh)`, v: nokK(arligInntekt), color: "#059669" },
                    { k: `${t.opex}`,                                        v: `− ${nokK(opex)}`,  color: "#DC2626" },
                    { k: "EBITDA",                                            v: nokK(arligOverskudd), color: arligOverskudd > 0 ? "#059669" : "#DC2626", bold: true },
                  ].map(({ k, v, color, bold }) => (
                    <div key={k} className="flex justify-between py-2" style={{ borderBottom: "1px solid #f8fafc" }}>
                      <span className="text-sm text-slate-500">{k}</span>
                      <span className={`text-sm ${bold ? "font-bold" : "font-medium"}`} style={{ color }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 bg-slate-50 rounded-lg px-4 py-3 border border-slate-100 space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>PPA</span>
                    <span className="font-medium text-slate-600">
                      {ppaKontrakter.length > 0 ? `Signed (${ppaKontrakter.length})` : "Est. (0.65 NOK/kWh)"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{lang === "no" ? "Levetid" : lang === "de" ? "Laufzeit" : lang === "es" ? "Vida útil" : "Lifetime"}</span>
                    <span className="font-medium text-slate-600">20 {t.yrsUnit}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{lang === "no" ? "Bedriftsskatt" : lang === "de" ? "Körperschaftsteuer" : lang === "es" ? "Impuesto de sociedades" : "Corp. tax"}</span>
                    <span className="font-medium text-slate-600">{(skattesats * 100).toFixed(0)} % ({land?.name_en ?? "NO"})</span>
                  </div>
                </div>
              </div>

              {/* Avkastning */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-4">{lang === "no" ? "Avkastning" : lang === "de" ? "Rendite" : lang === "es" ? "Rendimiento" : "Returns"}</p>
                <div className="space-y-4">
                  <BigMetric label={t.irr}     value={irrFmt(irr)} positive={isFinite(irr) && irr > 0.15} />
                  <BigMetric label={t.irrPost} value={irrFmt(irrEs)} />
                  <BigMetric label={t.npv}     value={nokK(npv)} positive={npv > 0} />
                  <BigMetric label={t.lcoe}    value={lcoe > 0 ? `${lcoe.toFixed(2)} NOK/kWh` : "—"} />
                  <BigMetric label={t.paybackFin} value={isFinite(tilbakebetaling) ? `${tilbakebetaling.toFixed(1)} ${t.yrsUnit}` : "—"} />
                </div>
              </div>
            </div>
          </McSection>

          {/* ── 5. KONTANTSTRØM 20 ÅR ── */}
          <McSection
            label={t.cashflowTitle}
            headline={
              isFinite(tilbakebetaling)
                ? lang === "de"
                  ? `Das Projekt erreicht positiven Cashflow ab Jahr ${Math.ceil(tilbakebetaling)} und generiert ${nokK(npv)} NPV über die Laufzeit`
                  : lang === "es"
                  ? `El proyecto genera flujo de caja positivo desde el año ${Math.ceil(tilbakebetaling)} y genera ${nokK(npv)} VAN a lo largo de la vida útil`
                  : lang === "en"
                  ? `The project turns cash-flow positive in year ${Math.ceil(tilbakebetaling)} and generates ${nokK(npv)} NPV over its lifetime`
                  : `Prosjektet er kontantstrøm-positivt fra år ${Math.ceil(tilbakebetaling)} og genererer ${nokK(npv)} netto nåverdi over levetiden`
                : lang === "de"
                  ? "Kumulierter Cashflow über 20 Jahre im Basisszenario"
                  : lang === "es"
                  ? "Flujo de caja acumulado a 20 años en el escenario base"
                  : lang === "en"
                  ? "Cumulative cash flow over 20 years at base case"
                  : "Kumulativ kontantstrøm over 20 år ved basisscenario"
            }
            className="pitch-section"
          >
            <CashFlowChart totalCapex={totalCapex} arligOverskudd={arligOverskudd} />
            <div className="flex gap-6 mt-3 text-xs text-slate-400">
              <span><span className="inline-block w-3 h-0.5 bg-[#0F2A5A] mr-1.5 rounded" style={{ verticalAlign: "middle" }} />
                {lang === "de" ? "Kumulierter Cashflow" : lang === "es" ? "Flujo de caja acumulado" : lang === "en" ? "Cumulative cash flow" : "Kumulativ kontantstrøm"}
              </span>
              <span><span className="inline-block w-3 h-2 bg-[#D1FAE5] mr-1.5 rounded" style={{ verticalAlign: "middle" }} />
                {lang === "de" ? "Positiver Bereich" : lang === "es" ? "Territorio positivo" : lang === "en" ? "Positive territory" : "Positivt territorium"}
              </span>
              <span><span className="inline-block w-3 h-2 bg-[#FEE2E2] mr-1.5 rounded" style={{ verticalAlign: "middle" }} />
                {lang === "de" ? "Negativer Bereich" : lang === "es" ? "Territorio negativo" : lang === "en" ? "Negative territory" : "Negativt territorium"}
              </span>
            </div>
          </McSection>

          {/* ── 6. SENSITIVITETSANALYSE ── */}
          <McSection
            label={t.sensiTitle}
            headline={
              lang === "de" ? "Die IRR ist robust gegenüber den wichtigsten Risiken — selbst im Stresstest liefert das Projekt positive Renditen"
              : lang === "es" ? "La TIR es robusta frente a los principales riesgos — incluso en el escenario de estrés el proyecto ofrece rendimientos positivos"
              : lang === "en" ? "IRR is robust against the key risks — even in stress-test the project delivers positive returns"
              : "IRR-en er robust mot de viktigste risikoene — selv i stresstest leverer prosjektet positiv avkastning"
            }
            className="pitch-section"
          >
            <div className="overflow-hidden border border-slate-200 rounded-lg">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    {[t.scenario,
                      lang === "de" ? "CAPEX-Faktor" : lang === "es" ? "Factor CAPEX" : lang === "en" ? "CAPEX factor" : "CAPEX-faktor",
                      lang === "de" ? "Produktionsfaktor" : lang === "es" ? "Factor de producción" : lang === "en" ? "Production factor" : "Produksjonsfaktor",
                      t.irrCol, t.tbCol].map((h, i) => (
                      <th key={h} style={{
                        padding: "9px 14px", textAlign: i === 0 ? "left" : "center",
                        fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                        textTransform: "uppercase", color: "#94a3b8",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sensRows.map((r, i) => (
                    <tr key={r.label} style={{
                      borderTop: "1px solid #f1f5f9",
                      background: i === 0 ? "rgba(15,42,90,0.04)" : i % 2 === 0 ? "#fff" : "#fafafa",
                    }}>
                      <td style={{ padding: "9px 14px", fontWeight: i === 0 ? 700 : 400, color: "#334155" }}>{r.label}</td>
                      <td style={{ padding: "9px 14px", textAlign: "center", color: "#64748b" }}>
                        {r.capexF === 1.0 ? "100 %" : `+${Math.round((r.capexF - 1) * 100)} %`}
                      </td>
                      <td style={{ padding: "9px 14px", textAlign: "center", color: "#64748b" }}>
                        {r.prodF === 1.0 ? "100 %" : `${Math.round((r.prodF - 1) * 100)} %`}
                      </td>
                      <td style={{ padding: "9px 14px", textAlign: "center", fontWeight: 600,
                        color: isFinite(r.irr) && r.irr > 0 ? "#059669" : "#DC2626" }}>
                        {irrFmt(r.irr)}
                      </td>
                      <td style={{ padding: "9px 14px", textAlign: "center", color: "#64748b" }}>
                        {isFinite(r.tb) ? `${r.tb.toFixed(1)} ${t.yrsUnit}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </McSection>

          {/* ── 7. RISIKOREGISTER ── */}
          <McSection
            label={lang === "de" ? "07 / Risiken" : lang === "es" ? "07 / Riesgos" : lang === "en" ? "07 / Risk register" : "07 / Risiko"}
            headline={
              lang === "de" ? "Regulatorisches und technisches Risiko sind gering und bekannt — das Ressourcenrisiko ist strukturell niedriger als bei allen anderen erneuerbaren Technologien"
              : lang === "es" ? "El riesgo regulatorio y técnico es bajo e identificado — el riesgo de recurso es estructuralmente menor que en todas las demás tecnologías renovables"
              : lang === "en" ? "Regulatory and technical risk are low and identified — resource risk is structurally lower than for all other renewable technologies"
              : "Regulatorisk og teknisk risiko er lav og identifisert — ressursrisikoen er strukturelt lavere enn for alle andre fornybarteknologier"
            }
            className="pitch-section"
          >
            <div className="overflow-hidden border border-slate-200 rounded-lg">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    {[
                      lang === "de" ? "Risikofaktor" : lang === "es" ? "Factor de riesgo" : lang === "en" ? "Risk factor" : "Risikofaktor",
                      lang === "de" ? "Wahrscheinlichkeit" : lang === "es" ? "Probabilidad" : lang === "en" ? "Likelihood" : "Sannsynlighet",
                      lang === "de" ? "Auswirkung" : lang === "es" ? "Impacto" : lang === "en" ? "Impact" : "Effekt",
                      lang === "de" ? "Maßnahme" : lang === "es" ? "Mitigación" : lang === "en" ? "Mitigation" : "Mitigering",
                    ].map((h, i) => (
                      <th key={h} style={{
                        padding: "9px 14px", textAlign: i === 0 ? "left" : i < 3 ? "center" : "left",
                        fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                        textTransform: "uppercase", color: "#94a3b8",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const lv = { low: "#059669", med: "#D97706", high: "#DC2626" };
                    const lvLabel = (l: "low"|"med"|"high") =>
                      l === "low"  ? (lang === "de" ? "Niedrig" : lang === "es" ? "Bajo"   : lang === "en" ? "Low"    : "Lav")
                      : l === "med" ? (lang === "de" ? "Mittel"  : lang === "es" ? "Medio"  : lang === "en" ? "Medium" : "Middels")
                      :               (lang === "de" ? "Hoch"    : lang === "es" ? "Alto"   : lang === "en" ? "High"   : "Høy");
                    const rows: { risiko: string; sann: "low"|"med"|"high"; eff: "low"|"med"|"high"; mit: string }[] = lang === "de" ? [
                      { risiko: "Geringere Strömung als modelliert", sann: "med",  eff: "med",  mit: "Gezeitendaten von Kartverket + NVE, historisch validiert" },
                      { risiko: "PPA-Abnehmer säumig",              sann: "low",  eff: "high", mit: "Flexible PPA-Struktur, Batterie als Puffermaßnahme" },
                      { risiko: "Regulatorische Verzögerungen",     sann: "med",  eff: "med",  mit: "Frühzeitiger Dialog mit NVE; keine Staudamm-Konzession erforderlich" },
                      { risiko: "Technischer Ausfall",              sann: "low",  eff: "med",  mit: "Waterotor felderprobt 2011–2021; modularer Austausch" },
                      { risiko: "Kostenüberschreitung",             sann: "med",  eff: "med",  mit: "Festpreisverträge mit Lieferant; 10 % Reserve im CAPEX" },
                    ] : lang === "es" ? [
                      { risiko: "Corriente inferior a la modelizada", sann: "med",  eff: "med",  mit: "Datos mareales de Kartverket + NVE, validados históricamente" },
                      { risiko: "Incumplimiento del comprador PPA",   sann: "low",  eff: "high", mit: "Estructura PPA flexible, batería como medida de amortiguación" },
                      { risiko: "Retrasos regulatorios",             sann: "med",  eff: "med",  mit: "Diálogo temprano con NVE; no se requiere licencia de presa" },
                      { risiko: "Avería técnica / parada",           sann: "low",  eff: "med",  mit: "Waterotor probado en campo 2011–2021; sustitución modular" },
                      { risiko: "Sobrecosto",                        sann: "med",  eff: "med",  mit: "Contratos de precio fijo con proveedor; 10 % reserva en CAPEX" },
                    ] : lang === "en" ? [
                      { risiko: "Lower flow than modelled",   sann: "med",  eff: "med",  mit: "Tidal data from Kartverket + NVE validated against historical records" },
                      { risiko: "PPA buyer defaults",         sann: "low",  eff: "high", mit: "Flexible PPA structure, battery as buffer measure" },
                      { risiko: "Regulatory delays",          sann: "med",  eff: "med",  mit: "Early dialogue with NVE; no dam licence required" },
                      { risiko: "Technical failure / outage", sann: "low",  eff: "med",  mit: "Waterotor field-tested 2011–2021; modular replacement" },
                      { risiko: "Cost overrun",               sann: "med",  eff: "med",  mit: "Fixed-price contracts with supplier; 10 % CAPEX contingency" },
                    ] : [
                      { risiko: "Lavere strøm enn modellert", sann: "med",  eff: "med",  mit: "Tidevannsdata fra Kartverket + NVE validert mot historikk" },
                      { risiko: "PPA-kjøper misligholder",    sann: "low",  eff: "high", mit: "Fleksibel PPA-struktur, batteri som buffertiltak" },
                      { risiko: "Regulatoriske forsinkelser", sann: "med",  eff: "med",  mit: "Tidlig dialog med NVE, ingen demningskonsesjon nødvendig" },
                      { risiko: "Teknisk havari/utfall",      sann: "low",  eff: "med",  mit: "Waterotor felttestet 2011–2021; modulær erstatning" },
                      { risiko: "Kostnadsoverskridelse",      sann: "med",  eff: "med",  mit: "Fastpriskontrakter med leverandør; 10 % reserve i CAPEX" },
                    ];
                    return rows.map((r, i) => (
                      <tr key={r.risiko} style={{ borderTop: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "9px 14px", fontWeight: 500, color: "#334155" }}>{r.risiko}</td>
                        <td style={{ padding: "9px 14px", textAlign: "center" }}>
                          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, color: lv[r.sann], background: `${lv[r.sann]}18` }}>{lvLabel(r.sann)}</span>
                        </td>
                        <td style={{ padding: "9px 14px", textAlign: "center" }}>
                          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, color: lv[r.eff], background: `${lv[r.eff]}18` }}>{lvLabel(r.eff)}</span>
                        </td>
                        <td style={{ padding: "9px 14px", fontSize: 12, color: "#64748b" }}>{r.mit}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </McSection>

          {/* ── 8. NESTE STEG ── */}
          <McSection
            label={t.sec07label.replace("07", "08")}
            headline={t.sec07head}
            className="pitch-section"
          >
            <div className="grid grid-cols-2 gap-8">
              <div>
                {(lang === "de" ? [
                  { nr: "01", t: "Ressourcenkartierung",    b: "Abschluss der hydrografischen Analyse und Gezeitenmodellierung bei " + (prosjekt.sted ?? "dem Standort") },
                  { nr: "02", t: "Genehmigungen",           b: "Einholung von Genehmigungen bei NVE, Gemeinde und Fiskeridirektoratet" },
                  { nr: "03", t: "Verbindlicher PPA",       b: "Abschluss eines Stromabnahmevertrags mit einem lokalen Industrieunternehmen oder Netzbetreiber" },
                  { nr: "04", t: "Investitionsrunde",       b: "Eigenkapital + ggf. vorrangige Kreditlinie — Einladung wird jetzt verschickt" },
                  { nr: "05", t: "Installation",            b: "Beauftragung des Lieferanten, Durchführung von Installation und Inbetriebnahme" },
                ] : lang === "es" ? [
                  { nr: "01", t: "Cartografía de recursos", b: "Completar el análisis hidrográfico y el modelado de mareas en " + (prosjekt.sted ?? "el emplazamiento") },
                  { nr: "02", t: "Permisos",                b: "Obtener aprobación de NVE, municipio y Fiskeridirektoratet" },
                  { nr: "03", t: "PPA vinculante",          b: "Suscribir un contrato de compraventa de energía con un actor industrial local o gestor de red" },
                  { nr: "04", t: "Ronda de inversión",      b: "Capital propio + posible línea de crédito sénior — la invitación se envía ahora" },
                  { nr: "05", t: "Instalación",             b: "Contratar al proveedor, realizar la instalación y la puesta en marcha" },
                ] : lang === "en" ? [
                  { nr: "01", t: "Resource mapping",        b: "Complete hydrographic analysis and tidal modelling at " + (prosjekt.sted ?? "the site") },
                  { nr: "02", t: "Permits",                 b: "Obtain approval from NVE, municipality and Fiskeridirektoratet" },
                  { nr: "03", t: "Binding PPA",             b: "Sign a power purchase agreement with a local industrial actor or grid operator" },
                  { nr: "04", t: "Investment round",        b: "Equity + potential senior loan facility — invitation issued now" },
                  { nr: "05", t: "Installation",            b: "Engage supplier, complete installation and commissioning" },
                ] : [
                  { nr: "01", t: "Ressurskartlegging", b: "Fullføre hydrografisk analyse og tidevannsmodellering ved " + (prosjekt.sted ?? "lokaliteten") },
                  { nr: "02", t: "Tillatelser",        b: "Innhente godkjenning fra NVE, kommune og Fiskeridirektoratet" },
                  { nr: "03", t: "Bindende PPA",       b: "Inngå kraftkjøpsavtale med lokal industriell aktør eller nettselskap" },
                  { nr: "04", t: "Investeringsrunde",  b: "Egenkapital + eventuell seniorlåneramme — invitasjon sendes nå" },
                  { nr: "05", t: "Installasjon",       b: "Kontrahere leverandør, gjennomføre installasjon og idriftsettelse" },
                ]).map(step => (
                  <div key={step.nr} className="flex gap-4 mb-5">
                    <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: "#0F2A5A" }}>
                      {step.nr}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{step.t}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.b}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col justify-between">
                <div style={{ background: "white", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: "28px 28px 24px", position: "relative", overflow: "hidden" }}>
                  {/* Mini left stripe on contact card */}
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, display: "flex" }}>
                    <div style={{ width: 3, background: "#0F2A5A" }} />
                    <div style={{ width: 2, background: "#3A8A52" }} />
                    <div style={{ width: 2, background: "#F5A623" }} />
                  </div>
                  <div style={{ paddingLeft: 12 }}>
                    <p style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.16em", color: "#94a3b8", marginBottom: 10 }}>
                      {lang === "de" ? "Kontakt für Investorendialog" : lang === "es" ? "Contacto para diálogo con inversores" : lang === "en" ? "Contact for investor dialogue" : "Kontakt for investordialog"}
                    </p>
                    <p style={{ fontSize: 19, fontWeight: 700, color: "#0F2A5A", marginBottom: 2 }}>Kai Svendstad</p>
                    <p style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>
                      {lang === "de" ? "Geschäftsführer, Tideron AS" : lang === "es" ? "Director general, Tideron AS" : lang === "en" ? "CEO, Tideron AS" : "Daglig leder, Tideron AS"}
                    </p>
                    <a href="mailto:ksv@tideron.com"
                      style={{ display: "inline-block", background: "#0F2A5A", color: "white", fontSize: 13, fontWeight: 600, padding: "10px 18px", borderRadius: 8, textDecoration: "none" }}>
                      ksv@tideron.com →
                    </a>
                  </div>
                </div>
                <div className="mt-4 text-xs text-slate-400 leading-relaxed">
                  Tideron AS · Ortnevik 3, 5962 Bjordal · Org.nr. [under registrering]
                  <br />{lang === "de" ? "Dieses Dokument enthält vertrauliche Informationen, die ausschließlich für den Adressaten bestimmt sind."
                    : lang === "es" ? "Este documento contiene información confidencial destinada exclusivamente al destinatario."
                    : lang === "en" ? "This document contains confidential information intended solely for the addressee."
                    : "Dette dokumentet inneholder konfidensiell informasjon ment utelukkende for adressaten."}
                  <br />© Tideron AS {new Date().getFullYear()}
                </div>
              </div>
            </div>
          </McSection>

        </div>
      </div>

      {/* ══ INTERN BRUK — PITCHMALER OG UTSENDELSER ══════════════════════════ */}
      <div data-no-print className="mt-8 space-y-4">

        {/* Pitchmaler */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Pitchmaler for e-post</h3>
              <p className="text-xs text-slate-400 mt-0.5">Generert fra prosjektdata — til kopiering eller direkte utsending</p>
            </div>
            <div className="flex items-center gap-2">
              {(["teaser", "full"] as const).map(m => (
                <button key={m} onClick={() => setPitchModus(pitchModus === m ? null : m)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    pitchModus === m ? "bg-[#0F2A5A] text-white border-[#0F2A5A]" : "text-slate-600 border-slate-200 hover:border-[#0F2A5A]/40"
                  }`}>
                  {m === "teaser" ? "Teaser (~400 ord)" : "Full pitch (~2000 ord)"}
                </button>
              ))}
              {pitchModus && (
                <button onClick={() => {
                  const tekst = pitchModus === "teaser" ? genererTeaser(pitchData) : genererFullPitch(pitchData);
                  navigator.clipboard.writeText(tekst).then(() => { setKopiert(true); setTimeout(() => setKopiert(false), 2000); });
                }} className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 hover:border-[#0F2A5A]/40 text-slate-600 transition-all">
                  {kopiert ? "✓ Kopiert!" : "Kopier tekst"}
                </button>
              )}
            </div>
          </div>
          {pitchModus && (
            <div className="p-5">
              <pre className="font-mono text-xs text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-xl p-5 overflow-auto max-h-[500px] border border-slate-100">
                {pitchModus === "teaser" ? genererTeaser(pitchData) : genererFullPitch(pitchData)}
              </pre>
            </div>
          )}
        </div>

        {/* Investorkontakter + utsendelser */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">{t.sentHistory}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {lang === "de" ? "Wer hat den Pitch erhalten — und wer hat ihn geöffnet"
                  : lang === "es" ? "Quién ha recibido el pitch — y quién lo ha abierto"
                  : lang === "en" ? "Who received the pitch — and who opened it"
                  : "Hvem har mottatt pitch — og hvem har åpnet den"}
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {utsendelser.length} {lang === "de" ? "gesendet" : lang === "es" ? "enviados" : lang === "en" ? "sent" : "sendt"} · {utsendelser.filter(u => u.visit_count > 0).length} {lang === "de" ? "geöffnet" : lang === "es" ? "abiertos" : lang === "en" ? "opened" : "åpnet"}
            </span>
          </div>
          {utsendelser.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              {lang === "de" ? `Noch kein Pitch gesendet — verwenden Sie «${t.sendBtn}», um zu starten.`
                : lang === "es" ? `Aún no se ha enviado ningún pitch — use «${t.sendBtn}» para comenzar.`
                : lang === "en" ? `No pitch sent yet — use «${t.sendBtn}» to get started.`
                : `Ingen pitch sendt ennå — bruk «${t.sendBtn}» for å komme i gang.`}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {utsendelser.map(u => {
                const appUrl = typeof window !== "undefined" ? window.location.origin : "";
                return (
                  <div key={u.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-slate-800 truncate">{u.navn || u.email}</span>
                        {u.navn && <span className="text-xs text-slate-400 truncate">{u.email}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-slate-400">
                          {lang === "de" ? "Gesendet" : lang === "es" ? "Enviado" : lang === "en" ? "Sent" : "Sendt"}{" "}
                          {new Date(u.sent_at).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        {u.pitch_type && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            {u.pitch_type === "teaser" ? "Teaser" : "Full pitch"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {u.visit_count > 0 ? (
                        <div className="text-right">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-green-700 bg-green-50">
                            ✓ {t.visitedLabel} {u.visit_count}×
                          </span>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {lang === "de" ? "Zuletzt" : lang === "es" ? "Última vez" : lang === "en" ? "Last" : "Sist"}{" "}
                            {new Date(u.last_visited_at).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full text-slate-400 bg-slate-100">{t.notVisited}</span>
                      )}
                      <a href={`${appUrl}/investor/${u.token}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-[#0F2A5A] hover:underline">Se lenke →</a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Send til investor-modal ── */}
      {delModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setDelModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-900">{t.sendTitle}</h3>
              <button onClick={() => setDelModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            {delFeil && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm mb-3">{delFeil}</div>
            )}
            {delSendt ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">✉️</div>
                <p className="text-green-600 font-semibold">{t.sendOk}</p>
              </div>
            ) : (
              <form onSubmit={sendDel} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{t.sendName}</label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                    value={delForm.navn} onChange={e => setDelForm(f => ({ ...f, navn: e.target.value }))}
                    placeholder="Fornavn Etternavn" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{t.sendEmail} *</label>
                  <input required type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                    value={delForm.epost} onChange={e => setDelForm(f => ({ ...f, epost: e.target.value }))}
                    placeholder="investor@eksempel.no" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">{t.sendPitchType}</label>
                  <div className="space-y-2">
                    {([
                      { val: "teaser",     label: t.sendTeaser,   sub: lang === "de" ? "Kurz — für den ersten Kontakt" : lang === "es" ? "Breve — apto para primer contacto" : lang === "en" ? "Brief — suitable for first contact" : "Kort — egnet for første kontakt" },
                      { val: "full",       label: t.sendFull,     sub: lang === "de" ? "Vollständig mit Technologie und Finanzen" : lang === "es" ? "Completo con tecnología y finanzas" : lang === "en" ? "Full with technology and financials" : "Fullstendig med teknologi og finans" },
                      { val: "bare_lenke", label: t.sendLinkOnly, sub: lang === "de" ? "Investor liest Online-Pitch" : lang === "es" ? "El inversor lee el pitch en línea" : lang === "en" ? "Investor reads online pitch" : "Investor leser online pitch" },
                    ] as const).map(opt => (
                      <label key={opt.val} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        delForm.pitch_type === opt.val ? "border-[#0F2A5A] bg-blue-50" : "border-slate-200 hover:border-slate-300"
                      }`}>
                        <input type="radio" name="pitch_type" value={opt.val}
                          checked={delForm.pitch_type === opt.val}
                          onChange={() => setDelForm(f => ({ ...f, pitch_type: opt.val }))}
                          className="mt-0.5 accent-[#0F2A5A]" />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{opt.label}</p>
                          <p className="text-xs text-slate-400">{opt.sub}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setDelModal(false)} className="btn-secondary flex-1">
                    {lang === "de" ? "Abbrechen" : lang === "es" ? "Cancelar" : lang === "en" ? "Cancel" : "Avbryt"}
                  </button>
                  <button type="submit" disabled={delSender} className="btn-primary flex-1">
                    {delSender ? t.sending : t.sendBtn2}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
