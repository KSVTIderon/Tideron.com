"use client";
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import type { RotorKartData, KabelKartData } from "@/components/RapportKart";
import { fmtKw } from "@/lib/units";
import {
  beregnArligKwh,
  beregnEffektKw,
  beregnEffektKwFlateareal,
  nominalKwFraAreal,
  rhoFraVanntype, summerRotorEffektKw, summerRotorArealM2, sjekkFysiskTak,
} from "@/lib/finans";

const RapportKart = dynamic(() => import("@/components/RapportKart"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 400, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}
      className="flex items-center justify-center text-slate-400 text-sm">
      Loading map…
    </div>
  ),
});

/* ── Translations ─────────────────────────────────────────────────────────── */
const T = {
  no: {
    loading:         "Laster rapport...",
    notFound:        "Prosjekt ikke funnet.",
    reportTitle:     "Prosjektrapport",
    downloadPdf:     "Last ned PDF",
    rotorsPlaced:    "Rotorer plassert",
    totalPower:      "Total installert effekt",
    annualProd:      "Estimert årsproduksjon",
    avgVelocity:     "Gjennomsnittshastighet",
    units:           "stk",
    streamInfo:      "Strøminformasjon",
    edit:            "Rediger",
    streamType:      "Strømtype",
    peakVel:         "Topphastighet (m/s)",
    avgVel:          "Gjennomsnittshastighet (m/s)",
    avgAuto637:      "Avg (auto × 0.637)",
    avgConstant:     "Avg (= topp, konstant)",
    dataSource:      "Datakilde",
    dataPlaceholder: "f.eks. NVE feltmåling 2025",
    bredde:          "Bredde på strekning (m)",
    lengde:          "Lengde på strekning (m)",
    breddeDisp:      "Bredde",
    lengdeDisp:      "Lengde",
    save:            "Lagre",
    saving:          "Lagrer...",
    cancel:          "Avbryt",
    noStream:        "Ingen strøminformasjon registrert. Klikk «Rediger» for å legge til.",
    avgVelDisplay:   "Gjennomsnittshastighet",
    peakVelDisplay:  "Topphastighet",
    dataSourceDisp:  "Datakilde",
    siteMap:         "Kart over anlegget",
    placedRotors:    "Plasserte rotorer",
    noRotors:        "Ingen rotorer plassert på kart ennå.",
    model:           "Modell",
    serial:          "Serienr.",
    coordinates:     "Koordinater",
    diameter:        "Diameter",
    velocity:        "Hastighet",
    power:           "Effekt",
    total:           "Total",
    infra:           "Infrastruktur",
    containers:      "Containere",
    name:            "Navn",
    type:            "Type",
    cables:          "Kabler",
    length:          "Lengde",
    cost:            "Kost",
    potentialTitle:  "Potensiell kapasitet",
    potentialSub:    "Basert på strømmens bredde, lengde og hastighet — viser hva strekningen kan bygges ut til.",
    potentialNeedData: "Legg inn bredde og gjennomsnittshastighet i Strøminformasjon for å beregne potensial.",
    potModel:        "Modell",
    potDiam:         "Diameter",
    potAcross:       "Ant. på tvers",
    potRows:         "Rekker",
    potTotal:        "Tot. rotorer",
    potPower:        "Installert effekt",
    potAnnual:       "Årsproduksjon",
    potRevenue:      "Inntekt/år",
    potPayback:      "Tilbakebetaling",
    potYears:        "år",
    potCurrent:      "Plassert nå",
    potCurrentOf:    (n: number, tot: number) => `${n} av ${tot} mulige rotorer plassert (${tot > 0 ? Math.round(n/tot*100) : 0}% utnyttelse)`,
    potNote:         "* Beregnet med 2× diameter som minimumsavstand mellom rotorer. Faktisk kapasitet avhenger av lokale forhold.",
    financialEst:    "Finansielt estimat",
    financialSub:    "(basert på standardforutsetninger — se Budsjett-fanen for full analyse)",
    capex:           "Estimert CAPEX",
    capexSub:        "Rotorer + containere + ingeniør",
    opex:            "Estimert OPEX (årlig)",
    revenue:         "Estimert inntekt (PPA)",
    netIncome:       "Nettoinntekt (årlig)",
    netSub:          "inntekt − OPEX",
    payback:         "Enkel tilbakebetalingstid",
    paybackSub:      "CAPEX ÷ netto",
    paybackYears:    "år",
    production:      "Estimert produksjon",
    footNote:        (ppa: string, opex: string) =>
      `* Samme forutsetninger som Budsjett-fanen: kr/kW basispris for rotorer, ${ppa} kr/kWh PPA, ${opex} kr/år OPEX per rotor. For full analyse, se Budsjett-fanen.`,
    generated:       "Generert av Tideron Planner",
    projectId:       "Prosjekt-ID",
    currency:        "kr",
    perRotors:       (opex: string, n: number) => `${opex} kr × ${n} rotorer`,
    mal:             "Mål",
    sveptAreal:      "Svept areal",
    bunnforhold:     "Bunnforhold og dybde",
    bunnforholdSub:  "Dybdedata fra Kartverket og EMODnet. Panorér og zoom for detaljer.",
    sendRapport:     "Send rapport",
    sendTittel:      "Send teknisk rapport",
    mottakerEpost:   "Mottaker e-post",
    mottakerNavn:    "Mottaker navn (valgfritt)",
    sendKnapp:       "Send rapport",
    sender:          "Sender...",
    sendOk:          "✓ Rapport sendt!",
    lukkModal:       "Lukk",
  },
  en: {
    loading:         "Loading report...",
    notFound:        "Project not found.",
    reportTitle:     "Project Report",
    downloadPdf:     "Download PDF",
    rotorsPlaced:    "Rotors placed",
    totalPower:      "Total installed power",
    annualProd:      "Est. annual production",
    avgVelocity:     "Average flow velocity",
    units:           "units",
    streamInfo:      "Stream Information",
    edit:            "Edit",
    streamType:      "Stream type",
    peakVel:         "Peak velocity (m/s)",
    avgVel:          "Average velocity (m/s)",
    avgAuto637:      "Avg velocity (auto × 0.637)",
    avgConstant:     "Avg velocity (= peak, constant)",
    dataSource:      "Data source",
    dataPlaceholder: "e.g. NVE field measurement 2025",
    bredde:          "Channel width (m)",
    lengde:          "Section length (m)",
    breddeDisp:      "Width",
    lengdeDisp:      "Length",
    save:            "Save",
    saving:          "Saving...",
    cancel:          "Cancel",
    noStream:        "No stream data recorded. Click «Edit» to add.",
    avgVelDisplay:   "Average velocity",
    peakVelDisplay:  "Peak velocity",
    dataSourceDisp:  "Data source",
    siteMap:         "Site Map",
    placedRotors:    "Placed Rotors",
    noRotors:        "No rotors placed on the map yet.",
    model:           "Model",
    serial:          "Serial no.",
    coordinates:     "Coordinates",
    diameter:        "Diameter",
    velocity:        "Velocity",
    power:           "Power",
    total:           "Total",
    infra:           "Infrastructure",
    containers:      "Containers",
    name:            "Name",
    type:            "Type",
    cables:          "Cables",
    length:          "Length",
    cost:            "Cost",
    potentialTitle:  "Site Capacity Potential",
    potentialSub:    "Based on stream width, length and velocity — showing what this site can support at full build-out.",
    potentialNeedData: "Enter width and average velocity in Stream Information to calculate potential.",
    potModel:        "Model",
    potDiam:         "Diameter",
    potAcross:       "Units across",
    potRows:         "Rows",
    potTotal:        "Total rotors",
    potPower:        "Installed power",
    potAnnual:       "Annual production",
    potRevenue:      "Revenue/yr",
    potPayback:      "Payback",
    potYears:        "yrs",
    potCurrent:      "Currently placed",
    potCurrentOf:    (n: number, tot: number) => `${n} of ${tot} potential rotors placed (${tot > 0 ? Math.round(n/tot*100) : 0}% utilisation)`,
    potNote:         "* Calculated using 2× diameter as minimum rotor spacing. Actual capacity depends on local conditions.",
    financialEst:    "Financial Estimate",
    financialSub:    "(standard assumptions — see Budget tab for full analysis)",
    capex:           "Estimated CAPEX",
    capexSub:        "Rotors + containers + engineering",
    opex:            "Estimated OPEX (annual)",
    revenue:         "Estimated revenue (PPA)",
    netIncome:       "Net income (annual)",
    netSub:          "revenue − OPEX",
    payback:         "Simple payback period",
    paybackSub:      "CAPEX ÷ net income",
    paybackYears:    "years",
    production:      "Estimated production",
    footNote:        (ppa: string, opex: string) =>
      `* Same assumptions as Budget tab: model price per rotor, ${ppa} NOK/kWh PPA, ${opex} NOK/yr OPEX per rotor. For full analysis, see the Budget tab.`,
    generated:       "Generated by Tideron Planner",
    projectId:       "Project ID",
    currency:        "NOK",
    perRotors:       (opex: string, n: number) => `${opex} NOK × ${n} rotors`,
    mal:             "Dimensions",
    sveptAreal:      "Swept area",
    bunnforhold:     "Seabed conditions & depth",
    bunnforholdSub:  "Depth data from Kartverket and EMODnet. Pan and zoom for details.",
    sendRapport:     "Send report",
    sendTittel:      "Send technical report",
    mottakerEpost:   "Recipient email",
    mottakerNavn:    "Recipient name (optional)",
    sendKnapp:       "Send report",
    sender:          "Sending...",
    sendOk:          "✓ Report sent!",
    lukkModal:       "Close",
  },
  es: {
    loading:         "Cargando informe...",
    notFound:        "Proyecto no encontrado.",
    reportTitle:     "Informe de Proyecto",
    downloadPdf:     "Descargar PDF",
    rotorsPlaced:    "Rotores colocados",
    totalPower:      "Potencia instalada total",
    annualProd:      "Producción anual estimada",
    avgVelocity:     "Velocidad media de corriente",
    units:           "uds.",
    streamInfo:      "Información de corriente",
    edit:            "Editar",
    streamType:      "Tipo de corriente",
    peakVel:         "Velocidad punta (m/s)",
    avgVel:          "Velocidad media (m/s)",
    avgAuto637:      "Vel. media (auto × 0.637)",
    avgConstant:     "Vel. media (= punta, constante)",
    dataSource:      "Fuente de datos",
    dataPlaceholder: "p. ej. medición de campo 2025",
    bredde:          "Ancho del canal (m)",
    lengde:          "Longitud del tramo (m)",
    breddeDisp:      "Ancho",
    lengdeDisp:      "Longitud",
    save:            "Guardar",
    saving:          "Guardando...",
    cancel:          "Cancelar",
    noStream:        "Sin datos de corriente. Haz clic en «Editar» para añadir.",
    avgVelDisplay:   "Velocidad media",
    peakVelDisplay:  "Velocidad punta",
    dataSourceDisp:  "Fuente de datos",
    siteMap:         "Mapa del emplazamiento",
    placedRotors:    "Rotores colocados",
    noRotors:        "Aún no hay rotores en el mapa.",
    model:           "Modelo",
    serial:          "Nº de serie",
    coordinates:     "Coordenadas",
    diameter:        "Diámetro",
    velocity:        "Velocidad",
    power:           "Potencia",
    total:           "Total",
    infra:           "Infraestructura",
    containers:      "Contenedores",
    name:            "Nombre",
    type:            "Tipo",
    cables:          "Cables",
    length:          "Longitud",
    cost:            "Coste",
    potentialTitle:  "Capacidad potencial del sitio",
    potentialSub:    "Basado en el ancho, longitud y velocidad de la corriente — mostrando el máximo posible.",
    potentialNeedData: "Introduce el ancho y la velocidad media en Información de corriente para calcular el potencial.",
    potModel:        "Modelo",
    potDiam:         "Diámetro",
    potAcross:       "Uds. en fila",
    potRows:         "Filas",
    potTotal:        "Total rotores",
    potPower:        "Potencia instalada",
    potAnnual:       "Producción anual",
    potRevenue:      "Ingresos/año",
    potPayback:      "Retorno",
    potYears:        "años",
    potCurrent:      "Colocados actualmente",
    potCurrentOf:    (n: number, tot: number) => `${n} de ${tot} rotores potenciales colocados (${tot > 0 ? Math.round(n/tot*100) : 0}% de utilización)`,
    potNote:         "* Calculado con 2× diámetro como distancia mínima entre rotores. La capacidad real depende de las condiciones locales.",
    financialEst:    "Estimación financiera",
    financialSub:    "(supuestos estándar — ver pestaña Presupuesto para análisis completo)",
    capex:           "CAPEX estimado",
    capexSub:        "Rotores + contenedores + ingeniería",
    opex:            "OPEX estimado (anual)",
    revenue:         "Ingresos estimados (PPA)",
    netIncome:       "Ingresos netos (anuales)",
    netSub:          "ingresos − OPEX",
    payback:         "Periodo de retorno simple",
    paybackSub:      "CAPEX ÷ ingresos netos",
    paybackYears:    "años",
    production:      "Producción estimada",
    footNote:        (ppa: string, opex: string) =>
      `* Mismos supuestos que la pestaña Presupuesto: precio por rotor, ${ppa} PPA, ${opex} OPEX/año por rotor.`,
    generated:       "Generado por Tideron Planner",
    projectId:       "ID de proyecto",
    currency:        "NOK",
    perRotors:       (opex: string, n: number) => `${opex} × ${n} rotores`,
    mal:             "Dimensiones",
    sveptAreal:      "Área barrida",
    bunnforhold:     "Condiciones del fondo y profundidad",
    bunnforholdSub:  "Datos de profundidad de Kartverket y EMODnet. Desplaza y amplía para más detalles.",
    sendRapport:     "Enviar informe",
    sendTittel:      "Enviar informe técnico",
    mottakerEpost:   "Correo del destinatario",
    mottakerNavn:    "Nombre del destinatario (opcional)",
    sendKnapp:       "Enviar informe",
    sender:          "Enviando...",
    sendOk:          "✓ ¡Informe enviado!",
    lukkModal:       "Cerrar",
  },
  de: {
    loading:         "Bericht wird geladen...",
    notFound:        "Projekt nicht gefunden.",
    reportTitle:     "Projektbericht",
    downloadPdf:     "PDF herunterladen",
    rotorsPlaced:    "Platzierte Rotoren",
    totalPower:      "Installierte Gesamtleistung",
    annualProd:      "Geschätzte Jahresproduktion",
    avgVelocity:     "Mittlere Strömungsgeschwindigkeit",
    units:           "Stk.",
    streamInfo:      "Strömungsinformationen",
    edit:            "Bearbeiten",
    streamType:      "Strömungstyp",
    peakVel:         "Spitzengeschwindigkeit (m/s)",
    avgVel:          "Mittlere Geschwindigkeit (m/s)",
    avgAuto637:      "Ø Geschw. (auto × 0,637)",
    avgConstant:     "Ø Geschw. (= Spitze, konstant)",
    dataSource:      "Datenquelle",
    dataPlaceholder: "z. B. NVE-Feldmessung 2025",
    bredde:          "Kanalbreite (m)",
    lengde:          "Abschnittslänge (m)",
    breddeDisp:      "Breite",
    lengdeDisp:      "Länge",
    save:            "Speichern",
    saving:          "Speichert...",
    cancel:          "Abbrechen",
    noStream:        "Keine Strömungsdaten erfasst. Klicken Sie auf «Bearbeiten».",
    avgVelDisplay:   "Mittlere Geschwindigkeit",
    peakVelDisplay:  "Spitzengeschwindigkeit",
    dataSourceDisp:  "Datenquelle",
    siteMap:         "Standortkarte",
    placedRotors:    "Platzierte Rotoren",
    noRotors:        "Noch keine Rotoren auf der Karte platziert.",
    model:           "Modell",
    serial:          "Seriennr.",
    coordinates:     "Koordinaten",
    diameter:        "Durchmesser",
    velocity:        "Geschwindigkeit",
    power:           "Leistung",
    total:           "Gesamt",
    infra:           "Infrastruktur",
    containers:      "Container",
    name:            "Name",
    type:            "Typ",
    cables:          "Kabel",
    length:          "Länge",
    cost:            "Kosten",
    potentialTitle:  "Standortkapazitätspotenzial",
    potentialSub:    "Basierend auf Breite, Länge und Geschwindigkeit der Strömung — zeigt das maximale Ausbaupotenzial.",
    potentialNeedData: "Geben Sie Breite und mittlere Geschwindigkeit in Strömungsinformationen ein.",
    potModel:        "Modell",
    potDiam:         "Durchmesser",
    potAcross:       "Rotoren quer",
    potRows:         "Reihen",
    potTotal:        "Rotoren gesamt",
    potPower:        "Installierte Leistung",
    potAnnual:       "Jahresproduktion",
    potRevenue:      "Einnahmen/Jahr",
    potPayback:      "Amortisation",
    potYears:        "Jahre",
    potCurrent:      "Aktuell platziert",
    potCurrentOf:    (n: number, tot: number) => `${n} von ${tot} möglichen Rotoren platziert (${tot > 0 ? Math.round(n/tot*100) : 0}% Auslastung)`,
    potNote:         "* Berechnet mit 2× Durchmesser als Mindestabstand. Die tatsächliche Kapazität hängt von den lokalen Bedingungen ab.",
    financialEst:    "Finanzielle Schätzung",
    financialSub:    "(Standardannahmen — vollständige Analyse im Budget-Reiter)",
    capex:           "Geschätztes CAPEX",
    capexSub:        "Rotoren + Container + Engineering",
    opex:            "Geschätztes OPEX (jährlich)",
    revenue:         "Geschätzte Einnahmen (PPA)",
    netIncome:       "Nettoeinkommen (jährlich)",
    netSub:          "Einnahmen − OPEX",
    payback:         "Einfache Amortisationszeit",
    paybackSub:      "CAPEX ÷ Nettoeinkommen",
    paybackYears:    "Jahre",
    production:      "Geschätzte Produktion",
    footNote:        (ppa: string, opex: string) =>
      `* Gleiche Annahmen wie Budget-Reiter: Preis je Rotor, ${ppa} PPA, ${opex} OPEX/Jahr je Rotor.`,
    generated:       "Erstellt mit Tideron Planner",
    projectId:       "Projekt-ID",
    currency:        "NOK",
    perRotors:       (opex: string, n: number) => `${opex} × ${n} Rotoren`,
    mal:             "Abmessungen",
    sveptAreal:      "Überstrichene Fläche",
    bunnforhold:     "Untergrundverhältnisse & Tiefe",
    bunnforholdSub:  "Tiefendaten von Kartverket und EMODnet. Schwenken und zoomen für Details.",
    sendRapport:     "Bericht senden",
    sendTittel:      "Technischen Bericht senden",
    mottakerEpost:   "Empfänger-E-Mail",
    mottakerNavn:    "Empfängername (optional)",
    sendKnapp:       "Bericht senden",
    sender:          "Wird gesendet...",
    sendOk:          "✓ Bericht gesendet!",
    lukkModal:       "Schließen",
  },
} as const;

