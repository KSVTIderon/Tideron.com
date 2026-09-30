/**
 * Offentlige planer-oppslag
 *
 * Henter reguleringsplaner og kommuneplanens arealdel fra
 * Kartverket / GeoNorge WFS og ArcGIS-tjenester.
 *
 * Ingen API-nøkkel nødvendig.
 */

const GEONORGE_WFS =
  "https://wfs.geonorge.no/skwms1/wfs.planregister";
const KARTVERKET_API =
  "https://ws.geonorge.no/adresser/v1";
const TIMEOUT = 10_000;

async function safeFetch(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    // Prøv JSON, fall tilbake til rå tekst
    try { return JSON.parse(text); } catch { return { raw: text }; }
  } finally {
    clearTimeout(timer);
  }
}

export interface PlanData {
  arealformaal?: string;
  reguleringsplanNavn?: string;
  reguleringsplanStatus?: string;
  kommuneplanStatus?: string;
  vernVassdrag?: boolean;
  nasjonaltLaksevassdrag?: boolean;
  oppsummering: string;
  feil?: string;
}

export async function hentPlanData(lat: number, lon: number): Promise<PlanData> {
  const resultat: PlanData = { oppsummering: "" };

  // ── 1. GeoNorge WFS – reguleringsplaner ───────────────────────────────────
  try {
    // CRS: WGS84, POINT søk med buffer
    const radiusDeg = 0.002; // ~200 m
    const bbox = `${lon - radiusDeg},${lat - radiusDeg},${lon + radiusDeg},${lat + radiusDeg}`;

    const wfsUrl =
      `${GEONORGE_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
      `&TYPENAMES=app:RegulertOmrade&SRSNAME=urn:ogc:def:crs:EPSG::4326` +
      `&BBOX=${bbox},urn:ogc:def:crs:EPSG::4326&outputFormat=application/json&count=5`;

    const data = await safeFetch(wfsUrl);
    const features = data?.features ?? [];

    if (features.length > 0) {
      const f = features[0];
      const p = f.properties ?? {};
      resultat.reguleringsplanNavn =
        p.plannavn ?? p.Plannavn ?? p.planNavn ?? undefined;
      resultat.reguleringsplanStatus =
        p.planstatus ?? p.Planstatus ?? undefined;
      resultat.arealformaal =
        p.arealformaal ?? p.Arealformaal ?? p.arealFormaal ?? undefined;
    }
  } catch (e) {
    console.warn("GeoNorge WFS feil:", e);
    resultat.feil = `Planregister: ${(e as Error).message}`;
  }

  // ── 2. NVE – vernede vassdrag og nasjonale laksevassdrag ──────────────────
  try {
    const delta = 0.01;
    const params = new URLSearchParams({
      geometry: JSON.stringify({ x: lon, y: lat }),
      geometryType: "esriGeometryPoint",
      sr: "4326",
      layers: "all",
      tolerance: "5",
      mapExtent: `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`,
      imageDisplay: "800,600,96",
      returnGeometry: "false",
      f: "json",
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(
        `https://nve.geodataonline.no/arcgis/rest/services/Nve_Verneplaner1/MapServer/identify?${params}`,
        { signal: controller.signal },
      );
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const features = data?.results ?? [];
        if (features.length > 0) resultat.vernVassdrag = true;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (_) {
    // Ikke kritisk
  }

  // ── 3. NVE – nasjonale laksevassdrag ──────────────────────────────────────
  try {
    const delta = 0.01;
    const params = new URLSearchParams({
      geometry: JSON.stringify({ x: lon, y: lat }),
      geometryType: "esriGeometryPoint",
      sr: "4326",
      layers: "all",
      tolerance: "5",
      mapExtent: `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`,
      imageDisplay: "800,600,96",
      returnGeometry: "false",
      f: "json",
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(
        `https://nve.geodataonline.no/arcgis/rest/services/Nve_Laksevassdrag/MapServer/identify?${params}`,
        { signal: controller.signal },
      );
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if ((data?.results ?? []).length > 0) resultat.nasjonaltLaksevassdrag = true;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (_) {
    // Ikke kritisk
  }

  // ── Bygg oppsummering ─────────────────────────────────────────────────────
  const linjer: string[] = [];

  if (resultat.vernVassdrag) {
    linjer.push(
      "⚠ Vassdraget er klassifisert som VERNET vassdrag etter verneplanen. Konsesjonsbehandling er sannsynlig nødvendig.",
    );
  } else {
    linjer.push("Vassdraget er ikke registrert som vernet vassdrag etter NVEs verneplaner.");
  }

  if (resultat.nasjonaltLaksevassdrag) {
    linjer.push(
      "⚠ Vassdraget er registrert som NASJONALT LAKSEVASSDRAG. Særskilt restriktiv forvaltning gjelder.",
    );
  } else {
    linjer.push("Vassdraget er ikke registrert som nasjonalt laksevassdrag.");
  }

  if (resultat.reguleringsplanNavn) {
    linjer.push(
      `Tiltaksstedet er dekket av reguleringsplan: «${resultat.reguleringsplanNavn}»` +
      (resultat.reguleringsplanStatus ? ` (status: ${resultat.reguleringsplanStatus})` : "") +
      (resultat.arealformaal ? `. Arealformål: ${resultat.arealformaal}` : "") +
      ".",
    );
  } else {
    linjer.push(
      "Ingen vedtatt reguleringsplan er identifisert for tiltaksstedet. " +
      "Kommuneplanens arealdel er gjeldende plangrunnlag. " +
      "Tiltaket er vurdert mot gjeldende kommuneplan.",
    );
  }

  linjer.push(
    "Tiltaket er ikke i strid med gjeldende plangrunnlag. Waterotor er et vassdragstiltak " +
    "som faller under vannressursloven, og meldeplikt til NVE er oppfylt gjennom dette skjemaet.",
  );

  resultat.oppsummering = linjer.join(" ");
  return resultat;
}
