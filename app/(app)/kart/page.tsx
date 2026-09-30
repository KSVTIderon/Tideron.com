"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import NyStreamLeadModal from "@/components/NyStreamLeadModal";
import { fmtKw, fmtKwh } from "@/lib/units";
import { createClient } from "@/lib/supabase/client";
import { beregnEffektKw, beregnArligKwh } from "@/lib/finans";

const TideronKart = dynamic(() => import("@/components/TideronKart"), { ssr: false });

const ROTOR_DIAM = 3.05;

const STATUS_FARGE: Record<string, string> = {
  ikke_vurdert:    "bg-slate-500",
  lovende:         "bg-emerald-500",
  under_utredning: "bg-blue-400",
  avvist:          "bg-red-500",
  konvertert:      "bg-purple-500",
};

function LeadKort({ l, aktiv, onClick }: { l: any; aktiv: boolean; onClick: () => void }) {
  const avgV = l.avg_velocity_m_s ?? 0;
  const kw   = avgV > 0 ? beregnEffektKw(avgV, ROTOR_DIAM) : 0;
  const mwh  = kw > 0 ? beregnArligKwh(kw, l.stream_type ?? "tidevann") / 1000 : 0;

  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b transition-colors ${
        aktiv ? "bg-white/15 border-white/20" : "hover:bg-white/8 border-white/10"
      }`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-white font-medium text-sm truncate max-w-[160px]">{l.navn}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full text-white ${STATUS_FARGE[l.status] ?? "bg-slate-500"}`}>
          {l.status?.replace(/_/g, " ") ?? "?"}
        </span>
      </div>
      <div className="text-xs text-white/50 mb-1.5">{l.stream_type ?? "ukjent type"}</div>
      {avgV > 0 ? (
        <div className="flex gap-3 text-xs font-mono">
          <span className="text-cyan-300">{avgV.toFixed(2)} m/s</span>
          <span className="text-emerald-300">{fmtKw(kw)}</span>
          <span className="text-orange-300">{mwh.toFixed(1)} MWh/ar</span>
        </div>
      ) : (
        <span className="text-xs text-white/25">Ingen hastighetsdata</span>
      )}
    </button>
  );
}

function ProsjektKort({ p, aktiv, onClick }: { p: any; aktiv: boolean; onClick: () => void }) {
  const erAktivt = ["Pilot","Utbygging","Ferdig utbygd"].includes(p.stadie);
  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b transition-colors ${
        aktiv ? "bg-white/15 border-white/20" : "hover:bg-white/8 border-white/10"
      }`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-white font-medium text-sm truncate max-w-[170px]">{p.navn}</span>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${erAktivt ? "bg-emerald-400" : "bg-blue-400"}`} />
      </div>
      <div className="text-xs text-white/50">{p.sted ?? ""}{p.sted && p.stadie ? " · " : ""}{p.stadie}</div>
    </button>
  );
}

