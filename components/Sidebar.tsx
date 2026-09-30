"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useI18n, Sprak, useValuta } from "@/lib/i18n";
import { LAND } from "@/lib/land";

// Unike valutaer sortert alfabetisk
const VALUTAER = Array.from(
  new Map(LAND.map(l => [l.currency_code, { code: l.currency_code, flag: l.flag }])).values()
).sort((a, b) => a.code.localeCompare(b.code));
import { useState, useEffect, useRef } from "react";

const ADMIN = "ksv@tideron.com";

type Rolle = "admin" | "bruker" | "leser";
interface Bruker { id: string; email: string; rolle: Rolle; created_at: string; }

const ROLLE_LABEL: Record<Rolle, string> = {
  admin:  "Admin",
  bruker: "Bruker",
  leser:  "Leser",
};
const ROLLE_FARGE: Record<Rolle, string> = {
  admin:  "bg-[#0F2A5A] text-white",
  bruker: "bg-slate-200 text-slate-700",
  leser:  "bg-amber-100 text-amber-700",
};

function BrukerPanel({ onLukk }: { onLukk: () => void }) {
  const [brukere, setBrukere] = useState<Bruker[]>([]);
  const [nyEpost,   setNyEpost]   = useState("");
  const [nyNavn,    setNyNavn]    = useState("");
  const [nyPassord, setNyPassord] = useState("");
  const [nyRolle,   setNyRolle]   = useState<Rolle>("bruker");
  const [lagrer, setLagrer] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const hent = async () => {
    const r = await fetch("/planner/api/admin/brukere");
    if (r.ok) setBrukere(await r.json());
  };
  useEffect(() => { hent(); }, []);

  const leggTil = async () => {
    setFeil(null);
    if (!nyEpost.includes("@")) { setFeil("Skriv en gyldig e-post"); return; }
    if (!nyPassord || nyPassord.length < 6) { setFeil("Passord må være minst 6 tegn"); return; }
    setLagrer(true);
    const r = await fetch("/planner/api/admin/brukere", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: nyEpost, navn: nyNavn, passord: nyPassord, rolle: nyRolle }),
    });
    const d = await r.json();
    if (!r.ok) { setFeil(d.error); setLagrer(false); return; }
    setNyEpost(""); setNyNavn(""); setNyPassord(""); setLagrer(false); hent();
  };

  const byttRolle = async (id: string, rolle: Rolle) => {
    await fetch("/planner/api/admin/brukere", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, rolle }),
    });
    hent();
  };

  const fjern = async (id: string, email: string) => {
    if (!confirm(`Fjerne ${email}?`)) return;
    await fetch("/planner/api/admin/brukere", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    hent();
  };

  return (
    <div ref={panelRef}
      className="fixed bottom-4 left-4 z-50 w-80 rounded-2xl shadow-2xl overflow-hidden"
      style={{ background: "#0a1a3a", border: "1px solid rgba(255,255,255,.12)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div>
          <p className="text-white text-sm font-semibold">Brukertilgang</p>
          <p className="text-white/40 text-xs">{brukere.length} brukere</p>
        </div>
        <button onClick={onLukk} className="text-white/40 hover:text-white text-lg leading-none">✕</button>
      </div>

      {/* Eksisterende brukere */}
      <div className="max-h-56 overflow-y-auto px-3 py-2 space-y-1">
        {/* Admin-rad (statisk) */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{background:"rgba(255,255,255,.05)"}}>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs truncate font-medium">{ADMIN}</p>
            <p className="text-white/30 text-[10px]">Systemadmin</p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[#0F2A5A] text-white flex-shrink-0">Admin</span>
        </div>

        {brukere.map(b => (
          <div key={b.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 group">
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs truncate">{b.email}</p>
            </div>
            <select
              value={b.rolle}
              onChange={e => byttRolle(b.id, e.target.value as Rolle)}
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none"
              style={{background: b.rolle === "admin" ? "#0F2A5A" : b.rolle === "leser" ? "#fef3c7" : "#e2e8f0",
                      color: b.rolle === "admin" ? "#fff" : b.rolle === "leser" ? "#92400e" : "#334155"}}>
              <option value="admin">Admin</option>
              <option value="bruker">Bruker</option>
              <option value="leser">Leser</option>
            </select>
            <button onClick={() => fjern(b.id, b.email)}
              className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 text-xs transition-opacity ml-1">
              ✕
            </button>
          </div>
        ))}

        {brukere.length === 0 && (
          <p className="text-white/20 text-xs text-center py-3">Ingen ekstra brukere ennå</p>
        )}
      </div>

      {/* Legg til ny bruker */}
      <div className="px-3 py-3 border-t border-white/10 space-y-2">
        {feil && <p className="text-red-400 text-xs">{feil}</p>}
        <input
          value={nyNavn}
          onChange={e => setNyNavn(e.target.value)}
          placeholder="Fullt navn"
          className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-white/10 text-white placeholder-white/25 border border-white/20 focus:outline-none focus:border-white/40"
        />
        <input
          value={nyEpost}
          onChange={e => setNyEpost(e.target.value)}
          placeholder="epost@eksempel.com"
          type="email"
          className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-white/10 text-white placeholder-white/25 border border-white/20 focus:outline-none focus:border-white/40"
        />
        <div className="flex gap-1.5">
          <input
            value={nyPassord}
            onChange={e => setNyPassord(e.target.value)}
            placeholder="Passord (min. 6 tegn)"
            type="password"
            className="flex-1 rounded-lg px-2.5 py-1.5 text-xs bg-white/10 text-white placeholder-white/25 border border-white/20 focus:outline-none focus:border-white/40"
          />
          <select
            value={nyRolle}
            onChange={e => setNyRolle(e.target.value as Rolle)}
            className="rounded-lg px-2 py-1.5 text-xs bg-white/10 text-white border border-white/20 focus:outline-none">
            <option value="bruker" style={{color:"#000"}}>Bruker</option>
            <option value="leser" style={{color:"#000"}}>Leser</option>
            <option value="admin" style={{color:"#000"}}>Admin</option>
          </select>
        </div>
        <button
          onClick={leggTil}
          disabled={lagrer || !nyEpost}
          className="w-full py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-40"
          style={{background:"#1B4F8A"}}>
          {lagrer ? "Legger til…" : "+ Legg til bruker"}
        </button>
      </div>

      {/* Rolleforklaring */}
      <div className="px-3 pb-3 flex gap-2 text-[10px] text-white/25">
        <span>Admin = full tilgang</span>
        <span>·</span>
        <span>Bruker = standard</span>
        <span>·</span>
        <span>Leser = kun lese</span>
      </div>
    </div>
  );
}

export default function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { t, sprak, settSprak } = useI18n();
  const { valuta, settValuta } = useValuta();
  const navn = session?.user?.name ?? "Bruker";
  const epost = session?.user?.email ?? "";
  const initial = navn.charAt(0).toUpperCase();
  const [collapsed, setCollapsed] = useState(false);
  const [visBrukere, setVisBrukere] = useState(false);

  // Sjekk admin: først fra session-email, så API-fallback
  const erAdminEmail = epost.toLowerCase() === ADMIN;
  const [erAdminApi, setErAdminApi] = useState(false);
  const erAdmin = erAdminEmail || erAdminApi;

  useEffect(() => {
    if (erAdminEmail) return; // allerede bekreftet
    fetch("/planner/api/admin/brukere")
      .then(r => { if (r.ok) setErAdminApi(true); })
      .catch(() => {});
  }, [erAdminEmail]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebar_collapsed");
      if (saved === "1") setCollapsed(true);
    } catch {}
  }, []);

  // Auto-kollaps når man er på kart-siden
  useEffect(() => {
    if (pathname === "/kart" || pathname.startsWith("/kart")) {
      setCollapsed(true);
    }
  }, [pathname]);

  const toggle = () => {
    setCollapsed(c => {
      try { localStorage.setItem("sidebar_collapsed", c ? "0" : "1"); } catch {}
      return !c;
    });
  };

  const nav = [
    { href: "/prosjekter",    label: t("nav.prosjekter"),   icon: "⚡" },
    { href: "/mine-oppgaver", label: t("nav.oppgaver"),     icon: "✅" },
    { href: "/assistent",     label: t("nav.assistent"),    icon: "💬" },
  ];

  return (
    <>
      {visBrukere && <BrukerPanel onLukk={() => setVisBrukere(false)} />}

      <aside
        className={`
          min-h-screen bg-[#0F2A5A] flex flex-col flex-shrink-0 transition-all duration-200
          fixed lg:relative z-50
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{ width: collapsed ? 56 : 240 }}>

        {/* Header */}
        <div className={`flex items-center border-b border-white/10 ${collapsed ? "px-2 py-4 justify-center" : "px-4 py-5 justify-between"}`}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/planner/logo.png"
                alt="Tideron"
                className="h-9 w-auto"
              />
              <span className="text-white font-bold text-lg tracking-widest">TIDERON</span>
            </div>
          )}
          {/* Lukk-knapp på mobil, collapse-knapp på desktop */}
          <button
            onClick={() => { if (onMobileClose) onMobileClose(); else toggle(); }}
            title={collapsed ? "Vis meny" : "Skjul meny"}
            className="text-white/40 hover:text-white transition-colors rounded p-1 hover:bg-white/10 lg:hidden">
            ✕
          </button>
          <button onClick={toggle}
            title={collapsed ? "Vis meny" : "Skjul meny"}
            className="text-white/40 hover:text-white transition-colors rounded p-1 hover:bg-white/10 hidden lg:block">
            {collapsed ? "▶" : "◀"}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-1.5 py-3 space-y-0.5">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              // data-tab-href med /planner-prefix: capture-handler i ProsjektLayout
              // bruker window.location.href = href, så full sti er påkrevd.
              <Link key={item.href} href={item.href} data-tab-href={`/planner${item.href}`}
                title={collapsed ? item.label : undefined}
                className={`flex items-center rounded-lg text-sm transition-colors ${
                  collapsed ? "justify-center px-1 py-2.5" : "gap-3 px-3 py-2.5"
                } ${active ? "bg-white/15 text-white font-medium" : "text-white/60 hover:bg-white/10 hover:text-white"}`}>
                <span className="text-base flex-shrink-0">{item.icon}</span>
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>

        {/* Brukerstyring (kun admin) */}
        {erAdmin && (
          <div className="px-1.5 pb-1">
            <a
              href="/planner/admin/brukere"
              title="Brukerstyring"
              className={`w-full flex items-center rounded-lg text-sm transition-colors text-white/50 hover:bg-white/10 hover:text-white ${
                collapsed ? "justify-center px-1 py-2.5" : "gap-3 px-3 py-2.5"
              } ${pathname.startsWith("/admin/brukere") ? "bg-white/10 text-white" : ""}`}>
              <span className="text-base flex-shrink-0">👥</span>
              {!collapsed && <span>Brukere</span>}
            </a>
          </div>
        )}

        {/* Språkvelger */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-white/10">
            <p className="text-white/30 text-xs uppercase tracking-wider mb-2">{t("sprak.velg")}</p>
            <div className="flex gap-1">
              {(["nb", "en", "es"] as Sprak[]).map((s) => (
                <button key={s} onClick={() => settSprak(s)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    sprak === s ? "bg-white/20 text-white" : "text-white/40 hover:text-white/70 hover:bg-white/10"
                  }`}>
                  {s === "nb" ? "🇳🇴 NO" : s === "en" ? "🇬🇧 EN" : "🇪🇸 ES"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Valutavelger */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-white/10">
            <p className="text-white/30 text-xs uppercase tracking-wider mb-2">{t("valuta.velg")}</p>
            <select
              value={valuta}
              onChange={e => settValuta(e.target.value)}
              className="w-full bg-white/10 text-white text-xs rounded px-2 py-1.5 border border-white/20 focus:outline-none focus:border-white/40"
            >
              {VALUTAER.map(v => (
                <option key={v.code} value={v.code} className="bg-[#0F2A5A] text-white">
                  {v.flag} {v.code}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Bruker */}
        <div className={`border-t border-white/10 ${collapsed ? "px-1 py-3 flex flex-col items-center gap-2" : "px-4 py-4"}`}>
          {collapsed ? (
            <>
              <Link href="/innstillinger" title={navn}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-medium hover:bg-white/30 transition-colors">
                {initial}
              </Link>
              <Link href="/planner/api/logg-ut"
                title={t("nav.logg_ut")}
                className="text-white/40 hover:text-white/70 transition-colors text-xs">
                ↩
              </Link>
            </>
          ) : (
            <>
              <Link href="/innstillinger" className="flex items-center gap-3 mb-3 hover:opacity-80 transition-opacity">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-medium">
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{navn}</p>
                  <p className="text-white/40 text-xs truncate">{epost}</p>
                </div>
              </Link>
              <Link href="/planner/api/logg-ut"
                className="w-full text-xs text-white/40 hover:text-white/70 text-left transition-colors block">
                {t("nav.logg_ut")}
              </Link>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
