"use client";
import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { fmtKw, fmtKwh, fmtKr } from "@/lib/units";
import { createClient } from "@/lib/supabase/client";
import {
  nominalKwFraAreal, beregnEffektKw, beregnEffektKwFlateareal, beregnArligKwh,
  beregnContainerCapex, beregnLCOE, beregnIRR, beregnNPV,
  beregnEtterSkattCashflows, rhoFraVanntype, RHO_SJOVANN, CP_WATEROTOR,
} from "@/lib/finans";
import { finnLand, LAND } from "@/lib/land";
import { useValuta } from "@/lib/i18n";
import {
  sokStoetteordninger, KATEGORI_LABEL, LAND_LABEL,
  type Kategori, type Stoetteordning,
} from "@/lib/stoetteordninger";

const RENTE            = 0.08;
const CAPEX_USD_PER_W  = 5;       // $5/W — låst Waterotor-referansepris
const USD_NOK_FALLBACK = 10.5;    // brukes hvis valutakurs ikke er lastet ennå

// ── Sensorliste (Valgte sensorer for Waterotor, sept. 2026) ──────────────────
export interface SensorKostnad {
  kode: string;
  navn: string;
  per: "rotor" | "anlegg";
  pris: number;   // NOK eks. mva.
  aktiv: boolean;
}

const SENSOR_DEFAULTS: SensorKostnad[] = [
  // R · Rotor og drivlinje (per rotor)
  { kode: "R1", navn: "Omdreiningsteller (enkoder/hall-sensor)",      per: "rotor",  pris:  2750,  aktiv: true  },
  { kode: "R2", navn: "Vibrasjonssensorer (triaksielle akselerometre)",per: "rotor",  pris: 45000,  aktiv: true  },
  { kode: "R3", navn: "Trykk og temperatur i hydraulikk",              per: "rotor",  pris: 14000,  aktiv: true  },
  { kode: "R4", navn: "Temperatur i generatorvikling og lagre (PT100)",per: "rotor",  pris:  5000,  aktiv: true  },
  { kode: "R5", navn: "Lekkasjedetektor i tørre rom",                  per: "rotor",  pris:  3000,  aktiv: true  },
  { kode: "R6", navn: "Effektmåler / nettanalysator",                  per: "rotor",  pris: 16500,  aktiv: true  },
  { kode: "R7", navn: "Status fra styresystem (PLS)",                  per: "rotor",  pris:     0,  aktiv: true  },
  // S · Kamera (per rotor)
  { kode: "S1", navn: "Undervannskamera med lys",                      per: "rotor",  pris: 30000,  aktiv: false },
  // V · Vær (per anlegg)
  { kode: "V1", navn: "Værstasjon",                                    per: "anlegg", pris: 22500,  aktiv: true  },
  // A · Akustikk (per anlegg)
  { kode: "A1", navn: "Hydrofon (kalibrert, bredbåndet)",              per: "anlegg", pris: 57500,  aktiv: false },
  // M · Vannkvalitet (per anlegg)
  { kode: "M1", navn: "Multiparametersonde",                           per: "anlegg", pris: 130000, aktiv: false },
  // D · System og infrastruktur (per anlegg)
  { kode: "D1", navn: "GPS-posisjon",                                  per: "anlegg", pris:  1500,  aktiv: true  },
  { kode: "D2", navn: "Felles tidsreferanse (GPS/PTP)",                per: "anlegg", pris:  3000,  aktiv: true  },
  // I · Infrastruktur og installasjon (per anlegg)
  { kode: "I1", navn: "Industriell edge-PC med redundant lagring",     per: "anlegg", pris: 27500,  aktiv: true  },
  { kode: "I2", navn: "Kabinett, strømforsyning, I/O-moduler og kabling", per: "anlegg", pris: 40000, aktiv: true },
  { kode: "I3", navn: "Undervannskabler, våtkoblbare kontakter og braketter", per: "anlegg", pris: 95000, aktiv: true },
  { kode: "I4", navn: "Installasjon og igangkjøring (inkl. båt/dykker)", per: "anlegg", pris: 165000, aktiv: true },
];

// ── Lånematematikk ────────────────────────────────────────────────────────────
export interface LånRad {
  ar: number;
  balanseFør: number;
  avdrag: number;
  renter: number;
  ytelse: number;      // avdrag + renter
  balanseEtter: number;
}

/** Annuitetslån: fast ytelse per år */
function annuitetsplan(belop: number, rentePst: number, ar: number): LånRad[] {
  if (belop <= 0 || ar <= 0) return [];
  const r   = rentePst / 100;
  const pmt = r === 0 ? belop / ar : belop * r / (1 - Math.pow(1 + r, -ar));
  const rader: LånRad[] = [];
  let balanse = belop;
  for (let i = 1; i <= ar; i++) {
    const renter  = balanse * r;
    const avdrag  = pmt - renter;
    rader.push({ ar: i, balanseFør: balanse, avdrag, renter, ytelse: pmt, balanseEtter: Math.max(0, balanse - avdrag) });
    balanse = Math.max(0, balanse - avdrag);
  }
  return rader;
}

/** Serielån: fast avdrag per år, avtakende renter */
function serieplan(belop: number, rentePst: number, ar: number): LånRad[] {
  if (belop <= 0 || ar <= 0) return [];
  const r      = rentePst / 100;
  const avdrag = belop / ar;
  const rader: LånRad[] = [];
  let balanse = belop;
  for (let i = 1; i <= ar; i++) {
    const renter = balanse * r;
    const ytelse = avdrag + renter;
    rader.push({ ar: i, balanseFør: balanse, avdrag, renter, ytelse, balanseEtter: Math.max(0, balanse - avdrag) });
    balanse = Math.max(0, balanse - avdrag);
  }
  return rader;
}

export function byggAmortiseringsplan(laan: { belop_nok: number; rente_pst: number; nedbetalingstid_ar: number; laan_type: string }): LånRad[] {
  if (laan.laan_type === "serie") return serieplan(laan.belop_nok, laan.rente_pst, laan.nedbetalingstid_ar);
  return annuitetsplan(laan.belop_nok, laan.rente_pst, laan.nedbetalingstid_ar);
}

/** Summerer ytelse per prosjektår (år 1 = første driftsår) for alle lån */
export function summerYtelsePerAr(
  laan: { belop_nok: number; rente_pst: number; nedbetalingstid_ar: number; laan_type: string; startaar?: number | null }[],
  levetid: number,
  prosjektStartAar: number,
): { ytelse: number; avdrag: number; renter: number }[] {
  const result = Array.from({ length: levetid }, () => ({ ytelse: 0, avdrag: 0, renter: 0 }));
  for (const l of laan) {
    const plan = byggAmortiseringsplan(l);
    const offset = l.startaar ? Math.max(0, (l.startaar - prosjektStartAar)) : 0;
    for (const rad of plan) {
      const idx = offset + rad.ar - 1;
      if (idx >= 0 && idx < levetid) {
        result[idx].ytelse  += rad.ytelse;
        result[idx].avdrag  += rad.avdrag;
        result[idx].renter  += rad.renter;
      }
    }
  }
  return result;
}

// ── LånSeksjon ────────────────────────────────────────────────────────────────
const STATUS_LÅN: Record<string, string> = {
  planlagt:   "bg-slate-100 text-slate-600",
  bekreftet:  "bg-blue-100 text-blue-700",
  trukket:    "bg-emerald-100 text-emerald-700",
};

