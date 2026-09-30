"use client";
import { useState } from "react";
import Modal from "@/components/Modal";
import { createClient } from "@/lib/supabase/client";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onCreated: () => void;
}

export default function NyOppgaveModal({ open, onClose, projectId, onCreated }: Props) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    tittel: "", beskrivelse: "", frist: "",
    prioritet: "normal", tildelt_epost: "",
  });

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();

    // Slå opp bruker-id fra e-post
    let tildelt_til: string | null = null;
    if (form.tildelt_epost) {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("epost", form.tildelt_epost)
        .single();
      tildelt_til = data?.id ?? null;
    }

    const { data: newTask, error } = await supabase.from("tasks").insert({
      project_id: projectId,
      tittel: form.tittel,
      beskrivelse: form.beskrivelse || null,
      frist: form.frist || null,
      prioritet: form.prioritet,
      tildelt_til,
    }).select("id").single();

    // Send varsel-e-post hvis noen er tildelt
    if (!error && newTask && tildelt_til) {
      fetch("/planner/api/varsler/oppgave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: newTask.id }),
      }).catch(() => {}); // brann-og-glem
    }

    setLoading(false);
    if (error) { alert("Feil: " + error.message); return; }
    setForm({ tittel: "", beskrivelse: "", frist: "", prioritet: "normal", tildelt_epost: "" });
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Ny oppgave">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Tittel *</label>
          <input required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
            value={form.tittel} onChange={e => set("tittel", e.target.value)} placeholder="Hva skal gjøres?" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Beskrivelse</label>
          <textarea rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 resize-none"
            value={form.beskrivelse} onChange={e => set("beskrivelse", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Tildel til (e-post)</label>
            <input type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={form.tildelt_epost} onChange={e => set("tildelt_epost", e.target.value)} placeholder="navn@tideron.com" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Frist</label>
            <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={form.frist} onChange={e => set("frist", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Prioritet</label>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              value={form.prioritet} onChange={e => set("prioritet", e.target.value)}>
              {["lav","normal","høy","kritisk"].map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Avbryt</button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Lagrer…" : "Opprett oppgave"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
