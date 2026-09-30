"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import NyOppgaveModal from "@/components/NyOppgaveModal";

type Status = "åpen"|"pågående"|"fullført"|"avvist";
type Prioritet = "lav"|"normal"|"høy"|"kritisk";

const STATUS_COLOR: Record<Status, string> = {
  åpen: "bg-slate-100 text-slate-600",
  pågående: "bg-blue-50 text-blue-700",
  fullført: "bg-green-50 text-green-700",
  avvist: "bg-red-50 text-red-600",
};

const PRIORITET_COLOR: Record<Prioritet, string> = {
  lav: "text-slate-400", normal: "text-slate-600",
  høy: "text-amber-600", kritisk: "text-red-600",
};

export default function OppgaverPage({ params }: { params: { id: string } }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const supabase = createClient();
  const idag = new Date().toISOString().split("T")[0];

  const hentOppgaver = useCallback(async () => {
    const { data } = await supabase
      .from("tasks")
      .select("id, tittel, prioritet, frist, status, profiles(navn)")
      .eq("project_id", params.id)
      .order("frist", { ascending: true, nullsFirst: false });
    setTasks(data ?? []);
  }, [params.id]);

  useEffect(() => { hentOppgaver(); }, [hentOppgaver]);

  const updateStatus = async (id: string, status: Status) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    await supabase.from("tasks").update({
      status,
      fullfort_dato: status === "fullført" ? new Date().toISOString() : null,
    }).eq("id", id);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold text-slate-900">Oppgaver</h2>
        <button onClick={() => setOpen(true)} className="btn-primary">+ Ny oppgave</button>
      </div>

      <NyOppgaveModal open={open} onClose={() => setOpen(false)}
        projectId={params.id} onCreated={hentOppgaver} />

      <div className="card overflow-hidden">
        {tasks.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Tittel</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Tildelt</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Prioritet</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Frist</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map(t => {
                const frist = t.frist?.split("T")[0] ?? null;
                const overskredet = frist && frist < idag && t.status !== "fullført" && t.status !== "avvist";
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{t.tittel}</td>
                    <td className="px-4 py-3 text-slate-500">{t.profiles?.navn ?? "—"}</td>
                    <td className={`px-4 py-3 font-medium ${PRIORITET_COLOR[t.prioritet as Prioritet]}`}>{t.prioritet}</td>
                    <td className={`px-4 py-3 ${overskredet ? "text-red-600 font-medium" : "text-slate-500"}`}>
                      {frist ?? "—"}{overskredet && " ⚠️"}
                    </td>
                    <td className="px-4 py-3">
                      <select value={t.status}
                        onChange={e => updateStatus(t.id, e.target.value as Status)}
                        className={`badge ${STATUS_COLOR[t.status as Status]} border-0 cursor-pointer`}>
                        {(["åpen","pågående","fullført","avvist"] as Status[]).map(s =>
                          <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center text-slate-400">
            <p className="text-3xl mb-3">✅</p>
            <p className="font-medium text-slate-600">Ingen oppgaver ennå</p>
          </div>
        )}
      </div>
    </div>
  );
}
