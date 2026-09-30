"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { fmtKw, fmtKwh } from "@/lib/units";
import { createClient } from "@/lib/supabase/client";
import {
  nominalKwFraAreal, beregnEffektKw, beregnEffektKwFlateareal, beregnArligKwh,
  totalKinetiskEffektKw, beregnEkstraherbarEffektKw, CP_WATEROTOR,
  RHO_FERSKVANN, RHO_SJOVANN,
  summerRotorArealM2, sjekkFysiskTak,
} from "@/lib/finans";

/** Beregn bredde og høyde fra ønsket kW, gitt hastighet og ρ.
 *  Hvis én dimensjon allerede er satt låses den; ellers kvadratisk. */
function dimFraKw(
  kwTarget: number, v: number, rho: number,
  fixedHoyde?: number, fixedBredde?: number
): { bredde: number; hoyde: number } {
  const Cp  = CP_WATEROTOR;
  const effV = v > 0 ? v : 1.8;
  const areal = (kwTarget * 1000) / (0.5 * rho * Cp * Math.pow(effV, 3));
  if (fixedHoyde && fixedHoyde > 0) return { bredde: areal / fixedHoyde, hoyde: fixedHoyde };
  if (fixedBredde && fixedBredde > 0) return { bredde: fixedBredde, hoyde: areal / fixedBredde };
  const side = Math.sqrt(Math.max(0, areal));
  return { bredde: side, hoyde: side };
}

const ProsjektKartMap = dynamic(() => import("@/components/ProsjektKartMap"), {
  ssr: false,
  loading: () => <div className="flex-1 bg-slate-100 flex items-center justify-center text-slate-400 text-sm">Laster kart...</div>,
});

function kwFraNavn(modell: string): number {
  const m = modell?.match(/(\d+(?:\.\d+)?)\s*(kW|MW)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === "mw" ? n * 1000 : n;
}

/** Total kabellengde i meter fra waypoints */
function kabelLengdeM(waypoints: { lat: number; lon: number }[]): number {
  let tot = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    tot += haversineKm(waypoints[i].lat, waypoints[i].lon, waypoints[i+1].lat, waypoints[i+1].lon) * 1000;
  }
  return tot;
}

/** Haversine-avstand i km mellom to koordinatpar */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Finn hvilket segment i en kabel-rute som er nærmest et punkt, for å sette inn nytt waypoint */
function closestSegmentIdx(pt: { lat: number; lon: number }, wps: { lat: number; lon: number }[]): number {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < wps.length - 1; i++) {
    const ax = wps[i].lon, ay = wps[i].lat, bx = wps[i+1].lon, by = wps[i+1].lat;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx*dx + dy*dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((pt.lon-ax)*dx + (pt.lat-ay)*dy) / lenSq));
    const px = ax + t*dx - pt.lon, py = ay + t*dy - pt.lat;
    const d = px*px + py*py;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

/** Beregn faktisk kW for en rotor — bruker hastighet_m_s per rotor, fallback til stream */
function rotorKw(r: any, avgVelocity?: number, rho = RHO_SJOVANN): number | null {
  const v = (r.hastighet_m_s && Number(r.hastighet_m_s) > 0)
    ? Number(r.hastighet_m_s)
    : (avgVelocity ?? 0);

  if (v > 0) {
    if (r.nominell_kw_1_8 && r.nominell_kw_1_8 > 0) return r.nominell_kw_1_8 * Math.pow(v / 1.8, 3);
    // Custom dimensjoner FØR modellnavn — hindrer "Waterotor 10 kW" fra å låse kW-verdien
    if (r.lengde_m && r.hoyde_m) return beregnEffektKwFlateareal(v, r.lengde_m * r.hoyde_m, rho);
    const nomKw = kwFraNavn(r.modell);
    if (nomKw > 0) return nomKw * Math.pow(v / 1.8, 3);
    if (r.diameter_m) return beregnEffektKw(v, r.diameter_m, rho);
  }

  // Ingen hastighet — vis nominell ved 1,8 m/s
  if (r.nominell_kw_1_8 && r.nominell_kw_1_8 > 0) return r.nominell_kw_1_8;
  const nomKw = kwFraNavn(r.modell);
  if (nomKw > 0) return nomKw;
  if (r.lengde_m && r.hoyde_m) return nominalKwFraAreal(r.lengde_m * r.hoyde_m, rho);
  return null;
}

