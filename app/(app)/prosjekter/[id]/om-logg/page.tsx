"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type LoggType = "inspeksjon" | "reparasjon" | "service" | "hendelse" | "produksjon";

const TYPE_STYLES: Record<LoggType, string> = {
  inspeksjon:  "bg-blue-50 text-blue-700",
  reparasjon:  "bg-red-50 text-red-700",
  service:     "bg-amber-50 text-amber-700",
  hendelse:    "bg-orange-50 text-orange-700",
  produksjon:  "bg-green-50 text-green-700",
};

const TYPE_IKONER: Record<LoggType, string> = {
  inspeksjon: "🔍", reparasjon: "🔧", service: "⚙️", hendelse: "⚡", produksjon: "📊",
};

export default function OmLoggPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [logg, setLogg] = useState<any[]>([]);
  const [vis, setVis] = useState(false);
  const [lagrer, setLagrer] = useState(false);
  const [form, setForm] = useState({
    dato: new Date().toISOString().split("T")[0],
    type: "inspeksjon" as LoggType,
    tittel: "",
    beskrivelse: "",
    kwh_produsert: "",
    kostnad_nok: "",
  });

  const hent = useCallback(async () => {
    const { data } = await supabase
      .from("om_logs")
      .select("*, profiles(navn)")
      .eq("project_id", params.id)
      .order("dato", { ascending: false });
    setLogg(data ?? []);
  }, [params.id]);

  useEffect(() => { hent(); }, [hent]);

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    setLagrer(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("om_logs").insert({
      project_id: params.id,
      created_by: user?.id ?? null,
      dato: form.dato,
      type: form.type,
      tittel: form.tittel,
      beskrivelse: form.beskrivelse || null,
      kwh_produsert: form.kwh_produsert ? +form.kwh_produsert : null,
      kostnad_nok: form.kostnad_nok ? +form.kostnad_nok : null,
    });
    setLagrer(false);
    setVis(false);
    setForm({ dato: new Date().toISOString().split("T")[0], type: "inspeksjon", tittel: "", beskrivelse: "", kwh_produsert: "", kostnad_nok: "" });
    hent();
  };

  // Statistikk
  const totalKwh = logg.filter(l => l.kwh_produsert).reduce((s, l) => s + (l.kwh_produsert ?? 0), 0);
  const totalKostnad = logg.filter(l => l.kostnad_nok).reduce((s, l) => s + +(l.kostnad_nok ?? 0), 0);
  const nok = (v: number) => Math.round(v).toLocaleString("nb-NO");

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-slate-900">O&M-logg</h2>
        <button onClick={() => setVis(true)} className="btn-primary">+ Legg til</button>
      </div>

      {/* Oppsummering */}
      {logg.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Loggoppføringer</p>
            <p className="text-2xl font-semibold">{logg.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Registrert produksjon</p>
            <p className="text-2xl font-semibold">{totalKwh > 0 ? `${nok(totalKwh)} kWh` : "—"}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Registrerte kostnader</p>
            <p className="text-2xl font-semibold">{totalKostnad > 0 ? `${nok(totalKostnad)} kr` : "—"}</p>
          </div>
        </div>
      )}

      {/* Logg */}
      <div className="space-y-3">
        {logg.length > 0 ? logg.map(l => (
          <div key={l.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <span className="text-xl mt-0.5">{TYPE_IKONER[l.type as LoggType]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge text-xs ${TYPE_STYLES[l.type as LoggType]}`}>{l.type}</span>
                    <span className="text-xs text-slate-400">{l.dato} · {l.profiles?.navn ?? "Ukjent"}</span>
                  </div>
                  <p className="font-medium text-slate-900 mt-1">{l.tittel}</p>
                  {l.beskrivelse && <p className="text-sm text-slate-500 mt-0.5">{l.beskrivelse}</p>}
                  {(l.kwh_produsert || l.kostnad_nok) && (
                    <div className="flex gap-4 mt-2 text-xs text-slate-400">
                      {l.kwh_produsert && <span>⚡ {nok(l.kwh_produsert)} kWh</span>}
                      {l.kostnad_nok && <span>💰 {nok(+l.kostnad_nok)} kr</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )) : (
          <div className="card p-12 text-center text-slate-400">
            <p className="text-3xl mb-3">📋</p>
            <p className="font-medium text-slate-600">Ingen O&M-oppføringer ennå</p>
            <p className="text-sm mt-1">Loggfør inspeksjoner, service og produksjonsdata</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {vis && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <form onSubmit={lagre} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-slate-900">Ny O&M-oppføring</h3>
              <button type="button" onClick={() => setVis(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Dato</label>
                <input type="date" required value={form.dato}
                  onChange={e => setForm(f => ({ ...f, dato: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as LoggType }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20">
                  {(["inspeksjon","reparasjon","service","hendelse","produksjon"] as LoggType[]).map(t =>
                    <option key={t} value={t}>{TYPE_IKONER[t]} {t}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Tittel *</label>
              <input required value={form.tittel} onChange={e => setForm(f => ({ ...f, tittel: e.target.value }))}
                placeholder="f.eks. Kvartalsinspeksjon rotor 1-4"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20" />
            </div>

            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Beskrivelse</label>
              <textarea rows={3} value={form.beskrivelse} onChange={e => setForm(f => ({ ...f, beskrivelse: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Produksjon (kWh)</label>
                <input type="number" step="0.1" value={form.kwh_produsert}
                  onChange={e => setForm(f => ({ ...f, kwh_produsert: e.target.value }))}
                  placeholder="Valgfri"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Kostnad (kr)</label>
                <input type="number" step="100" value={form.kostnad_nok}
                  onChange={e => setForm(f => ({ ...f, kostnad_nok: e.target.value }))}
                  placeholder="Valgfri"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={lagrer} className="btn-primary flex-1">
                {lagrer ? "Lagrer…" : "Lagre"}
              </button>
              <button type="button" onClick={() => setVis(false)} className="btn-secondary">Avbryt</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
