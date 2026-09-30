/**
 * Enkel in-memory rate limiter for innloggingsforsøk.
 * Brukes i middleware eller API-ruter.
 *
 * Maks 5 forsøk per IP per 15 minutter.
 * Ved overskridelse returnerer isBlocked=true og secondsLeft.
 */

const MAKS_FORSØK  = 5;
const VINDU_MS     = 15 * 60 * 1000; // 15 minutter

interface Forsøk {
  antall:  number;
  første:  number; // timestamp
}

// In-memory store (nullstilles ved server-restart, greit for Vercel serverless)
const store = new Map<string, Forsøk>();

export function sjekkRateLimit(ip: string): { isBlocked: boolean; secondsLeft: number } {
  const nå = Date.now();
  const entry = store.get(ip);

  if (!entry || nå - entry.første > VINDU_MS) {
    // Nytt vindu
    store.set(ip, { antall: 1, første: nå });
    return { isBlocked: false, secondsLeft: 0 };
  }

  if (entry.antall >= MAKS_FORSØK) {
    const secondsLeft = Math.ceil((VINDU_MS - (nå - entry.første)) / 1000);
    return { isBlocked: true, secondsLeft };
  }

  entry.antall++;
  return { isBlocked: false, secondsLeft: 0 };
}

export function nullstillRateLimit(ip: string) {
  store.delete(ip);
}
