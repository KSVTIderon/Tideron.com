"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { fmtKw, fmtKwh } from "@/lib/units";
import { createClient } from "@/lib/supabase/client";
import { nominalKwFraAreal, beregnEffektKwFlateareal } from "@/lib/finans";

const ADMIN_EMAIL = "ksv@tideron.com";

type Tab = "rotorer" | "containere" | "solceller";

const INPUT = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white";
const LABEL = "block text-xs text-slate-400 uppercase tracking-wider mb-1";

// Fred Ferguson-regel: 1 kW = 0.8 m² ved 1.8 m/s (Cp=0.42, rho=1025)
// Rotorer tilpasses ved å oppgi ønsket bredde × høyde eller ønsket kW

// ── ROTORER ─────────────────────────────────────────────────────────────────
function tomRotor(d?: { hastighet_m_s?: string; fase?: string; installasjonsar?: string }) {
  return {
    modell: "Waterotor", serienummer: "", installert_dato: "",
    lat: "", lon: "", notater: "",
    lengde_m: "", hoyde_m: "",
    nominell_kw_manuell: "", kw_modus: "auto" as "auto" | "manuell",
    hastighet_m_s: d?.hastighet_m_s ?? "",
    fase: d?.fase ?? "1",
    installasjonsar: d?.installasjonsar ?? String(new Date().getFullYear()),
  };
}

