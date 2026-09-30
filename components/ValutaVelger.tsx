"use client";
import { LAND } from "@/lib/land";

// Unike valutaer fra LAND-listen, sortert på kode
const VALUTAER = Array.from(
  new Map(LAND.map(l => [l.currency_code, { code: l.currency_code, symbol: l.currency_symbol }])).values()
).sort((a, b) => a.code.localeCompare(b.code));

interface Props {
  value: string;
  onChange: (code: string) => void;
  className?: string;
}

export default function ValutaVelger({ value, onChange, className }: Props) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 ${className ?? ""}`}
    >
      {VALUTAER.map(v => (
        <option key={v.code} value={v.code}>
          {v.code} ({v.symbol})
        </option>
      ))}
    </select>
  );
}
