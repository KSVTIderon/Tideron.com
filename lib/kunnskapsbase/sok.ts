import { supabaseAdmin } from "@/lib/supabase/admin";
import { embedSporsmal } from "./embeddings";
import { Audience, KunnskapsChunk } from "./typer";

/**
 * Søker kunnskapsbasen med vektor-likhet (pgvector, funksjonen
 * match_kunnskapsbase fra migrasjonen). audience styrer om interne
 * dokumenter er med i søket eller ei - avgjøres ALLTID av kalleren
 * server-side, aldri av klienten direkte.
 */
export async function sokKunnskapsbase(
  sporsmal: string,
  audience: Audience,
  matchCount = 6
): Promise<KunnskapsChunk[]> {
  const embedding = await embedSporsmal(sporsmal);

  const { data, error } = await supabaseAdmin.rpc("match_kunnskapsbase", {
    query_embedding: embedding,
    match_count: matchCount,
    allow_internal: audience === "internal",
  });

  if (error) throw new Error(`Søk mot kunnskapsbase feilet: ${error.message}`);
  return (data ?? []) as KunnskapsChunk[];
}
