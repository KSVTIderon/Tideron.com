"use client";
import { useState } from "react";
import Modal from "@/components/Modal";

interface Props { open: boolean; onClose: () => void; onCreated: () => void; }

export default function NyStreamLeadModal({ open, onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  const [form, setForm] = useState({
    navn: "", lat: "", lon: "",
    stream_type: "tidevann",
    peak_velocity: "", avg_velocity: "",
    x_data_quality: "estimated",
    notater: "",
  });

  const set = (k: string, v: string) => {
    const next = { ...form, [k]: v };
    if (k === "peak_velocity") {
      const p = parseFloat(v);
      if (next.stream_type === "tidevann") {
        next.avg_velocity = isNaN(p) ? "" : (p * 0.637).toFixed(3);
      }
    }
    setForm(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeil(null);

    const body: Record<string, any> = {
      navn: form.navn,
      stream_type: form.stream_type || undefined,
      avg_velocity_m_s: form.avg_velocity ? parseFloat(form.avg_velocity) : undefined,
      x_data_quality: form.x_data_quality || undefined,
      x_location_status: "analyzed",
    };
    if (form.lat) body.lat = parseFloat(form.lat);
    if (form.lon) body.lon = parseFloat(form.lon);

    // Lagre topphastighet og notater i description
    const descParts: string[] = [];
    if (form.peak_velocity) descParts.push(`Topphastighet: ${form.peak_velocity} m/s`);
    if (form.notater)       descParts.push(form.notater);
    if (descParts.length)   body.description = descParts.join("\n");

    const res = await fetch("/planner/api/odoo/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok || json.error) {
      setFeil(json.error ?? "Ukjent feil");
      return;
    }

    setForm({ navn:"", lat:"", lon:"", stream_type:"tidevann", peak_velocity:"", avg_velocity:"", x_data_quality:"estimated", notater:"" });
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Registrer strømlokasjon">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Navn *</label>
          <input required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
            value={form.navn} onChange={e => set("navn", e.target.value)} placeholder="f.eks. Akselsundet Nord" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Type</label>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={form.stream_type} onChange={e => set("stream_type", e.target.value)}>
              {["tidevann","elv","havstrøm"].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              {form.stream_type === "tidevann" ? "Topphastighet (m/s)" : "Gjennomsnitt (m/s)"}
            </label>
            <input type="number" step="0.001" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={form.stream_type === "tidevann" ? form.peak_velocity : form.avg_velocity}
              onChange={e => set(form.stream_type === "tidevann" ? "peak_velocity" : "avg_velocity", e.target.value)}
              placeholder="0.000" />
          </div>
          {form.stream_type === "tidevann" && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Avg (auto × 0.637)</label>
              <input readOnly className="w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-400"
                value={form.avg_velocity} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Lat</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={form.lat} onChange={e => set("lat", e.target.value)} placeholder="68.1234" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Lon</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={form.lon} onChange={e => set("lon", e.target.value)} placeholder="14.5678" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Datakvalitet</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
            value={form.x_data_quality} onChange={e => set("x_data_quality", e.target.value)}>
            <option value="estimated">Estimert</option>
            <option value="confirmed">Bekreftet</option>
            <option value="poor">Usikker</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Notater</label>
          <textarea rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 resize-none"
            value={form.notater} onChange={e => set("notater", e.target.value)} />
        </div>
        {feil && <p className="text-sm text-red-600">{feil}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Avbryt</button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Lagrer i Odoo..." : "Registrer strøm"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
