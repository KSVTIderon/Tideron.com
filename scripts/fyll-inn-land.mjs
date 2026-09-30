/**
 * fyll-inn-land.mjs
 *
 * Slår opp land (og sted) via Nominatim for alle prosjekter
 * som har lat/lon men mangler country_code.
 *
 * Kjør:
 *   node scripts/fyll-inn-land.mjs
 *
 * Flagg:
 *   --alle    Oppdater ALLE prosjekter med GPS, ikke bare de uten land
 *   --dry-run Vis hva som ville blitt oppdatert, uten å skrive til DB
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Last .env.local
const envPath = resolve(__dirname, "../.env.local");
try {
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch { /* ignorerer */ }

const DRY_RUN = process.argv.includes("--dry-run");
const ALLE    = process.argv.includes("--alle");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Nominatim-oppslag med respekt for rate limit (maks 1 req/sek)
async function reverseGeocode(lat, lon) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
    { headers: { "Accept-Language": "nb", "User-Agent": "TideronApp/1.0 (kai@tideron.com)" } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const countryCode = (data.address?.country_code ?? "").toUpperCase();
  const sted = [
    data.address?.municipality ?? data.address?.city ?? data.address?.town ?? data.address?.village ?? "",
    data.address?.county ?? data.address?.state ?? "",
  ].filter(Boolean).join(", ");
  return { countryCode, sted };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  // Hent alle prosjekter med koordinater
  const { data: prosjekter, error } = await supabase
    .from("projects")
    .select("id, navn, lat, lon, country_code, sted")
    .not("lat", "is", null)
    .not("lon", "is", null);

  if (error) { console.error("❌ Supabase-feil:", error.message); process.exit(1); }

  const kandidater = prosjekter.filter(p =>
    ALLE ? true : !p.country_code
  );

  if (kandidater.length === 0) {
    console.log("✅ Alle prosjekter med GPS har allerede land satt.");
    if (!ALLE) console.log("   (Bruk --alle for å oppdatere alle uansett)");
    process.exit(0);
  }

  console.log(`\n📍 Fant ${kandidater.length} prosjekt${kandidater.length !== 1 ? "er" : ""} å oppdatere`);
  if (DRY_RUN) console.log("   [DRY RUN — ingenting skrives til databasen]\n");
  console.log("─".repeat(70));

  // Hent gyldige landkoder fra Supabase countries-tabellen
  const { data: gyldigeLand } = await supabase.from("countries").select("code");
  const gyldigeKoder = new Set((gyldigeLand ?? []).map(l => l.code.toUpperCase()));
  console.log(`🗂  Gyldige landkoder i DB: ${[...gyldigeKoder].sort().join(", ")}\n`);

  let ok = 0, feil = 0;

  for (const p of kandidater) {
    try {
      const { countryCode, sted } = await reverseGeocode(p.lat, p.lon);

      const oppdatering = {};
      const kodeGyldig = countryCode && gyldigeKoder.has(countryCode);
      if (kodeGyldig) oppdatering.country_code = countryCode;
      if (!p.sted && sted) oppdatering.sted = sted;

      const mangler = countryCode && !kodeGyldig ? ` ⚠ ${countryCode} mangler i countries-tabell` : "";
      const stedVises = oppdatering.sted ? ` → sted: "${oppdatering.sted}"` : "";
      console.log(`  ${kodeGyldig ? countryCode : "??"} ${p.navn.padEnd(30)} lat=${p.lat.toFixed(4)}, lon=${p.lon.toFixed(4)}${stedVises}${mangler}`);

      if (!DRY_RUN && Object.keys(oppdatering).length > 0) {
        const { error: upErr } = await supabase
          .from("projects")
          .update(oppdatering)
          .eq("id", p.id);
        if (upErr) throw new Error(upErr.message);
      }

      ok++;
    } catch (e) {
      console.error(`  ❌ ${p.navn}: ${e.message}`);
      feil++;
    }

    // Nominatim rate limit: maks 1 req/sek
    await sleep(1100);
  }

  console.log("─".repeat(70));
  console.log(`\n  ✅ Oppdatert: ${ok}   ❌ Feil: ${feil}`);
  if (DRY_RUN) console.log("  (Kjør uten --dry-run for å lagre endringene)\n");
  else console.log("  Gå til Prosjekter-siden og refresh for å se endringene.\n");
})().catch(err => {
  console.error("❌ Uventet feil:", err.message);
  process.exit(1);
});
