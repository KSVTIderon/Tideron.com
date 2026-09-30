/**
 * POST /api/odoo/prosjekter
 *
 * Synkroniserer et Tideron-prosjekt til Odoo CRM som en Opportunity.
 * Kalles fra:
 *   - innstillinger/page.tsx etter lagring av prosjektdata
 *   - InvestorView.tsx etter at finansielle KPI-er er beregnet
 *
 * Body (alle felt valgfrie unntatt supabaseId + navn):
 *   supabaseId, navn, sted, stadie, lat, lon,
 *   streamType, avgVelocity,
 *   installedKw, annualKwh, irr, npv, lcoe, capexNok,
 *   paybackYr, co2TonnYr, ppaKrKwh, antallRotorer
 */

import { NextRequest, NextResponse } from "next/server";
import { syncProsjektTilOdoo } from "@/lib/odoo";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { supabaseId, navn } = body;

    if (!supabaseId || !navn) {
      return NextResponse.json({ error: "supabaseId og navn er påkrevd" }, { status: 400 });
    }

    const odooId = await syncProsjektTilOdoo({
      supabaseId,
      navn,
      sted:          body.sted          ?? undefined,
      stadie:        body.stadie        ?? undefined,
      lat:           body.lat           ?? null,
      lon:           body.lon           ?? null,
      streamType:    body.streamType    ?? undefined,
      avgVelocity:   body.avgVelocity   ?? undefined,
      installedKw:   body.installedKw   ?? undefined,
      annualKwh:     body.annualKwh     ?? undefined,
      irr:           body.irr           ?? undefined,
      npv:           body.npv           ?? undefined,
      lcoe:          body.lcoe          ?? undefined,
      capexNok:      body.capexNok      ?? undefined,
      paybackYr:     body.paybackYr     ?? undefined,
      co2TonnYr:     body.co2TonnYr     ?? undefined,
      ppaKrKwh:      body.ppaKrKwh      ?? undefined,
      antallRotorer: body.antallRotorer ?? undefined,
    });

    if (odooId == null) {
      return NextResponse.json({ error: "Odoo sync feilet (sjekk env-variabler)" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, odooId });
  } catch (err: any) {
    console.error("POST /api/odoo/prosjekter:", err);
    return NextResponse.json({ error: err.message ?? "Ukjent feil" }, { status: 500 });
  }
}
