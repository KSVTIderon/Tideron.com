"use client";
import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface LandRad {
  code: string;
  name: string;
  currency_code: string;
  flag: string;
}

interface Props {
  value: string;
  onChange: (code: string) => void;
  className?: string;
}

export default function LandVelger({ value, onChange, className = "" }: Props) {
  const [land, setLand]         = useState<LandRad[]>([]);
  const [søk, setSøk]           = useState("");
  const [åpen, setÅpen]         = useState(false);
  const [laster, setLaster]     = useState(true);
  const containerRef             = useRef<HTMLDivElement>(null);
  const inputRef                 = useRef<HTMLInputElement>(null);

  // Hent alle land fra Supabase ved mount
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("countries")
      .select("code, name, currency_code, flag")
      .order("name")
      .then(({ data }) => {
        setLand(data ?? []);
        setLaster(false);
      });
  }, []);

  const valgt = land.find(l => l.code === value);
  const filtrert = søk.trim()
    ? land.filter(l =>
        l.name.toLowerCase().includes(søk.toLowerCase()) ||
        l.code.toLowerCase().includes(søk.toLowerCase())
      )
    : land;

  // Lukk ved klikk utenfor
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setÅpen(false);
        setSøk("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const velg = (code: string) => {
    onChange(code);
    setÅpen(false);
    setSøk("");
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => {
          setÅpen(o => !o);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="w-full flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 text-left"
      >
        <span>
          {laster
            ? "Laster land…"
            : valgt
              ? `${valgt.flag} ${valgt.name} (${valgt.currency_code})`
              : "Velg land…"}
        </span>
        <svg className="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Dropdown */}
      {åpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg flex flex-col" style={{ maxHeight: 280 }}>
          {/* Søkefelt */}
          <div className="p-2 border-b border-slate-100">
            <input
              ref={inputRef}
              type="text"
              value={søk}
              onChange={e => setSøk(e.target.value)}
              placeholder="Søk land…"
              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
            />
          </div>
          {/* Liste */}
          <div className="overflow-y-auto">
            {filtrert.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-400">Ingen treff</p>
            ) : (
              filtrert.map(l => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => velg(l.code)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 ${l.code === value ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700"}`}
                >
                  <span className="text-base leading-none">{l.flag}</span>
                  <span>{l.name}</span>
                  <span className="ml-auto text-xs text-slate-400">{l.currency_code}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
