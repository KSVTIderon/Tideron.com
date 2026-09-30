/**
 * odoo-repost.mjs
 *
 * Henter alle publiserte social.post-innlegg fra Odoo og lager
 * en relanseringsplan med optimale posting-tider.
 *
 * Kjør fra tideron-app-mappen:
 *   node scripts/odoo-repost.mjs
 *
 * Flagg:
 *   --dry-run   Vis planen uten å opprette poster i Odoo
 *   --weeks N   Spre over N uker (default: 4)
 *   --start     Startdato ISO (default: i morgen)
 */

import * as dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const ODOO_URL     = process.env.ODOO_URL;
const ODOO_DB      = process.env.ODOO_DB;
const ODOO_USER    = process.env.ODOO_USER;
const ODOO_API_KEY = process.env.ODOO_API_KEY;

// ── CLI-flagg ──────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const WEEKS   = parseInt(args.find(a => a.startsWith("--weeks="))?.split("=")[1] ?? "4");
const START   = args.find(a => a.startsWith("--start="))?.split("=")[1];

// ── Optimale posting-tider for B2B (Tideron-målgruppe: kommuner, industri) ─
// Tirsdag–torsdag prioriteres, morgenmøte (08:00) og lunsj (12:00)
const POSTING_SLOTS = [
  // [ukedag (1=man..5=fre), time]
  [2, 8],   // tirsdag 08:00
  [2, 12],  // tirsdag 12:00
  [3, 8],   // onsdag 08:00
  [3, 12],  // onsdag 12:00
  [4, 8],   // torsdag 08:00
  [4, 17],  // torsdag 17:00
  [1, 9],   // mandag 09:00
  [5, 9],   // fredag 09:00
];

