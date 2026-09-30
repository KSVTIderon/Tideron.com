/**
 * POST /api/geodata
 * Body: { lat: number, lon: number, radius_m?: number }
 *
 * Henter all offentlig geodata rundt et punkt (rotor-koordinat):
 *  - NVE vassdrag: vassdragsnr, elvenavn, hydrologi
 *  - Naturbase: naturtyper, truete arter, verneområder
 *  - Askeladden: kulturminner
 *  - GeoNorge/NVE: offentlige planer, vernede vassdrag
 *
 * Alle kall gjøres parallelt. Enkeltfeil stopper ikke de andre.
 */

import { NextRequest, NextResponse } from "next/server";
import { hentNveVassdragData } from "@/lib/geodata/nve";
import { hentNaturmangfold } from "@/lib/geodata/naturmangfold";
import { hentKulturminner } from "@/lib/geodata/kulturminner";
import { hentPlanData } from "@/lib/geodata/plandata";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { lat, lon, radius_m = 500 } = body as {
    lat: number;
    lon: number;
    radius_m?: number;
  };

  if (!lat || !lon) {
    return NextResponse.json({ error: "Mangler lat/lon" }, { status: 400 });
  }

  // Kjør alle oppslag parallelt – ingen enkeltfeil stopper de andre
  const [nve, naturmangfold, kulturminner, plandata] = await Promise.allSettled([
    hentNveVassdragData(lat, lon),
    hentNaturmangfold(lat, lon, radius_m),
    hentKulturminner(lat, lon),
    hentPlanData(lat, lon),
  ]);

  return NextResponse.json({
    koordinat: { lat, lon },
    nve: nve.status === "fulfilled" ? nve.value : { feil: String(nve.reason) },
    naturmangfold:
      naturmangfold.status === "fulfilled"
        ? naturmangfold.value
        : { oppsummering: "", feil: String(naturmangfold.reason) },
    kulturminner:
      kulturminner.status === "fulfilled"
        ? kulturminner.value
        : { kulturminner: [], oppsummering: "", feil: String(kulturminner.reason) },
    plandata:
      plandata.status === "fulfilled"
        ? plandata.value
        : { oppsummering: "", feil: String(plandata.reason) },
  });
}
