"use client";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";

interface Melding {
  rolle: "user" | "assistant";
  tekst: string;
}

export default function KundeChatSide() {
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
    const nye: Melding[] = [...meldinger, { rolle: "user", tekst: sporsmal }];
    setMeldinger(nye);
    setSender(true);

    try {
      const res = await fetch("/planner/api/assistent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sporsmal, historikk: nye.slice(-6) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeil(data.error ?? "Noe gikk galt");
        return;
      }
      setMeldinger((m) => [...m, { rolle: "assistant", tekst: data.svar }]);
    } catch {
      setFeil("Kunne ikke nå assistenten akkurat nå. Prøv igjen om litt.");
    } finally {
      setSender(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Image src="/logo.png" alt="Tideron" width={40} height={37} />
          <div>
            <h1 className="text-lg font-semibold text-[#0F2A5A]">Spør Tideron</h1>
            <p className="text-sm text-slate-500">
              Still spørsmål om teknologien, prosjektene og hvordan vi kan hjelpe dere.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col" style={{ height: "70vh" }}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {meldinger.length === 0 && (
              <p className="text-sm text-slate-400">
                Eksempler: «Hvordan fungerer teknologien deres?», «Kan dere hjelpe et fiskeoppdrett med
                høyt dieselforbruk?», «Finnes det støtteordninger for et pilotprosjekt?»
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
                </div>
              </div>
            ))}
            {sender && <p className="text-sm text-slate-400">Tenker…</p>}
            {feil && <p className="text-sm text-red-500">{feil}</p>}
            <div ref={bunnRef} />
          </div>
          <div className="flex gap-2 p-4 border-t border-slate-200">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder="Skriv spørsmålet ditt…"
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
        <p className="text-xs text-slate-400 text-center mt-4">
          Tideron AS · svarene genereres av KI basert på Tiderons offentlig tilgjengelige informasjon.
        </p>
      </div>
    </div>
  );
}
