/**
 * POST /api/varsler/melding-nve
 *
 * Sender NVE Melding om konsesjonspliktvurdering som e-post med Word-vedlegg.
 * Tar imot multipart/form-data fordi vedlegget er en binærfil (docx blob).
 *
 * Felter:
 *   project_id        – Supabase-prosjekt-ID
 *   mottaker_epost    – NVEs e-postadresse (f.eks. post@nve.no)
 *   mottaker_navn     – «NVE» eller regionkontor
 *   emne              – e-postemne
 *   html              – e-posttekst (HTML)
 *   vedlegg           – binær .docx-fil
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY ikke satt" }, { status: 500 });
  }

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ugyldig form-data" }, { status: 400 });
  }

  const projectId    = formData.get("project_id") as string | null;
  const mottakerEpost = formData.get("mottaker_epost") as string | null;
  const mottakerNavn = formData.get("mottaker_navn") as string | null;
  const emne         = formData.get("emne") as string | null;
  const htmlTekst    = formData.get("html") as string | null;
  const vedleggFile    = formData.get("vedlegg") as File | null;
  const kartutsnittFile = formData.get("kartutsnitt") as File | null;

  if (!projectId || !mottakerEpost || !vedleggFile) {
    return NextResponse.json({ error: "Mangler påkrevde felter: project_id, mottaker_epost, vedlegg" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: p } = await supabase
    .from("projects")
    .select("navn, sted")
    .eq("id", projectId)
    .single();

  const prosjektNavn = p?.navn ?? projectId;

  // Konverter vedlegg til base64
  const vedleggBuffer = Buffer.from(await vedleggFile.arrayBuffer());
  const vedleggBase64 = vedleggBuffer.toString("base64");
  const filNavn = vedleggFile.name || `melding-om-kraftverk-${prosjektNavn}.docx`;

  // Avsenders e-post (Resend krever verified domain)
  const fraEpost = "soknad@tideron.com";
  const fraVennlig = "Tideron Søknadssystem";
  const kopimottaker = "ksv@tideron.com";

  const emailBody = {
    from: `${fraVennlig} <${fraEpost}>`,
    to: [mottakerEpost],
    cc: [kopimottaker],
    reply_to: kopimottaker,
    subject: emne ?? `Melding om konsesjonspliktvurdering: ${prosjektNavn}`,
    html: `
<div style="font-family:Inter,Helvetica,sans-serif;max-width:680px;margin:0 auto;background:#f8fafc;">
  <div style="background:#0F2A5A;padding:32px 40px;border-radius:12px 12px 0 0;">
    <p style="color:rgba(255,255,255,0.5);font-size:11px;margin:0 0 10px;text-transform:uppercase;letter-spacing:2px;">
      Tideron AS — Melding etter vannressursloven § 18
    </p>
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;line-height:1.2;">
      ${prosjektNavn}
    </h1>
    ${p?.sted ? `<p style="color:rgba(255,255,255,0.6);margin:8px 0 0;font-size:13px;">${p.sted}</p>` : ""}
  </div>
  <div style="background:#fff;padding:36px 40px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="color:#334155;font-size:15px;margin:0 0 16px;">
      Hei${mottakerNavn ? " " + mottakerNavn : ""},
    </p>
    ${htmlTekst ?? ""}
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:16px 0;">
      Det offisielle NVE-meldeskjemaet er vedlagt som Word-dokument og kan
      behandles i henhold til gjeldende rutiner.
    </p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
    <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:0;">
      Sendt fra Tideron-plattformen.<br>
      Svar til: Kai Svendstad, ${kopimottaker}
    </p>
  </div>
</div>`,
    attachments: [
      {
        filename: filNavn,
        content: vedleggBase64,
        content_type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      // Kartutsnitt-PNG legges ved automatisk dersom det er generert
      ...(kartutsnittFile
        ? [{
            filename: "kartutsnitt-rotorplassering.png",
            content: Buffer.from(await kartutsnittFile.arrayBuffer()).toString("base64"),
            content_type: "image/png",
          }]
        : []),
    ],
  };

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailBody),
  });

  if (!resendRes.ok) {
    const err = await resendRes.text();
    return NextResponse.json({ error: `Resend feil: ${err}` }, { status: 500 });
  }

  // Logg e-posten i Supabase (best-effort)
  try {
    await supabase.from("email_logs").insert({
      project_id: projectId,
      mottaker: mottakerEpost,
      emne: emailBody.subject,
      type: "soknad_nve",
      sendt_av: "system",
    });
  } catch { /* ikke kritisk */ }

  return NextResponse.json({ ok: true });
}
