import { NextRequest, NextResponse } from "next/server";

/**
 * Slår opp gjennomsnittlig vannføring (m³/s) for et geografisk punkt.
 *
 * Strategi 1 — NVE NEVINA (gratis, ingen nøkkel):
 *   Beregner nedbørfelt og spesifikk avrenning for et punkt.
 *   Fungerer kun for punkter i Norge.
 *
 * Strategi 2 — NVE Hydapi (krever NVE_API_KEY i .env.local):
 *   Finner nærmeste aktive vannmålestasjon og returnerer MQ (midlere vannføring).
 *   Gratis API-nøkkel: https://hydapi.nve.no/
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json({ error: "lat og lon kreves" }, { status: 400 });
  }

  const latF = parseFloat(lat);
  const lonF = parseFloat(lon);

  // --- Strategi 1: NVE NEVINA (ingen API-nøkkel) ---
  try {
    const nevinaUrl = `https://nevina.nve.no/efficiency/api/catchment?lat=${latF}&lon=${lonF}&decadal=false`;
    const res = await fetch(nevinaUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const data = await res.json();

      // NEVINA returnerer spesifikk avrenning (qmBF, L/s/km²) og nedbørfeltareal (km²)
      // Noen versjoner bruker qmBf, qMBF, qm_BF – prøv alle
      const qmBF: number | undefined =
        data?.qmBF ?? data?.qmBf ?? data?.qm_BF ?? data?.runoff?.qmBF;
      const areal: number | undefined =
        data?.areal ?? data?.catchmentArea ?? data?.area;

      if (qmBF != null && areal != null && qmBF > 0 && areal > 0) {
        const mq_m3s = (qmBF * areal) / 1000; // L/s → m³/s
        return NextResponse.json({
          mq_m3s: parseFloat(mq_m3s.toFixed(3)),
          stasjon_navn: `NVE NEVINA — ${areal.toFixed(0)} km² nedbørfelt`,
          avstand_km: 0,
          kilde: "nevina",
          detaljer: {
            qmBF_l_s_km2: qmBF,
            areal_km2: areal,
          },
        });
      }

      // Noen NEVINA-svar gir MQ direkte
      if (data?.mq != null || data?.MQ != null) {
        const mq = data?.mq ?? data?.MQ;
        return NextResponse.json({
          mq_m3s: parseFloat(Number(mq).toFixed(3)),
          stasjon_navn: "NVE NEVINA",
          avstand_km: 0,
          kilde: "nevina",
        });
      }
    }
  } catch {
    /* fall through til neste strategi */
  }

  // --- Strategi 2: NVE Hydapi (krever API-nøkkel) ---
  const nveKey = process.env.NVE_API_KEY;
  if (!nveKey) {
    return NextResponse.json(
      {
        error:
          "NVE NEVINA ga ikke data for dette punktet (utenfor Norge?), og NVE_API_KEY er ikke satt.",
        hint: "Registrer gratis API-nøkkel på https://hydapi.nve.no og legg NVE_API_KEY=<nøkkel> i .env.local",
      },
      { status: 501 }
    );
  }

  try {
    const delta = 0.5;
    const stationsUrl =
      `https://hydapi.nve.no/api/v1/Stations` +
      `?LatitudeFrom=${(latF - delta).toFixed(3)}` +
      `&LatitudeTo=${(latF + delta).toFixed(3)}` +
      `&LongitudeFrom=${(lonF - delta).toFixed(3)}` +
      `&LongitudeTo=${(lonF + delta).toFixed(3)}` +
      `&Parameter=1000&Active=1`;

    const stRes = await fetch(stationsUrl, {
      headers: { "X-API-Key": nveKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!stRes.ok) throw new Error(`Stations svarte ${stRes.status}`);

    const stData = await stRes.json();
    const stations: any[] = stData?.data ?? [];

    if (stations.length === 0) {
      return NextResponse.json(
        { error: "Ingen aktive vannmålestasjoner innen 0,5° av koordinatene" },
        { status: 404 }
      );
    }

    // Finn nærmeste stasjon
    const nearest = stations.reduce((best: any, st: any) => {
      const d = Math.hypot(st.Latitude - latF, st.Longitude - lonF);
      const bd = best ? Math.hypot(best.Latitude - latF, best.Longitude - lonF) : Infinity;
      return d < bd ? st : best;
    }, null);

    // Hent statistikk — type 10 = MQ (midlere vannføring)
    const statsUrl = `https://hydapi.nve.no/api/v1/Statistics?StationId=${nearest.StationId}&Parameter=1000`;
    const statRes = await fetch(statsUrl, {
      headers: { "X-API-Key": nveKey, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    let mq_m3s: number | null = null;
    if (statRes.ok) {
      const statData = await statRes.json();
      const mqStat = (statData?.data ?? []).find(
        (s: any) => s.StatisticType === 10 || s.StatisticType === "MQ"
      );
      if (mqStat?.Value != null) mq_m3s = Number(mqStat.Value);
    }

    const avstandKm =
      111 * Math.hypot(nearest.Latitude - latF, nearest.Longitude - lonF);

    return NextResponse.json({
      mq_m3s,
      stasjon_navn: nearest.StationName ?? nearest.StationId,
      stasjon_id: nearest.StationId,
      avstand_km: parseFloat(avstandKm.toFixed(1)),
      kilde: "hydapi",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Ukjent nettverksfeil" },
      { status: 502 }
    );
  }
}
