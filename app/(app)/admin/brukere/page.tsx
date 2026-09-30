"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface Bruker {
  id: string;
  email: string;
  navn: string | null;
  rolle: string;
  created_at: string;
}

export default function AdminBrukerePage() {
  const { data: session } = useSession();
  const [brukere, setBrukere] = useState<Bruker[]>([]);
  const [laster, setLaster] = useState(true);
  const [feil, setFeil] = useState("");

  // Nytt bruker-skjema
  const [nyEmail, setNyEmail] = useState("");
  const [nyNavn, setNyNavn] = useState("");
  const [nyPassord, setNyPassord] = useState("");
  const [nyRolle, setNyRolle] = useState("bruker");
  const [leggerTil, setLeggerTil] = useState(false);
  const [suksess, setSuksess] = useState("");

  // Rediger passord
  const [redigerId, setRedigerId] = useState<string | null>(null);
  const [nyttPassord, setNyttPassord] = useState("");

  const hentBrukere = async () => {
    setLaster(true);
    const res = await fetch("/planner/api/admin/brukere");
    if (res.ok) setBrukere(await res.json());
    else setFeil("Ingen tilgang eller feil ved henting.");
    setLaster(false);
  };

  useEffect(() => { hentBrukere(); }, []);

  const leggTilBruker = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeggerTil(true);
    setFeil("");
    const res = await fetch("/planner/api/admin/brukere", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: nyEmail, navn: nyNavn, passord: nyPassord, rolle: nyRolle }),
    });
    const data = await res.json();
    setLeggerTil(false);
    if (!res.ok) { setFeil(data.error); return; }
    setSuksess(`${nyEmail} lagt til!`);
    setNyEmail(""); setNyNavn(""); setNyPassord(""); setNyRolle("bruker");
    setTimeout(() => setSuksess(""), 3000);
    hentBrukere();
  };

  const slettBruker = async (id: string, email: string) => {
    if (!confirm(`Slett ${email}?`)) return;
    await fetch("/planner/api/admin/brukere", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    hentBrukere();
  };

  const oppdaterPassord = async (id: string) => {
    if (!nyttPassord || nyttPassord.length < 6) { setFeil("Passord må være minst 6 tegn"); return; }
    const res = await fetch("/planner/api/admin/brukere", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, passord: nyttPassord }),
    });
    if (res.ok) { setRedigerId(null); setNyttPassord(""); hentBrukere(); }
    else { const d = await res.json(); setFeil(d.error); }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Brukeradministrasjon</h1>
        <p className="text-slate-500 text-sm mt-1">Legg til og administrer brukere som har tilgang til appen</p>
      </div>

      {/* Legg til bruker */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Legg til ny bruker</h2>
        <form onSubmit={leggTilBruker} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">E-post *</label>
              <input
                type="email" required value={nyEmail}
                onChange={e => setNyEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                placeholder="bruker@firma.no"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Navn</label>
              <input
                type="text" value={nyNavn}
                onChange={e => setNyNavn(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                placeholder="Fornavn Etternavn"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Passord *</label>
              <input
                type="password" required minLength={6} value={nyPassord}
                onChange={e => setNyPassord(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                placeholder="Minst 6 tegn"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Rolle</label>
              <select
                value={nyRolle} onChange={e => setNyRolle(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
              >
                <option value="bruker">Bruker</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          {feil && <p className="text-red-600 text-sm">{feil}</p>}
          {suksess && <p className="text-green-600 text-sm">{suksess}</p>}
          <button type="submit" disabled={leggerTil} className="btn-primary">
            {leggerTil ? "Legger til..." : "Legg til bruker"}
          </button>
        </form>
      </div>

      {/* Brukerliste */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Brukere ({brukere.length})</h2>
        </div>
        {laster ? (
          <p className="p-6 text-slate-400 text-sm">Laster...</p>
        ) : brukere.length === 0 ? (
          <p className="p-6 text-slate-400 text-sm">Ingen brukere lagt til ennå.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {brukere.map(b => (
              <li key={b.id} className="px-6 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 text-sm">{b.navn ?? b.email}</p>
                    {b.navn && <p className="text-slate-400 text-xs">{b.email}</p>}
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      b.rolle === "admin" ? "bg-[#0F2A5A]/10 text-[#0F2A5A]" : "bg-slate-100 text-slate-600"
                    }`}>{b.rolle}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {redigerId === b.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="password" placeholder="Nytt passord"
                          value={nyttPassord} onChange={e => setNyttPassord(e.target.value)}
                          className="border border-slate-200 rounded-lg px-2 py-1 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                        />
                        <button onClick={() => oppdaterPassord(b.id)}
                          className="text-xs bg-[#0F2A5A] text-white px-2 py-1 rounded-lg hover:bg-[#1B4F8A]">
                          Lagre
                        </button>
                        <button onClick={() => { setRedigerId(null); setNyttPassord(""); }}
                          className="text-xs text-slate-400 hover:text-slate-600">
                          Avbryt
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setRedigerId(b.id)}
                        className="text-xs text-slate-400 hover:text-slate-700 border border-slate-200 px-2 py-1 rounded-lg">
                        Endre passord
                      </button>
                    )}
                    <button onClick={() => slettBruker(b.id, b.email)}
                      className="text-xs text-red-400 hover:text-red-600 border border-red-100 px-2 py-1 rounded-lg hover:bg-red-50">
                      Slett
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
