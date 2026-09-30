/** Beregner IRR via Newton-Raphson */
export function beregnIRR(cashflows: number[], gjett = 0.1): number {
  let r = gjett;
  for (let i = 0; i < 1000; i++) {
    const f = cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
    const df = cashflows.reduce((s, cf, t) => s - (t * cf) / Math.pow(1 + r, t + 1), 0);
    if (Math.abs(df) < 1e-10) break;
    const r2 = r - f / df;
    if (Math.abs(r2 - r) < 1e-8) { r = r2; break; }
    r = r2;
  }
  return r;
}

/** NPV */
export function beregnNPV(rente: number, cashflows: number[]): number {
  return cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + rente, t), 0);
}

/** LCOE */
export function beregnLCOE(
  capex: number,
  arligOpex: number,
  arligKwh: number,
  levetid: number,
  diskonteringsrente: number
): number {
  let kostnaderNPV = capex;
  let produksjonNPV = 0;
  for (let t = 1; t <= levetid; t++) {
    kostnaderNPV += arligOpex / Math.pow(1 + diskonteringsrente, t);
    produksjonNPV += arligKwh / Math.pow(1 + diskonteringsrente, t);
  }
  return produksjonNPV > 0 ? kostnaderNPV / produksjonNPV : 0;
}

// Vanntettheter
export const RHO_FERSKVANN = 1000; // kg/m³ — elver og innsjøer
export const RHO_SJOVANN   = 1025; // kg/m³ — sjøvann / tidevann
export const CP_WATEROTOR  = 0.42; // Empirisk Cp (Fred Ferguson)
export const BETZ_GRENSE   = 0.593; // Betz' lov — maks teoretisk uttak

/** Effekt fra stroemhastighet og rotordiameter (sirkulaer flate, Cp=0.42 — Freds empiriske regel) */
export function beregnEffektKw(avgVelocity: number, rotorDiameter: number, rho = RHO_SJOVANN): number {
  const Cp  = CP_WATEROTOR;
  const A   = Math.PI * Math.pow(rotorDiameter / 2, 2);
  return (0.5 * rho * Cp * A * Math.pow(avgVelocity, 3)) / 1000;
}

/** Effekt fra stroemhastighet og rektangulaer flate (lengde x hoyde, Cp=0.42 — Freds empiriske regel) */
export function beregnEffektKwFlateareal(avgVelocity: number, areal_m2: number, rho = RHO_SJOVANN): number {
  const Cp  = CP_WATEROTOR;
  return (0.5 * rho * Cp * areal_m2 * Math.pow(avgVelocity, 3)) / 1000;
}

/** Effekt ved nominell hastighet 1.8 m/s fra areal (Fred Ferguson-regelen: 0.8 m2 = 1 kW, Cp=0.42) */
export function nominalKwFraAreal(areal_m2: number, rho = RHO_SJOVANN): number {
  return beregnEffektKwFlateareal(1.8, areal_m2, rho);
}

/** Areal fra nominell kW ved 1.8 m/s (invers, Cp=0.42) */
export function arealFraNominalKw(kw: number, rho = RHO_SJOVANN): number {
  const Cp = CP_WATEROTOR, v = 1.8;
  return (kw * 1000) / (0.5 * rho * Cp * Math.pow(v, 3));
}

/** Total kinetisk effektflux gjennom elvens fulle tverrsnitt (det fysiske taket — P_maks) */
export function totalKinetiskEffektKw(rho: number, elvAreal_m2: number, v: number): number {
  return (0.5 * rho * elvAreal_m2 * Math.pow(v, 3)) / 1000;
}

/** Betz-begrenset maks uttak fra elven */
export function betzMaksEffektKw(rho: number, elvAreal_m2: number, v: number): number {
  return totalKinetiskEffektKw(rho, elvAreal_m2, v) * BETZ_GRENSE;
}

/**
 * Reelt ekstraherbart fra rotorer med blokkeringsbegrensning.
 * P_ekstrahert = 0.5 × ρ × Cp × min(ΣA_rotor, blokkering% × A_elv) × v³
 */
export function beregnEkstraherbarEffektKw(
  rho: number,
  cp: number,
  rotorAreal_m2: number,
  elvAreal_m2: number,
  blokkering_pst: number,
  v: number
): number {
  const blokkeringsAreal = (blokkering_pst / 100) * elvAreal_m2;
  const effektivtAreal   = Math.min(rotorAreal_m2, blokkeringsAreal);
  return (0.5 * rho * cp * effektivtAreal * Math.pow(v, 3)) / 1000;
}

/** ρ basert på vanntype-streng (brukes på "projects" og "streams") */
export function rhoFraVanntype(vannType?: string | null): number {
  return (vannType === "sjovann" || vannType === "sjøvann") ? RHO_SJOVANN : RHO_FERSKVANN;
}

