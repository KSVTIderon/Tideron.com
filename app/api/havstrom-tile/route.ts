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

  // RdYlGn_r: 0 m/s=mørkt grønn, ~0.5=gul, 1 m/s=mørkt rød
  // Vi bruker pngjs til å booste til lyse farger: grønt→gult→rødt
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
  wmtsUrl.searchParams.set("colorscalerange", "0,1.0");

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
    console.error("CMEMS WMTS svarte", res.status, txt.slice(0, 300));
    return new NextResponse(`CMEMS feil ${res.status}`, { status: 502 });
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  // ── Fargeboosting: mørke RdYlGn_r-farger → lyse grønt/gult/rødt ──
  // RdYlGn_r: slow=mørkt grønn(G>R), medium=lys gul(R≈G), fast=mørkt rød(R>G)
  // Ratio = G/(R+G+1): ~1.0 for sakte, ~0.5 for medium, ~0.0 for rask
  try {
    const png = PNG.sync.read(buffer);
    const d = png.data;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 10) {
        const R = d[i], G = d[i + 1];
        // Estimer hastighet fra G/(R+G) forholdet
        const ratio = G / (R + G + 1); // 1=sakte(grønn), 0=rask(rød)
        const speed = 1 - ratio;        // 0=sakte, 1=rask
        const t = Math.sqrt(speed);     // gamma 0.5 for bedre kontrast

        // Map t til lyse farger
        let r: number, g: number, b: number;
        if (t < 0.5) {
          // Lys grønt → lys gult
          const f = t * 2; // 0→1
          r = Math.round(f * 255);
          g = 210;
          b = 0;
        } else {
          // Lys gult → lys rødt
          const f = (t - 0.5) * 2; // 0→1
          r = 255;
          g = Math.round((1 - f) * 210);
          b = 0;
        }

        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }
    }

    const out = PNG.sync.write(png);
    return new NextResponse(out as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "X-Debug": "v9-RdYlGn_r-boosted-GYR",
      },
    });
  } catch (err) {
    console.error("[havstrom v9] PNG-boost feilet:", err);
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-Debug": "v9-fallback-raw-RdYlGn_r",
      },
    });
  }
}
