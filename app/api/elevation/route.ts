import { NextRequest, NextResponse } from "next/server";

/**
 * Henter høydedata:
 *  1. Kartverket GeoNorge DTM10  (10m LiDAR, kun Norge — lat 57-72, lon 3-32)
 *  2. OpenTopoData SRTM30m       (global fallback, 30m oppløsning)
 */

function erNorge(lat: number, lon: number): boolean {
  return lat >= 57 && lat <= 72 && lon >= 3 && lon <= 32;
}

async function fraGeoNorge(lat: number, lon: number): Promise<number | null> {
  const url = `https://ws.geonorge.no/hoydedata/v1/punkt?nord=${lat}&ost=${lon}&koordsys=4326&geojsonCoords=false`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  const data = await res.json();
  const z = data?.punkter?.[0]?.z;
  return typeof z === "number" ? z : null;
}

async function fraSrtm30m(lat: number, lon: number): Promise<number | null> {
  const url = `https://api.opentopodata.org/v1/srtm30m?locations=${lat},${lon}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  const data = await res.json();
  const elev = data?.results?.[0]?.elevation;
  return typeof elev === "number" ? elev : null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: "lat og lon kreves" }, { status: 400 });
  }

  try {
    let elev: number | null = null;
    let kilde = "ukjent";

    if (erNorge(lat, lon)) {
      elev = await fraGeoNorge(lat, lon);
      if (elev != null) kilde = "GeoNorge DTM10";
    }

    if (elev == null) {
      elev = await fraSrtm30m(lat, lon);
      if (elev != null) kilde = "SRTM30m";
    }

    if (elev == null) throw new Error("Ingen høydedata tilgjengelig");

    return NextResponse.json({ elevation_m: elev, kilde });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Ukjent feil" }, { status: 502 });
  }
}
