import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loggEpostIOdoo } from "@/lib/odoo";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    project_id,
    mottaker_epost,
    mottaker_navn,
    notat_html,    // ferdig rendret HTML fra KommunenotatView
    notat_emne,   // emne-linje
  } = body;

  if (!project_id || !mottaker_epost || !notat_html) {
    return NextResponse.json({ error: "Mangler felter" }, { status: 400 });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY ikke satt" }, { status: 500 });
  }

  const supabase = createClient();
  const { data: p } = await supabase
    .from("projects")
    .select("navn, sted, lat, lon")
    .eq("id", project_id)
    .single();

  if (!p) return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });

  const hilsen = "Hei" + (mottaker_navn ? " " + mottaker_navn : "") + ",";
  const emne = notat_emne ?? `Planavklaringsnotat: ${p.navn}`;

  const html = `
<div style="font-family:Inter,Helvetica,sans-serif;max-width:720px;margin:0 auto;background:#f8fafc;">
  <div style="background:#0F2A5A;padding:36px 40px;border-radius:12px 12px 0 0;">
    <p style="color:rgba(255,255,255,0.55);font-size:11px;margin:0 0 10px;text-transform:uppercase;letter-spacing:2.5px;">
      Tideron AS — Planavklaring
    </p>
    <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;line-height:1.2;">
      ${p.navn ?? ""}
    </h1>
    <p style="color:rgba(255,255,255,0.65);margin:10px 0 0;font-size:14px;">${p.sted ?? ""}</p>
  </div>
  <div style="background:#fff;padding:36px 40px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="color:#334155;font-size:15px;margin:0 0 16px;">${hilsen}</p>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 28px;">
      Vedlagt finner du planavklaringsnotat for prosjektet <strong>${p.navn}</strong>.
      Notatet er utarbeidet i henhold til plan- og bygningsloven § 12-8 og gir et
      grunnlag for videre dialog med kommunen om reguleringsbehovet.
    </p>
    <div style="border:1px solid #e2e8f0;border-left:4px solid #0F2A5A;border-radius:8px;padding:32px 36px;margin:0 0 28px;">
      ${notat_html}
    </div>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0;">
    <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:0;">
      Sendt fra Tideron-plattformen.<br>
      Spørsmål? Kontakt Kai Svendstad på
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
      subject: emne,
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
    emne,
    html,
    prosjektNavn:  p.navn ?? project_id,
  }).catch(err => console.error("Odoo kommunenotat-logg feil:", err));

  return NextResponse.json({ ok: true });
}
