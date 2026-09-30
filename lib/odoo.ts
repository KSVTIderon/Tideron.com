/**
 * Odoo JSON-RPC klient for Tideron
 * Brukes til å logge utgående e-poster i Odoo CRM-chatter.
 *
 * Env-variabler (sett i .env.local):
 *   ODOO_URL  — https://tideronas.odoo.com
 *   ODOO_DB   — tideronas
 *   ODOO_USER — ksv@tideron.com
 *   ODOO_API_KEY — API-nøkkel fra Odoo innstillinger
 */

const ODOO_URL     = process.env.ODOO_URL     ?? "";
const ODOO_DB      = process.env.ODOO_DB      ?? "";
const ODOO_USER    = process.env.ODOO_USER    ?? "";
const ODOO_API_KEY = process.env.ODOO_API_KEY ?? "";

let _uid: number | null = null;

// ── JSON-RPC kall ─────────────────────────────────────────────────────────────
async function rpc(endpoint: string, params: object): Promise<any> {
  const res = await fetch(`${ODOO_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      id: 1,
      params,
    }),
  });

  if (!res.ok) throw new Error(`Odoo HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.error) throw new Error(`Odoo RPC feil: ${JSON.stringify(json.error)}`);
  return json.result;
}

// ── Autentisering (caches UID i minnet) ───────────────────────────────────────
async function authenticate(): Promise<number> {
  if (_uid) return _uid;
  const uid = await rpc("/web/dataset/call_kw", {
    model: "res.users",
    method: "authenticate",
    args: [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}],
    kwargs: {},
  }).catch(async () => {
    // Fallback: standard authenticate endpoint
    const r = await rpc("/web/session/authenticate", {
      db: ODOO_DB,
      login: ODOO_USER,
      password: ODOO_API_KEY,
    });
    return r?.uid ?? null;
  });

  if (!uid) throw new Error("Odoo: autentisering feilet");
  _uid = uid;
  return uid;
}

// ── Les/Skriv via call_kw ─────────────────────────────────────────────────────
async function callKw(model: string, method: string, args: any[], kwargs: object = {}): Promise<any> {
  const uid = await authenticate();
  return rpc("/web/dataset/call_kw", {
    model,
    method,
    args,
    kwargs: { context: { uid, lang: "nb_NO" }, ...kwargs },
  });
}

// ── Finn eller opprett kontakt i Odoo ─────────────────────────────────────────
export async function finnEllerOpprettKontakt(epost: string, navn?: string): Promise<number> {
  // Søk etter eksisterende partner
  const treff: any[] = await callKw("res.partner", "search_read", [
    [["email", "=", epost]],
    ["id", "name", "email"],
    0, 1,
  ]);

  if (treff.length > 0) return treff[0].id;

  // Opprett ny partner
  const id: number = await callKw("res.partner", "create", [{
    name: navn ?? epost,
    email: epost,
    is_company: false,
  }]);

  return id;
}

// ── Finn eller opprett CRM Lead knyttet til prosjekt ─────────────────────────
export async function finnEllerOpprettLead(prosjektNavn: string, partnerId?: number): Promise<number> {
  const treff: any[] = await callKw("crm.lead", "search_read", [
    [["name", "=", `Tideron – ${prosjektNavn}`]],
    ["id", "name"],
    0, 1,
  ]);

  if (treff.length > 0) return treff[0].id;

  const id: number = await callKw("crm.lead", "create", [{
    name: `Tideron – ${prosjektNavn}`,
    partner_id: partnerId ?? false,
    type: "lead",
    description: `Automatisk opprettet fra Tideron-plattformen for prosjektet "${prosjektNavn}".`,
  }]);

  return id;
}

// ── Logg melding i chatter på en hvilken som helst modell ────────────────────
export async function loggMeldingIChatter(
  model: string,
  recordId: number,
  emne: string,
  kropp: string,
  partnerId?: number,
): Promise<void> {
  await callKw(model, "message_post", [recordId], {
    kwargs: {
      subject: emne,
      body: kropp,
      message_type: "email",
      subtype_xmlid: "mail.mt_comment",
      ...(partnerId ? { partner_ids: [partnerId] } : {}),
    },
  });
}