/** Nominell kW fra modellnavn, f.eks. "Waterotor 100 kW" → 100, "Waterotor 1 MW" → 1000 */
export function kwFraModellnavn(modell: string): number {
  const m = modell?.match(/(\d+(?:\.\d+)?)\s*(kW|MW)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === "mw" ? n * 1000 : n;
}

/**
 * Summerer installert effekt (kW) for en liste rotorer — FELLES implementasjon.
 * Bruk denne i stedet for å kopiere reduce()-logikken lokalt i hver side
 * (det var nettopp slik ρ=sjøvann-defaulten og manglende fysisk tak sneik seg
 * inn på flere steder samtidig — se sjekkFysiskTak).
 */
export function summerRotorEffektKw(rotorer: any[], avgV: number, rho = RHO_SJOVANN): number {
  return rotorer.reduce((sum: number, r: any) => {
    const v = (r.hastighet_m_s && Number(r.hastighet_m_s) > 0) ? Number(r.hastighet_m_s) : avgV;
    if (v > 0) {
      // Custom dimensjoner overstyrer modellnavn — sjekkes FØR kwFraModellnavn slik at
      // en rotor der lengde/høyde er manuelt endret ikke "låses" til modellnavnets kW.
      if (r.nominell_kw_1_8) return sum + r.nominell_kw_1_8 * Math.pow(v / 1.8, 3);
      if (r.lengde_m && r.hoyde_m) return sum + beregnEffektKwFlateareal(v, r.lengde_m * r.hoyde_m, rho);
      const nomKw = kwFraModellnavn(r.modell);
      if (nomKw > 0) return sum + nomKw * Math.pow(v / 1.8, 3);
      if (r.diameter_m) return sum + beregnEffektKw(v, r.diameter_m, rho);
    }
    if (r.nominell_kw_1_8) return sum + r.nominell_kw_1_8;
    if (r.lengde_m && r.hoyde_m) return sum + nominalKwFraAreal(r.lengde_m * r.hoyde_m, rho);
    const nomKw = kwFraModellnavn(r.modell);
    if (nomKw > 0) return sum + nomKw;
    return sum;
  }, 0);
}

/** Summerer rotor-frontareal (m²) — brukes til blokkeringssjekk mot elvetverrsnittet */
export function summerRotorArealM2(rotorer: any[]): number {
  return rotorer.reduce((s: number, r: any) => {
    if (r.lengde_m && r.hoyde_m) return s + r.lengde_m * r.hoyde_m;
    if (r.diameter_m) return s + Math.PI * (r.diameter_m / 2) ** 2;
    if (r.bredde_m && r.dybde_m) return s + Math.sqrt((r.bredde_m / 2) ** 2 + r.dybde_m ** 2) * 2; // V-rotor
    return s;
  }, 0);
}

export interface FysiskTakResultat {
  pMaksKw: number;          // teoretisk fysisk tak — hele elvas kinetiske effektflux (Cp=1)
  pBetzKw: number;          // Betz-begrenset maks (0.593 × pMaks) — umulig å overstige uansett rotorantall
  pEkstraherbarKw: number;  // realistisk uttak: begrenset av Cp og blokkeringsgrad
  overBetz: boolean;        // installert effekt overstiger det fysisk umulige — sikker feil i input
  overBlokkering: boolean;  // installert effekt overstiger realistisk uttak for valgt blokkeringsgrad
}

/**
 * Sjekker installert rotoreffekt mot fysisk mulig uttak fra elva.
 * Returnerer null hvis elvetverrsnitt (bredde × dybde) eller hastighet mangler —
 * kan ikke sjekkes uten disse, og det skal IKKE tolkes som "ingen feil".
 */
export function sjekkFysiskTak(
  installertKw: number,
  rho: number,
  elvBredde_m: number | null | undefined,
  elvDybde_m: number | null | undefined,
  v: number,
  rotorAreal_m2: number,
  blokkering_pst = 20
): FysiskTakResultat | null {
  const bredde = elvBredde_m ?? 0;
  const dybde  = elvDybde_m ?? 0;
  if (bredde <= 0 || dybde <= 0 || v <= 0) return null;
  const elvAreal        = bredde * dybde;
  const pMaksKw          = totalKinetiskEffektKw(rho, elvAreal, v);
  const pBetzKw          = pMaksKw * BETZ_GRENSE;
  const pEkstraherbarKw  = beregnEkstraherbarEffektKw(rho, CP_WATEROTOR, rotorAreal_m2, elvAreal, blokkering_pst, v);
  return {
    pMaksKw, pBetzKw, pEkstraherbarKw,
    overBetz:       installertKw > pBetzKw,
    overBlokkering: installertKw > pEkstraherbarKw,
  };
}

/** Arlig kWh basert pa stroemtype */
export function beregnArligKwh(effektKw: number, streamType: string): number {
  // tidevann: 2 sykluser/dag, 6h strom per syklus, faktor 0.637 (RMS)
  // elv / havstrøm: 70% tilgjengelighet
  const driftstimer =
    streamType === "tidevann" ? 6 * 2 * 0.637 * 365 :
    8760 * 0.7;
  return effektKw * driftstimer;
}

/** CAPEX landgangscontainer: basispris x 2^floor((n-1)/4) */
export function beregnContainerCapex(antallRotorer: number, basispris = 80000): number {
  return basispris * Math.pow(2, Math.floor((antallRotorer - 1) / 4));
}

/** Etter-skatt kontantstrom per ar (linear avskrivning) */
export function beregnEtterSkattCashflows(
  capex: number,
  arligOverskudd: number,
  levetid: number,
  skattesats: number
): number[] {
  const arligAvskrivning = capex / levetid;
  const cashflows: number[] = [-capex];
  for (let t = 1; t <= levetid; t++) {
    const skattepliktigInntekt = arligOverskudd - arligAvskrivning;
    const skatt = Math.max(0, skattepliktigInntekt * skattesats);
    cashflows.push(arligOverskudd - skatt);
  }
  return cashflows;
}

/** Konverter NOK til annen valuta */
export function konverterValuta(belop: number, kurs: number): number {
  return belop * kurs;
}
