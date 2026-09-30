/**
 * Naturmangfold-oppslag
 *
 * Henter data fra Miljødirektoratets Naturbase (ArcGIS REST)
 * og Artsdatabanken (artskart.artsdatabanken.no).
 *
 * Ingen API-nøkkel nødvendig.
 */

const NATURBASE_BASE =
  "https://kart.miljodirektoratet.no/arcgis/rest/services/naturbase/MapServer";
const ARTSKART_BASE =
  "https://artskart.artsdatabanken.no/api/PublicApi";
const TIMEOUT = 10_000;

async function arcgisIdentify(
  serviceUrl: string,
  lat: number,
  lon: number,
  tolerance = 10,
): Promise<any[]> {
  const delta = 0.02; // ~1 km radius
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lon, y: lat }),
    geometryType: "esriGeometryPoint",
    sr: "4326",
    layers: "all",
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
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data?.results ?? [];
  } finally {
    clearTimeout(timer);
  }
}

export interface NaturmangfoldData {
  naturtyper: Array<{ navn: string; kategori: string; tilstand?: string; kilde: string }>;
  trueteArter: Array<{ navn: string; rodlistekategori: string }>;
  vernOmraader: Array<{ navn: string; type: string }>;
  oppsummering: string;
  feil?: string;
}

export async function hentNaturmangfold(
  lat: number,
  lon: number,
  radiusM = 500,
): Promise<NaturmangfoldData> {
  const resultat: NaturmangfoldData = {
    naturtyper: [],
    trueteArter: [],
    vernOmraader: [],
    oppsummering: "",
  };

  // ── Naturtyper fra Naturbase ───────────────────────────────────────────────
  try {
    const features = await arcgisIdentify(NATURBASE_BASE, lat, lon, 20);

    for (const f of features) {
      const a = f.attributes ?? {};
      // Naturtyper
      if (a.Naturtype || a.naturtype || a.NATURTYPE) {
        resultat.naturtyper.push({
          navn: a.Naturtype ?? a.naturtype ?? a.NATURTYPE ?? "Ukjent",
          kategori: a.Hovedoekosystem ?? a.Kategori ?? a.kategori ?? "Ukjent",
          tilstand: a.Tilstand ?? a.tilstand ?? undefined,
          kilde: "Naturbase (Miljødirektoratet)",
        });
      }
      // Verneområder
      if (a.Verneform || a.verneform || f.layerName?.toLowerCase().includes("vern")) {
        resultat.vernOmraader.push({
          navn: a.Verneomradenavn ?? a.verneomradenavn ?? a.Navn ?? "Ukjent",
          type: a.Verneform ?? a.verneform ?? f.layerName ?? "Ukjent",
        });
      }
    }
  } catch (e) {
    console.warn("Naturbase feil:", e);
    resultat.feil = `Naturbase: ${(e as Error).message}`;
  }

  // ── Rødlistede arter fra Artsdatabanken ───────────────────────────────────
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);

    // Buffer-søk rundt punktet (omtrent radiusM)
    const latDelta = radiusM / 111_320;
    const lonDelta = radiusM / (111_320 * Math.cos(lat * Math.PI / 180));

    const params = new URLSearchParams({
      north: String(lat + latDelta),
      south: String(lat - latDelta),
      east: String(lon + lonDelta),
      west: String(lon - lonDelta),
      redlistCategories: "CR,EN,VU", // Kritisk truet, Sterkt truet, Sårbar
      take: "20",
      skip: "0",
    });

    try {
      const res = await fetch(
        `${ARTSKART_BASE}/SearchSpeciesObservations?${params}`,
        { signal: controller.signal },
      );
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const obs = data?.Results ?? data?.results ?? [];
        const sett = new Set<string>();
        for (const o of obs) {
          const key = o.ScientificName ?? o.scientificName ?? "";
          if (key && !sett.has(key)) {
            sett.add(key);
            resultat.trueteArter.push({
              navn: o.VernacularName ?? o.vernacularName ?? key,
              rodlistekategori: o.RedlistCategory ?? o.redlistCategory ?? "VU",
            });
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.warn("Artsdatabanken feil:", e);
  }

  // ── Bygg tekstoppsummering ─────────────────────────────────────────────────
  const linjer: string[] = [];

  if (resultat.vernOmraader.length > 0) {
    linjer.push(
      `Tiltaksstedet berører/er nær følgende verneområder: ${resultat.vernOmraader.map(v => `${v.navn} (${v.type})`).join(", ")}.`,
    );
  } else {
    linjer.push("Ingen registrerte verneområder er funnet i nær tilknytning til tiltaksstedet.");
  }

  if (resultat.naturtyper.length > 0) {
    linjer.push(
      `Følgende naturtyper er registrert i søkssonen: ${Array.from(new Set(resultat.naturtyper.map(n => n.navn))).join(", ")} (kilde: Naturbase, Miljødirektoratet).`,
    );
  } else {
    linjer.push("Ingen utvalgte naturtyper er kartlagt i direkte tilknytning til tiltaksstedet (Naturbase, Miljødirektoratet).");
  }

  if (resultat.trueteArter.length > 0) {
    linjer.push(
      `Rødlistede arter registrert innen ${500} m: ${resultat.trueteArter.map(a => `${a.navn} (${a.rodlistekategori})`).join(", ")} (kilde: Artsdatabanken).`,
    );
  } else {
    linjer.push(
      `Søk i Artsdatabanken viser ingen observasjoner av CR/EN/VU-listede arter innen ${500} m av tiltaksstedet.`,
    );
  }

  linjer.push(
    "Waterotor er et nedsenkbart hydrokinetisk aggregat som ikke medfører vannuttak, reguleringsmagasin eller fysiske inngrep i elvebunnen utover forankringspunkter. Tiltakets fotavtrykk er minimalt.",
  );

  resultat.oppsummering = linjer.join(" ");
  return resultat;
}
