"use client";
/**
 * NVE Meldeskjema: Konsesjonspliktvurdering av kraftverk
 * Referanse: Melding om kraftverk (bokmål), pbl. § 12-8 / vannressursloven § 18
 *
 * Auto-utfyller felter fra prosjektdata. Brukeren fyller inn resten.
 * Gir en print-klar HTML-visning som kan lagres som PDF.
 * Lagrer som søknad i project_applications.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  beregnEffektKw, beregnEffektKwFlateareal, beregnArligKwh,
  rhoFraVanntype,
} from "@/lib/finans";
import GeoDataKnapp, { type GeoDataResultat } from "./GeoDataKnapp";

import type { NveType } from "../rapporter/page";

interface Props {
  prosjektId: string;
  nveType?: NveType;
  onLukk: () => void;
  onLagretSoknad?: () => void;
}

const NVE_TYPE_INFO: Record<NveType, { label: string; hjemmel: string; erKonsesjonspliktig: boolean }> = {
  mikro: {
    label: "Mikrokraftverk (< 1 MW)",
    hjemmel: "Vannressursloven § 18 — Meldeplikt",
    erKonsesjonspliktig: false,
  },
  mini: {
    label: "Minikraftverk (1–10 MW)",
    hjemmel: "Vannressursloven § 18 — Meldeplikt / § 8 Konsesjonsplikt",
    erKonsesjonspliktig: false,
  },
  stor: {
    label: "Småkraftverk / større (> 10 MW)",
    hjemmel: "Energiloven / Vannressursloven § 8 — Konsesjonsplikt",
    erKonsesjonspliktig: true,
  },
};

// ─── Modeller ─────────────────────────────────────────────────────────────────
interface ProsjektData {
  navn: string; sted: string; lat: number | null; lon: number | null;
  country_code: string | null; vann_type: string | null;
}
interface StreamData {
  stream_type: string | null; avg_velocity_m_s: number | null;
  peak_velocity_m_s: number | null; bredde_m: number | null;
  datakilde: string | null;
}
interface RotorData {
  modell: string | null; diameter_m: number | null; lengde_m: number | null;
  hoyde_m: number | null; lat: number | null; lon: number | null;
}

const KONTROLLSPØRSMÅL = [
  "Ligger tiltaket i verna vassdrag?",
  "Planlegges tiltaket med reguleringsmagasin?",
  "Kan tiltaket påvirke vannstanden i innsjø/tjern oppstrøms inntak?",
  "Planlegges vannuttak uten slipp av minstevannføring tilsvarende minimum alminnelig lavvannføring?",
  "Er det registrert naturtyper med tilknytning til vassdraget som blir berørt?",
  "Er det registrert rødlistede arter med tilknytning til vassdraget som blir berørt?",
  "Berører prosjektet anadrom strekning i nasjonale laksevassdrag?",
  "Er installert effekt over 1 MW?",
  "Berører tiltaket andre allmenne interesser i vesentlig grad?",
];

type KSvar = "ja" | "nei" | "ukjent";

// ─── Hjelp: effekt per rotor ───────────────────────────────────────────────
function effektKw(r: RotorData, v: number, rho: number): number {
  if (r.lengde_m && r.hoyde_m) return beregnEffektKwFlateareal(v, r.lengde_m * r.hoyde_m, rho);
  if (r.diameter_m)              return beregnEffektKw(v, r.diameter_m, rho);
  return 0;
}

// ─── Dato ─────────────────────────────────────────────────────────────────────
const DATO_NÅ = new Date().toLocaleDateString("nb-NO", {
  day: "numeric", month: "long", year: "numeric",
});

// ─── Komponent ────────────────────────────────────────────────────────────────
export default function MeldingOmKraftverkForm({ prosjektId, nveType = "mikro", onLukk, onLagretSoknad }: Props) {
  const typeInfo = NVE_TYPE_INFO[nveType];
  const sb = createClient();

  // Prosjektdata
  const [prosjekt, setProsjekt] = useState<ProsjektData | null>(null);
  const [stream,   setStream]   = useState<StreamData | null>(null);
  const [rotorer,  setRotorer]  = useState<RotorData[]>([]);
  const [laster,   setLaster]   = useState(true);

  // (ingen faner lenger — kun redigeringsvisning)
  const [lagrer, setLagrer] = useState(false);
  const [lagretOk, setLagretOk] = useState(false);

  // ── Skjemafelt ──────────────────────────────────────────────────────────────
  const [tiltakshaverNavn,   setTiltakshaverNavn]   = useState("Tideron AS");
  const [tiltakshaverAdr,    setTiltakshaverAdr]    = useState("Ortnevik 3");
  const [tiltakshaverPost,   setTiltakshaverPost]   = useState("5962 Bjordal");
  const [tiltakshaverTlf,    setTiltakshaverTlf]    = useState("+47 922 23 456");
  const [tiltakshaverEpost,  setTiltakshaverEpost]  = useState("mza@tideron.com");
  const [kontaktNavn,        setKontaktNavn]        = useState("Morten Zakariassen");
  const [kontaktTlf,         setKontaktTlf]         = useState("+47 922 23 456");
  const [kontaktEpost,       setKontaktEpost]       = useState("mza@tideron.com");

  const [elvNavn,            setElvNavn]            = useState("");
  const [kommuneNavn,        setKommuneNavn]        = useState("");
  const [fylkeNavn,          setFylkeNavn]          = useState("");
  const [vassdragsNr,        setVassdragsNr]        = useState("");
  const [dato,               setDato]               = useState(DATO_NÅ);

  // Tekniske data (kraftverk) — for Waterotor (hydrokinetisk, ingen dam/inntak)
  const [installertEffektKw, setInstallertEffektKw] = useState("");
  const [arligProdGwh,       setArligProdGwh]       = useState("");
  const [berortStrekning,     setBerortStrekning]    = useState("");
  const [antallRotorer,      setAntallRotorer]      = useState("");
  const [rotorModell,        setRotorModell]        = useState("Waterotor");
  const [gjennomsnittHast,   setGjennomsnittHast]   = useState("");
  const [datakilde,          setDatakilde]          = useState("");

  // Tilsig-tabell (valgfritt for hydrokinetisk)
  const [nedborfelt,         setNedborfelt]         = useState("");
  const [middelvannf,        setMiddelvannf]        = useState("");
  const [lavvannf,           setLavvannf]           = useState("");

  // Kontrollspørsmål
  const [ksvar, setKsvar] = useState<KSvar[]>(KONTROLLSPØRSMÅL.map(() => "nei"));

  // Seksjonsfelt
  const [formålTekst,        setFormålTekst]        = useState("");
  const [beskrivelseKraftverk, setBeskrivelseKraftverk] = useState("");
  const [naturmangfold,      setNaturmangfold]      = useState(
    "Søk i Artsdatabanken og Naturbase er gjennomført. Ingen rødlistede arter registrert i nær tilknytning til tiltaksområdet. Miljødirektoratets karttjenester er konsultert. Tiltaket medfører ikke inntak av vann eller fysiske inngrep i elvebunnen utover forankringspunkter.");
  const [landskap,           setLandskap]           = useState(
    "Waterotor er et lavtliggende flytende eller bunnforankret aggregat uten synlige overflateinstallasjoner av betydning. Aggregatet har liten visuell påvirkning på landskapet.");
  const [brukerinteresser,   setBrukerinteresser]   = useState(
    "Fiske, friluftsliv og ferdsel i vassdraget er vurdert. Aggregatets plassering er planlagt slik at det ikke hindrer alminnelig ferdsel. Fisk og fauna kan passere fritt forbi aggregatet.");
  const [kulturminner,       setKulturminner]       = useState(
    "Fylkeskommunen er ikke kontaktet i denne fasen. Kulturminnesøk er gjennomgått. Ingen kjente kulturminner i umiddelbar nærhet av tiltaksstedet.");
  const [skred,              setSkred]              = useState(
    "Skredatlas (skrednett.no) er konsultert. Ingen registrert skredfare i tiltaksområdet.");
  const [offentligePlaner,   setOffentligePlaner]   = useState(
    "Tiltaket er ikke i strid med gjeldende kommuneplan. Vassdraget er ikke vernet etter verneplanen for vassdrag. Det er ikke registrert som nasjonalt laksevassdrag.");
  const [tilleggInfo,        setTilleggInfo]        = useState(
    "Waterotor er en hydrokinetisk teknologi som utnytter kinetisk energi i strømmende vann uten dam, inntakskanal eller minstevannføringskrav. Aggregatet medfører ikke reguleringsmagasin. Tiltaket klassifiseres som et vassdragstiltak etter vannressursloven § 8 og meldes til NVE for konsesjonspliktvurdering.");

  // Vedlegg-avkryssing
  const [vedleggKart,        setVedleggKart]        = useState(false);
  const [vedleggDetaljkart,  setVedleggDetaljkart]  = useState(false);
  const [vedleggFoto,        setVedleggFoto]        = useState(false);
  // vedleggVarighet fjernet — Waterotor gjør ikke vannuttak

  // Kartutsnitt
  const [kartBase64,         setKartBase64]         = useState<string | null>(null);
  const [kartLaster,         setKartLaster]         = useState(false);
  const kartForsøkt = useRef(false);

  // ── Last prosjektdata ───────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      sb.from("projects").select("navn,sted,lat,lon,country_code,vann_type").eq("id", prosjektId).single(),
      sb.from("streams").select("stream_type,avg_velocity_m_s,peak_velocity_m_s,bredde_m,datakilde").eq("project_id", prosjektId).maybeSingle(),
      sb.from("rotors").select("modell,diameter_m,lengde_m,hoyde_m,lat,lon").eq("project_id", prosjektId),
    ]).then(([{ data: p }, { data: s }, { data: r }]) => {
      const rotData = (r ?? []) as RotorData[];
      const streamData = (s as StreamData | null);

      if (p) {
        setProsjekt(p as ProsjektData);
        const stedDeler = (p.sted ?? "").split(",");
        setKommuneNavn(stedDeler[0]?.trim() ?? "");
        setFylkeNavn(stedDeler[1]?.trim() ?? "");
        setElvNavn(p.navn ?? "");
      }

      if (streamData) {
        setStream(streamData);
        const v = streamData.avg_velocity_m_s ?? streamData.peak_velocity_m_s ?? 0;
        setGjennomsnittHast(v > 0 ? v.toFixed(2) : "");
        setDatakilde(streamData.datakilde ?? "");
        if (streamData.bredde_m) setBerortStrekning(`${streamData.bredde_m} m bredde`);
      }

      if (rotData.length > 0) {
        const plasserte = rotData.filter(r => r.lat && r.lon);
        setAntallRotorer(String(plasserte.length > 0 ? plasserte.length : rotData.length));
        const modeller = Array.from(new Set(rotData.map(r => r.modell).filter(Boolean))) as string[];
        if (modeller.length > 0) setRotorModell(modeller.join(", ") || "Waterotor");

        // Regn ut installert effekt
        if (s) {
          const v = (s as StreamData).avg_velocity_m_s ?? (s as StreamData).peak_velocity_m_s ?? 0;
          const rho = rhoFraVanntype(p?.vann_type ?? null);
          const totalKw = rotData.reduce((sum, r) => sum + effektKw(r, v, rho), 0);
          if (totalKw > 0) {
            setInstallertEffektKw(totalKw.toFixed(1));
            const arligKwh = beregnArligKwh(totalKw, String(v));
            setArligProdGwh((arligKwh / 1_000_000).toFixed(4));
          }
        }
      }

      const navn = p?.navn ?? "";
      setBeskrivelseKraftverk(
        `${navn} er et hydrokinetisk kraftanlegg basert på Waterotor-teknologi. `
        + `Aggregatene plasseres i strømmende vann uten dam, inntaksdam eller minstevannføringskrav. `
        + `Teknologien utnytter kinetisk energi direkte fra vannstrømmen. `
        + `Anlegget produserer fornybar elektrisk kraft som leveres til nettet eller brukes lokalt.`
      );
      setFormålTekst(
        `Formålet med tiltaket er å utnytte fornybar hydrokinetisk energi i ${(p?.sted) ?? "planområdet"} til lokal og regional strømproduksjon. `
        + `Prosjektet bidrar til Norges mål om økt fornybar energiproduksjon.`
      );

      // Forhåndssett kontrollspørsmål basert på kraftverkstype
      setKsvar(prev => {
        const ny = [...prev];
        // Spørsmål 7: «Er installert effekt over 1 MW?»
        if (nveType === "mini" || nveType === "stor") ny[7] = "ja";
        else ny[7] = "nei";
        return ny;
      });

      // Auto-generer kartutsnitt hvis rotorer har koordinater
      const medKoord = rotData.filter(r => r.lat && r.lon);
      if (medKoord.length > 0 && !kartForsøkt.current) {
        kartForsøkt.current = true;
        setKartLaster(true);
        fetch("/planner/api/kartutsnitt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rotorer: medKoord.map(r => ({ lat: r.lat!, lon: r.lon! })) }),
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data?.base64) setKartBase64(data.base64); })
          .catch(() => {})
          .finally(() => setKartLaster(false));
      }

      setLaster(false);
    });
  }, [prosjektId, nveType]); // eslint-disable-line

  // ── Kontrollspørsmål-oppsummering ──────────────────────────────────────────
  const harJaSvar = ksvar.some(s => s === "ja");

  // ── Lagre som søknad ───────────────────────────────────────────────────────
  const lagreSomSoknad = async () => {
    setLagrer(true);
    await sb.from("project_applications").insert({
      project_id: prosjektId,
      tittel: `NVE Melding om konsesjonspliktvurdering: ${prosjekt?.navn ?? "kraftverk"}`,
      type: "melding",
      status: "under_utarbeidelse",
      myndighet: "NVE (Norges vassdrags- og energidirektorat)",
      ansvarlig: kontaktNavn,
      notater: `Dato: ${dato}. Installert effekt: ${installertEffektKw} kW. Vassdrag: ${elvNavn}, ${kommuneNavn}.`,
    });
    setLagrer(false);
    setLagretOk(true);
    onLagretSoknad?.();
  };

  // ── Geodata fra offentlige registre ───────────────────────────────────────
  const oppdaterFraGeoData = (data: GeoDataResultat) => {
    const { nve, naturmangfold, kulturminner, plandata } = data;

    // Vassdrag
    if (nve.vassdragsnr)  setVassdragsNr(nve.vassdragsnr);
    if (nve.elvNavn)      setElvNavn(nve.elvNavn);

    // Hydrologiske data
    if (nve.nedborfeltKm2)      setNedborfelt(String(nve.nedborfeltKm2));
    if (nve.middelvannforingLs) setMiddelvannf(String(nve.middelvannforingLs));
    if (nve.lavvannforingLs)    setLavvannf(String(nve.lavvannforingLs));
    if (nve.elvNavn || nve.vassdragsnr)
      setDatakilde(`NVE hydrologidata${nve.vassdragsnr ? " — vassdrag " + nve.vassdragsnr : ""}`);

    // Tekstseksjoner
    if (naturmangfold.oppsummering) setNaturmangfold(naturmangfold.oppsummering);
    if (kulturminner.oppsummering)  setKulturminner(kulturminner.oppsummering);
    if (plandata.oppsummering)      setOffentligePlaner(plandata.oppsummering);

    // Auto-svar kontrollspørsmål fra geodata
    setKsvar(prev => {
      const ny = [...prev];
      // Q0: Verna vassdrag
      if (plandata.vernVassdrag === true)  ny[0] = "ja";
      if (plandata.vernVassdrag === false) ny[0] = "nei";
      // Q4: Naturtyper registrert
      if (naturmangfold.naturtyper.length > 0) ny[4] = "ja";
      else if (!naturmangfold.feil)            ny[4] = "nei";
      // Q5: Rødlistede arter registrert
      if (naturmangfold.trueteArter.length > 0) ny[5] = "ja";
      else if (!naturmangfold.feil)              ny[5] = "nei";
      // Q6: Nasjonalt laksevassdrag
      if (plandata.nasjonaltLaksevassdrag === true)  ny[6] = "ja";
      if (plandata.nasjonaltLaksevassdrag === false) ny[6] = "nei";
      return ny;
    });
  };

  // ── Send direkte til NVE / intern test ────────────────────────────────────
  const [senderNve,    setSenderNve]    = useState(false);
  const [sendtNve,     setSendtNve]     = useState(false);
  const [visNveModal,  setVisNveModal]  = useState(false);
  const [nveEpost,     setNveEpost]     = useState("post@nve.no");
  const [senderTest,   setSenderTest]   = useState(false);
  const [sendtTest,    setSendtTest]    = useState(false);

  const byggOgSendEpost = useCallback(async (
    mottakerEpost: string,
    mottakerNavn: string,
    erTest: boolean,
  ) => {
    // 1. Generer Word-dokument
    const wordRes = await fetch("/planner/api/soknad/melding-om-kraftverk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: prosjektId, feltData: byggFeltData() }),
    });
    if (!wordRes.ok) throw new Error(await wordRes.text());
    const docxBlob = await wordRes.blob();

    // 2. Bygg FormData
    const testPrefix = erTest ? "[TEST] " : "";
    const formData = new FormData();
    formData.append("project_id", prosjektId);
    formData.append("mottaker_epost", mottakerEpost);
    formData.append("mottaker_navn",  mottakerNavn);
    formData.append("emne", `${testPrefix}Melding om konsesjonspliktvurdering: ${prosjekt?.navn ?? prosjektId}`);
    formData.append("html",
      `${erTest ? `<p style="background:#fef3c7;padding:8px 12px;border-radius:6px;font-weight:600">INTERN TEST — ikke en offisiell innsending</p>` : ""}
       <p>Vedlagt følger melding om konsesjonspliktvurdering etter vannressursloven § 18 for prosjektet <strong>${prosjekt?.navn}</strong>.</p>
       <p>Tiltakshaver: ${tiltakshaverNavn}<br>Kontaktperson: ${kontaktNavn} — ${kontaktEpost} / ${kontaktTlf}</p>
       <p>Vassdrag: ${elvNavn}${vassdragsNr ? ` (vassdragsnr. ${vassdragsNr})` : ""}, ${kommuneNavn} kommune.</p>
       <p>Installert effekt: ${installertEffektKw} kW. Forventet produksjon: ${arligProdGwh} GWh/år.</p>
       ${kartBase64 ? `<p>Vedlagt kartutsnitt viser plassering av rotor-aggregatene.</p>` : ""}`,
    );
    formData.append("vedlegg", docxBlob,
      `${testPrefix.replace(/ /g,"-")}melding-om-kraftverk-${prosjekt?.navn ?? prosjektId}.docx`,
    );

    // 3. Legg ved kartutsnitt hvis tilgjengelig
    if (kartBase64) {
      const kartBytes = Uint8Array.from(atob(kartBase64), c => c.charCodeAt(0));
      const kartBlob  = new Blob([kartBytes], { type: "image/png" });
      formData.append("kartutsnitt", kartBlob, "kartutsnitt.png");
    }

    // 4. Send
    const sendRes = await fetch("/planner/api/varsler/melding-nve", { method: "POST", body: formData });
    if (!sendRes.ok) throw new Error(await sendRes.text());

    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prosjektId, prosjekt, tiltakshaverNavn, kontaktNavn, kontaktEpost, kontaktTlf,
      elvNavn, vassdragsNr, kommuneNavn, installertEffektKw, arligProdGwh, kartBase64]);

  const sendTilNve = async () => {
    setSenderNve(true);
    try {
      await byggOgSendEpost(nveEpost, "NVE", false);
      setSendtNve(true);
      setVisNveModal(false);
      await createClient().from("project_applications").upsert({
        project_id: prosjektId,
        tittel: `NVE Melding om konsesjonspliktvurdering: ${prosjekt?.navn ?? "kraftverk"}`,
        type: "melding", status: "innsendt",
        myndighet: "NVE (Norges vassdrags- og energidirektorat)",
        ansvarlig: kontaktNavn,
        innsendt_dato: new Date().toISOString().split("T")[0],
        notater: `Sendt til ${nveEpost}. Vassdrag: ${elvNavn} ${vassdragsNr}. Effekt: ${installertEffektKw} kW.`,
      });
      onLagretSoknad?.();
    } catch (err) {
      alert("Sending feilet: " + (err as Error).message);
    } finally {
      setSenderNve(false);
    }
  };

  const sendInternTest = async () => {
    setSenderTest(true);
    try {
      await byggOgSendEpost("ksv@tideron.com", "Kai Svendstad (intern test)", true);
      setSendtTest(true);
    } catch (err) {
      alert("Testmail feilet: " + (err as Error).message);
    } finally {
      setSenderTest(false);
    }
  };

  // ── Felles feltdata-objekt ─────────────────────────────────────────────────
  const byggFeltData = () => ({
    kraftverkNavn: prosjekt?.navn ?? "",
    elvNavn,
    kommuneNavn,
    fylkeNavn,
    tiltakshaverNavn,
    tiltakshaverAdresse: tiltakshaverAdr,
    tiltakshaverPostnr:  tiltakshaverPost.split(" ")[0] ?? "",
    tiltakshaverPoststed: tiltakshaverPost.split(" ").slice(1).join(" ") || tiltakshaverPost,
    tiltakshaverTlf,
    tiltakshaverEpost,
    installertEffektKw: installertEffektKw + " kW",
    arligProdGwh:       arligProdGwh + " GWh",
    antallRoer:         antallRotorer,
    lengdeBeroertElv:   berortStrekning,
    geografiskBeskrivelse: beskrivelseKraftverk,
    tiltaksBeskrivelse: formålTekst,
    vannforingsBeskrivelse:
      "Det planlegges ikke reguleringsmagasin, dam eller minstevannføring. " +
      "Tiltaket påvirker ikke vannstand oppstrøms.",
    allmenneInteresserBeskrivelse: [naturmangfold, landskap, brukerinteresser, kulturminner, skred, offentligePlaner].join("\n\n"),
    tilleggsopplysninger: tilleggInfo,
  });

  // ── Last ned Word-dokument ─────────────────────────────────────────────────
  const [lasterNed, setLasterNed] = useState(false);

  const lastNedWord = async () => {
    setLasterNed(true);
    try {
      const res = await fetch("/planner/api/soknad/melding-om-kraftverk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: prosjektId,
          feltData: byggFeltData(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `melding-om-kraftverk-${prosjekt?.navn ?? prosjektId}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Nedlasting feilet: " + (err as Error).message);
    } finally {
      setLasterNed(false);
    }
  };

  // ── Hjelpere ───────────────────────────────────────────────────────────────
  const felt = (
    label: string, value: string, onChange: (v: string) => void,
    rows?: number, placeholder?: string, colSpan?: number,
  ) => (
    <div className={colSpan === 2 ? "col-span-2" : ""}>
      <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{label}</label>
      {rows ? (
        <textarea rows={rows} value={value}
          onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 resize-y" />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20" />
      )}
    </div>
  );

  if (laster) return (
    <div className="p-10 text-center text-slate-400 text-sm">Laster prosjektdata…</div>
  );

  return (
    <div className="space-y-0">
      {/* ── Topplinje ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={onLukk}
            className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1">
            ← Tilbake til rapporter
          </button>
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="font-semibold text-slate-900 text-lg">
              NVE — Melding om konsesjonspliktvurdering av kraftverk
            </h2>
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full font-medium">
              {typeInfo.label}
            </span>
            {typeInfo.erKonsesjonspliktig && (
              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                ⚠ Trolig konsesjonspliktig
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{typeInfo.hjemmel}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={lastNedWord} disabled={lasterNed}
            className="btn-primary text-sm disabled:opacity-50">
            {lasterNed ? "Genererer…" : "⬇ Last ned Word"}
          </button>
          <button onClick={sendInternTest} disabled={senderTest || sendtTest}
            className="btn-secondary text-sm disabled:opacity-50 border-amber-300 text-amber-700 hover:bg-amber-50">
            {sendtTest ? "✅ Test sendt" : senderTest ? "Sender…" : "🧪 Send intern test"}
          </button>
          <button onClick={() => setVisNveModal(true)} disabled={sendtNve}
            className="btn-primary text-sm bg-green-600 hover:bg-green-700 border-green-700 disabled:opacity-50">
            {sendtNve ? "✅ Sendt til NVE" : "📧 Send til NVE"}
          </button>
          <button onClick={lagreSomSoknad} disabled={lagrer || lagretOk}
            className="btn-secondary text-sm disabled:opacity-50">
            {lagretOk ? "✅ Lagret" : lagrer ? "Lagrer…" : "💾 Lagre"}
          </button>
        </div>
      </div>

      {/* ════════════════════ REDIGERINGSSKJEMA ════════════════════ */}
      <div className="space-y-5">

          {/* Geodata-knapp */}
          <GeoDataKnapp
            rotorKoordinater={
              rotorer.some(r => r.lat && r.lon)
                ? rotorer.map(r => ({ lat: r.lat, lon: r.lon }))
                : prosjekt?.lat && prosjekt?.lon
                  ? [{ lat: prosjekt.lat, lon: prosjekt.lon }]
                  : []
            }
            onData={oppdaterFraGeoData}
          />

          {/* Kontrollspørsmål */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-1">Kontrollspørsmål</h3>
            <p className="text-xs text-slate-400 mb-4">
              Svar ja på ett eller flere = tiltaket er sannsynlig konsesjonspliktig. Gå da direkte til konsesjonssøknad.
            </p>
            {harJaSvar && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm mb-4">
                ⚠️ Én eller flere spørsmål er besvart med «ja» — tiltaket kan kreve full konsesjonsbehandling. Kontakt NVE.
              </div>
            )}
            <div className="space-y-2">
              {KONTROLLSPØRSMÅL.map((spm, i) => (
                <div key={i} className="flex items-start gap-4 py-2 border-b border-slate-50 last:border-0">
                  <p className="text-sm text-slate-700 flex-1">{spm}</p>
                  <div className="flex gap-2 shrink-0">
                    {(["ja", "nei", "ukjent"] as KSvar[]).map(s => (
                      <button key={s} onClick={() => {
                        const ny = [...ksvar]; ny[i] = s; setKsvar(ny);
                      }}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                          ksvar[i] === s
                            ? s === "ja" ? "bg-red-100 border-red-300 text-red-700 font-medium"
                              : s === "nei" ? "bg-green-100 border-green-300 text-green-700 font-medium"
                              : "bg-slate-200 border-slate-300 text-slate-600 font-medium"
                            : "border-slate-200 text-slate-400 hover:border-slate-300"
                        }`}>
                        {s === "ukjent" ? "Ukjent" : s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Opplysninger om melder */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Opplysninger om melder / tiltakshaver</h3>
            <div className="grid grid-cols-3 gap-4">
              {felt("Navn (tiltakshaver)",      tiltakshaverNavn,  setTiltakshaverNavn)}
              {felt("Adresse",                  tiltakshaverAdr,   setTiltakshaverAdr)}
              {felt("Postnummer og poststed",   tiltakshaverPost,  setTiltakshaverPost)}
              {felt("Telefon",                  tiltakshaverTlf,   setTiltakshaverTlf)}
              {felt("E-postadresse",            tiltakshaverEpost, setTiltakshaverEpost)}
              <div />
              {felt("Kontaktperson (navn)",     kontaktNavn,       setKontaktNavn)}
              {felt("Kontaktperson (telefon)",  kontaktTlf,        setKontaktTlf)}
              {felt("Kontaktperson (e-post)",   kontaktEpost,      setKontaktEpost)}
            </div>
          </div>

          {/* Prosjekt-identifikasjon */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Prosjektidentifikasjon</h3>
            <div className="grid grid-cols-3 gap-4">
              {felt("Navn på kraftverk / elv",  elvNavn,      setElvNavn, undefined, "f.eks. Høyanger kraftverk")}
              {felt("Kommune",                  kommuneNavn,  setKommuneNavn)}
              {felt("Fylke",                    fylkeNavn,    setFylkeNavn)}
              {felt("Vassdragsnr. (NVE Atlas)", vassdragsNr,  setVassdragsNr, undefined, "f.eks. 073.5Z")}
              {felt("Dato for melding",          dato,         setDato)}
            </div>
          </div>

          {/* Tekniske data */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-1">Tekniske data — kraftverk</h3>
            <p className="text-xs text-slate-400 mb-4">
              Waterotor er hydrokinetisk (ingen dam, ingen vannuttak, ingen minstevannføring). Ikke-relevante feltene kan stå tomme.
            </p>
            <div className="grid grid-cols-3 gap-4">
              {felt("Antall aggregater",               antallRotorer,      setAntallRotorer, undefined, "stk.")}
              {felt("Modell / type",                   rotorModell,        setRotorModell)}
              {felt("Gjennomsnittlig vannhastighet",   gjennomsnittHast,   setGjennomsnittHast, undefined, "m/s")}
              {felt("Installert effekt (kW)",          installertEffektKw, setInstallertEffektKw, undefined, "kW")}
              {felt("Forventet årlig produksjon (GWh)",arligProdGwh,       setArligProdGwh, undefined, "GWh")}
              {felt("Berørt vassdragsstrekning (m)",   berortStrekning,     setBerortStrekning, undefined, "m")}
              {felt("Datakilde (strømdata)",            datakilde,          setDatakilde, undefined, "f.eks. NVE hydrologidata")}
            </div>
            <div className="border-t border-slate-100 mt-4 pt-4">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-3">Tilsig (fylles ut om relevant)</p>
              <div className="grid grid-cols-3 gap-4">
                {felt("Nedbørfelt (km²)",              nedborfelt,     setNedborfelt,  undefined, "km²")}
                {felt("Middelvannføring (l/s)",         middelvannf,    setMiddelvannf, undefined, "l/s")}
                {felt("Alminnelig lavvannføring (l/s)", lavvannf,       setLavvannf,    undefined, "l/s")}
              </div>
            </div>
          </div>

          {/* Tekstseksjoner */}
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-slate-900">Informasjon om kraftverket</h3>
            <div className="grid grid-cols-1 gap-4">
              {felt("Formål med tiltaket",          formålTekst,          setFormålTekst,          3)}
              {felt("Beskrivelse av tiltaket",      beskrivelseKraftverk, setBeskrivelseKraftverk, 5)}
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-slate-900">Beskrivelse av allmenne interesser</h3>
            <div className="grid grid-cols-1 gap-4">
              {felt("Naturens mangfold",            naturmangfold,     setNaturmangfold,     4)}
              {felt("Landskap",                     landskap,          setLandskap,          3)}
              {felt("Brukerinteresser",             brukerinteresser,  setBrukerinteresser,  3)}
              {felt("Kulturminner",                 kulturminner,      setKulturminner,      2)}
              {felt("Skred",                        skred,             setSkred,             2)}
              {felt("Offentlige planer og nasjonale føringer", offentligePlaner, setOffentligePlaner, 4)}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Tilleggsinformasjon</h3>
            {felt("", tilleggInfo, setTilleggInfo, 4, "Annen relevant informasjon…")}
          </div>

          {/* Vedlegg */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Vedlegg (kryss av det som legges ved)</h3>
            <div className="space-y-2">
              {[
                [vedleggKart,       setVedleggKart,       "Oversiktskart 1:50 000 med utbyggingsområde avmerket"],
                [vedleggDetaljkart, setVedleggDetaljkart, "Detaljert kart 1:5000 med tekniske inngrep"],
                [vedleggFoto,       setVedleggFoto,       "Foto av berørt vassdragsstrekning"],
              ].map(([verdi, setter, label], i) => (
                <label key={i} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={verdi as boolean}
                    onChange={e => (setter as (v: boolean) => void)(e.target.checked)}
                    className="w-4 h-4 accent-[#0F2A5A] cursor-pointer" />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900">{label as string}</span>
                </label>
              ))}
            </div>

            {/* Kartutsnitt — auto-generert */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Kartutsnitt</span>
                {kartLaster && (
                  <span className="text-xs text-slate-400 animate-pulse">Genererer kart fra Kartverket…</span>
                )}
                {kartBase64 && !kartLaster && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    ✓ Legges ved automatisk
                  </span>
                )}
                {!kartBase64 && !kartLaster && (
                  <span className="text-xs text-slate-400">Ingen rotorer med koordinater — kart ikke generert</span>
                )}
              </div>
              {kartBase64 && (
                <img
                  src={`data:image/png;base64,${kartBase64}`}
                  alt="Kartutsnitt rundt rotorplassering"
                  className="rounded-lg border border-slate-200 w-full max-h-48 object-cover"
                />
              )}
            </div>

            <p className="text-xs text-slate-400 mt-3">
              Kart genereres automatisk fra Statkart / Kartverket basert på rotor-koordinater. Legges ved Word-dokumentet og e-post til NVE.
            </p>
          </div>
        </div>

      {/* Word-nedlasting-hint */}
      <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-800 flex items-start gap-3">
        <span className="text-xl">📄</span>
        <div>
          <p className="font-medium mb-0.5">Last ned eller send offisielt NVE-skjema</p>
          <p className="text-xs text-blue-600">
            «Last ned Word» genererer det identiske NVE-meldeskjemaet forhåndsutfylt.
            «Send til NVE» sender skjemaet som e-postvedlegg direkte til NVE fra appen.
          </p>
        </div>
      </div>

      {/* ── Send til NVE – modal ─────────────────────────────────────── */}
      {visNveModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold text-slate-900 text-lg">Send melding til NVE</h3>
            <p className="text-sm text-slate-600">
              Skjemaet fylles ut, genereres som Word-dokument og sendes som e-postvedlegg
              til NVE. Du vil motta en kopi på <strong>{kontaktEpost}</strong>.
            </p>

            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
                Mottakers e-postadresse (NVE)
              </label>
              <input value={nveEpost} onChange={e => setNveEpost(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20" />
              <p className="text-xs text-slate-400 mt-1">
                Standard: post@nve.no — sjekk NVE.no for korrekt adresse for din region.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              ⚠️ Kontroller at alle felter er korrekt utfylt før du sender. Sendingen loggføres i prosjektets søknadshistorikk.
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setVisNveModal(false)}
                className="btn-secondary text-sm">
                Avbryt
              </button>
              <button onClick={sendTilNve} disabled={senderNve}
                className="btn-primary text-sm bg-green-600 hover:bg-green-700 border-green-700 disabled:opacity-50">
                {senderNve ? "Sender…" : "📧 Send til NVE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Forhåndsvisnings-komponent fjernet — bruker nå Word-nedlasting ───────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _ForhandsvisningDokument_UNUSED(p: {
  tiltakshaverNavn: string; tiltakshaverAdr: string; tiltakshaverPost: string;
  tiltakshaverTlf: string; tiltakshaverEpost: string;
  kontaktNavn: string; kontaktTlf: string; kontaktEpost: string;
  elvNavn: string; kommuneNavn: string; fylkeNavn: string; vassdragsNr: string; dato: string;
  antallRotorer: string; rotorModell: string; gjennomsnittHast: string;
  installertEffektKw: string; arligProdGwh: string; berortStrekning: string; datakilde: string;
  nedborfelt: string; middelvannf: string; lavvannf: string;
  ksvar: KSvar[];
  formålTekst: string; beskrivelseKraftverk: string; naturmangfold: string;
  landskap: string; brukerinteresser: string; kulturminner: string;
  skred: string; offentligePlaner: string; tilleggInfo: string;
  vedleggKart: boolean; vedleggDetaljkart: boolean; vedleggFoto: boolean;
  prosjektNavn: string;
}) {
  const sH = (tekst: string) => (
    <h2 style={{ fontSize: 13, fontWeight: 700, color: "#0F2A5A", borderBottom: "1.5px solid #0F2A5A",
      paddingBottom: 3, marginTop: 22, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
      {tekst}
    </h2>
  );
  const rad = (label: string, verdi: string) => verdi ? (
    <tr>
      <td style={{ width: 220, color: "#64748b", fontSize: 12, paddingBottom: 3, verticalAlign: "top" }}>{label}</td>
      <td style={{ fontSize: 12, fontWeight: 500, color: "#1e293b" }}>{verdi}</td>
    </tr>
  ) : null;

  const harJa = p.ksvar.some(s => s === "ja");

  return (
    <div style={{ fontFamily: "Inter, Helvetica, Arial, sans-serif", color: "#1e293b", maxWidth: 720, margin: "0 auto" }}>
      {/* Tittel */}
      <div style={{ borderBottom: "3px solid #0F2A5A", paddingBottom: 12, marginBottom: 20 }}>
        <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 2 }}>
          Norges vassdrags- og energidirektorat (NVE)
        </p>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", color: "#0F2A5A" }}>
          Melding om å bygge {p.elvNavn || "[kraftverknavn]"}{p.kommuneNavn ? ` i ${p.kommuneNavn}` : ""}
          {p.fylkeNavn ? ` i ${p.fylkeNavn}` : ""}
        </h1>
        <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
          Konsesjonspliktvurdering etter vannressursloven § 18 &nbsp;·&nbsp; Dato: {p.dato}
          {p.vassdragsNr ? ` &nbsp;·&nbsp; Vassdragsnr.: ${p.vassdragsNr}` : ""}
        </p>
      </div>

      {/* Kontrollspørsmål */}
      {sH("Kontrollspørsmål")}
      {harJa && (
        <p style={{ background: "#fffbeb", border: "1px solid #fbbf24", borderRadius: 6,
          padding: "8px 12px", fontSize: 12, color: "#92400e", marginBottom: 8 }}>
          ⚠ Ett eller flere spørsmål er besvart med «Ja» — konsesjonspliktig tiltak er mulig.
        </p>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 4 }}>
        <tbody>
          {KONTROLLSPØRSMÅL.map((spm, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: "4px 0", color: "#334155", flex: 1 }}>{spm}</td>
              <td style={{ width: 60, textAlign: "right", fontWeight: 600,
                color: p.ksvar[i] === "ja" ? "#dc2626" : p.ksvar[i] === "nei" ? "#16a34a" : "#94a3b8" }}>
                {p.ksvar[i] === "ukjent" ? "Ukjent" : p.ksvar[i].toUpperCase()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Tiltakshaver */}
      {sH("Opplysninger om melder / tiltakshaver")}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rad("Tiltakshaver",     p.tiltakshaverNavn)}
          {rad("Adresse",          `${p.tiltakshaverAdr}, ${p.tiltakshaverPost}`)}
          {rad("Telefon",          p.tiltakshaverTlf)}
          {rad("E-postadresse",    p.tiltakshaverEpost)}
          {rad("Kontaktperson",    p.kontaktNavn)}
          {rad("Kontakt telefon",  p.kontaktTlf)}
          {rad("Kontakt e-post",   p.kontaktEpost)}
        </tbody>
      </table>

      {/* Teknisk tabell */}
      {sH("Informasjon om kraftverket — Tekniske hoveddata")}
      <p style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>
        <em>Waterotor er et hydrokinetisk aggregat uten dam, inntakskanal eller vannuttak. Ikke-relevante feltene er utelatt.</em>
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            <th style={{ textAlign: "left", padding: "6px 8px", color: "#64748b", fontWeight: 600, width: 250 }}>Parameter</th>
            <th style={{ textAlign: "left", padding: "6px 8px", color: "#64748b", fontWeight: 600 }}>Verdi</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Type aggregat", "Hydrokinetisk strømaggregat (Waterotor) — ingen dam"],
            p.antallRotorer && ["Antall aggregater", p.antallRotorer + " stk."],
            p.rotorModell   && ["Modell", p.rotorModell],
            p.gjennomsnittHast && ["Gjennomsnittlig vannhastighet", p.gjennomsnittHast + " m/s" + (p.datakilde ? ` (kilde: ${p.datakilde})` : "")],
            p.berortStrekning && ["Berørt vassdragsstrekning", p.berortStrekning],
            p.installertEffektKw && ["Installert effekt", p.installertEffektKw + " kW"],
            p.arligProdGwh && ["Forventet årlig produksjon", p.arligProdGwh + " GWh"],
            p.nedborfelt   && ["Nedbørfelt", p.nedborfelt + " km²"],
            p.middelvannf  && ["Middelvannføring", p.middelvannf + " l/s"],
            p.lavvannf     && ["Alminnelig lavvannføring", p.lavvannf + " l/s"],
            ["Minstevannføring", "Ikke aktuelt — ingen vannuttak"],
            ["Inntaksdam", "Ikke aktuelt — ingen dam"],
            ["Trykkrør", "Ikke aktuelt"],
          ].filter(Boolean).map((r: any, i: number) => (
            <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: "5px 8px", color: "#64748b" }}>{r[0]}</td>
              <td style={{ padding: "5px 8px", fontWeight: 500 }}>{r[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Tekstseksjoner */}
      {[
        ["Formål", p.formålTekst],
        ["Beskrivelse av tiltaket", p.beskrivelseKraftverk],
      ].filter(([, v]) => v).map(([tittel, innhold]) => (
        <div key={tittel}>
          {sH(tittel)}
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "#334155" }}>{innhold}</p>
        </div>
      ))}

      {sH("Beskrivelse av allmenne interesser")}
      {[
        ["Naturens mangfold",                    p.naturmangfold],
        ["Landskap",                              p.landskap],
        ["Brukerinteresser",                      p.brukerinteresser],
        ["Kulturminner",                          p.kulturminner],
        ["Skred",                                 p.skred],
        ["Offentlige planer og nasjonale føringer", p.offentligePlaner],
      ].filter(([, v]) => v).map(([tittel, innhold]) => (
        <div key={tittel} style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#0F2A5A", marginBottom: 3 }}>{tittel}</p>
          <p style={{ fontSize: 12, lineHeight: 1.65, color: "#334155", margin: 0 }}>{innhold}</p>
        </div>
      ))}

      {p.tilleggInfo && (
        <>
          {sH("Tilleggsinformasjon")}
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "#334155" }}>{p.tilleggInfo}</p>
        </>
      )}

      {/* Vedlegg */}
      {sH("Vedlegg")}
      <ul style={{ fontSize: 12, color: "#334155", paddingLeft: 20 }}>
        {[
          [p.vedleggKart,       "Oversiktskart 1:50 000 (utbyggingsområde avmerket)"],
          [p.vedleggDetaljkart, "Detaljert kart 1:5000 (tekniske inngrep)"],
          [p.vedleggFoto,       "Foto av berørt vassdragsstrekning"],
          [true,                "Erklæring om at tiltaket ikke medfører vannuttak (Waterotor-teknologi)"],
        ].map(([inkludert, label], i) => (
          <li key={i} style={{ marginBottom: 3, color: inkludert ? "#1e293b" : "#94a3b8" }}>
            {inkludert ? "☑" : "☐"} {label as string}
          </li>
        ))}
      </ul>

      {/* Underskrift */}
      <div style={{ marginTop: 40, borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
        <table style={{ width: "100%", fontSize: 12, color: "#475569" }}>
          <tbody>
            <tr>
              <td style={{ width: "50%", paddingRight: 20 }}>
                <p style={{ margin: "0 0 24px" }}>Sted og dato: ________________________</p>
                <p style={{ margin: 0 }}>Underskrift tiltakshaver: ________________________</p>
              </td>
              <td>
                <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{p.tiltakshaverNavn}</p>
                <p style={{ margin: "0 0 2px" }}>{p.tiltakshaverAdr}, {p.tiltakshaverPost}</p>
                <p style={{ margin: "0 0 2px" }}>{p.tiltakshaverTlf}</p>
                <p style={{ margin: 0 }}>{p.tiltakshaverEpost}</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* NVE-lenke */}
      <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 20, textAlign: "center" }}>
        Sendes til NVE elektronisk via Altinn, MinID, e-post (nve@nve.no) eller per post.
        Se nve.no for mer informasjon.
      </p>
    </div>
  );
}