function LånSeksjon({
  projectId,
  nettoCapex,
  onLånEndret,
}: {
  projectId: string;
  nettoCapex: number;
  onLånEndret: (laan: any[]) => void;
}) {
  const sb = createClient();
  const [laan, setLaan]           = useState<any[]>([]);
  const [visForm, setVisForm]     = useState(false);
  const [redigerId, setRedigerId] = useState<string | null>(null);
  const [visDetalj, setVisDetalj] = useState<string | null>(null);

  const tomtForm = {
    navn: "", kilde: "", belop_nok: "", rente_pst: "5",
    nedbetalingstid_ar: "15", startaar: "",
    laan_type: "annuitet" as "annuitet" | "serie",
    status: "planlagt", merknad: "",
  };
  const [form, setForm] = useState(tomtForm);

  const hent = useCallback(async () => {
    const { data } = await sb.from("project_loans").select("*").eq("project_id", projectId).order("created_at");
    const liste = data ?? [];
    setLaan(liste);
    onLånEndret(liste);
  }, [projectId]); // eslint-disable-line

  useEffect(() => { hent(); }, [hent]);

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      project_id:         projectId,
      navn:               form.navn || null,
      kilde:              form.kilde || null,
      belop_nok:          +form.belop_nok,
      rente_pst:          +form.rente_pst,
      nedbetalingstid_ar: +form.nedbetalingstid_ar,
      startaar:           form.startaar ? +form.startaar : null,
      laan_type:          form.laan_type,
      status:             form.status,
      merknad:            form.merknad || null,
    };
    if (redigerId) {
      await sb.from("project_loans").update(payload).eq("id", redigerId);
      setRedigerId(null);
    } else {
      await sb.from("project_loans").insert(payload);
    }
    setForm(tomtForm);
    setVisForm(false);
    hent();
  };

  const slett = async (id: string) => {
    if (!confirm("Slett dette lånet?")) return;
    await sb.from("project_loans").delete().eq("id", id);
    hent();
  };

  const startRediger = (l: any) => {
    setForm({
      navn:               l.navn ?? "",
      kilde:              l.kilde ?? "",
      belop_nok:          String(l.belop_nok),
      rente_pst:          String(l.rente_pst),
      nedbetalingstid_ar: String(l.nedbetalingstid_ar),
      startaar:           l.startaar ? String(l.startaar) : "",
      laan_type:          l.laan_type,
      status:             l.status,
      merknad:            l.merknad ?? "",
    });
    setRedigerId(l.id);
    setVisForm(true);
  };

  const totalLaan     = laan.reduce((s: number, l: any) => s + +(l.belop_nok ?? 0), 0);
  const egenkapital   = Math.max(0, nettoCapex - totalLaan);
  const nok = (v: number) => Math.round(v).toLocaleString("nb-NO");

  // Forhåndsvisning av årsytelse for skjemaet
  const prevPlan = (form.belop_nok && form.rente_pst && form.nedbetalingstid_ar)
    ? byggAmortiseringsplan({ belop_nok: +form.belop_nok, rente_pst: +form.rente_pst, nedbetalingstid_ar: +form.nedbetalingstid_ar, laan_type: form.laan_type })
    : [];

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-slate-900">🏦 Lånefinansiering</h2>
          {totalLaan > 0 && (
            <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
              {nok(totalLaan)} kr · EK {nok(egenkapital)} kr
            </span>
          )}
        </div>
        <button
          onClick={() => { setVisForm(v => !v); if (redigerId) { setRedigerId(null); setForm(tomtForm); } }}
          className="btn-secondary text-sm"
        >
          {visForm ? "Avbryt" : "+ Legg til lån"}
        </button>
      </div>

      {/* Skjema */}
      {visForm && (
        <form onSubmit={lagre} className="p-5 bg-slate-50 border-b border-slate-100 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Navn / beskrivelse</label>
              <input type="text" value={form.navn}
                onChange={e => setForm(p => ({ ...p, navn: e.target.value }))}
                placeholder="Banklån, NIB-lån..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Långiver</label>
              <input type="text" value={form.kilde}
                onChange={e => setForm(p => ({ ...p, kilde: e.target.value }))}
                placeholder="DNB, NIB, KfW..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Lånebeløp (kr) *</label>
              <input required type="number" min={0} step={10000} value={form.belop_nok}
                onChange={e => setForm(p => ({ ...p, belop_nok: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Rente (% p.a.) *</label>
              <input required type="number" min={0} max={30} step={0.1} value={form.rente_pst}
                onChange={e => setForm(p => ({ ...p, rente_pst: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Nedbetalingstid (år) *</label>
              <input required type="number" min={1} max={40} step={1} value={form.nedbetalingstid_ar}
                onChange={e => setForm(p => ({ ...p, nedbetalingstid_ar: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Startår</label>
              <input type="number" min={2020} max={2060} step={1} value={form.startaar}
                onChange={e => setForm(p => ({ ...p, startaar: e.target.value }))}
                placeholder={String(new Date().getFullYear())}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Lånetype</label>
              <div className="flex gap-3 mt-2">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" checked={form.laan_type === "annuitet"}
                    onChange={() => setForm(p => ({ ...p, laan_type: "annuitet" }))} />
                  Annuitet
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" checked={form.laan_type === "serie"}
                    onChange={() => setForm(p => ({ ...p, laan_type: "serie" }))} />
                  Serie
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white">
                <option value="planlagt">Planlagt</option>
                <option value="bekreftet">Bekreftet</option>
                <option value="trukket">Trukket</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Merknad</label>
              <input type="text" value={form.merknad}
                onChange={e => setForm(p => ({ ...p, merknad: e.target.value }))}
                placeholder="Betingelser, sikkerhet..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
            </div>
          </div>

          {/* Forhåndsvisning av ytelse */}
          {prevPlan.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-3 text-xs">
              <p className="text-slate-400 uppercase tracking-wider mb-2">Forhåndsvisning</p>
              <div className="flex gap-6">
                <div>
                  <span className="text-slate-500">År 1 ytelse: </span>
                  <span className="font-semibold text-slate-900">{nok(prevPlan[0].ytelse)} kr</span>
                </div>
                <div>
                  <span className="text-slate-500">Herav renter: </span>
                  <span className="font-semibold text-slate-900">{nok(prevPlan[0].renter)} kr</span>
                </div>
                <div>
                  <span className="text-slate-500">Total rentekostnad: </span>
                  <span className="font-semibold text-slate-900">
                    {nok(prevPlan.reduce((s, r) => s + r.renter, 0))} kr
                  </span>
                </div>
                {form.laan_type === "annuitet" && (
                  <div>
                    <span className="text-slate-500">Fast ytelse: </span>
                    <span className="font-semibold">{nok(prevPlan[0].ytelse)} kr/år</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button type="submit" className="btn-primary text-sm">
              {redigerId ? "Oppdater" : "Lagre lån"}
            </button>
          </div>
        </form>
      )}

      {/* Liste over lån */}
      {laan.length > 0 ? (
        <div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">Lån</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Beløp</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Rente</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Løpetid</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">År 1 ytelse</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Total rente</th>
                <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {laan.map((l: any) => {
                const plan = byggAmortiseringsplan(l);
                const ar1  = plan[0];
                const totRente = plan.reduce((s, r) => s + r.renter, 0);
                return (
                  <Fragment key={l.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 text-xs">{l.navn || "Lån"}</p>
                        {l.kilde && <p className="text-[11px] text-slate-400">{l.kilde}</p>}
                        <p className="text-[11px] text-slate-400">{l.laan_type === "annuitet" ? "Annuitet" : "Serielån"}{l.startaar ? ` · start ${l.startaar}` : ""}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{nok(l.belop_nok)}</td>
                      <td className="px-4 py-3 text-right text-xs">{l.rente_pst} %</td>
                      <td className="px-4 py-3 text-right text-xs">{l.nedbetalingstid_ar} år</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{ar1 ? nok(ar1.ytelse) : "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-500">{nok(totRente)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LÅN[l.status] ?? "bg-slate-100 text-slate-600"}`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setVisDetalj(visDetalj === l.id ? null : l.id)}
                            className="text-slate-300 hover:text-[#0F2A5A] text-xs" title="Amortiseringsplan">
                            {visDetalj === l.id ? "▲" : "▼"}
                          </button>
                          <button onClick={() => startRediger(l)} className="text-slate-300 hover:text-[#0F2A5A] text-xs">✎</button>
                          <button onClick={() => slett(l.id)} className="text-slate-300 hover:text-red-400 text-xs">✕</button>
                        </div>
                      </td>
                    </tr>
                    {/* Amortiseringsplan */}
                    {visDetalj === l.id && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50 px-4 pb-3">
                          <div className="overflow-x-auto max-h-64 overflow-y-auto rounded border border-slate-200">
                            <table className="w-full text-xs">
                              <thead className="bg-white sticky top-0 border-b border-slate-200">
                                <tr>
                                  <th className="text-left px-3 py-1.5 text-slate-400 font-medium">År</th>
                                  <th className="text-right px-3 py-1.5 text-slate-400 font-medium">Balanse (IB)</th>
                                  <th className="text-right px-3 py-1.5 text-slate-400 font-medium">Avdrag</th>
                                  <th className="text-right px-3 py-1.5 text-slate-400 font-medium">Renter</th>
                                  <th className="text-right px-3 py-1.5 text-slate-400 font-medium">Ytelse</th>
                                  <th className="text-right px-3 py-1.5 text-slate-400 font-medium">Balanse (UB)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {plan.map(r => (
                                  <tr key={r.ar} className="hover:bg-white">
                                    <td className="px-3 py-1.5 font-medium text-slate-700">År {r.ar}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-slate-500">{nok(r.balanseFør)}</td>
                                    <td className="px-3 py-1.5 text-right font-mono">{nok(r.avdrag)}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-amber-700">{nok(r.renter)}</td>
                                    <td className="px-3 py-1.5 text-right font-mono font-semibold text-slate-900">{nok(r.ytelse)}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-slate-500">{nok(r.balanseEtter)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-xs">
                                <tr>
                                  <td className="px-3 py-1.5" colSpan={2}>Totalt</td>
                                  <td className="px-3 py-1.5 text-right font-mono">{nok(plan.reduce((s,r)=>s+r.avdrag,0))}</td>
                                  <td className="px-3 py-1.5 text-right font-mono text-amber-700">{nok(plan.reduce((s,r)=>s+r.renter,0))}</td>
                                  <td className="px-3 py-1.5 text-right font-mono">{nok(plan.reduce((s,r)=>s+r.ytelse,0))}</td>
                                  <td />
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-3 bg-blue-50 border-t border-blue-100 grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-blue-600 text-xs block">Total låneramme</span>
              <span className="font-semibold text-blue-800 font-mono">{nok(totalLaan)} kr</span>
            </div>
            <div>
              <span className="text-blue-600 text-xs block">Egenkapital</span>
              <span className="font-semibold text-blue-800 font-mono">{nok(egenkapital)} kr</span>
            </div>
            <div>
              <span className="text-blue-600 text-xs block">Gjeldsandel</span>
              <span className="font-semibold text-blue-800">
                {nettoCapex > 0 ? ((totalLaan / nettoCapex) * 100).toFixed(0) : 0} %
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 text-center text-slate-400 text-sm">
          <p className="font-medium text-slate-600 mb-1">Ingen lån registrert</p>
          <p>Legg til banklån, NIB-lån eller annen gjeldsfinansiering</p>
        </div>
      )}
    </div>
  );
}

// ── Batteripakker ─────────────────────────────────────────────────────────────
function BatteripakkerSeksjon({ projectId }: { projectId: string }) {
  const sb = createClient();
  const [pakker, setPakker] = useState<any[]>([]);
  const [vis, setVis]       = useState(false);
  const [form, setForm]     = useState({ kapasitet_kwh: "", effekt_kw: "", pris_nok: "", leverandor: "" });

  const hent = useCallback(async () => {
    const { data } = await sb.from("battery_packs").select("*").eq("project_id", projectId).order("created_at");
    setPakker(data ?? []);
  }, [projectId]);
  useEffect(() => { hent(); }, [hent]);

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    await sb.from("battery_packs").insert({
      project_id: projectId,
      kapasitet_kwh: form.kapasitet_kwh ? +form.kapasitet_kwh : null,
      effekt_kw:     form.effekt_kw     ? +form.effekt_kw     : null,
      pris_nok:      form.pris_nok      ? +form.pris_nok      : null,
      leverandor:    form.leverandor    || null,
    });
    setForm({ kapasitet_kwh: "", effekt_kw: "", pris_nok: "", leverandor: "" });
    setVis(false);
    hent();
  };

  const slett = async (id: string) => {
    await sb.from("battery_packs").delete().eq("id", id);
    hent();
  };

  const totalKwh = pakker.reduce((s, p) => s + (p.kapasitet_kwh ?? 0), 0);
  const totalPris = pakker.reduce((s, p) => s + +(p.pris_nok ?? 0), 0);
  const nok = (v: number) => Math.round(v).toLocaleString("nb-NO");

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
        <h2 className="font-semibold text-slate-900">Batteripakker</h2>
        <button onClick={() => setVis(v => !v)} className="btn-secondary text-sm">
          {vis ? "Avbryt" : "+ Legg til"}
        </button>
      </div>
      {vis && (
        <form onSubmit={lagre} className="p-4 bg-slate-50 border-b border-slate-100 grid grid-cols-4 gap-3">
          {[
            { label: "Kapasitet (kWh)", field: "kapasitet_kwh", ph: "100" },
            { label: "Effekt (kW)",     field: "effekt_kw",     ph: "50" },
            { label: "Pris (kr)",       field: "pris_nok",      ph: "800000" },
            { label: "Leverandor",      field: "leverandor",    ph: "FREYR, Northvolt..." },
          ].map(f => (
            <div key={f.field}>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{f.label}</label>
              <input
                type={f.field === "leverandor" ? "text" : "number"}
                placeholder={f.ph}
                value={(form as any)[f.field]}
                onChange={e => setForm(prev => ({ ...prev, [f.field]: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white"
              />
            </div>
          ))}
          <div className="col-span-4 flex justify-end">
            <button type="submit" className="btn-primary text-sm">Lagre</button>
          </div>
        </form>
      )}
      {pakker.length > 0 ? (
        <div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 text-slate-500 font-medium">Leverandor</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium">Kapasitet</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium">Effekt</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium">Pris</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pakker.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{p.leverandor ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{p.kapasitet_kwh ? p.kapasitet_kwh + " kWh" : "—"}</td>
                  <td className="px-4 py-3 text-right">{p.effekt_kw ? p.effekt_kw + " kW" : "—"}</td>
                  <td className="px-4 py-3 text-right">{p.pris_nok ? fmtKr(+p.pris_nok) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => slett(p.id)} className="text-slate-300 hover:text-red-400 text-xs">X</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 bg-slate-50 border-t text-sm flex justify-between text-slate-600">
            <span>Totalt: {totalKwh > 0 ? totalKwh + " kWh" : "—"}</span>
            <span className="font-medium">{totalPris > 0 ? fmtKr(totalPris) : ""}</span>
          </div>
        </div>
      ) : (
        <div className="p-6 text-center text-slate-400 text-sm">Ingen batteripakker registrert</div>
      )}
    </div>
  );
}

// ── Støtteordninger ───────────────────────────────────────────────────────────
const STATUS_FARGE: Record<string, string> = {
  planlagt:   "bg-slate-100 text-slate-600",
  søkt:       "bg-amber-100 text-amber-700",
  innvilget:  "bg-emerald-100 text-emerald-700",
};
const STATUS_LABELS = ["planlagt", "søkt", "innvilget"] as const;

function StøtteSeksjon({
  projectId,
  bruttoCapex,
  onTilskuddEndret,
}: {
  projectId: string;
  bruttoCapex: number;
  onTilskuddEndret: (totalNok: number) => void;
}) {
  const sb = createClient();
  const [tilskudd, setTilskudd]     = useState<any[]>([]);
  const [visForm, setVisForm]        = useState(false);
  const [sokTekst, setSokTekst]      = useState("");
  const [treff, setTreff]            = useState<Stoetteordning[]>([]);
  const [visDropdown, setVisDropdown]= useState(false);
  const [redigerId, setRedigerId]    = useState<string | null>(null);
  const [feil, setFeil]              = useState<string | null>(null);
  const [lagrer, setLagrer]          = useState(false);
  const sokRef = useRef<HTMLDivElement>(null);

  const tomtForm = {
    navn: "", kilde: "", land: "", kategori: "produksjon" as Kategori,
    beregning: "prosent" as "prosent" | "sum",
    prosent: "", belop_nok: "", status: "planlagt", merknad: "",
  };
  const [form, setForm] = useState(tomtForm);

  const hent = useCallback(async () => {
    const { data } = await sb
      .from("project_grants")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at");
    const liste = data ?? [];
    setTilskudd(liste);
    const total = liste.reduce((s: number, t: any) => {
      if (t.beregning === "prosent") {
        return s + (+(t.prosent ?? 0) / 100) * bruttoCapex;
      }
      return s + +(t.belop_nok ?? 0);
    }, 0);
    onTilskuddEndret(total);
  }, [projectId, bruttoCapex]); // eslint-disable-line

  useEffect(() => { hent(); }, [hent]);

  // Søk live
  useEffect(() => {
    if (!sokTekst.trim()) { setTreff([]); setVisDropdown(false); return; }
    const res = sokStoetteordninger(sokTekst);
    setTreff(res.slice(0, 8));
    setVisDropdown(res.length > 0);
  }, [sokTekst]);

  // Lukk dropdown ved klikk utenfor
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sokRef.current && !sokRef.current.contains(e.target as Node)) {
        setVisDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const velgProgram = (s: Stoetteordning) => {
    setForm(prev => ({
      ...prev,
      navn:      s.navn,
      kilde:     s.kilde,
      land:      s.land,
      kategori:  s.kategori[0] ?? "produksjon",
      beregning: s.typisk_prosent != null ? "prosent" : "sum",
      prosent:   s.typisk_prosent != null ? String(s.typisk_prosent) : "",
    }));
    setSokTekst(s.navn);
    setVisDropdown(false);
  };

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeil(null);
    setLagrer(true);
    const payload = {
      project_id: projectId,
      navn:       form.navn,
      kilde:      form.kilde || null,
      land:       form.land  || null,
      kategori:   form.kategori,
      beregning:  form.beregning,
      prosent:    form.beregning === "prosent" && form.prosent ? +form.prosent : null,
      belop_nok:  form.beregning === "sum" && form.belop_nok ? +form.belop_nok : null,
      status:     form.status,
      merknad:    form.merknad || null,
    };
    let error: any = null;
    if (redigerId) {
      ({ error } = await sb.from("project_grants").update(payload).eq("id", redigerId));
      if (!error) setRedigerId(null);
    } else {
      ({ error } = await sb.from("project_grants").insert(payload));
    }
    setLagrer(false);
    if (error) {
      setFeil(error.message ?? "Ukjent feil fra Supabase");
      return;
    }
    setForm(tomtForm);
    setSokTekst("");
    setVisForm(false);
    hent();
  };

  const slett = async (id: string) => {
    if (!confirm("Slett dette tilskuddet?")) return;
    await sb.from("project_grants").delete().eq("id", id);
    hent();
  };

  const startRediger = (t: any) => {
    setForm({
      navn:      t.navn,
      kilde:     t.kilde ?? "",
      land:      t.land  ?? "",
      kategori:  t.kategori ?? "produksjon",
      beregning: t.beregning,
      prosent:   t.prosent != null ? String(t.prosent) : "",
      belop_nok: t.belop_nok != null ? String(t.belop_nok) : "",
      status:    t.status,
      merknad:   t.merknad ?? "",
    });
    setSokTekst(t.navn);
    setRedigerId(t.id);
    setVisForm(true);
  };

  const totalTilskudd = tilskudd.reduce((s: number, t: any) => {
    if (t.beregning === "prosent") return s + (+(t.prosent ?? 0) / 100) * bruttoCapex;
    return s + +(t.belop_nok ?? 0);
  }, 0);

  const nok = (v: number) => Math.round(v).toLocaleString("nb-NO");

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-slate-900">🏛 Støtte og tilskudd</h2>
          {totalTilskudd > 0 && (
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              − {nok(totalTilskudd)} kr
            </span>
          )}
        </div>
        <button
          onClick={() => { setVisForm(v => !v); if (redigerId) { setRedigerId(null); setForm(tomtForm); setSokTekst(""); } }}
          className="btn-secondary text-sm"
        >
          {visForm ? "Avbryt" : "+ Legg til"}
        </button>
      </div>

      {visForm && (
        <form onSubmit={lagre} className="p-5 bg-slate-50 border-b border-slate-100 space-y-4">
          {/* Søk etter kjent program */}
          <div ref={sokRef} className="relative">
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
              Søk i støtteprogrammer (globalt)
            </label>
            <input
              type="text"
              placeholder="f.eks. Enova, Innovation Fund, Norfund..."
              value={sokTekst}
              onChange={e => { setSokTekst(e.target.value); setForm(prev => ({ ...prev, navn: e.target.value })); }}
              onFocus={() => { if (treff.length > 0) setVisDropdown(true); }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white"
            />
            {visDropdown && (
              <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-72 overflow-y-auto">
                {treff.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => velgProgram(s)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{s.navn}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{s.kilde} · {LAND_LABEL[s.land]}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {s.typisk_prosent != null && (
                          <span className="text-xs font-mono text-emerald-700">~{s.typisk_prosent}%</span>
                        )}
                        <div className="flex gap-1 flex-wrap justify-end">
                          {s.kategori.map(k => (
                            <span key={k} className="text-[10px] bg-[#0F2A5A]/10 text-[#0F2A5A] rounded px-1">
                              {KATEGORI_LABEL[k]}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Navn *</label>
              <input required type="text" value={form.navn}
                onChange={e => setForm(p => ({ ...p, navn: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Kilde / organisasjon</label>
              <input type="text" value={form.kilde}
                onChange={e => setForm(p => ({ ...p, kilde: e.target.value }))}
                placeholder="Enova, EU Commission..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Kategori</label>
              <select value={form.kategori} onChange={e => setForm(p => ({ ...p, kategori: e.target.value as Kategori }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white">
                {(Object.keys(KATEGORI_LABEL) as Kategori[]).map(k => (
                  <option key={k} value={k}>{KATEGORI_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Land</label>
              <input type="text" value={form.land}
                onChange={e => setForm(p => ({ ...p, land: e.target.value }))}
                placeholder="NO, EU, INT..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white">
                {STATUS_LABELS.map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Beregningsmetode */}
          <div className="flex gap-4 items-start">
            <div className="flex gap-2 items-center mt-6">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" checked={form.beregning === "prosent"}
                  onChange={() => setForm(p => ({ ...p, beregning: "prosent" }))} />
                % av CAPEX
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer ml-3">
                <input type="radio" checked={form.beregning === "sum"}
                  onChange={() => setForm(p => ({ ...p, beregning: "sum" }))} />
                Fast sum
              </label>
            </div>

            {form.beregning === "prosent" ? (
              <div className="flex-1">
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Prosent av brutto CAPEX</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={100} step={0.5}
                    value={form.prosent}
                    onChange={e => setForm(p => ({ ...p, prosent: e.target.value }))}
                    className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white text-right" />
                  <span className="text-sm text-slate-500">%</span>
                  {form.prosent && bruttoCapex > 0 && (
                    <span className="text-xs text-emerald-700 font-mono">
                      = {nok((+form.prosent / 100) * bruttoCapex)} kr
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1">
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Beløp (kr)</label>
                <input type="number" min={0} step={10000}
                  value={form.belop_nok}
                  onChange={e => setForm(p => ({ ...p, belop_nok: e.target.value }))}
                  className="w-48 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Merknad</label>
            <input type="text" value={form.merknad}
              onChange={e => setForm(p => ({ ...p, merknad: e.target.value }))}
              placeholder="Søknadsfrist, betingelser..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
          </div>

          {feil && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
              ⚠ {feil}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="submit" disabled={lagrer} className="btn-primary text-sm disabled:opacity-50">
              {lagrer ? "Lagrer…" : redigerId ? "Oppdater" : "Lagre tilskudd"}
            </button>
          </div>
        </form>
      )}

      {tilskudd.length > 0 ? (
        <div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">Program</th>
                <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">Kategori</th>
                <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">Status</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Grunnlag</th>
                <th className="text-right px-4 py-2 text-emerald-700 font-medium text-xs">Beløp (kr)</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tilskudd.map((t: any) => {
                const belopNok = t.beregning === "prosent"
                  ? (+(t.prosent ?? 0) / 100) * bruttoCapex
                  : +(t.belop_nok ?? 0);
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 text-xs">{t.navn}</p>
                      {t.kilde && <p className="text-[11px] text-slate-400">{t.kilde}{t.land ? ` · ${t.land}` : ""}</p>}
                      {t.merknad && <p className="text-[11px] text-slate-400 italic mt-0.5">{t.merknad}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {t.kategori ? KATEGORI_LABEL[t.kategori as Kategori] ?? t.kategori : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_FARGE[t.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500 font-mono">
                      {t.beregning === "prosent" ? `${t.prosent} % av CAPEX` : "Fast sum"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 font-mono text-sm">
                      − {nok(belopNok)}
                    </td>
                    <td className="px-4 py-3 text-right flex gap-2 justify-end">
                      <button onClick={() => startRediger(t)} className="text-slate-300 hover:text-[#0F2A5A] text-xs">✎</button>
                      <button onClick={() => slett(t.id)} className="text-slate-300 hover:text-red-400 text-xs">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-100 text-sm flex justify-between">
            <span className="text-emerald-700 font-medium">Total støtte</span>
            <span className="font-semibold text-emerald-700 font-mono">− {nok(totalTilskudd)} kr</span>
          </div>
        </div>
      ) : (
        <div className="p-6 text-center text-slate-400 text-sm">
          <p className="font-medium text-slate-600 mb-1">Ingen støtteordninger registrert</p>
          <p>Søk opp programmer fra Norge, EU og internasjonale finansieringskilder</p>
        </div>
      )}
    </div>
  );
}

// ── InvestorSeksjon ───────────────────────────────────────────────────────────
const STATUS_INV: Record<string, string> = {
  planlagt:  "bg-slate-100 text-slate-600",
  bekreftet: "bg-blue-100 text-blue-700",
  innbetalt: "bg-emerald-100 text-emerald-700",
};

function InvestorSeksjon({
  projectId,
  arligInntekt,
  onInvestorerEndret,
}: {
  projectId: string;
  arligInntekt: number;
  onInvestorerEndret: (investorer: any[]) => void;
}) {
  const sb = createClient();
  const [investorer, setInvestorer] = useState<any[]>([]);
  const [visForm, setVisForm]       = useState(false);
  const [redigerId, setRedigerId]   = useState<string | null>(null);
  const [feil, setFeil]             = useState<string | null>(null);
  const [lagrer, setLagrer]         = useState(false);

  const tomtForm = { navn: "", epost: "", eierandel_pst: "", investert_nok: "", status: "planlagt", merknad: "" };
  const [form, setForm] = useState(tomtForm);

  const hent = useCallback(async () => {
    const { data } = await sb.from("project_investors").select("*").eq("project_id", projectId).order("created_at");
    const liste = data ?? [];
    setInvestorer(liste);
    onInvestorerEndret(liste);
  }, [projectId]); // eslint-disable-line
  useEffect(() => { hent(); }, [hent]);

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeil(null); setLagrer(true);
    const payload = {
      project_id:    projectId,
      navn:          form.navn,
      epost:         form.epost || null,
      eierandel_pst: +form.eierandel_pst,
      investert_nok: form.investert_nok ? +form.investert_nok : null,
      status:        form.status,
      merknad:       form.merknad || null,
    };
    let error: any = null;
    if (redigerId) {
      ({ error } = await sb.from("project_investors").update(payload).eq("id", redigerId));
      if (!error) setRedigerId(null);
    } else {
      ({ error } = await sb.from("project_investors").insert(payload));
    }
    setLagrer(false);
    if (error) { setFeil(error.message ?? "Ukjent feil"); return; }
    setForm(tomtForm); setVisForm(false); hent();
  };

  const slett = async (id: string) => {
    if (!confirm("Slett denne investoren?")) return;
    await sb.from("project_investors").delete().eq("id", id);
    hent();
  };

  const startRediger = (inv: any) => {
    setForm({
      navn: inv.navn, epost: inv.epost ?? "", eierandel_pst: String(inv.eierandel_pst),
      investert_nok: inv.investert_nok ? String(inv.investert_nok) : "",
      status: inv.status, merknad: inv.merknad ?? "",
    });
    setRedigerId(inv.id); setVisForm(true);
  };

  const totalEierandel = investorer.reduce((s, i) => s + +(i.eierandel_pst ?? 0), 0);
  const tideronAndel   = Math.max(0, 100 - totalEierandel);
  const nok = (v: number) => Math.round(v).toLocaleString("nb-NO");

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-slate-900">👥 Investorer</h2>
          {investorer.length > 0 && (
            <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
              {totalEierandel.toFixed(1)}% ekstern · Tideron {tideronAndel.toFixed(1)}%
            </span>
          )}
        </div>
        <button
          onClick={() => { setVisForm(v => !v); if (redigerId) { setRedigerId(null); setForm(tomtForm); } }}
          className="btn-secondary text-sm"
        >{visForm && !redigerId ? "Avbryt" : redigerId ? "Avbryt redigering" : "+ Legg til investor"}</button>
      </div>

      {visForm && (
        <form onSubmit={lagre} className="p-5 bg-slate-50 border-b border-slate-100 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Navn *</label>
              <input required type="text" value={form.navn} onChange={e => setForm(p => ({ ...p, navn: e.target.value }))}
                placeholder="Investor AS"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">E-post</label>
              <input type="email" value={form.epost} onChange={e => setForm(p => ({ ...p, epost: e.target.value }))}
                placeholder="investor@example.com"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Eierandel (%)</label>
              <input required type="number" min={0} max={100} step={0.1}
                value={form.eierandel_pst} onChange={e => setForm(p => ({ ...p, eierandel_pst: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white text-right" />
              {form.eierandel_pst && arligInntekt > 0 && (
                <p className="text-xs text-emerald-700 mt-1">
                  = {nok((+form.eierandel_pst / 100) * arligInntekt)} kr/år
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Investert (kr)</label>
              <input type="number" min={0} step={100000}
                value={form.investert_nok} onChange={e => setForm(p => ({ ...p, investert_nok: e.target.value }))}
                placeholder="5 000 000"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white">
                {["planlagt","bekreftet","innbetalt"].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Merknad</label>
            <input type="text" value={form.merknad} onChange={e => setForm(p => ({ ...p, merknad: e.target.value }))}
              placeholder="Betingelser, lukkedato..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white" />
          </div>
          {feil && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">⚠ {feil}</div>}
          <div className="flex justify-end">
            <button type="submit" disabled={lagrer} className="btn-primary text-sm">
              {lagrer ? "Lagrer…" : redigerId ? "Oppdater investor" : "Legg til investor"}
            </button>
          </div>
        </form>
      )}

      {investorer.length > 0 && (
        <div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">Investor</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Eierandel</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Investert</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Utbetaling/år</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {investorer.map(inv => {
                const arligUtbetaling = (inv.eierandel_pst / 100) * arligInntekt;
                return (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">
                      <div className="font-medium">{inv.navn}</div>
                      {inv.epost && <div className="text-xs text-slate-400">{inv.epost}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{inv.eierandel_pst}%</td>
                    <td className="px-4 py-3 text-right text-slate-600">{inv.investert_nok ? nok(inv.investert_nok) + " kr" : "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{arligInntekt > 0 ? nok(arligUtbetaling) + " kr" : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_INV[inv.status] ?? STATUS_INV.planlagt}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right flex gap-2 justify-end">
                      <button onClick={() => startRediger(inv)} className="text-slate-300 hover:text-blue-400 text-xs">✎</button>
                      <button onClick={() => slett(inv.id)} className="text-slate-300 hover:text-red-400 text-xs">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Oppsummering */}
          <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Ekstern eierandel</p>
              <p className="font-bold text-slate-800">{totalEierandel.toFixed(1)}%</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {arligInntekt > 0 ? nok((totalEierandel / 100) * arligInntekt) + " kr/år" : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Tideron sin andel</p>
              <p className="font-bold text-[#0F2A5A]">{tideronAndel.toFixed(1)}%</p>
              <p className="text-xs text-emerald-700 font-semibold mt-0.5">
                {arligInntekt > 0 ? nok((tideronAndel / 100) * arligInntekt) + " kr/år" : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Total innhentet kapital</p>
              <p className="font-bold text-slate-800">
                {nok(investorer.reduce((s, i) => s + +(i.investert_nok ?? 0), 0))} kr
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{investorer.filter(i => i.status === "innbetalt").length} innbetalt</p>
            </div>
          </div>
        </div>
      )}

      {investorer.length === 0 && !visForm && (
        <div className="p-6 text-center text-slate-400 text-sm">Ingen investorer registrert</div>
      )}
    </div>
  );
}

// ── Hjelpefunksjon: kW per rotor ─────────────────────────────────────────────

/** Trekk ut nominell kW fra modellnavn, f.eks. "Waterotor 100 kW" → 100 */
function kwFraNavn(modell: string): number {
  const m = modell?.match(/(\d+(?:\.\d+)?)\s*(kW|MW)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === "mw" ? n * 1000 : n;
}

/**
 * Svept areal (frontareal, m²) for en rotor — bruker rektangulær logikk:
 *  1. Eksplisitte mål → lengde_m × hoyde_m
 *  2. Diameter → Waterotor er kvadratisk ramme → diameter × diameter (ikke π×r²)
 *  3. Nominell kW → tilbakebereging: A = P_nom × 1000 / (Cp × ½ × ρ × 1.8³)
 */
function rotorSveptAreal(r: any, rho = RHO_SJOVANN): number {
  if (r.lengde_m && r.hoyde_m) return r.lengde_m * r.hoyde_m;
  if (r.diameter_m) return r.diameter_m * r.diameter_m; // kvadratisk ramme
  const nomKw = r.nominell_kw_1_8 > 0 ? r.nominell_kw_1_8 : kwFraNavn(r.modell);
  if (nomKw > 0) return (nomKw * 1000) / (CP_WATEROTOR * 0.5 * rho * Math.pow(1.8, 3));
  return 0;
}

// Nominell kW ved 1,8 m/s (for visning og CAPEX-referanse)
function rotorKwNominell(r: any, rho = RHO_SJOVANN): number {
  if (r.nominell_kw_1_8 && r.nominell_kw_1_8 > 0) return r.nominell_kw_1_8;
  const navnKw = kwFraNavn(r.modell);
  if (navnKw > 0) return navnKw;
  const areal = rotorSveptAreal(r, rho);
  if (areal > 0) return nominalKwFraAreal(areal, rho);
  return 0;
}

// Faktisk kW — bruker rotorens egen hastighet hvis satt, ellers fallback
function rotorKwVed(r: any, fallbackV: number, rho = RHO_SJOVANN): number {
  const v = (r.hastighet_m_s && Number(r.hastighet_m_s) > 0) ? Number(r.hastighet_m_s) : fallbackV;
  if (v <= 0) return rotorKwNominell(r);
  // 1. Fabrikantens nominelle kW × v³ (mest nøyaktig)
  if (r.nominell_kw_1_8 && r.nominell_kw_1_8 > 0) return r.nominell_kw_1_8 * Math.pow(v / 1.8, 3);
  // 2. Custom dimensjoner — sjekkes FØR modellnavn slik at manuelt endret lengde/høyde
  //    ikke overstyres av kW-tallet i modellnavnet ("Waterotor 10 kW" → 10).
  if (r.lengde_m && r.hoyde_m) return beregnEffektKwFlateareal(v, r.lengde_m * r.hoyde_m, rho);
  // 3. Modellnavn inneholder kW/MW — bruk det som anker
  const nomKw = kwFraNavn(r.modell);
  if (nomKw > 0) return nomKw * Math.pow(v / 1.8, 3);
  // 4. Sirkulaert areal (Cp=0.42)
  if (r.diameter_m) return beregnEffektKw(v, r.diameter_m, rho);
  return 0;
}

// $0.5/W ≈ 5 000 kr/kW ved 10 kr/USD — standard Waterotor CAPEX-target
// Kan justeres per prosjekt i konf-feltet "kr per kW nominell" nedenfor

// ── Hjelpefunksjon: tyngdepunkt av polygon-koordinater ───────────────────────
function sentroid(coords: { lat: number; lon: number }[]): { lat: number; lon: number } | null {
  if (!coords || coords.length === 0) return null;
  const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const lon = coords.reduce((s, c) => s + c.lon, 0) / coords.length;
  return { lat, lon };
}

// ── Hoved-side ────────────────────────────────────────────────────────────────
export default function BudsjettPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { valuta: globalValuta } = useValuta();
  const [stream,        setStream]        = useState<any>(null);
  const [prosjekt,      setProsjekt]      = useState<any>(null);
  const [rotorer,       setRotorer]       = useState<any[]>([]);
  const [solcelleFelter,setSolcelleFelter]= useState<any[]>([]);
  const [valutaKurs,    setValutaKurs]    = useState<number | null>(null);
  const [alleKurser,    setAlleKurser]    = useState<Record<string, number>>({});
  const [kabler,        setKabler]        = useState<any[]>([]);
  const [totalTilskudd, setTotalTilskudd] = useState(0);
  const [laan,          setLaan]          = useState<any[]>([]);
  const [investorer,    setInvestorer]    = useState<any[]>([]);
  const [pvgis,         setPvgis]         = useState<{ peak_sun_hours: number; E_y_netto: number; lat: number; lon: number; monthly: { month: number; kwhPerKwp: number }[] } | null>(null);
  const [hentesPvgis,   setHentesPvgis]   = useState(false);
  const [pvgisFeil,     setPvgisFeil]     = useState<string | null>(null);
  const [energiProfil,  setEnergiProfil]  = useState<{ annual_kwh: number; capacity_factor: number; load_hours: number; metode: string } | null>(null);
  const [henterEnergi,  setHenterEnergi]  = useState(false);
  const [sensorKostnader, setSensorKostnader] = useState<SensorKostnad[]>(SENSOR_DEFAULTS);
  const [visSensorer,   setVisSensorer]   = useState(false);
  const [conf, setConf] = useState({
    ppaKr: 0.65, ingKr: 120000, installKr: 200000, levetid: 30, containerBasispris: 80000,
    solCapexKrKwp: 12000, solPeakTimer: 950, cp: CP_WATEROTOR,
  });

  const pid = params.id;
  const LS_KEYS: Record<string, string> = {
    ppaKr:              `${pid}:rapport_ppa`,
    ingKr:              `${pid}:budsjett_ing_kr`,
    installKr:          `${pid}:budsjett_install_kr`,
    levetid:            `${pid}:budsjett_levetid`,
    containerBasispris: `${pid}:budsjett_container`,
    solCapexKrKwp:      `${pid}:budsjett_sol_capex_kwp`,
    solPeakTimer:       `${pid}:budsjett_sol_peak_timer`,
    cp:                 `${pid}:budsjett_cp`,
  };
  const LS_KEY_SENSORER = `${pid}:budsjett_sensorer`;

  // Les localStorage etter mount (SSR-trygt) — per-prosjekt nøkler
  useEffect(() => {
    const g = (k: string) => parseFloat(localStorage.getItem(k) ?? "");
    const ppaKr             = g(LS_KEYS.ppaKr);
    const ingKr             = g(LS_KEYS.ingKr);
    const installKr         = g(LS_KEYS.installKr);
    const levetid           = g(LS_KEYS.levetid);
    const containerBasispris= g(LS_KEYS.containerBasispris);
    const solCapexKrKwp     = g(LS_KEYS.solCapexKrKwp);
    const solPeakTimer      = g(LS_KEYS.solPeakTimer);
    const cp                = g(LS_KEYS.cp);
    setConf({
      ppaKr:              isNaN(ppaKr)              ? 0.65         : ppaKr,
      ingKr:              isNaN(ingKr)              ? 120000       : ingKr,
      installKr:          isNaN(installKr)          ? 200000       : installKr,
      levetid:            isNaN(levetid)            ? 30           : levetid,
      containerBasispris: isNaN(containerBasispris) ? 80000        : containerBasispris,
      solCapexKrKwp:      isNaN(solCapexKrKwp)      ? 12000        : solCapexKrKwp,
      solPeakTimer:       isNaN(solPeakTimer)       ? 950          : solPeakTimer,
      cp:                 isNaN(cp)                 ? CP_WATEROTOR : cp,
    });
    // Last sensorkostnader — slå sammen lagrede verdier med standardlisten (nye sensorer legges til)
    try {
      const lagret = localStorage.getItem(LS_KEY_SENSORER);
      if (lagret) {
        const lagretMap: Record<string, Partial<SensorKostnad>> = {};
        (JSON.parse(lagret) as SensorKostnad[]).forEach(s => { lagretMap[s.kode] = s; });
        setSensorKostnader(SENSOR_DEFAULTS.map(d => ({
          ...d,
          ...(lagretMap[d.kode] ? { pris: lagretMap[d.kode].pris ?? d.pris, aktiv: lagretMap[d.kode].aktiv ?? d.aktiv } : {}),
        })));
      }
    } catch { /* ignore */ }
  }, [pid]); // eslint-disable-line

  const oppdaterSensor = (kode: string, felt: "aktiv" | "pris", verdi: boolean | number) => {
    setSensorKostnader(prev => {
      const ny = prev.map(s => s.kode === kode ? { ...s, [felt]: verdi } : s);
      if (typeof window !== "undefined") {
        localStorage.setItem(LS_KEY_SENSORER, JSON.stringify(ny));
      }
      return ny;
    });
  };

  const set = (k: string, v: number) => {
    setConf(prev => ({ ...prev, [k]: v }));
    if (typeof window !== "undefined" && LS_KEYS[k]) {
      localStorage.setItem(LS_KEYS[k], String(v));
    }
  };

  // ── PVGIS: hent toppsoltimer for prosjektlokasjonen ───────────────────────
  const hentToppsoltimer = async () => {
    setPvgisFeil(null);
    setHentesPvgis(true);

    // Finn koordinater: bruk sentroid av solcellefelt → stream → rotorer
    let pos: { lat: number; lon: number } | null = null;

    for (const sf of solcelleFelter) {
      const coords = Array.isArray(sf.koordinater) ? sf.koordinater : [];
      pos = sentroid(coords);
      if (pos) break;
    }
    if (!pos && stream?.lat && stream?.lon) {
      pos = { lat: stream.lat, lon: stream.lon };
    }
    if (!pos) {
      const plassert = rotorer.filter(r => r.lat && r.lon);
      if (plassert.length > 0) {
        pos = sentroid(plassert.map(r => ({ lat: r.lat, lon: r.lon })));
      }
    }

    if (!pos) {
      setPvgisFeil("Ingen koordinater funnet — plasser minst ett solcellefelt eller en rotor på kartet.");
      setHentesPvgis(false);
      return;
    }

    try {
      const res  = await fetch(`/api/pvgis?lat=${pos.lat.toFixed(5)}&lon=${pos.lon.toFixed(5)}&angle=35&aspect=0`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Ukjent feil fra PVGIS");
      setPvgis(data);
    } catch (err: any) {
      setPvgisFeil(err.message);
    } finally {
      setHentesPvgis(false);
    }
  };

  useEffect(() => {
    Promise.all([
      sb.from("streams").select("*").eq("project_id", params.id).maybeSingle(),
      sb.from("projects").select("id,country_code,currency_code,vann_type").eq("id", params.id).single(),
      sb.from("rotors").select("*").eq("project_id", params.id).order("created_at"),
      sb.from("solar_fields").select("*").eq("project_id", params.id).order("created_at"),
      sb.from("cables").select("id,navn,type,waypoints,pris_kr_m").eq("project_id", params.id),
    ]).then(([{ data: s }, { data: p }, { data: r }, { data: sf }, { data: kab }]) => {
      setStream(s);
      setProsjekt(p);
      setRotorer(r ?? []);
      setSolcelleFelter(sf ?? []);
      setKabler(kab ?? []);
    });
  }, [params.id]);

  // ── Energiprofil: hent fra tidsserie-API etter at rotorer + stream er lastet ──
  useEffect(() => {
    if (rotorer.length === 0) return;
    const v_avg = stream?.avg_velocity_m_s
      ?? (null)
      ?? 0;
    if (v_avg <= 0) return;

    // halvdagslige tidevannsmodellen i API-en — bruk enkel statisk modell direkte.
    const streamTyp = stream?.stream_type ?? "tidevann";
    if (streamTyp !== "tidevann") return; // beregnArligKwh brukes som fallback

    // Bygg per-rotor array med sweept areal og faktisk kW ved lokal hastighet.
    // rated_kw = faktisk effekt ved designhastighet (ikke nominell ved 1,8 m/s).
    const rhoLocal = rhoFraVanntype(prosjekt?.vann_type);
    const rotorInput = rotorer
      .filter(r => r.lat && r.lon) // bare plasserte rotorer
      .map((r: any) => {
        const areal  = rotorSveptAreal(r);
        const vRotor = (r.hastighet_m_s && Number(r.hastighet_m_s) > 0)
          ? Number(r.hastighet_m_s)
          : v_avg;
        const rated  = rotorKwVed(r, vRotor, rhoLocal); // faktisk kW — ingen kunstig 1,8 m/s-cap
        return { areal_m2: areal, rated_kw: rated };
      })
      .filter(r => r.areal_m2 > 0 && r.rated_kw > 0);

    if (rotorInput.length === 0) return;

    // Finn koordinater fra rotorer med GPS
    const plassert = rotorer.filter((r: any) => r.lat && r.lon);
    const pos = plassert.length > 0
      ? { lat: plassert[0].lat as number, lon: plassert[0].lon as number }
      : null;

    setHenterEnergi(true);
    const params_url = new URLSearchParams({
      lat:     (pos?.lat ?? 0).toString(),
      lon:     (pos?.lon ?? 0).toString(),
      v_avg:   v_avg.toString(),
      rotorer: JSON.stringify(rotorInput),
      cp:      String(conf.cp > 0 ? conf.cp : CP_WATEROTOR),
    });
    fetch(`/api/tidsserie-energi?${params_url}`)
      .then(r => r.json())
      .then(d => { if (d.annual_kwh) setEnergiProfil(d); })
      .catch(() => {})
      .finally(() => setHenterEnergi(false));
  }, [rotorer, stream, conf.cp]); // eslint-disable-line

  // Hent valutakurser — alltid (trenger USD/NOK for CAPEX uansett visningsvaluta)
  useEffect(() => {
    fetch("/planner/api/valuta/kurs?base=NOK")
      .then(res => res.json())
      .then(d => {
        if (d.kurser) {
          setAlleKurser(d.kurser);
          const k = d.kurser[globalValuta];
          if (k && globalValuta !== "NOK") setValutaKurs(k); else setValutaKurs(null);
        }
      })
      .catch(() => {});
  }, [globalValuta]);

  const land       = finnLand(prosjekt?.country_code ?? "NO");
  const skattesats = land?.corporate_tax_rate ?? 0.22;
  const rho        = rhoFraVanntype(prosjekt?.vann_type);
  // Valuta: bruk global valutavelger (sidebar), ikke per-prosjekt currency_code
  const valutaKode = globalValuta;
  const erNOK      = valutaKode === "NOK";
  const valutaSym  = LAND.find(l => l.currency_code === valutaKode)?.currency_symbol ?? valutaKode;

  const avgV = stream?.avg_velocity_m_s
    ?? (null)
    ?? 0;
  const streamType = stream?.stream_type ?? "tidevann";
  // Advarsel bare hvis INGEN har hastighet — verken stream eller enkeltrotorer
  const harHastighet = avgV > 0 || rotorer.some(r => r.hastighet_m_s && Number(r.hastighet_m_s) > 0);

  // USD/NOK-kurs: alleKurser["USD"] = NOK→USD (f.eks. 0.095), så NOK per USD = 1/0.095 ≈ 10.5
  const usdNokRate = alleKurser["USD"] ? 1 / alleKurser["USD"] : USD_NOK_FALLBACK;

  // Skalfaktor for Cp-justering: default CP_WATEROTOR = 0.42
  const cpFaktor = (conf.cp > 0 && CP_WATEROTOR > 0) ? conf.cp / CP_WATEROTOR : 1;

  // Beregn kW per rotor basert pa faktiske data
  const rotorData = rotorer.map(r => ({
    ...r,
    kwNominell: rotorKwNominell(r),
    kwVed: rotorKwVed(r, avgV, rho) * cpFaktor,
    // CAPEX låst til $5/W = $5 000/kW, omregnet til NOK via live kurs
    basispris: (() => {
      const kw = rotorKwNominell(r);
      return (kw > 0 ? kw : 5) * 1000 * CAPEX_USD_PER_W * usdNokRate;
    })(),
    vBruk: (r.hastighet_m_s && Number(r.hastighet_m_s) > 0) ? Number(r.hastighet_m_s) : avgV,
  }));
  // Bruk faktisk hastighet for produksjonsberegning
  const totalEffekt = rotorData.reduce((s, r) => s + r.kwVed, 0);
  const antall      = rotorer.length;

  // Bruk tidsserie-energi (power curve) hvis tilgjengelig, ellers enkel statisk modell
  const arligKwhRotor  = energiProfil?.annual_kwh
    ?? (totalEffekt > 0 ? beregnArligKwh(totalEffekt, streamType) : 0);

  // ── Solcelleberegninger ───────────────────────────────────────────────────
  const solData = solcelleFelter.map(sf => {
    const areal   = Number(sf.areal_m2 ?? 0);
    const eff     = Number(sf.effektivitet_pst ?? 21) / 100;
    const kwp     = areal * eff;                          // kWp ved STC (1000 W/m²)
    const kwhAr   = kwp * conf.solPeakTimer;              // kWh/år
    const capex   = kwp * conf.solCapexKrKwp;             // CAPEX
    return { ...sf, kwp, kwhAr, capex };
  });
  const totalSolKwp    = solData.reduce((s, sf) => s + sf.kwp,   0);
  const arligKwhSol    = solData.reduce((s, sf) => s + sf.kwhAr, 0);
  const solCapex       = solData.reduce((s, sf) => s + sf.capex, 0);

  const arligKwh       = arligKwhRotor + arligKwhSol;
  const containerCapex = beregnContainerCapex(antall, conf.containerBasispris);
  const rotorCapex     = rotorData.reduce((s, r) => s + r.basispris, 0);

  // Kabel-CAPEX: Σ (pris_kr_m × lengde_m) per kabel
  function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
    const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
  const kabelData = kabler.map(k => {
    const wps: { lat: number; lon: number }[] = Array.isArray(k.waypoints) ? k.waypoints : [];
    let lengdeM = 0;
    for (let i = 0; i < wps.length - 1; i++) {
      lengdeM += haversineM(wps[i].lat, wps[i].lon, wps[i+1].lat, wps[i+1].lon);
    }
    const prisM = +(k.pris_kr_m ?? 0);
    return { ...k, lengdeM, capex: prisM * lengdeM };
  });
  const kabelCapex = kabelData.reduce((s, k) => s + k.capex, 0);

  const sensorCapex    = sensorKostnader.filter(s => s.aktiv).reduce((sum, s) => sum + (s.per === "rotor" ? s.pris * Math.max(1, antall) : s.pris), 0);
  const bruttoCapex    = rotorCapex + containerCapex + conf.ingKr + conf.installKr + solCapex + kabelCapex + sensorCapex;
  const totalCapex     = Math.max(0, bruttoCapex - totalTilskudd); // netto etter støtte
  // OPEX: 1 % av rotor-CAPEX per år (kun plasserte rotorer)
  const arligOpex      = rotorCapex * 0.01;
  const arligInntekt   = arligKwh * conf.ppaKr;
  const arligOverskudd = arligInntekt - arligOpex;
  const lcoe           = totalEffekt > 0 ? beregnLCOE(totalCapex, arligOpex, arligKwh, 30, RENTE) : 0;   // alltid 30 år
  const lcoe12         = totalEffekt > 0 ? beregnLCOE(totalCapex, arligOpex, arligKwh, 12, RENTE) : 0;   // 12-år referanse ($5/W premise)

  // ── Lånefinansiering ──────────────────────────────────────────────────────
  const prosjektStartAar = new Date().getFullYear();
  const totalLaan    = laan.reduce((s: number, l: any) => s + +(l.belop_nok ?? 0), 0);
  const egenkapital  = Math.max(0, totalCapex - totalLaan);
  const ytelsePerAr  = summerYtelsePerAr(laan, conf.levetid, prosjektStartAar);

  // År-for-år tabell
  const arForArTabell = Array.from({ length: conf.levetid }, (_, i) => {
    const inntekt  = arligInntekt;
    const opex     = arligOpex;
    const renter   = ytelsePerAr[i]?.renter ?? 0;
    const avdrag   = ytelsePerAr[i]?.avdrag ?? 0;
    const ytelse   = ytelsePerAr[i]?.ytelse ?? 0;
    const cf       = inntekt - opex - ytelse;
    const skattbar = Math.max(0, inntekt - opex - renter); // renter er fradragsberettiget
    const cfEtterSkatt = cf - skattbar * skattesats;
    return { ar: i + 1, inntekt, opex, renter, avdrag, ytelse, cf, cfEtterSkatt };
  });

  const harLaan     = laan.length > 0 && totalLaan > 0;
  const irrLevered  = harLaan ? beregnIRR([-egenkapital, ...arForArTabell.map(r => r.cfEtterSkatt)]) : null;
  const npvLevered  = harLaan ? beregnNPV(RENTE, [-egenkapital, ...arForArTabell.map(r => r.cfEtterSkatt)]) : null;

  const cfs            = [-totalCapex, ...Array(conf.levetid).fill(arligOverskudd)];
  const irr            = arligOverskudd > 0 ? beregnIRR(cfs) : NaN;
  const npv            = beregnNPV(RENTE, cfs);
  const tilbakebetaling = arligOverskudd > 0 ? totalCapex / arligOverskudd : Infinity;
  const cfsEtterSkatt  = beregnEtterSkattCashflows(totalCapex, arligOverskudd, conf.levetid, skattesats);
  const irrEs          = arligOverskudd > 0 ? beregnIRR(cfsEtterSkatt) : NaN;
  const npvEs          = beregnNPV(RENTE, cfsEtterSkatt);

  const nok = (v: number) => Math.round(v).toLocaleString("nb-NO");
  // fmtKr brukes for store beløp (MNOK-format); valuta for de som også skal vise utenlandsk
  const valuta = (v: number) =>
    erNOK || !valutaKurs
      ? fmtKr(v, "NOK")
      : valutaSym + " " + Math.round(v * valutaKurs).toLocaleString("nb-NO");
  const valutaDobbel = (v: number) =>
    erNOK || !valutaKurs
      ? fmtKr(v, "NOK")
      : fmtKr(v, "NOK") + " / " + valutaSym + " " + Math.round(v * valutaKurs).toLocaleString("nb-NO");

  return (
    <div className="space-y-6">

      {/* Land og valuta */}
      {land && (
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl text-sm text-slate-600 border border-slate-100">
          <span className="text-2xl">{land.flag}</span>
          <div>
            <span className="font-medium">{land.name_en}</span>
            <span className="text-slate-400 ml-2">
              Bedriftsskatt: {(land.corporate_tax_rate * 100).toFixed(1)}% &middot; Valuta: {valutaKode}
            </span>
            {valutaKurs && !erNOK && (
              <span className="text-slate-400 ml-2">&middot; 1 kr = {valutaSym}{valutaKurs.toFixed(4)}</span>
            )}
          </div>
        </div>
      )}

      {/* Rotorer fra Utstyr-siden */}
      {!harHastighet && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl text-sm text-amber-700 border border-amber-200">
          <span>⚠️</span>
          <span>Ingen stroemhastighet registrert — produksjon beregnet ved nominell 1,8 m/s. Legg inn hastighet under <strong>Innstillinger</strong>.</span>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Installerte rotorer</h2>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              💲 CAPEX: ${CAPEX_USD_PER_W}/W
              <span className="text-emerald-500 font-normal">
                ≈ {Math.round(CAPEX_USD_PER_W * 1000 * usdNokRate).toLocaleString("nb-NO")} kr/kW
              </span>
            </span>
            <span className="text-sm text-slate-400">{antall} rotor{antall !== 1 ? "er" : ""} &middot; {fmtKw(totalEffekt)} totalt</span>
          </div>
        </div>
        {antall > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">#</th>
                <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">Modell</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Svept areal</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">kW @ 1,8</th>
                <th className="text-right px-4 py-2 text-slate-400 font-medium text-xs">m/s</th>
                <th className="text-right px-4 py-2 text-[#0F2A5A] font-semibold text-xs">kW faktisk</th>
                <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">Fase/År</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Basispris</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rotorData.map((r, i) => {
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-400 text-xs">#{i+1}</td>
                    <td className="px-4 py-2.5 text-slate-800 font-medium text-xs">{r.modell}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500 text-xs font-mono">
                      {(() => {
                        const a = rotorSveptAreal(r);
                        if (a <= 0) return "—";
                        const kilde = r.lengde_m && r.hoyde_m ? `${r.lengde_m}×${r.hoyde_m}m`
                          : r.diameter_m ? `${r.diameter_m}²m`
                          : "~";
                        return `${a.toFixed(2)} m² (${kilde})`;
                      })()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{r.kwNominell > 0 ? `${fmtKw(r.kwNominell)}` : "—"}</td>
                    <td className="px-4 py-2.5 text-right text-xs">
                      {r.hastighet_m_s && Number(r.hastighet_m_s) > 0
                        ? <span className="font-medium text-emerald-700">{Number(r.hastighet_m_s).toFixed(2)}</span>
                        : avgV > 0 ? <span className="text-slate-300">{avgV.toFixed(2)}*</span> : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-[#0F2A5A] text-sm">
                      {r.kwVed > 0 ? `${fmtKw(r.kwVed)}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {r.fase ? `F${r.fase}` : ""}{r.installasjonsar ? ` ${r.installasjonsar}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500 text-xs">{valuta(r.basispris)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
              <tr className="font-semibold text-slate-900">
                <td className="px-4 py-2.5 text-xs" colSpan={2}>Totalt</td>
                <td className="px-4 py-2.5 text-right text-xs text-slate-400 font-mono">
                  {rotorData.reduce((s,r)=>s+rotorSveptAreal(r),0).toFixed(1)} m²
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-slate-400">{fmtKw(rotorData.reduce((s,r)=>s+r.kwNominell,0))}</td>
                <td />
                <td className="px-4 py-2.5 text-right text-sm text-[#0F2A5A] font-semibold">
                  {fmtKw(rotorData.reduce((s, r) => s + r.kwVed, 0))}
                </td>
                <td />
                <td className="px-4 py-2.5 text-right text-xs">{valuta(rotorCapex)}</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <div className="p-8 text-center text-slate-400 text-sm">
            <p className="font-medium text-slate-600 mb-1">Ingen rotorer registrert</p>
            <p>Legg til rotorer under Utstyr-fanen</p>
          </div>
        )}

        {/* Cp-justerin */}
        {antall > 0 && (
          <div className="px-5 py-3 bg-blue-50 border-t border-blue-100 flex flex-wrap gap-4 items-center text-sm">
            <span className="text-blue-700 text-xs font-medium">Effektkoeffisient:</span>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Cp (effektkoeffisient)
              <input
                type="number" step="0.01" min={0.05} max={0.593}
                value={conf.cp}
                onChange={e => { set("cp", +e.target.value); setEnergiProfil(null); }}
                className="w-20 border border-slate-200 rounded px-2 py-1 text-right focus:outline-none bg-white"
              />
            </label>
            <span className="text-xs text-slate-400">
              Standard: {CP_WATEROTOR} (Waterotor) · Betz-grense: 0,593
            </span>
            {conf.cp !== CP_WATEROTOR && (
              <button
                onClick={() => { set("cp", CP_WATEROTOR); setEnergiProfil(null); }}
                className="ml-auto text-xs text-blue-600 hover:underline"
              >
                Tilbakestill til {CP_WATEROTOR}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Solcellepaneler */}
      {solData.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">☀️ Solcellepaneler</h2>
            <span className="text-sm text-slate-400">
              {solData.length} felt · {totalSolKwp.toFixed(1)} kWp · {Math.round(arligKwhSol).toLocaleString("nb-NO")} kWh/år
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">Felt</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Areal (m²)</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Effektivitet</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Toppeffekt (kWp)</th>
                <th className="text-right px-4 py-2 text-[#0F2A5A] font-semibold text-xs">Prod./år (kWh)</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">CAPEX (kr)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {solData.map((sf, i) => (
                <tr key={sf.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-800 font-medium text-xs">{sf.navn ?? `Felt ${i + 1}`}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500 text-xs">{Number(sf.areal_m2 ?? 0).toFixed(0)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500 text-xs">{Number(sf.effektivitet_pst ?? 21).toFixed(0)} %</td>
                  <td className="px-4 py-2.5 text-right text-slate-700 text-xs font-mono">{sf.kwp.toFixed(1)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-[#0F2A5A] text-sm">
                    {Math.round(sf.kwhAr).toLocaleString("nb-NO")}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 text-xs font-mono">{nok(sf.capex)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
              <tr className="font-semibold text-slate-900">
                <td className="px-4 py-2.5 text-xs" colSpan={3}>Totalt</td>
                <td className="px-4 py-2.5 text-right text-xs">{totalSolKwp.toFixed(1)} kWp</td>
                <td className="px-4 py-2.5 text-right text-[#0F2A5A]">{Math.round(arligKwhSol).toLocaleString("nb-NO")}</td>
                <td className="px-4 py-2.5 text-right text-xs font-mono">{fmtKr(solCapex)}</td>
              </tr>
            </tfoot>
          </table>
          {/* Justerbare parametere + PVGIS */}
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-100 flex flex-wrap gap-4 items-center text-sm">
            <span className="text-amber-700 text-xs font-medium">Forutsetninger:</span>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Toppsoltimer/år
              <input type="number" step="10" min={100} max={2000}
                value={conf.solPeakTimer}
                onChange={e => set("solPeakTimer", +e.target.value)}
                className="w-20 border border-slate-200 rounded px-2 py-1 text-right focus:outline-none bg-white" />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              CAPEX (kr/kWp)
              <input type="number" step="500" min={1000} max={50000}
                value={conf.solCapexKrKwp}
                onChange={e => set("solCapexKrKwp", +e.target.value)}
                className="w-24 border border-slate-200 rounded px-2 py-1 text-right focus:outline-none bg-white" />
            </label>
            <button
              onClick={hentToppsoltimer}
              disabled={hentesPvgis}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F2A5A] text-white text-xs font-medium hover:bg-[#1a3d7c] disabled:opacity-50 transition-colors"
            >
              {hentesPvgis ? (
                <><span className="animate-spin inline-block">⟳</span> Henter fra PVGIS…</>
              ) : (
                <>🛰 Hent toppsoltimer fra PVGIS</>
              )}
            </button>
            <span className="text-xs text-slate-400 w-full">
              Endre effektivitet og areal per felt under Kart-fanen
            </span>
          </div>

          {/* PVGIS-feil */}
          {pvgisFeil && (
            <div className="px-5 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600">
              ⚠ {pvgisFeil}
            </div>
          )}

          {/* PVGIS-resultat */}
          {pvgis && (
            <div className="border-t border-amber-100 bg-white">
              <div className="px-5 py-3 flex flex-wrap items-center gap-4">
                <div>
                  <span className="text-xs text-slate-400 uppercase tracking-wider block mb-0.5">PVGIS — toppsoltimer</span>
                  <span className="text-2xl font-bold text-[#0F2A5A]">{pvgis.peak_sun_hours}</span>
                  <span className="text-xs text-slate-500 ml-1">timer/år</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase tracking-wider block mb-0.5">Netto prod. (14% tap)</span>
                  <span className="text-lg font-semibold text-slate-700">{pvgis.E_y_netto}</span>
                  <span className="text-xs text-slate-500 ml-1">kWh/kWp·år</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase tracking-wider block mb-0.5">Koordinat</span>
                  <span className="text-xs text-slate-600 font-mono">{pvgis.lat.toFixed(4)}°N {pvgis.lon.toFixed(4)}°Ø</span>
                </div>
                <button
                  onClick={() => set("solPeakTimer", pvgis.peak_sun_hours)}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors"
                >
                  ✓ Bruk {pvgis.peak_sun_hours} timer/år
                </button>
              </div>
              {/* Månedlig fordeling */}
              {pvgis.monthly.length > 0 && (
                <div className="px-5 pb-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Månedlig produksjon (kWh/kWp)</p>
                  <div className="grid grid-cols-12 gap-1">
                    {["Jan","Feb","Mar","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Des"].map((mnd, i) => {
                      const m = pvgis.monthly[i];
                      const val = m?.kwhPerKwp ?? 0;
                      const max = Math.max(...pvgis.monthly.map(x => x.kwhPerKwp));
                      const pct = max > 0 ? (val / max) * 100 : 0;
                      return (
                        <div key={mnd} className="flex flex-col items-center gap-1">
                          <span className="text-xs font-mono text-slate-700">{val}</span>
                          <div className="w-full bg-slate-100 rounded-sm" style={{ height: 48 }}>
                            <div
                              className="w-full rounded-sm bg-amber-400"
                              style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400">{mnd}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Faseplan */}
      {(antall > 0 || solData.length > 0) && (() => {
        // Nøkkel: "F1", "F2" ... hvis fase er satt, ellers år, ellers "Ukjent"
        // Sorteringsnøkkel: fase-numre sorteres numerisk, år alfabetisk, "Ukjent" sist
        type FaseRad = { capex: number; kw: number; kwhRotor: number; kwhSol: number; rotorCount: number; solCount: number; label: string; sortKey: string };
        const faseMap: Record<string, FaseRad> = {};
        const nøkkel = (fase: number | null | undefined, ar: number | null | undefined): { key: string; label: string; sortKey: string } => {
          if (fase) return { key: `F${fase}`, label: `Fase ${fase}`, sortKey: `0_${String(fase).padStart(4, "0")}` };
          if (ar)   return { key: String(ar),  label: String(ar),     sortKey: `1_${ar}` };
          return { key: "Ukjent", label: "Ukjent", sortKey: "9_Ukjent" };
        };
        // Skalafaktor: hvis energiProfil er tilgjengelig (power-curve-modell) skal
        // tabellen bruke samme energitall som KPI-kortene — ikke den enkle kapasitetsfaktoren.
        const totalKwhSimple = rotorData.reduce((s, r) => s + beregnArligKwh(r.kwVed, streamType), 0);
        const kwhScale = (energiProfil && totalKwhSimple > 0)
          ? energiProfil.annual_kwh / totalKwhSimple
          : 1;

        rotorData.forEach(r => {
          const { key, label, sortKey } = nøkkel(r.fase, r.installasjonsar);
          if (!faseMap[key]) faseMap[key] = { capex: 0, kw: 0, kwhRotor: 0, kwhSol: 0, rotorCount: 0, solCount: 0, label, sortKey };
          faseMap[key].capex     += r.basispris;
          faseMap[key].kw        += r.kwVed;
          faseMap[key].kwhRotor  += beregnArligKwh(r.kwVed, streamType) * kwhScale;
          faseMap[key].rotorCount++;
        });
        solData.forEach(sf => {
          const { key, label, sortKey } = nøkkel(null, sf.installasjonsar);
          if (!faseMap[key]) faseMap[key] = { capex: 0, kw: 0, kwhRotor: 0, kwhSol: 0, rotorCount: 0, solCount: 0, label, sortKey };
          faseMap[key].capex   += sf.capex;
          faseMap[key].kwhSol  += sf.kwhAr;
          faseMap[key].solCount++;
        });
        const ars = Object.keys(faseMap).sort((a, b) => faseMap[a].sortKey.localeCompare(faseMap[b].sortKey));
        const brukerFaser = rotorData.some(r => r.fase);
        let kumKw = 0; let kumKwh = 0;
        return (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-900">
              Faseplan — produksjon og inntekt per {brukerFaser ? "fase" : "driftsår"}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">{brukerFaser ? "Fase" : "År"}</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Utstyr</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">CAPEX (kr)</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Ny effekt</th>
                  <th className="text-right px-4 py-2 text-[#0F2A5A] font-semibold text-xs">Kum. effekt</th>
                  <th className="text-right px-4 py-2 text-[#0F2A5A] font-semibold text-xs">Kum. prod./år</th>
                  <th className="text-right px-4 py-2 text-emerald-700 font-semibold text-xs">Kum. inntekt/år</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ars.map(key => {
                  const d = faseMap[key];
                  kumKw  += d.kw;
                  kumKwh += d.kwhRotor + d.kwhSol;
                  const kumInntekt = kumKwh * conf.ppaKr;
                  const utstyrTekst = [
                    d.rotorCount > 0 ? `${d.rotorCount} rotor${d.rotorCount > 1 ? "er" : ""}` : "",
                    d.solCount > 0   ? `${d.solCount} ☀️` : "",
                  ].filter(Boolean).join(" + ");
                  return (
                    <tr key={key} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-800">{d.label}</td>
                      <td className="px-4 py-3 text-right text-slate-500 text-xs">{utstyrTekst}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">{fmtKr(d.capex)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{d.kw > 0 ? `+${fmtKw(d.kw)}` : "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#0F2A5A]">{kumKw > 0 ? fmtKw(kumKw) : "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">{fmtKwh(kumKwh)}/år</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmtKr(kumInntekt)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-900">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>Totalt</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtKr(rotorCapex + solCapex)}</td>
                  <td />
                  <td className="px-4 py-3 text-right text-[#0F2A5A]">{kumKw > 0 ? fmtKw(kumKw) : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtKwh(kumKwh)}/år</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{fmtKr(kumKwh * conf.ppaKr)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })()}

      {/* Energiprofil — tidsserie / power curve */}
      {(energiProfil || henterEnergi) && antall > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">⚡ Energiprofil — tidsserie</h2>
            <span className="text-xs text-slate-400 bg-slate-100 rounded px-2 py-1">
              {henterEnergi ? "Beregner…" : energiProfil?.metode === "kartverket"
                ? "📡 Kartverket tidevannsdata" : "〜 Syntetisk halvdagsmodell"} · effektkurve med P_rated-tak
            </span>
          </div>
          {henterEnergi ? (
            <div className="text-slate-400 text-sm">Henter tidevannsdata…</div>
          ) : energiProfil ? (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Årsenergi (rotorer)</p>
                <p className="text-xl font-bold text-[#0F2A5A]">{fmtKwh(energiProfil.annual_kwh)}/år</p>
                <p className="text-xs text-slate-400 mt-1">
                  {(energiProfil.annual_kwh / 1000).toFixed(1)} MWh/år
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Kapasitetsfaktor</p>
                <p className="text-xl font-bold text-emerald-700">
                  {(energiProfil.capacity_factor * 100).toFixed(1)} %
                </p>
                <p className="text-xs text-slate-400 mt-1">Andel av installert effekt × 8 760 t</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Fulllasttimer</p>
                <p className="text-xl font-bold text-slate-700">
                  {Math.round(energiProfil.load_hours).toLocaleString("nb-NO")} t/år
                </p>
                <p className="text-xs text-slate-400 mt-1">Ekvivalente timer ved P_rated</p>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Nokkeltal */}
      {antall > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total installert effekt",                 value: fmtKw(totalEffekt) },
            { label: "Estimert produksjon",                     value: fmtKwh(arligKwh) + "/år" },
            { label: "LCOE (30 år)",               value: lcoe > 0 ? lcoe.toFixed(2) + " kr/kWh" : "—" },
            { label: "LCOE (12 år — $5/W ref.)",               value: lcoe12 > 0 ? lcoe12.toFixed(2) + " kr/kWh" : "—" },
            { label: "Tilbakebetalingstid",                     value: isFinite(tilbakebetaling) ? tilbakebetaling.toFixed(1) + " ar" : "—" },
            { label: "IRR (for skatt)",                         value: isFinite(irr) && irr > -1 && irr < 10 ? (irr * 100).toFixed(1) + " %" : "—" },
            { label: `IRR (etter ${(skattesats*100).toFixed(0)}% skatt)`, value: isFinite(irrEs) && irrEs > -1 && irrEs < 10 ? (irrEs * 100).toFixed(1) + " %" : "—" },
            { label: "NPV for skatt (8%)",                      value: valuta(npv) },
            { label: "NPV etter skatt (8%)",                    value: valuta(npvEs) },
          ].map(k => (
            <div key={k.label} className="card p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
              <p className="text-base font-semibold text-slate-900">{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* CAPEX */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-900">CAPEX</div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {[
              { post: `Rotorer (${antall} stk)`,                              belop: rotorCapex,     key: null },
              { post: "Tilkoblingspunkt / container",                          belop: containerCapex, key: null },
              ...(solData.length > 0 ? [{ post: `Solcellepaneler (${solData.length} felt, ${totalSolKwp.toFixed(1)} kWp)`, belop: solCapex, key: null }] : []),
              ...(kabelData.length > 0 ? [{ post: `Kabler (${kabelData.length} stk, ${Math.round(kabelData.reduce((s,k)=>s+k.lengdeM,0))} m totalt${kabelCapex === 0 ? " — sett pris kr/m i kart" : ""})`, belop: kabelCapex, key: null }] : []),
              { post: "Engineering og prosjektering",                          belop: conf.ingKr,     key: "ingKr" },
              { post: "Installasjon og rigging",                               belop: conf.installKr, key: "installKr" },
            ].map(r => (
              <tr key={r.post}>
                <td className="px-5 py-3 text-slate-700">{r.post}</td>
                <td className="px-5 py-3 text-right text-slate-500 text-xs">
                  {!erNOK && valutaKurs ? valutaSym + " " + nok(r.belop * valutaKurs) : ""}
                </td>
                <td className="px-5 py-3 text-right">
                  {r.key ? (
                    <input type="number" step="1000"
                      className="w-32 border border-slate-200 rounded px-2 py-1 text-right text-sm focus:outline-none"
                      value={r.belop} onChange={e => set(r.key!, +e.target.value)} />
                  ) : (
                    <span className="font-mono">{nok(r.belop)}</span>
                  )} kr
                </td>
              </tr>
            ))}

            {/* ── Sensorer og overvåking ── */}
            <tr
              className="cursor-pointer hover:bg-slate-50 select-none"
              onClick={() => setVisSensorer(v => !v)}
            >
              <td className="px-5 py-3 text-slate-700 flex items-center gap-2">
                <span className="text-slate-400 text-xs">{visSensorer ? "▼" : "▶"}</span>
                Sensorer og overvåking
                <span className="text-xs text-slate-400 font-normal ml-1">
                  ({sensorKostnader.filter(s => s.aktiv).length} aktive — klikk for å redigere)
                </span>
              </td>
              <td className="px-5 py-3 text-right text-slate-500 text-xs">
                {!erNOK && valutaKurs ? valutaSym + " " + nok(sensorCapex * valutaKurs) : ""}
              </td>
              <td className="px-5 py-3 text-right">
                <span className="font-mono">{nok(sensorCapex)}</span> kr
              </td>
            </tr>
            {visSensorer && (
              <tr>
                <td colSpan={3} className="px-0 py-0">
                  <table className="w-full text-xs border-t border-slate-100">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 uppercase tracking-wider">
                        <th className="px-5 py-2 text-left font-medium w-8"></th>
                        <th className="px-2 py-2 text-left font-medium w-12">Kode</th>
                        <th className="px-2 py-2 text-left font-medium">Sensor</th>
                        <th className="px-2 py-2 text-center font-medium w-20">Per</th>
                        <th className="px-2 py-2 text-right font-medium w-32">Pris (NOK)</th>
                        <th className="px-5 py-2 text-right font-medium w-36">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(["rotor", "anlegg"] as const).map(gruppe => (
                        <Fragment key={gruppe}>
                          <tr className="bg-slate-100/60">
                            <td colSpan={6} className="px-5 py-1.5 text-slate-500 font-semibold uppercase tracking-wider text-xs">
                              {gruppe === "rotor" ? `Per rotor (× ${Math.max(1, antall)} rotor${antall !== 1 ? "er" : ""})` : "Per anlegg"}
                            </td>
                          </tr>
                          {sensorKostnader.filter(s => s.per === gruppe).map(s => {
                            const total = s.aktiv ? (s.per === "rotor" ? s.pris * Math.max(1, antall) : s.pris) : 0;
                            return (
                              <tr key={s.kode} className={s.aktiv ? "bg-white" : "bg-slate-50 text-slate-400"}>
                                <td className="px-5 py-2">
                                  <input
                                    type="checkbox"
                                    checked={s.aktiv}
                                    onChange={e => oppdaterSensor(s.kode, "aktiv", e.target.checked)}
                                    className="w-3.5 h-3.5 accent-[#0F2A5A] cursor-pointer"
                                  />
                                </td>
                                <td className="px-2 py-2 font-mono text-slate-500">{s.kode}</td>
                                <td className="px-2 py-2">{s.navn}</td>
                                <td className="px-2 py-2 text-center text-slate-400">
                                  {s.per === "rotor" ? "Rotor" : "Anlegg"}
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    step={500}
                                    value={s.pris}
                                    onChange={e => oppdaterSensor(s.kode, "pris", Math.max(0, +e.target.value))}
                                    className="w-28 border border-slate-200 rounded px-2 py-0.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-[#0F2A5A]/30 disabled:bg-slate-50"
                                    disabled={!s.aktiv}
                                  />
                                  <span className="ml-1 text-slate-400">kr</span>
                                </td>
                                <td className="px-5 py-2 text-right font-mono text-slate-600">
                                  {s.aktiv ? nok(total) + " kr" : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      ))}
                      <tr className="bg-slate-50 font-semibold text-slate-700">
                        <td colSpan={5} className="px-5 py-2 text-right text-xs">Sum sensorer og overvåking</td>
                        <td className="px-5 py-2 text-right font-mono text-xs">{nok(sensorCapex)} kr</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            )}

            {/* Subtotal brutto */}
            <tr className="bg-slate-50 text-slate-600 text-xs">
              <td className="px-5 py-2">Brutto CAPEX</td>
              <td />
              <td className="px-5 py-2 text-right font-mono">{nok(bruttoCapex)} kr</td>
            </tr>
            {/* Tilskudd */}
            {totalTilskudd > 0 && (
              <tr className="bg-emerald-50 text-emerald-800">
                <td className="px-5 py-2 text-sm">🏛 Støtte og tilskudd</td>
                <td className="px-5 py-2 text-right text-xs text-emerald-600">
                  {!erNOK && valutaKurs ? "− " + valutaSym + " " + nok(totalTilskudd * valutaKurs) : ""}
                </td>
                <td className="px-5 py-2 text-right font-mono font-semibold">− {nok(totalTilskudd)} kr</td>
              </tr>
            )}
            {/* Netto */}
            <tr className="bg-slate-100 font-semibold">
              <td className="px-5 py-3">{totalTilskudd > 0 ? "Netto CAPEX (etter støtte)" : "Totalt CAPEX"}</td>
              <td className="px-5 py-3 text-right text-slate-500 text-sm">
                {!erNOK && valutaKurs ? valutaDobbel(totalCapex) : ""}
              </td>
              <td className="px-5 py-3 text-right font-mono">{fmtKr(totalCapex)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Støtteordninger */}
      <StøtteSeksjon
        projectId={params.id}
        bruttoCapex={bruttoCapex}
        onTilskuddEndret={setTotalTilskudd}
      />

      {/* OPEX og PPA */}
      <div className="card p-5 grid grid-cols-4 gap-4">
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Levetid (ar)</label>
          <input type="number" min={1} max={50} step={1}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
            value={conf.levetid} onChange={e => set("levetid", +e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">PPA-pris (kr/kWh)</label>
          <input type="number" step="0.01"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
      
            value={conf.ppaKr} onChange={e => set("ppaKr", +e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Arlig inntekt</label>
          <p className="text-sm text-slate-700 py-2 font-medium">{valutaDobbel(arligInntekt)}</p>
        </div>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Arlig OPEX</label>
          <p className="text-sm text-slate-700 py-2 font-medium">
            {valuta(arligOpex)}
            <span className="text-xs text-slate-400 font-normal ml-1">(1 % av rotor-CAPEX/år)</span>
          </p>
        </div>
      </div>

      {/* Resultater */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "LCOE (30 år)", value: lcoe > 0 ? `${lcoe.toFixed(2)} kr/kWh` : "—" },
          { label: "LCOE (12 år — $5/W ref.)", value: lcoe12 > 0 ? `${lcoe12.toFixed(2)} kr/kWh` : "—" },
          { label: "IRR (for skatt)",        value: isFinite(irr) && irr > -1 ? `${(irr*100).toFixed(1)} %` : "—" },
          { label: `IRR etter skatt`,        value: isFinite(irrEs) && irrEs > -1 ? `${(irrEs*100).toFixed(1)} %` : "—" },
          { label: "NPV (8 %)",             value: valutaDobbel(npv) },
          { label: "NPV etter skatt",        value: valutaDobbel(npvEs) },
          { label: "Tilbakebetaling",        value: isFinite(tilbakebetaling) ? `${tilbakebetaling.toFixed(1)} ar` : "—" },
          { label: "Arlig overskudd",        value: valutaDobbel(arligOverskudd) },
          { label: "Total CAPEX",            value: valutaDobbel(totalCapex) },
        ].map(k => (
          <div key={k.label} className="card p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
            <p className="text-base font-semibold text-slate-900">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Kumulativ kontantstrom */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Kumulativ kontantstrøm (etter skatt)</h2>
          {!harHastighet && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
              ⚠ Sett strømhastighet for reelle tall
            </span>
          )}
        </div>
        <div className="grid grid-cols-6 gap-2">
          {[5,10,12,15,20,25,30].filter(t => t <= conf.levetid).map(t => {
            const slice = cfsEtterSkatt.slice(0, Math.min(t + 1, cfsEtterSkatt.length));
            const kum   = slice.reduce((s, v) => s + v, 0);
            const pct   = totalCapex > 0 ? (kum / totalCapex * 100) : 0;
            const br    = tilbakebetaling;
            const erBreakeven = isFinite(br) && t >= Math.floor(br) && t - 5 < Math.floor(br);
            return (
              <div key={t} className={`rounded-xl p-3 text-center relative ${kum >= 0 ? "bg-green-50 border border-green-100" : "bg-red-50 border border-red-100"}`}>
                {erBreakeven && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs bg-emerald-600 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    breakeven
                  </div>
                )}
                <p className="text-xs text-slate-500 mb-1">År {t}</p>
                <p className={`text-sm font-bold ${kum >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {kum >= 0 ? "+" : ""}{Math.round(kum / 1_000_000) !== 0
                    ? `${(kum/1_000_000).toFixed(1)}M`
                    : `${Math.round(kum / 1000).toLocaleString("nb-NO")}k`}
                </p>
                <p className={`text-xs mt-0.5 ${kum >= 0 ? "text-green-500" : "text-red-400"}`}>
                  {kum >= 0 ? "+" : ""}{pct.toFixed(0)}%
                </p>
              </div>
            );
          })}
        </div>
        {isFinite(tilbakebetaling) && (
          <p className="text-xs text-slate-400 mt-3">
            Tilbakebetalingstid (enkel): {tilbakebetaling.toFixed(1)} år · 
            IRR etter skatt: {isFinite(irrEs) && irrEs > -1 ? `${(irrEs*100).toFixed(1)} %` : "—"} · 
            NPV etter skatt: {valutaDobbel(npvEs)}
          </p>
        )}
      </div>

      {/* Lånefinansiering */}
      <LånSeksjon
        projectId={params.id}
        nettoCapex={totalCapex}
        onLånEndret={setLaan}
      />

      {/* Investorer */}
      <InvestorSeksjon
        projectId={params.id}
        arligInntekt={arligInntekt}
        onInvestorerEndret={setInvestorer}
      />

      {/* År-for-år finansiell tabell */}
      {(antall > 0 || solData.length > 0) && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">📅 Økonomi år for år</h2>
            <div className="flex items-center gap-3">
              {harLaan && irrLevered != null && isFinite(irrLevered) && irrLevered > -1 && (
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 font-medium">
                  Levered IRR: {(irrLevered * 100).toFixed(1)} %
                </span>
              )}
              {harLaan && npvLevered != null && (
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 font-medium">
                  Levered NPV: {nok(npvLevered)} kr
                </span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-slate-500 font-medium whitespace-nowrap">År</th>
                  <th className="text-right px-3 py-2 text-emerald-700 font-medium whitespace-nowrap">Inntekt</th>
                  <th className="text-right px-3 py-2 text-slate-500 font-medium whitespace-nowrap">OPEX</th>
                  {harLaan && <>
                    <th className="text-right px-3 py-2 text-amber-700 font-medium whitespace-nowrap">Renter</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-medium whitespace-nowrap">Avdrag</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-medium whitespace-nowrap">Ytelse</th>
                  </>}
                  <th className="text-right px-3 py-2 text-[#0F2A5A] font-semibold whitespace-nowrap">
                    {harLaan ? "CF etter gjeld" : "Kontantstrøm"}
                  </th>
                  <th className="text-right px-3 py-2 text-[#0F2A5A] font-semibold whitespace-nowrap">
                    {harLaan ? "CF etter skatt" : "CF etter skatt"}
                  </th>
                  <th className="text-right px-3 py-2 text-slate-400 font-medium whitespace-nowrap">Kumulativ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(() => {
                  let kum = harLaan ? -egenkapital : -totalCapex;
                  return arForArTabell.map(r => {
                    const cfVis = harLaan ? r.cfEtterSkatt : (arligOverskudd - arligOverskudd * skattesats);
                    kum += cfVis;
                    const pos = kum >= 0;
                    return (
                      <tr key={r.ar} className={`hover:bg-slate-50 ${r.ar % 5 === 0 ? "bg-slate-50/50" : ""}`}>
                        <td className="px-3 py-1.5 font-medium text-slate-700">År {r.ar}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-emerald-700">{nok(r.inntekt)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-500">−{nok(r.opex)}</td>
                        {harLaan && <>
                          <td className="px-3 py-1.5 text-right font-mono text-amber-700">
                            {r.renter > 0 ? `−${nok(r.renter)}` : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-slate-500">
                            {r.avdrag > 0 ? `−${nok(r.avdrag)}` : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-slate-600">
                            {r.ytelse > 0 ? `−${nok(r.ytelse)}` : "—"}
                          </td>
                        </>}
                        <td className={`px-3 py-1.5 text-right font-mono font-semibold ${r.cf >= 0 ? "text-[#0F2A5A]" : "text-red-600"}`}>
                          {nok(r.cf)}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-mono font-semibold ${r.cfEtterSkatt >= 0 ? "text-[#0F2A5A]" : "text-red-600"}`}>
                          {nok(r.cfEtterSkatt)}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-mono text-xs ${pos ? "text-emerald-600" : "text-red-400"}`}>
                          {pos ? "+" : ""}{nok(kum)}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-xs">
                <tr>
                  <td className="px-3 py-2" colSpan={2}>Totalt ({conf.levetid} år)</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">−{nok(arligOpex * conf.levetid)}</td>
                  {harLaan && <>
                    <td className="px-3 py-2 text-right font-mono text-amber-700">−{nok(arForArTabell.reduce((s,r)=>s+r.renter,0))}</td>
                    <td className="px-3 py-2 text-right font-mono">−{nok(arForArTabell.reduce((s,r)=>s+r.avdrag,0))}</td>
                    <td className="px-3 py-2 text-right font-mono">−{nok(arForArTabell.reduce((s,r)=>s+r.ytelse,0))}</td>
                  </>}
                  <td className="px-3 py-2 text-right font-mono text-[#0F2A5A]">{nok(arForArTabell.reduce((s,r)=>s+r.cf,0))}</td>
                  <td className="px-3 py-2 text-right font-mono text-[#0F2A5A]">{nok(arForArTabell.reduce((s,r)=>s+r.cfEtterSkatt,0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <BatteripakkerSeksjon projectId={params.id} />

    </div>
  );
}
