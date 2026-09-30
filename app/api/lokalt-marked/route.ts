import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ─── Norway detection ────────────────────────────────────────────────────────
function erINorge(lat: number, lon: number): boolean {
  // Rough bounding box covering mainland + islands (Svalbard excluded)
  return lat >= 57.0 && lat <= 71.5 && lon >= 4.0 && lon <= 31.5;
}

// ─── Reverse geocoding via Nominatim (global, free) ─────────────────────────
interface GeoInfo {
  name: string;       // municipality / city
  region: string;     // state / county
  country: string;    // full country name
  countryCode: string;// ISO 3166-1 alpha-2 uppercase
}

async function reverseGeocode(lat: number, lon: number): Promise<GeoInfo> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`,
      {
        headers: { "User-Agent": "Tideron/1.0 (ksv@tideron.com)" },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!r.ok) return { name: "", region: "", country: "", countryCode: "" };
    const d = await r.json();
    const a = d.address ?? {};
    return {
      name:        a.municipality || a.city || a.town || a.village || a.hamlet || "",
      region:      a.state || a.region || a.county || "",
      country:     a.country || "",
      countryCode: (a.country_code ?? "").toUpperCase(),
    };
  } catch {
    return { name: "", region: "", country: "", countryCode: "" };
  }
}

// ─── SSB electricity table (Norway only) ─────────────────────────────────────
async function hentSSBForbruk(kommunenr: string): Promise<number | null> {
  try {
    const query = {
      query: [
        { code: "Region",       selection: { filter: "item", values: [kommunenr] } },
        { code: "ContentsCode", selection: { filter: "item", values: ["ElForbruk"] } },
        { code: "Tid",          selection: { filter: "top",  values: ["1"] } },
      ],
      response: { format: "json-stat2" },
    };
    const r = await fetch("https://data.ssb.no/api/v0/no/table/12824", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const gwh = d?.value?.[0];
    if (gwh == null || isNaN(gwh)) return null;
    return Math.round(gwh * 1_000_000); // GWh → kWh
  } catch {
    return null;
  }
}

// ─── Kartverket municipality lookup (Norway only) ────────────────────────────
async function getKommuneNr(lat: number, lon: number): Promise<string | null> {
  try {
    const r = await fetch(
      `https://ws.geonorge.no/kommuneinfo/v1/punkt?nord=${lat}&ost=${lon}&koordsys=4258`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    return d.kommunenummer ?? null;
  } catch {
    return null;
  }
}

async function kommunerInnen50km(lat: number, lon: number): Promise<{
  numre: string[];
  senter: { navn: string; nummer: string; fylke: string };
}> {
  const dLat = 0.45;
  const dLon = 0.88;
  const punkter = [
    [lat, lon],
    [lat + dLat, lon], [lat - dLat, lon],
    [lat, lon + dLon], [lat, lon - dLon],
    [lat + dLat * 0.7, lon + dLon * 0.7],
    [lat + dLat * 0.7, lon - dLon * 0.7],
    [lat - dLat * 0.7, lon + dLon * 0.7],
    [lat - dLat * 0.7, lon - dLon * 0.7],
  ];

  const resultater = await Promise.all(punkter.map(([plat, plon]) => getKommuneNr(plat, plon)));
  const unikeNr = Array.from(new Set(resultater.filter((x): x is string => x !== null)));

  let senter = { navn: "", nummer: unikeNr[0] ?? "0000", fylke: "" };
  try {
    const r = await fetch(
      `https://ws.geonorge.no/kommuneinfo/v1/punkt?nord=${lat}&ost=${lon}&koordsys=4258`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const d = await r.json();
      senter = {
        navn:   d.kommunenavn ?? "",
        nummer: d.kommunenummer ?? unikeNr[0] ?? "0000",
        fylke:  d.fylkesnavn ?? "",
      };
    }
  } catch { /* fallback */ }

  return { numre: unikeNr, senter };
}

