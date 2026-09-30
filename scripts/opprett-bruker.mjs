/**
 * opprett-bruker.mjs
 *
 * Oppretter en ny bruker i allowed_users-tabellen (Supabase).
 *
 * Kjør:
 *   node scripts/opprett-bruker.mjs <epost> <passord> [navn]
 *
 * Eksempel:
 *   node scripts/opprett-bruker.mjs kollega@tideron.com Passord123 "Ola Nordmann"
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Last .env.local manuelt (Node built-in dotenv ikke tilgjengelig)
const envPath = resolve(__dirname, "../.env.local");
try {
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch { /* .env.local ikke funnet */ }

const [,, epost, passord, navn] = process.argv;

if (!epost || !passord) {
  console.error("Bruk: node scripts/opprett-bruker.mjs <epost> <passord> [navn]");
  process.exit(1);
}

// ── PBKDF2-hashing (same as lib/passord.ts) ───────────────────────────────
function tilHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassord(p) {
  const saltArr = crypto.getRandomValues(new Uint8Array(16));
  const saltBuf = saltArr.buffer;
  const enc = new TextEncoder();
  const km  = await crypto.subtle.importKey("raw", enc.encode(p), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuf, iterations: 120_000, hash: "SHA-256" },
    km, 256
  );
  return `${tilHex(saltBuf)}:${tilHex(hash)}`;
}

// ── Supabase admin-klient ─────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY   // service role — omgår RLS
);

(async () => {
  const epostNorm = epost.trim().toLowerCase();

  // Sjekk om bruker allerede finnes
  const { data: eksisterende } = await supabase
    .from("allowed_users")
    .select("id, email")
    .eq("email", epostNorm)
    .maybeSingle();

  if (eksisterende) {
    console.log(`⚠️  Bruker finnes allerede: ${epostNorm}`);
    console.log("   Oppdaterer passord...");
    const hash = await hashPassord(passord);
    const { error } = await supabase
      .from("allowed_users")
      .update({ password_hash: hash, ...(navn ? { navn } : {}) })
      .eq("email", epostNorm);
    if (error) { console.error("❌ Feil:", error.message); process.exit(1); }
    console.log("✅ Passord oppdatert for", epostNorm);
    return;
  }

  // Opprett ny bruker
  const hash = await hashPassord(passord);
  const { data, error } = await supabase
    .from("allowed_users")
    .insert({ email: epostNorm, password_hash: hash, navn: navn ?? null })
    .select("id, email, navn")
    .single();

  if (error) {
    console.error("❌ Feil:", error.message);
    process.exit(1);
  }

  console.log(`\n✅ Bruker opprettet!`);
  console.log(`   E-post: ${data.email}`);
  console.log(`   Navn:   ${data.navn ?? "—"}`);
  console.log(`   ID:     ${data.id}`);
  console.log(`\n   Kollegaen kan nå logge inn på https://tideron.com/planner`);
  console.log(`   med e-post: ${data.email}\n`);
})().catch(err => {
  console.error("❌ Uventet feil:", err.message);
  process.exit(1);
});
