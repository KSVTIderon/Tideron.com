export type Audience = "internal" | "customer";

export interface KunnskapsChunk {
  id: number;
  source: string;
  audience: Audience;
  category: string | null;
  content: string;
  similarity: number;
}

export interface ChatMelding {
  rolle: "user" | "assistant";
  tekst: string;
}

export interface KildeRef {
  source: string;
  category: string | null;
}

export interface ChatSvar {
  svar: string;
  kilder: KildeRef[];
  audience: Audience;
}
