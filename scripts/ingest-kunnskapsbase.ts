/**
 * Ingest-script for Tiderons kunnskapsassistent.
 *
 * Bruk:
 *   npx tsx scripts/ingest-kunnskapsbase.ts kunnskapsbase-dokumenter
 *
 * Leser dokumenter fra oppgitt mappe, henter audience/category-merking fra
 * scripts/kunnskapsbase-katalog.json, trekker ut tekst, deler i biter,
 * embedder med Voyage AI, og lagrer i Supabase-tabellen kunnskapsbase_chunks.
 *
 * Idempotent: kjør på nytt når dokumenter endres. Scriptet sletter og
 * erstatter alle biter for hvert kildedokument det behandler.
 *
 * Krever i miljøet (leses fra .env.local): VOYAGE_API_KEY,
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { readdir } from "fs/promises";
import path from "path";
import { lesDokument, stottetFiltype } from "../lib/kunnskapsbase/tekstuttrekk";
import { delOppTekst } from "../lib/kunnskapsbase/chunk";
import { embedDokumenter } from "../lib/kunnskapsbase/embeddings";
import katalogData from "./kunnskapsbase-katalog.json";

const mappe = process.argv[2];
if (!mappe) {
  console.error("Bruk: npx tsx scripts/ingest-kunnskapsbase.ts <mappe-med-dokumenter>");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_KEY = process.env.VOYAGE_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Mangler NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY i .env.local.");
  process.exit(1);
}
if (!VOYAGE_KEY) {
  console.error("Mangler VOYAGE_API_KEY i .env.local.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

type KatalogOppforing = { audience: "internal" | "customer"; category: string };
const KATALOG = katalogData as Record<string, KatalogOppforing>;

async function main() {
  const filer = await readdir(mappe);
  let totalBiter = 0;
  const hoppetOver: string[] = [];

  for (const filnavn of filer) {
    if (!stottetFiltype(filnavn)) continue;
    const oppforing = KATALOG[filnavn];
    if (!oppforing) {
      hoppetOver.push(filnavn);
      continue;
    }

    const fullPath = path.join(mappe, filnavn);
    console.log(`Leser ${filnavn}...`);
    let tekst: string;
    try {
      tekst = await lesDokument(fullPath, filnavn);
    } catch (e) {
      console.error(`  FEIL ved lesing: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (!tekst.trim()) {
      console.warn(`  Advarsel: tomt innhold i ${filnavn}`);
      continue;
    }

    const biter = delOppTekst(tekst);
    console.log(`  ${tekst.length} tegn -> ${biter.length} biter, embedder...`);
    const embeddings = await embedDokumenter(biter.map((b) => b.tekst));

    // Slett gamle biter for denne kilden først (gjør re-ingest idempotent)
    await supabase.from("kunnskapsbase_chunks").delete().eq("source", filnavn);

    const rader = biter.map((b, i) => ({
      source: filnavn,
      audience: oppforing.audience,
      category: oppforing.category,
      chunk_index: b.chunkIndex,
      content: b.tekst,
      embedding: embeddings[i],
    }));

    const { error } = await supabase.from("kunnskapsbase_chunks").insert(rader);
    if (error) {
      console.error(`  FEIL ved lagring: ${error.message}`);
      continue;
    }
    totalBiter += rader.length;
    console.log(`  OK - ${rader.length} biter lagret (audience=${oppforing.audience})`);
  }

  console.log(`\nFerdig. Totalt ${totalBiter} tekstbiter lagret i kunnskapsbasen.`);
  if (hoppetOver.length) {
    console.log(`\nHoppet over (ikke katalogisert i scripts/kunnskapsbase-katalog.json): ${hoppetOver.join(", ")}`);
    console.log(`Legg dem til der med {"audience": "internal"|"customer", "category": "..."} for å inkludere dem.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