// ── Synk prosjekt som CRM Opportunity ────────────────────────────────────────
export interface OdooProsjektSync {
  supabaseId:     string;
  navn:           string;
  sted?:          string;
  stadie?:        string;
  lat?:           number | null;
  lon?:           number | null;
  streamType?:    string;
  avgVelocity?:   number;
  // Finansielle KPI-er (valgfritt)
  installedKw?:   number;
  annualKwh?:     number;
  irr?:           number;
  npv?:           number;
  lcoe?:          number;
  capexNok?:      number;
  paybackYr?:     number;
  co2TonnYr?:     number;
  ppaKrKwh?:      number;
  antallRotorer?: number;
}

export async function syncProsjektTilOdoo(p: OdooProsjektSync): Promise<number | null> {
  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_API_KEY) return null;

  try {
    // Finn eksisterende opportunity via x_supabase_id i description
    const soek: any[] = await callKw("crm.lead", "search_read", [
      [["description", "ilike", `supabase_id:${p.supabaseId}`]],
      ["id", "name"],
      0, 1,
    ]);

    const kpiTekst = [
      p.installedKw   != null ? `Installert effekt: ${p.installedKw.toFixed(1)} kW` : "",
      p.annualKwh     != null ? `Årlig produksjon: ${Math.round(p.annualKwh).toLocaleString("nb-NO")} kWh` : "",
      p.irr           != null && isFinite(p.irr) ? `IRR (pre-tax): ${(p.irr * 100).toFixed(1)} %` : "",
      p.npv           != null ? `NPV (8 %, 20 år): ${Math.round(p.npv).toLocaleString("nb-NO")} NOK` : "",
      p.lcoe          != null && p.lcoe > 0 ? `LCOE: ${p.lcoe.toFixed(2)} NOK/kWh` : "",
      p.capexNok      != null ? `CAPEX: ${Math.round(p.capexNok / 1000).toLocaleString("nb-NO")} kNOK` : "",
      p.paybackYr     != null && isFinite(p.paybackYr) ? `Tilbakebetaling: ${p.paybackYr.toFixed(1)} år` : "",
      p.co2TonnYr     != null && p.co2TonnYr > 0 ? `CO₂ spart/år: ~${Math.round(p.co2TonnYr)} tonn` : "",
      p.ppaKrKwh      != null ? `PPA-pris: ${p.ppaKrKwh.toFixed(2)} NOK/kWh` : "",
      p.antallRotorer != null ? `Rotorer: ${p.antallRotorer} stk` : "",
      p.streamType               ? `Strømtype: ${p.streamType}` : "",
      p.avgVelocity   != null    ? `Gjennomsnittshastighet: ${p.avgVelocity.toFixed(2)} m/s` : "",
    ].filter(Boolean).join("\n");

    const desc = [
      `supabase_id:${p.supabaseId}`,
      p.sted    ? `Lokasjon: ${p.sted}` : "",
      p.stadie  ? `Stadie: ${p.stadie}` : "",
      kpiTekst,
      `Kilde: Tideron-plattformen (auto-sync)`,
    ].filter(Boolean).join("\n");

    const vals: Record<string, any> = {
      name:        `${p.navn}`,
      description: desc,
      type:        "opportunity",
    };
    if (p.lat != null) { vals.partner_latitude  = p.lat; }
    if (p.lon != null) { vals.partner_longitude = p.lon; }

    // Prøv custom felt — fallback til description om de mangler
    const xFelt: Record<string, any> = {};
    if (p.streamType)    xFelt.x_stream_type      = p.streamType;
    if (p.avgVelocity)   xFelt.x_avg_velocity_m_s = p.avgVelocity;
    if (p.installedKw)   xFelt.x_installed_kw     = p.installedKw;
    if (p.annualKwh)     xFelt.x_annual_kwh        = p.annualKwh;
    if (p.irr != null && isFinite(p.irr))
                         xFelt.x_irr              = +(p.irr * 100).toFixed(2);
    if (p.npv != null)   xFelt.x_npv              = Math.round(p.npv);
    if (p.capexNok)      xFelt.x_capex_nok        = Math.round(p.capexNok);
    if (p.paybackYr != null && isFinite(p.paybackYr))
                         xFelt.x_payback_yr       = +p.paybackYr.toFixed(2);
    if (p.co2TonnYr)     xFelt.x_co2_tonn_yr      = Math.round(p.co2TonnYr);
    if (p.lcoe)          xFelt.x_lcoe             = +p.lcoe.toFixed(4);
    if (p.ppaKrKwh)      xFelt.x_ppa_kr_kwh       = p.ppaKrKwh;
    if (p.antallRotorer) xFelt.x_antall_rotorer   = p.antallRotorer;
    if (p.stadie)        xFelt.x_stadie           = p.stadie;

    let id: number;

    if (soek.length > 0) {
      // Oppdater eksisterende
      id = soek[0].id;
      await callKw("crm.lead", "write", [[id], { ...vals, ...xFelt }])
        .catch(() => callKw("crm.lead", "write", [[id], vals]));
    } else {
      // Opprett ny — prøv med x-felt, fallback uten
      id = await callKw("crm.lead", "create", [{ ...vals, ...xFelt }])
        .catch(() => callKw("crm.lead", "create", [vals]));
    }

    return id;
  } catch (err) {
    console.error("Odoo prosjektsynk feilet:", err);
    return null;
  }
}

