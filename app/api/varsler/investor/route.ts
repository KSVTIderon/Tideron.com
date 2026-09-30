import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loggEpostIOdoo } from "@/lib/odoo";

/** Konverterer pitch-plaintekst til lesbar HTML for e-post */
function pitchTilHtml(tekst: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const linjer = tekst.split("\n");
  const ut: string[] = [];
  let iListe = false;

  const lukkListe = () => {
    if (iListe) { ut.push("</ul>"); iListe = false; }
  };

  for (let i = 0; i < linjer.length; i++) {
    const linje = linjer[i];
    const trimmet = linje.trim();

    // Skillelinje ═══ eller ───
    if (/^[═─]{6,}/.test(trimmet)) {
      lukkListe();
      ut.push('<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">');
      continue;
    }

    // Tom linje
    if (trimmet === "") {
      lukkListe();
      ut.push('<div style="height:8px"></div>');
      continue;
    }

    // Seksjonstittel: "1. SAMMENDRAG" eller "2. PROBLEM OG MARKEDSMULIGHET"
    if (/^\d+\.\s+[A-ZÆØÅ\s]{4,}$/.test(trimmet)) {
      lukkListe();
      ut.push(`<h3 style="color:#0F2A5A;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:20px 0 8px;">${esc(trimmet)}</h3>`);
      continue;
    }

    // Underseksjon: "3.1 Ytelsesdata" (nummer.nummer + tekst)
    if (/^\d+\.\d+\s+/.test(trimmet)) {
      lukkListe();
      ut.push(`<p style="font-weight:600;color:#334155;margin:14px 0 4px;">${esc(trimmet)}</p>`);
      continue;
    }

    // Stor overskrift (kun store bokstaver, over 6 tegn)
    if (/^[A-ZÆØÅ0-9 ,.\-–()]{6,}$/.test(trimmet) && !trimmet.includes("|") && !trimmet.includes(":")) {
      lukkListe();
      ut.push(`<h2 style="color:#0F2A5A;font-size:16px;font-weight:700;margin:8px 0 4px;">${esc(trimmet)}</h2>`);
      continue;
    }

    // Bullet-punkt (•)
    if (trimmet.startsWith("•")) {
      if (!iListe) { ut.push('<ul style="margin:8px 0;padding-left:20px;color:#475569;">'); iListe = true; }
      ut.push(`<li style="margin:3px 0;font-size:13px;">${esc(trimmet.slice(1).trim())}</li>`);
      continue;
    }

    // Nummerert liste "  1. Fullfor..."
    if (/^\s{2,}\d+\.\s/.test(linje)) {
      lukkListe();
      ut.push(`<p style="margin:4px 0 4px 16px;color:#475569;font-size:13px;">${esc(trimmet)}</p>`);
      continue;
    }

    // Tabell-rad (inneholder |)
    if (trimmet.includes("|")) {
      lukkListe();
      const celler = trimmet.split("|").map(c => esc(c.trim()));
      const erHeader = /^[─\-═ |]+$/.test(trimmet);
      if (!erHeader) {
        ut.push(`<p style="font-family:Inter,Helvetica,sans-serif;font-size:12px;color:#475569;margin:2px 0;white-space:pre;">${esc(linje)}</p>`);
      }
      continue;
    }

    // Nøkkel-verdi-rad (inneholder to+ mellomrom + kolon eller mye whitespace)
    if (/^  .{10,}:/.test(linje) || /^\s{2,}\S.{4,}\s{4,}\S/.test(linje)) {
      lukkListe();
      ut.push(`<p style="font-family:Inter,Helvetica,sans-serif;font-size:12px;color:#334155;margin:2px 0;white-space:pre;">${esc(linje.trimEnd())}</p>`);
      continue;
    }

    // Vanlig avsnitt
    lukkListe();
    ut.push(`<p style="color:#334155;font-size:14px;line-height:1.6;margin:6px 0;">${esc(trimmet)}</p>`);
  }

  lukkListe();
  return ut.join("\n");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { project_id, investor_epost, investor_navn, pitch_tekst, pitch_type } = body;

  if (!project_id || !investor_epost) {
    return NextResponse.json({ error: "Mangler felter" }, { status: 400 });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY ikke satt" }, { status: 500 });
  }

  const supabase = createClient();
  const { data: p } = await supabase
    .from("projects").select("navn,sted,stadie").eq("id", project_id).single();

  if (!p) return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });

  const appUrl = process.env.NEXTAUTH_URL ?? "https://tideron-app.vercel.app";

  // Opprett sporingstoken
  const { data: tokenRad } = await supabase
    .from("investor_tokens")
    .insert({
      project_id,
      email: investor_epost,
      navn: investor_navn ?? null,
      pitch_type: pitch_type ?? null,
      pitch_tekst: pitch_tekst ?? null,
    })
    .select("token")
    .single();

  const pitchUrl = tokenRad?.token
    ? `${appUrl}/investor/${tokenRad.token}`
    : `${appUrl}/prosjekter/${project_id}/investor`;

  const pitchEtikett = pitch_type === "teaser"
    ? "Investor Teaser"
    : pitch_type === "full"
    ? "Investorpitch"
    : null;

  // Konverter pitch til HTML — feil her skal ikke stoppe sending
  let pitchHtmlBlokk = "";
  if (pitch_tekst) {
    try {
      const html = pitchTilHtml(pitch_tekst);
      pitchHtmlBlokk = [
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #0F2A5A;border-radius:8px;padding:28px 32px;margin:0 0 28px;">',
        html,
        "</div>",
      ].join("");
    } catch { /* send uten pitch-innhold om konvertering feiler */ }
  }

  const harPitch = pitchHtmlBlokk.length > 0;

  // Bygg e-post via string-konkatenasjon (unngår template-literal-konflikter med backticks i pitchtekst)
  const hilsen = "Hei" + (investor_navn ? " " + investor_navn : "") + ",";
  const ingress = "Vedlagt finner du "
    + (pitchEtikett ? "en " + pitchEtikett.toLowerCase() : "investorpitch")
    + " for prosjektet <strong>" + p.navn + "</strong>"
    + (p.stadie ? " (stadie: " + p.stadie + ")" : "") + "."
    + (harPitch ? " Pitchen er inkludert under. Åpne lenken nedenfor for den interaktive versjonen med kart og finansielle detaljer." : "");

  const html = "<div style=\"font-family:Inter,Helvetica,sans-serif;max-width:680px;margin:0 auto;background:#f8fafc;\">"
    + "<div style=\"background:#0F2A5A;padding:36px 40px;border-radius:12px 12px 0 0;\">"
    + "<p style=\"color:rgba(255,255,255,0.55);font-size:11px;margin:0 0 10px;text-transform:uppercase;letter-spacing:2.5px;\">Tideron AS — Investor pitch</p>"
    + "<h1 style=\"color:#fff;margin:0;font-size:26px;font-weight:700;line-height:1.2;\">" + (p.navn ?? "") + "</h1>"
    + "<p style=\"color:rgba(255,255,255,0.65);margin:10px 0 0;font-size:14px;\">"
    + (p.sted ?? "") + (pitchEtikett ? " &nbsp;·&nbsp; " + pitchEtikett : "")
    + "</p></div>"
    + "<div style=\"background:#fff;padding:36px 40px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;\">"
    + "<p style=\"color:#334155;font-size:15px;margin:0 0 8px;\">" + hilsen + "</p>"
    + "<p style=\"color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;\">" + ingress + "</p>"
    + pitchHtmlBlokk
    + "<div style=\"text-align:center;margin:28px 0;\">"
    + "<a href=\"" + pitchUrl + "\" style=\"display:inline-block;background:#0F2A5A;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;\">Åpne fullstendig investorpitch &rarr;</a>"
    + "</div>"
    + "<hr style=\"border:none;border-top:1px solid #e2e8f0;margin:28px 0;\">"
    + "<p style=\"color:#94a3b8;font-size:12px;line-height:1.6;margin:0;\">Sendt fra Tideron-plattformen på vegne av Kai Svendstad.<br>"
    + "Spørsmål? Svar på denne e-posten eller skriv til <a href=\"mailto:ksv@tideron.com\" style=\"color:#0F2A5A;\">ksv@tideron.com</a>.<br>"
    + "Tideron AS · Ortnevik 3, 5962 Bjordal</p>"
    + "</div></div>";

  const subject = pitch_type === "teaser"
    ? `Teaser: ${p.navn} — Hydrokinetisk kraftprosjekt`
    : pitch_type === "full"
    ? `Investorpitch: ${p.navn} — Fullstendig gjennomgang`
    : `Investor pitch: ${p.navn}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tideron AS <post@tideron.com>",
      reply_to: "ksv@tideron.com",
      to: investor_epost,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    let errBody: any = {};
    try { errBody = await res.json(); } catch { errBody = { message: await res.text() }; }
    const melding = errBody?.message ?? errBody?.name ?? JSON.stringify(errBody).slice(0, 300);
    console.error("Resend feil:", res.status, errBody);
    return NextResponse.json(
      { error: `Resend (${res.status}): ${melding}` },
      { status: 500 }
    );
  }

  // Logg til Odoo chatter (best-effort — blokkerer ikke svar)
  loggEpostIOdoo({
    mottakerEpost: investor_epost,
    mottakerNavn:  investor_navn,
    emne:          subject,
    html,
    prosjektNavn:  p.navn ?? project_id,
  }).catch(err => console.error("Odoo investor-logg feil:", err));

  return NextResponse.json({ ok: true });
}