export default function GlobaltKartPage() {
  const router = useRouter();
  const [punkter, setPunkter]       = useState<any[]>([]);
  const [leads, setLeads]           = useState<any[]>([]);
  const [prosjekter, setProsjekter] = useState<any[]>([]);
  const [open, setOpen]             = useState(false);
  // Desktop: true=vis panel | Mobil: false=skjul som standard
  const [panelKollaps, setPanelKollaps] = useState(false);
  const [mobilSidebarÅpen, setMobilSidebarÅpen] = useState(false);
  const [aktivPunkt, setAktivPunkt] = useState<string | null>(null);
  const aktivPunktRef = useRef<string | null>(null);
  const [fane, setFane]             = useState<"leads"|"prosjekter">("leads");
  const [pendingMove, setPendingMove] = useState<{id:string;odoo_id:number;navn:string;lat:number;lon:number}|null>(null);
  const [lagrerPos, setLagrerPos]   = useState(false);
  const [odooFeil, setOdooFeil]     = useState<string|null>(null);
  const supabase = createClient();

  const hent = useCallback(async () => {
    // Leads fra Odoo CRM, prosjekter fra Supabase
    const [odooRes, { data: pr }] = await Promise.all([
      fetch("/planner/api/odoo/leads").then(r => r.json()).catch(() => []),
      supabase.from("projects").select("id,navn,lat,lon,stadie,sted").not("lat","is",null),
    ]);

    const odooLeads: any[] = Array.isArray(odooRes) ? odooRes : [];
    if (!Array.isArray(odooRes) && odooRes?.error) setOdooFeil(odooRes.error);
    else setOdooFeil(null);

    setLeads(odooLeads);
    setProsjekter(pr ?? []);

    const res: any[] = [];
    odooLeads.forEach((x: any) => res.push({
      id: x.id, navn: x.navn, lat: x.lat, lon: x.lon,
      type: "stream_lead", avg_velocity: x.avg_velocity_m_s, status: x.status,
    }));
    (pr ?? []).forEach((x: any) => {
      const erAktivt = ["Pilot","Utbygging","Ferdig utbygd"].includes(x.stadie);
      res.push({ id: x.id, navn: x.navn, lat: x.lat, lon: x.lon, type: erAktivt ? "aktivt" : "planlagt", diameter_m: 1.83 });
    });
    setPunkter(res);
  }, []); // eslint-disable-line

  useEffect(() => { hent(); }, [hent]);

  const onMarkerDragged = (id: string, lat: number, lon: number) => {
    const lead = leads.find((l: any) => l.id === id);
    if (!lead?.odoo_id) return;
    setPendingMove({ id, odoo_id: lead.odoo_id, navn: lead.navn ?? id, lat, lon });
  };

  const lagrePosisjon = async () => {
    if (!pendingMove) return;
    setLagrerPos(true);
    await fetch("/planner/api/odoo/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ odoo_id: pendingMove.odoo_id, lat: pendingMove.lat, lon: pendingMove.lon }),
    });
    setPendingMove(null);
    setLagrerPos(false);
    hent();
  };

  // Klikk på prosjekt-markør: velger og åpner popup med "Åpne"-knapp.
  const onProsjektMarkorKlikk = useCallback((id: string) => {
    aktivPunktRef.current = id;
    setAktivPunkt(id);
    setFane("prosjekter");
  }, []);


  const totKw = leads.reduce((s: number, l: any) => {
    const v = l.avg_velocity_m_s ?? 0;
    return s + (v > 0 ? beregnEffektKw(v, ROTOR_DIAM) : 0);
  }, 0);

  // ── Panel-innhold (gjenbrukes i desktop-sidebar og mobil-overlay) ───────
  const PanelInnhold = () => (
    <>
      {/* Header */}
      <div className="px-3 pt-4 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-white font-bold text-xs tracking-widest uppercase">Stromkart</div>
            <div className="text-white/40 text-xs mt-0.5">Alle lokasjoner</div>
          </div>
          <div className="flex gap-1.5 items-center">
            <button onClick={() => setOpen(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "#5FAFD7" }}>
              + Ny
            </button>
            {/* Lukk-knapp synlig bare på mobil */}
            <button
              onClick={() => setMobilSidebarÅpen(false)}
              className="md:hidden text-white/50 hover:text-white p-1.5 rounded hover:bg-white/10 text-lg leading-none"
              title="Lukk">
              ✕
            </button>
            {/* Kollaps-knapp på desktop */}
            <button
              onClick={() => setPanelKollaps(v => !v)}
              title="Skjul panel"
              className="hidden md:block text-white/40 hover:text-white transition-colors rounded p-1.5 hover:bg-white/10 text-base leading-none">
              ◀
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: "Leads",       val: leads.length },
            { label: "Prosjekter",  val: prosjekter.length },
            { label: "kW (ref)",    val: totKw > 0 ? Math.round(totKw) : "—" },
          ].map(s => (
            <div key={s.label} className="rounded-lg py-2 text-center"
              style={{ background: "rgba(255,255,255,0.07)" }}>
              <div className="text-white font-bold text-base leading-none">{s.val}</div>
              <div className="text-white/40 text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Faner */}
        <div className="flex rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
          {(["leads","prosjekter"] as const).map(f => (
            <button key={f} onClick={() => setFane(f)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                fane === f ? "text-white" : "text-white/40 hover:text-white/70"
              }`}
              style={fane === f ? { background: "#5FAFD7" } : {}}>
              {f === "leads" ? "StreamLeads" : "Prosjekter"}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto">
        {fane === "leads"
          ? leads.length > 0
            ? leads.map(l => (
                <LeadKort key={l.id} l={l} aktiv={aktivPunkt === l.id}
                  onClick={() => { setAktivPunkt(aktivPunkt === l.id ? null : l.id); setMobilSidebarÅpen(false); }} />
              ))
            : <div className="text-white/25 text-xs text-center py-10">Ingen StreamLeads med koordinater</div>
          : prosjekter.length > 0
            ? prosjekter.map(p => (
                <ProsjektKort key={p.id} p={p} aktiv={aktivPunkt === p.id}
                  onClick={() => { setAktivPunkt(aktivPunkt === p.id ? null : p.id); setMobilSidebarÅpen(false); }} />
              ))
            : <div className="text-white/25 text-xs text-center py-10">Ingen prosjekter med koordinater</div>
        }
      </div>

      {/* Lagre ny posisjon */}
      {pendingMove && (
        <div className="px-4 py-3" style={{ background: "rgba(249,115,22,.15)", borderTop: "1px solid rgba(249,115,22,.3)" }}>
          <div className="text-orange-300 text-xs font-semibold mb-1">Ny posisjon for:</div>
          <div className="text-white text-xs mb-2 truncate">{pendingMove.navn}</div>
          <div className="text-white/50 font-mono text-xs mb-3">
            {pendingMove.lat.toFixed(5)}, {pendingMove.lon.toFixed(5)}
          </div>
          <div className="flex gap-2">
            <button onClick={lagrePosisjon} disabled={lagrerPos}
              className="flex-1 py-2 rounded-lg text-xs font-semibold text-white"
              style={{ background: "#2E9E5B" }}>
              {lagrerPos ? "Lagrer..." : "Lagre posisjon"}
            </button>
            <button onClick={() => { setPendingMove(null); hent(); }}
              className="flex-1 py-2 rounded-lg text-xs font-semibold text-white/60 border border-white/20">
              Avbryt
            </button>
          </div>
        </div>
      )}

      {/* Tegnforklaring */}
      <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="text-white/30 text-xs uppercase tracking-wider mb-2">Tegnforklaring</div>
        {[
          { ikon: "🌊", label: "Rapportert strom" },
          { ikon: "🔵", label: "Planlagt prosjekt" },
          { ikon: "🟢", label: "Igangsatt prosjekt" },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-2 text-xs text-white/40 mb-1">
            <span>{l.ikon}</span><span>{l.label}</span>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="-m-3 sm:-m-8 relative flex" style={{ height: "100dvh" }}>

      {/* ── DESKTOP SIDEBAR ─────────────────────────────────────────────────── */}
      <div
        className="hidden md:flex flex-shrink-0 flex-col overflow-hidden transition-all duration-200"
        style={{
          width: panelKollaps ? 44 : 288,
          background: "#0a1f45",
          borderRight: "1px solid rgba(255,255,255,0.1)",
        }}>
        {panelKollaps ? (
          /* Kollapset desktop: bare en pil */
          <div className="flex flex-col items-center pt-4 gap-3">
            <button
              onClick={() => setPanelKollaps(false)}
              title="Vis panel"
              className="text-white/40 hover:text-white transition-colors rounded p-1.5 hover:bg-white/10 text-base leading-none">
              ▶
            </button>
          </div>
        ) : (
          <PanelInnhold />
        )}
      </div>

      {/* ── MOBIL OVERLAY SIDEBAR ──────────────────────────────────────────── */}
      {mobilSidebarÅpen && (
        <>
          {/* Bakgrunn-dimmer */}
          <div
            className="md:hidden absolute inset-0 z-30"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setMobilSidebarÅpen(false)}
          />
          {/* Sidebar-panel */}
          <div
            className="md:hidden absolute left-0 top-0 bottom-0 z-40 flex flex-col overflow-hidden"
            style={{
              width: "min(85vw, 320px)",
              background: "#0a1f45",
              borderRight: "1px solid rgba(255,255,255,0.1)",
            }}>
            <PanelInnhold />
          </div>
        </>
      )}

      {/* ── KART ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-w-0">
        <TideronKart
          punkter={punkter}
          height="100%"
          aktivPunktId={aktivPunkt}
          onMarkerDragged={onMarkerDragged}
          onMarkerClick={onProsjektMarkorKlikk}
        />

        {/* Mobil: flytende meny-knapp */}
        {!mobilSidebarÅpen && (
          <button
            onClick={() => setMobilSidebarÅpen(true)}
            className="md:hidden absolute top-3 left-3 z-20 flex items-center gap-2 text-white text-sm font-semibold px-3 py-2 rounded-xl shadow-lg"
            style={{ background: "#0a1f45" }}>
            ☰ <span>{leads.length + prosjekter.length} steder</span>
          </button>
        )}
      </div>

      <NyStreamLeadModal open={open} onClose={() => setOpen(false)} onCreated={hent} />
    </div>
  );
}
