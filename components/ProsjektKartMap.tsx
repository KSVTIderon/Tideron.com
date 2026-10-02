"use client";
import { useEffect, useRef, useState } from "react";

const ROTOR_FARGE = "#1B4F8A";

interface SolcelleFelt {
  id: string;
  navn: string | null;
  areal_m2: number | null;
  koordinater: { lat: number; lon: number }[];
}

interface RotorPunkt {
  id: string; modell: string; diameter_m?: number | null;
  lengde_m?: number | null; hoyde_m?: number | null;
  nominell_kw_1_8?: number | null;
  lat?: number | null; lon?: number | null;
  serienummer?: string | null;
  rotor_type?: string | null;      // 'standard' | 'v-rotor'
  bredde_m?: number | null;        // V-rotor: bredde ved åpning
  dybde_m?: number | null;         // V-rotor: armlengde
  retning_grader?: number | null;  // V-rotor: hvilken retning V åpner (0=N, 90=Ø)
}
interface ContainerPunkt {
  id: string; navn: string; type: string;
  lat: number; lon: number;
}
interface KabelLinje {
  id: string; navn: string; type: string;
  waypoints: { lat: number; lon: number }[];
}

const SNAP_GRAD = 0.0003; // ~30m snap-radius

interface VRotorEdit {
  id: string;
  bredde_m: number;
  dybde_m: number;
  retning_grader: number;
}

interface Props {
  lat: number; lon: number;
  prosjektNavn: string;
  rotorer: RotorPunkt[];
  containere?: ContainerPunkt[];
  kabler?: KabelLinje[];
  kabelUnderArbeid?: { lat: number; lon: number }[];
  snapKandidater?: { lat: number; lon: number; radius_m?: number }[];
  kabelModus?: boolean;
  redigerKabelId?: string | null;
  stream: any;
  leggTilModus: boolean;
  harKoordinater?: boolean;
  storageKey?: string;
  solcelleFelt?: SolcelleFelt[];
  solcelleModus?: boolean;
  vRotorEdit?: VRotorEdit | null;
  onKartKlikk?: (lat: number, lon: number) => void;
  onRotorFlyttet?: (id: string, lat: number, lon: number) => void;
  onContainerFlyttet?: (id: string, lat: number, lon: number) => void;
  onKabelKlikk?: (id: string, lat?: number, lon?: number) => void;
  onKabelOppdatert?: (id: string, waypoints: { lat: number; lon: number }[]) => void;
  onSolcelleFerdig?: (coords: { lat: number; lon: number }[], areal_m2: number) => void;
  onSolcelleFjern?: (id: string) => void;
  onRotorKlikk?: (id: string) => void;
  onVRotorKlikk?: (id: string) => void;
  onVRotorRotert?: (id: string, retning_grader: number) => void;
  onVRotorDimsOppdatert?: (id: string, bredde_m: number, dybde_m: number) => void;
  onLiggendeRotorRotert?: (id: string, retning_grader: number) => void;
  height?: string;
}

type Kartlag = "standard" | "sjokart" | "dybde" | "satellitt" | "havstrom";

function getSavedView(key: string) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; }
}
function saveView(key: string, lat: number, lon: number, zoom: number) {
  try { localStorage.setItem(key, JSON.stringify({ lat, lon, zoom })); } catch {}
}

function applyKartlag(
  L: any, map: any, kartlag: Kartlag,
  tileRef: React.MutableRefObject<any>,
  overlaysRef: React.MutableRefObject<any[]>
) {
  if (tileRef.current) { tileRef.current.remove(); tileRef.current = null; }
  overlaysRef.current.forEach(o => o.remove());
  overlaysRef.current = [];

  const addO = (layer: any) => { layer.addTo(map); overlaysRef.current.push(layer); };

  if (kartlag === "standard") {
    tileRef.current = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "&copy; OpenStreetMap contributors", maxZoom: 20 }
    ).addTo(map);
    // Globale sjømerker (OpenSeaMap) over hele verden
    addO(L.tileLayer(
      "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
      { attribution: "OpenSeaMap", maxZoom: 18, opacity: 0.7 }
    ));

  } else if (kartlag === "sjokart") {
    // Lys base
    tileRef.current = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "&copy; OpenStreetMap contributors", maxZoom: 20 }
    ).addTo(map);
    // GEBCO 2023 — global batymetri (dekker hele verden)
    addO(L.tileLayer.wms("https://www.gebco.net/data_and_products/gebco_web_services/web_map_service/mapserv", {
      layers: "GEBCO_LATEST", format: "image/png",
      transparent: true, version: "1.3.0",
      attribution: "GEBCO", opacity: 0.5,
    }));
    // EMODnet dybdekonturer — global dekning (Europa + Atlanteren + Stillehav)
    addO(L.tileLayer.wms("https://ows.emodnet-bathymetry.eu/wms", {
      layers: "emodnet:contours", format: "image/png",
      transparent: true, version: "1.1.1",
      attribution: "EMODnet Bathymetry", opacity: 0.8,
    }));
    // Kartverket — detaljerte norske dybdedata (kun Norge, kommer på topp)
    addO(L.tileLayer.wms("https://wms.geonorge.no/skwms1/wms.dybdedata2", {
      layers: "Dybdekontur,Dybdepunkt",
      format: "image/png", transparent: true, version: "1.3.0",
      attribution: "© Kartverket", opacity: 1.0,
    }));
    // Globale sjømerker
    addO(L.tileLayer(
      "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
      { attribution: "OpenSeaMap", maxZoom: 18, opacity: 0.8 }
    ));

  } else if (kartlag === "dybde") {
    tileRef.current = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "&copy; OpenStreetMap contributors", maxZoom: 20 }
    ).addTo(map);
    // GEBCO fargekodet global batymetri
    addO(L.tileLayer.wms("https://www.gebco.net/data_and_products/gebco_web_services/web_map_service/mapserv", {
      layers: "GEBCO_LATEST_2", format: "image/png",
      transparent: true, version: "1.3.0",
      attribution: "GEBCO", opacity: 0.65,
    }));
    // EMODnet fargekodet dybde — ekstra detalj for Europa
    addO(L.tileLayer.wms("https://ows.emodnet-bathymetry.eu/wms", {
      layers: "emodnet:mean_depth", format: "image/png",
      transparent: true, version: "1.1.1",
      attribution: "EMODnet Bathymetry", opacity: 0.55,
    }));
    // Kartverket sjodybde — høyeste detaljnivå for Norge
    addO(L.tileLayer.wms("https://openwms.statkart.no/skwms1/wms.sjo_dybde", {
      layers: "sjo_dybde0,sjo_dybde1,sjo_dybde2",
      format: "image/png", transparent: true, version: "1.3.0",
      attribution: "Kartverket", opacity: 1.0,
    }));

  } else if (kartlag === "havstrom") {
    // Satellitt som base
    tileRef.current = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Esri, Maxar, Earthstar Geographics", maxZoom: 19 }
    ).addTo(map);
    // CMEMS havstrøm-overlay (proxied via vår API)
    addO(L.tileLayer(
      "/planner/api/havstrom-tile?z={z}&x={x}&y={y}",
      { opacity: 0.65, maxZoom: 14, tileSize: 256, attribution: "© CMEMS" }
    ));
  } else {
    // Satellitt — Esri World Imagery (global)
    tileRef.current = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Esri, Maxar, Earthstar Geographics", maxZoom: 19 }
    ).addTo(map);
    addO(L.tileLayer(
      "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
      { attribution: "OpenSeaMap", maxZoom: 18, opacity: 0.9 }
    ));
  }
}

function geodesicArea(coords: { lat: number; lon: number }[]): number {
  if (coords.length < 3) return 0;
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const lat0 = toRad(coords.reduce((s, c) => s + c.lat, 0) / coords.length);
  const mPerLat = R * Math.PI / 180;
  const mPerLon = R * Math.cos(lat0) * Math.PI / 180;
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    area += (coords[i].lon * mPerLon) * (coords[j].lat * mPerLat)
          - (coords[j].lon * mPerLon) * (coords[i].lat * mPerLat);
  }
  return Math.abs(area / 2);
}

