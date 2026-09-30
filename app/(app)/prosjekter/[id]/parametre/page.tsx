"use client";
import { useState, useEffect } from "react";
import { CP_WATEROTOR, RHO_SJOVANN, RHO_FERSKVANN, BETZ_GRENSE } from "@/lib/finans";

// ── Per-prosjekt parametre lagret i localStorage ───────────────────────────
interface Parametre {
  cp: number;           // Effektkoeffisient (dimensjonsløs)
  rho: number;          // Vanntetthet (kg/m³)
  driftstimer_tidevann: number; // timer/år ved Cp-vektet RMS
  driftstimer_elv: number;
  capex_usd_per_w: number;   // CAPEX referansepris ($/W)
  usd_nok: number;           // USD/NOK-kurs
  diskonteringsrente: number; // %
  skattesats: number;        // %
  opex_pst_capex: number;    // OPEX som % av CAPEX
}

const DEFAULTS: Parametre = {
  cp:                       CP_WATEROTOR,   // 0.42
  rho:                      RHO_SJOVANN,    // 1025
  driftstimer_tidevann:     Math.round(6 * 2 * 0.637 * 365),  // 2 797
  driftstimer_elv:          Math.round(8760 * 0.70),           // 6 132
  capex_usd_per_w:          5,
  usd_nok:                  10.5,
  diskonteringsrente:       8,
  skattesats:               22,
  opex_pst_capex:           1,
};

function lsNøkkel(pid: string, felt: string) {
  return `${pid}:param_${felt}`;
}

function lesParametre(pid: string): Parametre {
  if (typeof window === "undefined") return DEFAULTS;
  const p: any = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS) as (keyof Parametre)[]) {
    const v = parseFloat(localStorage.getItem(lsNøkkel(pid, k)) ?? "");
    if (!isNaN(v)) p[k] = v;
  }
  return p;
}

function lagreParametre(pid: string, p: Parametre) {
  for (const k of Object.keys(p) as (keyof Parametre)[]) {
    localStorage.setItem(lsNøkkel(pid, k), String(p[k]));
  }
}

// ── Hjelpere ──────────────────────────────────────────────────────────────
function FormelBoks({ tittel, formel, forklaring }: { tittel: string; formel: string; forklaring?: string }) {
  return (
    <div className="bg-slate-900 rounded-xl p-5">
      <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">{tittel}</p>
      <p className="font-mono text-emerald-400 text-sm leading-relaxed whitespace-pre">{formel}</p>
      {forklaring && <p className="text-slate-400 text-xs mt-3 leading-relaxed">{forklaring}</p>}
    </div>
  );
}

