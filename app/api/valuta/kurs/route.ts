import { NextRequest, NextResponse } from "next/server";

// GET /api/valuta/kurs?base=NOK&til=USD,EUR,GBP
// Bruker open.er-api.com — gratis, ingen API-nøkkel
export async function GET(req: NextRequest) {
  const base = req.nextUrl.searchParams.get("base") ?? "NOK";

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      next: { revalidate: 3600 }, // cache 1 time
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Valutakurs ikke tilgjengelig" }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({
      base: data.base_code,
      dato: data.time_last_update_utc,
      kurser: data.rates,
    });
  } catch (_e) {
    return NextResponse.json({ error: "Nettverksfeil" }, { status: 500 });
  }
}
