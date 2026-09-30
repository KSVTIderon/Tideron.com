/**
 * POST /api/odoo/sync-bedrifter
 *
 * Synkroniserer bedrifter fra lokal markedsanalyse til Odoo CRM.
 * Dobbel dedup-sjekk:
 *   1. Supabase-cache (odoo_bedrift_sync) — rask
 *   2. Odoo lead-søk på org.nr. i description — autoritativt
 *
 * Body: { project_id, prosjektNavn, prosjektLat?, prosjektLon?, bedrifter[] }
 * Returns: { opprettet, hoppetOver, feil }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ODOO_URL  = process.env.ODOO_URL  ?? "https://tideronas.odoo.com";
const ODOO_DB   = process.env.ODOO_DB   ?? "tideronas";
const ODOO_USER = process.env.ODOO_USER ?? "";
const ODOO_KEY  = process.env.ODOO_API_KEY ?? "";

async function odooAuth(): Promise<number | null> {
  try {
    const res = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "call",
        params: { service: "common", method: "authenticate", args: [ODOO_DB, ODOO_USER, ODOO_KEY, {}] },
      }),
    });
    const data = await res.json();
    return data?.result || null;
  } catch { return null; }
}

async function odooCall(uid: number, model: string, method: string, args: any[], kwargs: any = {}) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "call",
      params: {
        service: "object", method: "execute_kw",
        args: [ODOO_DB, uid, ODOO_KEY, model, method, args, kwargs],
      },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error).slice(0, 200));
  return data.result;
}

/** Henter alle org.nrs som allerede finnes i Odoo via description-feltet */
async function hentEksisterendeOrgnrsIOdoo(uid: number): Promise<Set<string>> {
  try {
    const leads = await odooCall(uid, "crm.lead", "search_read",
      [[["description", "ilike", "Org.nr.:"]]],
      { fields: ["description"], limit: 5000 }
    );
    const orgnrSet = new Set<string>();
    for (const lead of leads ?? []) {
      const match = (lead.description ?? "").match(/Org\.nr\.\s*:\s*(\d{9})/);
      if (match) orgnrSet.add(match[1]);
    }
    return orgnrSet;
  } catch { return new Set(); }
}

function mwhPerAnsatt(naeringskode: string): number {
  if (naeringskode?.startsWith("63") || naeringskode?.startsWith("61")) return 50000;
  if (naeringskode?.startsWith("2")) return 22000;
  return 8000;
}

function fmtKwh(kwh: number): string {
  if (kwh >= 1_000_000_000) return (kwh / 1_000_000_000).toFixed(2) + " TWh";
  if (kwh >= 1_000_000)     return (kwh / 1_000_000).toFixed(1) + " GWh";
  if (kwh >= 1_000)         return Math.round(kwh / 1_000) + " MWh";
  return Math.round(kwh) + " kWh";
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { project_id, prosjektNavn, prosjektSted, prosjektLat, prosjektLon, bedrifter } = body;

  if (!bedrifter?.length) {
    return NextResponse.json({ opprettet: 0, hoppetOver: 0, feil: 0 });
  }

  const supabase = createClient();

  // ── LAG 1: Supabase-cache ────────────────────────────────────────────────
  const alleOrgnrs = bedrifter.map((b: any) => b.orgnr).filter(Boolean);
  const { data: cacheRader } = await supabase
    .from("odoo_bedrift_sync")
    .select("orgnr")
    .in("orgnr", alleOrgnrs);

  const cachedOrgnrs = new Set((cacheRader ?? []).map((r: any) => r.orgnr));
  const ikkeCachet = bedrifter.filter((b: any) => !cachedOrgnrs.has(b.orgnr) || !b.orgnr);

  if (ikkeCachet.length === 0) {
    return NextResponse.json({ opprettet: 0, hoppetOver: bedrifter.length, feil: 0 });
  }

  // ── Koble til Odoo ───────────────────────────────────────────────────────
  const uid = await odooAuth();
  if (!uid) {
    return NextResponse.json({ error: "Odoo-tilkobling feilet" }, { status: 503 });
  }

  // ── LAG 2: Odoo-søk ──────────────────────────────────────────────────────
  const odooOrgnrs = await hentEksisterendeOrgnrsIOdoo(uid);
  const skalOpprettes = ikkeCachet.filter((b: any) => !b.orgnr || !odooOrgnrs.has(b.orgnr));

  let opprettet = 0;
  let hoppetOver = bedrifter.length - skalOpprettes.length;
  let feil = 0;
  const nyeCacheRader: any[] = [];

  for (const b of skalOpprettes) {
    const mwh = mwhPerAnsatt(b.naeringskode ?? "");
    const est = b.ansatte > 0 ? b.ansatte * mwh : 100000;
    const potensial = est > 500000 ? "Høyt" : est > 100000 ? "Middels" : "Lavt";

    const desc = [
      `Org.nr.: ${b.orgnr || "—"}`,
      `Bransje: ${b.naeringBeskrivelse}${b.naeringskode ? ` (${b.naeringskode})` : ""}`,
      `Ansatte: ${b.ansatte > 0 ? b.ansatte : "ukjent"}`,
      `Adresse: ${[b.adresse, b.poststed, b.kommunenavn].filter(Boolean).join(", ")}`,
      `Est. strømforbruk/år: ${fmtKwh(est)}`,
      `PPA-potensial: ${potensial}`,
      `Tilknyttet prosjekt: ${prosjektNavn ?? ""}${prosjektSted ? ` (${prosjektSted})` : ""}`,
      `Kilde: Brreg / Tideron Lokalt Marked (auto-sync)`,
    ].join("\n");

    try {
      const vals: Record<string, any> = {
        name:         `Bedrift: ${b.navn}`,
        partner_name: b.navn,
        description:  desc,
        x_data_quality:    "estimated",
        x_location_status: "analyzed",
      };
      if (prosjektLat != null) { vals.x_lat = prosjektLat; vals.partner_latitude  = prosjektLat; }
      if (prosjektLon != null) { vals.x_lon = prosjektLon; vals.partner_longitude = prosjektLon; }

      let odooId: number;
      try {
        odooId = await odooCall(uid, "crm.lead", "create", [vals]);
      } catch {
        // Fallback uten x_-felt
        const safe: Record<string, any> = {
          name: vals.name, partner_name: vals.partner_name, description: desc,
          partner_latitude: prosjektLat, partner_longitude: prosjektLon,
        };
        odooId = await odooCall(uid, "crm.lead", "create", [safe]);
      }

      if (b.orgnr) {
        nyeCacheRader.push({ orgnr: b.orgnr, navn: b.navn, odoo_id: odooId, project_id: project_id ?? null });
      }
      opprettet++;
    } catch {
      feil++;
    }
  }

  // ── Oppdater Supabase-cache ──────────────────────────────────────────────
  if (nyeCacheRader.length > 0) {
    await supabase
      .from("odoo_bedrift_sync")
      .upsert(nyeCacheRader, { onConflict: "orgnr", ignoreDuplicates: true });
  }

  return NextResponse.json({ opprettet, hoppetOver, feil });
}
