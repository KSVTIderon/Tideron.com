import { NextRequest, NextResponse } from "next/server";
import { CP_WATEROTOR, RHO_SJOVANN } from "@/lib/finans";

/**
 * Beregner årlig energi (kWh) fra en effektkurve med rated-power-tak.
 *
 * Metode:
 *  1. Henter Kartverkets vannstandsprediksjon for prosjektkoordinatene (åpen API, ingen nøkkel).
 *  2. Deriverer tidevannsstrøm: v(t) ∝ |dh/dt| — strømmen er 90° foran vannstanden.
 *  3. Skalerer til kjent snitthastiget: v_max = v_avg × π/2 (fra sinusoidalt gjennomsnitt).
 *  4. Bruker effektkurven: P(t) = min(P_rated, ½ρCpA·v³) for hvert tidsskritt.
 *  5. Summerer: E = ΣP·Δt → kWh/år, kapasitetsfaktor, fulllasttimer.
 *
 * Fallback: syntetisk halvdaglig modell (T = 12,42 t) hvis Kartverket ikke svarer.
 */

interface RotorInput {
  areal_m2: number;   // sweept areal (m²)
  rated_kw: number;   // installert ytelse / generatorgrense (kW)
}

function powerCurveKwhAr(
  velocities: number[],
  dt_h: number,
  rotorer: RotorInput[],
  cp: number,
  rho: number,
): { annual_kwh: number; capacity_factor: number; load_hours: number } {
  const totalRatedKw = rotorer.reduce((s, r) => s + r.rated_kw, 0);
  if (totalRatedKw <= 0 || rotorer.length === 0) {
    return { annual_kwh: 0, capacity_factor: 0, load_hours: 0 };
  }

  let sumKwh = 0;
  for (const v of velocities) {
    // Summer per-rotor — hvert rotor har sitt eget tak
    let pTot = 0;
    for (const r of rotorer) {
      if (r.areal_m2 <= 0 || r.rated_kw <= 0) continue;
      const pFysisk = (0.5 * rho * cp * r.areal_m2 * Math.pow(v, 3)) / 1000;
      pTot += Math.min(r.rated_kw, pFysisk);
    }
    sumKwh += pTot * dt_h;
  }

  const actualHours = velocities.length * dt_h;
  const annual_kwh  = actualHours > 0 ? sumKwh * (8760 / actualHours) : sumKwh;
  const capacity_factor = annual_kwh / (totalRatedKw * 8760);
  const load_hours      = totalRatedKw > 0 ? annual_kwh / totalRatedKw : 0;

  return { annual_kwh, capacity_factor, load_hours };
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const lat    = parseFloat(sp.get("lat")    ?? "0");
  const lon    = parseFloat(sp.get("lon")    ?? "0");
  const v_avg  = parseFloat(sp.get("v_avg")  ?? "1.5");
  const cp     = parseFloat(sp.get("cp")     ?? String(CP_WATEROTOR));
  const rho    = parseFloat(sp.get("rho")    ?? String(RHO_SJOVANN));

  // Per-rotor data: JSON-encoded array [{areal_m2, rated_kw}, ...]
  let rotorer: RotorInput[] = [];
  try {
    rotorer = JSON.parse(sp.get("rotorer") ?? "[]");
  } catch { /* ignorer */ }

  if (rotorer.length === 0) {
    return NextResponse.json({ error: "Ingen rotorer" }, { status: 400 });
  }

  const v_max = v_avg * (Math.PI / 2); // sinusoidalt gjennomsnitt: mean(|cos|) = 2/π → v_max = v_avg × π/2

  // ── Forsøk 1: Kartverket vannstandsprediksjon ─────────────────────────────
  if (lat !== 0 && lon !== 0) {
    try {
      const year = new Date().getFullYear();
      const url  = `https://vannstand.kartverket.no/tideapi.php` +
        `?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}` +
        `&fromtime=${year}-01-01T00:00&totime=${year}-12-31T23:00` +
        `&datatype=pre&refcode=msl&lang=en&interval=60&dst=0&tzone=0`;

      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });

      if (res.ok) {
        const xml = await res.text();

        // Parser: <waterlevel ... value="NN.N" ... />
        const re: RegExp = /<waterlevel[^>]*value="([-\d.]+)"/g;
        const matches: RegExpExecArray[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(xml)) !== null) matches.push(m);

        if (matches.length > 100) {
          const heights = matches.map(m => parseFloat(m[1])); // cm over/under MSL

          // Numerisk derivasjon: dh/dt = (h[i+1] - h[i]) / 1h (fremover-differanse)
          const dhdt: number[] = [];
          for (let i = 0; i < heights.length - 1; i++) {
            dhdt.push(Math.abs(heights[i + 1] - heights[i]));
          }
          dhdt.push(dhdt[dhdt.length - 1]); // pad siste punkt

          const dhdt_max = Math.max(...dhdt);
          const velocities = dhdt_max > 0
            ? dhdt.map(d => v_max * d / dhdt_max)
            : dhdt.map(() => v_avg);

          const result = powerCurveKwhAr(velocities, 1, rotorer, cp, rho);
          return NextResponse.json({ ...result, metode: "kartverket", datapunkter: velocities.length });
        }
      }
    } catch {
      /* fall through */
    }
  }

  // ── Forsøk 2: Syntetisk halvdaglig modell (T = 12,42 t) ──────────────────
  const T_h = 12.42;
  const velocities: number[] = [];
  for (let t = 0; t < 8760; t++) {
    // Strøm er 90° foran vannstand → |cos|-profil naturlig
    velocities.push(v_max * Math.abs(Math.cos(2 * Math.PI * t / T_h)));
  }

  const result = powerCurveKwhAr(velocities, 1, rotorer, cp, rho);
  return NextResponse.json({ ...result, metode: "syntetisk", datapunkter: 8760 });
}
