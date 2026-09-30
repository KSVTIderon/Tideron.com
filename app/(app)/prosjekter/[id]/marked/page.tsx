"use client";
import { useState, useEffect } from "react";
import { fmtKw, fmtKwh } from "@/lib/units";
import { createClient } from "@/lib/supabase/client";

type Bedrift = {
  navn: string; orgnr: string; naeringBeskrivelse: string; naeringskode: string;
  ansatte: number; adresse: string; poststed: string; kommunenavn: string
};
type Analyse = {
  kommune:        { navn: string; nummer: string; fylke: string };
  kommunerSokt:   number;
  nettselskap:    { navn: string; nett: string; eier: string };
  bedrifter:      Bedrift[];
  storeBedrifter: Bedrift[];
  datasentre:     Bedrift[];
  energi:         { installertKw: number; arligKwh: number; kapasitetsfaktor: number; kommuneForbrukKwhAnslag: number; kommuneForbrukKildeSSB: boolean; dekningsprosent: number };
  sammendrag:     string;
  tidspunkt:      string;
};

function mwhPerAnsattFor(b: Bedrift): number {
  const k = b.naeringskode ?? "";
  if (k.startsWith("63") || k.startsWith("61")) return 50000;
  if (k.startsWith("2")) return 22000;
  return 8000;
}

function ppaEstimat(b: Bedrift): { est: number; potensial: string; farge: string } {
  const est = b.ansatte > 0 ? b.ansatte * mwhPerAnsattFor(b) : 100000;
  const potensial = est > 500000 ? "Høyt" : est > 100000 ? "Middels" : "Lavt";
  const farge = potensial === "Høyt"
    ? "text-green-600 bg-green-50"
    : potensial === "Middels"
    ? "text-amber-600 bg-amber-50"
    : "text-slate-500 bg-slate-100";
  return { est, potensial, farge };
}

