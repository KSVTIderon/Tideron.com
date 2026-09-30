"use client";
import { useState } from "react";
import { InvestorView } from "../investor/InvestorView";
import { TekniskRapportView } from "../rapport/TekniskRapportView";
import FullRapport from "./FullRapport";
import KommunenotatView from "./KommunenotatView";
import MeldingOmKraftverkForm from "../soknader/MeldingOmKraftverkForm";

type RapportType = "investor" | "teknisk" | "full" | "kommunenotat" | "nve-melding";

export type NveType = "mikro" | "mini" | "stor";

const NVE_TYPER: {
  id: NveType;
  tittel: string;
  effekt: string;
  beskrivelse: string;
  regel: string;
  ikon: string;
  farge: string;
}[] = [
  {
    id: "mikro",
    tittel: "Mikrokraftverk",
    effekt: "< 1 MW (1 000 kW)",
    beskrivelse: "Hydrokinetisk Waterotor-anlegg uten dam eller regulering. Meldeplikt til NVE.",
    regel: "Vannressursloven § 18 — Meldeplikt",
    ikon: "⚡",
    farge: "border-green-200 hover:border-green-400",
  },
  {
    id: "mini",
    tittel: "Minikraftverk",
    effekt: "1–10 MW",
    beskrivelse: "Større hydrokinetisk anlegg. Meldeplikt med mulighet for konsesjonsplikt.",
    regel: "Vannressursloven § 18 — Meldeplikt / § 8 Konsesjonsplikt",
    ikon: "⚡⚡",
    farge: "border-blue-200 hover:border-blue-400",
  },
  {
    id: "stor",
    tittel: "Småkraftverk / større",
    effekt: "> 10 MW",
    beskrivelse: "Konsesjonspliktig anlegg. Melding er første steg — full konsesjonsbehandling følger.",
    regel: "Energiloven / Vannressursloven § 8 — Konsesjonsplikt",
    ikon: "🏭",
    farge: "border-amber-200 hover:border-amber-400",
  },
];

const TYPER: { id: RapportType; tittel: string; beskrivelse: string; ikon: string }[] = [
  {
    id: "investor",
    tittel: "Investorpitch",
    beskrivelse: "KPI-kort, lønnsomhetsanalyse, IRR/NPV og kart. Klar til å deles med investorer.",
    ikon: "📈",
  },
  {
    id: "teknisk",
    tittel: "Teknisk rapport",
    beskrivelse: "Full teknisk gjennomgang: rotorer, strøm, produksjonsberegninger og lokalt energibehov.",
    ikon: "⚙️",
  },
  {
    id: "full",
    tittel: "Fullstendig rapport",
    beskrivelse: "Kombinerer investorpitch og teknisk analyse med lokalt energibehov i ett dokument.",
    ikon: "📋",
  },
  {
    id: "kommunenotat",
    tittel: "Planavklaringsnotat",
    beskrivelse: "Notat til kommunen etter pbl. § 12-8. Auto-utfylt med prosjektdata. Sendes direkte til kommunen og logges i Odoo.",
    ikon: "🏛",
  },
  {
    id: "nve-melding",
    tittel: "NVE — Melding om mini/mikrokraftverk",
    beskrivelse: "Offisielt NVE-meldeskjema (vannressursloven § 18). Auto-utfylt fra rotor-koordinater og offentlige registre. Last ned Word-dokument eller send direkte til NVE.",
    ikon: "⚡",
  },
];

export default function RapporterPage({ params }: { params: { id: string } }) {
  const [valgt, setValgt] = useState<RapportType | null>(null);
  const [nveType, setNveType] = useState<NveType | null>(null);

  const tilbake = () => { setValgt(null); setNveType(null); };

  // ── NVE type-velger ─────────────────────────────────────────────────────────
  if (valgt === "nve-melding" && !nveType) {
    return (
      <div className="space-y-6">
        <div>
          <button onClick={tilbake}
            className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-3">
            ← Tilbake til rapporter
          </button>
          <h2 className="text-xl font-semibold text-slate-900">NVE — Velg type kraftverk</h2>
          <p className="text-slate-500 text-sm mt-1">
            Type bestemmer hvilken hjemmel og hvilke felter som er relevante i meldeskjemaet.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {NVE_TYPER.map(t => (
            <button key={t.id} onClick={() => setNveType(t.id)}
              className={`card p-5 text-left border-2 transition-all group ${t.farge}`}>
              <div className="flex items-start gap-4">
                <span className="text-2xl mt-0.5">{t.ikon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-slate-900 group-hover:text-[#0F2A5A]">
                      {t.tittel}
                    </h3>
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      {t.effekt}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mb-1">{t.beskrivelse}</p>
                  <p className="text-xs text-slate-400 italic">{t.regel}</p>
                </div>
                <span className="text-slate-300 group-hover:text-[#0F2A5A] transition-colors text-lg mt-1">→</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Andre rapporter + NVE-skjema ────────────────────────────────────────────
  if (valgt) {
    return (
      <div>
        <div className="mb-5">
          <button onClick={tilbake}
            className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1">
            ← Velg annen rapport
          </button>
        </div>

        {valgt === "investor"      && <InvestorView prosjektId={params.id} />}
        {valgt === "teknisk"       && <TekniskRapportView prosjektId={params.id} />}
        {valgt === "full"          && <FullRapport prosjektId={params.id} />}
        {valgt === "kommunenotat"  && <KommunenotatView prosjektId={params.id} />}
        {valgt === "nve-melding" && nveType && (
          <MeldingOmKraftverkForm
            prosjektId={params.id}
            nveType={nveType}
            onLukk={tilbake}
            onLagretSoknad={tilbake}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Rapporter</h2>
        <p className="text-slate-500 text-sm mt-1">Velg hvilken type rapport du vil generere</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {TYPER.map(t => (
          <button
            key={t.id}
            onClick={() => setValgt(t.id)}
            className="card p-6 text-left hover:shadow-md hover:border-[#0F2A5A]/20 transition-all group border border-slate-100"
          >
            <div className="text-3xl mb-3">{t.ikon}</div>
            <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-[#0F2A5A] transition-colors">
              {t.tittel}
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed">{t.beskrivelse}</p>
            <div className="mt-4 text-xs font-medium text-[#0F2A5A] opacity-0 group-hover:opacity-100 transition-opacity">
              Åpne →
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