// ── Hjelpefunksjoner ───────────────────────────────────────────────────────
async function rpc(endpoint, params) {
  const res = await fetch(`${ODOO_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", id: Date.now(), params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.error) throw new Error(`Odoo RPC: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function authenticate() {
  const result = await rpc("/web/session/authenticate", {
    db: ODOO_DB, login: ODOO_USER, password: ODOO_API_KEY,
  });
  if (!result?.uid) throw new Error("Autentisering feilet — sjekk ODOO_USER og ODOO_API_KEY");
  return result.uid;
}

async function callKw(uid, model, method, args, kwargs = {}) {
  return rpc("/web/dataset/call_kw", {
    model, method, args,
    kwargs: { context: { uid, lang: "nb_NO" }, ...kwargs },
  });
}

/** Neste dato som faller på ønsket ukedag fra og med `fromDate` */
function nesteDato(fromDate, ukedag) {
  const d = new Date(fromDate);
  const dag = d.getDay() === 0 ? 7 : d.getDay(); // 1=man..7=søn
  const diff = ((ukedag - dag) + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Generer alle posting-slots over N uker fra startDato */
function genererSlots(startDato, antallUker) {
  const slots = [];
  const start = new Date(startDato);
  start.setHours(0, 0, 0, 0);

  for (let uke = 0; uke < antallUker; uke++) {
    for (const [ukedag, time] of POSTING_SLOTS) {
      const d = nesteDato(new Date(start.getTime() + uke * 7 * 24 * 3600 * 1000), ukedag);
      d.setHours(time, 0, 0, 0);
      slots.push(d);
    }
  }

  // Sorter kronologisk og filtrer bort fortid
  const naa = new Date();
  return slots.filter(d => d > naa).sort((a, b) => a - b);
}

/** Formatter dato for Odoo: "YYYY-MM-DD HH:MM:SS" */
function odooDate(d) {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

/** Skriv ut tabell til terminal */
function printTabell(rader) {
  const col = [40, 30, 20];
  const linje = (tekst, farge = "") => console.log(farge + tekst + "\x1b[0m");
  linje("─".repeat(col[0] + col[1] + col[2] + 6));
  linje(
    "INNHOLD".padEnd(col[0]) + " │ " +
    "KANAL(ER)".padEnd(col[1]) + " │ " +
    "PLANLAGT TID".padEnd(col[2]),
    "\x1b[1m"
  );
  linje("─".repeat(col[0] + col[1] + col[2] + 6));
  for (const r of rader) {
    const tekst = r.melding.replace(/\n/g, " ").slice(0, col[0] - 3) + (r.melding.length > col[0] - 3 ? "…" : "");
    const kanaler = (r.kanaler || []).join(", ").padEnd(col[1]);
    const tid = r.planlagtTid.toLocaleString("nb-NO", {
      weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    }).padEnd(col[2]);
    console.log(tekst.padEnd(col[0]) + " │ " + kanaler + " │ " + tid);
  }
  linje("─".repeat(col[0] + col[1] + col[2] + 6));
}

// ── Hoved-logikk ──────────────────────────────────────────────────────────
(async () => {
  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_API_KEY) {
    console.error("❌ Mangler ODOO_-env-variabler i .env.local");
    process.exit(1);
  }

  console.log("\n🔗 Kobler til Odoo:", ODOO_URL);
  const uid = await authenticate();
  console.log("✅ Innlogget som uid:", uid);

  // ── 1. Sjekk om social.post finnes ──────────────────────────────────────
  let modelExists = true;
  try {
    await callKw(uid, "social.post", "fields_get", [], {
      kwargs: { attributes: ["string"] },
    });
  } catch {
    modelExists = false;
  }

  if (!modelExists) {
    console.error("\n❌ social.post-modellen finnes ikke.");
    console.error("   Du må installere 'Social Marketing'-modulen i Odoo.");
    console.error("   Gå til: Odoo → Apps → søk 'Social Marketing' → Install");
    process.exit(1);
  }

  // ── 2. Hent alle publiserte poster ─────────────────────────────────────
  console.log("\n📥 Henter publiserte innlegg...");
  const poster = await callKw(uid, "social.post", "search_read", [
    [["state", "in", ["posted", "done"]]],
    ["id", "message", "account_ids", "state", "published_date", "post_methods"],
    0, 200,
  ]);

  if (!poster || poster.length === 0) {
    console.log("⚠️  Ingen publiserte poster funnet i Odoo Social.");
    console.log("   Legg ut noen poster manuelt i Odoo Social Marketing først.");
    process.exit(0);
  }

  console.log(`✅ Fant ${poster.length} publiserte innlegg`);

  // ── 3. Hent tilgjengelige social accounts ──────────────────────────────
  const kontoer = await callKw(uid, "social.account", "search_read", [
    [["has_trends", "!=", false]],
    ["id", "name", "social_provider", "is_media_disconnected"],
    0, 50,
  ]).catch(() => []);

  const aktiveKontoer = kontoer.filter(k => !k.is_media_disconnected);
  console.log(`📱 Aktive sosiale kontoer: ${aktiveKontoer.map(k => `${k.name} (${k.social_provider})`).join(", ") || "ingen funnet"}`);

  // ── 4. Generer relanseringsplan ────────────────────────────────────────
  const startDato = START ? new Date(START) : (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  })();

  const slots = genererSlots(startDato, WEEKS);
  console.log(`\n📅 Sprer ${poster.length} poster over ${WEEKS} uker (${slots.length} tilgjengelige slots)`);

  if (slots.length < poster.length) {
    console.warn(`⚠️  Kun ${slots.length} slots for ${poster.length} poster — øk --weeks`);
  }

  // Fordel poster jevnt over slots
  const plan = poster.slice(0, slots.length).map((post, i) => ({
    id:          post.id,
    melding:     post.message ?? "(ingen tekst)",
    kontoIder:   aktiveKontoer.length > 0
                   ? aktiveKontoer.map(k => k.id)
                   : (post.account_ids ?? []),
    kanaler:     aktiveKontoer.length > 0
                   ? aktiveKontoer.map(k => k.social_provider)
                   : ["(original)"],
    planlagtTid: slots[i],
  }));

  // ── 5. Vis plan ────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(96));
  console.log("  RELANSERINGSPLAN" + (DRY_RUN ? "  [DRY RUN — ingen poster opprettes]" : ""));
  console.log("═".repeat(96));
  printTabell(plan);
  console.log(`\n  ${plan.length} innlegg planlagt fra ${startDato.toLocaleDateString("nb-NO")} over ${WEEKS} uker\n`);

  if (DRY_RUN) {
    console.log("✋ Dry run — stopper her. Kjør uten --dry-run for å opprette poster.\n");
    process.exit(0);
  }

  // ── 6. Opprett scheduled reposts i Odoo ───────────────────────────────
  console.log("📤 Oppretter planlagte reposts i Odoo...\n");
  let ok = 0, feil = 0;

  for (const p of plan) {
    try {
      const nyttId = await callKw(uid, "social.post", "create", [{
        message:     p.melding,
        account_ids: [[6, 0, p.kontoIder]],   // many2many replace
        state:       "scheduled",
        scheduled_date: odooDate(p.planlagtTid),
      }]);

      console.log(`  ✅ Post #${nyttId} → ${p.planlagtTid.toLocaleString("nb-NO", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`);
      ok++;
    } catch (err) {
      console.error(`  ❌ Feilet for post "${p.melding.slice(0, 40)}…": ${err.message}`);
      feil++;
    }
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ✅ Opprettet: ${ok}   ❌ Feilet: ${feil}`);
  console.log(`  Gå til Odoo → Social Marketing → Scheduled Posts for å se planen.`);
  console.log("═".repeat(50) + "\n");
})().catch(err => {
  console.error("\n❌ Uventet feil:", err.message);
  process.exit(1);
});
