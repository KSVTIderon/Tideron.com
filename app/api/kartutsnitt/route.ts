/**
 * POST /api/kartutsnitt
 *
 * Genererer et statisk kartutsnitt rundt rotor-koordinater.
 * Bruker Kartverket (Statkart) topo4-WMS — gratis for norske prosjekter.
 *
 * Body: { rotorer: Array<{ lat: number; lon: number }>, bredde?: number, hoyde?: number }
 * Returnerer: { base64: string; bbox: { nord: number; sor: number; ost: number; vest: number } }
 */

import { NextRequest, NextResponse } from "next/server";

const WMS_URL = "https://openwms.statkart.no/skwms1/wms.topo4";
const KART_BREDDE = 1200;
const KART_HOYDE  = 800;
const TIMEOUT     = 15_000;

function beregnBbox(
  rotorer: Array<{ lat: number; lon: number }>,
  marginFaktor = 0.3,
) {
  if (rotorer.length === 0) return null;

  const lats = rotorer.map(r => r.lat);
  const lons = rotorer.map(r => r.lon);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // Minimum spenn slik at enkelt-punkt ikke gir et kollapset bbox
  const latSpenn = Math.max(maxLat - minLat, 0.005);
  const lonSpenn = Math.max(maxLon - minLon, 0.008);

  const latMarg = latSpenn * marginFaktor;
  const lonMarg = lonSpenn * marginFaktor;

  return {
    sor:  minLat - latMarg,
    nord: maxLat + latMarg,
    vest: minLon - lonMarg,
    ost:  maxLon + lonMarg,
  };
}

export async function POST(req: NextRequest) {
  const { rotorer } = await req.json() as {
    rotorer: Array<{ lat: number; lon: number }>;
  };

  const plasserte = rotorer.filter(r => r.lat != null && r.lon != null);
  if (plasserte.length === 0) {
    return NextResponse.json({ error: "Ingen rotorer med koordinater" }, { status: 400 });
  }

  const bbox = beregnBbox(plasserte);
  if (!bbox) return NextResponse.json({ error: "Kan ikke beregne bbox" }, { status: 400 });

  // WMS 1.3.0: EPSG:4326 = latMin,lonMin,latMax,lonMax (lat-lon-rekkefølge)
  const bboxStr = `${bbox.sor},${bbox.vest},${bbox.nord},${bbox.ost}`;

  const params = new URLSearchParams({
    SERVICE:     "WMS",
    VERSION:     "1.3.0",
    REQUEST:     "GetMap",
    LAYERS:      "topo4",
    STYLES:      "",
    CRS:         "EPSG:4326",
    BBOX:        bboxStr,
    WIDTH:       String(KART_BREDDE),
    HEIGHT:      String(KART_HOYDE),
    FORMAT:      "image/png",
    TRANSPARENT: "false",
  });

  const wmsUrl = `${WMS_URL}?${params}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(wmsUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`WMS svarte ${res.status}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      // WMS returnerte feil-XML — prøv fallback med OSM
      throw new Error("WMS returnerte ikke bilde");
    }

    const buf    = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");

    return NextResponse.json({
      base64,
      mimeType: "image/png",
      bbox,
      bredde: KART_BREDDE,
      hoyde:  KART_HOYDE,
    });

  } catch (e) {
    clearTimeout(timer);
    console.warn("Kartverket WMS feil, prøver OpenStreetMap fallback:", e);

    // Fallback: OpenStreetMap statisk via terrestris WMS
    const fallbackParams = new URLSearchParams({
      SERVICE: "WMS",
      VERSION: "1.1.1",
      REQUEST: "GetMap",
      LAYERS:  "OSM-WMS",
      STYLES:  "",
      SRS:     "EPSG:4326",
      BBOX:    `${bbox.vest},${bbox.sor},${bbox.ost},${bbox.nord}`,
      WIDTH:   String(KART_BREDDE),
      HEIGHT:  String(KART_HOYDE),
      FORMAT:  "image/png",
    });

    try {
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), TIMEOUT);
      const res2 = await fetch(
        `https://ows.terrestris.de/osm/service?${fallbackParams}`,
        { signal: controller2.signal },
      );
      clearTimeout(timer2);

      if (!res2.ok || !(res2.headers.get("content-type") ?? "").startsWith("image/")) {
        throw new Error("Fallback feilet");
      }

      const buf2    = await res2.arrayBuffer();
      const base64b = Buffer.from(buf2).toString("base64");

      return NextResponse.json({
        base64: base64b,
        mimeType: "image/png",
        bbox,
        bredde: KART_BREDDE,
        hoyde:  KART_HOYDE,
        kilde: "osm-fallback",
      });
    } catch {
      return NextResponse.json(
        { error: `Kartgenerering feilet: ${(e as Error).message}` },
        { status: 502 },
      );
    }
  }
}