export default function ProsjektKartMap({
  lat, lon, prosjektNavn, rotorer, containere = [], kabler = [], kabelUnderArbeid = [],
  snapKandidater = [], kabelModus = false, redigerKabelId = null,
  stream, leggTilModus, harKoordinater, storageKey = "kart_default",
  solcelleFelt = [], solcelleModus = false, vRotorEdit = null,
  onKartKlikk, onRotorFlyttet, onContainerFlyttet, onKabelKlikk, onKabelOppdatert,
  onSolcelleFerdig, onSolcelleFjern, onRotorKlikk, onVRotorKlikk, onVRotorRotert, onVRotorDimsOppdatert,
  onLiggendeRotorRotert,
  height = "100%",
}: Props) {
  const mapRef            = useRef<HTMLDivElement>(null);
  const leafletInst       = useRef<any>(null);
  const LRef              = useRef<any>(null);
  const tileRef           = useRef<any>(null);
  const overlaysRef       = useRef<any[]>([]);
  const markerMap         = useRef<Record<string, { marker: any; sirkel: any; sirkelEks: any; zoomHandler?: any; rotHandle?: any }>>({});
  const vRotorMap         = useRef<Record<string, { marker: any; polyline: any; armLeft?: any; armRight?: any; sirkelEks?: any; zoomHandler?: any }>>({});
  const containerMap      = useRef<Record<string, any>>({});
  const kabelMap          = useRef<Record<string, any>>({});
  const kabelArbeidRef      = useRef<any>(null);
  const snapCirclesRef      = useRef<any[]>([]);
  const previewPktRef       = useRef<any>(null);
  const editHandlesRef      = useRef<any[]>([]);
  const editMidHandlesRef   = useRef<any[]>([]);
  const editPolylineRef     = useRef<any>(null);
  const editWaypointsRef    = useRef<{ lat: number; lon: number }[]>([]);
  const klikkRef            = useRef(onKartKlikk);
  const modusRef            = useRef(leggTilModus);
  const rotorFlyttetRef     = useRef(onRotorFlyttet);
  const containerFlyttetRef = useRef(onContainerFlyttet);
  const kabelKlikkRef       = useRef(onKabelKlikk);
  const kabelOppdatertRef   = useRef(onKabelOppdatert);
  const solcelleModusRef    = useRef(solcelleModus);
  const solcelleFerdigRef   = useRef(onSolcelleFerdig);
  const solcelleFjernRef    = useRef(onSolcelleFjern);
  const solcellePunktRef    = useRef<{ lat: number; lon: number }[]>([]);
  const solcellePreviewRef  = useRef<{ polyline: any; markers: any[]; polygon: any } | null>(null);
  const solcelleLayersRef   = useRef<Record<string, { polygon: any; label: any }>>({});
  const [solcelleVertices, setSolcelleVertices] = useState<{ lat: number; lon: number }[]>([]);
  const [kartlag, setKartlag] = useState<Kartlag>("standard");
  const [mapReady, setMapReady] = useState(false);

  // Oppdater refs SYNKRONT under render — unngår useEffect-forsinkelse som gir stale closure i Leaflet-handlers
  klikkRef.current            = onKartKlikk;
  modusRef.current            = leggTilModus;
  rotorFlyttetRef.current     = onRotorFlyttet;
  containerFlyttetRef.current = onContainerFlyttet;
  kabelKlikkRef.current       = onKabelKlikk;
  kabelOppdatertRef.current   = onKabelOppdatert;
  solcelleModusRef.current    = solcelleModus;
  solcelleFerdigRef.current   = onSolcelleFerdig;
  solcelleFjernRef.current    = onSolcelleFjern;
  const rotorKlikkRef         = useRef(onRotorKlikk);
  const vRotorKlikkRef        = useRef(onVRotorKlikk);
  const vRotorRotertRef       = useRef(onVRotorRotert);
  const vRotorDimsRef         = useRef(onVRotorDimsOppdatert);
  const liggendeRotertRef     = useRef(onLiggendeRotorRotert);
  // Synkron oppdatering for V-rotor callbacks også
  rotorKlikkRef.current       = onRotorKlikk;
  vRotorKlikkRef.current      = onVRotorKlikk;
  vRotorRotertRef.current     = onVRotorRotert;
  vRotorDimsRef.current       = onVRotorDimsOppdatert;
  liggendeRotertRef.current   = onLiggendeRotorRotert;

  // Live-oppdater V-rotor polyline (og arm-markører) mens bruker justerer i sidepanelet
  useEffect(() => {
    if (!vRotorEdit) return;
    const entry = vRotorMap.current[vRotorEdit.id];
    if (!entry) return;
    const { marker, polyline, armLeft, armRight } = entry;
    const ll      = marker.getLatLng();
    const alpha   = (vRotorEdit.retning_grader * Math.PI) / 180;
    const mPerLat = 111000;
    const mPerLon = 111000 * Math.cos(ll.lat * Math.PI / 180);
    function offset(lE: number, lN: number): [number, number] {
      const rN = lN * Math.cos(alpha) - lE * Math.sin(alpha);
      const rE = lN * Math.sin(alpha) + lE * Math.cos(alpha);
      return [ll.lat + rN / mPerLat, ll.lng + rE / mPerLon];
    }
    const b = vRotorEdit.bredde_m > 0 ? vRotorEdit.bredde_m : 1;
    const d = vRotorEdit.dybde_m  > 0 ? vRotorEdit.dybde_m  : 1;
    const newLeft  = offset(-b / 2, d);
    const newRight = offset( b / 2, d);
    polyline.setLatLngs([newLeft, [ll.lat, ll.lng], newRight]);
    armLeft?.setLatLng(newLeft);
    armRight?.setLatLng(newRight);
  }, [vRotorEdit]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.style.cursor = (leggTilModus || solcelleModus) ? "crosshair" : "";
  }, [leggTilModus, solcelleModus]);

  // ── Lagrede solcellefelt (display) ──
  useEffect(() => {
    if (!mapReady || !leafletInst.current || !LRef.current) return;
    const map = leafletInst.current;
    const L   = LRef.current;

    // Fjern gamle lag
    for (const id of Object.keys(solcelleLayersRef.current)) {
      solcelleLayersRef.current[id].polygon.remove();
      solcelleLayersRef.current[id].label.remove();
    }
    solcelleLayersRef.current = {};

    solcelleFelt.forEach(felt => {
      if (!felt.koordinater || felt.koordinater.length < 3) return;
      const latlngs = felt.koordinater.map(c => [c.lat, c.lon]);

      const polygon = (L as any).polygon(latlngs, {
        color: "#D97706", fillColor: "#FCD34D", fillOpacity: 0.25,
        weight: 2, dashArray: undefined,
      }).addTo(map);

      const center = felt.koordinater.reduce(
        (s, c) => ({ lat: s.lat + c.lat / felt.koordinater.length, lon: s.lon + c.lon / felt.koordinater.length }),
        { lat: 0, lon: 0 }
      );

      const arealTekst = felt.areal_m2
        ? felt.areal_m2 >= 10000
          ? `${(felt.areal_m2 / 10000).toFixed(2)} ha`
          : `${Math.round(felt.areal_m2)} m²`
        : "";

      const label = (L as any).marker([center.lat, center.lon], {
        icon: (L as any).divIcon({
          html: `<div style="background:rgba(217,119,6,.9);color:#fff;font-size:10px;font-weight:700;padding:3px 7px;border-radius:5px;white-space:nowrap;box-shadow:0 1px 5px rgba(0,0,0,.3)">☀️ ${felt.navn ?? "Solcellefelt"}${arealTekst ? " · " + arealTekst : ""}</div>`,
          className: "", iconAnchor: [0, 10],
        }),
        interactive: false,
      }).addTo(map);

      polygon.bindPopup(
        `<div style="font-family:system-ui;min-width:160px">
          <div style="font-weight:700;color:#92400E;font-size:13px;margin-bottom:4px">☀️ ${felt.navn ?? "Solcellefelt"}</div>
          ${arealTekst ? `<div style="color:#64748b;font-size:12px">Areal: ${arealTekst}</div>` : ""}
          <div style="margin-top:8px">
            <button onclick="window._slettSolcelle('${felt.id}')" style="background:#ef4444;color:#fff;border:none;padding:4px 10px;border-radius:5px;font-size:11px;cursor:pointer;font-weight:600">Slett felt</button>
          </div>
        </div>`
      );

      (window as any)._slettSolcelle = (id: string) => {
        if (confirm("Slett dette solcellefeltet?")) solcelleFjernRef.current?.(id);
      };

      solcelleLayersRef.current[felt.id] = { polygon, label };
    });
  }, [solcelleFelt, mapReady]); // eslint-disable-line

  // ── Polygon-tegning (live preview) ──
  useEffect(() => {
    if (!mapReady || !leafletInst.current || !LRef.current) return;
    const map = leafletInst.current;
    const L   = LRef.current;

    if (!solcelleModus) {
      // Rydd opp preview
      if (solcellePreviewRef.current) {
        solcellePreviewRef.current.polyline.remove();
        solcellePreviewRef.current.markers.forEach(m => m.remove());
        if (solcellePreviewRef.current.polygon) solcellePreviewRef.current.polygon.remove();
        solcellePreviewRef.current = null;
      }
      solcellePunktRef.current = [];
      setSolcelleVertices([]);
      return;
    }

    // Bygg preview fra gjeldende vertices
    const pts = solcellePunktRef.current;

    if (solcellePreviewRef.current) {
      solcellePreviewRef.current.polyline.remove();
      solcellePreviewRef.current.markers.forEach(m => m.remove());
      if (solcellePreviewRef.current.polygon) solcellePreviewRef.current.polygon.remove();
    }

    const markers: any[] = pts.map((p, i) => {
      return (L as any).circleMarker([p.lat, p.lon], {
        radius: i === 0 ? 8 : 5,
        color: "#D97706", fillColor: "#FCD34D", fillOpacity: 1, weight: 2,
      }).addTo(map);
    });

    const polyline = (L as any).polyline(
      pts.length >= 2 ? [...pts, pts[0]].map(p => [p.lat, p.lon]) : pts.map(p => [p.lat, p.lon]),
      { color: "#D97706", weight: 2, dashArray: pts.length >= 3 ? undefined : "6 4" }
    ).addTo(map);

    const polygon = pts.length >= 3
      ? (L as any).polygon(pts.map(p => [p.lat, p.lon]), {
          color: "#D97706", fillColor: "#FCD34D", fillOpacity: 0.2, weight: 0,
        }).addTo(map)
      : null;

    solcellePreviewRef.current = { polyline, markers, polygon };
  }, [solcelleVertices, solcelleModus, mapReady]); // eslint-disable-line

  useEffect(() => {
    if (!leafletInst.current || !LRef.current) return;
    applyKartlag(LRef.current, leafletInst.current, kartlag, tileRef, overlaysRef);
  }, [kartlag]);

  // ── Rotorer ──
  useEffect(() => {
    if (!mapReady || !leafletInst.current || !LRef.current) return;
    const map = leafletInst.current;
    const L   = LRef.current;
    // Fjern standard-rotorer — inkl. zoomend-lytteren hver markør la på map,
    // ellers hoper disse seg opp for hver gang rotor-listen endres, og kan
    // kaste feil (setStyle på fjernet lag) neste gang zoomend fyres — bl.a. under map.remove().
    for (const id of Object.keys(markerMap.current)) {
      if (markerMap.current[id].zoomHandler) map.off("zoomend", markerMap.current[id].zoomHandler);
      markerMap.current[id].rotHandle?.remove();
      markerMap.current[id].marker.remove();
      markerMap.current[id].sirkel.remove();
      markerMap.current[id].sirkelEks?.remove();
    }
    markerMap.current = {};
    // Fjern V-rotorer
    for (const id of Object.keys(vRotorMap.current)) {
      if (vRotorMap.current[id].zoomHandler) map.off("zoomend", vRotorMap.current[id].zoomHandler);
      vRotorMap.current[id].sirkelEks?.remove();
      vRotorMap.current[id].armLeft?.remove();
      vRotorMap.current[id].armRight?.remove();
      vRotorMap.current[id].polyline.remove();
      vRotorMap.current[id].marker.remove();
    }
    vRotorMap.current = {};
    rotorer.forEach(r => {
      if (r.lat && r.lon) {
        if (r.rotor_type === "v-rotor") addVRotorMarker(L, map, r);
        else if (r.rotor_type === "liggende") addLiggendeRotorMarker(L, map, r);
        else addRotorMarker(L, map, r);
      }
    });
  }, [rotorer, mapReady]); // eslint-disable-line

  // ── Containere ──
  useEffect(() => {
    if (!mapReady || !leafletInst.current || !LRef.current) return;
    const map = leafletInst.current;
    const L   = LRef.current;
    for (const id of Object.keys(containerMap.current)) { containerMap.current[id].remove(); }
    containerMap.current = {};
    containere.forEach(c => { if (c.lat && c.lon) addContainerMarker(L, map, c); });
  }, [containere, mapReady]); // eslint-disable-line

  // ── Kabler ──
  useEffect(() => {
    if (!mapReady || !leafletInst.current || !LRef.current) return;
    const map = leafletInst.current;
    const L   = LRef.current;
    for (const id of Object.keys(kabelMap.current)) { kabelMap.current[id].remove(); }
    kabelMap.current = {};
    kabler.forEach(k => {
      if (k.waypoints.length < 2) return;
      const erRedigert = k.id === redigerKabelId;
      const linje = L.polyline(k.waypoints.map((p: any) => [p.lat, p.lon]), {
        color: erRedigert ? "#F59E0B" : kabelFarge(k.type),
        weight: erRedigert ? 4 : 3,
        opacity: erRedigert ? 0.5 : 0.85,
        dashArray: erRedigert ? "8 5" : undefined,
      }).addTo(map);
      linje.on("mousedown", (e: any) => {
        L.DomEvent.stopPropagation(e);
        kabelKlikkRef.current?.(k.id, e.latlng.lat, e.latlng.lng);
      });
      kabelMap.current[k.id] = linje;
    });
  }, [kabler, redigerKabelId, mapReady]); // eslint-disable-line

  // ── Kabel-redigering: draggable waypoint-handles ──
  useEffect(() => {
    if (!mapReady || !leafletInst.current || !LRef.current) return;
    const map = leafletInst.current;
    const L   = LRef.current;

    // Rydd opp gamle handles
    editHandlesRef.current.forEach(h => h.remove());
    editHandlesRef.current = [];
    editMidHandlesRef.current.forEach(h => h.remove());
    editMidHandlesRef.current = [];
    if (editPolylineRef.current) { editPolylineRef.current.remove(); editPolylineRef.current = null; }

    if (!redigerKabelId) return;
    const kabelId: string = redigerKabelId; // capture as non-null for closures
    const kabel = kabler.find(k => k.id === kabelId);
    if (!kabel || kabel.waypoints.length < 2) return;

    editWaypointsRef.current = kabel.waypoints.map((p: any) => ({ lat: p.lat, lon: p.lon }));

    // Tydelig redigeringslinje (oransje, på toppen)
    editPolylineRef.current = L.polyline(
      editWaypointsRef.current.map(p => [p.lat, p.lon]),
      { color: "#F59E0B", weight: 5, opacity: 1, zIndexOffset: 500 }
    ).addTo(map);

    function buildHandles() {
      editHandlesRef.current.forEach(h => h.remove());
      editHandlesRef.current = [];
      editMidHandlesRef.current.forEach(h => h.remove());
      editMidHandlesRef.current = [];

      const wps = editWaypointsRef.current;

      // Waypoint-handles (store, draggable)
      wps.forEach((wp, i) => {
        const handle = L.marker([wp.lat, wp.lon], {
          icon: L.divIcon({
            html: `<div title="Dra for å flytte. Høyreklikk for å slette." style="width:18px;height:18px;border-radius:50%;background:#F59E0B;border:3px solid white;cursor:grab;box-shadow:0 1px 6px rgba(0,0,0,.5)"></div>`,
            className: "",
            iconAnchor: [9, 9],
          }),
          draggable: true,
          zIndexOffset: 1000,
        }).addTo(map);

        handle.on("drag", () => {
          const ll = handle.getLatLng();
          editWaypointsRef.current[i] = { lat: ll.lat, lon: ll.lng };
          editPolylineRef.current?.setLatLngs(
            editWaypointsRef.current.map(p => [p.lat, p.lon])
          );
        });

        handle.on("dragend", () => {
          const ll = handle.getLatLng();
          editWaypointsRef.current[i] = { lat: ll.lat, lon: ll.lng };
          kabelOppdatertRef.current?.(kabelId, [...editWaypointsRef.current]);
          buildMidHandles();
        });

        handle.on("contextmenu", (e: any) => {
          L.DomEvent.stopPropagation(e);
          if (editWaypointsRef.current.length > 2) {
            editWaypointsRef.current.splice(i, 1);
            editPolylineRef.current?.setLatLngs(
              editWaypointsRef.current.map(p => [p.lat, p.lon])
            );
            kabelOppdatertRef.current?.(kabelId, [...editWaypointsRef.current]);
            buildHandles();
          }
        });

        editHandlesRef.current.push(handle);
      });

      buildMidHandles();
    }

    function buildMidHandles() {
      editMidHandlesRef.current.forEach(h => h.remove());
      editMidHandlesRef.current = [];
      const wps = editWaypointsRef.current;
      for (let i = 0; i < wps.length - 1; i++) {
        const midLat = (wps[i].lat + wps[i + 1].lat) / 2;
        const midLon = (wps[i].lon + wps[i + 1].lon) / 2;
        const idx = i;
        const mid = L.marker([midLat, midLon], {
          icon: L.divIcon({
            html: `<div title="Klikk for å legge til punkt" style="width:11px;height:11px;border-radius:50%;background:#FCD34D;border:2px solid #F59E0B;cursor:pointer;opacity:0.85"></div>`,
            className: "",
            iconAnchor: [5, 5],
          }),
          zIndexOffset: 900,
        }).addTo(map);
        mid.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          editWaypointsRef.current.splice(idx + 1, 0, { lat: midLat, lon: midLon });
          editPolylineRef.current?.setLatLngs(
            editWaypointsRef.current.map(p => [p.lat, p.lon])
          );
          kabelOppdatertRef.current?.(kabelId, [...editWaypointsRef.current]);
          buildHandles();
        });
        editMidHandlesRef.current.push(mid);
      }
    }

    buildHandles();
  }, [redigerKabelId, kabler, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Kabel under arbeid (live preview) ──
  useEffect(() => {
    if (!mapReady || !leafletInst.current || !LRef.current) return;
    const map = leafletInst.current;
    const L   = LRef.current;
    if (kabelArbeidRef.current) { kabelArbeidRef.current.remove(); kabelArbeidRef.current = null; }
    if (kabelUnderArbeid.length >= 2) {
      kabelArbeidRef.current = L.polyline(
        kabelUnderArbeid.map(p => [p.lat, p.lon]),
        { color: "#F59E0B", weight: 2.5, dashArray: "8 5", opacity: 0.9 }
      ).addTo(map);
    }
  }, [kabelUnderArbeid, mapReady]); // eslint-disable-line

  // ── Snap-sirkler (vises kun i kabelModus) ──
  useEffect(() => {
    if (!mapReady || !leafletInst.current || !LRef.current) return;
    const map = leafletInst.current;
    const L   = LRef.current;
    snapCirclesRef.current.forEach(c => c.remove());
    snapCirclesRef.current = [];
    if (kabelModus && snapKandidater.length > 0) {
      snapKandidater.forEach(k => {
        const r = k.radius_m ?? 5;
        const c = L.circle([k.lat, k.lon], {
          radius: r, color: "#F59E0B", fillColor: "#F59E0B",
          fillOpacity: 0.15, weight: 2, dashArray: "5 4",
        }).addTo(map);
        snapCirclesRef.current.push(c);
      });
    }
  }, [kabelModus, snapKandidater, mapReady]); // eslint-disable-line

  // ── Live preview-punkt (følger musen i kabelModus, snapper automatisk) ──
  useEffect(() => {
    if (!mapReady || !leafletInst.current || !LRef.current) return;
    const map = leafletInst.current;
    const L   = LRef.current;

    const onMove = (e: any) => {
      if (!kabelModus) {
        if (previewPktRef.current) { previewPktRef.current.remove(); previewPktRef.current = null; }
        return;
      }
      let { lat, lng: lon } = e.latlng;
      let snapped = false;
      for (const k of snapKandidater) {
        const grad = (k.radius_m ?? 5) / 111_000;
        if (Math.abs(k.lat - lat) < grad && Math.abs(k.lon - lon) < grad) {
          lat = k.lat; lon = k.lon; snapped = true; break;
        }
      }
      const color = snapped ? "#F59E0B" : "#2563EB";
      if (previewPktRef.current) {
        previewPktRef.current.setLatLng([lat, lon]);
        previewPktRef.current.setStyle({ color, fillColor: color });
      } else {
        previewPktRef.current = L.circleMarker([lat, lon], {
          radius: 6, color, fillColor: color, fillOpacity: 0.85, weight: 2,
        }).addTo(map);
      }
    };

    map.on("mousemove", onMove);
    return () => {
      map.off("mousemove", onMove);
      if (previewPktRef.current) { previewPktRef.current.remove(); previewPktRef.current = null; }
    };
  }, [kabelModus, snapKandidater, mapReady]); // eslint-disable-line

  useEffect(() => {
    if (!mapRef.current || leafletInst.current) return;

    import("leaflet").then(L => {
      LRef.current = L;
      (window as any).L = L;

      // Global callbacks for popup-level V-rotor rotation
      (window as any)._roterVRotor = (id: string, deg: number) => {
        const normalized = Math.round(((deg % 360) + 360) % 360);
        const input = document.getElementById(`vr-deg-${id}`) as HTMLInputElement | null;
        if (input) input.value = String(normalized);
        vRotorRotertRef.current?.(id, normalized);
      };
      (window as any)._roterVRotorNudge = (id: string, delta: number) => {
        const input = document.getElementById(`vr-deg-${id}`) as HTMLInputElement | null;
        const current = parseFloat(input?.value ?? "0") || 0;
        const normalized = Math.round(((current + delta) % 360 + 360) % 360);
        if (input) input.value = String(normalized);
        vRotorRotertRef.current?.(id, normalized);
      };
      (window as any)._roterVRotorInput = (id: string) => {
        const input = document.getElementById(`vr-deg-${id}`) as HTMLInputElement | null;
        if (!input) return;
        const normalized = Math.round(((parseFloat(input.value) % 360) + 360) % 360);
        vRotorRotertRef.current?.(id, normalized);
      };

      // V-åpningsvinkel callbacks (beregner ny bredde fra vinkel + dybde, lagrer)
      (window as any)._setVVinkel = (id: string, angleDeg: number) => {
        const clamped = Math.max(10, Math.min(170, Math.round(angleDeg)));
        const dybdeEl = document.getElementById(`vr-dybde-${id}`) as HTMLInputElement | null;
        const dybde   = parseFloat(dybdeEl?.value ?? "40") || 40;
        const newBredde = 2 * dybde * Math.tan((clamped / 2) * Math.PI / 180);
        const vinkelEl = document.getElementById(`vr-vinkel-${id}`) as HTMLInputElement | null;
        if (vinkelEl) vinkelEl.value = String(clamped);
        vRotorDimsRef.current?.(id, Math.round(newBredde * 10) / 10, dybde);
      };
      (window as any)._setVVinkelNudge = (id: string, delta: number) => {
        const vinkelEl = document.getElementById(`vr-vinkel-${id}`) as HTMLInputElement | null;
        const current  = parseFloat(vinkelEl?.value ?? "90") || 90;
        (window as any)._setVVinkel(id, current + delta);
      };
      (window as any)._setVVinkelInput = (id: string) => {
        const vinkelEl = document.getElementById(`vr-vinkel-${id}`) as HTMLInputElement | null;
        const angleDeg = parseFloat(vinkelEl?.value ?? "90") || 90;
        (window as any)._setVVinkel(id, angleDeg);
      };

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const rotorMedGps = rotorer.filter(r => r.lat && r.lon);
      let startLat = 20.0, startLon = 0.0, startZoom = 2; // standard: verdensoversikt
      if (harKoordinater)          { startLat = lat; startLon = lon; startZoom = 14; }
      else if (rotorMedGps.length) { startLat = +(rotorMedGps[0].lat as number); startLon = +(rotorMedGps[0].lon as number); startZoom = 16; }

      const map = L.map(mapRef.current!, { zoomControl: false }).setView([startLat, startLon], startZoom);
      leafletInst.current = map;

      applyKartlag(L, map, "standard", tileRef, overlaysRef);
      L.control.zoom({ position: "bottomright" }).addTo(map);

      map.on("moveend", () => {
        const c = map.getCenter();
        saveView(storageKey, c.lat, c.lng, map.getZoom());
      });

      if (harKoordinater) {
        const projIcon = L.divIcon({
          html: "<div style='background:#0F2A5A;color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 8px rgba(15,42,90,.4)'>" + prosjektNavn + "</div>",
          className: "", iconAnchor: [0, 10],
        });
        L.marker([lat, lon], { icon: projIcon }).addTo(map)
          .bindPopup("<b>" + prosjektNavn + "</b><br/>" + lat.toFixed(5) + ", " + lon.toFixed(5));
      }

      if (stream?.avg_velocity_m_s && harKoordinater) {
        const streamSirkel = L.circle([lat, lon], {
          radius: 80, color: "#3B82F6", fillOpacity: 0.07, dashArray: "6 4", weight: 1.5,
        }).bindPopup("Strom: " + (stream.stream_type ?? "") + "<br/>Snitt: " + stream.avg_velocity_m_s.toFixed(2) + " m/s")
          .addTo(map);
        // I plasseringsmodus: la klikk på strømsirkelen trigge rotor-plassering (ikke popup)
        streamSirkel.on("click", (e: any) => {
          if (modusRef.current && klikkRef.current) {
            L.DomEvent.stopPropagation(e);
            klikkRef.current(e.latlng.lat, e.latlng.lng);
          }
        });
      }

      map.on("click", (e: any) => {
        if (solcelleModusRef.current) {
          const { lat, lng: lon } = e.latlng;
          solcellePunktRef.current = [...solcellePunktRef.current, { lat, lon }];
          setSolcelleVertices([...solcellePunktRef.current]);
          return;
        }
        if (modusRef.current && klikkRef.current) {
          klikkRef.current(e.latlng.lat, e.latlng.lng);
        }
      });

      setMapReady(true);
    });

    return () => {
      // Kartet rives ned idet komponenten avmonteres (f.eks. ved navigasjon vekk fra Kart-fanen).
      // Leaflet kan kaste her hvis noe internt lag/handler henger igjen (se zoomend-fiksen over) —
      // en uventet feil her må ALDRI blokkere selve navigasjonen/unmount-prosessen, derfor try/catch.
      try {
        leafletInst.current?.off();
        leafletInst.current?.remove();
      } catch (err) {
        console.error("Feil ved nedrivning av kart (ignorert, blokkerer ikke navigasjon):", err);
      }
      leafletInst.current = null;
      LRef.current = null;
      markerMap.current = {};
      vRotorMap.current = {};
      containerMap.current = {};
      kabelMap.current = {};
      // Ikke setMapReady(false) her — komponenten avmonteres uansett, og en state-oppdatering
      // midt i avmontering kan i sjeldne tilfeller forstyrre en pågående router-overgang.
    };
  }, []); // eslint-disable-line

  function addRotorMarker(L: any, map: any, r: RotorPunkt) {
    if (!r.lat || !r.lon) return;
    const farge = ROTOR_FARGE;
    // Beregn ekvivalent sirkeldiameter fra rektangulær flate (bredde × høyde)
    // slik at sirkelens areal tilsvarer rotorens frontareal.
    const areal = (r.lengde_m && r.hoyde_m) ? r.lengde_m * r.hoyde_m : null;
    const diam  = areal != null
      ? 2 * Math.sqrt(areal / Math.PI)
      : (r.diameter_m ?? 3.05);
    const rLat  = +(r.lat as number);
    const rLon  = +(r.lon as number);

    const icon = L.divIcon({
      html: "<div style='width:28px;height:28px;border-radius:50%;background:" + farge + ";border:3px solid rgba(255,255,255,.9);box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;cursor:grab'>&#9881;</div>",
      className: "", iconAnchor: [14, 14],
    });

    const marker = L.marker([rLat, rLon], { icon, draggable: true }).addTo(map);

    // Klikk → åpne redigering i sidebar (ikke popup)
    marker.on("click", (e: any) => {
      L.DomEvent.stopPropagation(e);
      if (!modusRef.current) rotorKlikkRef.current?.(r.id);
    });

    // Indre sirkel: faktisk rotordiameter (fylt)
    const sirkel = L.circle([rLat, rLon], {
      radius: diam / 2, color: farge, fillColor: farge, fillOpacity: 0.35, weight: 2,
    }).addTo(map);

    // Ytre sirkel: eksklusjonssone = 1.5 × diameter senter-til-senter avstand
    // (to sirkler berører hverandre ved 1.5D senter-til-senter)
    const sirkelEks = L.circle([rLat, rLon], {
      radius: diam * 0.75,
      color: farge, fillColor: "transparent", fillOpacity: 0,
      weight: 1.5, dashArray: "6 4", opacity: 0.5,
    }).addTo(map);

    const showSirkler = () => {
      const show = map.getZoom() >= 14;
      sirkel.setStyle({ opacity: show ? 1 : 0, fillOpacity: show ? 0.35 : 0 });
      sirkelEks.setStyle({ opacity: show ? 0.5 : 0 });
    };
    showSirkler();
    map.on("zoomend", showSirkler);

    marker.on("dragend", () => {
      const ll = marker.getLatLng();
      sirkel.setLatLng(ll);
      sirkelEks.setLatLng(ll);
      saveView(storageKey, ll.lat, ll.lng, map.getZoom());
      rotorFlyttetRef.current?.(r.id, ll.lat, ll.lng);
    });

    markerMap.current[r.id] = { marker, sirkel, sirkelEks, zoomHandler: showSirkler };
  }

  function addLiggendeRotorMarker(L: any, map: any, r: RotorPunkt) {
    if (!r.lat || !r.lon) return;
    const FARGE = "#F59E0B"; // amber

    // Mutable state — oppdateres av drag-handlers
    let cLat   = +(r.lat as number);
    let cLon   = +(r.lon as number);
    const diam   = +(r.hoyde_m  ?? 3);   // diameter = høyde i vannet
    const lengde = +(r.lengde_m ?? 10);  // lengde langs aks
    let alpha  = ((r.retning_grader ?? 0) * Math.PI) / 180;
    const halfL = lengde / 2;
    const halfW = diam   / 2;
    const buf   = diam * 0.25;            // eksklusjonssone-buffer (1.5× diam senter-til-senter)

    // Hjelpefunksjon: lokale koordinater → lat/lon
    function ll(axial: number, perp: number): [number, number] {
      const mpLat = 111000;
      const mpLon = 111000 * Math.cos(cLat * Math.PI / 180);
      const rN = axial * Math.cos(alpha) - perp * Math.sin(alpha);
      const rE = axial * Math.sin(alpha) + perp * Math.cos(alpha);
      return [cLat + rN / mpLat, cLon + rE / mpLon];
    }

    // Hjerne → kompassretning (0=N, 90=Ø) fra ett punkt til et annet
    function kompassMellom(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const φ1   = lat1 * Math.PI / 180;
      const φ2   = lat2 * Math.PI / 180;
      const y    = Math.sin(dLon) * Math.cos(φ2);
      const x    = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon);
      return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
    }

    function buildRect(): [number, number][] {
      return [ll( halfL, halfW), ll(-halfL, halfW), ll(-halfL, -halfW), ll( halfL, -halfW)];
    }
    function buildEks(): [number, number][] {
      return [ll( halfL+buf, halfW+buf), ll(-halfL-buf, halfW+buf), ll(-halfL-buf, -halfW-buf), ll( halfL+buf, -halfW-buf)];
    }
    function tipLl(): [number, number] { return ll(halfL, 0); } // front-enden av rotoren

    // Tegn polygon og eksklusjonssone
    const polygon = L.polygon(buildRect(), {
      color: FARGE, fillColor: FARGE, fillOpacity: 0.45, weight: 2.5,
    }).addTo(map);

    const eksZone = L.polygon(buildEks(), {
      color: FARGE, fillColor: "transparent", fillOpacity: 0,
      opacity: 0, dashArray: "6 4", weight: 1.5,
    }).addTo(map);

    // Sentrum-markør (flytt)
    const centerIcon = L.divIcon({
      html: "<div style='width:24px;height:14px;border-radius:3px;background:" + FARGE + ";border:2px solid rgba(255,255,255,.9);box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:grab'></div>",
      className: "", iconAnchor: [12, 7],
    });
    const marker = L.marker([cLat, cLon], { icon: centerIcon, draggable: true }).addTo(map);

    // Rotasjons-håndtak (roter) ved front-enden
    const rotIcon = L.divIcon({
      html: "<div style='width:18px;height:18px;border-radius:50%;background:white;border:2.5px solid " + FARGE + ";box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:11px;cursor:grab' title='Dra for å rotere'>↻</div>",
      className: "", iconAnchor: [9, 9],
    });
    const rotHandle = L.marker(tipLl(), { icon: rotIcon, draggable: true }).addTo(map);

    // Klikk på markør eller polygon → åpne redigering i sidebar
    const onKlikkRediger = (e: any) => {
      L.DomEvent.stopPropagation(e);
      if (!modusRef.current) rotorKlikkRef.current?.(r.id);
    };
    marker.on("click", onKlikkRediger);
    polygon.on("click", onKlikkRediger);

    // Zoom-synlighet
    const showLag = () => {
      const show = map.getZoom() >= 13;
      polygon.setStyle({ opacity: show ? 1 : 0, fillOpacity: show ? 0.45 : 0 });
      eksZone.setStyle({ opacity: show ? 0.5 : 0 });
      rotHandle.setOpacity(show ? 1 : 0);
    };
    showLag();
    map.on("zoomend", showLag);

    // ── Senter-drag: flytt alt ──
    marker.on("drag", () => {
      const p = marker.getLatLng();
      cLat = p.lat; cLon = p.lng;
      polygon.setLatLngs(buildRect());
      eksZone.setLatLngs(buildEks());
      rotHandle.setLatLng(tipLl());
    });
    marker.on("dragend", () => {
      saveView(storageKey, cLat, cLon, map.getZoom());
      rotorFlyttetRef.current?.(r.id, cLat, cLon);
    });

    // ── Rotasjons-drag: snu rotoren ──
    rotHandle.on("drag", () => {
      const p = rotHandle.getLatLng();
      const nyDeg = kompassMellom(cLat, cLon, p.lat, p.lng);
      alpha = nyDeg * Math.PI / 180;
      polygon.setLatLngs(buildRect());
      eksZone.setLatLngs(buildEks());
      // Ikke flytt håndtaket mens brukeren drar — la Leaflet styre
    });
    rotHandle.on("dragend", () => {
      // Snap håndtaket til faktisk tip-posisjon
      rotHandle.setLatLng(tipLl());
      const deg = Math.round(((alpha * 180 / Math.PI) + 360) % 360);
      liggendeRotertRef.current?.(r.id, deg);
    });

    markerMap.current[r.id] = { marker, sirkel: polygon, sirkelEks: eksZone, zoomHandler: showLag, rotHandle };
  }

  function addVRotorMarker(L: any, map: any, r: RotorPunkt) {
    if (!r.lat || !r.lon) return;
    const cLat   = +(r.lat as number);
    const cLon   = +(r.lon as number);
    const bredde = +(r.bredde_m ?? 10);
    const dybde  = +(r.dybde_m  ?? 20);
    const alpha  = ((r.retning_grader ?? 0) * Math.PI) / 180;

    const mPerLat = 111000;
    const mPerLon = 111000 * Math.cos(cLat * Math.PI / 180);

    // Roter lokale koordinater (east, north) med compass-vinkel alpha (med klokka fra N)
    function localToLatLon(localEast: number, localNorth: number, a: number): [number, number] {
      const rN = localNorth * Math.cos(a) - localEast * Math.sin(a);
      const rE = localNorth * Math.sin(a) + localEast * Math.cos(a);
      return [cLat + rN / mPerLat, cLon + rE / mPerLon];
    }

    // V-tip er i sentrum; armene strekker seg i retning alpha
    const leftPt  = localToLatLon(-bredde / 2, dybde, alpha);
    const rightPt = localToLatLon( bredde / 2, dybde, alpha);

    const polyline = L.polyline(
      [leftPt, [cLat, cLon], rightPt],
      { color: "#5FAFD7", weight: 3.5, opacity: 0.9, lineJoin: "round" }
    ).addTo(map);

    // Eksklusjonssone: V-formet polygon som følger armene
    // buf = 0.75 × armLen (diagonal arm-lengde) → 1.5× arm-lengde senter-til-senter
    const armLen = Math.sqrt(Math.pow(bredde / 2, 2) + Math.pow(dybde, 2));
    const buf    = armLen * 0.75;

    // Bygg en 7-punkt polygon som omslutter V-armene med jevn buffer
    function buildExclusionPoly(cntLat: number, cntLng: number): [number, number][] {
      const mpLat = 111000;
      const mpLon = 111000 * Math.cos(cntLat * Math.PI / 180);
      const b2 = bredde / 2;
      const d  = dybde;
      const arm = armLen;

      function ltl(E: number, N: number): [number, number] {
        const rN = N * Math.cos(alpha) - E * Math.sin(alpha);
        const rE = N * Math.sin(alpha) + E * Math.cos(alpha);
        return [cntLat + rN / mpLat, cntLng + rE / mpLon];
      }

      // Utover-normaler (lokale E,N) til venstre og høyre arm
      const nLE = -d / arm,  nLN = -b2 / arm;   // venstre arm utover
      const uLE = -b2 / arm, uLN =  d / arm;    // venstre arm enhetsvektor
      const nRE =  d / arm,  nRN = -b2 / arm;   // høyre arm utover
      const uRE =  b2 / arm, uRN =  d / arm;    // høyre arm enhetsvektor

      return [
        ltl(nLE * buf,                        nLN * buf),                        // venstre ytterside ved spiss
        ltl(-b2 + nLE * buf,                  d + nLN * buf),                    // venstre ytterside ved arm-ende
        ltl(-b2 + (nLE + uLE) * buf,          d + (nLN + uLN) * buf),            // øverst venstre (cap)
        ltl( b2 + (nRE + uRE) * buf,          d + (nRN + uRN) * buf),            // øverst høyre (cap)
        ltl( b2 + nRE * buf,                  d + nRN * buf),                    // høyre ytterside ved arm-ende
        ltl(nRE * buf,                        nRN * buf),                        // høyre ytterside ved spiss
        ltl(0,                               -buf * 0.6),                        // under spiss
      ];
    }

    const sirkelEks = L.polygon(buildExclusionPoly(cLat, cLon), {
      color: "#5FAFD7", fillColor: "#5FAFD7", fillOpacity: 0,
      opacity: 0, dashArray: "7 5", weight: 1.5,
    }).addTo(map);

    const showEks = () => {
      const show = map.getZoom() >= 13;
      sirkelEks.setStyle({ opacity: show ? 0.45 : 0 });
    };
    showEks();
    map.on("zoomend", showEks);

    const icon = L.divIcon({
      html: "<div style='width:24px;height:24px;border-radius:50%;background:#0F5A8A;border:3px solid rgba(255,255,255,.9);box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:700;cursor:grab'>V</div>",
      className: "", iconAnchor: [12, 12],
    });

    const marker = L.marker([cLat, cLon], { icon, draggable: true }).addTo(map);

    const popupId    = "vr-popup-"  + r.id;
    const degInputId = "vr-deg-"   + r.id;
    const vinkelId   = "vr-vinkel-" + r.id;
    const dybdeId    = "vr-dybde-"  + r.id;
    const retning    = r.retning_grader ?? 0;
    const currentVinkel = bredde > 0 && dybde > 0
      ? Math.round(2 * Math.atan(bredde / (2 * dybde)) * 180 / Math.PI)
      : 90;

    const DIRS: [string, number][] = [
      ["N",0],["NØ",45],["Ø",90],["SØ",135],
      ["S",180],["SV",225],["V",270],["NV",315],
    ];
    const btnBase = "border:none;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;padding:5px 0;font-family:system-ui;";
    const compassGrid = DIRS.map(([lbl, deg]) => {
      const active = retning === deg;
      return "<button onclick=\"window._roterVRotor('" + r.id + "'," + deg + ")\" style=\"" + btnBase +
             "background:" + (active ? "#5FAFD7" : "#f1f5f9") + ";" +
             "color:" + (active ? "white" : "#334155") + "\">" + lbl + "</button>";
    }).join("");

    const vinkelBtnBase = "border:none;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;padding:4px 0;font-family:system-ui;";
    const vinkelGrid = [30,60,90,120,150].map(v => {
      const active = Math.abs(currentVinkel - v) < 3;
      return "<button onclick=\"window._setVVinkel('" + r.id + "'," + v + ")\" style=\"" + vinkelBtnBase +
             "background:" + (active ? "#5FAFD7" : "#f1f5f9") + ";" +
             "color:" + (active ? "white" : "#334155") + "\">" + v + "°</button>";
    }).join("");

    marker.bindPopup(
      "<div style='font-family:system-ui;min-width:210px'>" +
      "<div style='font-weight:700;color:#0F2A5A;font-size:13px;margin-bottom:2px'>▽ V-rotor</div>" +
      (r.serienummer ? "<div style='color:#64748b;font-size:11px'>S/N: " + r.serienummer + "</div>" : "") +
      "<div style='color:#64748b;font-size:11px;margin-top:2px'>Åpningsvinkel: " + currentVinkel + "° &middot; Dybde: " + dybde + " m</div>" +
      "<div style='color:#94a3b8;font-size:10px;font-family:monospace;margin-top:2px'>" + cLat.toFixed(5) + ", " + cLon.toFixed(5) + "</div>" +

      // ── V-åpningsvinkel ──
      "<div style='margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0'>" +
      "  <div style='font-size:11px;color:#475569;font-weight:600;margin-bottom:5px'>V-åpningsvinkel</div>" +
      "  <input id='" + dybdeId + "' type='hidden' value='" + dybde + "'/>" +
      "  <div style='display:grid;grid-template-columns:repeat(5,1fr);gap:3px;margin-bottom:5px'>" +
      vinkelGrid +
      "  </div>" +
      "  <div style='display:flex;gap:4px;align-items:center'>" +
      "    <button onclick=\"window._setVVinkelNudge('" + r.id + "',-15)\" style=\"" + btnBase + "background:#f1f5f9;color:#334155;padding:5px 6px\">−15°</button>" +
      "    <input id='" + vinkelId + "' type='number' step='1' min='10' max='170' value='" + currentVinkel + "'" +
      "      style='flex:1;padding:5px 4px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px;text-align:center;outline:none;min-width:0'/>" +
      "    <span style='font-size:12px;color:#94a3b8'>°</span>" +
      "    <button onclick=\"window._setVVinkelNudge('" + r.id + "',+15)\" style=\"" + btnBase + "background:#f1f5f9;color:#334155;padding:5px 6px\">+15°</button>" +
      "  </div>" +
      "  <button onclick=\"window._setVVinkelInput('" + r.id + "')\" style=\"margin-top:5px;width:100%;padding:5px 0;" + btnBase + "background:#5FAFD7;color:white\">↻ Sett vinkel</button>" +
      "</div>" +

      // ── Retnings-kontroller ──
      "<div style='margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0'>" +
      "  <div style='font-size:11px;color:#475569;font-weight:600;margin-bottom:6px'>Retning åpning</div>" +

      // Kompassrose — 4×2 grid
      "  <div style='display:grid;grid-template-columns:repeat(4,1fr);gap:3px;margin-bottom:6px'>" +
      compassGrid +
      "  </div>" +

      // ±15° + number input + apply
      "  <div style='display:flex;gap:4px;align-items:center'>" +
      "    <button onclick=\"window._roterVRotorNudge('" + r.id + "',-15)\" style=\"" + btnBase + "background:#f1f5f9;color:#334155;padding:5px 8px\">−15°</button>" +
      "    <input id='" + degInputId + "' type='number' step='1' min='0' max='359' value='" + retning + "'" +
      "      style='flex:1;padding:5px 4px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px;text-align:center;outline:none;min-width:0'/>" +
      "    <span style='font-size:12px;color:#94a3b8'>°</span>" +
      "    <button onclick=\"window._roterVRotorNudge('" + r.id + "',+15)\" style=\"" + btnBase + "background:#f1f5f9;color:#334155;padding:5px 8px\">+15°</button>" +
      "  </div>" +
      "  <button onclick=\"window._roterVRotorInput('" + r.id + "')\" style=\"margin-top:5px;width:100%;padding:5px 0;" + btnBase + "background:#5FAFD7;color:white\">↻ Sett retning</button>" +
      "</div>" +

      "<button id='" + popupId + "' style='margin-top:8px;width:100%;padding:5px 0;background:#0F2A5A;color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer'>✎ Rediger dimensjoner</button>" +
      "</div>"
    , { maxWidth: 250 });
    marker.on("popupopen", () => {
      const btn = document.getElementById(popupId);
      if (btn) btn.onclick = () => { marker.closePopup(); vRotorKlikkRef.current?.(r.id); };
    });

    // Flytt hele V-rotoren ved drag på sentrum-markøren
    marker.on("dragend", () => {
      const ll = marker.getLatLng();
      const curAlpha = ((r.retning_grader ?? 0) * Math.PI) / 180;
      const curMPerLon = 111000 * Math.cos(ll.lat * Math.PI / 180);
      function curOffset(lE: number, lN: number): [number, number] {
        const rN2 = lN * Math.cos(curAlpha) - lE * Math.sin(curAlpha);
        const rE2 = lN * Math.sin(curAlpha) + lE * Math.cos(curAlpha);
        return [ll.lat + rN2 / mPerLat, ll.lng + rE2 / curMPerLon];
      }
      const newLeft  = curOffset(-bredde / 2, dybde);
      const newRight = curOffset( bredde / 2, dybde);
      polyline.setLatLngs([newLeft, [ll.lat, ll.lng], newRight]);
      armLeft.setLatLng(newLeft);
      armRight.setLatLng(newRight);
      sirkelEks.setLatLngs([buildExclusionPoly(ll.lat, ll.lng)]);
      rotorFlyttetRef.current?.(r.id, ll.lat, ll.lng);
    });

    // ── Arm-endepunkts-markører: drag roterer V-rotoren ──
    const armIcon = L.divIcon({
      html: "<div style='width:14px;height:14px;border-radius:50%;background:#5FAFD7;border:2px solid rgba(255,255,255,.9);box-shadow:0 1px 5px rgba(0,0,0,.4);cursor:crosshair'></div>",
      className: "", iconAnchor: [7, 7],
    });

    const armLeft  = L.marker(leftPt,  { icon: armIcon, draggable: true, zIndexOffset: 100 }).addTo(map);
    const armRight = L.marker(rightPt, { icon: armIcon, draggable: true, zIndexOffset: 100 }).addTo(map);

    // Beregn ny retning_grader fra dragets sluttposisjon
    // side: +1 for høyre arm (localEast=+bredde/2), -1 for venstre arm (localEast=-bredde/2)
    function computeNewDeg(newLat: number, newLng: number, side: number): number {
      const drN = (newLat - cLat) * mPerLat;
      const drE = (newLng - cLon) * mPerLon;
      const b2s = (bredde / 2) * side;
      // rN = dybde*cos(a) - b2s*sin(a), rE = dybde*sin(a) + b2s*cos(a)
      // → cos(a) = (dybde*drN + b2s*drE) / (dybde²+b2s²)
      // → sin(a) = (dybde*drE - b2s*drN) / (dybde²+b2s²)
      const denom = dybde * dybde + b2s * b2s;
      const cosA  = (dybde * drN + b2s * drE) / denom;
      const sinA  = (dybde * drE - b2s * drN) / denom;
      const deg   = Math.atan2(sinA, cosA) * 180 / Math.PI;
      return ((deg % 360) + 360) % 360;
    }

    function applyNewDeg(newDeg: number) {
      const newAlpha2 = (newDeg * Math.PI) / 180;
      const newLeft2  = localToLatLon(-bredde / 2, dybde, newAlpha2);
      const newRight2 = localToLatLon( bredde / 2, dybde, newAlpha2);
      polyline.setLatLngs([newLeft2, [cLat, cLon], newRight2]);
      armLeft.setLatLng(newLeft2);
      armRight.setLatLng(newRight2);
    }

    // Live visuell oppdatering under drag
    armLeft.on("drag", (e: any) => {
      const ll2 = e.target.getLatLng();
      const d = computeNewDeg(ll2.lat, ll2.lng, -1);
      applyNewDeg(d);
    });
    armRight.on("drag", (e: any) => {
      const ll2 = e.target.getLatLng();
      const d = computeNewDeg(ll2.lat, ll2.lng, +1);
      applyNewDeg(d);
    });

    // Lagre etter at drag er fullført
    armLeft.on("dragend", (e: any) => {
      const ll2 = e.target.getLatLng();
      const newDeg = computeNewDeg(ll2.lat, ll2.lng, -1);
      applyNewDeg(newDeg);
      vRotorRotertRef.current?.(r.id, Math.round(newDeg));
    });
    armRight.on("dragend", (e: any) => {
      const ll2 = e.target.getLatLng();
      const newDeg = computeNewDeg(ll2.lat, ll2.lng, +1);
      applyNewDeg(newDeg);
      vRotorRotertRef.current?.(r.id, Math.round(newDeg));
    });

    vRotorMap.current[r.id] = { marker, polyline, armLeft, armRight, sirkelEks, zoomHandler: showEks };
  }

  function kabelFarge(type: string): string {
    if (type === "DC")       return "#7C3AED";
    if (type === "lavspent") return "#059669";
    return "#2563EB"; // AC (default)
  }

  function addContainerMarker(L: any, map: any, c: ContainerPunkt) {
    const emoji = c.type === "transformator" ? "🔌" : c.type === "kontroll" ? "🖥️" : "📦";
    const icon = L.divIcon({
      html: `<div style="
        width:34px;height:34px;border-radius:6px;
        background:#F59E0B;border:3px solid rgba(255,255,255,.9);
        box-shadow:0 2px 8px rgba(0,0,0,.35);
        display:flex;align-items:center;justify-content:center;
        font-size:16px;cursor:grab">
        ${emoji}
      </div>`,
      className: "", iconAnchor: [17, 17],
    });
    const marker = L.marker([c.lat, c.lon], { icon, draggable: true }).addTo(map);
    marker.bindPopup(
      `<div style="font-family:system-ui;min-width:140px">
        <div style="font-weight:700;color:#92400E;font-size:13px;margin-bottom:4px">${emoji} ${c.navn}</div>
        <div style="color:#64748b;font-size:11px">${c.type}</div>
        <div style="color:#64748b;font-size:11px;font-family:monospace;margin-top:4px">${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}</div>
      </div>`
    );
    marker.on("dragend", () => {
      const ll = marker.getLatLng();
      containerFlyttetRef.current?.(c.id, ll.lat, ll.lng);
    });
    containerMap.current[c.id] = marker;
  }

  const KNAPPER: { k: Kartlag; label: string }[] = [
    { k: "standard",  label: "Kart" },
    { k: "sjokart",   label: "Dybdedata" },
    { k: "satellitt", label: "Satellitt" },
    { k: "havstrom",  label: "🌊 Havstrøm" },
  ];

  return (
    <>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
      <div style={{ position: "relative", height, width: "100%" }}>
        <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
        <div style={{
          position: "absolute", top: 10, left: 10, zIndex: 1000,
          background: "#0a1f45", borderRadius: 8, overflow: "hidden",
          boxShadow: "0 2px 12px rgba(0,0,0,.3)", display: "flex",
        }}>
          {KNAPPER.map(({ k, label }) => (
            <button key={k} onClick={() => setKartlag(k)}
              style={{
                padding: "6px 12px", fontSize: 11, fontWeight: 600,
                color: kartlag === k ? "#fff" : "rgba(255,255,255,.45)",
                background: kartlag === k ? "#5FAFD7" : "transparent",
                border: "none", cursor: "pointer", transition: "all .15s",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Havstrøm fargeskala-forklaring */}
        {kartlag === "havstrom" && (
          <div style={{
            position: "absolute", bottom: 36, right: 10, zIndex: 1000,
            background: "rgba(10,31,69,.92)", borderRadius: 8, padding: "8px 10px",
            boxShadow: "0 2px 12px rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.12)",
            minWidth: 130,
          }}>
            <div style={{ color: "rgba(255,255,255,.6)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 2, textTransform: "uppercase" }}>
              Strømhastighet
            </div>
            <div style={{ color: "rgba(255,255,255,.4)", fontSize: 8, marginBottom: 5 }}>mnd.snitt (CMEMS)</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <div style={{ width: 12, height: 10, borderRadius: 2, background: "#FFFF00", flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: "#FFFF44", fontWeight: 700 }}>&gt; 2.0 m/s</span>
            </div>
            <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
              <div style={{
                width: 12, borderRadius: 3,
                background: "linear-gradient(to top, #0d0887, #6a00a8, #b12a90, #e16462, #fca636, #f0f921)",
                flexShrink: 0,
              }} />
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 9, color: "rgba(255,255,255,.7)", lineHeight: 1 }}>
                <span>2.0 m/s</span>
                <span>1.5 m/s</span>
                <span>1.0 m/s</span>
                <span>0.5 m/s</span>
                <span>0 m/s</span>
              </div>
            </div>
            <div style={{ color: "rgba(255,255,255,.35)", fontSize: 8, marginTop: 5 }}>© CMEMS</div>
          </div>
        )}

        {/* Solcelle polygon-kontroller */}
        {solcelleModus && (
          <div style={{
            position: "absolute", bottom: 60, left: "50%", transform: "translateX(-50%)",
            zIndex: 1000, display: "flex", gap: 8, alignItems: "center",
            background: "rgba(10,31,69,.95)", borderRadius: 10, padding: "10px 16px",
            boxShadow: "0 4px 20px rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.15)",
          }}>
            <span style={{ color: "rgba(255,255,255,.7)", fontSize: 12 }}>
              {solcelleVertices.length === 0
                ? "Klikk på kartet for å tegne polygon"
                : `${solcelleVertices.length} punkt${solcelleVertices.length > 1 ? "er" : ""} — ${solcelleVertices.length >= 3 ? "klar til å fullføre" : "legg til minst " + (3 - solcelleVertices.length) + " til"}`}
            </span>
            {solcelleVertices.length > 0 && (
              <button
                onClick={() => {
                  solcellePunktRef.current = solcellePunktRef.current.slice(0, -1);
                  setSolcelleVertices([...solcellePunktRef.current]);
                }}
                style={{ background: "rgba(255,255,255,.12)", color: "#fff", border: "none", padding: "5px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>
                ↩ Angre
              </button>
            )}
            {solcelleVertices.length >= 3 && (
              <button
                onClick={() => {
                  const coords = [...solcellePunktRef.current];
                  const areal  = geodesicArea(coords);
                  solcelleFerdigRef.current?.(coords, Math.round(areal));
                  solcellePunktRef.current = [];
                  setSolcelleVertices([]);
                }}
                style={{ background: "#D97706", color: "#fff", border: "none", padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                ☀️ Fullfør felt
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
