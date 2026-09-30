"use client";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import { SprakProvider, ValutaProvider } from "@/lib/i18n";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <SprakProvider>
      <ValutaProvider>
        <div className="flex min-h-screen">
          {/* Sidebar — skjult på mobil, synlig på lg+ */}
          <Sidebar
            mobileOpen={mobileMenuOpen}
            onMobileClose={() => setMobileMenuOpen(false)}
          />

          {/* Overlay-bakgrunn på mobil når menyen er åpen */}
          {mobileMenuOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}

          <div className="flex-1 flex flex-col min-w-0">
            {/* Mobil-topbar — bare synlig på < lg */}
            <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white sticky top-0 z-30">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                aria-label="Åpne meny"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <span className="font-bold text-[#0F2A5A] text-lg tracking-widest">TIDERON</span>
            </div>

            <main className="flex-1 p-3 sm:p-4 lg:p-8 overflow-auto">{children}</main>
          </div>
        </div>
      </ValutaProvider>
    </SprakProvider>
  );
}
