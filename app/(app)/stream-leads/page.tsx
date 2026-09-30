"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import NyStreamLeadModal from "@/components/NyStreamLeadModal";
import { createClient } from "@/lib/supabase/client";
import { beregnEffektKw, beregnArligKwh } from "@/lib/finans";
import { fmtKw } from "@/lib/units";

// Odoo x_location_status-verdier
const STATUS_ODOO = ["analyzed", "active", "deployed"] as const;
type OdooStatus = typeof STATUS_ODOO[number] | "ikke_vurdert";

const STATUS_LABEL: Record<string, string> = {
  ikke_vurdert: "Ikke vurdert",
  analyzed:     "Analysert",
  active:       "Aktiv/lovende",
  deployed:     "Utbygd",
};
const STATUS_COLOR: Record<string, string> = {
  ikke_vurdert: "bg-slate-100 text-slate-600",
  analyzed:     "bg-blue-50 text-blue-700",
  active:       "bg-emerald-50 text-emerald-700",
  deployed:     "bg-purple-50 text-purple-700",
};

const DATA_QUALITY_LABEL: Record<string, string> = {
  confirmed: "Bekreftet",
  estimated: "Estimert",
  poor:      "Usikker",
};

const DIAMETER = 3.05; // Waterotor 10 fot som referanse

export default function StreamLeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<any[]>([]);
  const [laster, setLaster] = useState(true);
  const [feil, setFeil] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState({ type: "", status: "" });
  const [konverterer, setKonverterer] = useState<string | null>(null);
  const supabase = createClient();

  const hent = useCallback(async () => {
    setLaster(true);
    const res = await fetch("/planner/api/odoo/leads?all=1");
    const json = await res.json();
    if (!res.ok || json?.error) {
      setFeil(json?.error ?? "Odoo-feil");
      setLeads([]);
    } else {
      setFeil(null);
      setLeads(Array.isArray(json) ? json : []);
    }
    setLaster(false);
  }, []);

  useEffect(() => { hent(); }, [hent]);

  const settStatus = async (lead: any, nyStatus: string) => {
    const odooStatus = nyStatus === "ikke_vurdert" ? false : nyStatus;
    await fetch("/planner/api/odoo/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ odoo_id: lead.odoo_id, x_location_status: odooStatus }),
    });
    hent();
  };

  const konverterTilProsjekt = async (lead: any) => {
    setKonverterer(lead.id);
    // Opprett prosjekt i Supabase
    const { data: p, error } = await supabase.from("projects").insert({
      navn: lead.navn,
      lat: lead.lat,
      lon: lead.lon,
      stadie: "Forhåndsutredning",
      country_code: "NO",
      currency_code: "NOK",
    }).select("id").single();

    if (error || !p) { alert("Feil: " + error?.message); setKonverterer(null); return; }

    // Legg til strømdata hvis vi har hastighet
    if (lead.avg_velocity_m_s) {
      await supabase.from("streams").insert({
        project_id: p.id,
        stream_type: lead.stream_type,
        avg_velocity_m_s: lead.avg_velocity_m_s,
      });
    }

    // Oppdater Odoo-lead til deployed
    await fetch("/planner/api/odoo/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ odoo_id: lead.odoo_id, x_location_status: "deployed" }),
    });

    setKonverterer(null);
    router.push(`/prosjekter/${p.id}`);
  };

  const filtrert = leads.filter(l =>
    (!filter.type || l.stream_type === filter.type) &&
    (!filter.status || l.status === filter.status)
  );

  const estKw = (lead: any) => {
    const v = lead.avg_velocity_m_s;
    if (!v) return null;
    return beregnEffektKw(v, DIAMETER) * 4; // 4 rotorer som ref
  };

  const nok = (v: number) => Math.round(v).toLocaleString("nb-NO");

  return (
    <div>
      <PageHeader
        title="StreamLeads"
        subtitle="Strømlokasjonsdatabase fra Odoo CRM"
        action={<button onClick={() => setOpen(true)} className="btn-primary">+ Registrer strøm</button>}
      />
      <NyStreamLeadModal open={open} onClose={() => setOpen(false)} onCreated={hent} />

      {feil && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Odoo-feil: {feil}
        </div>
      )}

      {leads.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: "Totalt", value: leads.length },
            { label: "Analysert", value: leads.filter(l => l.x_location_status === "analyzed").length },
            { label: "Aktiv/lovende", value: leads.filter(l => l.x_location_status === "active").length },
            { label: "Utbygd", value: leads.filter(l => l.x_location_status === "deployed").length },
          ].map(k => (
            <div key={k.label} className="card p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
              <p className="text-2xl font-semibold text-slate-900">{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <select value={filter.type} onChange={e => setFilter(f => ({ ...f, type: e.target.value }))}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">Alle typer</option>
          {["tidevann","elv","havstrøm"].map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">Alle statuser</option>
          <option value="ikke_vurdert">Ikke vurdert</option>
          <option value="under_utredning">Under utredning</option>
          <option value="lovende">Lovende</option>
          <option value="konvertert">Utbygd</option>
        </select>
        {(filter.type || filter.status) && (
          <button onClick={() => setFilter({ type: "", status: "" })}
            className="text-slate-400 hover:text-slate-600 text-sm px-2">Nullstill</button>
        )}
      </div>

      <div className="card overflow-hidden">
        {laster ? (
          <div className="p-12 text-center text-slate-400">
            <p className="text-sm">Laster fra Odoo CRM…</p>
          </div>
        ) : filtrert.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Navn</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Type</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">Avg m/s</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">Est. kW (4 rotorer)</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Datakvalitet</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrert.map((s: any) => {
                const kw = estKw(s);
                const currentStatus: string = s.x_location_status ?? "ikke_vurdert";
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {s.navn}
                      {s.description && (
                        <p className="text-xs text-slate-400 mt-0.5 font-normal truncate max-w-[220px]">{s.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{s.stream_type ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {s.avg_velocity_m_s?.toFixed(2) ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {kw != null ? (
                        <span>
                          <span className="font-medium">{fmtKw(kw)}</span>
                          <span className="text-slate-400 text-xs ml-1">
                            ≈ {nok(beregnArligKwh(kw, s.stream_type ?? "tidevann"))} kWh/år
                          </span>
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {DATA_QUALITY_LABEL[s.x_data_quality] ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={currentStatus}
                        onChange={e => settStatus(s, e.target.value)}
                        className={`badge border-0 cursor-pointer text-xs ${STATUS_COLOR[currentStatus] ?? STATUS_COLOR.ikke_vurdert}`}>
                        <option value="ikke_vurdert">Ikke vurdert</option>
                        <option value="analyzed">Analysert</option>
                        <option value="active">Aktiv/lovende</option>
                        <option value="deployed">Utbygd</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {currentStatus !== "deployed" && (
                        <button
                          disabled={konverterer === s.id}
                          onClick={() => konverterTilProsjekt(s)}
                          className="text-xs text-[#0F2A5A] hover:underline disabled:opacity-40 whitespace-nowrap">
                          {konverterer === s.id ? "Oppretter..." : "→ Prosjekt"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center text-slate-400">
            <p className="text-3xl mb-3">🌊</p>
            <p className="font-medium text-slate-600 mb-1">
              {leads.length === 0 ? "Ingen strømer registrert i Odoo" : "Ingen treff på filter"}
            </p>
            {leads.length === 0 && <p className="text-sm">Klikk &quot;+ Registrer strøm&quot; for å legge til</p>}
          </div>
        )}
      </div>
    </div>
  );
}
