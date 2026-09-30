"use client";
import { useEffect, useRef } from "react";

export interface RotorKartData {
  lat: number;
  lon: number;
  modell: string;
  kw?: number | null;
  diameter_m?: number | null;
  lengde_m?: number | null;
  hoyde_m?: number | null;
  bredde_m?: number | null;
  dybde_m?: number | null;
  rotor_type?: string | null;
}

export interface KabelKartData {
  waypoints: { lat: number; lon: number }[];
  type?: string | null;
  navn?: string | null;
}

interface Props {
  rotorer: RotorKartData[];
  kabler?: KabelKartData[];
  centerLat: number;
  centerLon: number;
  height?: number;
  /**
   * true  = vis rotorformer (sirkler med faktisk diameter) + nummererte markører + kabler
   * false = rent bunnforhold-kart med lett dybde-overlay
   */
  visFormer?: boolean;
}

function rotorDiam(r: RotorKartData): number {
  const isV = r.rotor_type === "v-rotor";
  if (isV) {
    const d = +(r.dybde_m ?? 40), b = +(r.bredde_m ?? 20);
    return Math.sqrt((b / 2) ** 2 + d ** 2) * 2;
  }
  if (r.lengde_m && r.hoyde_m) {
    return 2 * Math.sqrt(+(r.lengde_m) * +(r.hoyde_m) / Math.PI);
  }
  return +(r.diameter_m ?? 3.05);
}

function kabelFarge(type?: string | null): string {
  if (type === "DC") return "#7C3AED";
  if (type === "lavspent") return "#059669";
  return "#2563EB"; // AC / default
}

export default function RapportKart({
  rotorer,
  kabler = [],
  centerLat,
  centerLon,
  height = 520,
  visFormer = true,
}: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;

    import("leaflet").then(L => {
      if (!divRef.current) return;

      if (!document.getElementById("leaflet-css-rapport")) {
        const link = document.createElement("link");
        link.id = "leaflet-css-rapport";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      const map = (L as any).map(divRef.current, {
        center: [centerLat, centerLon],
        zoom: 14,
        zoomControl: true,
        attributionControl: true,
        dragging: true,
        touchZoom: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        boxZoom: true,
        keyboard: true,
      });
      mapRef.current = map;

      // ── Base OpenStreetMap (brukes i begge modi) ───────────────────────────
      (L as any).tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      if (!visFormer) {
        // ── Bunnforhold-modus: lett dybde-overlay fra Kartverket ───────────────
        (L as any).tileLayer.wms("https://openwms.statkart.no/skwms1/wms.sjo_dybde", {
          layers: "sjo_dybde",
          format: "image/png",
          transparent: true,
          opacity: 0.55,
          attribution: "© Kartverket",
        }).addTo(map);

        // Rotor-posisjoner som enkle punkt
        rotorer.forEach((r, i) => {
          (L as any).circleMarker([r.lat, r.lon], {
            radius: 6,
            color: "#fff",
            fillColor: "#0F2A5A",
            fillOpacity: 0.85,
            weight: 2,
          })
            .addTo(map)
            .bindTooltip(`#${i + 1} ${r.modell}`, { direction: "top" });
        });
      } else {
        // ── Rotorform-modus: kabler, rotorformer, markører ───────────────────

        // Kabler (polylinjer) — tegnes UNDER rotorformene
        kabler.forEach(k => {
          if (!k.waypoints || k.waypoints.length < 2) return;
          (L as any).polyline(
            k.waypoints.map(p => [p.lat, p.lon]),
            {
              color: kabelFarge(k.type),
              weight: 3,
              opacity: 0.8,
            }
          )
            .addTo(map)
            .bindTooltip(
              (k.navn ?? k.type ?? "Kabel") + (k.type ? ` (${k.type})` : ""),
              { direction: "top" }
            );
        });

        // Rotorformer (sirkler med faktisk diameter)
        rotorer.forEach((r, i) => {
          const nr = i + 1;
          const diam = rotorDiam(r);

          // Fysisk rotorflate
          (L as any).circle([r.lat, r.lon], {
            radius: diam / 2,
            color: "#1D4ED8",
            fillColor: "#3B82F6",
            fillOpacity: 0.55,
            weight: 3,
          }).addTo(map);

          // Eksklusjonssone (striplet, 1.5× diam)
          (L as any).circle([r.lat, r.lon], {
            radius: diam * 0.75,
            color: "#0F2A5A",
            fillColor: "transparent",
            fillOpacity: 0,
            weight: 1.5,
            dashArray: "6 4",
            opacity: 0.55,
          }).addTo(map);

          // Nummerert markør
          const icon = (L as any).divIcon({
            html: `<div style="
              width:24px;height:24px;border-radius:50%;
              background:#0F2A5A;border:2px solid #fff;
              color:#fff;font-size:10px;font-weight:700;
              font-family:Inter,sans-serif;
              display:flex;align-items:center;justify-content:center;
              box-shadow:0 1px 5px rgba(0,0,0,.5);
            ">${nr}</div>`,
            className: "",
            iconAnchor: [12, 12],
            iconSize: [24, 24],
          });

          (L as any)
            .marker([r.lat, r.lon], { icon })
            .addTo(map)
            .bindTooltip(
              `#${nr} ${r.modell}` +
              (r.kw ? ` · ${r.kw.toFixed(1)} kW` : "") +
              `<br>Ø ${diam.toFixed(1)} m`,
              { direction: "top" }
            );
        });
      }

      // ── Tilpass visning til rotorene ────────────────────────────────────────
      if (rotorer.length > 1) {
        const bounds = (L as any).latLngBounds(rotorer.map(r => [r.lat, r.lon]));
        map.fitBounds(bounds, { padding: [60, 60] });
      } else if (rotorer.length === 1) {
        map.setView([rotorer[0].lat, rotorer[0].lon], 15);
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={divRef}
      style={{
        height,
        width: "100%",
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        overflow: "hidden",
        background: "#f8fafc",
      }}
    />
  );
}