export default function LokalMarkedPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [prosjekt, setProsjekt] = useState<any>(null);
  const [analyse,  setAnalyse]  = useState<Analyse | null>(null);
  const [laster,   setLaster]   = useState(false);
  const [feil,     setFeil]     = useState("");

  // Odoo auto-sync state
  const [odooSyncStatus, setOdooSyncStatus] = useState<
    { status: "idle" | "syncing" | "done" | "feil"; opprettet?: number; hoppetOver?: number; feil?: number; melding?: string }
  >({ status: "idle" });

  // Manuell per-bedrift state (for knappeoverride)
  const [sentTilOdoo,    setSentTilOdoo]    = useState<Set<string>>(new Set());
  const [senderTilOdoo,  setSenderTilOdoo]  = useState<Set<string>>(new Set());
  const [odooFeil,       setOdooFeil]       = useState<Record<string, string>>({});
  const [bulkSender,     setBulkSender]     = useState(false);

  useEffect(() => {
    supabase.from("projects").select("id,navn,sted,lat,lon").eq("id", params.id).single()
      .then(({ data }) => setProsjekt(data));
  }, [params.id]);

  const autoSyncTilOdoo = async (data: Analyse, pInfo: any) => {
    setOdooSyncStatus({ status: "syncing" });
    const alle = [
      ...(data.datasentre ?? []),
      ...(data.storeBedrifter ?? []),
      ...data.bedrifter,
    ];
    // Dedupliser på orgnr
    const sett = new Set<string>();
    const unike = alle.filter(b => {
      const key = b.orgnr || b.navn;
      if (sett.has(key)) return false;
      sett.add(key);
      return true;
    });
    try {
      const res = await fetch("/planner/api/odoo/sync-bedrifter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id:  params.id,
          prosjektNavn: pInfo?.navn,
          prosjektSted: pInfo?.sted,
          prosjektLat:  pInfo?.lat ?? null,
          prosjektLon:  pInfo?.lon ?? null,
          bedrifter:    unike,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = await res.json();
      setOdooSyncStatus({ status: "done", opprettet: r.opprettet, hoppetOver: r.hoppetOver, feil: r.feil });
      // Merk alle som sendt
      setSentTilOdoo(new Set(unike.map(b => b.orgnr || b.navn)));
    } catch (e: any) {
      setOdooSyncStatus({ status: "feil", melding: e.message });
    }
  };

  const kjorAnalyse = async () => {
    setLaster(true);
    setFeil("");
    setSentTilOdoo(new Set());
    setOdooSyncStatus({ status: "idle" });
    try {
      const res = await fetch("/planner/api/lokalt-marked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: params.id }),
      });
      if (!res.ok) throw new Error(`Feil ${res.status}`);
      const data = await res.json();
      setAnalyse(data);
      // Auto-sync til Odoo etter analyse
      autoSyncTilOdoo(data, prosjekt);
    } catch (e: any) {
      setFeil(e.message ?? "Ukjent feil");
    } finally {
      setLaster(false);
    }
  };

  const sendBedriftTilOdoo = async (b: Bedrift) => {
    const key = b.orgnr || b.navn;
    setSenderTilOdoo(prev => new Set(prev).add(key));
    setOdooFeil(prev => { const n = { ...prev }; delete n[key]; return n; });

    const { est, potensial } = ppaEstimat(b);
    const desc = [
      `Org.nr.: ${b.orgnr || "—"}`,
      `Bransje: ${b.naeringBeskrivelse}${b.naeringskode ? ` (${b.naeringskode})` : ""}`,
      `Ansatte: ${b.ansatte > 0 ? b.ansatte : "ukjent"}`,
      `Adresse: ${[b.adresse, b.poststed, b.kommunenavn].filter(Boolean).join(", ")}`,
      `Est. strømforbruk/år: ${fmtKwh(est)}`,
      `PPA-potensial: ${potensial}`,
      `Tilknyttet prosjekt: ${prosjekt?.navn ?? ""}${prosjekt?.sted ? ` (${prosjekt.sted})` : ""}`,
      `Kilde: Brreg / Tideron Lokalt Marked`,
    ].join("\n");

    try {
      const res = await fetch("/planner/api/odoo/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          navn:             `Bedrift: ${b.navn}`,
          partner_name:     b.navn,
          lat:              prosjekt?.lat ?? null,
          lon:              prosjekt?.lon ?? null,
          x_data_quality:   "estimated",
          x_location_status: "analyzed",
          description:      desc,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ukjent feil" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setSentTilOdoo(prev => new Set(prev).add(key));
    } catch (e: any) {
      setOdooFeil(prev => ({ ...prev, [key]: e.message }));
    } finally {
      setSenderTilOdoo(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const sendAlleTilOdoo = async () => {
    if (!analyse) return;
    setBulkSender(true);
    const alle = [
      ...(analyse.datasentre ?? []),
      ...(analyse.storeBedrifter ?? []),
      ...analyse.bedrifter,
    ];
    // Dedupliser på orgnr
    const sett = new Set<string>();
    const unike = alle.filter(b => {
      const key = b.orgnr || b.navn;
      if (sett.has(key) || sentTilOdoo.has(key)) return false;
      sett.add(key);
      return true;
    });
    for (const b of unike) {
      await sendBedriftTilOdoo(b);
    }
    setBulkSender(false);
  };

  if (!prosjekt) return <div className="text-slate-400 text-sm">Laster...</div>;

  const harKoord = prosjekt.lat && prosjekt.lon;

  const OdooKnapp = ({ b }: { b: Bedrift }) => {
    const key = b.orgnr || b.navn;
    const er_sendt  = sentTilOdoo.has(key);
    const er_sender = senderTilOdoo.has(key);
    const feilmelding = odooFeil[key];
    if (er_sendt) return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-green-700 bg-green-50">✓ Sendt</span>
    );
    if (feilmelding) return (
      <button onClick={() => sendBedriftTilOdoo(b)} title={feilmelding}
        className="text-xs font-semibold px-2 py-0.5 rounded-full text-red-600 bg-red-50 hover:bg-red-100">
        Feil — prøv igjen
      </button>
    );
    return (
      <button onClick={() => sendBedriftTilOdoo(b)} disabled={er_sender}
        className="text-xs font-semibold px-2 py-0.5 rounded-full text-[#0F2A5A] bg-blue-50 hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap">
        {er_sender ? "Sender…" : "↑ Odoo"}
      </button>
    );
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Lokalt energibehov</h2>
          <p className="text-slate-500 text-sm mt-1">
            {prosjekt.sted ?? "Ukjent sted"}
            {harKoord ? ` · ${(+prosjekt.lat).toFixed(4)}, ${(+prosjekt.lon).toFixed(4)}` : " · Ingen koordinater registrert"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {analyse && (
            <button onClick={sendAlleTilOdoo} disabled={bulkSender}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-[#0F2A5A] text-[#0F2A5A] hover:bg-blue-50 disabled:opacity-50 transition-all">
              {bulkSender ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
                  </svg>
                  Sender til Odoo…
                </>
              ) : (
                <>↑ Send alle til Odoo</>
              )}
            </button>
          )}

          <button onClick={kjorAnalyse} disabled={laster}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-all"
            style={{ background: laster ? "#64748b" : "#0F2A5A" }}>
            {laster ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
                </svg>
                Analyserer...
              </>
            ) : (
              <><span>🔍</span> Analyser lokalt marked</>
            )}
          </button>
        </div>
      </div>

      {feil && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{feil}</div>
      )}

      {!analyse && !laster && (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">📍</div>
          <p className="text-slate-700 font-medium mb-1">Ingen analyse kjørt ennå</p>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Klikk "Analyser lokalt marked" for å hente inn data om nærliggende bedrifter,
            strømnett, energibalanse og generere et AI-sammendrag.
          </p>
        </div>
      )}

      {laster && (
        <div className="card p-12 text-center">
          <div className="text-3xl mb-3 animate-bounce">🔍</div>
          <p className="text-slate-700 font-medium mb-1">Henter lokale data...</p>
          <p className="text-slate-400 text-sm">Kartverket · Brreg (50 km radius) · NVE · AI-analyse</p>
        </div>
      )}

      {analyse && (
        <>
          {/* AI-sammendrag */}
          <div className="card p-6 border-l-4 border-[#0F2A5A]">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🤖</span>
              <h3 className="font-semibold text-slate-900">AI-sammendrag</h3>
              <span className="text-xs text-slate-400 ml-auto">
                {new Date(analyse.tidspunkt).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </div>
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {analyse.sammendrag}
            </div>
          </div>

          {/* Energibalanse */}
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                label: "Estimert produksjon",
                val: analyse.energi.installertKw > 0 ? fmtKwh(analyse.energi.arligKwh) + "/år" : "—",
                sub: analyse.energi.installertKw > 0 ? `${fmtKw(analyse.energi.installertKw)} · CF ${(analyse.energi.kapasitetsfaktor * 100).toFixed(0)} %` : "Ingen rotorer beregnet",
              },
              {
                label: "Kommuneforbruk",
                val: fmtKwh(analyse.energi.kommuneForbrukKwhAnslag) + "/år",
                sub: analyse.energi.kommuneForbrukKildeSSB
                  ? "SSB tabell 12824 · faktisk forbruk"
                  : "Anslag · 22 000 kWh/innb",
              },
              {
                label: "Prosjektets dekningsgrad",
                val: analyse.energi.dekningsprosent > 0 ? `${analyse.energi.dekningsprosent.toFixed(2)} %` : "—",
                sub: analyse.energi.dekningsprosent >= 1 ? "Betydelig lokalt bidrag" : "Supplement til nettet",
              },
            ].map(k => (
              <div key={k.label} className="card p-5">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
                <p className="text-xl font-bold text-slate-900">{k.val}</p>
                <p className="text-xs text-slate-400 mt-1">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Strømnett */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <span>⚡</span> Strømnett
            </h3>
            <div className="grid grid-cols-2 gap-6 text-sm">
              <dl className="space-y-3">
                {[
                  { k: "Kommune",  v: `${analyse.kommune.navn}${analyse.kommune.fylke ? " · " + analyse.kommune.fylke : ""}` },
                  { k: "Netteier", v: analyse.nettselskap.navn },
                  { k: "Eier",     v: analyse.nettselskap.eier },
                  { k: "Nettnivå", v: analyse.nettselskap.nett },
                ].map(({ k, v }) => (
                  <div key={k} className="flex justify-between border-b border-slate-50 pb-2">
                    <dt className="text-slate-400">{k}</dt>
                    <dd className="text-slate-800 font-medium text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Typisk tilkytningskostnad</p>
                <p className="text-2xl font-bold text-[#0F2A5A]">200k–2M kr</p>
                <p className="text-xs text-slate-500 mt-1">Avhenger av avstand til nærmeste tilkoblingspunkt og nettspenning (11–132 kV). Kontakt netteier for nettanalyse.</p>
                <a href="https://www.nve.no/reguleringsmyndigheten/nettilknytning/"
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline mt-2 block">
                  NVE — nettilknytning →
                </a>
              </div>
            </div>
          </div>

          {/* Store strømforbrukere */}
          {(analyse.datasentre?.length > 0 || analyse.storeBedrifter?.length > 0) && (
            <div className="card p-5 border-l-4 border-amber-400">
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <span>⚡</span> Store strømforbrukere innen 30 km
              </h3>
              <div className="space-y-2">
                {analyse.datasentre?.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">IT / Datasenter / Telekom</p>
                    {analyse.datasentre.map((b, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                        <div>
                          <span className="font-medium text-sm text-slate-800">{b.navn}</span>
                          <span className="text-xs text-slate-400 ml-2">{b.kommunenavn || b.poststed}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500">{b.ansatte > 0 ? `${b.ansatte} ans.` : "—"}</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-purple-700 bg-purple-50">Datasenter/IT</span>
                          <OdooKnapp b={b} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {analyse.storeBedrifter
                  ?.filter(b => !analyse.datasentre?.some(d => d.orgnr === b.orgnr))
                  .slice(0, 10)
                  .map((b, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                      <div>
                        <span className="font-medium text-sm text-slate-800">{b.navn}</span>
                        <span className="text-xs text-slate-400 ml-2">{b.kommunenavn || b.poststed}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">{b.ansatte > 0 ? `${b.ansatte} ans.` : "—"}</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-green-700 bg-green-50">Stor forbruker</span>
                        <OdooKnapp b={b} />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Nærliggende bedrifter */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <span>🏭</span> Nærliggende virksomheter
              </h3>
              <span className="text-xs text-slate-400">
                {analyse.bedrifter.length} funnet · {analyse.kommunerSokt ?? 1} kommuner innen 30 km
              </span>
            </div>
            {analyse.bedrifter.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">Ingen bedrifter funnet innen 30 km</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">Bedrift</th>
                      <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">Bransje</th>
                      <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">Kommune</th>
                      <th className="text-right px-4 py-2.5 text-slate-500 font-medium text-xs">Ansatte</th>
                      <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">Est. forbruk/år</th>
                      <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">PPA-potensial</th>
                      <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">Odoo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analyse.bedrifter.map((b, i) => {
                      const { est, potensial, farge } = ppaEstimat(b);
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{b.navn}</td>
                          <td className="px-4 py-3 text-slate-500">{b.naeringBeskrivelse}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{b.kommunenavn || b.poststed || "—"}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{b.ansatte > 0 ? b.ansatte : "—"}</td>
                          <td className="px-4 py-3 text-slate-600">{fmtKwh(est)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${farge}`}>{potensial}</span>
                          </td>
                          <td className="px-4 py-3">
                            <OdooKnapp b={b} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
              Kilde: Brønnøysundregistrene (Brreg) · Søkeradius: ~30 km · Forbruksestimat: ~8 MWh/ans (kontor), ~22 MWh/ans (industri), ~50 MWh/ans (IT/data)
            </div>
          </div>

          {/* Odoo auto-sync status */}
          {odooSyncStatus.status === "syncing" && (
            <div className="card p-4 border border-blue-200 bg-blue-50 flex items-center gap-3">
              <svg className="animate-spin w-4 h-4 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
              </svg>
              <p className="text-sm text-blue-800">Synkroniserer med Odoo CRM — sjekker duplikater…</p>
            </div>
          )}
          {odooSyncStatus.status === "done" && (
            <div className="card p-4 border border-green-200 bg-green-50">
              <p className="text-sm text-green-800 font-medium">
                ✓ Odoo-sync fullført:
                {" "}{odooSyncStatus.opprettet} nye lagt til
                {odooSyncStatus.hoppetOver ? `, ${odooSyncStatus.hoppetOver} fantes allerede` : ""}
                {odooSyncStatus.feil ? `, ${odooSyncStatus.feil} feilet` : ""}
              </p>
              <p className="text-xs text-green-700 mt-0.5">
                <a href="https://tideronas.odoo.com/odoo/crm" target="_blank" rel="noopener noreferrer"
                  className="underline">Åpne Odoo CRM →</a>
              </p>
            </div>
          )}
          {odooSyncStatus.status === "feil" && (
            <div className="card p-4 border border-red-200 bg-red-50">
              <p className="text-sm text-red-700 font-medium">Odoo-sync feilet: {odooSyncStatus.melding}</p>
            </div>
          )}

          {/* Lenker */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><span>🔗</span> Nyttige ressurser</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: "NVE — Strømpris og nett",   url: "https://www.nve.no/reguleringsmyndigheten/" },
                { label: "Elhub — Markedsdata",        url: "https://www.elhub.no/" },
                { label: "Enova — Støtteordninger",    url: "https://www.enova.no/bedrift/" },
                { label: "Brreg — Firmaregisteret",    url: `https://www.brreg.no/kommuneoppslag/?kommunenummer=${analyse.kommune.nummer}` },
                { label: "Kartverket — Stedsdata",     url: "https://norgeskart.no/" },
                { label: "SSB — Energistatistikk",     url: "https://www.ssb.no/energi-og-industri" },
              ].map(l => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 rounded-xl border border-slate-100 hover:border-[#0F2A5A]/30 hover:bg-slate-50 transition-all">
                  <span className="text-[#0F2A5A] font-medium">{l.label}</span>
                  <span className="text-slate-400 ml-auto">→</span>
                </a>
              ))}
            </div>
          </div>

        </>
      )}
    </div>
  );
}
