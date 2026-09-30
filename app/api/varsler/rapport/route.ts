import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loggEpostIOdoo } from "@/lib/odoo";

type Lang = "no" | "en" | "es" | "de";

const EM: Record<Lang, {
  subject: (navn: string) => string;
  greeting: (name: string | null) => string;
  body: (navn: string) => string;
  btnText: string;
  footer: string;
  streamType: string;
  avgVelocity: string;
  width: string;
  dataSource: string;
  rotors: string;
  stage: string;
}> = {
  no: {
    subject:      (n)    => `Teknisk rapport: ${n}`,
    greeting:     (name) => "Hei" + (name ? " " + name : "") + ",",
    body:         (n)    => `Vedlagt finner du den tekniske rapporten for prosjektet <strong>${n}</strong>. Rapporten inneholder kartvisning av rotor-plassering med fysiske mål, svept areal, bunnforhold og effektestimat.`,
    btnText:      "Åpne teknisk rapport →",
    footer:       "Sendt fra Tideron-plattformen på vegne av Kai Svendstad.<br>Spørsmål? Svar på denne e-posten eller skriv til",
    streamType:   "Strømtype",
    avgVelocity:  "Gjennomsnittshastighet",
    width:        "Bredde på strekning",
    dataSource:   "Datakilde",
    rotors:       "Rotorer plassert",
    stage:        "Prosjektstadie",
  },
  en: {
    subject:      (n)    => `Technical report: ${n}`,
    greeting:     (name) => "Dear" + (name ? " " + name : "") + ",",
    body:         (n)    => `Please find attached the technical report for project <strong>${n}</strong>. The report includes a map of rotor placement with physical dimensions, swept area, seabed conditions, and power estimates.`,
    btnText:      "Open technical report →",
    footer:       "Sent from the Tideron platform on behalf of Kai Svendstad.<br>Questions? Reply to this email or write to",
    streamType:   "Stream type",
    avgVelocity:  "Average velocity",
    width:        "Cross-section width",
    dataSource:   "Data source",
    rotors:       "Rotors placed",
    stage:        "Project stage",
  },
  es: {
    subject:      (n)    => `Informe técnico: ${n}`,
    greeting:     (name) => "Estimado/a" + (name ? " " + name : "") + ",",
    body:         (n)    => `Adjunto encontrará el informe técnico del proyecto <strong>${n}</strong>. El informe incluye un mapa de la ubicación de los rotores con dimensiones físicas, área barrida, condiciones del fondo y estimaciones de potencia.`,
    btnText:      "Abrir informe técnico →",
    footer:       "Enviado desde la plataforma Tideron en nombre de Kai Svendstad.<br>¿Preguntas? Responda a este correo o escriba a",
    streamType:   "Tipo de corriente",
    avgVelocity:  "Velocidad media",
    width:        "Anchura de la sección",
    dataSource:   "Fuente de datos",
    rotors:       "Rotores instalados",
    stage:        "Etapa del proyecto",
  },
  de: {
    subject:      (n)    => `Technischer Bericht: ${n}`,
    greeting:     (name) => "Guten Tag" + (name ? " " + name : "") + ",",
    body:         (n)    => `Anbei finden Sie den technischen Bericht für das Projekt <strong>${n}</strong>. Der Bericht enthält eine Karte der Rotorpositionierung mit physischen Abmessungen, der überstrichenen Fläche, Bodenbedingungen und Leistungsabschätzungen.`,
    btnText:      "Technischen Bericht öffnen →",
    footer:       "Gesendet von der Tideron-Plattform im Auftrag von Kai Svendstad.<br>Fragen? Antworten Sie auf diese E-Mail oder schreiben Sie an",
    streamType:   "Strömungstyp",
    avgVelocity:  "Mittlere Geschwindigkeit",
    width:        "Querschnittsbreite",
    dataSource:   "Datenquelle",
    rotors:       "Platzierte Rotoren",
    stage:        "Projektphase",
  },
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { project_id, mottaker_epost, mottaker_navn, lang: rawLang } = body;
  const lang: Lang = (["no","en","es","de"] as Lang[]).includes(rawLang) ? rawLang : "no";
  const em = EM[lang];

  if (!project_id || !mottaker_epost) {
    return NextResponse.json({ error: "Mangler felter" }, { status: 400 });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY ikke satt" }, { status: 500 });
  }

  const supabase = createClient();
  const [{ data: p }, { data: r }, { data: s }] = await Promise.all([
    supabase.from("projects").select("navn, sted, stadie").eq("id", project_id).single(),
    supabase.from("rotors").select("lat, lon, modell, diameter_m, lengde_m, hoyde_m").eq("project_id", project_id),
    supabase.from("streams").select("stream_type, avg_velocity_m_s, peak_velocity_m_s, bredde_m, datakilde").eq("project_id", project_id).single(),
  ]);

  if (!p) return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });

  const appUrl = process.env.NEXTAUTH_URL ?? "https://tideron-app.vercel.app";
  const rapportUrl = `${appUrl}/prosjekter/${project_id}/rapport`;

  const placed = (r ?? []).filter((rot: any) => rot.lat && rot.lon);
  const hilsen = em.greeting(mottaker_navn ?? null);

  const streamTypeLabel: Record<Lang, Record<string, string>> = {
    no: { tidevann: "Tidevann", elv: "Elv", "havstrøm": "Havstrøm" },
    en: { tidevann: "Tidal",    elv: "River",  "havstrøm": "Ocean current" },
    es: { tidevann: "Mareal",   elv: "Fluvial","havstrøm": "Corriente oceánica" },
    de: { tidevann: "Gezeit",   elv: "Fluss",  "havstrøm": "Meeresströmung" },
  };
  const streamType = s?.stream_type ? (streamTypeLabel[lang][s.stream_type] ?? s.stream_type) : null;
  const avgV = s?.avg_velocity_m_s ?? s?.peak_velocity_m_s;
  const numLocale = lang === "de" ? "de-DE" : lang === "es" ? "es-ES" : "nb-NO";

  const streamRad = [
    streamType ? `<tr><td style="color:#94a3b8;padding:4px 0;width:180px;">${em.streamType}</td><td style="color:#334155;font-weight:500;">${streamType}</td></tr>` : "",
    avgV ? `<tr><td style="color:#94a3b8;padding:4px 0;">${em.avgVelocity}</td><td style="color:#334155;font-weight:500;">${(+avgV).toFixed(2)} m/s</td></tr>` : "",
    s?.bredde_m ? `<tr><td style="color:#94a3b8;padding:4px 0;">${em.width}</td><td style="color:#334155;font-weight:500;">${(+s.bredde_m).toLocaleString(numLocale)} m</td></tr>` : "",
    s?.datakilde ? `<tr><td style="color:#94a3b8;padding:4px 0;">${em.dataSource}</td><td style="color:#334155;font-weight:500;">${s.datakilde}</td></tr>` : "",
    `<tr><td style="color:#94a3b8;padding:4px 0;">${em.rotors}</td><td style="color:#334155;font-weight:500;">${placed.length} stk</td></tr>`,
    p.stadie ? `<tr><td style="color:#94a3b8;padding:4px 0;">${em.stage}</td><td style="color:#334155;font-weight:500;">${p.stadie}</td></tr>` : "",
  ].filter(Boolean).join("\n");

  const html = `<div style="font-family:Inter,Helvetica,sans-serif;max-width:680px;margin:0 auto;background:#f8fafc;">
  <div style="background:#0F2A5A;padding:36px 40px;border-radius:12px 12px 0 0;">
    <p style="color:rgba(255,255,255,0.55);font-size:11px;margin:0 0 10px;text-transform:uppercase;letter-spacing:2.5px;">Tideron AS — ${lang === "de" ? "Technischer Bericht" : lang === "es" ? "Informe técnico" : lang === "en" ? "Technical report" : "Teknisk rapport"}</p>
    <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;line-height:1.2;">${p.navn ?? ""}</h1>
    <p style="color:rgba(255,255,255,0.65);margin:10px 0 0;font-size:14px;">${p.sted ?? ""}</p>
  </div>
  <div style="background:#fff;padding:36px 40px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="color:#334155;font-size:15px;margin:0 0 8px;">${hilsen}</p>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">
      ${em.body(p.navn ?? "")}
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #0F2A5A;border-radius:8px;padding:20px 24px;margin:0 0 28px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${streamRad}
      </table>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${rapportUrl}" style="display:inline-block;background:#0F2A5A;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">${em.btnText}</a>
    </div>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0;">
    <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:0;">
      ${em.footer}
      <a href="mailto:ksv@tideron.com" style="color:#0F2A5A;">ksv@tideron.com</a>.<br>
      Tideron AS &nbsp;·&nbsp; Ortnevik 3, 5962 Bjordal
    </p>
  </div>
</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tideron AS <post@tideron.com>",
      reply_to: "ksv@tideron.com",
      to: mottaker_epost,
      subject: em.subject(p.navn ?? ""),
      html,
    }),
  });

  if (!res.ok) {
    let errBody: any = {};
    try { errBody = await res.json(); } catch { errBody = { message: await res.text() }; }
    const melding = errBody?.message ?? errBody?.name ?? JSON.stringify(errBody).slice(0, 300);
    console.error("Resend feil:", res.status, errBody);
    return NextResponse.json({ error: `Resend (${res.status}): ${melding}` }, { status: 500 });
  }

  // Logg til Odoo chatter (best-effort)
  loggEpostIOdoo({
    mottakerEpost: mottaker_epost,
    mottakerNavn:  mottaker_navn,
    emne:          em.subject(p.navn ?? ""),
    html,
    prosjektNavn:  p.navn ?? project_id,
  }).catch(err => console.error("Odoo rapport-logg feil:", err));

  return NextResponse.json({ ok: true });
}
