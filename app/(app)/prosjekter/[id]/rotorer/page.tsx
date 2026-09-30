"use client";
import { useState, useEffect, useCallback } from "react";
import { fmtKw, fmtKwh, fmtArealM2Ft2 } from "@/lib/units";
import { createClient } from "@/lib/supabase/client";
import { nominalKwFraAreal, arealFraNominalKw } from "@/lib/finans";


const INPUT_STYLE = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20";
const LABEL_STYLE = "block text-xs text-slate-400 uppercase tracking-wider mb-1";

const tomForm = () => ({
  modell: "Waterotor",
  egendefinert: false,
  serienummer: "",
  installert_dato: "",
  lat: "",
  lon: "",
  notater: "",
  lengde_m: "",
  hoyde_m: "",
  nominell_kw_manuell: "",   // brukerens manuelle override
  kw_modus: "auto" as "auto" | "manuell",  // auto = beregnet fra L*H, manuell = brukeren skriver inn
});

function beregnAreal(lengde: string, hoyde: string): number | null {
  const l = parseFloat(lengde);
  const h = parseFloat(hoyde);
  if (isNaN(l) || isNaN(h) || l <= 0 || h <= 0) return null;
  return l * h;
}

export default function RotorPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [rotorer, setRotorer] = useState<any[]>([]);
  const [laster, setLaster] = useState(true);
  const [visForm, setVisForm] = useState(false);
  const [form, setForm] = useState(tomForm());
  const [lagrer, setLagrer] = useState(false);
  const [redigerer, setRedigerer] = useState<string | null>(null);

  const hent = useCallback(async () => {
    const { data } = await supabase
      .from("rotors")
      .select("*")
      .eq("project_id", params.id)
      .order("created_at");
    setRotorer(data ?? []);
    setLaster(false);
  }, [params.id]);

  useEffect(() => { hent(); }, [hent]);

  // Live beregninger
  const areal = beregnAreal(form.lengde_m, form.hoyde_m);
  const kwAuto = areal != null ? nominalKwFraAreal(areal) : null;
  const kwVist = form.kw_modus === "manuell" && form.nominell_kw_manuell
    ? parseFloat(form.nominell_kw_manuell)
    : kwAuto;
  const arealFraManuell = form.kw_modus === "manuell" && form.nominell_kw_manuell
    ? arealFraNominalKw(parseFloat(form.nominell_kw_manuell))
    : null;

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    setLagrer(true);

    const diameter = null;
    const l = parseFloat(form.lengde_m) || null;
    const h = parseFloat(form.hoyde_m) || null;
    let nomKw: number | null = null;
    if (form.kw_modus === "manuell" && form.nominell_kw_manuell) {
      nomKw = parseFloat(form.nominell_kw_manuell) || null;
    } else if (areal != null && kwAuto != null) {
      nomKw = kwAuto;
    }

    const payload = {
      project_id: params.id,
      modell: form.modell,
      diameter_m: diameter,
      serienummer: form.serienummer || null,
      installert_dato: form.installert_dato || null,
      lat: form.lat ? +form.lat : null,
      lon: form.lon ? +form.lon : null,
      notater: form.notater || null,
      lengde_m: l,
      hoyde_m: h,
      nominell_kw_1_8: nomKw,
    };

    if (redigerer) {
      await supabase.from("rotors").update(payload).eq("id", redigerer);
    } else {
      await supabase.from("rotors").insert(payload);
    }
    setForm(tomForm());
    setVisForm(false);
    setRedigerer(null);
    setLagrer(false);
    hent();
  };

  const startRediger = (r: any) => {
    setForm({
      modell: r.modell ?? "Waterotor",
      egendefinert: false,
      serienummer: r.serienummer ?? "",
      installert_dato: r.installert_dato ?? "",
      lat: r.lat != null ? String(r.lat) : "",
      lon: r.lon != null ? String(r.lon) : "",
      notater: r.notater ?? "",
      lengde_m: r.lengde_m != null ? String(r.lengde_m) : "",
      hoyde_m:  r.hoyde_m  != null ? String(r.hoyde_m)  : "",
      nominell_kw_manuell: "",
      kw_modus: "auto",
    });
    setRedigerer(r.id);
    setVisForm(true);
  };

  const slett = async (id: string) => {
    if (!confirm("Slette denne rotoren?")) return;
    await supabase.from("rotors").delete().eq("id", id);
    hent();
  };

  if (laster) return <div className="text-slate-400 text-sm">Laster...</div>;

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-semibold text-slate-900">Rotorer</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {rotorer.length} rotor{rotorer.length !== 1 ? "er" : ""} registrert
          </p>
        </div>
        <button
          onClick={() => { setForm(tomForm()); setRedigerer(null); setVisForm(true); }}
          className="btn-primary"
        >
          + Legg til rotor
        </button>
      </div>

      {visForm && (
        <div className="card p-6">
          <h3 className="font-medium text-slate-800 mb-4">
            {redigerer ? "Rediger rotor" : "Ny rotor"}
          </h3>
          <form onSubmit={lagre} className="space-y-5">

            {/* --- Modell --- */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL_STYLE}>Modell</label>
                <div className={INPUT_STYLE + " bg-slate-50 text-slate-500"}>{form.modell}</div>
              </div>
              <div>
                <label className={LABEL_STYLE}>Serienummer</label>
                <input
                  className={INPUT_STYLE}
                  value={form.serienummer}
                  onChange={e => setForm(f => ({ ...f, serienummer: e.target.value }))}
                  placeholder="f.eks. WR-2024-001"
                />
              </div>
            </div>

            {/* --- Rotor dimensjoner og effekt --- */}
            <div className="border border-slate-100 rounded-xl p-4 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Rotordimensjoner og effekt
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={LABEL_STYLE}>Lengde (m)</label>
                  <input
                    type="number" step="0.01" min="0.1"
                    className={INPUT_STYLE}
                    value={form.lengde_m}
                    onChange={e => setForm(f => ({ ...f, lengde_m: e.target.value }))}
                    placeholder="f.eks. 10"
                  />
                </div>
                <div>
                  <label className={LABEL_STYLE}>Høyde (m)</label>
                  <input
                    type="number" step="0.01" min="0.1"
                    className={INPUT_STYLE}
                    value={form.hoyde_m}
                    onChange={e => setForm(f => ({ ...f, hoyde_m: e.target.value }))}
                    placeholder="f.eks. 8"
                  />
                </div>
                <div>
                  <label className={LABEL_STYLE}>Flate mot vann</label>
                  <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 font-mono">
                    {areal != null ? `${areal.toFixed(2)} m²` : "—"}
                  </div>
                  {arealFraManuell != null && (
                    <p className="text-xs text-slate-400 mt-1">
                      (fra kW: {arealFraManuell.toFixed(2)} m²)
                    </p>
                  )}
                </div>
              </div>

              {/* Effekt-modus */}
              <div className="mt-4">
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="radio" name="kw_modus"
                      checked={form.kw_modus === "auto"}
                      onChange={() => setForm(f => ({ ...f, kw_modus: "auto" }))}
                    />
                    Beregn automatisk fra L × H
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="radio" name="kw_modus"
                      checked={form.kw_modus === "manuell"}
                      onChange={() => setForm(f => ({ ...f, kw_modus: "manuell" }))}
                    />
                    Oppgi nominell kW direkte
                  </label>
                </div>

                {form.kw_modus === "manuell" ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={LABEL_STYLE}>Nominell kW ved 1,8 m/s</label>
                      <input
                        type="number" step="0.1" min="0"
                        className={INPUT_STYLE}
                        value={form.nominell_kw_manuell}
                        onChange={e => setForm(f => ({ ...f, nominell_kw_manuell: e.target.value }))}
                        placeholder="f.eks. 100"
                      />
                    </div>
                  </div>
                ) : null}

                {/* Live-kalkulator boks */}
                {kwVist != null && !isNaN(kwVist) && kwVist > 0 && (
                  <div className="mt-3 flex items-center gap-3 bg-[#0F2A5A]/5 border border-[#0F2A5A]/15 rounded-lg px-4 py-3">
                    <div className="text-2xl font-bold text-[#0F2A5A]">
                      {fmtKw(kwVist)}
                    </div>
                    <div className="text-xs text-slate-500 leading-relaxed">
                      Nominell effekt ved 1,8 m/s<br/>
                      <span className="text-slate-400">
                        P = 0,5 × 1025 × Cp(0,42) × A × 1,8³
                      </span>
                      {(areal != null || arealFraManuell != null) && (
                        <>
                          <br/>
                          <span className="text-slate-400">
                            A = {fmtArealM2Ft2(areal ?? arealFraManuell!)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* --- GPS og dato --- */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={LABEL_STYLE}>GPS Breddegrad (Lat)</label>
                <input
                  className={INPUT_STYLE}
                  value={form.lat}
                  onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                  placeholder="68.1234"
                />
              </div>
              <div>
                <label className={LABEL_STYLE}>GPS Lengdegrad (Lon)</label>
                <input
                  className={INPUT_STYLE}
                  value={form.lon}
                  onChange={e => setForm(f => ({ ...f, lon: e.target.value }))}
                  placeholder="14.5678"
                />
              </div>
              <div>
                <label className={LABEL_STYLE}>Installert dato</label>
                <input
                  type="date" className={INPUT_STYLE}
                  value={form.installert_dato}
                  onChange={e => setForm(f => ({ ...f, installert_dato: e.target.value }))}
                />
              </div>
            </div>

            {/* --- Notater --- */}
            <div>
              <label className={LABEL_STYLE}>Notater</label>
              <textarea
                className={INPUT_STYLE} rows={2}
                value={form.notater}
                onChange={e => setForm(f => ({ ...f, notater: e.target.value }))}
                placeholder="Valgfrie notater om denne rotoren..."
              />
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={lagrer} className="btn-primary">
                {lagrer ? "Lagrer..." : redigerer ? "Oppdater" : "Legg til"}
              </button>
              <button
                type="button"
                onClick={() => { setVisForm(false); setRedigerer(null); }}
                className="btn-secondary"
              >
                Avbryt
              </button>
            </div>
          </form>
        </div>
      )}

      {rotorer.length > 0 ? (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Modell</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Serienummer</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">L × H</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Flate</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">kW @ 1,8 m/s</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">GPS</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Installert</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rotorer.map((r, i) => {
                const areal = r.lengde_m && r.hoyde_m ? r.lengde_m * r.hoyde_m : null;
                const kw = r.nominell_kw_1_8 ?? (areal ? nominalKwFraAreal(areal) : null);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <span className="text-xs text-slate-400 mr-1">#{i + 1}</span>
                      {r.modell}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{r.serienummer ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                      {r.lengde_m && r.hoyde_m
                        ? `${r.lengde_m} × ${r.hoyde_m} m`
                        : r.diameter_m ? `⌀ ${r.diameter_m} m` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {areal != null ? `${areal.toFixed(2)} m²` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {kw != null ? (
                        <span className="font-semibold text-[#0F2A5A]">{fmtKw(kw)}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                      {r.lat && r.lon ? `${r.lat}, ${r.lon}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{r.installert_dato ?? "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => startRediger(r)} className="text-xs text-slate-400 hover:text-[#0F2A5A] mr-3">
                        Rediger
                      </button>
                      <button onClick={() => slett(r.id)} className="text-xs text-red-400 hover:text-red-600">
                        Slett
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : !visForm ? (
        <div className="card p-12 text-center text-slate-400">
          <p className="text-3xl mb-3">⚙️</p>
          <p className="font-medium text-slate-600">Ingen rotorer registrert</p>
          <p className="text-sm mt-1">Legg til rotorer for å beregne effekt og produksjon</p>
        </div>
      ) : null}
    </div>
  );
}
