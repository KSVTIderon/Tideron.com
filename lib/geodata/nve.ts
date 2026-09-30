/**
 * NVE Geodata-oppslag
 *
 * Bruker NVE's offentlige ArcGIS REST-tjenester (ingen API-nøkkel nødvendig):
 *  - Vassdrag2:    vassdragsnr, elvenavn
 *  - Hydrologisk:  nedbørfelt (km²), middelavrenning (l/s/km²), middelvannføring, lavvannføring
 *
 * Koordinater: WGS84 (lat/lon, EPSG:4326)
 */

const NVE_BASE = "https://nve.geodataonline.no/arcgis/rest/services";
const TIMEOUT = 10_000;

// Felles hjelpefunksjon for ArcGIS "identify" (punkt mot polygonlag)
async function arcgisIdentify(
  serviceUrl: string,
  lat: number,
  lon: number,
  layers = "all",
  tolerance = 5,
): Promise<any[]> {
  const delta = 0.05;
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lon, y: lat }),
    geometryType: "esriGeometryPoint",
    sr: "4326",
    layers,
    tolerance: String(tolerance),
    mapExtent: `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`,
    imageDisplay: "800,600,96",
    returnGeometry: "false",
    f: "json",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(`${serviceUrl}/identify?${params}`, {
      signal: controller.signal,
      headers: { "User-Agent": "TideronApp/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data?.results ?? [];
  } finally {
    clearTimeout(timer);
  }
}

// WFS GetFeature (for Kartverket/GeoNorge)
async function wfsFetch(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export interface NveVassdragData {
  vassdragsnr?: string;
  elvNavn?: string;
  nedborfeltKm2?: number;
  middelavrenningLsKm2?: number; // l/s per km²
  middelvannforingLs?: number;   // l/s
  lavvannforingLs?: number;      // l/s (alminnelig lavvannføring)
  storsteSlukevneLs?: number;    // l/s – ikke relevant for Waterotor (settes til 0)
  feil?: string;
}

export async function hentNveVassdragData(lat: number, lon: number): Promise<NveVassdragData> {
  const resultat: NveVassdragData = {};

  // ── 1. Vassdragsnummer og elvenavn (NVE Vassdrag2) ────────────────────────
  try {
    const vassdragFeatures = await arcgisIdentify(
      `${NVE_BASE}/Nve_Vassdrag2/MapServer`,
      lat, lon,
      "all", 3,
    );

    // Finn det innerste (mest detaljerte) vassdragsomåde-laget
    const vassdragLag = vassdragFeatures.find(f =>
      f.attributes?.VassdragsNr || f.attributes?.vassdragsnr || f.attributes?.VASSDRAGSNR,
    );

    if (vassdragLag) {
      const a = vassdragLag.attributes;
      resultat.vassdragsnr =
        a.VassdragsNr ?? a.vassdragsnr ?? a.VASSDRAGSNR ?? undefined;
      resultat.elvNavn =
        a.VassdragsNavn ?? a.vassdragsnavn ?? a.Navn ?? a.navn ?? undefined;
    }
  } catch (e) {
    console.warn("NVE Vassdrag2 feil:", e);
    resultat.feil = `Vassdrag: ${(e as Error).message}`;
  }

  // ── 2. Hydrologisk statistikk (NVE Hydrologisk – REGINE-nedbørfelt) ───────
  try {
    const hydroFeatures = await arcgisIdentify(
      `${NVE_BASE}/Nve_Hydrologisk/MapServer`,
      lat, lon,
      "all", 5,
    );

    // Finn REGINE-feltet som inneholder punktet
    const regine = hydroFeatures.find(f => {
      const a = f.attributes ?? {};
      return (
        a.AREAL_KM2 || a.areal_km2 || a.NedborfeltAreal ||
        a.MIDDELAVRENNING || a.Middelavrenning
      );
    });

    if (regine) {
      const a = regine.attributes;

      const areal = parseFloat(
        a.AREAL_KM2 ?? a.areal_km2 ?? a.NedborfeltAreal ?? a.AREA_KM2 ?? "0",
      );
      if (areal > 0) resultat.nedborfeltKm2 = Math.round(areal * 10) / 10;

      // Middelavrenning (l/s per km²) – typisk 20–80 l/s/km² i Norge
      const avr = parseFloat(
        a.MIDDELAVRENNING ?? a.Middelavrenning ?? a.middelavrenning ?? "0",
      );
      if (avr > 0) resultat.middelavrenningLsKm2 = Math.round(avr * 10) / 10;

      // Beregn middelvannføring fra areal × avrenning
      if (areal > 0 && avr > 0) {
        resultat.middelvannforingLs = Math.round(areal * avr);
      } else if (a.MIDDELVANNFORING || a.Middelvannforing) {
        resultat.middelvannforingLs = Math.round(
          parseFloat(a.MIDDELVANNFORING ?? a.Middelvannforing),
        );
      }

      // Alminnelig lavvannføring ≈ 10–15 % av middelvannføring (empirisk tommelregel)
      if (a.LAVVANNFORING ?? a.Lavvannforing) {
        resultat.lavvannforingLs = Math.round(
          parseFloat(a.LAVVANNFORING ?? a.Lavvannforing),
        );
      } else if (resultat.middelvannforingLs) {
        resultat.lavvannforingLs = Math.round(resultat.middelvannforingLs * 0.12);
      }
    }
  } catch (e) {
    console.warn("NVE Hydrologisk feil:", e);
  }

  // Waterotor tar ikke vann ut – slukeevne settes til 0 (oppgis som N/A i skjema)
  resultat.storsteSlukevneLs = 0;

  return resultat;
}