function RotorPanel({ prosjektId }: { prosjektId: string }) {
  const sb = createClient();
  const [liste, setListe] = useState<any[]>([]);
  const [stream, setStream] = useState<any>(null);
  const [visForm, setVisForm] = useState(false);
  const [form, setForm] = useState(tomRotor());
  const [redigerer, setRedigerer] = useState<string | null>(null);
  const [lagrer, setLagrer] = useState(false);
  const hent = useCallback(async () => {
    const [{ data: rotorer }, { data: s }] = await Promise.all([
      sb.from("rotors").select("*").eq("project_id", prosjektId).order("created_at"),
      sb.from("streams").select("avg_velocity_m_s,stream_type").eq("project_id", prosjektId).maybeSingle(),
    ]);
    setListe(rotorer ?? []);
    setStream(s);
  }, [prosjektId]);
  useEffect(() => { hent(); }, [hent]);

  const avgV = stream?.avg_velocity_m_s ?? 0;
  const areal = () => {
    const l = parseFloat(form.lengde_m), h = parseFloat(form.hoyde_m);
    return (!isNaN(l) && !isNaN(h) && l > 0 && h > 0) ? l * h : null;
  };
  const kwAuto = () => { const a = areal(); return a ? nominalKwFraAreal(a) : null; };
  const kwVist = form.kw_modus === "manuell" && form.nominell_kw_manuell
    ? parseFloat(form.nominell_kw_manuell) : kwAuto();

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault(); setLagrer(true);
    const a = areal();
    let kw: number | null = null;
    if (form.kw_modus === "manuell" && form.nominell_kw_manuell) kw = parseFloat(form.nominell_kw_manuell);
    else if (kwAuto()) kw = kwAuto();
    const payload = {
      project_id: prosjektId,
      modell: form.modell,
      diameter_m: null,
      serienummer: form.serienummer || null,
      installert_dato: form.installert_dato || null,
      lat: form.lat ? +form.lat : null,
      lon: form.lon ? +form.lon : null,
      notater: form.notater || null,
      lengde_m: parseFloat(form.lengde_m) || null,
      hoyde_m: parseFloat(form.hoyde_m) || null,
      nominell_kw_1_8: kw,
      hastighet_m_s: form.hastighet_m_s ? parseFloat(form.hastighet_m_s) : null,
      fase: form.fase ? parseInt(form.fase) : 1,
      installasjonsar: form.installasjonsar ? parseInt(form.installasjonsar) : null,
    };
    if (redigerer) await sb.from("rotors").update(payload).eq("id", redigerer);
    else await sb.from("rotors").insert(payload);
    setForm(tomRotor()); setVisForm(false); setRedigerer(null); setLagrer(false); hent();
  };

  const startRed = (r: any) => {
    setForm({
      modell: r.modell ?? "Waterotor", serienummer: r.serienummer ?? "",
      installert_dato: r.installert_dato ?? "", lat: r.lat ?? "", lon: r.lon ?? "",
      notater: r.notater ?? "", lengde_m: r.lengde_m ? String(r.lengde_m) : "4.0",
      hoyde_m: r.hoyde_m ? String(r.hoyde_m) : "2.8",
      nominell_kw_manuell: "", kw_modus: "auto",
      hastighet_m_s: r.hastighet_m_s ? String(r.hastighet_m_s) : "",
      fase: r.fase ? String(r.fase) : "1",
      installasjonsar: r.installasjonsar ? String(r.installasjonsar) : String(new Date().getFullYear()),
    });
    setRedigerer(r.id); setVisForm(true);
  };

  const slett = async (id: string) => {
    if (!confirm("Slette rotoren?")) return;
    await sb.from("rotors").delete().eq("id", id); hent();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{liste.length} rotor{liste.length !== 1 ? "er" : ""}</p>
        <button onClick={() => {
          const siste = liste[liste.length - 1];
          setForm(tomRotor({
            hastighet_m_s: siste?.hastighet_m_s ? String(siste.hastighet_m_s) : avgV > 0 ? String(avgV) : "",
            fase: siste?.fase ? String(siste.fase) : "1",
            installasjonsar: siste?.installasjonsar ? String(siste.installasjonsar) : String(new Date().getFullYear()),
          }));
          setRedigerer(null); setVisForm(true);
        }} className="btn-primary">+ Legg til rotor</button>
      </div>

      {visForm && (
        <div className="card p-5">
          <h4 className="font-medium text-slate-800 mb-4">{redigerer ? "Rediger rotor" : "Ny rotor"}</h4>
          <form onSubmit={lagre} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Modell</label>
                <div className={INPUT + " text-slate-500"}>{form.modell}</div>
              </div>
              <div>
                <label className={LABEL}>Serienummer</label>
                <input className={INPUT} value={form.serienummer} onChange={e => setForm(f => ({ ...f, serienummer: e.target.value }))} placeholder="WR-2024-001" />
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Dimensjoner og effekt</p>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className={LABEL}>Lengde (m)</label>
                  <input type="number" step="0.01" className={INPUT} value={form.lengde_m} onChange={e => setForm(f => ({ ...f, lengde_m: e.target.value }))} />
                </div>
                <div>
                  <label className={LABEL}>Hoyde (m)</label>
                  <input type="number" step="0.01" className={INPUT} value={form.hoyde_m} onChange={e => setForm(f => ({ ...f, hoyde_m: e.target.value }))} />
                </div>
                <div>
                  <label className={LABEL}>Flate mot vann</label>
                  <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white font-mono text-slate-700">
                    {areal() ? `${areal()!.toFixed(2)} m²` : "—"}
                  </div>
                </div>
              </div>
              <div className="flex gap-4 mb-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input type="radio" name="kw_modus_r" checked={form.kw_modus === "auto"} onChange={() => setForm(f => ({ ...f, kw_modus: "auto" }))} />
                  Beregn automatisk
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input type="radio" name="kw_modus_r" checked={form.kw_modus === "manuell"} onChange={() => setForm(f => ({ ...f, kw_modus: "manuell" }))} />
                  Oppgi kW manuelt
                </label>
              </div>
              {form.kw_modus === "manuell" && (
                <div className="w-1/3">
                  <label className={LABEL}>Nominell kW ved 1,8 m/s</label>
                  <input type="number" step="0.1" className={INPUT} value={form.nominell_kw_manuell} onChange={e => setForm(f => ({ ...f, nominell_kw_manuell: e.target.value }))} placeholder="100" />
                </div>
              )}
              {kwVist != null && !isNaN(kwVist) && kwVist > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-3 bg-slate-100 rounded-lg px-4 py-2.5">
                    <span className="text-lg font-semibold text-slate-500">{kwVist.toFixed(1)}</span>
                    <span className="text-sm text-slate-400">kW nominell ved 1,8 m/s</span>
                  </div>
                  {(() => {
                    const formV = parseFloat(form.hastighet_m_s);
                    const vBruk = !isNaN(formV) && formV > 0 ? formV : avgV;
                    if (vBruk <= 0) return null;
                    const a = areal();
                    const kwV = a ? beregnEffektKwFlateareal(vBruk, a) : kwVist * Math.pow(vBruk / 1.8, 3);
                    return (
                      <div className="flex items-center gap-3 bg-[#0F2A5A]/5 border border-[#0F2A5A]/15 rounded-lg px-4 py-2.5">
                        <span className="text-xl font-bold text-[#0F2A5A]">{kwV.toFixed(1)}</span>
                        <span className="text-sm text-slate-500">
                          kW ved {vBruk.toFixed(2)} m/s {!isNaN(formV) && formV > 0 ? "(rotor)" : "(prosjekt)"}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>Hastighet m/s (lokal)</label>
                <input type="number" step="0.001" min="0" className={INPUT}
                  value={form.hastighet_m_s}
                  onChange={e => setForm(f => ({ ...f, hastighet_m_s: e.target.value }))}
                  placeholder={avgV > 0 ? avgV.toFixed(3) : "0.000"} />
                <p className="text-xs text-slate-400 mt-0.5">Lokal strom for denne rotoren</p>
              </div>
              <div>
                <label className={LABEL}>Fase</label>
                <input type="number" min="1" step="1" className={INPUT}
                  value={form.fase}
                  onChange={e => setForm(f => ({ ...f, fase: e.target.value }))} />
              </div>
              <div>
                <label className={LABEL}>Installasjonsar</label>
                <input type="number" min="2020" max="2060" step="1" className={INPUT}
                  value={form.installasjonsar}
                  onChange={e => setForm(f => ({ ...f, installasjonsar: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>GPS Lat</label>
                <input className={INPUT} value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="68.1234" />
              </div>
              <div>
                <label className={LABEL}>GPS Lon</label>
                <input className={INPUT} value={form.lon} onChange={e => setForm(f => ({ ...f, lon: e.target.value }))} placeholder="14.5678" />
              </div>
              <div>
                <label className={LABEL}>Installert dato</label>
                <input type="date" className={INPUT} value={form.installert_dato} onChange={e => setForm(f => ({ ...f, installert_dato: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className={LABEL}>Notater</label>
              <textarea className={INPUT} rows={2} value={form.notater} onChange={e => setForm(f => ({ ...f, notater: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={lagrer} className="btn-primary">{lagrer ? "Lagrer..." : redigerer ? "Oppdater" : "Legg til"}</button>
              <button type="button" onClick={() => { setVisForm(false); setRedigerer(null); }} className="btn-secondary">Avbryt</button>
            </div>
          </form>
        </div>
      )}

      {liste.length > 0 ? (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Fase","År","Modell","L × H","kW @ 1,8","m/s","kW faktisk","Dato",""].map((h, i) => (
                  <th key={i} className={`text-left px-4 py-3 font-medium text-xs ${h === "kW faktisk" ? "text-[#0F2A5A]" : "text-slate-500"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {liste.map((r, i) => {
                const a = r.lengde_m && r.hoyde_m ? r.lengde_m * r.hoyde_m : null;
                const kw = r.nominell_kw_1_8 ?? (a ? nominalKwFraAreal(a) : null);
                const rotorV = r.hastighet_m_s && r.hastighet_m_s > 0 ? Number(r.hastighet_m_s) : avgV;
                const kwV = a && rotorV > 0 ? beregnEffektKwFlateareal(rotorV, a)
                          : kw && rotorV > 0 ? kw * Math.pow(rotorV / 1.8, 3) : null;
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500 text-xs font-medium">{r.fase ?? 1}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{r.installasjonsar ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 text-xs"><span className="text-slate-400 mr-1">#{i+1}</span>{r.modell}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{r.lengde_m && r.hoyde_m ? `${r.lengde_m}×${r.hoyde_m}m` : "—"}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{kw ? `${fmtKw(kw)}` : "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {r.hastighet_m_s && r.hastighet_m_s > 0
                        ? <span className="font-medium text-emerald-700">{Number(r.hastighet_m_s).toFixed(2)}</span>
                        : avgV > 0 ? <span className="text-slate-300">{avgV.toFixed(2)}*</span> : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-[#0F2A5A] text-sm">
                        {kwV != null ? `${fmtKw(kwV)}` : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{r.installert_dato ?? "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => startRed(r)} className="text-xs text-slate-400 hover:text-[#0F2A5A] mr-3">Rediger</button>
                      <button onClick={() => slett(r.id)} className="text-xs text-red-400 hover:text-red-600">Slett</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : !visForm ? (
        <div className="card p-10 text-center text-slate-400">
          <p className="text-3xl mb-3">⚙️</p>
          <p className="font-medium text-slate-600">Ingen rotorer registrert</p>
        </div>
      ) : null}
    </div>
  );
}

// ── CONTAINERE ───────────────────────────────────────────────────────────────
function tomContainer() {
  return {
    type: "Landgangscontainer", modell: "", serienummer: "",
    kapasitet_kw: "", kapasitet_kwh: "",
    lengde_m: "", bredde_m: "", hoyde_m: "", vekt_kg: "",
    installert_dato: "", lat: "", lon: "", notater: "",
  };
}

const CONTAINER_TYPER = ["Landgangscontainer", "Kontrollcontainer", "Battericontainer", "Lagercontainer"];

function ContainerPanel({ prosjektId }: { prosjektId: string }) {
  const sb = createClient();
  const [liste, setListe] = useState<any[]>([]);
  const [visForm, setVisForm] = useState(false);
  const [form, setForm] = useState(tomContainer());
  const [redigerer, setRedigerer] = useState<string | null>(null);
  const [lagrer, setLagrer] = useState(false);

  const hent = useCallback(async () => {
    const { data } = await sb.from("containere").select("*").eq("project_id", prosjektId).order("created_at");
    setListe(data ?? []);
  }, [prosjektId]);
  useEffect(() => { hent(); }, [hent]);

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault(); setLagrer(true);
    const payload = {
      project_id: prosjektId,
      type: form.type, modell: form.modell || null, serienummer: form.serienummer || null,
      kapasitet_kw: form.kapasitet_kw ? +form.kapasitet_kw : null,
      kapasitet_kwh: form.kapasitet_kwh ? +form.kapasitet_kwh : null,
      lengde_m: form.lengde_m ? +form.lengde_m : null,
      bredde_m: form.bredde_m ? +form.bredde_m : null,
      hoyde_m: form.hoyde_m ? +form.hoyde_m : null,
      vekt_kg: form.vekt_kg ? +form.vekt_kg : null,
      installert_dato: form.installert_dato || null,
      lat: form.lat ? +form.lat : null, lon: form.lon ? +form.lon : null,
      notater: form.notater || null,
    };
    if (redigerer) await sb.from("containere").update(payload).eq("id", redigerer);
    else await sb.from("containere").insert(payload);
    setForm(tomContainer()); setVisForm(false); setRedigerer(null); setLagrer(false); hent();
  };

  const startRed = (r: any) => {
    setForm({
      type: r.type ?? "Landgangscontainer", modell: r.modell ?? "", serienummer: r.serienummer ?? "",
      kapasitet_kw: r.kapasitet_kw ?? "", kapasitet_kwh: r.kapasitet_kwh ?? "",
      lengde_m: r.lengde_m ?? "", bredde_m: r.bredde_m ?? "", hoyde_m: r.hoyde_m ?? "", vekt_kg: r.vekt_kg ?? "",
      installert_dato: r.installert_dato ?? "", lat: r.lat ?? "", lon: r.lon ?? "", notater: r.notater ?? "",
    });
    setRedigerer(r.id); setVisForm(true);
  };

  const slett = async (id: string) => {
    if (!confirm("Slette containeren?")) return;
    await sb.from("containere").delete().eq("id", id); hent();
  };

  const volum = (r: any) => r.lengde_m && r.bredde_m && r.hoyde_m
    ? (r.lengde_m * r.bredde_m * r.hoyde_m).toFixed(1) : null;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{liste.length} container{liste.length !== 1 ? "e" : ""}</p>
        <button onClick={() => { setForm(tomContainer()); setRedigerer(null); setVisForm(true); }} className="btn-primary">+ Legg til container</button>
      </div>

      {visForm && (
        <div className="card p-5">
          <h4 className="font-medium text-slate-800 mb-4">{redigerer ? "Rediger container" : "Ny container"}</h4>
          <form onSubmit={lagre} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Type</label>
                <select className={INPUT} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {CONTAINER_TYPER.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Modell</label>
                <input className={INPUT} value={form.modell} onChange={e => setForm(f => ({ ...f, modell: e.target.value }))} placeholder="f.eks. 20-fot standard" />
              </div>
              <div>
                <label className={LABEL}>Serienummer</label>
                <input className={INPUT} value={form.serienummer} onChange={e => setForm(f => ({ ...f, serienummer: e.target.value }))} placeholder="CONT-2024-001" />
              </div>
              <div>
                <label className={LABEL}>Installert dato</label>
                <input type="date" className={INPUT} value={form.installert_dato} onChange={e => setForm(f => ({ ...f, installert_dato: e.target.value }))} />
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Dimensjoner og kapasitet</p>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className={LABEL}>Lengde (m)</label>
                  <input type="number" step="0.01" className={INPUT} value={form.lengde_m} onChange={e => setForm(f => ({ ...f, lengde_m: e.target.value }))} placeholder="6.1" />
                </div>
                <div>
                  <label className={LABEL}>Bredde (m)</label>
                  <input type="number" step="0.01" className={INPUT} value={form.bredde_m} onChange={e => setForm(f => ({ ...f, bredde_m: e.target.value }))} placeholder="2.4" />
                </div>
                <div>
                  <label className={LABEL}>Hoyde (m)</label>
                  <input type="number" step="0.01" className={INPUT} value={form.hoyde_m} onChange={e => setForm(f => ({ ...f, hoyde_m: e.target.value }))} placeholder="2.6" />
                </div>
                <div>
                  <label className={LABEL}>Vekt (kg)</label>
                  <input type="number" className={INPUT} value={form.vekt_kg} onChange={e => setForm(f => ({ ...f, vekt_kg: e.target.value }))} placeholder="2200" />
                </div>
                <div>
                  <label className={LABEL}>Effektkapasitet (kW)</label>
                  <input type="number" step="0.1" className={INPUT} value={form.kapasitet_kw} onChange={e => setForm(f => ({ ...f, kapasitet_kw: e.target.value }))} placeholder="50" />
                </div>
                <div>
                  <label className={LABEL}>Batterikapasitet (kWh)</label>
                  <input type="number" step="0.1" className={INPUT} value={form.kapasitet_kwh} onChange={e => setForm(f => ({ ...f, kapasitet_kwh: e.target.value }))} placeholder="200" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>GPS Lat</label>
                <input className={INPUT} value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="68.1234" />
              </div>
              <div>
                <label className={LABEL}>GPS Lon</label>
                <input className={INPUT} value={form.lon} onChange={e => setForm(f => ({ ...f, lon: e.target.value }))} placeholder="14.5678" />
              </div>
            </div>
            <div>
              <label className={LABEL}>Notater</label>
              <textarea className={INPUT} rows={2} value={form.notater} onChange={e => setForm(f => ({ ...f, notater: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={lagrer} className="btn-primary">{lagrer ? "Lagrer..." : redigerer ? "Oppdater" : "Legg til"}</button>
              <button type="button" onClick={() => { setVisForm(false); setRedigerer(null); }} className="btn-secondary">Avbryt</button>
            </div>
          </form>
        </div>
      )}

      {liste.length > 0 ? (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Type","Modell","Serienummer","L × B × H","Volum","kW / kWh","GPS","Dato",""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-500 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {liste.map((r, i) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900 text-xs"><span className="text-slate-400 mr-1">#{i+1}</span>{r.type}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{r.modell ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{r.serienummer ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                    {r.lengde_m && r.bredde_m && r.hoyde_m ? `${r.lengde_m}×${r.bredde_m}×${r.hoyde_m}m` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{volum(r) ? `${volum(r)} m³` : "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {r.kapasitet_kw ? <span className="text-[#0F2A5A] font-semibold">{r.kapasitet_kw} kW</span> : ""}
                    {r.kapasitet_kw && r.kapasitet_kwh ? " / " : ""}
                    {r.kapasitet_kwh ? <span className="text-emerald-600 font-semibold">{r.kapasitet_kwh} kWh</span> : ""}
                    {!r.kapasitet_kw && !r.kapasitet_kwh ? "—" : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{r.lat && r.lon ? `${(+r.lat).toFixed(4)}, ${(+r.lon).toFixed(4)}` : "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{r.installert_dato ?? "—"}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => startRed(r)} className="text-xs text-slate-400 hover:text-[#0F2A5A] mr-3">Rediger</button>
                    <button onClick={() => slett(r.id)} className="text-xs text-red-400 hover:text-red-600">Slett</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !visForm ? (
        <div className="card p-10 text-center text-slate-400">
          <p className="text-3xl mb-3">\U0001f4e6</p>
          <p className="font-medium text-slate-600">Ingen containere registrert</p>
        </div>
      ) : null}
    </div>
  );
}

// ── SOLCELLER ────────────────────────────────────────────────────────────────
function tomSolcelle() {
  return {
    modell: "", serienummer: "", antall: "", watt_per_panel: "",
    areal_m2: "", orientering: "Sor", vinkel_grader: "30",
    installert_dato: "", lat: "", lon: "", notater: "",
  };
}

const ORIENTERING = ["Sor", "Sorost", "Sorvest", "Ost", "Vest", "Nord"];

function SolcellePanel({ prosjektId }: { prosjektId: string }) {
  const sb = createClient();
  const [liste, setListe] = useState<any[]>([]);
  const [visForm, setVisForm] = useState(false);
  const [form, setForm] = useState(tomSolcelle());
  const [redigerer, setRedigerer] = useState<string | null>(null);
  const [lagrer, setLagrer] = useState(false);

  const hent = useCallback(async () => {
    const { data } = await sb.from("solceller").select("*").eq("project_id", prosjektId).order("created_at");
    setListe(data ?? []);
  }, [prosjektId]);
  useEffect(() => { hent(); }, [hent]);

  const totalKw = () => {
    const a = parseInt(form.antall), w = parseInt(form.watt_per_panel);
    return !isNaN(a) && !isNaN(w) && a > 0 && w > 0 ? (a * w) / 1000 : null;
  };

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault(); setLagrer(true);
    const payload = {
      project_id: prosjektId,
      modell: form.modell || null, serienummer: form.serienummer || null,
      antall: form.antall ? +form.antall : null,
      watt_per_panel: form.watt_per_panel ? +form.watt_per_panel : null,
      areal_m2: form.areal_m2 ? +form.areal_m2 : null,
      orientering: form.orientering || null,
      vinkel_grader: form.vinkel_grader ? +form.vinkel_grader : null,
      installert_dato: form.installert_dato || null,
      lat: form.lat ? +form.lat : null, lon: form.lon ? +form.lon : null,
      notater: form.notater || null,
    };
    if (redigerer) await sb.from("solceller").update(payload).eq("id", redigerer);
    else await sb.from("solceller").insert(payload);
    setForm(tomSolcelle()); setVisForm(false); setRedigerer(null); setLagrer(false); hent();
  };

  const startRed = (r: any) => {
    setForm({
      modell: r.modell ?? "", serienummer: r.serienummer ?? "",
      antall: r.antall ?? "", watt_per_panel: r.watt_per_panel ?? "",
      areal_m2: r.areal_m2 ?? "", orientering: r.orientering ?? "Sor",
      vinkel_grader: r.vinkel_grader ?? "30",
      installert_dato: r.installert_dato ?? "", lat: r.lat ?? "", lon: r.lon ?? "",
      notater: r.notater ?? "",
    });
    setRedigerer(r.id); setVisForm(true);
  };

  const slett = async (id: string) => {
    if (!confirm("Slette solcelleanlegget?")) return;
    await sb.from("solceller").delete().eq("id", id); hent();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{liste.length} solcelleanlegg</p>
        <button onClick={() => { setForm(tomSolcelle()); setRedigerer(null); setVisForm(true); }} className="btn-primary">+ Legg til solceller</button>
      </div>

      {visForm && (
        <div className="card p-5">
          <h4 className="font-medium text-slate-800 mb-4">{redigerer ? "Rediger solcellepanel" : "Nytt solcellepanel"}</h4>
          <form onSubmit={lagre} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Modell</label>
                <input className={INPUT} value={form.modell} onChange={e => setForm(f => ({ ...f, modell: e.target.value }))} placeholder="f.eks. SunPower Maxeon 6" />
              </div>
              <div>
                <label className={LABEL}>Serienummer</label>
                <input className={INPUT} value={form.serienummer} onChange={e => setForm(f => ({ ...f, serienummer: e.target.value }))} placeholder="SP-2024-001" />
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Tekniske spesifikasjoner</p>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className={LABEL}>Antall paneler</label>
                  <input type="number" className={INPUT} value={form.antall} onChange={e => setForm(f => ({ ...f, antall: e.target.value }))} placeholder="10" />
                </div>
                <div>
                  <label className={LABEL}>Watt per panel (Wp)</label>
                  <input type="number" className={INPUT} value={form.watt_per_panel} onChange={e => setForm(f => ({ ...f, watt_per_panel: e.target.value }))} placeholder="400" />
                </div>
                <div>
                  <label className={LABEL}>Total kW</label>
                  <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white font-mono text-[#0F2A5A] font-semibold">
                    {totalKw() ? `${fmtKw(totalKw()!)}` : "—"}
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Areal (m²)</label>
                  <input type="number" step="0.1" className={INPUT} value={form.areal_m2} onChange={e => setForm(f => ({ ...f, areal_m2: e.target.value }))} placeholder="20" />
                </div>
                <div>
                  <label className={LABEL}>Orientering</label>
                  <select className={INPUT} value={form.orientering} onChange={e => setForm(f => ({ ...f, orientering: e.target.value }))}>
                    {ORIENTERING.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Helningsvinkel (°)</label>
                  <input type="number" step="1" min="0" max="90" className={INPUT} value={form.vinkel_grader} onChange={e => setForm(f => ({ ...f, vinkel_grader: e.target.value }))} placeholder="30" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>GPS Lat</label>
                <input className={INPUT} value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="68.1234" />
              </div>
              <div>
                <label className={LABEL}>GPS Lon</label>
                <input className={INPUT} value={form.lon} onChange={e => setForm(f => ({ ...f, lon: e.target.value }))} placeholder="14.5678" />
              </div>
              <div>
                <label className={LABEL}>Installert dato</label>
                <input type="date" className={INPUT} value={form.installert_dato} onChange={e => setForm(f => ({ ...f, installert_dato: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className={LABEL}>Notater</label>
              <textarea className={INPUT} rows={2} value={form.notater} onChange={e => setForm(f => ({ ...f, notater: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={lagrer} className="btn-primary">{lagrer ? "Lagrer..." : redigerer ? "Oppdater" : "Legg til"}</button>
              <button type="button" onClick={() => { setVisForm(false); setRedigerer(null); }} className="btn-secondary">Avbryt</button>
            </div>
          </form>
        </div>
      )}

      {liste.length > 0 ? (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Modell","Antall","Wp/panel","Total kW","Areal","Orientering","Vinkel","GPS","Dato",""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-500 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {liste.map((r, i) => {
                const tkw = r.antall && r.watt_per_panel ? (r.antall * r.watt_per_panel / 1000).toFixed(2) : null;
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900 text-xs"><span className="text-slate-400 mr-1">#{i+1}</span>{r.modell ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{r.antall ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{r.watt_per_panel ? `${r.watt_per_panel} Wp` : "—"}</td>
                    <td className="px-4 py-3 text-xs"><span className="font-semibold text-[#0F2A5A]">{tkw ? `${tkw} kW` : "—"}</span></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{r.areal_m2 ? `${r.areal_m2} m²` : "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{r.orientering ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{r.vinkel_grader ? `${r.vinkel_grader}°` : "—"}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{r.lat && r.lon ? `${(+r.lat).toFixed(4)}, ${(+r.lon).toFixed(4)}` : "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{r.installert_dato ?? "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => startRed(r)} className="text-xs text-slate-400 hover:text-[#0F2A5A] mr-3">Rediger</button>
                      <button onClick={() => slett(r.id)} className="text-xs text-red-400 hover:text-red-600">Slett</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : !visForm ? (
        <div className="card p-10 text-center text-slate-400">
          <p className="text-3xl mb-3">☀️</p>
          <p className="font-medium text-slate-600">Ingen solcellepaneler registrert</p>
        </div>
      ) : null}
    </div>
  );
}

// ── TILGANG-ADMINISTRASJON (kun admin) ───────────────────────────────────────
function TilgangPanel() {
  const sb = createClient();
  const [liste, setListe] = useState<any[]>([]);

  const hent = useCallback(async () => {
    const { data } = await sb.from("utstyr_tilgang").select("*").order("created_at");
    setListe(data ?? []);
  }, []);
  useEffect(() => { hent(); }, [hent]);

  const godkjenn = async (id: string) => {
    await sb.from("utstyr_tilgang").update({ godkjent: true }).eq("id", id); hent();
  };
  const trekk = async (id: string) => {
    await sb.from("utstyr_tilgang").update({ godkjent: false }).eq("id", id); hent();
  };
  const slett = async (id: string) => {
    await sb.from("utstyr_tilgang").delete().eq("id", id); hent();
  };

  if (liste.length === 0) return (
    <div className="text-xs text-slate-400 mt-2">Ingen tilgangsforsporsler</div>
  );

  return (
    <div className="mt-2 space-y-1">
      {liste.map(u => (
        <div key={u.id} className="flex items-center justify-between bg-white rounded-lg border border-slate-200 px-3 py-2">
          <div>
            <span className="text-sm text-slate-700">{u.email}</span>
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${u.godkjent ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
              {u.godkjent ? "Godkjent" : "Venter"}
            </span>
          </div>
          <div className="flex gap-2">
            {!u.godkjent && <button onClick={() => godkjenn(u.id)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Godkjenn</button>}
            {u.godkjent && <button onClick={() => trekk(u.id)} className="text-xs text-orange-500 hover:text-orange-700">Trekk tilbake</button>}
            <button onClick={() => slett(u.id)} className="text-xs text-red-400 hover:text-red-600">Slett</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── HOVED-SIDE ───────────────────────────────────────────────────────────────
export default function UtstyrPage({ params }: { params: { id: string } }) {
  const { data: session, status } = useSession();
  const sb = createClient();
  const [harTilgang, setHarTilgang] = useState<boolean | null>(null);
  const [forespurt, setForespurt] = useState(false);
  const [aktivTab, setAktivTab] = useState<Tab>("rotorer");
  const [visAdminPanel, setVisAdminPanel] = useState(false);

  const email = session?.user?.email ?? null;
  const erAdmin = email === ADMIN_EMAIL;

  useEffect(() => {
    // Tilgangsstyring midlertidig deaktivert
    setHarTilgang(true);
  }, []);

  const beOmTilgang = async () => {
    if (!email) return;
    await sb.from("utstyr_tilgang").upsert({ email, godkjent: false }, { onConflict: "email" });
    setForespurt(true);
  };

  if (status === "loading" || harTilgang === null) {
    return <div className="text-slate-400 text-sm">Sjekker tilgang...</div>;
  }

  if (!harTilgang) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 400 }}>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">\U0001f512</div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Begrenset tilgang</h2>
          <p className="text-slate-500 text-sm mb-6">
            Utstyr-modulen krever godkjenning. Kontakt Kai for a fa tilgang.
          </p>
          {!forespurt ? (
            <button onClick={beOmTilgang} className="btn-primary">Be om tilgang</button>
          ) : (
            <div className="text-emerald-600 text-sm font-medium">
              Foresporselen er sendt. Du vil fa tilgang nar den er godkjent.
            </div>
          )}
        </div>
      </div>
    );
  }

  const TABS_DEF: { key: Tab; label: string; icon: string }[] = [
    { key: "rotorer",   label: "Rotorer",           icon: "⚙️" },
    { key: "containere",label: "Tilkoblingspunkt",    icon: "🔌" },
    { key: "solceller", label: "Solcellepaneler",    icon: "☀️" },
  ];

  return (
    <div className="-m-8" style={{ minHeight: "calc(100vh - 120px)", background: "#f8fafc" }}>
      {/* Utstyr-header */}
      <div style={{ background: "#0F2A5A" }}>
        <div className="px-8 pt-5 pb-0 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">Utstyr</h2>
            <p className="text-white/50 text-xs mb-4">Registrer og administrer alt teknisk utstyr for dette prosjektet</p>
          </div>
          {erAdmin && (
            <button
              onClick={() => setVisAdminPanel(v => !v)}
              className="text-xs text-white/60 hover:text-white border border-white/20 rounded-lg px-3 py-1.5 mb-4"
            >
              {visAdminPanel ? "Skjul admin" : "Admin"}
            </button>
          )}
        </div>

        {/* Sub-tabs */}
        <div className="px-8 flex gap-1">
          {TABS_DEF.map(t => (
            <button key={t.key} onClick={() => setAktivTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                aktivTab === t.key
                  ? "bg-white text-[#0F2A5A]"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {erAdmin && visAdminPanel && (
        <div className="px-8 py-4 bg-amber-50 border-b border-amber-200">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Tilgangsstyring</p>
          <TilgangPanel />
        </div>
      )}

      <div className="p-8">
        {aktivTab === "rotorer"    && <RotorPanel    prosjektId={params.id} />}
        {aktivTab === "containere" && <ContainerPanel prosjektId={params.id} />}
        {aktivTab === "solceller"  && <SolcellePanel  prosjektId={params.id} />}
      </div>
    </div>
  );
}