export default function KartPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  // Deaktiver scrolling på main mens kart-siden er aktiv
  useEffect(() => {
    const main = document.querySelector("main") as HTMLElement | null;
    if (!main) return;
    const prev = main.style.overflow;
    main.style.overflow = "hidden";
    return () => { main.style.overflow = prev; };
  }, []);
  const [prosjekt,  setProsjekt]  = useState<any>(null);
  const [rotorer,   setRotorer]   = useState<any[]>([]);
  const [stream,    setStream]    = useState<any>(null);

  // Deployment-modus: plasserer en eksisterende rotor, lager ny, eller kopierer
  const [aktivRotorId, setAktivRotorId] = useState<string | "ny" | "kopier" | null>(null);
  const [kopierFra, setKopierFra]       = useState<any | null>(null);
  const [ventKlikk, setVentKlikk]       = useState<{lat:number;lon:number}|null>(null);

  // Skjema for ny rotor (brukes bare om aktivRotorId === "ny")
  const [nyForm, setNyForm] = useState({ modell: "Waterotor", serienummer: "", notater: "", lengde_m: "", hoyde_m: "" });
  const [nyOnsketKw, setNyOnsketKw] = useState(""); // ← omvendt beregning: kW → dimensjoner
  const [lagrer, setLagrer] = useState(false);
  const [redigerRotorId, setRedigerRotorId] = useState<string | null>(null);
  const [redigerForm, setRedigerForm] = useState<any>({});
  const [redigerOnsketKw, setRedigerOnsketKw] = useState(""); // ← omvendt beregning

  // === Unified deploy rotor modal ===
  // Modal åpner umiddelbart — kartklikk setter/oppdaterer posisjonen inne i modalen
  const [deployModalApen, setDeployModalApen] = useState(false);
  const [deployModus, setDeployModus] = useState(false); // kart-klikk-modus (pulserende banner)
  const [deployKlikk, setDeployKlikk] = useState<{ lat: number; lon: number } | null>(null);
  const [deployType, setDeployType] = useState<"standard" | "v-rotor" | "linje">("standard");
  const [deployForm, setDeployForm] = useState({
    hastighet_m_s: "",
    diameter_m: "",  // lagres som lengde_m
    hoyde_m: "",
    serienummer: "",
    notater: "",
    v_vinkel_grader: "90",
    dybde_m: "40",
    retning_grader: "0",
    onsket_kw: "",
    antall: "4",
    avstand_m: "15",
    installasjonsar: String(new Date().getFullYear()),
  });
  const [deployLagrer, setDeployLagrer] = useState(false);
  const [deployFeil, setDeployFeil]   = useState<string | null>(null);
  const [låstAspektDeploy,  setLåstAspektDeploy]  = useState(false);
  const [aspektRatioDeploy, setAspektRatioDeploy] = useState<number | null>(null); // diameter/høyde når låst
  const [låstAspektRediger, setLåstAspektRediger] = useState(false);
  const [aspektRatioRediger, setAspektRatioRediger] = useState<number | null>(null);
  const [panelPos, setPanelPos]       = useState<{ x: number; y: number } | null>(null);
  const panelDragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  function startPanelDrag(e: React.MouseEvent) {
    // Ikke start drag ved klikk på knapper/inputs inni header
    if ((e.target as HTMLElement).closest("button,input")) return;
    e.preventDefault();
    const el = (e.currentTarget as HTMLElement).closest(".deploy-panel") as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    panelDragStart.current = { mx: e.clientX, my: e.clientY, px: rect.left, py: rect.top };

    function onMove(ev: MouseEvent) {
      if (!panelDragStart.current) return;
      setPanelPos({
        x: panelDragStart.current.px + ev.clientX - panelDragStart.current.mx,
        y: panelDragStart.current.py + ev.clientY - panelDragStart.current.my,
      });
    }
    function onUp() {
      panelDragStart.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // Containere og kabler
  const [containere,     setContainere]     = useState<any[]>([]);
  const [kabler,         setKabler]         = useState<any[]>([]);
  const [containerModus, setContainerModus] = useState(false);
  const [kabelModus,     setKabelModus]     = useState(false);
  const [kabelPunkter,   setKabelPunkter]   = useState<{lat:number;lon:number}[]>([]);
  const [nyContainerForm, setNyContainerForm] = useState({ navn: "Container", type: "elektrisk" });
  const [nyKabelForm,    setNyKabelForm]    = useState({ navn: "Kabel", type: "AC", pris_kr_m: 500 });
  const [lagrerKabel,    setLagrerKabel]    = useState(false);
  const [infraFeil,      setInfraFeil]      = useState<string|null>(null);
  const [redigerKabelId,     setRedigerKabelId]     = useState<string | null>(null);
  const [redigerKabelInfoId, setRedigerKabelInfoId] = useState<string | null>(null);
  const [kabelInfoForm,      setKabelInfoForm]      = useState({ navn: "", type: "AC", pris_kr_m: 500 });

  // Solcellefelt
  const [solcelleFelt,   setSolcelleFelt]   = useState<any[]>([]);
  const [solcelleModus,  setSolcelleModus]  = useState(false);
  const [ventSolcelle,   setVentSolcelle]   = useState<{ coords: {lat:number;lon:number}[]; areal_m2: number } | null>(null);

  // V-rotor-plassering
  const [aktivVRotorModus,  setAktivVRotorModus]  = useState(false);
  const [kopierVFra,        setKopierVFra]        = useState<any | null>(null);
  const [ventVKlikk,        setVentVKlikk]        = useState<{lat:number;lon:number}|null>(null);
  const [nyVForm,           setNyVForm]           = useState({ v_vinkel_grader: "90", dybde_m: "40", hoyde_m: "2.44", lengde_m: "6.1", retning_grader: "0", notater: "" });

  // Hydraulikk-parametere (lastes fra projects)
  const [elvBredde,          setElvBredde]          = useState("");
  const [elvDybde,           setElvDybde]           = useState("");
  const [blokkeringPst,      setBlokkeringPst]      = useState("20");
  const [vannType,           setVannType]           = useState("ferskvann");
  const [vannforing,         setVannforing]         = useState("");
  const [lagrerHydraulikk,   setLagrerHydraulikk]   = useState(false);
  const [sokNVEStatus,       setSokNVEStatus]       = useState<string | null>(null);

  // Gradient-måleverktøy
  const [gradientModus,      setGradientModus]      = useState(false);
  const [gradientPunktA,     setGradientPunktA]     = useState<{lat:number; lon:number} | null>(null);
  const [gradientResultat,   setGradientResultat]   = useState<{
    elevA: number; elevB: number; dist_km: number; fall_m: number; stigning_m_km: number;
    latA: number; lonA: number; latB: number; lonB: number;
  } | null>(null);
  const [lasterGradient,     setLasterGradient]     = useState(false);
  const [lagrerV,           setLagrerV]           = useState(false);
  const [redigerVRotorId,   setRedigerVRotorId]   = useState<string|null>(null);
  const [redigerVForm,      setRedigerVForm]      = useState({ v_vinkel_grader: "", dybde_m: "", hoyde_m: "", lengde_m: "", retning_grader: "", notater: "" });
  const [vRotorFeil,        setVRotorFeil]        = useState<string|null>(null);
  const vRotorItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [solcelleNavn,   setSolcelleNavn]   = useState("");
  const [lagrerSolcelle, setLagrerSolcelle] = useState(false);
  const [redigerSolcelleId, setRedigerSolcelleId] = useState<string | null>(null);
  const [redigerSolcelleForm, setRedigerSolcelleForm] = useState({
    navn: "", panel_type: "monokrystallinsk", effektivitet_pst: 21, tilt_grader: 30, azimut_grader: 180, notater: "",
    installasjonsar: String(new Date().getFullYear()),
  });

  const hent = useCallback(async () => {
    const [{ data: p }, { data: r }, { data: s }, { data: cont }, { data: kab }, { data: sol }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", params.id).single(),
      supabase.from("rotors").select("*").eq("project_id", params.id).order("created_at"),
      supabase.from("streams").select("*").eq("project_id", params.id).single(),
      supabase.from("containers").select("*").eq("project_id", params.id).order("created_at"),
      supabase.from("cables").select("*").eq("project_id", params.id).order("created_at"),
      supabase.from("solar_fields").select("*").eq("project_id", params.id).order("created_at"),
    ]);
    setProsjekt(p); setRotorer(r ?? []); setStream(s);
    setContainere(cont ?? []); setKabler(kab ?? []);
    setSolcelleFelt(sol ?? []);
    // Last hydraulikk-parametere fra prosjektet
    if (p) {
      setElvBredde(p.elv_bredde_m != null ? String(p.elv_bredde_m) : "");
      setElvDybde(p.elv_dybde_m   != null ? String(p.elv_dybde_m)  : "");
      setBlokkeringPst(p.blokkering_pst != null ? String(p.blokkering_pst) : "20");
      setVannType(p.vann_type ?? "ferskvann");
      setVannforing(p.vannforing_m3s != null ? String(p.vannforing_m3s) : "");
    }
  }, [params.id]);

  useEffect(() => { hent(); }, [hent]);

  const leggTilModus = deployModus || (aktivRotorId !== null && ventKlikk === null) || containerModus || kabelModus || (aktivVRotorModus && ventVKlikk === null) || gradientModus;

  const startPlasser = (rotorId: string | "ny") => {
    setAktivRotorId(rotorId);
    setVentKlikk(null);
  };

  const avbryt = () => {
    setAktivRotorId(null);
    setKopierFra(null);
    setVentKlikk(null);
    setContainerModus(false);
    setKabelModus(false);
    setKabelPunkter([]);
    setSolcelleModus(false);
    setVentSolcelle(null);
    setSolcelleNavn("");
    setAktivVRotorModus(false);
    setKopierVFra(null);
    setVentVKlikk(null);
    setGradientModus(false);
    setGradientPunktA(null);
    setDeployModalApen(false);
    setDeployModus(false);
    setPanelPos(null);
    setDeployKlikk(null);
    setDeployFeil(null);
  };

  const onSolcelleFerdig = (coords: { lat: number; lon: number }[], areal_m2: number) => {
    setSolcelleModus(false);
    setVentSolcelle({ coords, areal_m2 });
    setSolcelleNavn("Solcellefelt");
  };

  const lagreSolcelle = async () => {
    if (!ventSolcelle) return;
    setLagrerSolcelle(true);
    const { error } = await supabase.from("solar_fields").insert({
      project_id:  params.id,
      navn:        solcelleNavn || "Solcellefelt",
      areal_m2:    ventSolcelle.areal_m2,
      koordinater: ventSolcelle.coords,
    });
    if (error) { setInfraFeil("Kan ikke lagre solcellefelt: " + error.message); setLagrerSolcelle(false); return; }
    setVentSolcelle(null);
    setSolcelleNavn("");
    setLagrerSolcelle(false);
    hent();
  };

  const slettSolcelle = async (id: string) => {
    await supabase.from("solar_fields").delete().eq("id", id);
    hent();
  };

  const oppdaterSolcelle = async (id: string) => {
    const { error } = await supabase.from("solar_fields").update({
      navn:            redigerSolcelleForm.navn,
      panel_type:      redigerSolcelleForm.panel_type,
      effektivitet_pst: Number(redigerSolcelleForm.effektivitet_pst),
      tilt_grader:     Number(redigerSolcelleForm.tilt_grader),
      azimut_grader:   Number(redigerSolcelleForm.azimut_grader),
      notater:         redigerSolcelleForm.notater || null,
      installasjonsar: redigerSolcelleForm.installasjonsar ? parseInt(redigerSolcelleForm.installasjonsar) : null,
    }).eq("id", id);
    if (error) { setInfraFeil("Kunne ikke lagre: " + error.message); return; }
    setRedigerSolcelleId(null);
    hent();
  };

  const startKopier = (r: any) => {
    setKopierFra(r);
    setAktivRotorId("kopier");
    setVentKlikk(null);
  };

  const startKopierV = (r: any) => {
    setKopierVFra(r);
    setAktivVRotorModus(true);
    setVentVKlikk(null);
  };

  const onKartKlikk = async (lat: number, lon: number) => {
    setInfraFeil(null);

    // Deploy rotor: kartklikk setter/oppdaterer posisjon inne i åpen modal
    if (deployModalApen || deployModus) {
      setDeployKlikk({ lat, lon });
      setDeployModus(false); // fjern klikk-banner etter første posisjon er satt
      return;
    }

    // Gradient-mål: to klikk gir fall og helling
    if (gradientModus) {
      if (!gradientPunktA) {
        setGradientPunktA({ lat, lon });
      } else {
        const ptA = gradientPunktA;
        const ptB = { lat, lon };
        setGradientModus(false);
        setGradientPunktA(null);
        setLasterGradient(true);
        try {
          const [resA, resB] = await Promise.all([
            fetch(`/api/elevation?lat=${ptA.lat}&lon=${ptA.lon}`).then(r => r.json()),
            fetch(`/api/elevation?lat=${ptB.lat}&lon=${ptB.lon}`).then(r => r.json()),
          ]);
          const elevA: number = resA.elevation_m ?? 0;
          const elevB: number = resB.elevation_m ?? 0;
          const distKm = haversineKm(ptA.lat, ptA.lon, ptB.lat, ptB.lon);
          const fallM  = elevA - elevB;
          const stigningMKm = distKm > 0 ? fallM / distKm : 0;
          setGradientResultat({
            elevA, elevB,
            dist_km: distKm,
            fall_m:  fallM,
            stigning_m_km: stigningMKm,
            latA: ptA.lat, lonA: ptA.lon,
            latB: ptB.lat, lonB: ptB.lon,
          });
          // Lagre gradient til prosjektet
          if (distKm > 0) {
            await supabase.from("projects").update({
              gradient_m_km: parseFloat(Math.abs(stigningMKm).toFixed(2)),
            }).eq("id", params.id);
            await hent();
          }
        } catch (err) {
          console.error("Gradient-feil:", err);
        } finally {
          setLasterGradient(false);
        }
      }
      return;
    }

    if (containerModus) {
      const { error } = await supabase.from("containers").insert({
        project_id: params.id, navn: nyContainerForm.navn, type: nyContainerForm.type, lat, lon,
      });
      if (error) {
        setInfraFeil("Kan ikke lagre container: " + error.message + ". Sjekk at SQL-migrasjonen er kjørt i Supabase.");
        return;
      }
      setContainerModus(false);
      hent();
      return;
    }
    if (kabelModus) {
      const pt = snappetPunkt(lat, lon);
      setKabelPunkter(pts => [...pts, pt]);
      return;
    }
    if (aktivVRotorModus && !ventVKlikk && kopierVFra) {
      // Direkte kopi — ingen form nødvendig
      const { error } = await supabase.from("rotors").insert({
        project_id:      params.id,
        rotor_type:      "v-rotor",
        modell:          "V-rotor",
        bredde_m:        kopierVFra.bredde_m,
        dybde_m:         kopierVFra.dybde_m,
        hoyde_m:         kopierVFra.hoyde_m          ?? null,
        lengde_m:        kopierVFra.lengde_m          ?? null,
        v_vinkel_grader: kopierVFra.v_vinkel_grader   ?? null,
        retning_grader:  kopierVFra.retning_grader    ?? 0,
        installasjonsar: kopierVFra.installasjonsar    ?? null,
        notater:         kopierVFra.notater            ?? null,
        lat, lon,
      });
      if (!error) { setKopierVFra(null); setAktivVRotorModus(false); await hent(); }
      return;
    }
    if (!aktivRotorId) return;
    setVentKlikk({ lat, lon });
  };

  const lagreKabel = async () => {
    if (kabelPunkter.length < 2) return;
    setLagrerKabel(true);
    setInfraFeil(null);
    const { error } = await supabase.from("cables").insert({
      project_id: params.id, navn: nyKabelForm.navn, type: nyKabelForm.type,
      waypoints: kabelPunkter, pris_kr_m: nyKabelForm.pris_kr_m,
    });
    if (error) {
      setInfraFeil("Kan ikke lagre kabel: " + error.message + ". Sjekk at SQL-migrasjonen er kjørt i Supabase.");
      setLagrerKabel(false);
      return;
    }
    setKabelModus(false);
    setKabelPunkter([]);
    setLagrerKabel(false);
    hent();
  };

  const onContainerFlyttet = async (id: string, lat: number, lon: number) => {
    await supabase.from("containers").update({ lat, lon }).eq("id", id);
    hent();
  };

  const slettContainer = async (id: string) => {
    if (!confirm("Slett denne containeren?")) return;
    await supabase.from("containers").delete().eq("id", id);
    hent();
  };

  const slettKabel = async (id: string) => {
    if (!confirm("Slett denne kabelen?")) return;
    await supabase.from("cables").delete().eq("id", id);
    if (redigerKabelId === id) setRedigerKabelId(null);
    hent();
  };

  const onKabelOppdatert = (id: string, waypoints: { lat: number; lon: number }[]) => {
    // Optimistic local update — hent() ville ha ødelagt drag-handles midt i en drag-sekvens
    setKabler(prev => prev.map(k => k.id === id ? { ...k, waypoints } : k));
    supabase.from("cables").update({ waypoints }).eq("id", id);
  };

  const apneKabelInfo = (k: any) => {
    setKabelInfoForm({ navn: k.navn, type: k.type, pris_kr_m: k.pris_kr_m ?? 500 });
    setRedigerKabelInfoId(k.id);
  };

  const lagreKabelInfo = async (id: string) => {
    await supabase.from("cables").update({
      navn:      kabelInfoForm.navn,
      type:      kabelInfoForm.type,
      pris_kr_m: kabelInfoForm.pris_kr_m,
    }).eq("id", id);
    setRedigerKabelInfoId(null);
    hent();
  };

  const lagreRotor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ventKlikk || !aktivRotorId) return;
    setLagrer(true);

    try {
      if (aktivRotorId === "ny") {
        const { data: ny, error } = await supabase.from("rotors").insert({
          project_id:      params.id,
          modell:          "Waterotor",
          diameter_m:      null,
          nominell_kw_1_8: null,
          lengde_m:        nyForm.lengde_m ? parseFloat(nyForm.lengde_m) : null,
          hoyde_m:         nyForm.hoyde_m  ? parseFloat(nyForm.hoyde_m)  : null,
          serienummer:     nyForm.serienummer || null,
          notater:         nyForm.notater || null,
          lat:             ventKlikk.lat,
          lon:             ventKlikk.lon,
        }).select("id").single();
        if (error) { console.error("Insert feil:", error); return; }
        if (ny?.id) oppdaterElevation(ny.id, ventKlikk.lat, ventKlikk.lon);
      } else if (aktivRotorId === "kopier" && kopierFra) {
        const { data: kopi, error } = await supabase.from("rotors").insert({
          project_id:      params.id,
          modell:          kopierFra.modell,
          rotor_type:      kopierFra.rotor_type       ?? null,
          diameter_m:      kopierFra.diameter_m       ?? null,
          nominell_kw_1_8: kopierFra.nominell_kw_1_8  ?? null,
          lengde_m:        kopierFra.lengde_m          ?? null,
          hoyde_m:         kopierFra.hoyde_m           ?? null,
          bredde_m:        kopierFra.bredde_m          ?? null,
          dybde_m:         kopierFra.dybde_m           ?? null,
          v_vinkel_grader: kopierFra.v_vinkel_grader   ?? null,
          hastighet_m_s:   kopierFra.hastighet_m_s     ?? null,
          retning_grader:  kopierFra.retning_grader    ?? null,
          serienummer:     kopierFra.serienummer        ?? null,
          installasjonsar: kopierFra.installasjonsar    ?? null,
          notater:         kopierFra.notater            ?? null,
          lat: ventKlikk.lat,
          lon: ventKlikk.lon,
        }).select("id").single();
        if (error) {
          console.error("Kopier feil:", error);
          alert("Kunne ikke kopiere rotoren: " + error.message);
          return;
        }
        if (kopi?.id) oppdaterElevation(kopi.id, ventKlikk.lat, ventKlikk.lon);
        setKopierFra(null);
      } else {
        const { error } = await supabase.from("rotors").update({
          lat: ventKlikk.lat,
          lon: ventKlikk.lon,
        }).eq("id", aktivRotorId);
        if (error) { console.error("Update feil:", error); return; }
        oppdaterElevation(aktivRotorId, ventKlikk.lat, ventKlikk.lon);
      }

      setVentKlikk(null);
      setAktivRotorId(null);
      await hent();
    } finally {
      setLagrer(false);
    }
  };

  const fjernFraKart = async (id: string) => {
    await supabase.from("rotors").update({ lat: null, lon: null }).eq("id", id);
    hent();
  };

  const slettRotor = async (id: string) => {
    if (!confirm("Slett denne rotoren permanent?")) return;
    await supabase.from("rotors").delete().eq("id", id);
    hent();
  };

  const lagreVRotor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ventVKlikk) return;
    setLagrerV(true);
    setVRotorFeil(null);
    try {
      const nyDybde  = parseFloat(nyVForm.dybde_m)        || 40;
      const nyVinkel = Math.min(170, Math.max(10, parseFloat(nyVForm.v_vinkel_grader) || 90));
      const nyBredde = 2 * nyDybde * Math.tan((nyVinkel / 2) * Math.PI / 180);
      const { error } = await supabase.from("rotors").insert({
        project_id:     params.id,
        rotor_type:     "v-rotor",
        modell:         "V-rotor",
        bredde_m:       Math.round(nyBredde * 10) / 10,
        dybde_m:        nyDybde,
        hoyde_m:        nyVForm.hoyde_m  ? parseFloat(nyVForm.hoyde_m)  : null,
        lengde_m:       nyVForm.lengde_m ? parseFloat(nyVForm.lengde_m) : null,
        retning_grader: parseFloat(nyVForm.retning_grader) || 0,
        notater:        nyVForm.notater || null,
        lat:            ventVKlikk.lat,
        lon:            ventVKlikk.lon,
      });
      if (error) {
        setVRotorFeil("Kunne ikke lagre: " + error.message + (error.message.includes("column") ? " — kjør SQL-migrasjonen i Supabase først." : ""));
        return;
      }
      setAktivVRotorModus(false);
      setVentVKlikk(null);
      await hent();
    } finally {
      setLagrerV(false);
    }
  };

  /** Beregn destinasjonspunkt fra start, bearing (grader fra nord) og distanse (meter) */
  function destPunkt(lat: number, lon: number, bearingDeg: number, distM: number): { lat: number; lon: number } {
    const R = 6371000;
    const δ = distM / R;
    const θ = bearingDeg * Math.PI / 180;
    const φ1 = lat * Math.PI / 180;
    const λ1 = lon * Math.PI / 180;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
    return { lat: φ2 * 180 / Math.PI, lon: λ2 * 180 / Math.PI };
  }

  const lagreDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deployKlikk) return;
    setDeployLagrer(true);
    setDeployFeil(null);
    try {
      // ── Nærhet-sjekk: 1.5× diameter senter-til-senter (ekskl.sone = 0.75× diam) ──
      const eksklRadiusEksist = (r: any): number => {
        if (r.rotor_type === "v-rotor" || r.modell === "V-rotor") {
          const vb = +(r.bredde_m ?? 20), vd = +(r.dybde_m ?? 40);
          return Math.sqrt((vb / 2) ** 2 + vd ** 2) * 0.75;
        }
        if (r.rotor_type === "liggende") return +(r.hoyde_m ?? 3) * 0.75;
        const a = (r.lengde_m && r.hoyde_m) ? r.lengde_m * r.hoyde_m : null;
        const d = a != null ? 2 * Math.sqrt(a / Math.PI) : (r.diameter_m ?? 3.05);
        return d * 0.75;
      };
      let nyEksklRadius = 0;
      if (deployType === "linje") {
        nyEksklRadius = (parseFloat(deployForm.diameter_m) || 3) * 0.75;
      } else if (deployType === "standard") {
        const dl = parseFloat(deployForm.diameter_m) || 3;
        const dh = parseFloat(deployForm.hoyde_m) || dl;
        nyEksklRadius = 2 * Math.sqrt(dl * dh / Math.PI) * 0.75;
      } else {
        const dybde  = parseFloat(deployForm.dybde_m) || 40;
        const vinkel = Math.min(170, Math.max(10, parseFloat(deployForm.v_vinkel_grader) || 90));
        const bredde = 2 * dybde * Math.tan((vinkel / 2) * Math.PI / 180);
        nyEksklRadius = Math.sqrt((bredde / 2) ** 2 + dybde ** 2) * 0.75;
      }
      for (const r of [...plassert, ...vRotorer]) {
        if (!r.lat || !r.lon) continue;
        const dist = haversineKm(deployKlikk.lat, deployKlikk.lon, +(r.lat), +(r.lon)) * 1000;
        const minDist = nyEksklRadius + eksklRadiusEksist(r);
        if (dist < minDist) {
          setDeployFeil(`For nær eksisterende rotor — ${Math.round(dist)} m, minimum ${Math.round(minDist)} m`);
          return;
        }
      }
      // ────────────────────────────────────────────────────────────────────────────
      if (deployType === "linje") {
        // Én enkelt liggende rotor: diameter = høyde i vannet, hoyde_m-feltet = lengde langs aks
        const diam   = deployForm.diameter_m ? parseFloat(deployForm.diameter_m) : null; // → hoyde_m
        const lengde = deployForm.hoyde_m    ? parseFloat(deployForm.hoyde_m)    : null; // → lengde_m
        const hast   = deployForm.hastighet_m_s ? parseFloat(deployForm.hastighet_m_s) : null;
        const { data: ny, error } = await supabase.from("rotors").insert({
          project_id:    params.id,
          modell:        "Waterotor",
          rotor_type:    "liggende",
          lengde_m:      lengde,
          hoyde_m:       diam,
          hastighet_m_s: hast,
          retning_grader: parseFloat(deployForm.retning_grader) || 0,
          notater:       deployForm.notater || null,
          installasjonsar: deployForm.installasjonsar ? parseInt(deployForm.installasjonsar) : null,
          lat:           deployKlikk.lat,
          lon:           deployKlikk.lon,
        }).select("id").single();
        if (error) { setDeployFeil("Kunne ikke lagre: " + error.message); return; }
        if (ny?.id) oppdaterElevation(ny.id, deployKlikk.lat, deployKlikk.lon);
      } else if (deployType === "standard") {
        const diam = deployForm.diameter_m ? parseFloat(deployForm.diameter_m) : null;
        const hoy  = deployForm.hoyde_m   ? parseFloat(deployForm.hoyde_m)   : null;
        const hast = deployForm.hastighet_m_s ? parseFloat(deployForm.hastighet_m_s) : null;
        const { data: ny, error } = await supabase.from("rotors").insert({
          project_id:      params.id,
          modell:          "Waterotor",
          rotor_type:      "standard",
          lengde_m:        diam,
          hoyde_m:         hoy,
          hastighet_m_s:   hast,
          serienummer:     deployForm.serienummer || null,
          notater:         deployForm.notater || null,
          installasjonsar: deployForm.installasjonsar ? parseInt(deployForm.installasjonsar) : null,
          lat:             deployKlikk.lat,
          lon:             deployKlikk.lon,
        }).select("id").single();
        if (error) { setDeployFeil("Kunne ikke lagre: " + error.message); return; }
        if (ny?.id) oppdaterElevation(ny.id, deployKlikk.lat, deployKlikk.lon);
      } else {
        const dybde  = parseFloat(deployForm.dybde_m) || 40;
        const vinkel = Math.min(170, Math.max(10, parseFloat(deployForm.v_vinkel_grader) || 90));
        const bredde = 2 * dybde * Math.tan((vinkel / 2) * Math.PI / 180);
        const hast   = deployForm.hastighet_m_s ? parseFloat(deployForm.hastighet_m_s) : null;
        const { error } = await supabase.from("rotors").insert({
          project_id:     params.id,
          rotor_type:     "v-rotor",
          modell:         "V-rotor",
          bredde_m:       Math.round(bredde * 10) / 10,
          dybde_m:        dybde,
          hoyde_m:        deployForm.hoyde_m  ? parseFloat(deployForm.hoyde_m)  : null,
          lengde_m:       deployForm.diameter_m ? parseFloat(deployForm.diameter_m) : null, // "Rotor lengde" bruker diameter_m-feltet i deploy-skjema
          retning_grader: parseFloat(deployForm.retning_grader) || 0,
          hastighet_m_s:  hast,
          notater:        deployForm.notater || null,
          installasjonsar: deployForm.installasjonsar ? parseInt(deployForm.installasjonsar) : null,
          lat:            deployKlikk.lat,
          lon:            deployKlikk.lon,
        });
        if (error) { setDeployFeil("Kunne ikke lagre: " + error.message); return; }
      }
      setDeployKlikk(null);
      setDeployModalApen(false);
      setDeployModus(false);
      setDeployForm({ hastighet_m_s: "", diameter_m: "", hoyde_m: "", serienummer: "", notater: "", v_vinkel_grader: "90", dybde_m: "40", retning_grader: "0", onsket_kw: "", antall: "4", avstand_m: "15", installasjonsar: String(new Date().getFullYear()) });
      await hent();
    } finally {
      setDeployLagrer(false);
    }
  };

  const slettVRotor = async (id: string) => {
    if (!confirm("Slett denne V-rotoren permanent?")) return;
    await supabase.from("rotors").delete().eq("id", id);
    hent();
  };

  const startRedigerVRotor = (r: any) => {
    setRedigerVRotorId(r.id);
    const b = +(r.bredde_m ?? 20);
    const d = +(r.dybde_m  ?? 40);
    const vinkel = b > 0 && d > 0
      ? Math.round(2 * Math.atan(b / (2 * d)) * 180 / Math.PI)
      : 90;
    setRedigerVForm({
      v_vinkel_grader: String(vinkel),
      dybde_m:         String(d),
      hoyde_m:         String(r.hoyde_m  ?? "2.44"),
      lengde_m:        String(r.lengde_m ?? "6.1"),
      retning_grader:  String(r.retning_grader ?? 0),
      notater:         r.notater ?? "",
    });
    // Scroll til rotor-kortet i sidepanelet
    setTimeout(() => {
      vRotorItemRefs.current[r.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const onVRotorKlikk = (id: string) => {
    const r = rotorer.find(rot => rot.id === id);
    if (r) startRedigerVRotor(r);
  };

  const onRotorKlikk = (id: string) => {
    const r = rotorer.find((rot: any) => rot.id === id);
    if (!r) return;
    startRedigering(r);
    // Scroll sidebar til rotoren
    setTimeout(() => {
      document.getElementById("rotor-sidebar-" + id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const onVRotorRotert = async (id: string, retning_grader: number) => {
    await supabase.from("rotors").update({ retning_grader }).eq("id", id);
    hent();
  };

  const onLiggendeRotorRotert = async (id: string, retning_grader: number) => {
    await supabase.from("rotors").update({ retning_grader }).eq("id", id);
    hent();
  };

  const lagreRedigeringVRotor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!redigerVRotorId) return;
    const reDybde  = parseFloat(redigerVForm.dybde_m)        || 40;
    const reVinkel = Math.min(170, Math.max(10, parseFloat(redigerVForm.v_vinkel_grader) || 90));
    const reBredde = 2 * reDybde * Math.tan((reVinkel / 2) * Math.PI / 180);
    await supabase.from("rotors").update({
      bredde_m:       Math.round(reBredde * 10) / 10,
      dybde_m:        reDybde,
      hoyde_m:        redigerVForm.hoyde_m  ? parseFloat(redigerVForm.hoyde_m)  : null,
      lengde_m:       redigerVForm.lengde_m ? parseFloat(redigerVForm.lengde_m) : null,
      retning_grader: parseFloat(redigerVForm.retning_grader) || 0,
      notater:        redigerVForm.notater || null,
    }).eq("id", redigerVRotorId);
    setRedigerVRotorId(null);
    hent();
  };

  const onVRotorDimsOppdatert = async (id: string, bredde_m: number, dybde_m: number) => {
    await supabase.from("rotors").update({ bredde_m, dybde_m }).eq("id", id);
    hent();
  };

  const startRedigering = (r: any) => {
    setRedigerRotorId(r.id);
    setRedigerForm({
      modell: r.modell ?? "Waterotor",
      serienummer: r.serienummer ?? "",
      hastighet_m_s: r.hastighet_m_s ? String(r.hastighet_m_s) : "",
      fase: r.fase ? String(r.fase) : "1",
      installasjonsar: r.installasjonsar ? String(r.installasjonsar) : String(new Date().getFullYear()),
      notater: r.notater ?? "",
      lengde_m: r.lengde_m != null ? String(r.lengde_m) : "",
      hoyde_m:  r.hoyde_m  != null ? String(r.hoyde_m)  : "",
    });
  };

  const lagreRedigering = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!redigerRotorId) return;
    const harMal = redigerForm.lengde_m && redigerForm.hoyde_m;
    await supabase.from("rotors").update({
      modell:          redigerForm.modell,
      diameter_m:      null,
      nominell_kw_1_8: harMal ? null : undefined,
      lengde_m:        redigerForm.lengde_m ? parseFloat(redigerForm.lengde_m) : null,
      hoyde_m:         redigerForm.hoyde_m  ? parseFloat(redigerForm.hoyde_m)  : null,
      serienummer:     redigerForm.serienummer || null,
      hastighet_m_s:   redigerForm.hastighet_m_s ? parseFloat(redigerForm.hastighet_m_s) : null,
      fase:            redigerForm.fase ? parseInt(redigerForm.fase) : 1,
      installasjonsar: redigerForm.installasjonsar ? parseInt(redigerForm.installasjonsar) : null,
      notater:         redigerForm.notater || null,
    }).eq("id", redigerRotorId);
    setRedigerRotorId(null);
    hent();
  };

  /** Henter høyde fra OpenTopoData og oppdaterer rotor i bakgrunnen */
  const oppdaterElevation = async (rotorId: string, lat: number, lon: number) => {
    try {
      const res  = await fetch(`/api/elevation?lat=${lat}&lon=${lon}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.elevation_m != null) {
        await supabase.from("rotors").update({ elevation_m: data.elevation_m }).eq("id", rotorId);
      }
    } catch { /* ignorer nettverksfeil — ikke kritisk */ }
  };

  const lagreHydraulikk = async () => {
    setLagrerHydraulikk(true);
    await supabase.from("projects").update({
      elv_bredde_m:   elvBredde   ? parseFloat(elvBredde)   : null,
      elv_dybde_m:    elvDybde    ? parseFloat(elvDybde)    : null,
      blokkering_pst: blokkeringPst ? parseFloat(blokkeringPst) : 20,
      vann_type:      vannType,
      vannforing_m3s: vannforing  ? parseFloat(vannforing)  : null,
    }).eq("id", params.id);
    await hent();
    setLagrerHydraulikk(false);
  };

  const sokNVEVannforing = async () => {
    if (!prosjekt?.lat || !prosjekt?.lon) {
      setSokNVEStatus("Prosjektet mangler koordinater — klikk på kartet for å plassere en rotor først.");
      return;
    }
    setSokNVEStatus("Søker...");
    try {
      const res  = await fetch(`/api/vannforing?lat=${prosjekt.lat}&lon=${prosjekt.lon}`);
      const data = await res.json();
      if (data.error) {
        setSokNVEStatus("⚠ " + data.error + (data.hint ? " — " + data.hint : ""));
      } else if (data.mq_m3s != null) {
        setVannforing(String(data.mq_m3s));
        setSokNVEStatus(`✓ ${data.stasjon_navn}${data.avstand_km > 0 ? ` (${data.avstand_km} km)` : ""}`);
      } else {
        setSokNVEStatus("Ingen vannføringsdata returnert.");
      }
    } catch {
      setSokNVEStatus("Nettverksfeil — prøv igjen.");
    }
  };

  const onRotorFlyttet = async (id: string, lat: number, lon: number) => {
    await supabase.from("rotors").update({ lat, lon }).eq("id", id);
    hent();
    oppdaterElevation(id, lat, lon); // ikke await — kjør i bakgrunn
  };

  const erVRotor = (r: any) => r.rotor_type === "v-rotor" || r.modell === "V-rotor";
  const klar     = rotorer.filter(r => !r.lat && !r.lon && !erVRotor(r));
  const plassert = rotorer.filter(r =>  r.lat &&  r.lon && !erVRotor(r));
  const vRotorer = rotorer.filter(r => erVRotor(r) && r.lat && r.lon);

  // Vanntype → ρ (tetthet)
  const rho = (vannType === "sjovann" || vannType === "sjøvann") ? RHO_SJOVANN : RHO_FERSKVANN;

  const SNAP_GRAD = 0.0003; // ~30m snap-radius (matcher kart-komponenten)
  const snapKandidater = [
    ...plassert.filter(r => r.lat && r.lon).map(r => ({
      lat: +r.lat, lon: +r.lon,
      radius_m: (r.lengde_m && r.hoyde_m ? 2 * Math.sqrt(r.lengde_m * r.hoyde_m / Math.PI) : (r.diameter_m ?? 3)) / 2,
    })),
    ...containere.filter(c => c.lat && c.lon).map(c => ({
      lat: +c.lat, lon: +c.lon, radius_m: 20.0,
    })),
  ];

  function snappetPunkt(lat: number, lon: number) {
    for (const k of snapKandidater) {
      const grad = (k.radius_m) / 111_000;
      if (Math.abs(k.lat - lat) < grad && Math.abs(k.lon - lon) < grad) {
        return { lat: k.lat, lon: k.lon };
      }
    }
    return { lat, lon };
  }

  const totKwStandard = plassert.reduce((s, r) => {
    const kw = rotorKw(r, stream?.avg_velocity_m_s ?? undefined, rho);
    return s + (kw ?? 0);
  }, 0);

  const totKwV = vRotorer.reduce((s: number, r: any) => {
    const vb = +(r.bredde_m ?? 20);
    const vd = +(r.dybde_m  ?? 40);
    const armM = Math.sqrt(Math.pow(vb / 2, 2) + Math.pow(vd, 2));
    const rotorL = r.lengde_m ?? 6.1;
    const rotorH = r.hoyde_m  ?? 2.44;
    const nEnheter = Math.floor(armM / rotorL) * 2;
    const totalRotorAreal = nEnheter * rotorL * rotorH;
    const v_s = stream?.avg_velocity_m_s ?? 0;
    if (v_s <= 0 || totalRotorAreal <= 0) return s;
    return s + beregnEffektKwFlateareal(v_s, totalRotorAreal, rho);
  }, 0);

  const totKw = totKwStandard + totKwV;
  const totMwh = totKw > 0 ? beregnArligKwh(totKw, stream?.stream_type ?? "tidevann") / 1000 : 0;

  // Solcelle-bidrag til oppsummering
  const SOL_PEAK_TIMER = 950; // kWh/kWp/år — standard norsk default
  const solKwp    = solcelleFelt.reduce((s, sf) => s + (Number(sf.areal_m2 ?? 0) * Number(sf.effektivitet_pst ?? 21) / 100), 0);
  const solKwhAr  = solKwp * SOL_PEAK_TIMER;

  // Fysisk-tak-varsel for toppstatistikken — samme sjekk som Hydraulikk-panelet lenger ned,
  // men koblet til hovedtallet ("kW" i sidebaren) slik at den faktisk vises der folk ser først.
  const rotorArealTotalTop = summerRotorArealM2(plassert) + vRotorer.reduce((s: number, r: any) => {
    const vb = +(r.bredde_m ?? 20);
    const vd = +(r.dybde_m  ?? 40);
    return s + Math.sqrt((vb / 2) ** 2 + vd ** 2) * 2;
  }, 0);
  const fysiskTakTop = sjekkFysiskTak(
    totKw, rho,
    parseFloat(elvBredde) || null, parseFloat(elvDybde) || null,
    stream?.avg_velocity_m_s ?? 0,
    rotorArealTotalTop,
    parseFloat(blokkeringPst) || 20
  );

  if (!prosjekt) return <div className="text-slate-400 text-sm p-8">Laster...</div>;

  const aktivRotor = aktivRotorId && aktivRotorId !== "ny"
    ? rotorer.find(r => r.id === aktivRotorId)
    : null;

  return (
    <>
    <div className="-mx-8 -mb-8 flex" style={{ height: "calc(100vh - 200px)", pointerEvents: "none", isolation: "isolate", position: "relative", zIndex: 0 }}>

      {/* ── Sidebar ── */}
      <div className="w-72 flex-shrink-0 flex flex-col overflow-hidden"
        style={{ background: "#0a1f45", borderRight: "1px solid rgba(255,255,255,.1)", pointerEvents: "auto" }}>

        {/* Header */}
        <div className="px-4 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}>
          <div className="text-white font-bold text-sm tracking-widest uppercase mb-1">Prosjektkart</div>
          <div className="text-white/50 text-xs mb-4 truncate">{prosjekt.navn}</div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "På kart", val: plassert.length + vRotorer.length + solcelleFelt.length },
              { label: "Effekt", val: (totKw + solKwp) > 0 ? fmtKw(totKw + solKwp) : "—" },
              { label: "Energi/år", val: (totMwh * 1000 + solKwhAr) > 0 ? fmtKwh(totMwh * 1000 + solKwhAr) : "—" },
              { label: "Boliger", val: (totMwh * 1000 + solKwhAr) > 0 ? `~${Math.round((totMwh * 1000 + solKwhAr) / 14700).toLocaleString("nb-NO")}` : "—" },
            ].map(s => (
              <div key={s.label} className="rounded-lg py-2 text-center" style={{ background: "rgba(255,255,255,.07)" }}>
                <div className="text-white font-bold text-base leading-none">{s.val}</div>
                <div className="text-white/40 text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {fysiskTakTop && (fysiskTakTop.overBetz || fysiskTakTop.overBlokkering) && (
            <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${fysiskTakTop.overBetz ? "text-red-300" : "text-amber-300"}`}
              style={{ background: fysiskTakTop.overBetz ? "rgba(239,68,68,.15)" : "rgba(234,179,8,.15)" }}>
              ⚠ {fysiskTakTop.overBetz ? "Fysisk umulig for elvetverrsnittet" : "Over realistisk uttak for blokkeringsgrensen"}
              {" "}— maks {fmtKw(fysiskTakTop.pEkstraherbarKw)} ved {(stream?.avg_velocity_m_s ?? 0).toFixed(2)} m/s
            </div>
          )}
        </div>

        {/* Aktivt placeringsmodus-banner — kun for rotorer */}
        {aktivRotorId !== null && ventKlikk === null && (
          <div className="px-4 py-3 animate-pulse" style={{ background: "rgba(251,146,60,.2)", borderBottom: "1px solid rgba(251,146,60,.3)" }}>
            <div className="text-orange-300 text-xs font-semibold mb-1">
              {aktivRotorId === "kopier" && kopierFra
                ? `Kopierer: ${kopierFra.modell}`
                : aktivRotor ? `Plasserer: ${aktivRotor.modell}` : "Ny rotor"}
            </div>
            <div className="text-orange-200/70 text-xs">Klikk på kartet for å plassere rotoren</div>
            <button onClick={avbryt} className="mt-2 text-xs text-orange-300/70 hover:text-orange-300 underline">Avbryt</button>
          </div>
        )}

        {/* Deploy rotor — venter på kart-klikk */}
        {deployModus && (
          <div className="px-4 py-3 animate-pulse" style={{ background: "rgba(6,182,212,.2)", borderBottom: "1px solid rgba(6,182,212,.3)" }}>
            <div className="text-cyan-300 text-xs font-semibold mb-1">🌊 Deploy rotor</div>
            <div className="text-cyan-200/70 text-xs">Klikk på kartet for å plassere rotoren</div>
            <button onClick={avbryt} className="mt-2 text-xs text-cyan-300/70 hover:text-cyan-300 underline">Avbryt</button>
          </div>
        )}

        {/* Aktivt V-rotor-plasseringsmodus (kopier) */}
        {aktivVRotorModus && ventVKlikk === null && (
          <div className="px-4 py-3 animate-pulse" style={{ background: "rgba(95,175,215,.2)", borderBottom: "1px solid rgba(95,175,215,.3)" }}>
            <div className="text-cyan-300 text-xs font-semibold mb-1">
              {kopierVFra ? "▽ Kopierer V-rotor" : "▽ V-rotor"}
            </div>
            <div className="text-cyan-200/70 text-xs">
              Klikk på kartet for å plassere{kopierVFra ? " kopien" : " V-rotoren"}
            </div>
            <button onClick={avbryt} className="mt-2 text-xs text-cyan-300/70 hover:text-cyan-300 underline">Avbryt</button>
          </div>
        )}

        {/* Venteform etter klikk pa kart (flytte/kopiere eksisterende rotor) */}
        {ventKlikk && (
          <div className="px-4 py-4" style={{ background: "rgba(95,175,215,.15)", borderBottom: "1px solid rgba(255,255,255,.1)" }}>
            <div className="text-white text-xs font-semibold mb-1">
              {aktivRotorId === "kopier" && kopierFra
                ? `Kopi av: ${kopierFra.modell}`
                : aktivRotor ? `Plasserer: ${aktivRotor.modell}` : "Plasserer rotor"}
            </div>
            <div className="text-cyan-300 font-mono text-xs mb-3">
              {ventKlikk.lat.toFixed(5)}, {ventKlikk.lon.toFixed(5)}
            </div>
            <form onSubmit={lagreRotor} className="flex gap-2">
              <button type="submit" disabled={lagrer}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: "#2E9E5B" }}>
                {lagrer ? "Lagrer..." : "Bekreft plassering"}
              </button>
              <button type="button" onClick={() => setVentKlikk(null)}
                className="px-3 py-2 rounded-lg text-sm text-white/60 border border-white/20">
                ✕
              </button>
            </form>
          </div>
        )}


        {/* Gradient-modus-banner */}
        {gradientModus && (
          <div className="px-4 py-3 animate-pulse" style={{ background: "rgba(234,179,8,.18)", borderBottom: "1px solid rgba(234,179,8,.3)" }}>
            <div className="text-yellow-300 text-xs font-semibold mb-1">
              {gradientPunktA ? "📍 Punkt A satt — klikk for punkt B" : "📍 Klikk for punkt A (øverst i elva)"}
            </div>
            <div className="text-yellow-200/60 text-xs">Henter høydedata fra OpenTopoData (SRTM 90m)</div>
            <button onClick={avbryt} className="mt-1.5 text-xs text-yellow-300/70 hover:text-yellow-300 underline">Avbryt</button>
          </div>
        )}

        {/* Scroll-sone — alt under banners scroller */}
        <div className="flex-1 overflow-y-auto">

        {/* Strom-info */}
        {stream && (
          <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}>
            <div className="text-white/40 text-xs uppercase tracking-wider mb-2">Strom</div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/60">Type</span>
              <span className="text-white font-medium">{stream.stream_type ?? "—"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/60">Gjennomsnitt</span>
              <span className="text-cyan-300 font-mono font-semibold">
                {stream.avg_velocity_m_s ? `${stream.avg_velocity_m_s.toFixed(2)} m/s` : "—"}
              </span>
            </div>
          </div>
        )}

        {/* Hydraulikk-panel */}
        {(() => {
          const vAvg  = stream?.avg_velocity_m_s ?? 0;
          const eB    = parseFloat(elvBredde)   || 0;
          const eD    = parseFloat(elvDybde)    || 0;
          const blk   = parseFloat(blokkeringPst) || 20;
          const elvAreal = eB * eD;

          // Sum av rotorflate (alle plasserte rotorer + V-rotorer)
          const sumRotorAreal = plassert.reduce((s: number, r: any) => {
            if (r.lengde_m && r.hoyde_m) return s + r.lengde_m * r.hoyde_m;
            if (r.diameter_m) return s + Math.PI * (r.diameter_m / 2) ** 2;
            return s;
          }, 0) + vRotorer.reduce((s: number, r: any) => {
            const vb = +(r.bredde_m ?? 20);
            const vd = +(r.dybde_m  ?? 40);
            return s + Math.sqrt((vb / 2) ** 2 + vd ** 2) * 2; // total arm per 1m dybde
          }, 0);

          const pMaks    = elvAreal > 0 && vAvg > 0 ? totalKinetiskEffektKw(rho, elvAreal, vAvg) : null;
          const pEkstrak = elvAreal > 0 && vAvg > 0 ? beregnEkstraherbarEffektKw(rho, CP_WATEROTOR, sumRotorAreal, elvAreal, blk, vAvg) : null;
          const blkAreal = elvAreal > 0 ? (blk / 100) * elvAreal : null;
          const overBlk  = blkAreal != null && sumRotorAreal > blkAreal;

          return (
            <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.1)", background: "rgba(0,0,0,.15)" }}>
              <div className="text-white/40 text-xs uppercase tracking-wider mb-2">Hydraulikk</div>

              {/* Tverrsnitt-inputs */}
              <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                <div>
                  <div className="text-white/30 text-xs mb-0.5">Bredde (m)</div>
                  <input type="number" step="1" min="0" value={elvBredde}
                    onChange={e => setElvBredde(e.target.value)}
                    placeholder="—"
                    className="w-full rounded px-2 py-1 text-xs bg-white/10 text-white border border-white/15 focus:outline-none" />
                </div>
                <div>
                  <div className="text-white/30 text-xs mb-0.5">Dybde (m)</div>
                  <input type="number" step="0.1" min="0" value={elvDybde}
                    onChange={e => setElvDybde(e.target.value)}
                    placeholder="—"
                    className="w-full rounded px-2 py-1 text-xs bg-white/10 text-white border border-white/15 focus:outline-none" />
                </div>
                <div>
                  <div className="text-white/30 text-xs mb-0.5">Blokkering (%)</div>
                  <input type="number" step="1" min="1" max="100" value={blokkeringPst}
                    onChange={e => setBlokkeringPst(e.target.value)}
                    className="w-full rounded px-2 py-1 text-xs bg-white/10 text-white border border-white/15 focus:outline-none" />
                </div>
                <div>
                  <div className="text-white/30 text-xs mb-0.5">Vanntype</div>
                  <select value={vannType} onChange={e => setVannType(e.target.value)}
                    className="w-full rounded px-2 py-1 text-xs bg-white/10 text-white border border-white/15 focus:outline-none">
                    <option value="ferskvann" style={{ color: "#000" }}>Ferskvann (ρ=1000)</option>
                    <option value="sjovann"   style={{ color: "#000" }}>Sjøvann (ρ=1025)</option>
                  </select>
                </div>
              </div>

              {/* Vannføring */}
              <div className="mb-1.5">
                <div className="text-white/30 text-xs mb-0.5">Vannføring (m³/s)</div>
                <div className="flex gap-1">
                  <input type="number" step="0.001" min="0" value={vannforing}
                    onChange={e => setVannforing(e.target.value)}
                    placeholder="—"
                    className="flex-1 rounded px-2 py-1 text-xs bg-white/10 text-white border border-white/15 focus:outline-none" />
                  <button onClick={sokNVEVannforing}
                    className="px-2 py-1 rounded text-xs text-cyan-300/70 border border-cyan-500/30 hover:text-cyan-300 hover:border-cyan-400/50 whitespace-nowrap">
                    NVE
                  </button>
                </div>
                {sokNVEStatus && (
                  <div className={`text-xs mt-0.5 ${sokNVEStatus.startsWith("⚠") ? "text-red-400/80" : sokNVEStatus.startsWith("✓") ? "text-emerald-400/80" : "text-white/40"}`}>
                    {sokNVEStatus}
                  </div>
                )}
              </div>

              {/* Gradient-mål */}
              <div className="mb-1.5">
                <div className="text-white/30 text-xs mb-0.5">Elvefall</div>
                {gradientResultat ? (
                  <div className="rounded px-2 py-1.5 text-xs space-y-0.5" style={{ background: "rgba(234,179,8,.12)", border: "1px solid rgba(234,179,8,.25)" }}>
                    <div className="flex justify-between">
                      <span className="text-white/50">Punkt A</span>
                      <span className="text-white font-mono">{gradientResultat.elevA.toFixed(1)} m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Punkt B</span>
                      <span className="text-white font-mono">{gradientResultat.elevB.toFixed(1)} m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Avstand</span>
                      <span className="text-white font-mono">{gradientResultat.dist_km.toFixed(2)} km</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-yellow-300/80">Fall</span>
                      <span className="text-yellow-300 font-mono font-semibold">
                        {gradientResultat.fall_m.toFixed(1)} m · {Math.abs(gradientResultat.stigning_m_km).toFixed(1)} m/km
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-yellow-300/80">Prosent</span>
                      <span className="text-yellow-300 font-mono font-semibold">
                        {(Math.abs(gradientResultat.fall_m) / (gradientResultat.dist_km * 1000) * 100).toFixed(2)} %
                      </span>
                    </div>
                    {gradientResultat.fall_m < 0 && (
                      <div className="text-orange-300/80 text-xs mt-1">
                        ⚠ Negativt fall — B er høyere enn A. Sett A øverst i elva.
                      </div>
                    )}
                    {gradientResultat.dist_km < 0.5 && (
                      <div className="text-orange-300/80 text-xs mt-1">
                        ⚠ {gradientResultat.dist_km.toFixed(2)} km er for kort — bruk minst 0.5 km for pålitelig data.
                      </div>
                    )}
                    <button onClick={() => setGradientResultat(null)}
                      className="text-white/30 text-xs hover:text-white/60 mt-0.5">
                      Nullstill
                    </button>
                  </div>
                ) : lasterGradient ? (
                  <div className="text-white/40 text-xs">Henter høydedata...</div>
                ) : (
                  <button
                    onClick={() => { avbryt(); setGradientModus(true); }}
                    className="w-full py-1 rounded text-xs text-yellow-300/70 border border-yellow-500/25 hover:text-yellow-300 hover:border-yellow-400/50">
                    📍 Mål elvefall (2 punkt)
                  </button>
                )}
              </div>

              {/* Lagre-knapp */}
              <button onClick={lagreHydraulikk} disabled={lagrerHydraulikk}
                className="w-full py-1 rounded text-xs font-semibold text-white/70 border border-white/20 hover:border-white/40 hover:text-white mb-2">
                {lagrerHydraulikk ? "Lagrer..." : "Lagre hydraulikk"}
              </button>

              {/* Fysikk-cap-panel */}
              {pMaks != null && (
                <div className="rounded px-2 py-1.5 text-xs space-y-0.5" style={{ background: "rgba(255,255,255,.05)" }}>
                  <div className="text-white/30 text-xs uppercase tracking-wider mb-1">Energibudsjett</div>
                  <div className="flex justify-between">
                    <span className="text-white/50">A_elv</span>
                    <span className="text-white font-mono">{elvAreal.toFixed(0)} m²</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">P_maks (fullt tverrsnitt)</span>
                    <span className="text-white font-mono">{fmtKw(pMaks)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Betz-tak (59,3 %)</span>
                    <span className="text-white font-mono">{fmtKw(pMaks * 0.593)}</span>
                  </div>
                  <div className={`flex justify-between ${overBlk ? "text-red-400" : "text-emerald-400"}`}>
                    <span>P_ekstrahert (Cp=0.42)</span>
                    <span className="font-mono font-semibold">{pEkstrak != null ? fmtKw(pEkstrak) : "—"}</span>
                  </div>
                  {overBlk && (
                    <div className="text-red-400/80 text-xs pt-0.5">
                      ⚠ Rotorer overskrider blokkering ({blk}% = {blkAreal?.toFixed(0)} m²)
                    </div>
                  )}
                  {pMaks > 0 && pEkstrak != null && (
                    <div className="flex justify-between text-white/30">
                      <span>Uttak av P_maks</span>
                      <span className="font-mono">{((pEkstrak / pMaks) * 100).toFixed(1)} %</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

          {/* Klar til deployment */}
          <div className="px-4 pt-3 pb-1 flex items-center justify-between sticky top-0 z-10"
            style={{ background: "#0a1f45" }}>
            <span className="text-white/40 text-xs uppercase tracking-wider">
              Klar til deployment ({klar.length})
            </span>
            <a href={`/prosjekter/${params.id}/utstyr`}
              className="text-cyan-400/60 text-xs hover:text-cyan-400">+ Registrer</a>
          </div>

          {klar.length === 0 ? (
            <div className="px-4 pb-3 text-white/25 text-xs">
              Gå til Rotorer-fanen for å registrere rotorer
            </div>
          ) : (
            klar.map(r => {
              const kw = rotorKw(r);
              const areal = r.lengde_m && r.hoyde_m ? r.lengde_m * r.hoyde_m : null;
              const erAktiv = aktivRotorId === r.id && !ventKlikk;
              return (
                <div key={r.id}
                  className={`mx-3 mb-2 rounded-lg px-3 py-2.5 border transition-all cursor-default ${
                    erAktiv
                      ? "border-orange-400/60 bg-orange-500/15"
                      : "border-white/10 hover:border-white/25 bg-white/5"
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-white text-xs font-semibold truncate">{r.modell}</div>
                      {r.serienummer && <div className="text-white/40 text-xs">S/N: {r.serienummer}</div>}
                      {areal != null && (
                        <div className="text-white/40 text-xs">{r.lengde_m}m × {r.hoyde_m}m = {areal.toFixed(1)} m²</div>
                      )}
                      {kw != null && (
                        <div className="text-emerald-400 text-xs font-mono mt-0.5">{fmtKw(kw)} @ 1,8 m/s</div>
                      )}
                    </div>
                    <button
                      onClick={() => erAktiv ? avbryt() : startPlasser(r.id)}
                      className={`flex-shrink-0 px-2 py-1 rounded text-xs font-semibold transition-all ${
                        erAktiv
                          ? "bg-orange-500/30 text-orange-300"
                          : "text-white hover:bg-white/15"
                      }`}
                      style={!erAktiv ? { background: "rgba(95,175,215,.2)" } : {}}>
                      {erAktiv ? "Avbryt" : "Plasser"}
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* Plassert pa kart — vannrotorer */}
          <div className="px-4 pt-3 pb-1 sticky top-0 z-10"
            style={{ background: "#0a1f45", borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <span className="text-white/40 text-xs uppercase tracking-wider">
              Vannrotorer pa kart ({plassert.length})
            </span>
          </div>

          {plassert.length === 0 ? (
            <div className="px-4 pb-3 text-white/25 text-xs">Ingen vannrotorer plassert ennå</div>
          ) : (
            plassert.map((r, i) => {
              const kw = rotorKw(r, stream?.avg_velocity_m_s ?? undefined, rho);
              return (
                <div key={r.id} id={"rotor-sidebar-" + r.id} className="px-4 py-3 border-b border-white/10 hover:bg-white/5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-white text-xs font-semibold">#{i+1} {r.modell}</div>
                      {r.serienummer && <div className="text-white/40 text-xs">S/N: {r.serienummer}</div>}
                      <div className="text-cyan-400/70 font-mono text-xs mt-1">
                        {(+r.lat).toFixed(5)}, {(+r.lon).toFixed(5)}
                      </div>
                      {kw != null && (
                        <div className="text-emerald-400 text-xs font-mono">{fmtKw(kw)}</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 ml-2">
                      <button onClick={() => startPlasser(r.id)}
                        className="text-xs text-cyan-400/60 hover:text-cyan-400 whitespace-nowrap">
                        Flytt
                      </button>
                      <button onClick={() => startKopier(r)}
                        className="text-xs text-emerald-400/60 hover:text-emerald-400 whitespace-nowrap">
                        Kopier
                      </button>
                      <button onClick={() => redigerRotorId === r.id ? setRedigerRotorId(null) : startRedigering(r)}
                        className="text-xs text-amber-400/60 hover:text-amber-400 whitespace-nowrap">
                        Rediger
                      </button>
                      <button onClick={() => fjernFraKart(r.id)}
                        className="text-xs text-white/30 hover:text-white/60 whitespace-nowrap">
                        Fjern
                      </button>
                      <button onClick={() => slettRotor(r.id)}
                        className="text-xs text-red-400/50 hover:text-red-400 whitespace-nowrap">
                        Slett
                      </button>
                    </div>
                  </div>
                  {redigerRotorId === r.id && (
                    <form onSubmit={lagreRedigering} className="mt-3 space-y-2 border-t border-white/10 pt-3">

                      <div className="grid grid-cols-2 gap-2">
                        <input value={redigerForm.hastighet_m_s}
                          onChange={e => setRedigerForm((f: any) => ({ ...f, hastighet_m_s: e.target.value }))}
                          type="number" step="0.001" placeholder="m/s (lokal)"
                          className="w-full rounded px-2 py-1.5 text-xs bg-white/10 text-white placeholder-white/30 border border-white/20 focus:outline-none" />
                        <input value={redigerForm.fase}
                          onChange={e => setRedigerForm((f: any) => ({ ...f, fase: e.target.value }))}
                          type="number" min="1" placeholder="Fase"
                          className="w-full rounded px-2 py-1.5 text-xs bg-white/10 text-white placeholder-white/30 border border-white/20 focus:outline-none" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={redigerForm.installasjonsar}
                          onChange={e => setRedigerForm((f: any) => ({ ...f, installasjonsar: e.target.value }))}
                          type="number" placeholder="Ar"
                          className="w-full rounded px-2 py-1.5 text-xs bg-white/10 text-white placeholder-white/30 border border-white/20 focus:outline-none" />
                        <input value={redigerForm.serienummer}
                          onChange={e => setRedigerForm((f: any) => ({ ...f, serienummer: e.target.value }))}
                          placeholder="S/N"
                          className="w-full rounded px-2 py-1.5 text-xs bg-white/10 text-white placeholder-white/30 border border-white/20 focus:outline-none" />
                      </div>
                      {/* Rotorareal: diameter × høyde */}
                      <div className="text-white/30 text-xs">Mål (overstyrer modell)</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 4, alignItems: "center" }}>
                        <input type="number" step="0.1" min="0"
                          value={redigerForm.lengde_m ?? ""}
                          onChange={e => {
                            const newL = e.target.value;
                            if (låstAspektRediger) {
                              const l = parseFloat(redigerForm.lengde_m);
                              const h = parseFloat(redigerForm.hoyde_m);
                              const nl = parseFloat(newL);
                              if (l > 0 && h > 0 && nl > 0) {
                                setRedigerForm((f: any) => ({ ...f, lengde_m: newL, hoyde_m: (nl * h / l).toFixed(2) }));
                                return;
                              }
                            }
                            setRedigerForm((f: any) => ({ ...f, lengde_m: newL }));
                          }}
                          placeholder="Bredde (m)"
                          className="w-full rounded px-2 py-1.5 text-xs bg-white/10 text-white placeholder-white/30 border border-white/20 focus:outline-none" />
                        <button type="button" onClick={() => setLåstAspektRediger(v => !v)}
                          title={låstAspektRediger ? "Lås opp" : "Lås størrelsesforhold"}
                          className="px-1 py-1 rounded text-xs"
                          style={{ background: låstAspektRediger ? "rgba(99,102,241,.3)" : "rgba(255,255,255,.07)", border: `1px solid ${låstAspektRediger ? "rgba(99,102,241,.5)" : "rgba(255,255,255,.15)"}`, cursor: "pointer" }}>
                          {låstAspektRediger ? "🔒" : "🔓"}
                        </button>
                        <input type="number" step="0.1" min="0"
                          value={redigerForm.hoyde_m ?? ""}
                          onChange={e => {
                            const newH = e.target.value;
                            if (låstAspektRediger) {
                              const l = parseFloat(redigerForm.lengde_m);
                              const h = parseFloat(redigerForm.hoyde_m);
                              const nh = parseFloat(newH);
                              if (l > 0 && h > 0 && nh > 0) {
                                setRedigerForm((f: any) => ({ ...f, hoyde_m: newH, lengde_m: (nh * l / h).toFixed(2) }));
                                return;
                              }
                            }
                            setRedigerForm((f: any) => ({ ...f, hoyde_m: newH }));
                          }}
                          placeholder="Høyde (m)"
                          className="w-full rounded px-2 py-1.5 text-xs bg-white/10 text-white placeholder-white/30 border border-white/20 focus:outline-none" />
                      </div>
                      {redigerForm.lengde_m && redigerForm.hoyde_m && stream?.avg_velocity_m_s && (
                        <div className="text-emerald-400/70 text-xs">
                          {(parseFloat(redigerForm.lengde_m) * parseFloat(redigerForm.hoyde_m)).toFixed(1)} m²
                          {" · "}{fmtKw(beregnEffektKwFlateareal(stream.avg_velocity_m_s, parseFloat(redigerForm.lengde_m) * parseFloat(redigerForm.hoyde_m), rho))}
                        </div>
                      )}
                      {/* Omvendt beregning: ønsket kW → dimensjoner */}
                      <div className="border-t border-white/10 pt-2">
                        <div className="text-white/25 text-xs mb-1">— beregn fra ønsket kW</div>
                        <div className="flex gap-1 items-center">
                          <input
                            type="number" step="1" min="0.1"
                            value={redigerOnsketKw}
                            onChange={e => setRedigerOnsketKw(e.target.value)}
                            placeholder="kW mål"
                            className="flex-1 rounded px-2 py-1.5 text-xs bg-white/10 text-white placeholder-white/25 border border-white/20 focus:outline-none"
                          />
                          <span className="text-white/25 text-xs">kW</span>
                          <button type="button"
                            onClick={() => {
                              const kw = parseFloat(redigerOnsketKw);
                              if (!kw || kw <= 0) return;
                              const v = stream?.avg_velocity_m_s ?? 1.8;
                              const fixedH = parseFloat(redigerForm.hoyde_m) || undefined;
                              const fixedB = parseFloat(redigerForm.lengde_m) || undefined;
                              const { bredde, hoyde } = dimFraKw(kw, v, rho, fixedH, fixedB);
                              setRedigerForm((f: any) => ({
                                ...f,
                                lengde_m: bredde.toFixed(2),
                                hoyde_m:  hoyde.toFixed(2),
                              }));
                            }}
                            className="px-2 py-1.5 rounded text-xs font-semibold text-white"
                            style={{ background: "rgba(46,158,91,.7)" }}>
                            → Beregn
                          </button>
                        </div>
                        {redigerOnsketKw && parseFloat(redigerOnsketKw) > 0 && (() => {
                          const kw = parseFloat(redigerOnsketKw);
                          const v  = stream?.avg_velocity_m_s ?? 1.8;
                          const fixedH = parseFloat(redigerForm.hoyde_m) || undefined;
                          const fixedB = parseFloat(redigerForm.lengde_m) || undefined;
                          const { bredde, hoyde } = dimFraKw(kw, v, rho, fixedH, fixedB);
                          return (
                            <div className="text-white/35 text-xs mt-0.5">
                              {bredde.toFixed(2)} × {hoyde.toFixed(2)} m = {(bredde * hoyde).toFixed(1)} m² @ {v.toFixed(1)} m/s
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex gap-2">
                        <button type="submit"
                          className="flex-1 py-1.5 rounded text-xs font-semibold text-white"
                          style={{ background: "#2E9E5B" }}>Lagre</button>
                        <button type="button" onClick={() => setRedigerRotorId(null)}
                          className="px-3 py-1.5 rounded text-xs text-white/50 border border-white/20">X</button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })
          )}

          {/* V-rotorer pa kart — eget seksjon */}
          <div className="px-4 pt-3 pb-1 sticky top-0 z-10"
            style={{ background: "#0a1f45", borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <span className="text-white/40 text-xs uppercase tracking-wider">
              V-rotorer pa kart ({vRotorer.length})
            </span>
          </div>

          {vRotorer.length === 0 && (
            <div className="px-4 pb-3 text-white/25 text-xs">Ingen V-rotorer plassert ennå</div>
          )}

          {vRotorer.map(r => {
            const erAktiv = redigerVRotorId === r.id;
            const inp = "w-full rounded px-2 py-1.5 text-xs bg-white/10 text-white border border-white/20 focus:outline-none";
            const vb = +(r.bredde_m ?? 20);
            const vd = +(r.dybde_m  ?? 40);
            const vinkelV  = vb > 0 && vd > 0 ? Math.round(2 * Math.atan(vb / (2 * vd)) * 180 / Math.PI) : 90;
            const armM     = Math.sqrt(Math.pow(vb / 2, 2) + Math.pow(vd, 2));
            const totArmM  = armM * 2;               // total V-arm i meter
            const v_s = stream?.avg_velocity_m_s ?? 0;
            // Beregn antall rotorenheter langs begge armene
            const rotorL = r.lengde_m ?? 6.1;   // bredde per enhet (m)
            const rotorH = r.hoyde_m  ?? 2.44;  // høyde per enhet (m)
            const nEnheter = Math.floor(armM / rotorL) * 2;  // begge armer
            const totalRotorAreal = nEnheter * rotorL * rotorH;
            const vkw = v_s > 0 && totalRotorAreal > 0
              ? beregnEffektKwFlateareal(v_s, totalRotorAreal, rho)
              : null;
            return (
              <div key={r.id} ref={el => { vRotorItemRefs.current[r.id] = el; }}
                className="px-4 py-3 border-b border-white/10 hover:bg-white/5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="text-white text-xs font-semibold flex items-center gap-1.5">
                      <span style={{ color: "#5FAFD7" }}>▽</span> V-rotor
                      <span className="text-white/30 font-normal">{vinkelV}° åpning</span>
                    </div>
                    {r.serienummer && <div className="text-white/40 text-xs">S/N: {r.serienummer}</div>}
                    <div className="text-cyan-400/70 font-mono text-xs mt-0.5">
                      Arm: {totArmM.toFixed(0)}m · Dybde: {vd}m · {r.retning_grader ?? 0}°
                    </div>
                    <div className="text-white/30 font-mono text-xs">
                      {nEnheter} enh. × {rotorL}×{rotorH}m = {totalRotorAreal.toFixed(1)} m² total
                    </div>
                    {vkw != null && (
                      <div className="text-emerald-400 text-xs font-mono">{vkw.toFixed(1)} kW @ {v_s.toFixed(1)} m/s</div>
                    )}
                    <div className="text-white/20 font-mono text-xs mt-0.5">
                      {(+r.lat).toFixed(5)}, {(+r.lon).toFixed(5)}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 ml-2">
                    <button onClick={() => erAktiv ? setRedigerVRotorId(null) : startRedigerVRotor(r)}
                      className="text-xs text-amber-400/60 hover:text-amber-400 whitespace-nowrap">
                      {erAktiv ? "Lukk" : "Rediger"}
                    </button>
                    <button onClick={() => startKopierV(r)}
                      className="text-xs text-emerald-400/60 hover:text-emerald-400 whitespace-nowrap">
                      Kopier
                    </button>
                    <button onClick={() => slettVRotor(r.id)}
                      className="text-xs text-red-400/50 hover:text-red-400 whitespace-nowrap">
                      Slett
                    </button>
                  </div>
                </div>
                {erAktiv && (() => {
                      const deg    = parseFloat(redigerVForm.retning_grader) || 0;
                      const rad    = (deg * Math.PI) / 180;
                      const vinkel = Math.min(170, Math.max(10, parseFloat(redigerVForm.v_vinkel_grader) || 90));
                      const cx = 36; const cy = 36; const arm = 28;
                      const half = Math.min(30, arm * Math.tan((vinkel / 2) * Math.PI / 180));
                      // SVG V-form: tip=center, armer i retning deg, bredde styrt av vinkel
                      const lx = cx + (arm * Math.sin(rad) - half * Math.cos(rad));
                      const ly = cy - (arm * Math.cos(rad) + half * Math.sin(rad));
                      const rx = cx + (arm * Math.sin(rad) + half * Math.cos(rad));
                      const ry = cy - (arm * Math.cos(rad) - half * Math.sin(rad));
                      const setDeg = (v: number) => {
                        const norm = ((Math.round(v) % 360) + 360) % 360;
                        setRedigerVForm(f => ({ ...f, retning_grader: String(norm) }));
                      };
                      const setVinkel = (v: number) => {
                        const clamped = Math.max(10, Math.min(170, Math.round(v)));
                        setRedigerVForm(f => ({ ...f, v_vinkel_grader: String(clamped) }));
                      };
                      const KOMPAS = [
                        ["N","0"],["NØ","45"],["Ø","90"],["SØ","135"],
                        ["S","180"],["SV","225"],["V","270"],["NV","315"],
                      ];
                      return (
                        <form onSubmit={lagreRedigeringVRotor} className="mt-3 space-y-2.5 border-t border-white/10 pt-3">
                          {/* V-åpningsvinkel */}
                          <div>
                            <div className="text-white/30 text-xs mb-0.5">V-åpningsvinkel</div>
                            <div className="grid grid-cols-5 gap-0.5 mb-1">
                              {["30","60","90","120","150"].map(v => (
                                <button key={v} type="button"
                                  onClick={() => setRedigerVForm(f => ({ ...f, v_vinkel_grader: v }))}
                                  className={`py-0.5 rounded text-xs font-mono transition-colors ${
                                    Math.abs(vinkel - parseFloat(v)) < 1
                                      ? "bg-cyan-500 text-white"
                                      : "text-white/40 border border-white/15 hover:text-white hover:border-white/30"
                                  }`}>{v}°</button>
                              ))}
                            </div>
                            <div className="flex items-center gap-1">
                              <button type="button"
                                onClick={() => setVinkel(vinkel - 15)}
                                className="px-2 py-1 rounded text-xs text-white/60 border border-white/20 hover:text-white hover:border-white/40">−15°</button>
                              <input type="number" step="1" min="10" max="170"
                                value={redigerVForm.v_vinkel_grader}
                                onChange={e => setRedigerVForm(f => ({ ...f, v_vinkel_grader: e.target.value }))}
                                className={inp + " text-center w-full"} />
                              <span className="text-white/30 text-xs">°</span>
                              <button type="button"
                                onClick={() => setVinkel(vinkel + 15)}
                                className="px-2 py-1 rounded text-xs text-white/60 border border-white/20 hover:text-white hover:border-white/40">+15°</button>
                            </div>
                          </div>

                          {/* Dybde (armlengde) */}
                          <div>
                            <div className="text-white/30 text-xs mb-0.5">Dybde / armlengde (m)</div>
                            <input type="number" step="1" min="1"
                              value={redigerVForm.dybde_m}
                              onChange={e => setRedigerVForm(f => ({ ...f, dybde_m: e.target.value }))}
                              className={inp} />
                          </div>

                          {/* Per-enhet dimensjoner */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <div>
                              <div className="text-white/30 text-xs mb-0.5">Rotor lengde/bredde (m)</div>
                              <input type="number" step="0.01" min="0.1"
                                value={redigerVForm.lengde_m}
                                onChange={e => setRedigerVForm(f => ({ ...f, lengde_m: e.target.value }))}
                                className={inp} />
                            </div>
                            <div>
                              <div className="text-white/30 text-xs mb-0.5">Rotor høyde i vann (m)</div>
                              <input type="number" step="0.01" min="0.1"
                                value={redigerVForm.hoyde_m}
                                onChange={e => setRedigerVForm(f => ({ ...f, hoyde_m: e.target.value }))}
                                className={inp} />
                            </div>
                          </div>
                          {redigerVForm.lengde_m && redigerVForm.hoyde_m && (
                            <div className="text-xs text-cyan-400/70 font-mono">
                              Svept areal per enhet: {(parseFloat(redigerVForm.lengde_m) * parseFloat(redigerVForm.hoyde_m)).toFixed(2)} m²
                            </div>
                          )}

                          {/* Retning — kompass + SVG-preview */}
                          <div>
                            <div className="text-white/30 text-xs mb-1">Retning åpning</div>
                            <div className="flex items-center gap-3">
                              {/* SVG-forhåndsvisning */}
                              <svg width="72" height="72" viewBox="0 0 72 72" style={{ flexShrink: 0 }}>
                                <circle cx="36" cy="36" r="34" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.12)" strokeWidth="1"/>
                                {/* N-markering */}
                                <text x="36" y="9" textAnchor="middle" fill="rgba(255,255,255,.3)" fontSize="8" fontFamily="system-ui">N</text>
                                {/* V-form */}
                                <polyline
                                  points={`${lx},${ly} ${cx},${cy} ${rx},${ry}`}
                                  fill="none" stroke="#5FAFD7" strokeWidth="2.5" strokeLinejoin="round"
                                />
                                <circle cx={cx} cy={cy} r="4" fill="#0F5A8A" stroke="white" strokeWidth="1.5"/>
                              </svg>
                              {/* Grad-input + ±15 */}
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-1">
                                  <button type="button"
                                    onClick={() => setDeg(deg - 15)}
                                    className="px-2 py-1 rounded text-xs text-white/60 border border-white/20 hover:text-white hover:border-white/40">
                                    −15°
                                  </button>
                                  <input type="number" step="1" min="0" max="359"
                                    value={redigerVForm.retning_grader}
                                    onChange={e => setRedigerVForm(f => ({ ...f, retning_grader: e.target.value }))}
                                    className={inp + " text-center w-full"}
                                    style={{ fontVariantNumeric: "tabular-nums" }}
                                  />
                                  <button type="button"
                                    onClick={() => setDeg(deg + 15)}
                                    className="px-2 py-1 rounded text-xs text-white/60 border border-white/20 hover:text-white hover:border-white/40">
                                    +15°
                                  </button>
                                </div>
                                {/* Kompassrose */}
                                <div className="grid grid-cols-4 gap-0.5">
                                  {KOMPAS.map(([label, val]) => (
                                    <button key={label} type="button"
                                      onClick={() => setRedigerVForm(f => ({ ...f, retning_grader: val }))}
                                      className={`py-0.5 rounded text-xs font-mono transition-colors ${
                                        redigerVForm.retning_grader === val
                                          ? "bg-cyan-500 text-white"
                                          : "text-white/40 border border-white/15 hover:text-white hover:border-white/30"
                                      }`}>
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          <textarea
                            value={redigerVForm.notater}
                            onChange={e => setRedigerVForm(f => ({ ...f, notater: e.target.value }))}
                            placeholder="Notater (valgfritt)" rows={2}
                            className={inp + " resize-none"} />
                          <div className="flex gap-2">
                            <button type="submit"
                              className="flex-1 py-1.5 rounded text-xs font-semibold text-white"
                              style={{ background: "#2E9E5B" }}>Lagre</button>
                            <button type="button" onClick={() => setRedigerVRotorId(null)}
                              className="px-3 py-1.5 rounded text-xs text-white/50 border border-white/20">✕</button>
                          </div>
                        </form>
                      );
                    })()}
                </div>
              );
            })}

          {/* Infrastruktur: container + kabel */}
          <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,.1)" }}>
          <div className="text-white/30 text-xs uppercase tracking-wider mb-2">Infrastruktur</div>

          {infraFeil && (
            <div className="mb-2 rounded-lg px-3 py-2 text-xs text-red-300 border border-red-500/30" style={{background:"rgba(239,68,68,.12)"}}>
              ⚠ {infraFeil}
            </div>
          )}

          {/* Skjema vises kun nar ingen modus er aktiv */}
          {!deployModalApen && !deployModus && !deployKlikk && !containerModus && !kabelModus && !solcelleModus && !ventSolcelle && !aktivVRotorModus && !ventVKlikk && (
            <div className="space-y-2">
              {/* Deploy rotor-knapp */}
              <div className="rounded-lg p-2 space-y-1.5" style={{ background: "rgba(6,182,212,.08)", border: "1px solid rgba(6,182,212,.2)" }}>
                <div className="text-cyan-300/70 text-xs font-semibold mb-1">🌊 Rotor</div>
                <button
                  onClick={() => { avbryt(); setDeployModalApen(true); setDeployModus(true); }}
                  className="w-full py-1.5 rounded text-xs font-semibold text-white"
                  style={{ background: "rgba(6,182,212,.4)" }}>
                  + Deploy rotor
                </button>
              </div>

              {/* Container-skjema */}
              <div className="rounded-lg p-2 space-y-1.5" style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.15)" }}>
                <div className="text-amber-300/70 text-xs font-semibold mb-1">📦 Container</div>
                <input value={nyContainerForm.navn}
                  onChange={e => setNyContainerForm(f => ({ ...f, navn: e.target.value }))}
                  placeholder="Navn"
                  className="w-full rounded px-2 py-1.5 text-xs bg-white/10 text-white placeholder-white/30 border border-white/20 focus:outline-none" />
                <div className="flex gap-1.5">
                  <select value={nyContainerForm.type}
                    onChange={e => setNyContainerForm(f => ({ ...f, type: e.target.value }))}
                    className="flex-1 rounded px-2 py-1.5 text-xs bg-white/10 text-white border border-white/20 focus:outline-none">
                    <option value="elektrisk" style={{ color: "#000" }}>📦 Elektrisk</option>
                    <option value="lading" style={{ color: "#000" }}>🔌 Lading</option>
                    <option value="kontroll" style={{ color: "#000" }}>🖥️ Kontroll</option>
                  </select>
                  <button onClick={() => setContainerModus(true)}
                    className="px-3 py-1.5 rounded text-xs font-semibold text-white"
                    style={{ background: "rgba(245,158,11,.4)" }}>
                    + Plasser
                  </button>
                </div>
              </div>

              {/* Kabel-skjema */}
              <div className="rounded-lg p-2 space-y-1.5" style={{ background: "rgba(37,99,235,.08)", border: "1px solid rgba(37,99,235,.15)" }}>
                <div className="text-blue-300/70 text-xs font-semibold mb-1">〰 Kabel</div>
                <input value={nyKabelForm.navn}
                  onChange={e => setNyKabelForm(f => ({ ...f, navn: e.target.value }))}
                  placeholder="Kabelnavn"
                  className="w-full rounded px-2 py-1.5 text-xs bg-white/10 text-white placeholder-white/30 border border-white/20 focus:outline-none" />
                <div className="flex gap-1.5">
                  <select value={nyKabelForm.type}
                    onChange={e => setNyKabelForm(f => ({ ...f, type: e.target.value }))}
                    className="flex-1 rounded px-2 py-1.5 text-xs bg-white/10 text-white border border-white/20 focus:outline-none">
                    <option value="AC" style={{ color: "#000" }}>AC (blå)</option>
                    <option value="DC" style={{ color: "#000" }}>DC (lilla)</option>
                    <option value="lavspent" style={{ color: "#000" }}>Lavspent (grønn)</option>
                  </select>
                </div>
                <div className="flex gap-1.5 items-center">
                  <input value={nyKabelForm.pris_kr_m}
                    onChange={e => setNyKabelForm(f => ({ ...f, pris_kr_m: +e.target.value }))}
                    type="number" min="0" step="50" placeholder="kr/m"
                    className="w-20 rounded px-2 py-1.5 text-xs bg-white/10 text-white placeholder-white/30 border border-white/20 focus:outline-none" />
                  <span className="text-white/30 text-xs">kr/m</span>
                  <button onClick={() => setKabelModus(true)}
                    className="ml-auto px-3 py-1.5 rounded text-xs font-semibold text-white"
                    style={{ background: "rgba(37,99,235,.5)" }}>
                    + Tegn
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Aktiv: container-modus */}
          {containerModus && (
            <div className="rounded-lg p-3" style={{ background: "rgba(245,158,11,.15)", border: "1px solid rgba(245,158,11,.3)" }}>
              <p className="text-amber-300 text-xs font-semibold mb-1">📦 Klikk pa kartet for a plassere container</p>
              <p className="text-amber-200/50 text-xs mb-2">{nyContainerForm.navn} · {nyContainerForm.type}</p>
              <button onClick={() => setContainerModus(false)}
                className="text-xs text-amber-300/60 hover:text-amber-300 underline">Avbryt</button>
            </div>
          )}

          {/* Solcelle-skjema */}
          {!deployModalApen && !containerModus && !kabelModus && !solcelleModus && !ventSolcelle && !aktivVRotorModus && !ventVKlikk && (
            <div className="rounded-lg p-2 space-y-1.5 mt-2" style={{ background: "rgba(217,119,6,.08)", border: "1px solid rgba(217,119,6,.2)" }}>
              <div className="text-amber-300/70 text-xs font-semibold mb-1">☀️ Solcellefelt</div>
              <button
                onClick={() => { avbryt(); setSolcelleModus(true); }}
                className="w-full py-1.5 rounded text-xs font-semibold text-white"
                style={{ background: "rgba(217,119,6,.5)" }}>
                + Tegn polygon
              </button>
            </div>
          )}

          {/* Aktiv: solcelle-modus */}
          {solcelleModus && (
            <div className="rounded-lg p-3 space-y-1.5 mt-2" style={{ background: "rgba(217,119,6,.15)", border: "1px solid rgba(217,119,6,.35)" }}>
              <p className="text-amber-300 text-xs font-semibold">☀️ Tegner solcellefelt</p>
              <p className="text-amber-200/50 text-xs">Klikk på kartet for å tegne polygon. Bruk «Fullfør felt»-knappen nede i midten.</p>
              <button onClick={avbryt} className="text-xs text-amber-300/60 hover:text-amber-300 underline">Avbryt</button>
            </div>
          )}

          {/* Navn-panel etter fullført polygon */}
          {ventSolcelle && (
            <div className="rounded-lg p-3 space-y-2 mt-2" style={{ background: "rgba(217,119,6,.15)", border: "1px solid rgba(217,119,6,.35)" }}>
              <p className="text-amber-300 text-xs font-semibold">☀️ Nytt solcellefelt</p>
              <p className="text-amber-200/60 text-xs">
                Areal: {ventSolcelle.areal_m2 >= 10000
                  ? `${(ventSolcelle.areal_m2 / 10000).toFixed(2)} ha`
                  : `${Math.round(ventSolcelle.areal_m2)} m²`}
              </p>
              <input
                value={solcelleNavn}
                onChange={e => setSolcelleNavn(e.target.value)}
                placeholder="Navn på feltet"
                className="w-full rounded px-2 py-1.5 text-xs bg-white/10 text-white placeholder-white/30 border border-white/20 focus:outline-none"
              />
              <div className="flex gap-1.5">
                <button onClick={lagreSolcelle} disabled={lagrerSolcelle}
                  className="flex-1 py-1.5 rounded text-xs font-semibold text-white"
                  style={{ background: "#D97706" }}>
                  {lagrerSolcelle ? "Lagrer..." : "Lagre felt"}
                </button>
                <button onClick={() => { setVentSolcelle(null); setSolcelleNavn(""); }}
                  className="px-2 py-1.5 rounded text-xs text-white/50 border border-white/20">
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Eksisterende solcellefelt */}
          {solcelleFelt.length > 0 && !solcelleModus && !ventSolcelle && (
            <div className="mt-2 space-y-1">
              <div className="text-white/25 text-xs mb-1">Solcellefelt ({solcelleFelt.length})</div>
              {solcelleFelt.map((f: any) => {
                const arealTekst = f.areal_m2
                  ? f.areal_m2 >= 10000 ? `${(f.areal_m2 / 10000).toFixed(2)} ha` : `${Math.round(f.areal_m2)} m²`
                  : "—";
                const erAktiv = redigerSolcelleId === f.id;
                const inp = "w-full rounded px-2 py-1.5 text-xs bg-white/10 text-white placeholder-white/30 border border-white/20 focus:outline-none";
                return (
                  <div key={f.id} className="rounded px-2 py-2 text-xs" style={{ background: "rgba(255,255,255,.04)", border: erAktiv ? "1px solid rgba(217,119,6,.4)" : "1px solid transparent" }}>
                    {erAktiv ? (
                      <form onSubmit={e => { e.preventDefault(); oppdaterSolcelle(f.id); }} className="space-y-1.5">
                        <input autoFocus value={redigerSolcelleForm.navn}
                          onChange={e => setRedigerSolcelleForm(f => ({ ...f, navn: e.target.value }))}
                          placeholder="Navn" className={inp} />
                        <select value={redigerSolcelleForm.panel_type}
                          onChange={e => setRedigerSolcelleForm(f => ({ ...f, panel_type: e.target.value }))}
                          className={inp}>
                          {["monokrystallinsk","polykrystallinsk","bifacial","tynfilm","PERC","HJT"].map(t =>
                            <option key={t} value={t} style={{ color: "#000" }}>{t}</option>)}
                        </select>
                        <div className="flex gap-1.5">
                          <div className="flex-1">
                            <div className="text-white/30 text-xs mb-0.5">Effektivitet (%)</div>
                            <input type="number" min="5" max="50" step="0.1"
                              value={redigerSolcelleForm.effektivitet_pst}
                              onChange={e => setRedigerSolcelleForm(f => ({ ...f, effektivitet_pst: +e.target.value }))}
                              className={inp} />
                          </div>
                          <div className="flex-1">
                            <div className="text-white/30 text-xs mb-0.5">Helning (°)</div>
                            <input type="number" min="0" max="90" step="1"
                              value={redigerSolcelleForm.tilt_grader}
                              onChange={e => setRedigerSolcelleForm(f => ({ ...f, tilt_grader: +e.target.value }))}
                              className={inp} />
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <div className="flex-1">
                            <div className="text-white/30 text-xs mb-0.5">Azimut (° fra N, 180=S)</div>
                            <input type="number" min="0" max="360" step="1"
                              value={redigerSolcelleForm.azimut_grader}
                              onChange={e => setRedigerSolcelleForm(f => ({ ...f, azimut_grader: +e.target.value }))}
                              className={inp} />
                          </div>
                          <div className="flex-1">
                            <div className="text-white/30 text-xs mb-0.5">Driftsår</div>
                            <input type="number" min="2020" max="2050" step="1"
                              value={redigerSolcelleForm.installasjonsar}
                              onChange={e => setRedigerSolcelleForm(f => ({ ...f, installasjonsar: e.target.value }))}
                              className={inp} />
                          </div>
                        </div>
                        <textarea value={redigerSolcelleForm.notater}
                          onChange={e => setRedigerSolcelleForm(f => ({ ...f, notater: e.target.value }))}
                          placeholder="Notater (valgfritt)" rows={2}
                          className={inp + " resize-none"} />
                        <div className="flex gap-1.5">
                          <button type="submit" className="flex-1 py-1.5 rounded text-xs font-semibold text-white" style={{ background: "#D97706" }}>Lagre</button>
                          <button type="button" onClick={() => setRedigerSolcelleId(null)} className="px-3 py-1.5 rounded text-xs text-white/40 border border-white/20">✕</button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-white/70">☀️ {f.navn ?? "Solcellefelt"}</div>
                          <div className="text-white/30 text-xs mt-0.5">{arealTekst}{f.panel_type ? ` · ${f.panel_type}` : ""}{f.effektivitet_pst ? ` · ${f.effektivitet_pst}%` : ""}{f.installasjonsar ? ` · ${f.installasjonsar}` : ""}</div>
                        </div>
                        <div className="flex gap-2 ml-2 flex-shrink-0">
                          <button onClick={() => {
                            setRedigerSolcelleId(f.id);
                            setRedigerSolcelleForm({
                              navn: f.navn ?? "Solcellefelt",
                              panel_type: f.panel_type ?? "monokrystallinsk",
                              effektivitet_pst: f.effektivitet_pst ?? 21,
                              tilt_grader: f.tilt_grader ?? 30,
                              azimut_grader: f.azimut_grader ?? 180,
                              notater: f.notater ?? "",
                              installasjonsar: f.installasjonsar ? String(f.installasjonsar) : String(new Date().getFullYear()),
                            });
                          }} className="text-white/30 hover:text-white/70">✎</button>
                          <button onClick={() => slettSolcelle(f.id)} className="text-red-400/40 hover:text-red-400">✕</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Aktiv: kabel-modus */}
          {kabelModus && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: "rgba(37,99,235,.15)", border: "1px solid rgba(37,99,235,.3)" }}>
              <p className="text-blue-300 text-xs font-semibold">🔵 Tegner: {nyKabelForm.navn} ({nyKabelForm.type})</p>
              {(() => {
                const lm = kabelPunkter.length >= 2 ? kabelLengdeM(kabelPunkter) : 0;
                const kr = lm > 0 ? lm * nyKabelForm.pris_kr_m : 0;
                return (
                  <div className="flex gap-2 text-xs font-mono">
                    <span className="text-blue-200/60">{kabelPunkter.length} pkt</span>
                    {lm > 0 && <span className="text-cyan-300/80">{lm >= 1000 ? `${(lm/1000).toFixed(2)} km` : `${Math.round(lm)} m`}</span>}
                    {kr > 0 && <span className="text-amber-300/80">{Math.round(kr).toLocaleString("nb-NO")} kr</span>}
                  </div>
                );
              })()}
              <p className="text-blue-200/40 text-xs">Klikk på kartet · snapper til rotorer/containere</p>
              {kabelPunkter.length >= 1 && (
                <button onClick={() => setKabelPunkter(p => p.slice(0, -1))}
                  className="text-xs text-blue-300/60 hover:text-blue-300 underline block">
                  Angre siste punkt
                </button>
              )}
              <div className="flex gap-1.5">
                {kabelPunkter.length >= 2 && (
                  <button onClick={lagreKabel} disabled={lagrerKabel}
                    className="flex-1 py-1.5 rounded text-xs font-semibold text-white"
                    style={{ background: "#2563EB" }}>
                    {lagrerKabel ? "Lagrer..." : "Lagre kabel"}
                  </button>
                )}
                <button onClick={() => { setKabelModus(false); setKabelPunkter([]); }}
                  className="px-2 py-1.5 rounded text-xs text-white/50 border border-white/20">
                  Avbryt
                </button>
              </div>
            </div>
          )}

          {/* Eksisterende containere */}
          {containere.length > 0 && !containerModus && !kabelModus && (
            <div className="mt-3 space-y-1">
              <div className="text-white/25 text-xs mb-1">Containere ({containere.length})</div>
              {containere.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between text-xs text-white/50 px-1">
                  <span>{c.type === "lading" ? "🔌" : c.type === "kontroll" ? "🖥️" : "📦"} {c.navn}</span>
                  <button onClick={() => slettContainer(c.id)} className="text-red-400/40 hover:text-red-400">✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Eksisterende kabler */}
          {kabler.length > 0 && !containerModus && !kabelModus && (
            <div className="mt-2">
              <div className="text-white/25 text-xs mb-1">Kabler ({kabler.length})</div>
              {kabler.map((k: any) => {
                const erRuteAktiv = redigerKabelId === k.id;
                const erInfoAktiv = redigerKabelInfoId === k.id;
                const wps: { lat: number; lon: number }[] = k.waypoints ?? [];
                const lengdeM = wps.length >= 2 ? kabelLengdeM(wps) : 0;
                const kostKr  = lengdeM > 0 && k.pris_kr_m ? lengdeM * k.pris_kr_m : 0;
                const lengdeTekst = lengdeM >= 1000
                  ? `${(lengdeM / 1000).toFixed(2)} km`
                  : lengdeM > 0 ? `${Math.round(lengdeM)} m` : null;
                return (
                  <div key={k.id} className="border-b border-white/10 py-2 hover:bg-white/5 px-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-white text-xs font-semibold truncate">〰 {k.navn}</div>
                        <div className="text-white/40 text-xs">{k.type}{k.pris_kr_m ? ` · ${k.pris_kr_m} kr/m` : ""}</div>
                        {lengdeTekst && (
                          <div className="flex gap-2 text-xs mt-0.5">
                            <span className="text-cyan-300/80 font-mono">{lengdeTekst}</span>
                            {kostKr > 0 && (
                              <span className="text-amber-300/80 font-mono">
                                {kostKr >= 1_000_000
                                  ? `${(kostKr / 1_000_000).toFixed(2)} MNOK`
                                  : `${Math.round(kostKr).toLocaleString("nb-NO")} kr`}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 ml-1 shrink-0">
                        <button
                          onClick={() => erInfoAktiv ? setRedigerKabelInfoId(null) : apneKabelInfo(k)}
                          className="text-xs text-amber-400/60 hover:text-amber-400 whitespace-nowrap">
                          {erInfoAktiv ? "Lukk" : "Rediger"}
                        </button>
                        <button
                          onClick={() => setRedigerKabelId(erRuteAktiv ? null : k.id)}
                          className={`text-xs whitespace-nowrap ${erRuteAktiv ? "text-blue-300" : "text-cyan-400/60 hover:text-cyan-400"}`}>
                          {erRuteAktiv ? "Ferdig" : "Rute"}
                        </button>
                        <button onClick={() => slettKabel(k.id)}
                          className="text-xs text-red-400/50 hover:text-red-400 whitespace-nowrap">
                          Slett
                        </button>
                      </div>
                    </div>

                    {/* Rute-hint */}
                    {erRuteAktiv && (
                      <p className="text-blue-300/60 text-xs mt-1 leading-tight">
                        Dra punkter · høyreklikk = slett · klikk midtpunkt = legg til
                      </p>
                    )}

                    {/* Inline rediger-skjema (samme stil som rotor) */}
                    {erInfoAktiv && (
                      <form
                        onSubmit={e => { e.preventDefault(); lagreKabelInfo(k.id); }}
                        className="mt-3 space-y-2 border-t border-white/10 pt-3"
                      >
                        <input
                          value={kabelInfoForm.navn}
                          onChange={e => setKabelInfoForm(f => ({ ...f, navn: e.target.value }))}
                          placeholder="Kabelnavn"
                          className="w-full rounded px-2 py-1.5 text-xs bg-white/10 text-white placeholder-white/30 border border-white/20 focus:outline-none"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={kabelInfoForm.type}
                            onChange={e => setKabelInfoForm(f => ({ ...f, type: e.target.value }))}
                            className="w-full rounded px-2 py-1.5 text-xs bg-white/10 text-white border border-white/20 focus:outline-none"
                          >
                            <option value="AC" style={{ color: "#000" }}>AC (blå)</option>
                            <option value="DC" style={{ color: "#000" }}>DC (lilla)</option>
                            <option value="lavspent" style={{ color: "#000" }}>Lavspent (grønn)</option>
                          </select>
                          <div className="flex items-center gap-1">
                            <input
                              type="number" step="10" min="0"
                              value={kabelInfoForm.pris_kr_m}
                              onChange={e => setKabelInfoForm(f => ({ ...f, pris_kr_m: +e.target.value }))}
                              placeholder="kr/m"
                              className="w-full rounded px-2 py-1.5 text-xs bg-white/10 text-white placeholder-white/30 border border-white/20 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="submit"
                            className="flex-1 py-1.5 rounded text-xs font-semibold text-white"
                            style={{ background: "#2E9E5B" }}>
                            Lagre
                          </button>
                          <button type="button" onClick={() => setRedigerKabelInfoId(null)}
                            className="px-3 py-1.5 rounded text-xs text-white/50 border border-white/20">
                            X
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tegnforklaring */}
        <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,.1)" }}>
          <div className="text-white/30 text-xs uppercase tracking-wider mb-2">Tegnforklaring</div>
          <div className="flex items-center gap-2 text-xs text-white/40 mb-1">
            <div className="w-4 h-4 rounded-full bg-blue-700 border-2 border-white/60 flex items-center justify-center text-white text-xs">G</div>
            <span>Rotor (klikk = detaljer, dra = flytt)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/40 mb-1">
            <div className="w-4 h-4 rounded-full border-2 border-blue-400 opacity-60" />
            <span>Rotorflate (zoom 14+)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/40 mb-1">
            <div className="w-4 h-4 rounded bg-amber-500 border-2 border-white/60" />
            <span>Container (dra = flytt)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/40 mb-1">
            <div style={{ width: 16, height: 2, background: "#2563EB", borderRadius: 2, marginLeft: 2 }} />
            <span>Kabel (AC=bla, DC=lilla, Lavspent=gronn)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/40 mb-1">
            <div style={{ width: 16, height: 16, background: "rgba(252,211,77,.35)", border: "2px solid #D97706", borderRadius: 3 }} />
            <span>Solcellefelt (klikk = detaljer/slett)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/40">
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#0F5A8A", border: "2px solid rgba(255,255,255,.7)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700 }}>V</div>
            <span>V-rotor (tip = senter, armer = konfigurert retning)</span>
          </div>
        </div>
        </div>{/* end flex-1 scroll */}
      </div>

      {/* Kart */}
      <div className="flex-1 relative" style={{ pointerEvents: "auto" }}>
        <ProsjektKartMap
          lat={prosjekt.lat ? +prosjekt.lat : 20.0}
          lon={prosjekt.lon ? +prosjekt.lon : 0.0}
          harKoordinater={!!(prosjekt.lat && prosjekt.lon)}
          storageKey={`kart_${params.id}`}
          prosjektNavn={prosjekt.navn}
          rotorer={[...plassert, ...vRotorer]}
          containere={containere}
          kabler={kabler}
          kabelUnderArbeid={kabelModus ? kabelPunkter : []}
          snapKandidater={kabelModus ? snapKandidater : []}
          kabelModus={kabelModus}
          redigerKabelId={redigerKabelId}
          stream={stream}
          leggTilModus={leggTilModus}
          solcelleFelt={solcelleFelt.map((f: any) => ({
            id: f.id,
            navn: f.navn,
            areal_m2: f.areal_m2,
            koordinater: f.koordinater ?? [],
          }))}
          solcelleModus={solcelleModus}
          onRotorKlikk={onRotorKlikk}
          onVRotorKlikk={onVRotorKlikk}
          onVRotorRotert={onVRotorRotert}
          onVRotorDimsOppdatert={onVRotorDimsOppdatert}
          onLiggendeRotorRotert={onLiggendeRotorRotert}
          vRotorEdit={redigerVRotorId ? (() => {
            const v = Math.min(170, Math.max(10, parseFloat(redigerVForm.v_vinkel_grader) || 90));
            const d = parseFloat(redigerVForm.dybde_m) || 40;
            return {
              id: redigerVRotorId,
              bredde_m:       2 * d * Math.tan((v / 2) * Math.PI / 180),
              dybde_m:        d,
              retning_grader: parseFloat(redigerVForm.retning_grader) || 0,
            };
          })() : null}
          onKartKlikk={onKartKlikk}
          onRotorFlyttet={onRotorFlyttet}
          onContainerFlyttet={onContainerFlyttet}
          onKabelKlikk={(id, clickLat, clickLon) => {
            // Sett alltid redigeringsmodusen (mousedown på kabel = alltid åpne redigeringen)
            setRedigerKabelId(id);
            // Sett inn nytt waypoint der brukeren klikket, slik at de kan dra det med én gang
            if (clickLat != null && clickLon != null) {
              const kabel = kabler.find(k => k.id === id);
              const wps: { lat: number; lon: number }[] = kabel?.waypoints ?? [];
              if (wps.length >= 2) {
                const segIdx = closestSegmentIdx({ lat: clickLat, lon: clickLon }, wps);
                const nyeWps = [...wps];
                nyeWps.splice(segIdx + 1, 0, { lat: clickLat, lon: clickLon });
                setKabler(prev => prev.map(k => k.id === id ? { ...k, waypoints: nyeWps } : k));
                supabase.from("cables").update({ waypoints: nyeWps }).eq("id", id);
              }
            }
          }}
          onKabelOppdatert={onKabelOppdatert}
          onSolcelleFerdig={onSolcelleFerdig}
          onSolcelleFjern={slettSolcelle}
        />

      </div>
    </div>

    {/* ── Deploy rotor modal — topp-nivå, draggbart, pointer-events:none på backdrop ── */}
    {deployModalApen && (
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}>
        <div className="deploy-panel"
          style={{
            position: "fixed",
            top:  panelPos?.y ?? 80,
            left: panelPos?.x ?? undefined,
            right: panelPos ? undefined : 24,
            background: "#0F2A5A", borderRadius: 14, padding: "22px 24px",
            width: 440, maxHeight: "85vh", overflowY: "auto",
            border: "1px solid rgba(255,255,255,.14)",
            boxShadow: "0 30px 60px rgba(0,0,0,0.6)",
            pointerEvents: "auto",
            userSelect: "none",
          }}
          onClick={e => e.stopPropagation()}>

          {/* Header — drag-håndtak */}
          <div onMouseDown={startPanelDrag}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, cursor: "move" }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
              <span style={{ color: "rgba(255,255,255,.25)", fontSize: 11, marginRight: 6 }}>⠿</span>
              Deploy rotor
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {deployKlikk
                ? <div style={{ color: "rgba(6,182,212,.8)", fontFamily: "monospace", fontSize: 11 }}>
                    {deployKlikk.lat.toFixed(5)}, {deployKlikk.lon.toFixed(5)}
                  </div>
                : <div style={{ color: "rgba(251,146,60,.8)", fontSize: 11, fontStyle: "italic" }}>
                    ← Klikk på kartet for posisjon
                  </div>
              }
              <button type="button" onClick={avbryt}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,.4)", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>
                ✕
              </button>
            </div>
          </div>

          {/* Type-velger */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 16 }}>
            {(["standard", "v-rotor", "linje"] as const).map(t => (
              <button key={t} type="button"
                onClick={() => setDeployType(t)}
                style={{
                  padding: "8px 0", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  background: deployType === t ? "rgba(6,182,212,.5)" : "rgba(255,255,255,.07)",
                  color: deployType === t ? "#fff" : "rgba(255,255,255,.5)",
                  border: deployType === t ? "1px solid rgba(6,182,212,.6)" : "1px solid rgba(255,255,255,.12)",
                }}>
                {t === "standard" ? "🌊 Enkelt" : t === "v-rotor" ? "▽ V-rotor" : "➖ Linje"}
              </button>
            ))}
          </div>

          <form onSubmit={lagreDeploy} style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Lokal hastighet (felles) */}
            <div>
              <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginBottom: 3 }}>Lokal hastighet (m/s)</div>
              <input type="number" step="0.1" min="0" placeholder={stream?.avg_velocity_m_s ? `Prosjekt: ${stream.avg_velocity_m_s} m/s` : "m/s"}
                value={deployForm.hastighet_m_s}
                onChange={e => setDeployForm(f => ({ ...f, hastighet_m_s: e.target.value, onsket_kw: "" }))}
                style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
            </div>

            {deployType === "linje" ? (
              <>
                {/* Retning */}
                <div>
                  <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginBottom: 4 }}>Retning (° fra nord)</div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 6 }}>
                    {[["N","0"],["NØ","45"],["Ø","90"],["SØ","135"],["S","180"],["SV","225"],["V","270"],["NV","315"]].map(([label, val]) => (
                      <button key={val} type="button"
                        onClick={() => setDeployForm(f => ({ ...f, retning_grader: val }))}
                        style={{
                          flex: 1, padding: "4px 0", borderRadius: 5, fontSize: 9, fontWeight: 700, cursor: "pointer",
                          background: Math.abs((parseFloat(deployForm.retning_grader)||0) - parseFloat(val)) < 1 ? "rgba(6,182,212,.6)" : "rgba(255,255,255,.07)",
                          color: Math.abs((parseFloat(deployForm.retning_grader)||0) - parseFloat(val)) < 1 ? "#fff" : "rgba(255,255,255,.35)",
                          border: "1px solid rgba(255,255,255,.1)",
                        }}>{label}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button type="button" onClick={() => setDeployForm(f => ({ ...f, retning_grader: String((((parseFloat(f.retning_grader)||0) - 15) + 360) % 360) }))}
                      style={{ padding: "6px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.5)", border: "1px solid rgba(255,255,255,.1)" }}>−15°</button>
                    <input type="number" step="1" min="0" max="359"
                      value={deployForm.retning_grader}
                      onChange={e => setDeployForm(f => ({ ...f, retning_grader: e.target.value }))}
                      style={{ flex: 1, textAlign: "center", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
                    <button type="button" onClick={() => setDeployForm(f => ({ ...f, retning_grader: String(((parseFloat(f.retning_grader)||0) + 15) % 360) }))}
                      style={{ padding: "6px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.5)", border: "1px solid rgba(255,255,255,.1)" }}>+15°</button>
                  </div>
                </div>

                {/* Rotordimensjoner — liggende rotor: diameter = høyde i vannet, hoyde_m brukes som lengde langs aks */}
                <div style={{ background: "rgba(6,182,212,.06)", border: "1px solid rgba(6,182,212,.2)", borderRadius: 8, padding: "8px 10px", marginBottom: 2 }}>
                  <div style={{ color: "rgba(6,182,212,.7)", fontSize: 10, fontWeight: 600, marginBottom: 6 }}>
                    ↔ Liggende sylinder — diameter = sirkelens tverrmål (= høyde i vannet)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 4, alignItems: "end" }}>
                    <div>
                      <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginBottom: 3 }}>Diameter (m)</div>
                      <input type="number" step="0.1" min="0" placeholder="m"
                        value={deployForm.diameter_m}
                        onChange={e => {
                          const newD = e.target.value;
                          if (låstAspektDeploy && aspektRatioDeploy != null) {
                            const nd = parseFloat(newD);
                            if (nd > 0) {
                              setDeployForm(f => ({ ...f, diameter_m: newD, hoyde_m: (nd / aspektRatioDeploy).toFixed(2), onsket_kw: "" }));
                              return;
                            }
                          }
                          setDeployForm(f => ({ ...f, diameter_m: newD, onsket_kw: "" }));
                        }}
                        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
                    </div>
                    <button type="button" onClick={() => {
                      if (!låstAspektDeploy) {
                        const d = parseFloat(deployForm.diameter_m);
                        const h = parseFloat(deployForm.hoyde_m);
                        if (d > 0 && h > 0) setAspektRatioDeploy(d / h);
                      } else { setAspektRatioDeploy(null); }
                      setLåstAspektDeploy(v => !v);
                    }}
                      title={låstAspektDeploy ? "Lås opp størrelsesforhold" : "Lås størrelsesforhold"}
                      style={{ padding: "8px 6px", background: låstAspektDeploy ? "rgba(99,102,241,.3)" : "rgba(255,255,255,.07)", border: `1px solid ${låstAspektDeploy ? "rgba(99,102,241,.6)" : "rgba(255,255,255,.15)"}`, borderRadius: 8, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>
                      {låstAspektDeploy ? "🔒" : "🔓"}
                    </button>
                    <div>
                      <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginBottom: 3 }}>Lengde langs aks (m)</div>
                      <input type="number" step="0.1" min="0" placeholder="m"
                        value={deployForm.hoyde_m}
                        onChange={e => {
                          const newH = e.target.value;
                          if (låstAspektDeploy && aspektRatioDeploy != null) {
                            const nh = parseFloat(newH);
                            if (nh > 0) {
                              setDeployForm(f => ({ ...f, hoyde_m: newH, diameter_m: (nh * aspektRatioDeploy).toFixed(2), onsket_kw: "" }));
                              return;
                            }
                          }
                          setDeployForm(f => ({ ...f, hoyde_m: newH, onsket_kw: "" }));
                        }}
                        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
                    </div>
                  </div>
                </div>

                {/* Live preview */}
                {(() => {
                  const diam   = parseFloat(deployForm.diameter_m);  // = høyde i vannet
                  const lengde = parseFloat(deployForm.hoyde_m);     // = lengde langs aks
                  const v      = parseFloat(deployForm.hastighet_m_s) || stream?.avg_velocity_m_s || 1.8;
                  if (diam > 0 && lengde > 0) {
                    const areal = diam * lengde;
                    const kw    = beregnEffektKwFlateareal(v, areal, rho);
                    return (
                      <div style={{ color: "rgba(52,211,153,.8)", fontSize: 11, lineHeight: 1.6 }}>
                        <div>Sweepet areal: {diam.toFixed(1)} m × {lengde.toFixed(1)} m = {areal.toFixed(1)} m²</div>
                        <div><strong style={{ color: "rgba(52,211,153,1)" }}>{fmtKw(kw)}</strong> @ {v.toFixed(1)} m/s</div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </>
            ) : deployType === "standard" ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 4, alignItems: "end" }}>
                  <div>
                    <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginBottom: 3 }}>Diameter (m)</div>
                    <input type="number" step="0.1" min="0" placeholder="m"
                      value={deployForm.diameter_m}
                      onChange={e => {
                        const newD = e.target.value;
                        if (låstAspektDeploy) {
                          const d = parseFloat(deployForm.diameter_m);
                          const h = parseFloat(deployForm.hoyde_m);
                          const nd = parseFloat(newD);
                          if (d > 0 && h > 0 && nd > 0) {
                            setDeployForm(f => ({ ...f, diameter_m: newD, hoyde_m: (nd * h / d).toFixed(2), onsket_kw: "" }));
                            return;
                          }
                        }
                        setDeployForm(f => ({ ...f, diameter_m: newD, onsket_kw: "" }));
                      }}
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
                  </div>
                  <button type="button" onClick={() => {
                    if (!låstAspektDeploy) {
                      const d = parseFloat(deployForm.diameter_m);
                      const h = parseFloat(deployForm.hoyde_m);
                      if (d > 0 && h > 0) setAspektRatioDeploy(d / h);
                    } else { setAspektRatioDeploy(null); }
                    setLåstAspektDeploy(v => !v);
                  }}
                    title={låstAspektDeploy ? "Lås opp størrelsesforhold" : "Lås størrelsesforhold"}
                    style={{ padding: "8px 6px", background: låstAspektDeploy ? "rgba(99,102,241,.3)" : "rgba(255,255,255,.07)", border: `1px solid ${låstAspektDeploy ? "rgba(99,102,241,.6)" : "rgba(255,255,255,.15)"}`, borderRadius: 8, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>
                    {låstAspektDeploy ? "🔒" : "🔓"}
                  </button>
                  <div>
                    <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginBottom: 3 }}>Høyde (m)</div>
                    <input type="number" step="0.1" min="0" placeholder="m"
                      value={deployForm.hoyde_m}
                      onChange={e => {
                        const newH = e.target.value;
                        if (låstAspektDeploy) {
                          const d = parseFloat(deployForm.diameter_m);
                          const h = parseFloat(deployForm.hoyde_m);
                          const nh = parseFloat(newH);
                          if (d > 0 && h > 0 && nh > 0) {
                            setDeployForm(f => ({ ...f, hoyde_m: newH, diameter_m: (nh * d / h).toFixed(2), onsket_kw: "" }));
                            return;
                          }
                        }
                        setDeployForm(f => ({ ...f, hoyde_m: newH, onsket_kw: "" }));
                      }}
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
                  </div>
                </div>

                {deployForm.diameter_m && deployForm.hoyde_m && (() => {
                  const d = parseFloat(deployForm.diameter_m);
                  const h = parseFloat(deployForm.hoyde_m);
                  const v = parseFloat(deployForm.hastighet_m_s) || stream?.avg_velocity_m_s || 1.8;
                  if (d > 0 && h > 0) {
                    const kw = beregnEffektKwFlateareal(v, d * h, rho);
                    return <div style={{ color: "rgba(52,211,153,.8)", fontSize: 11 }}>Areal: {(d*h).toFixed(1)} m² · {fmtKw(kw)} @ {v.toFixed(1)} m/s</div>;
                  }
                  return null;
                })()}

                <div style={{ borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 10 }}>
                  <div style={{ color: "rgba(255,255,255,.3)", fontSize: 11, marginBottom: 6 }}>— eller beregn fra ønsket kW</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="number" step="1" min="0.1" placeholder="kW mål"
                      value={deployForm.onsket_kw}
                      onChange={e => setDeployForm(f => ({ ...f, onsket_kw: e.target.value }))}
                      style={{ flex: 1, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
                    <span style={{ color: "rgba(255,255,255,.3)", fontSize: 11 }}>kW</span>
                    <button type="button"
                      onClick={() => {
                        const kw = parseFloat(deployForm.onsket_kw);
                        if (!kw || kw <= 0) return;
                        const v = parseFloat(deployForm.hastighet_m_s) || stream?.avg_velocity_m_s || 1.8;
                        const { bredde, hoyde } = dimFraKw(kw, v, rho, parseFloat(deployForm.hoyde_m) || undefined, parseFloat(deployForm.diameter_m) || undefined);
                        setDeployForm(f => ({ ...f, diameter_m: bredde.toFixed(2), hoyde_m: hoyde.toFixed(2) }));
                      }}
                      style={{ padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "rgba(46,158,91,.7)", color: "#fff", border: "none" }}>
                      → Beregn
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginBottom: 3 }}>Serienummer (valgfritt)</div>
                  <input placeholder="SN-…" value={deployForm.serienummer}
                    onChange={e => setDeployForm(f => ({ ...f, serienummer: e.target.value }))}
                    style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
                </div>
              </>
            ) : (
              <>
                <div>
                  <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginBottom: 4 }}>V-åpningsvinkel</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4, marginBottom: 6 }}>
                    {["30","60","90","120","150"].map(v => (
                      <button key={v} type="button"
                        onClick={() => setDeployForm(f => ({ ...f, v_vinkel_grader: v, onsket_kw: "" }))}
                        style={{ padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                          background: Math.abs((parseFloat(deployForm.v_vinkel_grader)||0) - parseFloat(v)) < 1 ? "rgba(6,182,212,.6)" : "rgba(255,255,255,.07)",
                          color: Math.abs((parseFloat(deployForm.v_vinkel_grader)||0) - parseFloat(v)) < 1 ? "#fff" : "rgba(255,255,255,.4)",
                          border: "1px solid rgba(255,255,255,.1)" }}>{v}°</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button type="button" onClick={() => setDeployForm(f => ({ ...f, v_vinkel_grader: String(Math.max(10, (parseFloat(f.v_vinkel_grader)||90) - 15)) }))}
                      style={{ padding: "6px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.5)", border: "1px solid rgba(255,255,255,.1)" }}>−15°</button>
                    <input type="number" step="1" min="10" max="170" value={deployForm.v_vinkel_grader}
                      onChange={e => setDeployForm(f => ({ ...f, v_vinkel_grader: e.target.value }))}
                      style={{ flex: 1, textAlign: "center", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
                    <button type="button" onClick={() => setDeployForm(f => ({ ...f, v_vinkel_grader: String(Math.min(170, (parseFloat(f.v_vinkel_grader)||90) + 15)) }))}
                      style={{ padding: "6px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.5)", border: "1px solid rgba(255,255,255,.1)" }}>+15°</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginBottom: 3 }}>Dybde / armlengde (m)</div>
                    <input type="number" step="1" min="1" value={deployForm.dybde_m}
                      onChange={e => setDeployForm(f => ({ ...f, dybde_m: e.target.value }))}
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
                  </div>
                  <div>
                    <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginBottom: 3 }}>Retning (°)</div>
                    <input type="number" step="5" min="0" max="359" value={deployForm.retning_grader}
                      onChange={e => setDeployForm(f => ({ ...f, retning_grader: e.target.value }))}
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
                  </div>
                </div>
                {/* Per-enhet dimensjoner */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 4, alignItems: "end", marginTop: 4 }}>
                  <div>
                    <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginBottom: 3 }}>Rotor lengde/bredde (m)</div>
                    <input type="number" step="0.01" min="0.1"
                      value={deployForm.diameter_m}
                      onChange={e => {
                        const newL = e.target.value;
                        if (låstAspektDeploy && aspektRatioDeploy != null) {
                          const nl = parseFloat(newL);
                          if (nl > 0) {
                            setDeployForm(f => ({ ...f, diameter_m: newL, hoyde_m: (nl / aspektRatioDeploy).toFixed(2) }));
                            return;
                          }
                        }
                        setDeployForm(f => ({ ...f, diameter_m: newL }));
                      }}
                      placeholder="6.1"
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
                  </div>
                  <button type="button" onClick={() => {
                    if (!låstAspektDeploy) {
                      const d = parseFloat(deployForm.diameter_m);
                      const h = parseFloat(deployForm.hoyde_m);
                      if (d > 0 && h > 0) setAspektRatioDeploy(d / h);
                    } else { setAspektRatioDeploy(null); }
                    setLåstAspektDeploy(v => !v);
                  }}
                    title={låstAspektDeploy ? "Lås opp størrelsesforhold" : "Lås størrelsesforhold"}
                    style={{ padding: "8px 6px", background: låstAspektDeploy ? "rgba(99,102,241,.3)" : "rgba(255,255,255,.07)", border: `1px solid ${låstAspektDeploy ? "rgba(99,102,241,.6)" : "rgba(255,255,255,.15)"}`, borderRadius: 8, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>
                    {låstAspektDeploy ? "🔒" : "🔓"}
                  </button>
                  <div>
                    <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginBottom: 3 }}>Rotor høyde i vann (m)</div>
                    <input type="number" step="0.01" min="0.1"
                      value={deployForm.hoyde_m}
                      onChange={e => {
                        const newH = e.target.value;
                        if (låstAspektDeploy && aspektRatioDeploy != null) {
                          const nh = parseFloat(newH);
                          if (nh > 0) {
                            setDeployForm(f => ({ ...f, hoyde_m: newH, diameter_m: (nh * aspektRatioDeploy).toFixed(2) }));
                            return;
                          }
                        }
                        setDeployForm(f => ({ ...f, hoyde_m: newH }));
                      }}
                      placeholder="2.44"
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
                  </div>
                </div>
                {(() => {
                  const dybde = parseFloat(deployForm.dybde_m) || 40;
                  const vinkel = Math.min(170, Math.max(10, parseFloat(deployForm.v_vinkel_grader) || 90));
                  const bredde = 2 * dybde * Math.tan((vinkel / 2) * Math.PI / 180);
                  const arm = Math.sqrt(Math.pow(bredde/2, 2) + Math.pow(dybde, 2));
                  const v = parseFloat(deployForm.hastighet_m_s) || stream?.avg_velocity_m_s || 1.8;
                  const enhetL = parseFloat(deployForm.diameter_m) || 6.1;
                  const enhetH = parseFloat(deployForm.hoyde_m) || 2.44;
                  const nEnheter = Math.floor(arm / enhetL) * 2;
                  const totalAreal = nEnheter * enhetL * enhetH;
                  const kw = totalAreal > 0 ? beregnEffektKwFlateareal(v, totalAreal, rho) : 0;
                  return <div style={{ color: "rgba(52,211,153,.8)", fontSize: 11, marginTop: 4 }}>
                    Bredde: {bredde.toFixed(1)} m · Arm: {arm.toFixed(1)} m · {nEnheter} enheter · {totalAreal.toFixed(0)} m² → {fmtKw(kw)} @ {v.toFixed(1)} m/s
                  </div>;
                })()}
              </>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginBottom: 3 }}>Installasjonsår</div>
                <input type="number" min="2020" max="2060" step="1"
                  value={deployForm.installasjonsar}
                  onChange={e => setDeployForm(f => ({ ...f, installasjonsar: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginBottom: 3 }}>Notater (valgfritt)</div>
                <input placeholder="…" value={deployForm.notater}
                  onChange={e => setDeployForm(f => ({ ...f, notater: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13 }} />
              </div>
            </div>

            {deployFeil && (
              <div style={{ background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, padding: "8px 12px", color: "#fca5a5", fontSize: 12 }}>
                ⚠ {deployFeil}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button type="submit" disabled={deployLagrer || !deployKlikk}
                style={{ flex: 1, padding: "10px 0", borderRadius: 9, fontSize: 13, fontWeight: 700,
                  cursor: (deployLagrer || !deployKlikk) ? "not-allowed" : "pointer",
                  background: deployKlikk ? "#2E9E5B" : "rgba(46,158,91,.35)",
                  color: "#fff", border: "none", opacity: (deployLagrer || !deployKlikk) ? 0.6 : 1 }}>
                {deployLagrer ? "Lagrer..."
                  : deployKlikk
                    ? (deployType === "linje"
                        ? `Plasser ${Math.max(1, parseInt(deployForm.antall)||4)} rotorer →`
                        : "Bekreft plassering")
                    : "Klikk kartet for å sette startposisjon"}
              </button>
              <button type="button" onClick={avbryt}
                style={{ padding: "10px 16px", borderRadius: 9, fontSize: 13, cursor: "pointer", background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.6)", border: "1px solid rgba(255,255,255,.15)" }}>
                Avbryt
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
  </>
  );
}
