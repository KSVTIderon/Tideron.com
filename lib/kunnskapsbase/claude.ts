/**
 * Kall mot Anthropics Messages API for å generere svar fra kunnskapsassistenten.
 * Krever ANTHROPIC_API_KEY. Modell styres av ANTHROPIC_MODEL
 * (default: claude-sonnet-5 - god balanse mellom hastighet og kvalitet for
 * denne typen RAG-svar; bytt til claude-opus-5 om du vil ha enda grundigere svar).
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODELL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
const MAX_TOKENS = 1200;

export function claudeKonfigurert(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export interface HistorikkMelding {
  rolle: "user" | "assistant";
  tekst: string;
}

export async function sporClaude(
  system: string,
  sporsmal: string,
  historikk: HistorikkMelding[] = []
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY er ikke satt");

  const messages = [
    ...historikk.map((m) => ({ role: m.rolle, content: m.tekst })),
    { role: "user", content: sporsmal },
  ];

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODELL,
      max_tokens: MAX_TOKENS,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const feiltekst = await res.text();
    throw new Error(`Claude API feilet (${res.status}): ${feiltekst.slice(0, 300)}`);
  }

  const data = await res.json();
  const tekstBlokker = ((data.content ?? []) as { type: string; text?: string }[])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text as string);

  return tekstBlokker.join("\n").trim();
}
