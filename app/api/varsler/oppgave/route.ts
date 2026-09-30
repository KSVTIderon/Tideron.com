import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/varsler/oppgave
// Sender e-post til mottaker når en oppgave opprettes eller forfaller
export async function POST(req: NextRequest) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return NextResponse.json({ ok: false, melding: "RESEND_API_KEY ikke konfigurert" }, { status: 500 });
  }

  const { task_id } = await req.json();
  if (!task_id) return NextResponse.json({ error: "task_id påkrevd" }, { status: 400 });

  // Hent oppgaven med brukerinfo og prosjektinfo
  const { data: task, error } = await supabaseAdmin
    .from("tasks")
    .select(`
      tittel, beskrivelse, frist, prioritet,
      profiles!tasks_tildelt_til_fkey(navn, epost),
      projects(navn)
    `)
    .eq("id", task_id)
    .single();

  if (error || !task) {
    return NextResponse.json({ error: "Oppgave ikke funnet" }, { status: 404 });
  }

  const mottaker = (task as any).profiles;
  const prosjekt = (task as any).projects;

  if (!mottaker?.epost) {
    return NextResponse.json({ ok: false, melding: "Mottaker har ingen e-post" });
  }

  const fristTekst = task.frist
    ? new Date(task.frist).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" })
    : "Ingen frist";

  const html = `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="background:#0F2A5A;border-radius:12px;padding:24px;margin-bottom:24px;">
        <p style="color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">Tideron</p>
        <h2 style="color:white;margin:0;font-size:20px;">Ny oppgave tildelt deg</h2>
      </div>
      <p style="color:#475569;font-size:14px;margin:0 0 4px;">Hei ${mottaker.navn},</p>
      <p style="color:#475569;font-size:14px;margin:0 0 24px;">Du har fått en ny oppgave i prosjekt <strong>${prosjekt?.navn ?? "Ukjent"}</strong>:</p>
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin-bottom:24px;">
        <p style="font-size:16px;font-weight:600;color:#0F172A;margin:0 0 12px;">${task.tittel}</p>
        ${task.beskrivelse ? `<p style="color:#64748B;font-size:14px;margin:0 0 12px;">${task.beskrivelse}</p>` : ""}
        <table style="font-size:13px;width:100%;border-collapse:collapse;">
          <tr>
            <td style="color:#94A3B8;padding:4px 0;width:40%;">Prioritet</td>
            <td style="color:#0F172A;font-weight:500;">${task.prioritet}</td>
          </tr>
          <tr>
            <td style="color:#94A3B8;padding:4px 0;">Frist</td>
            <td style="color:${task.frist ? "#EF4444" : "#64748B"};font-weight:500;">${fristTekst}</td>
          </tr>
        </table>
      </div>
      <a href="${process.env.NEXTAUTH_URL ?? "https://tideron-app.vercel.app"}/mine-oppgaver"
         style="display:inline-block;background:#0F2A5A;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;">
        Åpne Mine oppgaver →
      </a>
      <p style="color:#CBD5E1;font-size:12px;margin-top:32px;">Sendt fra Tideron · <a href="https://tideron.com" style="color:#94A3B8;">tideron.com</a></p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tideron <varsler@tideron.com>",
      to: [mottaker.epost],
      subject: `Ny oppgave: ${task.tittel} — ${prosjekt?.navn ?? ""}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: "Resend-feil", details: err }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
