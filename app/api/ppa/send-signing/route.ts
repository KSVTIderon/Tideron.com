import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { contract_id, signer_email, signer_navn } = await req.json();
  if (!contract_id || !signer_email)
    return NextResponse.json({ error: "Mangler felter" }, { status: 400 });

  const supabase = createClient();

  // Create or reuse a token for this email
  const { data: existing } = await supabase
    .from("ppa_signing_tokens")
    .select("id, token")
    .eq("contract_id", contract_id)
    .eq("signer_email", signer_email)
    .is("signed_at", null)
    .single();

  let token: string;
  if (existing) {
    token = existing.token;
  } else {
    const { data: created, error } = await supabase
      .from("ppa_signing_tokens")
      .insert({ contract_id, signer_email, signer_navn: signer_navn ?? null })
      .select("token")
      .single();
    if (error || !created) return NextResponse.json({ error: error?.message }, { status: 500 });
    token = created.token;
  }

  // Fetch contract for context
  const { data: c } = await supabase
    .from("ppa_contracts").select("motpart, kjoper_navn").eq("id", contract_id).single();

  const appUrl = process.env.NEXTAUTH_URL ?? "https://tideron-app.vercel.app";
  const signerUrl = `${appUrl}/sign/${token}`;

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return NextResponse.json({ error: "Mangler RESEND_API_KEY" }, { status: 500 });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tideron <noreply@tideron.com>",
      to: [signer_email],
      subject: "PPA-avtale til signering",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#0F2A5A;padding:24px 32px">
            <span style="color:#fff;font-weight:700;font-size:20px;letter-spacing:4px">TIDERON</span>
          </div>
          <div style="padding:32px">
            <h2 style="color:#0F2A5A;margin-top:0">PPA-kraftkjøpsavtale til signering</h2>
            <p>Hei${signer_navn ? ` ${signer_navn}` : ""},</p>
            <p>En kraftkjøpsavtale (PPA) er klar for gjennomgang og signering${c?.kjoper_navn ? ` fra ${c.kjoper_navn}` : ""}.</p>
            <p>Klikk på lenken under for å lese og signere avtalen:</p>
            <div style="margin:32px 0;text-align:center">
              <a href="${signerUrl}"
                style="background:#0F2A5A;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
                Åpne og signer avtalen
              </a>
            </div>
            <p style="color:#64748b;font-size:13px">
              Lenken er unik for deg og vil registrere signaturen digitalt med din IP-adresse og tidsstempel.
              Lenken kan ikke deles med andre.
            </p>
            <p style="color:#64748b;font-size:13px">
              Direktelenke: <a href="${signerUrl}" style="color:#0F2A5A">${signerUrl}</a>
            </p>
          </div>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  // Mark contract signing_status as sent
  await supabase.from("ppa_contracts")
    .update({ signing_status: "sendt" })
    .eq("id", contract_id);

  return NextResponse.json({ ok: true, token });
}
