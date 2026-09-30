"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const TYPE_OPTS = ["konsesjon","tillatelse","subsidie","melding","annet"];
const STATUS_OPTS = ["under_utarbeidelse","innsendt","godkjent","avvist","utlopt"];

const STATUS_COLOR: Record<string, string> = {
  under_utarbeidelse: "bg-slate-100 text-slate-600",
  innsendt:           "bg-blue-50 text-blue-700",
  godkjent:           "bg-green-50 text-green-700",
  avvist:             "bg-red-50 text-red-600",
  utlopt:             "bg-amber-50 text-amber-700",
};

const STATUS_LABEL: Record<string, string> = {
  under_utarbeidelse: "Under utarbeidelse",
  innsendt:           "Innsendt",
  godkjent:           "Godkjent",
  avvist:             "Avvist",
  utlopt:             "Utlopt",
};

const BLANK = {
  tittel: "", type: "konsesjon", status: "under_utarbeidelse",
  myndighet: "", frist: "", innsendt_dato: "", ansvarlig: "", notater: "",
};

export default function SoknaderPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [soknader, setSoknader] = useState<any[]>([]);
  const [vis, setVis] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [redigerer, setRedigerer] = useState<string | null>(null);

  const hent = useCallback(async () => {
    const { data } = await supabase
      .from("project_applications")
      .select("*")
      .eq("project_id", params.id)
      .order("created_at", { ascending: false });
    setSoknader(data ?? []);
  }, [params.id]);

  useEffect(() => { hent(); }, [hent]);

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    const rad = {
      project_id: params.id,
      tittel: form.tittel,
      type: form.type,
      status: form.status,
      myndighet: form.myndighet || null,
      frist: form.frist || null,
      innsendt_dato: form.innsendt_dato || null,
      ansvarlig: form.ansvarlig || null,
      notater: form.notater || null,
    };
    if (redigerer) {
      await supabase.from("project_applications").update(rad).eq("id", redigerer);
    } else {
      await supabase.from("project_applications").insert(rad);
    }
    setForm(BLANK); setVis(false); setRedigerer(null); hent();
  };

  const settStatus = async (id: string, status: string) => {
    await supabase.from("project_applications").update({ status }).eq("id", id);
    hent();
  };

  const slett = async (id: string) => {
    await supabase.from("project_applications").delete().eq("id", id);
    hent();
  };

  const startRediger = (s: any) => {
    setForm({
      tittel: s.tittel, type: s.type, status: s.status,
      myndighet: s.myndighet ?? "", frist: s.frist ?? "",
      innsendt_dato: s.innsendt_dato ?? "", ansvarlig: s.ansvarlig ?? "",
      notater: s.notater ?? "",
    });
    setRedigerer(s.id);
    setVis(true);
  };

  const iDag = new Date().toISOString().split("T")[0];
  const godkjente = soknader.filter(s => s.status === "godkjent").length;
  const innsendte = soknader.filter(s => s.status === "innsendt").length;
  const ventende = soknader.filter(s => s.status === "under_utarbeidelse").length;

  return (
    <div className="space-y-5">
      {soknader.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Totalt", value: soknader.length },
            { label: "Godkjent", value: godkjente },
            { label: "Innsendt", value: innsendte },
            { label: "Under utarbeidelse", value: ventende },
          ].map(k => (
            <div key={k.label} className="card p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
              <p className="text-2xl font-semibold text-slate-900">{k.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-semibold text-slate-900">Soknader og tillatelser</h2>
          <button onClick={() => { setForm(BLANK); setRedigerer(null); setVis(v => !v); }}
            className="btn-primary text-sm">
            {vis && !redigerer ? "Avbryt" : "+ Ny soknad"}
          </button>
        </div>

        {vis && (
          <form onSubmit={lagre} className="p-5 bg-slate-50 border-b border-slate-100 grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Tittel *</label>
              <input required value={form.tittel} onChange={e => setForm(f => ({ ...f, tittel: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                placeholder="f.eks. Konsesjonssoknad NVE - tidevannsanlegg" />
            </div>
            {[
              { label: "Type", field: "type", opts: TYPE_OPTS },
              { label: "Status", field: "status", opts: STATUS_OPTS },
            ].map(f => (
              <div key={f.field}>
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{f.label}</label>
                <select value={(form as any)[f.field]}
                  onChange={e => setForm(prev => ({ ...prev, [f.field]: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20">
                  {f.opts.map(o => <option key={o} value={o}>{STATUS_LABEL[o] ?? o}</option>)}
                </select>
              </div>
            ))}
            {[
              { label: "Myndighet", field: "myndighet", ph: "NVE, Statsforvalteren..." },
              { label: "Ansvarlig", field: "ansvarlig", ph: "Navn" },
              { label: "Frist", field: "frist", ph: "", type: "date" },
              { label: "Innsendt dato", field: "innsendt_dato", ph: "", type: "date" },
            ].map(f => (
              <div key={f.field}>
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{f.label}</label>
                <input type={f.type ?? "text"} value={(form as any)[f.field]} placeholder={f.ph}
                  onChange={e => setForm(prev => ({ ...prev, [f.field]: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20" />
              </div>
            ))}
            <div className="col-span-2">
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Notater</label>
              <textarea rows={2} value={form.notater}
                onChange={e => setForm(f => ({ ...f, notater: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 resize-none" />
            </div>
            <div className="col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => { setVis(false); setRedigerer(null); }} className="btn-secondary text-sm">Avbryt</button>
              <button type="submit" className="btn-primary text-sm">{redigerer ? "Oppdater" : "Legg til"}</button>
            </div>
          </form>
        )}

        {soknader.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Tittel</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Type</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Myndighet</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Frist</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {soknader.map(s => {
                const fristPassert = s.frist && s.frist < iDag && s.status !== "godkjent" && s.status !== "avvist";
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {fristPassert && <span className="mr-1">⚠️</span>}
                      {s.tittel}
                      {s.notater && <p className="text-xs text-slate-400 mt-0.5 font-normal">{s.notater}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{s.type}</td>
                    <td className="px-4 py-3 text-slate-500">{s.myndighet ?? "—"}</td>
                    <td className={`px-4 py-3 ${fristPassert ? "text-red-600 font-medium" : "text-slate-500"}`}>
                      {s.frist ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <select value={s.status}
                        onChange={e => settStatus(s.id, e.target.value)}
                        className={`badge border-0 cursor-pointer ${STATUS_COLOR[s.status]}`}>
                        {STATUS_OPTS.map(o => <option key={o} value={o}>{STATUS_LABEL[o]}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right flex gap-2 justify-end">
                      <button onClick={() => startRediger(s)} className="text-slate-400 hover:text-[#0F2A5A] text-xs">Rediger</button>
                      <button onClick={() => slett(s.id)} className="text-slate-300 hover:text-red-400 text-xs">X</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center text-slate-400 text-sm">
            <p className="text-3xl mb-2">📋</p>
            <p>Ingen soknader registrert ennå</p>
          </div>
        )}
      </div>

      {/* Søknadsmaler / hurtigstart */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Søknader og meldinger</h2>
            <p className="text-xs text-slate-400 mt-0.5">Legg til søknad i listen, eller gå til Rapporter for å generere og sende offisielle skjemaer</p>
          </div>
          <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            NVE-meldeskjema finnes under Rapporter →
          </span>
        </div>
        <div className="divide-y divide-slate-100">
          {/* NVE konsesjonssøknad */}
          <div className="px-5 py-4 flex items-start gap-4 hover:bg-slate-50 transition-colors">
            <div className="text-2xl mt-0.5">⚡</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-medium text-slate-900">NVE — Konsesjonssøknad for kraftverk</h3>
                <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Konsesjon</span>
              </div>
              <p className="text-xs text-slate-500 mb-2">Vannressursloven § 8 / Energiloven · NVE</p>
              <button
                onClick={() => {
                  setForm({ ...BLANK, tittel: "Konsesjonssøknad kraftverk", type: "konsesjon",
                    myndighet: "NVE (Norges vassdrags- og energidirektorat)", status: "under_utarbeidelse" });
                  setRedigerer(null); setVis(true);
                }}
                className="btn-secondary text-sm">
                Legg til søknad
              </button>
            </div>
          </div>

          {/* Statsforvalteren naturmangfold */}
          <div className="px-5 py-4 flex items-start gap-4 hover:bg-slate-50 transition-colors">
            <div className="text-2xl mt-0.5">🌿</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-medium text-slate-900">Statsforvalteren — Dispensasjon naturmangfoldloven</h3>
                <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Tillatelse</span>
              </div>
              <p className="text-xs text-slate-500 mb-2">Naturmangfoldloven § 48 · Statsforvalteren i aktuelt fylke</p>
              <button
                onClick={() => {
                  setForm({ ...BLANK, tittel: "Dispensasjon naturmangfoldloven", type: "tillatelse",
                    myndighet: "Statsforvalteren", status: "under_utarbeidelse" });
                  setRedigerer(null); setVis(true);
                }}
                className="btn-secondary text-sm">
                Legg til søknad
              </button>
            </div>
          </div>

          {/* Kommunal byggetillatelse */}
          <div className="px-5 py-4 flex items-start gap-4 hover:bg-slate-50 transition-colors">
            <div className="text-2xl mt-0.5">🏗</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-medium text-slate-900">Kommune — Byggetillatelse / tiltak i sjø</h3>
                <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Tillatelse</span>
              </div>
              <p className="text-xs text-slate-500 mb-2">Plan- og bygningsloven · Kommunen (teknisk etat)</p>
              <button
                onClick={() => {
                  setForm({ ...BLANK, tittel: "Byggetillatelse / tiltak i sjø", type: "tillatelse",
                    myndighet: "Kommunen (teknisk etat)", status: "under_utarbeidelse" });
                  setRedigerer(null); setVis(true);
                }}
                className="btn-secondary text-sm">
                Legg til søknad
              </button>
            </div>
          </div>

          {/* Enova støtte */}
          <div className="px-5 py-4 flex items-start gap-4 hover:bg-slate-50 transition-colors">
            <div className="text-2xl mt-0.5">💰</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-medium text-slate-900">Enova — Støtte til fornybar energiproduksjon</h3>
                <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">Subsidie</span>
              </div>
              <p className="text-xs text-slate-500 mb-2">Enova SF · Støtteprogram for ny fornybar energi</p>
              <button
                onClick={() => {
                  setForm({ ...BLANK, tittel: "Støtte til fornybar energiproduksjon", type: "subsidie",
                    myndighet: "Enova SF", status: "under_utarbeidelse" });
                  setRedigerer(null); setVis(true);
                }}
                className="btn-secondary text-sm">
                Legg til søknad
              </button>
            </div>
          </div>

          {/* Innovasjon Norge */}
          <div className="px-5 py-4 flex items-start gap-4 hover:bg-slate-50 transition-colors">
            <div className="text-2xl mt-0.5">🚀</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-medium text-slate-900">Innovasjon Norge — Investeringstilskudd</h3>
                <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">Subsidie</span>
              </div>
              <p className="text-xs text-slate-500 mb-2">Innovasjon Norge · Tilskudd til klimavennlig teknologi</p>
              <button
                onClick={() => {
                  setForm({ ...BLANK, tittel: "Investeringstilskudd klimateknologi", type: "subsidie",
                    myndighet: "Innovasjon Norge", status: "under_utarbeidelse" });
                  setRedigerer(null); setVis(true);
                }}
                className="btn-secondary text-sm">
                Legg til søknad
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Soknadsmaler */}
      <MalerSeksjon />
    </div>
  );
}

function MalerSeksjon() {
  const supabase = createClient();
  const [maler, setMaler] = useState<any[]>([]);
  const [valgt, setValgt] = useState<any>(null);
  const [apnet, setApnet] = useState(false);

  useEffect(() => {
    supabase.from("application_templates").select("*").order("navn").then(({ data }) => setMaler(data ?? []));
  }, []);

  if (maler.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setApnet(v => !v)}
        className="w-full px-5 py-4 flex justify-between items-center text-left hover:bg-slate-50 transition-colors">
        <h2 className="font-semibold text-slate-900">Soknadsmaler ({maler.length})</h2>
        <span className="text-slate-400 text-sm">{apnet ? "Skjul" : "Vis"}</span>
      </button>
      {apnet && (
        <div className="border-t border-slate-100">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {maler.map(m => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{m.navn}</td>
                  <td className="px-4 py-3 text-slate-500">{m.type}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setValgt((v: any) => v?.id === m.id ? null : m)}
                      className="text-xs text-[#0F2A5A] hover:underline">
                      {valgt?.id === m.id ? "Lukk" : "Apne mal"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {valgt && (
            <div className="p-5 bg-slate-50 border-t border-slate-100">
              <div className="flex justify-between mb-3">
                <h3 className="font-medium text-slate-900">{valgt.navn}</h3>
                <button onClick={() => navigator.clipboard.writeText(valgt.mal_innhold)}
                  className="text-xs btn-secondary">Kopier</button>
              </div>
              <pre className="text-xs text-slate-600 bg-white rounded-lg p-4 overflow-auto whitespace-pre-wrap border border-slate-200 max-h-60">
                {valgt.mal_innhold}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
