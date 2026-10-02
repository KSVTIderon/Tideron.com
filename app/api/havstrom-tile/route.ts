import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ── Token-cache (overlever mellom requests i samme serverless-instans) ──
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getCmemsToken(username: string, password: string): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch(
    "https://auth.marine.copernicus.eu/realms/MIS/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "toolbox",
        grant_type: "password",
        username,
        password,
      }).toString(),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`CMEMS token-feil ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  cachedToken = data.access_token as string;
  // Forny 60 sek før utløp
  tokenExpiry = Date.now() + ((data.expires_in as number) - 60) * 1000;
  return cachedToken;
}

// ── Proxy: GET /planner/api/havstrom-tile?z=5&x=16&y=10 ──
export async function GET(req: NextRequest) {
  const username = process.env.CMEMS_USERNAME;
  const password = process.env.CMEMS_PASSWORD;

  if (!username || !password) {
    return new NextResponse("CMEMS_USERNAME / CMEMS_PASSWORD ikke satt", { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const z = sp.get("z");
  const x = sp.get("x");
  const y = sp.get("y");

  if (!z || !x || !y) {
    return new NextResponse("Mangler z/x/y parametre", { status: 400 });
  }

  // Månedlig gjennomsnitt — CMEMS har ~2 mnd forsinkelse
  const now = new Date();
  const månedStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const time = månedStart.toISOString().replace(".000Z", "Z");

  let token: string;
  try {
    token = await getCmemsToken(username, password);
  } catch (err) {
    console.error("CMEMS token-feil:", err);
    return new NextResponse("Autentisering mot CMEMS feilet", { status: 502 });
  }

  // Global månedlig gjennomsnitt — 0.083° (~9km) oppløsning
  const wmtsUrl = new URL("https://wmts.marine.copernicus.eu/teroWmts");
  wmtsUrl.searchParams.set("service", "WMTS");
  wmtsUrl.searchParams.set("version", "1.0.0");
  wmtsUrl.searchParams.set("request", "GetTile");
  wmtsUrl.searchParams.set("layer", "GLOBAL_ANALYSISFORECAST_PHY_001_024/cmems_mod_glo_phy-cur_anfc_0.083deg_P1M-m_202406/sea_water_velocity");
  wmtsUrl.searchParams.set("style", "cmap:RdYlGn_r");
  wmtsUrl.searchParams.set("format", "image/png");
  wmtsUrl.searchParams.set("tilematrixset", "EPSG:3857");
  wmtsUrl.searchParams.set("tilematrix", z);
  wmtsUrl.searchParams.set("tilerow", y);
  wmtsUrl.searchParams.set("tilecol", x);
  wmtsUrl.searchParams.set("time", time);
  wmtsUrl.searchParams.set("colorscalerange", "0,1.5");
  wmtsUrl.searchParams.set("abovemaxcolor", "0xFF0000");

  let res: Response;
  try {
    res = await fetch(wmtsUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    console.error("CMEMS WMTS nettverksfeil:", err);
    return new NextResponse("Nettverksfeil mot CMEMS", { status: 502 });
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("CMEMS WMTS svarte", res.status, txt.slice(0, 500));
    return new NextResponse(
      `CMEMS ${res.status} | URL: ${wmtsUrl.toString().slice(0, 400)} | Body: ${txt.slice(0, 600)}`,
      { status: 200, headers: { "Content-Type": "text/plain" } }
    );
  }

  const contentType = res.headers.get("content-type") ?? "image/png";
  const buffer = await res.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
