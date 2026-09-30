export interface TekstBit {
  chunkIndex: number;
  tekst: string;
}

/**
 * Deler opp tekst i biter på ca. chunkSize tegn, med litt overlapp mellom
 * bitene slik at kontekst ikke kuttes brått. Prøver å dele på avsnitt der
 * det er mulig, i stedet for midt i en setning.
 */
export function delOppTekst(tekst: string, chunkSize = 1000, overlap = 150): TekstBit[] {
  const avsnitt = tekst.split("\n").filter((p) => p.trim().length > 0);
  const biter: string[] = [];
  let buffer = "";

  for (const avsnittTekst of avsnitt) {
    if (buffer.length + avsnittTekst.length + 1 <= chunkSize) {
      buffer += avsnittTekst + "\n";
    } else {
      if (buffer.trim()) biter.push(buffer.trim());
      const hale = buffer.length > overlap ? buffer.slice(-overlap) : buffer;
      buffer = hale + avsnittTekst + "\n";
    }
  }
  if (buffer.trim()) biter.push(buffer.trim());

  return biter.map((t, i) => ({ chunkIndex: i, tekst: t }));
}
