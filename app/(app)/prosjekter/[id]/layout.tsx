"use client";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useI18n, I18nNokkel } from "@/lib/i18n";

const TABS: { nokkel: I18nNokkel; slug: string }[] = [
  { nokkel: "tab.oversikt",       slug: "" },
  { nokkel: "tab.kart",           slug: "kart" },
  { nokkel: "tab.budsjett",       slug: "budsjett" },
  { nokkel: "tab.rapporter",      slug: "rapporter" },
  { nokkel: "tab.energibehov",    slug: "marked" },
  { nokkel: "tab.oppgaver",       slug: "oppgaver" },
  { nokkel: "tab.soknader",       slug: "soknader" },
  { nokkel: "tab.ppa",            slug: "ppa" },
  { nokkel: "tab.dokumenter",     slug: "dokumenter" },
  { nokkel: "tab.utstyr",         slug: "utstyr" },
  { nokkel: "tab.innstillinger",  slug: "innstillinger" },
  { nokkel: "tab.parametre",      slug: "parametre" },
];

export default function ProsjektLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tekniskModus = searchParams.get("mode") === "teknisk";
  const base = `/prosjekter/${params.id}`;
  const { t, sprak } = useI18n();
  const [prosjekt, setProsjekt] = useState<{ navn: string; sted: string; stadie: string } | null>(null);

  useEffect(() => {
    createClient()
      .from("projects").select("navn,sted,stadie").eq("id", params.id).single()
      .then(({ data }) => { if (data) setProsjekt(data); });
  }, [params.id]);

  // Capture-phase listener: fires before Leaflet or any map event handler.
  // Ensures tab clicks always navigate even if the map has grabbed pointer events.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = (e.target as Element).closest("[data-tab-href]");
      if (!el) return;
      const href = el.getAttribute("data-tab-href");
      if (!href) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.href = href; // fullHref inkl. /planner lagres i data-tab-href
    };
    window.addEventListener("mousedown", handler, true);
    return () => window.removeEventListener("mousedown", handler, true);
  }, []);

  const tilbakeLabel = sprak === "en" ? "← Projects" : "← Prosjekter";

  return (
    <div>
      <div className="mb-6">
        <Link href="/prosjekter" className="text-sm text-slate-400 hover:text-slate-600 mb-2 inline-block">
          {tilbakeLabel}
        </Link>
        <h1 className="text-lg sm:text-2xl font-semibold text-slate-900">{prosjekt?.navn ?? "..."}</h1>
        <p className="text-slate-500 text-sm">
          {prosjekt?.sted ?? ""}
          {prosjekt?.sted && prosjekt?.stadie ? " · " : ""}
          {prosjekt?.stadie ?? ""}
        </p>
      </div>

      <div className="border-b border-slate-200 mb-4 lg:mb-6 sticky top-12 lg:top-0 bg-white z-[9999]">
        <nav className="flex gap-0.5 lg:gap-1 -mb-px overflow-x-auto scrollbar-none">
          {TABS.filter(tab => !tekniskModus || !["budsjett", "ppa", "investorpitch"].includes(tab.slug)).map((tab) => {
            const suffix = tekniskModus ? "?mode=teknisk" : "";
            const href = (tab.slug ? `${base}/${tab.slug}` : base) + suffix;
            // Full href includes basePath for correct browser URL display and middle-click
            const fullHref = `/planner${href}`;
            const active = tab.slug
              ? pathname === `${base}/${tab.slug}` || pathname.startsWith(`${base}/${tab.slug}/`)
              : pathname === base;
            return (
              <a key={tab.slug} href={fullHref} data-tab-href={fullHref}
                className={`px-3 lg:px-4 py-2 lg:py-2.5 text-xs lg:text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  active ? "border-[#0F2A5A] text-[#0F2A5A]" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}>
                {t(tab.nokkel)}
              </a>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
