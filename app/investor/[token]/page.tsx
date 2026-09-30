import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { loggPitchBesøkIOdoo } from "@/lib/odoo";

/** McKinsey-style pitch renderer */
function pitchTilHtml(tekst: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const linjer = tekst.split("\n");
  const ut: string[] = [];
  let iListe = false;
  let iTabell = false;
  let tabellRader: string[][] = [];

  const lukkListe = () => {
    if (iListe) { ut.push("</ul>"); iListe = false; }
  };

  const lukkTabell = () => {
    if (!iTabell || tabellRader.length === 0) { iTabell = false; return; }
    iTabell = false;
    const header = tabellRader[0];
    const body = tabellRader.slice(1);
    ut.push('<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">');
    ut.push('<thead><tr>');
    header.forEach(c => ut.push(`<th style="text-align:left;padding:8px 12px;font-weight:700;color:#0F2A5A;border-bottom:2px solid #0F2A5A;font-size:11px;letter-spacing:.5px;text-transform:uppercase;">${esc(c)}</th>`));
    ut.push('</tr></thead><tbody>');
    body.forEach((row, i) => {
      const bg = i % 2 === 0 ? "#fff" : "#F9FAFB";
      ut.push(`<tr style="background:${bg}">`);
      row.forEach(c => ut.push(`<td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;color:#374151;">${esc(c)}</td>`));
      ut.push('</tr>');
    });
    ut.push('</tbody></table>');
    tabellRader = [];
  };

  for (const linje of linjer) {
    const t = linje.trim();

    // Horisontal linje
    if (/^[═─]{6,}/.test(t)) {
      lukkListe(); lukkTabell();
      ut.push('<hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0;">');
      continue;
    }

    // Tom linje
    if (t === "") {
      lukkListe(); lukkTabell();
      ut.push('<div style="height:10px"></div>');
      continue;
    }

    // Tabell-rad (inneholder |)
    if (t.includes("|") && !/^[─\-═ |]+$/.test(t)) {
      lukkListe();
      const celler = t.split("|").map(c => c.trim()).filter(c => c.length > 0);
      if (celler.length >= 2) {
        if (!iTabell) { iTabell = true; tabellRader = []; }
        tabellRader.push(celler);
        continue;
      }
    } else if (iTabell && (t === "" || /^[─\-═ |]+$/.test(t))) {
      lukkTabell();
      continue;
    } else if (iTabell) {
      lukkTabell();
    }

    // Nummerert seksjon: "1. SAMMENDRAG" — McKinsey section header
    if (/^\d+\.\s+[A-ZÆØÅ\s]{4,}$/.test(t)) {
      lukkListe();
      ut.push(
        `<div style="border-top:2px solid #0F2A5A;padding-top:14px;margin:36px 0 12px;">` +
        `<p style="color:#0F2A5A;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0;">${esc(t)}</p>` +
        `</div>`
      );
      continue;
    }

    // Under-seksjon: "3.1 Ytelsesdata"
    if (/^\d+\.\d+\s+/.test(t)) {
      lukkListe();
      ut.push(`<p style="font-size:15px;font-weight:700;color:#111827;margin:20px 0 6px;letter-spacing:-.2px;">${esc(t)}</p>`);
      continue;
    }

    // Stor overskrift (kun store bokstaver)
    if (/^[A-ZÆØÅ0-9 ,.\-–()]{6,}$/.test(t) && !t.includes(":")) {
      lukkListe();
      ut.push(`<p style="font-size:18px;font-weight:700;color:#111827;margin:24px 0 8px;letter-spacing:-.3px;">${esc(t)}</p>`);
      continue;
    }

    // Bullet-punkt (•) — em-dash style
    if (t.startsWith("•")) {
      if (!iListe) {
        ut.push('<ul style="list-style:none;padding:0;margin:8px 0 12px;">');
        iListe = true;
      }
      ut.push(
        `<li style="display:flex;gap:10px;padding:3px 0;color:#374151;font-size:14px;line-height:1.65;">` +
        `<span style="flex-shrink:0;color:#0F2A5A;font-weight:700;margin-top:1px;">—</span>` +
        `<span>${esc(t.slice(1).trim())}</span>` +
        `</li>`
      );
      continue;
    }

    // Nummerert under-liste "  1. Punkt"
    if (/^\s{2,}\d+\.\s/.test(linje)) {
      lukkListe();
      ut.push(
        `<div style="display:flex;gap:8px;padding:2px 0 2px 16px;color:#374151;font-size:14px;line-height:1.6;">` +
        `<span style="flex-shrink:0;font-weight:600;color:#0F2A5A;">${t.match(/^\d+/)![0]}.</span>` +
        `<span>${esc(t.replace(/^\d+\.\s*/, ""))}</span>` +
        `</div>`
      );
      continue;
    }

    // Nøkkel: verdi rad
    if (/^  .{4,}:/.test(linje) || /^\s{2,}\S.{4,}\s{4,}\S/.test(linje)) {
      lukkListe();
      ut.push(`<p style="font-size:13px;color:#374151;margin:2px 0;white-space:pre-wrap;font-variant-numeric:tabular-nums;">${esc(t)}</p>`);
      continue;
    }

    // Vanlig avsnitt
    lukkListe();
    ut.push(`<p style="font-size:15px;line-height:1.75;color:#374151;margin:0 0 10px;">${esc(t)}</p>`);
  }

  lukkListe();
  lukkTabell();
  return ut.join("\n");
}

