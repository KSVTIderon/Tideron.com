/**
 * Embeddings via Voyage AI (Anthropics anbefalte embedding-partner - Claude
 * har ikke en egen embeddings-API).
 * Krever VOYAGE_API_KEY. Modell styres av VOYAGE_MODEL (default: voyage-3.5).
 */

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODELL = process.env.VOYAGE_MODEL ?? "voyage-3.5";
const BATCH_STORRELSE = 64;

export function embeddingsKonfigurert(): boolean {
  return !!process.env.VOYAGE_API_KEY;
}

async function kallVoyage(input: string[], inputType: "query" | "document"): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY er ikke satt");

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input, model: MODELL, input_type: inputType }),
  });

  if (!res.ok) {
    const feiltekst = await res.text();
    throw new Error(`Voyage-embedding feilet (${res.status}): ${feiltekst.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.data as { embedding: number[] }[]).map((d) => d.embedding);
}

/** Brukes ved innlesning av dokumenter (ingest-scriptet). */
export async function embedDokumenter(tekster: string[]): Promise<number[][]> {
  const resultater: number[][] = [];
  for (let i = 0; i < tekster.length; i += BATCH_STORRELSE) {
    const batch = tekster.slice(i, i + BATCH_STORRELSE);
    resultater.push(...(await kallVoyage(batch, "document")));
  }
  return resultater;
}

/** Brukes når et brukerspørsmål skal søkes opp mot kunnskapsbasen. */
export async function embedSporsmal(sporsmal: string): Promise<number[]> {
  const [embedding] = await kallVoyage([sporsmal], "query");
  return embedding;
}
