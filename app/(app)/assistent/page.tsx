"use client";
import { useState, useRef, useEffect } from "react";

interface Melding {
  rolle: "user" | "assistant";
  tekst: string;
  kilder?: { source: string; category: string | null }[];
}

export default function AssistentSide() {
  const [meldinger, setMeldinger] = useState<Melding[]>([]);
  const [input, setInput] = useState("");
  const [sender, setSender] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  const bunnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bunnRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [meldinger, sender]);

  const send = async () => {
    const sporsmal = input.trim();
    if (!sporsmal || sender) return;
    setInput("");
    setFeil(null);
    const nyeMeldinger: Melding[] = [...meldinger, { rolle: "user", tekst: sporsmal }];
    setMeldinger(nyeMeldinger);
    setSender(true);

    try {
      const res = await fetch("/planner/api/assistent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sporsmal,
          historikk: nyeMeldinger.slice(-6).map((m) => ({ rolle: m.rolle, tekst: m.tekst })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeil(data.error ?? "Noe gikk galt");
        return;
      }
      setMeldinger((m) => [...m, { rolle: "assistant", tekst: data.svar, kilder: data.kilder }]);
    } catch {
      setFeil("Kunne ikke nå assistenten. Prøv igjen.");
    } finally {
      setSender(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-[#0F2A5A]">Kunnskapsassistent</h1>
        <p className="text-sm text-slate-500">
          Full tilgang til Tiderons interne og eksterne kunnskapsbase — spør om lokasjoner, teknologi,
          SPV-struktur, økonomi, regulatorikk, kunder eller strategi.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {meldinger.length === 0 && (
          <p className="text-sm text-slate-400">
            Eksempler: «Hvilke norske lokasjoner er høyest prioritert?», «Hva sier vi til SEV på
            Færøyene?», «Hvordan er datarommet strukturert per SPV?»
          </p>
        )}
        {meldinger.map((m, i) => (
          <div key={i} className={`flex ${m.rolle === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap ${
                m.rolle === "user" ? "bg-[#0F2A5A] text-white" : "bg-slate-100 text-slate-800"
              }`}
            >
              {m.tekst}
              {m.kilder && m.kilder.length > 0 && (
                <p className="mt-2 text-xs text-slate-400">
                  Kilder: {m.kilder.map((k) => k.source).join(", ")}
                </p>
              )}
            </div>
          </div>
        ))}
        {sender && <p className="text-sm text-slate-400">Søker i kunnskapsbasen…</p>}
        {feil && <p className="text-sm text-red-500">{feil}</p>}
        <div ref={bunnRef} />
      </div>

      <div className="flex gap-2 pt-4 border-t mt-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Still et spørsmål…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-[#0F2A5A]"
        />
        <button
          onClick={send}
          disabled={sender || !input.trim()}
          className="rounded-lg bg-[#0F2A5A] text-white px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
