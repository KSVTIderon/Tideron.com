import { NextRequest, NextResponse } from "next/server";

// Henter toppsoltimer fra EU JRC PVGIS (gratis, ingen API-nøkkel)
// E_y = kWh/år for 1 kWp installert ≈ toppsoltimer per år
// https://re.jrc.ec.europa.eu/pvg_tools/en/

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat    = searchParams.get("lat");
  const lon    = searchParams.get("lon");
  const angle  = searchParams.get("angle")  ?? "35";   // tiltvinkel (grader)
  const aspect = searchParams.get("aspect") ?? "0";    // 0 = sør, 90 = vest

  if (!lat || !lon) {
    return NextResponse.json({ error: "lat og lon er påkrevd" }, { status: 400 });
  }

  try {
    const url =
      `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc` +
      `?lat=${lat}&lon=${lon}` +
      `&peakpower=1&loss=14` +
      `&angle=${angle}&aspect=${aspect}` +
      `&outputformat=json`;

    const res = await fetch(url, {
      next: { revalidate: 86400 }, // cache 24 timer
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`PVGIS svarte ${res.status}: ${txt.slice(0, 200)}`);
    }

    const data = await res.json();
    const fixed = data?.outputs?.totals?.fixed;
    if (!fixed?.E_y) throw new Error("Ingen produksjonsdata i PVGIS-svar");

    // E_y (kWh/år per kWp, med 14% systemtap) → toppsoltimer uten tap
    const peakSunHours = Math.round(fixed.E_y / (1 - 0.14));
    const E_y_brutto   = Math.round(fixed.E_y); // med 14% tap

    // Månedlige tall for fremtidig bruk
    const monthly: { month: number; kwhPerKwp: number }[] =
      (data?.outputs?.monthly?.fixed ?? []).map((m: any, i: number) => ({
        month: i + 1,
        kwhPerKwp: Math.round(m.E_m ?? 0),
      }));

    return NextResponse.json({
      peak_sun_hours: peakSunHours,  // toppsoltimer (uten systemtap)
      E_y_netto: E_y_brutto,         // kWh/år per kWp (med 14% tap)
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      angle: parseFloat(angle),
      aspect: parseFloat(aspect),
      monthly,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Ukjent feil" }, { status: 502 });
  }
}
