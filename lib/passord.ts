// Passord-hashing med innebygd Web Crypto (PBKDF2 + SHA-256)

function tilHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function fraHex(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes.buffer as ArrayBuffer;
}

async function derive(passord: string, saltBuf: ArrayBuffer): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey("raw", enc.encode(passord), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuf, iterations: 120_000, hash: "SHA-256" },
    km, 256
  );
}

export async function hashPassord(passord: string): Promise<string> {
  const saltArr = crypto.getRandomValues(new Uint8Array(16));
  const saltBuf = saltArr.buffer as ArrayBuffer;
  const hash = await derive(passord, saltBuf);
  return `${tilHex(saltBuf)}:${tilHex(hash)}`;
}

export async function sjekkPassord(passord: string, lagret: string): Promise<boolean> {
  const [saltHex, hashHex] = lagret.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = await derive(passord, fraHex(saltHex));
  return tilHex(hash) === hashHex;
}
