"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const STATUS_COLOR: Record<string, string> = {
  "apen":     "bg-slate-100 text-slate-600",
  "pagaende": "bg-blue-50 text-blue-700",
  "fullfort": "bg-green-50 text-green-700",
  "avvist":   "bg-red-50 text-red-600",
};

const PRIORITET_IKON: Record<string, string> = {
  lav: "🟢", normal: "🟡", hoy: "🔴",
};

export default function MineOppgaverPage() {
  const { data: session } = useSession();
  const supabase = createClient();
  const [tasks, setTasks] = useState<any[]>([]);
  const [filter, setFilter] = useState<"alle" | "apen" | "pagaende">("alle");
  const [oppdaterer, setOppdaterer] = useState<string | null>(null);

  const hent = useCallback(async () => {
    if (!session?.user) return;
    const userId = (session.user as { id?: string }).id ?? "";
    if (!userId) return;
    const { data } = await supabase
      .from("tasks")
      .select("id, tittel, prioritet, frist, status, project_id, projects(id, navn)")
      .eq("tildelt_til", userId)
      .not("status", "eq", "fullfort")
      .order("frist", { ascending: true, nullsFirst: false });
    setTasks(data ?? []);
  }, [session]);

  useEffect(() => { hent(); }, [hent]);

  const settStatus = async (id: string, status: string) => {
    setOppdaterer(id);
    await supabase.from("tasks").update({ status }).eq("id", id);
    setOppdaterer(null);
    hent();
  };

  const idag = new Date().toISOString().split("T")[0];

  const filtrert = tasks.filter(t =>
    filter === "alle" || t.status === filter
  );

  const apne = tasks.filter(t => t.status === "apen").length;
  const pagaende = tasks.filter(t => t.status === "pagaende").length;
  const forfalte = tasks.filter(t => t.frist && t.frist.split("T")[0] < idag).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Mine oppgaver</h1>
        <p className="text-slate-500 text-sm mt-1">Alle oppgaver tildelt deg, sortert etter frist</p>
      </div>

      {tasks.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "Apne", value: apne },
            { label: "Pagaende", value: pagaende },
            { label: "Forfalt", value: forfalte, alert: forfalte > 0 },
          ].map(k => (
            <div key={k.label} className={`card p-4 ${k.alert ? "border-red-200" : ""}`}>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
              <p className={`text-2xl font-semibold ${k.alert ? "text-red-600" : "text-slate-900"}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {(["alle","apen","pagaende"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
              filter === f
                ? "bg-[#0F2A5A] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}>
            {f === "alle" ? "Alle" : f === "apen" ? "Apne" : "Pagaende"}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {filtrert.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Prosjekt</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Oppgave</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Prioritet</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Frist</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrert.map((t: any) => {
                const fristDato = t.frist ? t.frist.split("T")[0] : null;
                const forfalt = fristDato && fristDato < idag;
                const snart = fristDato && !forfalt &&
                  new Date(fristDato).getTime() - Date.now() < 48 * 3600 * 1000;
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs">
                      {t.projects ? (
                        <Link href={`/prosjekter/${t.projects.id}/oppgaver`}
                          className="text-[#0F2A5A] hover:underline">
                          {t.projects.navn}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{t.tittel}</td>
                    <td className="px-4 py-3">
                      {PRIORITET_IKON[t.prioritet] ?? ""} {t.prioritet}
                    </td>
                    <td className={`px-4 py-3 font-medium ${
                      forfalt ? "text-red-600" : snart ? "text-amber-600" : "text-slate-500"
                    }`}>
                      {fristDato ?? "—"}
                      {forfalt && " ⚠️"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${STATUS_COLOR[t.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right flex gap-2 justify-end">
                      {t.status === "apen" && (
                        <button disabled={oppdaterer === t.id}
                          onClick={() => settStatus(t.id, "pagaende")}
                          className="text-xs text-blue-600 hover:underline disabled:opacity-40">
                          Start
                        </button>
                      )}
                      {t.status !== "fullfort" && (
                        <button disabled={oppdaterer === t.id}
                          onClick={() => settStatus(t.id, "fullfort")}
                          className="text-xs text-green-600 hover:underline disabled:opacity-40">
                          Fullfor
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
            <p className="text-3xl mb-3">✅</p>
            <p className="font-medium text-slate-600">
              {tasks.length === 0 ? "Ingen apne oppgaver" : "Ingen treff"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