export default async function OffentligInvestorSide({ params }: { params: { token: string } }) {
  const supabase = createClient();

  const { data: tok } = await supabase
    .from("investor_tokens")
    .select("*, projects(navn, sted, stadie, country_code)")
    .eq("token", params.token)
    .single();

  if (!tok) return notFound();

  const p = tok.projects as any;

  // Registrer besøk
  const now = new Date().toISOString();
  const nyVisitCount = (tok.visit_count ?? 0) + 1;
  const erForsteGang = tok.visit_count === 0;

  await supabase
    .from("investor_tokens")
    .update({
      visit_count:      nyVisitCount,
      last_visited_at:  now,
      first_visited_at: tok.first_visited_at ?? now,
    })
    .eq("token", params.token);

  // Logg besøk til Odoo chatter (best-effort, ikke blokkerende)
  loggPitchBesøkIOdoo({
    prosjektNavn:  p?.navn ?? "Ukjent prosjekt",
    investorNavn:  tok.navn ?? undefined,
    investorEpost: tok.email,
    visitCount:    nyVisitCount,
    erForsteGang,
    pitchType:     tok.pitch_type ?? undefined,
  }).catch(() => {/* best-effort */});

  // Send varsel til Kai
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (RESEND_KEY) {
    const appUrl = process.env.NEXTAUTH_URL ?? "https://tideron-app.vercel.app";
    const dashboardUrl = `${appUrl}/prosjekter/${tok.project_id}/investor`;
    const investorNavn = tok.navn || tok.email;
    const prosjektNavn = p?.navn ?? "Ukjent prosjekt";

    const emne = erForsteGang
      ? `🎉 ${investorNavn} åpnet pitchen for ${prosjektNavn}`
      : `👀 ${investorNavn} er inne igjen — ${prosjektNavn} (besøk #${nyVisitCount})`;

    const tidspunkt = new Date().toLocaleString("nb-NO", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Tideron Varsler <varsler@tideron.com>",
        reply_to: "ksv@tideron.com",
        to: "ksv@tideron.com",
        subject: emne,
        html: `
          <div style="font-family:Inter,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
            <div style="background:${erForsteGang ? "#0F2A5A" : "#1e40af"};padding:28px 32px;border-radius:12px 12px 0 0;">
              <p style="color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">
                Tideron · Investor-varsling
              </p>
              <h1 style="color:#fff;font-size:20px;font-weight:700;margin:0;line-height:1.3;">
                ${erForsteGang ? "🎉 Første besøk!" : `👀 Gjentatt besøk #${nyVisitCount}`}
              </h1>
            </div>
            <div style="background:#fff;padding:28px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <tr><td style="padding:8px 0;color:#64748b;border-bottom:1px solid #f1f5f9;">Investor</td>
                    <td style="padding:8px 0;font-weight:600;color:#1e293b;text-align:right;border-bottom:1px solid #f1f5f9;">${investorNavn}</td></tr>
                ${tok.navn ? `<tr><td style="padding:8px 0;color:#64748b;border-bottom:1px solid #f1f5f9;">E-post</td>
                    <td style="padding:8px 0;color:#1e293b;text-align:right;border-bottom:1px solid #f1f5f9;">${tok.email}</td></tr>` : ""}
                <tr><td style="padding:8px 0;color:#64748b;border-bottom:1px solid #f1f5f9;">Prosjekt</td>
                    <td style="padding:8px 0;font-weight:600;color:#1e293b;text-align:right;border-bottom:1px solid #f1f5f9;">${prosjektNavn}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;border-bottom:1px solid #f1f5f9;">Tidspunkt</td>
                    <td style="padding:8px 0;color:#1e293b;text-align:right;border-bottom:1px solid #f1f5f9;">${tidspunkt}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;">Totalt besøk</td>
                    <td style="padding:8px 0;font-weight:600;color:#1e293b;text-align:right;">${nyVisitCount}</td></tr>
              </table>
              <div style="text-align:center;margin:24px 0 8px;">
                <a href="${dashboardUrl}" style="display:inline-block;background:#0F2A5A;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
                  Se investoroversikt →
                </a>
              </div>
            </div>
          </div>
        `,
      }),
    }).catch(() => { /* ikke krasj siden om varselet feiler */ });
  }

  const pitchHtml = tok.pitch_tekst ? pitchTilHtml(tok.pitch_tekst) : null;

  const erTeaser = tok.pitch_type === "teaser";

  return (
    <div style={{ minHeight: "100vh", background: "#F9FAFB", fontFamily: "Inter, -apple-system, Helvetica, sans-serif" }}>

      {/* Smal nav-linje */}
      <div style={{ background: "#0F2A5A", height: 48, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Tideron" style={{ height: 24, objectFit: "contain" }} />
        <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase" }}>
          Strictly Confidential
        </span>
      </div>

      {/* Hero — hvit bakgrunn, prosjektinfo */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 40px 36px" }}>
          <p style={{ color: "#6B7280", fontSize: 11, fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", margin: "0 0 12px" }}>
            {erTeaser ? "Investor Teaser" : "Investorpitch"} · Tideron AS
          </p>
          <h1 style={{ color: "#111827", fontSize: 36, fontWeight: 700, margin: "0 0 10px", lineHeight: 1.15, letterSpacing: "-0.5px" }}>
            {p?.navn ?? "Prosjekt"}
          </h1>
          <p style={{ color: "#6B7280", fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            {p?.sted ?? ""}
            {p?.stadie ? <><span style={{ margin: "0 8px", color: "#D1D5DB" }}>·</span>{p.stadie}</> : null}
          </p>
        </div>
      </div>

      {/* Innhold */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 40px 80px" }}>

        {pitchHtml ? (
          <div
            style={{ background: "#fff", border: "1px solid #E5E7EB", padding: "48px 56px" }}
            dangerouslySetInnerHTML={{ __html: pitchHtml }}
          />
        ) : (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", padding: "56px 40px", textAlign: "center" }}>
            <p style={{ color: "#6B7280", fontSize: 15 }}>
              Du har mottatt en invitasjon til å se på {p?.navn ?? "dette prosjektet"}.
            </p>
          </div>
        )}

        {/* Kontaktlinje */}
        <div style={{
          marginTop: 2,
          background: "#0F2A5A",
          padding: "24px 40px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 16,
        }}>
          <div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 4px" }}>Kontakt</p>
            <p style={{ color: "#fff", fontWeight: 600, fontSize: 15, margin: "0 0 2px" }}>Kai Svendstad</p>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: 0 }}>ksv@tideron.com · Tideron AS</p>
          </div>
          <a href="mailto:ksv@tideron.com"
            style={{ display: "inline-block", background: "#fff", color: "#0F2A5A", padding: "10px 24px", textDecoration: "none", fontWeight: 700, fontSize: 13, letterSpacing: ".3px" }}>
            Send e-post →
          </a>
        </div>

        <p style={{ textAlign: "center", color: "#9CA3AF", fontSize: 11, marginTop: 32, lineHeight: 1.7, letterSpacing: ".2px" }}>
          Dette dokumentet er konfidensielt og beregnet utelukkende for adressaten.<br />
          © Tideron AS {new Date().getFullYear()} · Ortnevik 3, 5962 Bjordal, Norway
        </p>
      </div>
    </div>
  );
}