// ─── NVE nettselskaper (Norway only) ────────────────────────────────────────
const NETTSELSKAPER: Record<string, { navn: string; nett: string; eier: string }> = {
  "Troms":              { navn: "Nordkraft Nett",        nett: "regionalnett",     eier: "Bodø kommune" },
  "Finnmark":           { navn: "Hammerfest Energi Nett", nett: "distribusjonsnett", eier: "Hammerfest kommune" },
  "Nordland":           { navn: "Nordkraft Nett",         nett: "regionalnett",     eier: "Bodø kommune" },
  "Trøndelag":          { navn: "NTE Nett",               nett: "distribusjonsnett", eier: "Nord-Trøndelag fylkeskommune" },
  "Møre og Romsdal":    { navn: "Mørenett",               nett: "distribusjonsnett", eier: "Istad Kraft" },
  "Vestland":           { navn: "Lnett",                  nett: "distribusjonsnett", eier: "BKK / E.ON" },
  "Rogaland":           { navn: "Lnett",                  nett: "distribusjonsnett", eier: "Lyse Elnett" },
  "Agder":              { navn: "Agder Energi Nett",      nett: "distribusjonsnett", eier: "Agder Energi" },
  "Vestfold og Telemark": { navn: "Glitre Nett",          nett: "distribusjonsnett", eier: "Glitre Energi" },
  "Viken":              { navn: "Elvia",                  nett: "distribusjonsnett", eier: "Hafslund Eco" },
  "Oslo":               { navn: "Elvia",                  nett: "distribusjonsnett", eier: "Hafslund Eco" },
  "Innlandet":          { navn: "Elvia",                  nett: "distribusjonsnett", eier: "Hafslund Eco" },
};

function finnNettselskapFraFylke(fylke: string) {
  for (const [key, val] of Object.entries(NETTSELSKAPER)) {
    if (fylke?.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return { navn: "Lokal netteier", nett: "distribusjonsnett", eier: "Ukjent" };
}

// ─── Brreg (Norway only) ────────────────────────────────────────────────────
const NAERINGER = ["35","03","10","24","26","49","52","63","61","62","20","17","08","19"];

async function hentBrregBedrifter(kommuneNr: string[]): Promise<any[]> {
  const soek: Array<{ knr: string; nkode: string }> = [];
  for (const knr of kommuneNr) {
    for (const nkode of NAERINGER) {
      soek.push({ knr, nkode });
    }
  }

  const bedrifter: any[] = [];
  const seen = new Set<string>();
  const BATCH = 20;

  for (let i = 0; i < soek.length; i += BATCH) {
    const batch = soek.slice(i, i + BATCH);
    const resultater = await Promise.all(
      batch.map(async ({ knr, nkode }) => {
        try {
          const url = `https://data.brreg.no/enhetsregisteret/api/enheter?kommunenummer=${knr}&naeringskode=${nkode}&size=10&sort=antallAnsatte,desc`;
          const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
          if (!r.ok) return [];
          const bd = await r.json();
          return (bd._embedded?.enheter ?? []).map((e: any) => ({
            navn:             e.navn,
            orgnr:            e.organisasjonsnummer,
            naeringskode:     e.naeringskode1?.kode ?? nkode,
            naeringBeskrivelse: e.naeringskode1?.beskrivelse ?? "",
            ansatte:          e.antallAnsatte ?? 0,
            adresse:          e.forretningsadresse?.adresse?.[0] ?? "",
            poststed:         e.forretningsadresse?.poststed ?? "",
            kommunenavn:      e.forretningsadresse?.kommunenavn ?? "",
          }));
        } catch {
          return [];
        }
      })
    );
    for (const liste of resultater) {
      for (const b of liste) {
        if (!seen.has(b.orgnr)) {
          seen.add(b.orgnr);
          bedrifter.push(b);
        }
      }
    }
  }

  return bedrifter.sort((a, b) => b.ansatte - a.ansatte).slice(0, 50);
}

// ─── OpenStreetMap Overpass API (international) ──────────────────────────────
async function hentOSMFasiliteter(lat: number, lon: number): Promise<any[]> {
  const radius = 50000; // 50 km in metres
  // Query for industrial, power, data center, port, and commercial facilities
  const query = `
[out:json][timeout:25];
(
  node["landuse"="industrial"](around:${radius},${lat},${lon});
  node["power"="plant"](around:${radius},${lat},${lon});
  node["amenity"="data_center"](around:${radius},${lat},${lon});
  node["man_made"="works"](around:${radius},${lat},${lon});
  node["industrial"](around:${radius},${lat},${lon});
  way["landuse"="industrial"](around:${radius},${lat},${lon});
  way["power"="plant"](around:${radius},${lat},${lon});
  way["amenity"="data_center"](around:${radius},${lat},${lon});
  way["man_made"="works"](around:${radius},${lat},${lon});
  relation["landuse"="industrial"](around:${radius},${lat},${lon});
);
out center 100 tags;`.trim();

  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: query,
      headers: { "Content-Type": "text/plain" },
      signal: AbortSignal.timeout(28000),
    });
    if (!r.ok) return [];
    const d = await r.json();

    const seen = new Set<string>();
    return (d.elements ?? [])
      .filter((el: any) => el.tags?.name && !seen.has(el.tags.name) && seen.add(el.tags.name))
      .map((el: any) => {
        const tags = el.tags ?? {};
        let nkode = "00";
        let naering = tags.landuse || tags.industrial || tags.man_made || "Industrial";
        if (tags.amenity === "data_center") { nkode = "63"; naering = "Data center / IT"; }
        else if (tags.power === "plant")    { nkode = "35"; naering = "Power plant"; }
        else if (tags.landuse === "industrial") { nkode = "24"; naering = "Industrial"; }
        else if (tags.man_made === "works")     { nkode = "10"; naering = "Manufacturing / Works"; }
        return {
          navn:               tags.name,
          orgnr:              String(el.id),
          naeringskode:       nkode,
          naeringBeskrivelse: naering,
          ansatte:            0,   // OSM doesn't have employee counts
          adresse:            tags["addr:street"] || "",
          poststed:           tags["addr:city"] || tags["addr:postcode"] || "",
          kommunenavn:        tags["addr:city"] || tags["addr:suburb"] || "",
        };
      });
  } catch {
    return [];
  }
}

