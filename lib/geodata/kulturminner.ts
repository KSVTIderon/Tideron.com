/**
 * Kulturminner-oppslag
 *
 * Henter data fra Riksantikvarens Askeladden-tjeneste (ArcGIS REST).
 * Ingen API-nøkkel nødvendig.
 */

const ASKELADDEN_BASE =
  "https://kart.ra.no/arcgis/rest/services/Askeladden/MapServer";
const TIMEOUT = 10_000;

async function arcgisIdentify(
  serviceUrl: string,
  lat: number,
  lon: number,
  tolerance = 30,
): Promise<any[]> {
  const delta = 0.03; // ~2 km radius
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

export interface KulturminneData {
  kulturminner: Array<{
    navn: string;
    type: string;
    periode?: string;
    vernestatus?: string;
    askeladdenId?: string;
  }>;
  oppsummering: string;
  feil?: string;
}

export async function hentKulturminner(
  lat: number,
  lon: number,
): Promise<KulturminneData> {
  const resultat: KulturminneData = { kulturminner: [], oppsummering: "" };

  try {
    const features = await arcgisIdentify(ASKELADDEN_BASE, lat, lon, 30);

    for (const f of features) {
      const a = f.attributes ?? {};
      // Filtrer bort tomme treff
      if (!a.Navn && !a.navn && !a.NAVN && !a.ObjectType && !a.objecttype) continue;

      resultat.kulturminner.push({
        navn: a.Navn ?? a.navn ?? a.NAVN ?? a.Lokalitetsnavn ?? "Ukjent",
        type: a.ObjectType ?? a.objecttype ?? a.Kategori ?? f.layerName ?? "Ukjent",
        periode: a.Datering ?? a.datering ?? undefined,
        vernestatus: a.Vernestatus ?? a.vernestatus ?? undefined,
        askeladdenId: a.LokalitetID
          ? String(a.LokalitetID)
          : a.ObjectID
          ? String(a.ObjectID)
          : undefined,
      });
    }
  } catch (e) {
    console.warn("Askeladden feil:", e);
    resultat.feil = `Askeladden: ${(e as Error).message}`;
  }

  // Oppsummering
  if (resultat.kulturminner.length === 0) {
    resultat.oppsummering =
      "Søk i Riksantikvarens Askeladden-database viser ingen registrerte automatisk fredete " +
      "eller vedtaksfredete kulturminner i direkte nærhet av tiltaksstedet. " +
      "Tiltaket berører ikke synlige eller kartlagte kulturminner.";
  } else {
    const liste = resultat.kulturminner
      .map(k => `${k.navn} (${k.type}${k.askeladdenId ? `, ID ${k.askeladdenId}` : ""})`)
      .join(", ");
    resultat.oppsummering =
      `Følgende kulturminner er registrert i nær tilknytning til tiltaksstedet: ${liste}. ` +
      "Disse er identifisert i Riksantikvarens Askeladden. " +
      "Det anbefales dialog med regional kulturminneforvaltning (Statsforvalteren/fylkeskommunen) " +
      "for å avklare om tiltaket kan påvirke disse.";
  }

  return resultat;
}
