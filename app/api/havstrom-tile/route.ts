import { NextRequest, NextResponse } from "next/server";
import { PNG } from "pngjs";

export const runtime = "nodejs";

// ── Token-cache ──
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
  tokenExpiry = Date.now() + ((data.expires_in as number) - 60) * 1000;
  return cachedToken;
}

// ── Fargekart: gråverdi → grønt→gult→rødt ──
// CMEMS cmap:gray er INVERTERT: 0 m/s = hvit (255), 2 m/s = svart (0)
// Derfor inverter vi: (255 - gray) → så sakte=grønt, rask=rødt
// Gamma-korrigering (√) gir god visuell kontrast
function grayToGreenRed(gray: number): [number, number, number] {
  const v = Math.sqrt((255 - gray) / 255); // 0 m/s(hvit255)→v=0→grønt, 2 m/s(svart0)→v=1→rødt
  const r = Math.round(Math.min(v * 2, 1) * 255);
  const g = Math.round(Math.min((1 - v) * 2, 1) * 255);
  return [r, g, 0];
}

// ── Proxy: GET /planner/api/havstrom-tile?z=5&x=16&y=10 ──
export async function GET(req: NextRequest) {
  const username = process.env.CMEMS_USERNAME;
  const password = process.env.CMEMS_PASSWORD;

  if (!username || !password)
    return new NextResponse("CMEMS_USERNAME / CMEMS_PASSWORD ikke satt", { status: 503 });

  const sp = req.nextUrl.searchParams;
  const z = sp.get("z"), x = sp.get("x"), y = sp.get("y");
  if (!z || !x || !y)
    return new NextResponse("Mangler z/x/y parametre", { status: 400 });

  const now = new Date();
  const månedStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const time = månedStart.toISOString().replace(".000Z", "Z");

  let token: string;
  try { token = await getCmemsToken(username, password); }
  catch (err) {
    console.error("CMEMS token-feil:", err);
    return new NextResponse("Autentisering mot CMEMS feilet", { status: 502 });
  }

  const wmtsUrl = new URL("https://wmts.marine.copernicus.eu/teroWmts");
  wmtsUrl.searchParams.set("service", "WMTS");
  wmtsUrl.searchParams.set("version", "1.0.0");
  wmtsUrl.searchParams.set("request", "GetTile");
  wmtsUrl.searchParams.set("layer", "GLOBAL_ANALYSISFORECAST_PHY_001_024/cmems_mod_glo_phy-cur_anfc_0.083deg_P1M-m_202406/sea_water_velocity");
  wmtsUrl.searchParams.set("style", "cmap:gray"); // svart=sakte, hvit=rask
  wmtsUrl.searchParams.set("format", "image/png");
  wmtsUrl.searchParams.set("tilematrixset", "EPSG:3857");
  wmtsUrl.searchParams.set("tilematrix", z);
  wmtsUrl.searchParams.set("tilerow", y);
  wmtsUrl.searchParams.set("tilecol", x);
  wmtsUrl.searchParams.set("time", time);
  wmtsUrl.searchParams.set("colorscalerange", "0,2.0");
  wmtsUrl.searchParams.set("abovemaxcolor", "0xFFFFFF"); // >2 m/s → hvit → rød

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

  const contentType = res.headers.get("content-type") ?? "";
  const buffer = Buffer.from(await res.arrayBuffer());

  // ── Server-side fargekartlegging: grå → grønt→gult→rødt ──
  if (contentType.includes("image/png")) {
    try {
      const png = PNG.sync.read(buffer);
      const d = png.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 10) { // kun piksler med data (ikke gjennomsiktig land)
          const [r, g, b] = grayToGreenRed(d[i]);
          d[i] = r; d[i + 1] = g; d[i + 2] = b;
        }
      }
      const remapped = PNG.sync.write(png);
      return new NextResponse(remapped, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      console.error("PNG-remap feil:", err);
      // Fallback: returner original
    }
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType || "image/png",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
