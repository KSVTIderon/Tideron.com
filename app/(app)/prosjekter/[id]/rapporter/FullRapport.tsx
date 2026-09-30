"use client";
import { useState } from "react";
import { InvestorView } from "../investor/InvestorView";
import { TekniskRapportView } from "../rapport/TekniskRapportView";
import { fmtKw, fmtKwh } from "@/lib/units";

type EnergiAnalyse = {
  kommune:       { navn: string; nummer: string; fylke: string };
  kommunerSokt:  number;
  nettselskap:   { navn: string; nett: string; eier: string };
  bedrifter:     { navn: string; ansatte: number; kommunenavn: string; naeringBeskrivelse: string }[];
  storeBedrifter:{ navn: string; ansatte: number; kommunenavn: string }[];
  datasentre:    { navn: string; kommunenavn: string }[];
  energi:        { installertKw: number; arligKwh: number; kapasitetsfaktor: number; kommuneForbrukKwhAnslag: number; kommuneForbrukKildeSSB: boolean; dekningsprosent: number };
  sammendrag:    string;
  tidspunkt:     string;
};

export default function FullRapport({ prosjektId }: { prosjektId: string }) {
  const [energiAnalyse, setEnergiAnalyse] = useState<EnergiAnalyse | null>(null);
  const [lasterEnergi, setLasterEnergi]   = useState(false);
  const [energiFeil, setEnergiFeil]       = useState("");
  const [visSeksjon, setVisSeksjon]       = useState<"investor" | "teknisk" | "energi">("investor");

  const kjorEnergiAnalyse = async () => {
    setLasterEnergi(true);
    setEnergiFeil("");
    try {
      const res = await fetch("/planner/api/lokalt-marked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: prosjektId }),
      });
      if (!res.ok) throw new Error(`Feil ${res.status}`);
      setEnergiAnalyse(await res.json());
    } catch (e: any) {
      setEnergiFeil(e.message ?? "Ukjent feil");
    } finally {
      setLasterEnergi(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Seksjonsvekselknapper */}
      <div className="flex gap-2 border-b border-slate-200 pb-4">
        {[
          { id: "investor" as const, label: "📈 Investorpitch" },
          { id: "teknisk"  as const, label: "⚙️ Teknisk" },
          { id: "energi"   as const, label: "🏭 Lokalt energibehov" },
        ].map(s => (
          <button
            key={s.id}
            onClick={() => setVisSeksjon(s.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              visSeksjon === s.id
                ? "bg-[#0F2A5A] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Seksjon: Investorpitch */}
      {visSeksjon === "investor" && (
        <InvestorView prosjektId={prosjektId} />
      )}

      {/* Seksjon: Teknisk rapport */}
      {visSeksjon === "teknisk" && (
        <TekniskRapportView prosjektId={prosjektId} />
      )}

      {/* Seksjon: Lokalt energibehov */}
      {visSeksjon === "energi" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Lokalt energibehov</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                Analyse av bedrifter, strømnett og energibalanse innen 50 km
              </p>
            </div>
            <button
              onClick={kjorEnergiAnalyse}
              disabled={lasterEnergi}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: lasterEnergi ? "#64748b" : "#0F2A5A" }}
            >
              {lasterEnergi ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
                  </svg>
                  Analyserer...
                </>
              ) : energiAnalyse ? "🔄 Oppdater" : "🔍 Kjør analyse"}
            </button>
          </div>

          {energiFeil && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{energiFeil}</div>
          )}

          {!energiAnalyse && !lasterEnergi && (
            <div className="card p-10 text-center">
              <div className="text-4xl mb-3">📍</div>
              <p className="text-slate-700 font-medium mb-1">Ingen analyse kjørt</p>
              <p className="text-slate-400 text-sm">Klikk «Kjør analyse» for å hente inn data om lokalt energibehov</p>
            </div>
          )}

          {lasterEnergi && (
            <div className="card p-10 text-center">
              <div className="text-3xl mb-3 animate-bounce">🔍</div>
              <p className="text-slate-700 font-medium">Henter lokale data...</p>
              <p className="text-slate-400 text-sm mt-1">Kartverket · Brreg (50 km radius) · NVE · AI-analyse</p>
            </div>
          )}

          {energiAnalyse && (
            <>
              {/* AI-sammendrag */}
              <div className="card p-6 border-l-4 border-[#0F2A5A]">
                <div className="flex items-center gap-2 mb-3">
                  <span>🤖</span>
                  <h4 className="font-semibold text-slate-900">AI-sammendrag</h4>
                  <span className="text-xs text-slate-400 ml-auto">
                    {new Date(energiAnalyse.tidspunkt).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{energiAnalyse.sammendrag}</p>
              </div>

              {/* Energibalanse */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  {
                    label: "Estimert produksjon",
                    val: energiAnalyse.energi.installertKw > 0 ? fmtKwh(energiAnalyse.energi.arligKwh) + "/år" : "—",
                    sub: energiAnalyse.energi.installertKw > 0 ? `${fmtKw(energiAnalyse.energi.installertKw)} · CF ${(energiAnalyse.energi.kapasitetsfaktor * 100).toFixed(0)} %` : "Ingen rotorer",
                  },
                  {
                    label: "Kommuneforbruk",
                    val: fmtKwh(energiAnalyse.energi.kommuneForbrukKwhAnslag) + "/år",
                    sub: energiAnalyse.energi.kommuneForbrukKildeSSB
                      ? "SSB tabell 12824 · faktisk forbruk"
                      : "Anslag · 22 000 kWh/innb",
                  },
                  {
                    label: "Prosjektets dekningsgrad",
                    val: energiAnalyse.energi.dekningsprosent > 0 ? `${energiAnalyse.energi.dekningsprosent.toFixed(2)} %` : "—",
                    sub: energiAnalyse.energi.dekningsprosent >= 1 ? "Betydelig lokalt bidrag" : "Supplement til nettet",
                  },
                ].map(k => (
                  <div key={k.label} className="card p-5">
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
                    <p className="text-xl font-bold text-slate-900">{k.val}</p>
                    <p className="text-xs text-slate-400 mt-1">{k.sub}</p>
                  </div>
                ))}
              </div>

              {/* Netteier + store bedrifter */}
              <div className="grid grid-cols-2 gap-4">
                <div className="card p-5">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Netteier</p>
                  <p className="font-semibold text-slate-900">{energiAnalyse.nettselskap.navn}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{energiAnalyse.nettselskap.nett}</p>
                </div>
                <div className="card p-5">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">
                    Store bedrifter (50+ ans) innen 50 km
                  </p>
                  <p className="font-semibold text-slate-900 text-xl">{energiAnalyse.storeBedrifter.length}</p>
                  {energiAnalyse.storeBedrifter.slice(0, 3).map((b, i) => (
                    <p key={i} className="text-xs text-slate-500 mt-0.5">{b.navn} · {b.kommunenavn}</p>
                  ))}
                </div>
              </div>

              {energiAnalyse.datasentre.length > 0 && (
                <div className="card p-5 border border-blue-100 bg-blue-50">
                  <p className="text-xs text-blue-600 uppercase tracking-wider font-medium mb-2">
                    💡 Potensielle PPA-kjøpere — Datasenter/IT
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {energiAnalyse.datasentre.map((d, i) => (
                      <span key={i} className="text-xs bg-white border border-blue-200 text-blue-700 rounded-full px-3 py-1">
                        {d.navn} · {d.kommunenavn}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