// ── Logg besøk på investor-pitch i Odoo chatter ───────────────────────────────
export interface OdooPitchBesøk {
  prosjektNavn:  string;
  investorNavn?: string;
  investorEpost: string;
  visitCount:    number;
  erForsteGang:  boolean;
  pitchType?:    string;
}

export async function loggPitchBesøkIOdoo(b: OdooPitchBesøk): Promise<void> {
  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_API_KEY) return;
  try {
    const partnerId = await finnEllerOpprettKontakt(b.investorEpost, b.investorNavn);
    const leadId    = await finnEllerOpprettLead(b.prosjektNavn, partnerId);

    const tidspunkt = new Date().toLocaleString("nb-NO", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    const emne = b.erForsteGang
      ? `🎉 ${b.investorNavn ?? b.investorEpost} åpnet pitchen for første gang`
      : `👀 ${b.investorNavn ?? b.investorEpost} besøkte pitchen (besøk #${b.visitCount})`;

    const kropp = `
      <p><strong>Investor:</strong> ${b.investorNavn ?? "—"} &lt;${b.investorEpost}&gt;</p>
      <p><strong>Tidspunkt:</strong> ${tidspunkt}</p>
      <p><strong>Besøk nr.:</strong> ${b.visitCount}</p>
      ${b.pitchType ? `<p><strong>Pitch-type:</strong> ${b.pitchType}</p>` : ""}
      <p><em>Automatisk logg fra Tideron investor-portal</em></p>
    `;
    await loggMeldingIChatter("crm.lead", leadId, emne, kropp, partnerId);
  } catch (err) {
    console.error("Odoo pitch-besøk logg feilet:", err);
  }
}

// ── Høynivå-funksjon: logg utgående e-post ───────────────────────────────────
export interface OdooEpostLogg {
  mottakerEpost: string;
  mottakerNavn?: string;
  emne: string;
  html: string;
  prosjektNavn: string;
}

export async function loggEpostIOdoo(logg: OdooEpostLogg): Promise<void> {
  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_API_KEY) {
    console.warn("Odoo: env-variabler mangler, hopper over logging");
    return;
  }

  try {
    const partnerId = await finnEllerOpprettKontakt(logg.mottakerEpost, logg.mottakerNavn);
    const leadId    = await finnEllerOpprettLead(logg.prosjektNavn, partnerId);

    const kropp = `
      <p><strong>Til:</strong> ${logg.mottakerNavn ?? ""} &lt;${logg.mottakerEpost}&gt;</p>
      <p><strong>Emne:</strong> ${logg.emne}</p>
      <hr/>
      ${logg.html}
    `;

    await loggMeldingIChatter("crm.lead", leadId, logg.emne, kropp, partnerId);
  } catch (err) {
    // Logging er best-effort — ikke blokker e-postsending om Odoo er nede
    console.error("Odoo logg feilet:", err);
  }
}