function Rad({ label, enhet, felt, p, onChange, min, max, step, info }: {
  label: string; enhet: string; felt: keyof Parametre;
  p: Parametre; onChange: (k: keyof Parametre, v: number) => void;
  min?: number; max?: number; step?: number; info?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0 gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {info && <p className="text-xs text-slate-400 mt-0.5">{info}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number" min={min} max={max} step={step ?? 0.001}
          value={p[felt]}
          onChange={e => onChange(felt, parseFloat(e.target.value))}
          className="w-28 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
        />
        <span className="text-xs text-slate-400 w-16">{enhet}</span>
      </div>
    </div>
  );
}

// ── Hoved ────────────────────────────────────────────────────────────────
export default function ParametrePage({ params }: { params: { id: string } }) {
  const [p, setP] = useState<Parametre>(DEFAULTS);
  const [lagret, setLagret] = useState(false);

  useEffect(() => {
    setP(lesParametre(params.id));
  }, [params.id]);

  const set = (k: keyof Parametre, v: number) => {
    if (isNaN(v)) return;
    setP(prev => ({ ...prev, [k]: v }));
    setLagret(false);
  };

  const lagre = () => {
    lagreParametre(params.id, p);
    setLagret(true);
    setTimeout(() => setLagret(false), 2000);
  };

  const tilbakestill = () => {
    setP(DEFAULTS);
    lagreParametre(params.id, DEFAULTS);
  };

  // Live eksempel: 1 m² ved valgt hastighet
  const v_ex   = 1.8;
  const P_ex   = (0.5 * p.rho * p.cp * 1.0 * Math.pow(v_ex, 3)) / 1000;
  const A_1kw  = 1000 / (0.5 * p.rho * p.cp * Math.pow(v_ex, 3));
  const P_5m2  = (0.5 * p.rho * p.cp * 5.0 * Math.pow(v_ex, 3)) / 1000;

  // Waterotor 10-fots (3.05×3.05 m) eksempel
  const A_10ft = 3.05 * 3.05;
  const P_10ft = (0.5 * p.rho * p.cp * A_10ft * Math.pow(v_ex, 3)) / 1000;

  const fmt2 = (n: number) => n.toFixed(2);
  const fmt4 = (n: number) => n.toFixed(4);

  return (
    <div className="max-w-4xl space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Fysikkparametre</h2>
          <p className="text-sm text-slate-500 mt-1">
            Disse verdiene brukes i alle beregninger for dette prosjektet. Endringer lagres lokalt i nettleseren.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={tilbakestill} className="btn-secondary text-sm">Tilbakestill til standard</button>
          <button onClick={lagre} className="btn-primary text-sm">
            {lagret ? "✓ Lagret" : "Lagre parametre"}
          </button>
        </div>
      </div>

      {/* Formelblokk */}
      <div className="card p-6 space-y-4">
        <h3 className="font-semibold text-slate-900 text-base">Grunnformlene</h3>
        <div className="grid grid-cols-1 gap-4">
          <FormelBoks
            tittel="Kinetisk effekt fra strømmende vann"
            formel={`P = Cp × ½ × ρ × A × v³\n\nP   = effekt (W)\nCp  = effektkoeffisient (dimensjonsløs, maks 0.593 = Betz-grensen)\nρ   = vanntetthet (kg/m³)\nA   = frontareal (m²)\nv   = vannhastighet (m/s)`}
            forklaring="Grunnlaget er kinetisk energiflux gjennom et tverrsnitt. Cp angir hvor stor andel av den tilgjengelige energien rotoren kan ekstrahere. Betz' lov setter den teoretiske maksverdien til 16/27 ≈ 0.593."
          />
          <FormelBoks
            tittel="Nominell effekt ved 1,8 m/s (Fred Ferguson-regelen)"
            formel={`P_nom = Cp × ½ × ρ × A × (1.8)³\n     = ${fmt4(0.5 * p.rho * p.cp * Math.pow(1.8, 3))} × A   [W/m²]\n     ≈ ${fmt2(P_ex)} kW per m² frontareal\n     ≈ ${fmt2(A_1kw)} m² per kW`}
            forklaring={`Med Cp=${p.cp}, ρ=${p.rho} kg/m³ og v=1.8 m/s. Waterotor 10-fot (${A_10ft.toFixed(2)} m²) → ${fmt2(P_10ft)} kW nominell.`}
          />
          <FormelBoks
            tittel="Skalering med hastighet (kubisk forhold)"
            formel={`P(v) = P_nom × (v / 1.8)³\n\nEksempel: ved 2.5 m/s → faktor ${fmt2(Math.pow(2.5/1.8, 3))}×\n          ved 1.2 m/s → faktor ${fmt2(Math.pow(1.2/1.8, 3))}×`}
            forklaring="Effekten varierer med tredje potens av hastigheten. En dobling av hastigheten gir 8× mer effekt."
          />
          <FormelBoks
            tittel="Årsproduksjon"
            formel={`E/år = P × driftstimer\n\nTidevann:   ${p.driftstimer_tidevann} timer/år  (2 sykluser/dag × 6h × 0.637 × 365)\nElv/havstrøm: ${p.driftstimer_elv} timer/år  (8760 × 70% tilgjengelighet)`}
          />
          <FormelBoks
            tittel="CAPEX"
            formel={`CAPEX = P_nom [W] × ${p.capex_usd_per_w} $/W × ${p.usd_nok} NOK/USD\n      = ${(p.capex_usd_per_w * p.usd_nok).toFixed(0)} kr/W nominell\n      = ${((p.capex_usd_per_w * p.usd_nok) * 1000).toLocaleString("nb-NO")} kr/kW nominell`}
          />
          <FormelBoks
            tittel="LCOE (Levelized Cost of Energy)"
            formel={`LCOE = (CAPEX + Σ OPEX/(1+r)^t) / Σ E/(1+r)^t\n\nOPEX = ${p.opex_pst_capex}% av CAPEX/år\nr    = ${p.diskonteringsrente}% diskonteringsrente`}
          />
        </div>
      </div>

      {/* Redigerbare parametre */}
      <div className="card p-6">
        <h3 className="font-semibold text-slate-900 text-base mb-4">Redigerbare parametre</h3>

        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Fysikk</p>
            <div>
              <Rad label="Cp — effektkoeffisient" enhet="(0–0.593)" felt="cp" p={p} onChange={set}
                min={0.1} max={BETZ_GRENSE} step={0.01}
                info={`Fred Ferguson empirisk: 0.42. Betz-grensen: ${BETZ_GRENSE}`} />
              <Rad label="ρ — vanntetthet" enhet="kg/m³" felt="rho" p={p} onChange={set}
                min={980} max={1035} step={1}
                info="Sjøvann: 1025 · Ferskvann: 1000" />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Driftstimer per år</p>
            <div>
              <Rad label="Tidevann" enhet="timer/år" felt="driftstimer_tidevann" p={p} onChange={set}
                min={100} max={8760} step={10}
                info="Standard: 2 × 6h × 0.637 (RMS-faktor) × 365 = 2 797 t" />
              <Rad label="Elv / havstrøm" enhet="timer/år" felt="driftstimer_elv" p={p} onChange={set}
                min={100} max={8760} step={10}
                info="Standard: 8760 × 70% = 6 132 t" />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Økonomi</p>
            <div>
              <Rad label="CAPEX referansepris" enhet="$/W" felt="capex_usd_per_w" p={p} onChange={set}
                min={0.5} max={20} step={0.1}
                info="Waterotor target: $5/W nominell" />
              <Rad label="USD/NOK-kurs" enhet="kr" felt="usd_nok" p={p} onChange={set}
                min={5} max={20} step={0.1} />
              <Rad label="Diskonteringsrente (WACC)" enhet="%" felt="diskonteringsrente" p={p} onChange={set}
                min={1} max={30} step={0.5} />
              <Rad label="Skattesats" enhet="%" felt="skattesats" p={p} onChange={set}
                min={0} max={50} step={1}
                info="Norge: 22%" />
              <Rad label="OPEX (% av CAPEX/år)" enhet="%" felt="opex_pst_capex" p={p} onChange={set}
                min={0} max={10} step={0.1}
                info="Standard: 1% av CAPEX per år" />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={tilbakestill} className="btn-secondary text-sm">Tilbakestill</button>
          <button onClick={lagre} className="btn-primary text-sm">
            {lagret ? "✓ Lagret" : "Lagre parametre"}
          </button>
        </div>
      </div>

      {/* Live eksempel */}
      <div className="card p-6">
        <h3 className="font-semibold text-slate-900 text-base mb-4">Live eksempel med gjeldende parametre</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">Scenario</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Areal (m²)</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">v (m/s)</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Effekt (kW)</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">kWh/år (tidevann)</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">CAPEX (kr)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                { navn: "1 m² frontareal", A: 1, v: 1.8 },
                { navn: "Waterotor 10-fot (3.05×3.05 m)", A: 3.05*3.05, v: 1.8 },
                { navn: "Waterotor 12-fot (3.66×3.66 m)", A: 3.66*3.66, v: 1.8 },
                { navn: "5 m² @ 2.5 m/s", A: 5, v: 2.5 },
                { navn: "10 m² @ 1.5 m/s", A: 10, v: 1.5 },
              ].map(row => {
                const kw   = (0.5 * p.rho * p.cp * row.A * Math.pow(row.v, 3)) / 1000;
                const kwh  = kw * p.driftstimer_tidevann;
                const capex = kw * 1000 * p.capex_usd_per_w * p.usd_nok;
                return (
                  <tr key={row.navn} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">{row.navn}</td>
                    <td className="px-4 py-3 text-right font-mono">{row.A.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono">{row.v}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#0F2A5A]">{kw.toFixed(3)}</td>
                    <td className="px-4 py-3 text-right font-mono">{Math.round(kwh).toLocaleString("nb-NO")}</td>
                    <td className="px-4 py-3 text-right font-mono">{Math.round(capex).toLocaleString("nb-NO")} kr</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Formel: P = {p.cp} × ½ × {p.rho} × A × v³ / 1000 kW
        </p>
      </div>

      {/* V-system case study */}
      <div className="card p-6 space-y-6">
        <div>
          <h3 className="font-semibold text-slate-900 text-base">V-system Waterotor — referansekasusstudie</h3>
          <p className="text-sm text-slate-500 mt-1">
            V-systemet er en V-formet bom/ramme som plasseres i strømmen, med rotorenheter langs begge armene.
            V-formen fungerer som en strømkonsentrator og reduserer vakeinterferens mellom enhetene.
            Kilde: Waterotor intern dokumentasjon, side 8.
          </p>
        </div>

        {/* Konfigurasjon */}
        <div className="bg-slate-900 rounded-xl p-5 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">Konfigurasjon</p>
            <div className="space-y-1.5 font-mono">
              <div className="flex justify-between"><span className="text-slate-400">Enheter per V-system</span><span className="text-white">50</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Frontareal per enhet</span><span className="text-white">6.1 × 2.44 = 14.884 m²</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Totalt frontareal</span><span className="text-white">744.2 m²</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Gjennomsnittshastighet</span><span className="text-white">1.99 m/s</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Total gjennomsnittseffekt</span><span className="text-emerald-400 font-semibold">998.3 kW</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Implisitt Cp (ved 1.99 m/s)</span><span className="text-yellow-400">≈ 0.332</span></div>
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">Økonomi ($5/W referanse)</p>
            <div className="space-y-1.5 font-mono">
              <div className="flex justify-between"><span className="text-slate-400">CAPEX</span><span className="text-white">≈ $5.0M USD</span></div>
              <div className="flex justify-between"><span className="text-slate-400">CAPEX (NOK @ {p.usd_nok} kr/$)</span><span className="text-white">≈ {Math.round(998.3 * 1000 * p.capex_usd_per_w * p.usd_nok / 1e6)} Mkr</span></div>
              <div className="flex justify-between"><span className="text-slate-400">LCOE — elv/havstrøm, 30 år</span><span className="text-emerald-400">≈ 2.7 ¢/kWh</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Min PPA (prototype)</span><span className="text-yellow-400">$0.25/kWh</span></div>
            </div>
          </div>
        </div>

        {/* LCOE-tabell */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">LCOE-verifikasjon — 50-enheters V-system @ 998.3 kW gjennomsnitt</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">Driftsprofil</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Timer/år</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">kWh/år</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">LCOE 10 år</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">LCOE 12 år</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">LCOE 30 år</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">PPA $0.25 payback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { navn: "Tidevann (2×6h×0.637)", h: Math.round(6*2*0.637*365) },
                  { navn: "Elv / havstrøm (70%)", h: Math.round(8760*0.70) },
                  { navn: "Tailrace / dam (85%)", h: Math.round(8760*0.85) },
                ].map(row => {
                  const kw_doc = 998.3;
                  const capex_usd = kw_doc * 1000 * p.capex_usd_per_w;
                  const kwh_yr = kw_doc * row.h;
                  const lcoe = (yr: number) => (capex_usd / (kwh_yr * yr) * 100).toFixed(2);
                  const payback = capex_usd / (kwh_yr * 0.25);
                  const highlightRow = row.h >= 6000;
                  return (
                    <tr key={row.navn} className={highlightRow ? "bg-emerald-50 hover:bg-emerald-100" : "hover:bg-slate-50"}>
                      <td className="px-4 py-3 text-slate-700">{row.navn}</td>
                      <td className="px-4 py-3 text-right font-mono">{row.h.toLocaleString("nb-NO")}</td>
                      <td className="px-4 py-3 text-right font-mono">{Math.round(kwh_yr).toLocaleString("nb-NO")}</td>
                      <td className="px-4 py-3 text-right font-mono">{lcoe(10)} ¢</td>
                      <td className={`px-4 py-3 text-right font-mono ${highlightRow ? "font-semibold text-emerald-700" : ""}`}>{lcoe(12)} ¢</td>
                      <td className={`px-4 py-3 text-right font-mono ${highlightRow ? "font-semibold text-emerald-700" : ""}`}>{lcoe(30)} ¢</td>
                      <td className="px-4 py-3 text-right font-mono">{payback.toFixed(1)} år</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Grønn rad = scenariene der dokumentets «5¢/kWh ved 10-12 år» og «3¢/kWh ved 30 år» stemmer.
            Implisitt Cp ≈ 0.332 (reelle tap, vake-effekter, mekanisk friksjon). App-standard Cp=0.42 er Fred Fergusons empiriske laboratoriesverdi.
          </p>
        </div>

        {/* PPA-terskel */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-900 mb-1">⚠ Minimum PPA-terskel for prototyper</p>
          <p className="text-sm text-amber-800">
            Waterotor anbefaler minimum <strong>$0.25/kWh</strong> (ca. {Math.round(0.25 * p.usd_nok * 100) / 100} kr/kWh) for de første
            prototypeinstallasjoner, med mindre prosjektet er fullt forhåndsfinansiert. Under dette nivået dekker ikke
            inntektene kapitalkostnadene innenfor en rimelig prosjekthorisont på 10-15 år ved tidevannsinstallasjon.
          </p>
          <p className="text-xs text-amber-700 mt-2">
            Payback ved $0.25/kWh: tidevann ≈ 7 år · elv/havstrøm ≈ 3 år.
            Ved høyere driftstimer blir terskelen lavere — bruk tabellen over for å velge riktig PPA for prosjektet.
          </p>
        </div>
      </div>

    </div>
  );
}
