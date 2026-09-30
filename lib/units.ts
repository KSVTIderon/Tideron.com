const NB: Intl.LocalesArgument = "nb-NO";

/**
 * Effekt: viser kW under 1500, MW fra 1500, GW fra 1 500 000.
 * Norsk desimalseparator (komma).
 *   fmtKw(800)        → "800 kW"
 *   fmtKw(1550)       → "1,550 MW"
 *   fmtKw(2_000_000)  → "2,000 GW"
 */
export function fmtKw(kw: number): string {
  if (!isFinite(kw) || kw < 0) return "—";
  if (kw === 0) return "0 kW";
  if (kw >= 1_000_000)
    return (kw / 1_000_000).toLocaleString(NB, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " GW";
  if (kw >= 1_000)
    return (kw / 1_000).toLocaleString(NB, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " MW";
  if (kw >= 10)
    return kw.toLocaleString(NB, { maximumFractionDigits: 1 }) + " kW";
  return kw.toLocaleString(NB, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kW";
}

/**
 * Energi: kWh → MWh → GWh → TWh, med passende presisjon per nivå.
 *   fmtKwh(500)               → "500 kWh"
 *   fmtKwh(12_000)            → "12 MWh"
 *   fmtKwh(1_600_000)         → "1 600 MWh"
 *   fmtKwh(5_000_000_000)     → "5 000 GWh"
 *   fmtKwh(2_000_000_000_000) → "2,0 TWh"
 */
export function fmtKwh(kwh: number): string {
  if (!isFinite(kwh) || kwh < 0) return "—";
  if (kwh === 0) return "0 kWh";
  if (kwh >= 1_000_000_000)
    return (kwh / 1_000_000_000).toLocaleString(NB, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " TWh";
  if (kwh >= 1_000_000)
    return (kwh / 1_000_000).toLocaleString(NB, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " GWh";
  if (kwh >= 1_000)
    return Math.round(kwh / 1_000).toLocaleString(NB) + " MWh";
  return Math.round(kwh).toLocaleString(NB) + " kWh";
}

/**
 * Penger: viser kr under 1 million, MNOK fra 1 million, mrd fra 1 milliard.
 * currencySymbol valgfritt — brukes for utenlandsk valuta i stedet for "kr".
 *   fmtKr(450_000)        → "450 000 kr"
 *   fmtKr(1_550_000)      → "1,55 MNOK"
 *   fmtKr(2_000_000_000)  → "2,00 mrd"
 *   fmtKr(1550000, "USD") → "1,55 MUSD"
 */
export function fmtKr(value: number, currencyCode = "NOK"): string {
  if (!isFinite(value)) return "—";
  const sym = currencyCode === "NOK" ? "kr" : currencyCode;
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000_000)
    return sign + (abs / 1_000_000_000).toLocaleString(NB, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " mrd";
  if (abs >= 1_000_000)
    return sign + (abs / 1_000_000).toLocaleString(NB, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " M" + sym;
  return sign + Math.round(abs).toLocaleString(NB) + " " + sym;
}

/** 1 m² i fot² (nøyaktig: 1 / 0.3048²) */
export const FT2_PER_M2 = 10.76391;

/**
 * Areal: viser m² med fot² i parentes.
 *   fmtArealM2Ft2(4)     → "4,00 m² (43,1 ft²)"
 *   fmtArealM2Ft2(0.797) → "0,80 m² (8,6 ft²)"
 */
export function fmtArealM2Ft2(m2: number): string {
  if (!isFinite(m2) || m2 < 0) return "—";
  const ft2 = m2 * FT2_PER_M2;
  const m2Str = m2.toLocaleString(NB, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ft2Str = ft2.toLocaleString(NB, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${m2Str} m² (${ft2Str} ft²)`;
}
