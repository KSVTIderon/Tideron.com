/**
 * /api/odoo/leads
 *
 * Bruker Odooes offisielle External API (/jsonrpc) med uid+API-nøkkel.
 * Dette er den støttede metoden for server-til-server integrasjon.
 * Env-variabler: ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY
 */

import { NextRequest, NextResponse } from "next/server";

const ODOO_URL  = process.env.ODOO_URL  ?? "https://tideronas.odoo.com";
const ODOO_DB   = process.env.ODOO_DB   ?? "tideronas";
const ODOO_USER = process.env.ODOO_USER ?? "";
const ODOO_KEY  = process.env.ODOO_API_KEY ?? "";

const LEAD_FIELDS = [
  "id", "name", "description",
  "partner_latitude", "partner_longitude",
  "x_lat", "x_lon",
  "x_stream_type", "x_avg_velocity_m_s",
  "x_data_quality", "x_location_status",
  "stage_id", "active",
];

/** Autentiser via /jsonrpc → returnerer uid */
async function getUid(): Promise<number | null> {
  try {
    const res = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "call",
        params: {
          service: "common",
          method: "authenticate",
          args: [ODOO_DB, ODOO_USER, ODOO_KEY, {}],
        },
      }),
    });
    const data = await res.json();
    const uid = data?.result;
    if (!uid || uid === false) {
      console.error("Odoo auth feilet:", JSON.stringify(data).slice(0, 500));
      return null;
    }
    return uid as number;
  } catch (e) {
    console.error("Odoo auth exception:", e);
    return null;
  }
}

/** Kall en Odoo-modell-metode via /jsonrpc */
async function odooCall(uid: number, model: string, method: string, args: any[], kwargs: any = {}) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [ODOO_DB, uid, ODOO_KEY, model, method, args, kwargs],
      },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error).slice(0, 300));
  return data.result;
}

function mapLead(r: any) {
  const lat = (r.x_lat && r.x_lat !== false) ? r.x_lat
    : (r.partner_latitude && r.partner_latitude !== false) ? r.partner_latitude
    : null;
  const lon = (r.x_lon && r.x_lon !== false) ? r.x_lon
    : (r.partner_longitude && r.partner_longitude !== false) ? r.partner_longitude
    : null;

  return {
    id:               `odoo_${r.id}`,
    odoo_id:          r.id,
    navn:             r.name ?? "Ukjent",
    lat,
    lon,
    stream_type:      r.x_stream_type !== false ? r.x_stream_type : null,
    avg_velocity_m_s: r.x_avg_velocity_m_s !== false ? r.x_avg_velocity_m_s : null,
    x_data_quality:   r.x_data_quality !== false ? r.x_data_quality : null,
    x_location_status: r.x_location_status !== false ? r.x_location_status : null,
    description:      r.description !== false ? r.description : null,
    status:           statusFraOdoo(r),
    kilde:            "odoo",
  };
}

function statusFraOdoo(r: any): string {
  const ls = r.x_location_status;
  if (ls === "deployed") return "konvertert";
  if (ls === "active")   return "lovende";
  if (ls === "analyzed") return "under_utredning";
  return "ikke_vurdert";
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const alleLeads = searchParams.get("all") === "1";

  const uid = await getUid();
  if (!uid) {
    return NextResponse.json({
      error: `Odoo auth feilet — URL=${ODOO_URL} DB=${ODOO_DB} USER=${ODOO_USER} KEY=${ODOO_KEY ? ODOO_KEY.slice(0, 8) + "…" : "(mangler)"}`,
    }, { status: 503 });
  }

  try {
    const records = await odooCall(uid, "crm.lead", "search_read",
      [[["active", "=", true]]],
      { fields: LEAD_FIELDS, limit: 1000, order: "id desc" }
    );
    const mapped = (records ?? []).map(mapLead);
    const leads = alleLeads ? mapped : mapped.filter((l: any) => l.lat && l.lon);
    return NextResponse.json(leads);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: "Odoo autentisering feilet" }, { status: 503 });

  const vals: Record<string, any> = { name: body.navn ?? "Ny lokasjon" };
  if (body.partner_name)      vals.partner_name        = body.partner_name;
  if (body.lat != null) { vals.x_lat = body.lat; vals.partner_latitude  = body.lat; }
  if (body.lon != null) { vals.x_lon = body.lon; vals.partner_longitude = body.lon; }
  if (body.stream_type)       vals.x_stream_type      = body.stream_type;
  if (body.avg_velocity_m_s)  vals.x_avg_velocity_m_s = body.avg_velocity_m_s;
  if (body.x_data_quality)    vals.x_data_quality      = body.x_data_quality;
  if (body.x_location_status) vals.x_location_status  = body.x_location_status;
  if (body.description)       vals.description         = body.description;

  try {
    const id = await odooCall(uid, "crm.lead", "create", [vals]);
    return NextResponse.json({ id: `odoo_${id}`, odoo_id: id });
  } catch (e: any) {
    // Fallback: prøv uten x_-felt
    try {
      const safeVals: Record<string, any> = {
        name: vals.name,
        partner_latitude:  body.lat,
        partner_longitude: body.lon,
        description: [
          body.stream_type      ? `Type: ${body.stream_type}` : "",
          body.avg_velocity_m_s ? `Hastighet: ${body.avg_velocity_m_s} m/s` : "",
          body.x_data_quality   ? `Datakvalitet: ${body.x_data_quality}` : "",
          body.description      ? body.description : "",
        ].filter(Boolean).join("\n"),
      };
      const id = await odooCall(uid, "crm.lead", "create", [safeVals]);
      return NextResponse.json({ id: `odoo_${id}`, odoo_id: id });
    } catch (e2: any) {
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const odoo_id = body.odoo_id;
  if (!odoo_id) return NextResponse.json({ error: "Mangler odoo_id" }, { status: 400 });

  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: "Odoo autentisering feilet" }, { status: 503 });

  const vals: Record<string, any> = {};
  if (body.lat != null) { vals.x_lat = body.lat; vals.partner_latitude  = body.lat; }
  if (body.lon != null) { vals.x_lon = body.lon; vals.partner_longitude = body.lon; }
  if (body.navn)              vals.name               = body.navn;
  if (body.x_data_quality)    vals.x_data_quality     = body.x_data_quality;
  if (body.x_location_status) vals.x_location_status  = body.x_location_status;

  try {
    await odooCall(uid, "crm.lead", "write", [[odoo_id], vals]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