type Lang = "no" | "en" | "es" | "de";

/* ── Model data ─────────────────────────────────────────────────────────── */

const STREAM_TYPER = ["tidevann", "elv", "havstrøm"];
const STREAM_LABEL: Record<Lang, Record<string, string>> = {
  no: { tidevann: "Tidevann", elv: "Elv",    "havstrøm": "Havstrøm" },
  en: { tidevann: "Tidal",    elv: "River",  "havstrøm": "Ocean current" },
  es: { tidevann: "Mareal",   elv: "Fluvial","havstrøm": "Corriente oceánica" },
  de: { tidevann: "Gezeit",   elv: "Fluss",  "havstrøm": "Meeresströmung" },
};

function kwFraNavn(modell: string): number {
  const m = modell?.match(/(\d+(?:\.\d+)?)\s*(kW|MW)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === "mw" ? n * 1000 : n;
}

// Effektsum flyttet til lib/finans.ts (summerRotorEffektKw) — se prosjekter/[id]/page.tsx-fiksen.
// Ikke dupliser denne reduce-logikken lokalt igjen; det var det som gjorde at ρ=sjøvann-defaulten
// og manglende fysisk tak sneik seg inn på flere sider samtidig (bl.a. denne investorrapporten).
// Tynn per-rotor wrapper for radvisning i tabellene under — bruker samme delte logikk og riktig ρ.
function rotorKw(r: any, avgV: number, rho: number): number | null {
  const kw = summerRotorEffektKw([r], avgV, rho);
  return kw > 0 ? kw : null;
}

/* ── Rotormål-hjelpere ────────────────────────────────────────────────────── */

function sveptArealM2(r: any): number | null {
  const isV = r.rotor_type === "v-rotor";
  if (isV) {
    const b = +(r.bredde_m ?? 0), d = +(r.dybde_m ?? 0);
    return b > 0 && d > 0 ? 0.5 * b * d : null;
  }
  if (r.lengde_m && r.hoyde_m) return +(r.lengde_m) * +(r.hoyde_m);
  const diam = r.diameter_m ? +(r.diameter_m) : null;
  return diam ? Math.PI * (diam / 2) ** 2 : null;
}

function malTekst(r: any): string {
  const isV = r.rotor_type === "v-rotor";
  if (isV) {
    const b = r.bredde_m ? `${(+r.bredde_m).toFixed(1)} m` : "—";
    const d = r.dybde_m ? `${(+r.dybde_m).toFixed(1)} m` : "—";
    return `${b} × ${d}`;
  }
  if (r.lengde_m && r.hoyde_m)
    return `${(+r.lengde_m).toFixed(1)} × ${(+r.hoyde_m).toFixed(1)} m`;
  const diam = r.diameter_m ? +(r.diameter_m) : null;
  return diam ? `Ø ${diam.toFixed(2)} m` : "—";
}

const fmtMwh = (mwh: number, lang: Lang) =>
  mwh >= 1_000
    ? (mwh/1_000).toFixed(1) + (lang === "no" ? " GWh/år" : " GWh/yr")
    : mwh.toFixed(1) + (lang === "no" ? " MWh/år" : " MWh/yr");

function kabelMetrer(kab: any): number {
  const pts: { lat: number; lon: number }[] = kab.waypoints ?? [];
  let tot = 0;
  for (let i = 1; i < pts.length; i++) {
    const dLat = (pts[i].lat - pts[i-1].lat) * 111_000;
    const dLon = (pts[i].lon - pts[i-1].lon) * 111_000 * Math.cos(pts[i-1].lat * Math.PI / 180);
    tot += Math.sqrt(dLat * dLat + dLon * dLon);
  }
  return tot;
}

/* ════════════════════════════════════════════════════════════════════════════
   Report page
═══════════════════════════════════════════════════════════════════════════ */
export function TekniskRapportView({ prosjektId }: { prosjektId: string }) {
  const supabase = createClient();
  const [prosjekt,     setProsjekt]     = useState<any>(null);
  const [rotorer,      setRotorer]      = useState<any[]>([]);
  const [stream,       setStream]       = useState<any>(null);
  const [streamEdit,   setStreamEdit]   = useState<any>(null);
  const [containere,   setContainere]   = useState<any[]>([]);
  const [kabler,       setKabler]       = useState<any[]>([]);
  const [laster,       setLaster]       = useState(true);
  const [editStream,   setEditStream]   = useState(false);
  const [savingStream, setSavingStream] = useState(false);
  const [lang, setLang] = useState<Lang>("no");

  const [sendModal, setSendModal] = useState(false);
  const [sendEpost, setSendEpost] = useState("");
  const [sendNavn,  setSendNavn]  = useState("");
  const [sending,   setSending]   = useState(false);
  const [sendOk,    setSendOk]    = useState(false);
  const [sendFeil,  setSendFeil]  = useState<string | null>(null);

  const t = T[lang];

  const hent = useCallback(async () => {
    const [{ data: p }, { data: barn }, { data: s }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", prosjektId).single(),
      supabase.from("projects").select("id").eq("parent_project_id", prosjektId),
      supabase.from("streams").select("*").eq("project_id", prosjektId).single(),
    ]);
    const childIds = (barn ?? []).map((b: any) => b.id as string);
    const rotorIds = childIds.length > 0 ? childIds : [prosjektId];
    const [{ data: r }, { data: c }, { data: k }] = await Promise.all([
      supabase.from("rotors").select("*").in("project_id", rotorIds).order("created_at"),
      supabase.from("containers").select("*").eq("project_id", prosjektId).order("created_at"),
      supabase.from("cables").select("*").eq("project_id", prosjektId).order("created_at"),
    ]);
    setProsjekt(p); setRotorer(r ?? []); setStream(s); setStreamEdit(s);
    setContainere(c ?? []); setKabler(k ?? []);
    setLaster(false);
  }, [prosjektId]);

  useEffect(() => { hent(); }, [hent]);

  const setStreamEditField = (k: string, v: string) => {
    const next = { ...streamEdit, [k]: v };
    if (k === "peak_velocity_m_s") {
      const peak = parseFloat(v);
      if (next.stream_type === "tidevann") {
        next.avg_velocity_m_s = isNaN(peak) ? "" : (peak * 0.637).toFixed(3);
      }
    }
    setStreamEdit(next);
  };

  const saveStream = async () => {
    setSavingStream(true);
    const payload = {
      project_id: prosjektId,
      stream_type: streamEdit.stream_type,
      peak_velocity_m_s: streamEdit.peak_velocity_m_s ? parseFloat(streamEdit.peak_velocity_m_s) : null,
      avg_velocity_m_s:  streamEdit.avg_velocity_m_s  ? parseFloat(streamEdit.avg_velocity_m_s)  : null,
      bredde_m:          streamEdit.bredde_m           ? parseFloat(streamEdit.bredde_m)           : null,
      lengde_m:          streamEdit.lengde_m           ? parseFloat(streamEdit.lengde_m)           : null,
      datakilde: streamEdit.datakilde || null,
    };
    if (streamEdit?.id) {
      await supabase.from("streams").update(payload).eq("id", streamEdit.id);
    } else {
      const { data } = await supabase.from("streams").insert(payload).select("id").single();
      if (data) setStreamEdit((prev: any) => ({ ...prev, id: data.id }));
    }
    setStream({ ...streamEdit, ...payload });
    setSavingStream(false);
    setEditStream(false);
  };

  const sendRapport = async () => {
    if (!sendEpost) return;
    setSending(true); setSendFeil(null); setSendOk(false);
    try {
      const res = await fetch("/planner/api/varsler/rapport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: prosjektId, mottaker_epost: sendEpost, mottaker_navn: sendNavn, lang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ukjent feil");
      setSendOk(true);
    } catch (e: any) {
      setSendFeil(e.message ?? "Feil ved sending");
    } finally {
      setSending(false);
    }
  };

  if (laster) return <div className="text-slate-400 text-sm p-8">{T.no.loading}</div>;
  if (!prosjekt) return <div className="text-slate-400 text-sm p-8">{t.notFound}</div>;

  /* ── Calculations ── */
  const placed = rotorer.filter(r => r.lat && r.lon);
  const avgV   = stream?.avg_velocity_m_s ?? 0;
  const rho    = rhoFraVanntype(prosjekt?.vann_type);

  const totKw  = summerRotorEffektKw(placed, avgV, rho);
  const totMwh = totKw > 0 ? beregnArligKwh(totKw, stream?.stream_type ?? "tidevann") / 1000 : 0;
  const fysiskTak = sjekkFysiskTak(
    totKw, rho,
    prosjekt?.elv_bredde_m, prosjekt?.elv_dybde_m,
    avgV, summerRotorArealM2(placed),
    prosjekt?.blokkering_pst ?? 20
  );
  const streamType = stream?.stream_type ?? "tidevann";
  const dateLocale = lang === "no" ? "nb-NO" : lang === "de" ? "de-DE" : lang === "es" ? "es-ES" : "en-GB";
  const date = new Date().toLocaleDateString(dateLocale, { day: "numeric", month: "long", year: "numeric" });

  const isTidalType = (type: string) => type === "tidevann";

  return (
    <>
      <style>{`
        @page { margin: 12mm 10mm; size: A4; }
        @media print {
          nav, aside, header, [data-no-print] { display: none !important; }
          body { background: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          main { padding: 0 !important; width: 100% !important; overflow: visible !important; }
          .report-page { padding: 0 !important; max-width: 100% !important; }
          .report-card { box-shadow: none !important; border: none !important; border-radius: 0 !important; }
          .report-map { page-break-inside: avoid; break-inside: avoid; }
          .report-section { page-break-inside: avoid; break-inside: avoid; }
          .report-table-wrap { overflow: visible !important; border-radius: 0 !important; }
          h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
          img { max-width: 100% !important; }
        }
        .report-page { font-family: 'Inter', sans-serif; }
      `}</style>

      <div className="report-page max-w-5xl mx-auto">

        {/* ── Toolbar ── */}
        <div data-no-print className="flex justify-end mb-6 gap-3 items-center">
          {/* Language toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-semibold">
            {(["no","en","es","de"] as Lang[]).map((l, i) => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-3 py-2 transition-colors ${lang === l ? "bg-[#0F2A5A] text-white" : "bg-white text-slate-500 hover:bg-slate-50"} ${i > 0 ? "border-l border-slate-200" : ""}`}>
                {l === "no" ? "🇳🇴 NO" : l === "en" ? "🇬🇧 EN" : l === "es" ? "🇪🇸 ES" : "🇩🇪 DE"}
              </button>
            ))}
          </div>
          <a
            href={`/prosjekter/${prosjektId}?mode=teknisk`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            {lang === "no" ? "Vis prosjekt" : lang === "de" ? "Projekt anzeigen" : lang === "es" ? "Ver proyecto" : "View project"}
          </a>
          <button
            onClick={() => { setSendModal(true); setSendOk(false); setSendFeil(null); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            {t.sendRapport}
          </button>
          <button
            onClick={() => {
              const prev = document.title;
              document.title = `Rapport – ${prosjekt.navn}`;
              window.print();
              document.title = prev;
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
            style={{ background: "#0F2A5A" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            {t.downloadPdf}
          </button>
        </div>

        {/* ── Send rapport-modal ── */}
        {sendModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSendModal(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-8" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-slate-900">{t.sendTittel}</h2>
                <button onClick={() => setSendModal(false)} className="text-slate-400 hover:text-slate-600">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{t.mottakerEpost} *</label>
                  <input
                    type="email"
                    value={sendEpost}
                    onChange={e => setSendEpost(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                    placeholder="navn@selskap.no"
                    disabled={sending || sendOk}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{t.mottakerNavn}</label>
                  <input
                    type="text"
                    value={sendNavn}
                    onChange={e => setSendNavn(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                    placeholder="Ola Nordmann"
                    disabled={sending || sendOk}
                  />
                </div>
                {sendFeil && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{sendFeil}</div>
                )}
                {sendOk ? (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-700">{t.sendOk}</div>
                ) : (
                  <button
                    onClick={sendRapport}
                    disabled={!sendEpost || sending}
                    className="w-full py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-opacity hover:opacity-90"
                    style={{ background: "#0F2A5A" }}
                  >
                    {sending ? t.sender : t.sendKnapp}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════ REPORT DOCUMENT ════ */}
        <div className="report-card bg-white rounded-2xl shadow-sm border border-slate-200">

          {/* ── Header ── */}
          <div className="px-10 py-7 flex items-center justify-between" style={{ background: "#0F2A5A" }}>
            <div>
              <div className="text-white/50 text-xs uppercase tracking-widest mb-1">{t.reportTitle}</div>
              <h1 className="text-white text-2xl font-bold tracking-tight">{prosjekt.navn}</h1>
              {prosjekt.sted && <p className="text-white/50 text-sm mt-0.5">{prosjekt.sted}</p>}
            </div>
            <div className="flex flex-col items-end gap-2">
              <Image src="/logo.png" alt="Tideron" width={120} height={111} className="h-10 w-auto" priority />
              <div className="text-white/40 text-xs">{date}</div>
              {prosjekt.stadie && (
                <div className="px-2.5 py-0.5 rounded text-xs font-medium"
                  style={{ background: "rgba(255,255,255,.15)", color: "rgba(255,255,255,.85)" }}>
                  {prosjekt.stadie}
                </div>
              )}
            </div>
          </div>

          {/* ── Key figures ── */}
          <div className="grid grid-cols-4 border-b border-slate-100">
            {[
              { label: t.rotorsPlaced,  val: placed.length,                          unit: t.units },
              { label: t.totalPower,    val: totKw  > 0 ? fmtKw(totKw)         : "—", unit: "" },
              { label: lang === "no" ? "Produksjon (100% drift)" : "Production (100% uptime)", val: totKw > 0 ? fmtMwh(totKw * 8760 / 1000, lang) : "—", unit: "" },
              { label: t.avgVelocity,   val: avgV   > 0 ? avgV.toFixed(2)       : "—", unit: avgV > 0 ? "m/s" : "" },
            ].map((s, i) => (
              <div key={s.label} className={`px-7 py-5 ${i < 3 ? "border-r border-slate-100" : ""}`}>
                <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">{s.label}</div>
                <div className="text-slate-900 text-xl font-bold leading-none">
                  {s.val}
                  {s.unit && <span className="text-sm font-normal text-slate-400 ml-1">{s.unit}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* ── 100%-notis ── */}
          {totKw > 0 && (
            <p className="text-slate-400 text-[9px] px-7 py-2 border-b border-slate-100 text-right tracking-wide">
              {lang === "no"
                ? "* Produksjon beregnet ved 100 % drift (24 t/dag · 365 dager). Faktisk produksjon avhenger av kapasitetsfaktor for anleggstypen."
                : "* Production calculated at 100 % uptime (24 h/day · 365 days). Actual production depends on the capacity factor for the installation type."}
            </p>
          )}

          {/* ── Fysisk-tak-varsel ── */}
          {fysiskTak && (fysiskTak.overBetz || fysiskTak.overBlokkering) && (
            <div className={`mx-10 mt-6 rounded-lg p-4 border ${fysiskTak.overBetz ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
              <p className={`text-sm font-semibold ${fysiskTak.overBetz ? "text-red-700" : "text-amber-700"}`}>
                {fysiskTak.overBetz
                  ? (lang === "no" ? "⚠ Installert effekt er fysisk umulig for dette elvestrekket" : "⚠ Installed capacity exceeds the physical limit for this river reach")
                  : (lang === "no" ? "⚠ Installert effekt overstiger realistisk uttak for valgt antall rotorer" : "⚠ Installed capacity exceeds realistic extraction for the placed rotor count")}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {fmtKw(totKw)} {lang === "no" ? "installert vs. maks" : "installed vs. max"} {fmtKw(fysiskTak.pBetzKw)} (Betz) /{" "}
                {fmtKw(fysiskTak.pEkstraherbarKw)} {lang === "no" ? "realistisk uttak ved" : "realistic extraction at"} {avgV.toFixed(2)} m/s.
              </p>
            </div>
          )}

          <div className="px-10 py-8 space-y-10">

            {/* ── Stream information ── */}
            <section className="report-section">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{t.streamInfo}</p>
                {!editStream && (
                  <button
                    data-no-print
                    onClick={() => { setStreamEdit(stream ?? { stream_type: "tidevann" }); setEditStream(true); }}
                    className="text-xs text-[#0F2A5A] font-semibold hover:underline flex items-center gap-1"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    {t.edit}
                  </button>
                )}
              </div>

              {editStream ? (
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{t.streamType}</label>
                      <div className="w-full border border-slate-100 bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-500">
                        {STREAM_LABEL.no[streamEdit?.stream_type ?? "tidevann"] ?? streamEdit?.stream_type}
                        <span className="ml-1 text-xs text-slate-400">(endres i Innstillinger)</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
                        {isTidalType(streamEdit?.stream_type) ? t.peakVel : t.avgVel}
                      </label>
                      <input
                        type="number" step="0.001" min="0"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white"
                        value={isTidalType(streamEdit?.stream_type)
                          ? (streamEdit?.peak_velocity_m_s ?? "") : (streamEdit?.avg_velocity_m_s ?? "")}
                        onChange={e => setStreamEditField(
                          isTidalType(streamEdit?.stream_type) ? "peak_velocity_m_s" : "avg_velocity_m_s",
                          e.target.value
                        )}
                        placeholder="0.000"
                      />
                    </div>
                    {isTidalType(streamEdit?.stream_type) && (
                      <div>
                        <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
                          {t.avgAuto637}
                        </label>
                        <input readOnly
                          className="w-full border border-slate-100 bg-white rounded-lg px-3 py-2 text-sm text-slate-400"
                          value={streamEdit?.avg_velocity_m_s ?? ""} placeholder="Auto" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{t.bredde}</label>
                      <input
                        type="number" step="1" min="0"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white"
                        value={streamEdit?.bredde_m ?? ""}
                        onChange={e => setStreamEditField("bredde_m", e.target.value)}
                        placeholder="e.g. 200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{t.lengde}</label>
                      <input
                        type="number" step="1" min="0"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white"
                        value={streamEdit?.lengde_m ?? ""}
                        onChange={e => setStreamEditField("lengde_m", e.target.value)}
                        placeholder="e.g. 1000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{t.dataSource}</label>
                      <input
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 bg-white"
                        value={streamEdit?.datakilde ?? ""}
                        onChange={e => setStreamEditField("datakilde", e.target.value)}
                        placeholder={t.dataPlaceholder}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={saveStream} disabled={savingStream}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                      style={{ background: "#0F2A5A" }}>
                      {savingStream ? t.saving : t.save}
                    </button>
                    <button onClick={() => setEditStream(false)}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50">
                      {t.cancel}
                    </button>
                  </div>
                </div>
              ) : stream ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0 32px", borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
                  {[
                    { label: t.streamType,     val: STREAM_LABEL[lang][stream.stream_type] ?? stream.stream_type ?? "—" },
                    { label: t.avgVelDisplay,  val: stream.avg_velocity_m_s  ? `${Number(stream.avg_velocity_m_s).toFixed(2)} m/s`  : null },
                    { label: t.peakVelDisplay, val: stream.peak_velocity_m_s ? `${Number(stream.peak_velocity_m_s).toFixed(2)} m/s` : null },
                    stream.bredde_m  ? { label: t.breddeDisp,    val: `${Number(stream.bredde_m).toLocaleString("nb-NO")} m` }  : null,
                    stream.lengde_m  ? { label: t.lengdeDisp,    val: `${Number(stream.lengde_m).toLocaleString("nb-NO")} m` }  : null,
                    stream.datakilde ? { label: t.dataSourceDisp, val: stream.datakilde } : null,
                  ].filter(Boolean).filter(f => f!.val).map(f => (
                    <div key={f!.label} style={{ padding: "6px 0", minWidth: 140 }}>
                      <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{f!.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{f!.val}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-sm">{t.noStream}</p>
              )}
            </section>

            {/* ── Kart med rotorformer ── */}
            <section className="report-map report-section">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">{t.siteMap}</p>
              <p className="text-xs text-slate-400 mb-3">
                {lang === "no" ? "Blå sirkler viser faktisk rotordiameter. Stiplet ring = eksklusjonssone (1,5× diameter)." : "Blue circles show actual rotor diameter. Dashed ring = exclusion zone (1.5× diameter)."}
              </p>
              {placed.length > 0 ? (
                <RapportKart
                  rotorer={placed.map((r): RotorKartData => ({
                    lat: +r.lat, lon: +r.lon, modell: r.modell, kw: rotorKw(r, avgV, rho),
                    diameter_m: r.diameter_m, lengde_m: r.lengde_m, hoyde_m: r.hoyde_m,
                    bredde_m: r.bredde_m, dybde_m: r.dybde_m, rotor_type: r.rotor_type,
                  }))}
                  kabler={kabler.map((k): KabelKartData => ({
                    waypoints: k.waypoints ?? [],
                    type: k.type,
                    navn: k.navn,
                  }))}
                  centerLat={placed.reduce((s, r) => s + +r.lat, 0) / placed.length}
                  centerLon={placed.reduce((s, r) => s + +r.lon, 0) / placed.length}
                  visFormer={true}
                />
              ) : (
                <div className="border border-slate-200 bg-slate-50 px-6 py-8 text-center text-slate-400 text-sm rounded-lg">
                  {t.noRotors}
                </div>
              )}
            </section>

            {/* ── Rotorer ── */}
            <section className="report-section">
              <div className="flex items-baseline gap-2 mb-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{t.placedRotors}</p>
                <span className="text-[10px] text-slate-300">{placed.length}</span>
              </div>
              {placed.length === 0 ? (
                <p className="text-slate-400 text-sm">{t.noRotors}</p>
              ) : (
                <div className="report-table-wrap border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full" style={{ fontSize: 13, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#0F2A5A" }}>
                        {[
                          { h: "#",               align: "center" },
                          { h: t.model,           align: "left" },
                          { h: t.mal,             align: "left" },
                          { h: t.sveptAreal,      align: "right" },
                          { h: t.velocity,        align: "right" },
                          { h: t.power,           align: "right" },
                          { h: lang === "no" ? "Høyde" : "Elevation", align: "right" },
                          { h: t.coordinates,     align: "right" },
                        ].map((col, i) => (
                          <th key={i} style={{
                            padding: "9px 12px",
                            textAlign: col.align as any,
                            fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                            textTransform: "uppercase", color: "rgba(255,255,255,0.6)",
                            borderBottom: "1px solid rgba(255,255,255,0.1)",
                          }}>{col.h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {placed.map((r, i) => {
                        const kw   = rotorKw(r, avgV, rho);
                        const v    = r.hastighet_m_s ? +r.hastighet_m_s : (avgV || null);
                        const elev = r.elevation_m != null ? `${Number(r.elevation_m).toFixed(0)} m` : "—";
                        const areal = sveptArealM2(r);
                        return (
                          <tr key={r.id} style={{ borderTop: i > 0 ? "1px solid #f1f5f9" : "none", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ padding: "8px 12px", textAlign: "center" }}>
                              <div style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                width: 22, height: 22, borderRadius: "50%",
                                background: "#0F2A5A", color: "#fff", fontSize: 10, fontWeight: 700,
                              }}>{i + 1}</div>
                            </td>
                            <td style={{ padding: "8px 12px", fontWeight: 500, color: "#1e293b" }}>{r.modell}</td>
                            <td style={{ padding: "8px 12px", color: "#64748b", fontSize: 12 }}>{malTekst(r)}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", color: "#64748b", fontSize: 12 }}>
                              {areal != null ? `${areal.toFixed(1)} m²` : "—"}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right", color: "#64748b", fontSize: 12 }}>{v ? `${v.toFixed(2)} m/s` : "—"}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#059669" }}>{kw != null ? fmtKw(kw) : "—"}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", color: "#64748b", fontSize: 12 }}>{elev}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "#94a3b8" }}>{(+r.lat).toFixed(5)}, {(+r.lon).toFixed(5)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {(() => {
                        const totAreal = placed.reduce((sum, r) => {
                          const a = sveptArealM2(r); return a != null ? sum + a : sum;
                        }, 0);
                        return (
                          <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
                            <td colSpan={3} style={{ padding: "9px 12px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#94a3b8" }}>{t.total}</td>
                            <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#1e293b", fontSize: 12 }}>
                              {totAreal > 0 ? `${totAreal.toFixed(1)} m²` : "—"}
                            </td>
                            <td />
                            <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#1e293b" }}>{totKw > 0 ? fmtKw(totKw) : "—"}</td>
                            <td colSpan={2} />
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                </div>
              )}
            </section>

            {/* ── Produksjonsestimat ── */}
            {totKw > 0 && (() => {
              const elevs = placed.map(r => r.elevation_m != null ? Number(r.elevation_m) : null).filter((e): e is number => e !== null);
              const elevDiff = elevs.length >= 2 ? Math.max(...elevs) - Math.min(...elevs) : null;
              const cards = [
                {
                  label: lang === "no" ? "Installert effekt" : "Installed capacity",
                  val: fmtKw(totKw),
                  sub: `${placed.length} ${lang === "no" ? "rotorer" : "rotors"}`,
                },
                {
                  label: lang === "no" ? "Estimert årsproduksjon" : "Estimated annual production",
                  val: fmtMwh(totMwh, lang),
                  sub: `${(totMwh * 1000).toFixed(0)} MWh/${lang === "no" ? "år" : "yr"}`,
                },
                ...(elevDiff !== null ? [{
                  label: lang === "no" ? "Høydeforskjell" : "Elevation span",
                  val: `${elevDiff.toFixed(0)} m`,
                  sub: lang === "no"
                    ? `${Math.min(...elevs).toFixed(0)} – ${Math.max(...elevs).toFixed(0)} m o.h.`
                    : `${Math.min(...elevs).toFixed(0)} – ${Math.max(...elevs).toFixed(0)} m a.s.l.`,
                }] : []),
              ];
              return (
                <section className="report-section">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                    {lang === "no" ? "Produksjonsestimat" : "Production estimate"}
                  </p>
                  <div className={`grid gap-4 grid-cols-${cards.length === 3 ? "3" : "2"}`}>
                    {cards.map(f => (
                      <div key={f.label} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "16px 20px" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{f.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>{f.val}</div>
                        <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4 }}>{f.sub}</div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* ── Footer ── */}
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 20, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#cbd5e1" }}>
              <span>{t.generated} · {date}</span>
              <span>{t.projectId}: {prosjektId}</span>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

