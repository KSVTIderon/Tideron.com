"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LandVelger from "@/components/LandVelger";
import ValutaVelger from "@/components/ValutaVelger";
import { finnLand } from "@/lib/land";
import dynamic from "next/dynamic";

const LokasjonsvelgerKart = dynamic(
  () => import("@/components/LokasjonsvelgerKart"),
  { ssr: false, loading: () => <div className="h-[300px] bg-slate-50 rounded-xl border border-slate-200 animate-pulse" /> }
);

const STADIER = ["Prospektering","Forhandsutredning","Godkjent","Pilot","Utbygging","Ferdig utbygd"];
const STREAM_TYPER = ["tidevann","elv","havstrøm"];
const ENERGIKILDAR = [
  { value: "grid",    label: "Nettstrøm",         kr: 1.2 },
  { value: "diesel",  label: "Dieselaggregat",   kr: 4.5 },
];
const STREAM_LABEL: Record<string, string> = {
  tidevann:  "Tidevann / Tidal",
  elv:       "Elv / River",
  "havstrøm": "Havstrøm / Ocean current",
};

export default function InnstillingerPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const router   = useRouter();
  const [prosjekt, setProsjekt] = useState<any>(null);
  const [stream, setStream]     = useState<any>(null);
  const [invites, setInvites]   = useState<any[]>([]);
  const [lagrer, setLagrer]     = useState(false);
  const [lagrerStream, setLagrerStream] = useState(false);
  const [inviteForm, setInviteForm]     = useState({ epost: "", scope: "full" });
  const [inviteSendt, setInviteSendt]   = useState(false);
  const [bekreftSlett, setBekreftSlett] = useState(false);
  const [sletter, setSletter]           = useState(false);
  const [slarrOpp, setSlarrOpp]         = useState(false);
  const [geoFeil, setGeoFeil]           = useState<string | null>(null);
  const [alleProsjekter, setAlleProsjekter] = useState<{ id: string; navn: string; parent_project_id: string | null }[]>([]);

  const hent = useCallback(async () => {
    const [{ data: p }, { data: s }, { data: i }, { data: alle }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", params.id).single(),
      supabase.from("streams").select("*").eq("project_id", params.id).maybeSingle(),
      supabase.from("project_invites").select("*").eq("project_id", params.id).order("created_at", { ascending: false }),
      supabase.from("projects").select("id,navn,parent_project_id").neq("id", params.id).order("navn"),
    ]);
    setProsjekt(p);
    setStream(s ?? { stream_type: "tidevann", peak_velocity_m_s: "", avg_velocity_m_s: "", datakilde: "" });
    setInvites(i ?? []);
    setAlleProsjekter(alle ?? []);
  }, [params.id]);

  useEffect(() => { hent(); }, [hent]);

  const lagreProsjekt = async (e: React.FormEvent) => {
    e.preventDefault();
    setLagrer(true);
    await supabase.from("projects").update({
      navn: prosjekt.navn,
      sted: prosjekt.sted,
      lat: prosjekt.lat ? +prosjekt.lat : null,
      lon: prosjekt.lon ? +prosjekt.lon : null,
      stadie: prosjekt.stadie,
      country_code: prosjekt.country_code ?? "NO",
      currency_code: prosjekt.currency_code ?? "NOK",
      parent_project_id: prosjekt.parent_project_id ?? null,
      energikilde: prosjekt.energikilde ?? "grid",
      sammenligning_kr_kwh: prosjekt.sammenligning_kr_kwh ?? 1.2,
    }).eq("id", params.id);

    // Synk til Odoo CRM (best-effort)
    fetch("/planner/api/odoo/prosjekter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supabaseId: params.id,
        navn:       prosjekt.navn,
        sted:       prosjekt.sted,
        stadie:     prosjekt.stadie,
        lat:        prosjekt.lat ? +prosjekt.lat : null,
        lon:        prosjekt.lon ? +prosjekt.lon : null,
      }),
    }).catch(() => {/* best-effort */});

    setLagrer(false);
  };

  // ── Reverse geocoding via Nominatim (OpenStreetMap) ──────────────────────
  const finnLandFraGps = async (lat: number, lon: number) => {
    setSlarrOpp(true);
    setGeoFeil(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
        { headers: { "Accept-Language": "nb", "User-Agent": "TideronApp/1.0" } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const countryCode = (data.address?.country_code ?? "").toUpperCase();
      const sted = [
        data.address?.municipality ?? data.address?.city ?? data.address?.town ?? data.address?.village ?? "",
        data.address?.county ?? data.address?.state ?? "",
      ].filter(Boolean).join(", ");

      setProsjekt((p: any) => {
        const land = finnLand(countryCode);
        return {
          ...p,
          country_code:  countryCode || p.country_code,
          currency_code: land?.currency_code ?? p.currency_code,
          // Fyll inn sted bare om det er tomt
          ...((!p.sted || p.sted === "") && sted ? { sted } : {}),
        };
      });
    } catch (e: any) {
      setGeoFeil("Kunne ikke slå opp koordinatene. Prøv igjen.");
    } finally {
      setSlarrOpp(false);
    }
  };

  const setStreamField = (k: string, v: string) => {
    const next = { ...stream, [k]: v };
    if (k === "peak_velocity_m_s") {
      const peak = parseFloat(v);
      if (next.stream_type === "tidevann") {
        next.avg_velocity_m_s = isNaN(peak) ? "" : (peak * 0.637).toFixed(3);
      }
    }
    if (k === "stream_type" && v !== "tidevann") {
      next.avg_velocity_m_s = "";
    }
    setStream(next);
  };

  const lagreStream = async (e: React.FormEvent) => {
    e.preventDefault();
    setLagrerStream(true);
    const payload = {
      project_id: params.id,
      stream_type: stream.stream_type,
      peak_velocity_m_s: stream.peak_velocity_m_s ? parseFloat(stream.peak_velocity_m_s) : null,
      avg_velocity_m_s:  stream.avg_velocity_m_s  ? parseFloat(stream.avg_velocity_m_s)  : null,
      datakilde: stream.datakilde || null,
    };
    if (stream.id) {
      await supabase.from("streams").update(payload).eq("id", stream.id);
    } else {
      const { data } = await supabase.from("streams").insert(payload).select("id").single();
      if (data) setStream((prev: any) => ({ ...prev, id: data.id }));
    }
    setLagrerStream(false);
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from("project_invites").insert({
      project_id: params.id,
      invitee_email: inviteForm.epost,
      invitee_scope: inviteForm.scope,
    });
    setInviteForm({ epost: "", scope: "full" });
    setInviteSendt(true);
    setTimeout(() => setInviteSendt(false), 3000);
    hent();
  };

  const slettProsjekt = async () => {
    setSletter(true);
    const sb = createClient();
    // Slett alle relaterte tabeller først
    await Promise.allSettled([
      sb.from("rotors").delete().eq("project_id", params.id),
      sb.from("streams").delete().eq("project_id", params.id),
      sb.from("containers").delete().eq("project_id", params.id),
      sb.from("cables").delete().eq("project_id", params.id),
      sb.from("solar_fields").delete().eq("project_id", params.id),
      sb.from("battery_packs").delete().eq("project_id", params.id),
      sb.from("project_invites").delete().eq("project_id", params.id),
      sb.from("utstyr_tilgang").delete().eq("project_id", params.id),
      sb.from("oppgaver").delete().eq("project_id", params.id),
      sb.from("dokumenter").delete().eq("project_id", params.id),
    ]);
    const { error } = await sb.from("projects").delete().eq("id", params.id);
    if (error) { alert("Feil ved sletting: " + error.message); setSletter(false); return; }
    router.push("/prosjekter");
  };

  if (!prosjekt || !stream) return <div className="text-slate-400 text-sm">Laster...</div>;

  const isTidVann = stream.stream_type === "tidevann";

  return (
    <div className="space-y-6 max-w-xl">

      {/* Prosjektinformasjon */}
      <form onSubmit={lagreProsjekt} className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Prosjektinformasjon</h2>
        {[
          { label: "Prosjektnavn", field: "navn" },
          { label: "Sted", field: "sted", placeholder: "f.eks. Akselsundet, Nordland" },
        ].map(f => (
          <div key={f.field}>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{f.label}</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={prosjekt[f.field] ?? ""} placeholder={f.placeholder ?? ""}
              onChange={e => setProsjekt({ ...prosjekt, [f.field]: e.target.value })} />
          </div>
        ))}

        {/* Kartvalgkomponent for GPS-plassering */}
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">Plassering</label>
          <LokasjonsvelgerKart
            lat={prosjekt.lat ? +prosjekt.lat : null}
            lon={prosjekt.lon ? +prosjekt.lon : null}
            onLokasjonValgt={(lat, lon) => {
              setProsjekt((p: any) => ({ ...p, lat: lat.toFixed(6), lon: lon.toFixed(6) }));
              finnLandFraGps(lat, lon);
            }}
          />
          {prosjekt.lat && prosjekt.lon && (
            <div className="mt-2 flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Lat</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 font-mono"
                  value={prosjekt.lat ?? ""}
                  onChange={e => setProsjekt((p: any) => ({ ...p, lat: e.target.value }))}
                  placeholder="68.123456"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Lon</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 font-mono"
                  value={prosjekt.lon ?? ""}
                  onChange={e => setProsjekt((p: any) => ({ ...p, lon: e.target.value }))}
                  placeholder="14.567890"
                />
              </div>
            </div>
          )}
          {/* Knapp for manuell geo-oppslag */}
          {prosjekt.lat && prosjekt.lon && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => finnLandFraGps(+prosjekt.lat, +prosjekt.lon)}
                disabled={slarrOpp}
                className="text-xs px-3 py-1.5 rounded-lg border border-[#0F2A5A]/30 text-[#0F2A5A] hover:bg-[#0F2A5A]/5 transition-colors disabled:opacity-50"
              >
                {slarrOpp ? "🔍 Slår opp…" : "🌍 Finn land fra GPS"}
              </button>
              {geoFeil && <span className="text-xs text-red-500">{geoFeil}</span>}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Land</label>
          <LandVelger
            value={prosjekt.country_code ?? "NO"}
            onChange={v => {
              const land = finnLand(v);
              setProsjekt((p: any) => ({
                ...p,
                country_code: v,
                // Auto-update currency when country changes
                currency_code: land?.currency_code ?? p.currency_code ?? "NOK",
              }));
            }}
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Valuta</label>
          <ValutaVelger
            value={prosjekt.currency_code ?? "NOK"}
            onChange={v => setProsjekt((p: any) => ({ ...p, currency_code: v }))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Stadie</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
            value={prosjekt.stadie} onChange={e => setProsjekt({ ...prosjekt, stadie: e.target.value })}>
            {STADIER.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        {/* Samleprosjekt */}
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Tilhører samleprosjekt</label>
          <select
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
            value={prosjekt.parent_project_id ?? ""}
            onChange={e => setProsjekt({ ...prosjekt, parent_project_id: e.target.value || null })}
          >
            <option value="">— Frittstående prosjekt —</option>
            {alleProsjekter.filter(p => !p.parent_project_id).map(p => (
              <option key={p.id} value={p.id}>{p.navn}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Velg et overordnet prosjekt for å samle dette som et delprosjekt.
          </p>
        </div>

        {/* Energikilde som erstattes */}
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Energikilde som erstattes</label>
          <select
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
            value={prosjekt.energikilde ?? "diesel"}
            onChange={e => {
              const valgt = ENERGIKILDAR.find(k => k.value === e.target.value);
              setProsjekt((p: any) => ({
                ...p,
                energikilde: e.target.value,
                sammenligning_kr_kwh: valgt?.kr ?? p.sammenligning_kr_kwh,
              }));
            }}
          >
            {ENERGIKILDAR.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Brukes i investorpitch og rapport for å beregne besparelser og CO₂-kutt.
          </p>
        </div>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
            Sammenligningspris (kr/kWh)
          </label>
          <input
            type="number" min={0} step={0.01}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
            value={prosjekt.sammenligning_kr_kwh ?? 1.2}
            onChange={e => setProsjekt((p: any) => ({ ...p, sammenligning_kr_kwh: parseFloat(e.target.value) || 0 }))}
          />
          <p className="text-xs text-slate-400 mt-1">
            Pris per kWh for energikilden som erstattes. Diesel i avsidesliggende områder: 4–6 kr/kWh. Nett: 0,8–1,5 kr/kWh.
          </p>
        </div>

        <button type="submit" disabled={lagrer} className="btn-primary">{lagrer ? "Lagrer..." : "Lagre"}</button>
      </form>

      {/* Strominformasjon */}
      <form onSubmit={lagreStream} className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Strominformasjon</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Stromtype</label>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={stream.stream_type} onChange={e => setStreamField("stream_type", e.target.value)}>
              {STREAM_TYPER.map(s => <option key={s} value={s}>{STREAM_LABEL[s] ?? s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
              {isTidVann ? "Topphastighet / Peak (m/s)" : "Gjennomsnittshastighet / Avg (m/s)"}
            </label>
            <input type="number" step="0.001" min="0"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={isTidVann ? (stream.peak_velocity_m_s ?? "") : (stream.avg_velocity_m_s ?? "")}
              onChange={e => setStreamField(isTidVann ? "peak_velocity_m_s" : "avg_velocity_m_s", e.target.value)}
              placeholder="0.000" />
          </div>
          {isTidVann && (
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
                {stream.stream_type === "tidevann" ? "Avg / Gjennomsnitt (auto × 0.637)" : "Avg / Gjennomsnitt (= topp)"}
              </label>
              <input readOnly
                className="w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-400"
                value={stream.avg_velocity_m_s ?? ""} placeholder="Auto" />
            </div>
          )}
          <div className={isTidVann ? "" : "col-span-2"}>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Datakilde</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={stream.datakilde ?? ""} placeholder="f.eks. NVE feltmaling 2025"
              onChange={e => setStreamField("datakilde", e.target.value)} />
          </div>
        </div>
        <button type="submit" disabled={lagrerStream} className="btn-primary">
          {lagrerStream ? "Lagrer..." : "Lagre strom"}
        </button>
      </form>

      {/* Del prosjekt */}
      <form onSubmit={sendInvite} className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Del prosjekt</h2>
        <p className="text-sm text-slate-500">Inviter en ekstern part via e-post.</p>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">E-postadresse</label>
          <input type="email" required
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
            value={inviteForm.epost} onChange={e => setInviteForm(f => ({ ...f, epost: e.target.value }))}
            placeholder="navn@eksempel.no" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Tilgangsniva</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
            value={inviteForm.scope} onChange={e => setInviteForm(f => ({ ...f, scope: e.target.value }))}>
            <option value="full">Full tilgang</option>
            <option value="ingen_finans">Uten finansielle opplysninger</option>
            <option value="kun_teknisk">Kun tekniske data</option>
          </select>
        </div>
        <button type="submit" className="btn-primary">Send invitasjon</button>
        {inviteSendt && <p className="text-sm text-green-600">Invitasjon registrert</p>}
      </form>

      {invites.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">Invitasjoner</div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {invites.map(i => (
                <tr key={i.id}>
                  <td className="px-5 py-3 text-slate-700">{i.invitee_email}</td>
                  <td className="px-5 py-3 text-slate-400">{i.invitee_scope}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`badge ${i.akseptert ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {i.akseptert ? "Akseptert" : "Venter"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Faresone — slett prosjekt */}
      <div className="card p-6 border border-red-100">
        <h2 className="font-semibold text-slate-900 mb-1">Faresone</h2>
        <p className="text-sm text-slate-500 mb-4">
          Sletting er permanent og kan ikke angres. Alt tilknyttet data (rotorer, kart, budsjett, dokumenter) fjernes.
        </p>

        {!bekreftSlett ? (
          <button
            onClick={() => setBekreftSlett(true)}
            className="text-sm text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-4 py-2 transition-colors">
            Slett prosjekt
          </button>
        ) : (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-4">
            <p className="text-sm font-semibold text-red-700 mb-1">
              Er du sikker på at du vil slette «{prosjekt.navn}»?
            </p>
            <p className="text-xs text-red-500 mb-4">
              Dette kan ikke angres.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setBekreftSlett(false)}
                className="text-sm text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg px-4 py-2 transition-colors">
                Avbryt
              </button>
              <button
                onClick={slettProsjekt}
                disabled={sletter}
                className="text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg px-4 py-2 font-semibold transition-colors">
                {sletter ? "Sletter..." : "Ja, slett prosjektet"}
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
