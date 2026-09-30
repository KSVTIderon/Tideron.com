/**
 * /api/assistent/chat
 *
 * RAG-endepunkt for Tiderons kunnskapsassistent. Brukes av både den interne
 * siden ((app)/assistent) og den kundevendte siden (kunde-chat).
 *
 * VIKTIG sikkerhetsprinsipp: hvilken "audience" (internal/customer) brukeren
 * får svar fra avgjøres HER, server-side, ut fra NextAuth-sesjonen - ALDRI
 * ut fra noe klienten sender inn. Uinnlogget = kundemodus, alltid.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sokKunnskapsbase } from "@/lib/kunnskapsbase/sok";
import { sporClaude, claudeKonfigurert } from "@/lib/kunnskapsbase/claude";
import { embeddingsKonfigurert } from "@/lib/kunnskapsbase/embeddings";
import { Audience } from "@/lib/kunnskapsbase/typer";

const SYSTEM_INTERNAL = `Du er Tiderons interne kunnskapsassistent, til bruk for Tideron-teamet. Du svarer KUN basert på kontekst-utdragene som følger under, hentet fra Tiderons interne og eksterne dokumenter. Du har full tilgang, inkludert finansmodeller, SPV-struktur, lokasjonsprioriteringer og salgsstrategi.

Regler:
- Svar presist og saklig på norsk, utelukkende basert på kontekst-utdragene.
- Oppgi ALDRI informasjon du ikke finner støtte for i utdragene. Si eksplisitt "Jeg finner ikke dette i kunnskapsbasen ennå" hvis svaret ikke er der - ikke gjett eller fyll inn med generell kunnskap.
- Avslutt svaret med en kildelinje i formatet: Kilder: dokumentnavn1, dokumentnavn2.
- Vær kortfattet og konkret.`;

const SYSTEM_CUSTOMER = `Du er Tiderons kundevendte kunnskapsassistent på vegne av Tideron AS, og snakker med potensielle kunder og partnere. Du har KUN tilgang til informasjon godkjent for ekstern deling - ikke interne finansmodeller, strategidokumenter eller kundedata.

Regler:
- Svar vennlig, presist og profesjonelt på norsk, utelukkende basert på kontekst-utdragene under.
- Del ALDRI informasjon du ikke finner støtte for i utdragene. Hvis svaret ikke er der: si det ærlig, og foreslå at de tar direkte kontakt med Tideron-teamet for detaljer.
- Ikke spekuler i priser, kontraktsvilkår eller tekniske detaljer utover det som faktisk står i utdragene.
- Avslutt svaret med en kildelinje i formatet: Kilder: dokumentnavn1, dokumentnavn2.`;

export async function POST(req: NextRequest) {
  if (!embeddingsKonfigurert() || !claudeKonfigurert()) {
    return NextResponse.json(
      {
        error:
          "Kunnskapsassistenten er ikke konfigurert ennå. Legg til ANTHROPIC_API_KEY og VOYAGE_API_KEY i miljøvariablene (se KUNNSKAPSASSISTENT_OPPSETT.md), og kjør deretter ingest-scriptet for å fylle kunnskapsbasen.",
      },
      { status: 501 }
    );
  }

  let body: { sporsmal?: string; historikk?: { rolle: "user" | "assistant"; tekst: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørsel" }, { status: 400 });
  }

  const sporsmal = (body.sporsmal ?? "").trim();
  const historikk = Array.isArray(body.historikk) ? body.historikk.slice(-6) : [];

  if (!sporsmal) return NextResponse.json({ error: "Mangler spørsmål" }, { status: 400 });
  if (sporsmal.length > 2000) return NextResponse.json({ error: "Spørsmålet er for langt" }, { status: 400 });

  // Sikkerhet: audience avgjøres ALLTID her, server-side, ut fra innlogging.
  const session = await getServerSession(authOptions);
  const audience: Audience = session?.user ? "internal" : "customer";

  try {
    const treff = await sokKunnskapsbase(sporsmal, audience, 6);

    if (treff.length === 0) {
      const svar =
        audience === "internal"
          ? "Jeg finner ingen relevante treff i kunnskapsbasen for dette spørsmålet. Kanskje dokumentet ikke er lest inn ennå - sjekk med scripts/ingest-kunnskapsbase.ts."
          : "Jeg har dessverre ikke nok informasjon til å svare på det akkurat nå. Ta gjerne kontakt med Tideron-teamet direkte, så hjelper de deg videre.";
      return NextResponse.json({ svar, kilder: [], audience });
    }

    const kontekst = treff
      .map(
        (t, i) =>
          `[Utdrag ${i + 1} - kilde: ${t.source}${t.category ? `, kategori: ${t.category}` : ""}]\n${t.content}`
      )
      .join("\n\n---\n\n");

    const system = `${audience === "internal" ? SYSTEM_INTERNAL : SYSTEM_CUSTOMER}\n\nKONTEKST-UTDRAG:\n\n${kontekst}`;

    const svar = await sporClaude(system, sporsmal, historikk);

    const kilder = Array.from(
      new Map(treff.map((t) => [t.source, { source: t.source, category: t.category }])).values()
    );

    try {
      await supabaseAdmin.from("kunnskapsbase_sporsmalslogg").insert({
        audience,
        sporsmal,
        svar,
        kilder,
        bruker_epost: session?.user?.email ?? null,
      });
    } catch (logErr) {
      console.error("Kunne ikke logge spørsmål:", logErr);
    }

    return NextResponse.json({ svar, kilder, audience });
  } catch (e) {
    const feil = e instanceof Error ? e.message : "Ukjent feil";
    console.error("Assistent-feil:", feil);
    return NextResponse.json({ error: feil }, { status: 500 });
  }
}