// ─── Per-capita electricity consumption by country (kWh/year) ────────────────
const FORBRUK_PER_INNB: Record<string, number> = {
  "NO": 22000, "IS": 54000, "SE": 14000, "FI": 15000, "DK": 6500,
  "DE": 7200,  "GB": 5000,  "FR": 7400,  "NL": 6500,  "AT": 8200,
  "CH": 8000,  "BE": 7500,  "PL": 4200,  "ES": 5500,  "IT": 5500,
  "PT": 5000,  "IE": 5600,  "CA": 15000, "AU": 10000, "US": 13000,
  "JP": 8000,  "KR": 10000, "TW": 11000, "SG": 9000,  "NZ": 9500,
  "RU": 6500,  "UA": 3500,  "CN": 5500,  "IN": 1000,  "BR": 2500,
  "MX": 2200,  "AR": 2500,  "ZA": 4000,  "MA": 900,   "NG": 300,
  "GH": 400,   "KE": 200,   "TZ": 100,   "ET": 80,    "UG": 80,
  "FO": 15000, "GL": 12000, "PH": 900,   "ID": 1000,  "VN": 2000,
  "TH": 3000,  "MY": 5000,
};

function forbrukPerInnbygger(countryCode: string): number {
  return FORBRUK_PER_INNB[countryCode] ?? 5000;
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { project_id } = await req.json();
    if (!project_id)
      return NextResponse.json({ error: "Mangler project_id" }, { status: 400 });

    // 1. Load project data
    const sb = createClient();
    const { data: prosjekt } = await sb
      .from("projects").select("*").eq("id", project_id).single();
    const { data: stream } = await sb
      .from("streams").select("*").eq("project_id", project_id).maybeSingle();
    const { data: rotorer } = await sb
      .from("rotors").select("*").eq("project_id", project_id);

    if (!prosjekt)
      return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });

    const lat  = prosjekt.lat ?? 65.0;
    const lon  = prosjekt.lon ?? 14.0;
    const sted = prosjekt.sted ?? "";

    const isNorway = erINorge(lat, lon);

    // ── ENERGY ESTIMATES (common) ────────────────────────────────────────────
    const avgV      = stream?.avg_velocity_m_s ?? 0;
    const streamType = stream?.stream_type ?? "tidevann";
    const antallRotorer = rotorer?.length ?? 0;

    let totalKwEst = 0;
    if (rotorer && rotorer.length > 0) {
      totalKwEst = rotorer.reduce((s: number, r: any) => {
        const v = (r.hastighet_m_s && Number(r.hastighet_m_s) > 0)
          ? Number(r.hastighet_m_s) : avgV;
        if (r.nominell_kw_1_8 && v > 0) return s + r.nominell_kw_1_8 * Math.pow(v / 1.8, 3);
        if (r.nominell_kw_1_8) return s + r.nominell_kw_1_8;
        return s;
      }, 0);
    }
    const CF       = streamType === "tidevann" ? 0.35 : streamType === "elv" ? 0.55 : 0.45;
    const arligKwh = totalKwEst * 8760 * CF;

    // ── BRANCH: Norway vs. International ────────────────────────────────────
    let kommune: { navn: string; nummer: string; fylke: string };
    let kommunerSokt: number;
    let bedrifter: any[];
    let nettselskapInfo: { navn: string; nett: string; eier: string };
    let kommuneForbrukKwh: number;
    let erSSBData: boolean;

    if (isNorway) {
      // ── Norwegian pipeline ──────────────────────────────────────────────
      const { numre: kommuneNr, senter } = await kommunerInnen50km(lat, lon);
      kommune = { navn: senter.navn || sted, nummer: senter.nummer, fylke: senter.fylke };
      kommunerSokt = kommuneNr.length;
      bedrifter    = await hentBrregBedrifter(kommuneNr);
      nettselskapInfo = finnNettselskapFraFylke(kommune.fylke);

      const ssbForbrukKwh = await hentSSBForbruk(kommune.nummer);
      erSSBData       = ssbForbrukKwh !== null;
      kommuneForbrukKwh = ssbForbrukKwh ?? (3000 * 22000);

    } else {
      // ── International pipeline ──────────────────────────────────────────
      const geo = await reverseGeocode(lat, lon);
      kommune = {
        navn:   geo.name || sted,
        nummer: "",
        fylke:  geo.region || geo.country,
      };
      kommunerSokt = 1;

      const osmFasiliteter = await hentOSMFasiliteter(lat, lon);
      bedrifter = osmFasiliteter;

      nettselskapInfo = {
        navn: "Local distribution network",
        nett: geo.region || geo.country,
        eier: "See local grid operator",
      };

      // Per-capita estimate: assume ~20,000 people in a 50 km radius for smaller areas
      const pkwh = forbrukPerInnbygger(geo.countryCode);
      erSSBData       = false;
      kommuneForbrukKwh = 20000 * pkwh; // 20k people × country average
    }

    const dekning = arligKwh > 0 ? (arligKwh / kommuneForbrukKwh) * 100 : 0;

    // ── Filter bedrifter ────────────────────────────────────────────────────
    const storeBedrifter = isNorway
      ? bedrifter.filter(b => b.ansatte >= 50)
      : bedrifter.filter(b =>
          b.naeringskode?.startsWith("63") ||
          b.naeringskode?.startsWith("35") ||
          b.naeringBeskrivelse?.toLowerCase().includes("data") ||
          b.naeringBeskrivelse?.toLowerCase().includes("power")
        ).slice(0, 10);

    const datasentre = bedrifter.filter(b =>
      b.naeringskode?.startsWith("63") || b.naeringskode?.startsWith("61") ||
      b.navn?.toLowerCase().includes("data") ||
      b.navn?.toLowerCase().includes("google") ||
      b.navn?.toLowerCase().includes("microsoft") ||
      b.navn?.toLowerCase().includes("amazon") ||
      b.navn?.toLowerCase().includes("meta")
    );

    // ── AI summary ──────────────────────────────────────────────────────────
    let sammendrag = "";
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

    const kontekst = isNorway
      ? `
Du er en norsk energi- og markedsanalytiker. Lag et faktabasert sammendrag (maks 4 avsnitt) for et hydrokinetisk energiprosjekt.

Prosjekt: ${prosjekt.navn}
Sted: ${sted} (${kommune.navn} kommune, ${kommune.fylke})
Koordinater: ${lat.toFixed(4)}, ${lon.toFixed(4)}
Strømproduksjon: ${totalKwEst > 0 ? totalKwEst.toFixed(1) + " kW installert, ca. " + Math.round(arligKwh).toLocaleString("nb-NO") + " kWh/år" : "Ikke beregnet ennå"}
Strømtype: ${streamType}
Søkeradius: ~50 km (${kommunerSokt} kommuner undersøkt)
Kommuneforbruk: ${Math.round(kommuneForbrukKwh / 1_000_000).toLocaleString("nb-NO")} GWh/år${erSSBData ? " (SSB faktisk forbruk)" : " (anslag)"}
Dekningsgrad: ${dekning > 0 ? dekning.toFixed(3) + " %" : "ikke beregnet"}
Totalt funnet i Brreg: ${bedrifter.length} bedrifter
Bedrifter 50+ ansatte: ${storeBedrifter.length} (${storeBedrifter.slice(0,5).map(b => b.navn + " (" + b.ansatte + " ans, " + b.kommunenavn + ")").join("; ")})
IT/datasenter: ${datasentre.length > 0 ? datasentre.map(b => b.navn + " (" + b.kommunenavn + ")").join("; ") : "Ingen funnet"}
Netteier: ${nettselskapInfo.navn}

Merk: Google har datasenter i Siljan/Porsgrunn-området. Meta/Facebook har datasenter på Hamar.

Lag et sammendrag (norsk) med:
1. Potensielle PPA-kjøpere, særlig datasentre og industri
2. Vurdering av strømnettets kapasitet
3. Kommentar om energibalansen
4. Overordnet markedsmulighet
Vær konkret, angi hva som er antagelser vs. kjent fakta.`.trim()
      : `
You are an energy and market analyst. Write a factual summary (max 4 paragraphs) for a hydrokinetic energy project outside Norway.

Project: ${prosjekt.navn}
Location: ${sted} (${kommune.navn}, ${kommune.fylke})
Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}
Power output: ${totalKwEst > 0 ? totalKwEst.toFixed(1) + " kW installed, ~" + Math.round(arligKwh).toLocaleString() + " kWh/year" : "Not calculated yet"}
Stream type: ${streamType}
Search radius: ~50 km
Estimated area consumption: ~${Math.round(kommuneForbrukKwh / 1_000_000)} GWh/year (estimate based on country average)
Coverage: ${dekning > 0 ? dekning.toFixed(3) + " %" : "not calculated"}
Industrial facilities found via OpenStreetMap: ${bedrifter.length}
Data centers / IT: ${datasentre.length > 0 ? datasentre.map(b => b.navn).join(", ") : "None found"}
Grid operator: ${nettselskapInfo.navn}

Write a summary in English covering:
1. Potential PPA buyers — data centers, industry, off-grid communities
2. Assessment of local grid capacity and connection feasibility
3. Energy balance comment for the region
4. Overall market opportunity
Be factual, note what is estimated vs. known.`.trim();

    if (ANTHROPIC_KEY) {
      try {
        const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 900,
            messages: [{ role: "user", content: kontekst }],
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          sammendrag = aiData.content?.[0]?.text ?? "";
        }
      } catch { /* fallback */ }
    }

    if (!sammendrag) {
      sammendrag =
        `**${isNorway ? "Estimert analyse" : "Analysis"} for ${prosjekt.navn}**\n\n` +
        `Project is located in ${kommune.navn}${kommune.fylke ? " (" + kommune.fylke + ")" : ""}. ` +
        `Search within ~50 km radius found ${bedrifter.length} industrial facilities.\n\n` +
        `${storeBedrifter.length > 0 ? "Large facilities: " + storeBedrifter.slice(0, 5).map(b => b.navn + (b.ansatte ? " (" + b.ansatte + " employees)" : "")).join(", ") + ".\n\n" : ""}` +
        `${datasentre.length > 0 ? "Data center / IT: " + datasentre.map(b => b.navn).join(", ") + ".\n\n" : ""}` +
        `Grid operator: ${nettselskapInfo.navn}.\n\n` +
        `**Note:** Add ANTHROPIC_API_KEY to Vercel environment variables for full AI analysis.`;
    }

    return NextResponse.json({
      kommune,
      kommunerSokt,
      nettselskap:  nettselskapInfo,
      bedrifter,
      storeBedrifter,
      datasentre,
      erInternasjonalt: !isNorway,
      energi: {
        installertKw:             totalKwEst,
        arligKwh,
        kapasitetsfaktor:         CF,
        kommuneForbrukKwhAnslag:  kommuneForbrukKwh,
        kommuneForbrukKildeSSB:   erSSBData,
        dekningsprosent:          dekning,
      },
      sammendrag,
      tidspunkt: new Date().toISOString(),
    });

  } catch (err: any) {
    console.error("lokalt-marked feil:", err);
    return NextResponse.json({ error: err.message ?? "Ukjent feil" }, { status: 500 });
  }
}
