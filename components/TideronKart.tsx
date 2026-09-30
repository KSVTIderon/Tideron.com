"use client";
import { useEffect, useRef, useCallback } from "react";

interface KartPunkt {
  id: string;
  navn: string;
  lat: number;
  lon: number;
  type: "stream_lead" | "planlagt" | "aktivt";
  diameter_m?: number;
  avg_velocity?: number;
  status?: string;
}

interface Props {
  punkter: KartPunkt[];
  height?: string;
  aktivPunktId?: string | null;
  onMarkerDragged?: (id: string, lat: number, lon: number) => void;
  onMarkerClick?: (id: string) => void;
}

export default function TideronKart({ punkter, height = "500px", aktivPunktId, onMarkerDragged, onMarkerClick }: Props) {
  const mapRef          = useRef<HTMLDivElement>(null);
  const mapInst         = useRef<any>(null);
  const markerMap       = useRef<Record<string, any>>({});
  // Ref slik at Leaflet-closure alltid kaller siste versjon av callback
  const onMarkerClickRef = useRef(onMarkerClick);
  useEffect(() => { onMarkerClickRef.current = onMarkerClick; }, [onMarkerClick]);

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;

    import("leaflet").then((L) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        zoomControl: false,
        touchZoom: true,
        dragging: true,
        scrollWheelZoom: true,
        ...(({ tap: true, tapTolerance: 15 }) as any), // mobil touch-støtte
      } as any).setView([65, 14], 5);
      mapInst.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors', subdomains: "abc", maxZoom: 19,
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);

      punkter.forEach((p) => {
        const ikon = p.type === "stream_lead" ? "🌊" : p.type === "planlagt" ? "🔵" : "🟢";
        const farge = p.type === "stream_lead" ? "#3B82F6" : p.type === "planlagt" ? "#1B4F8A" : "#059669";
        const draggable = p.type === "stream_lead";

        const divIkon = L.divIcon({
          html: `<div style="font-size:22px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));cursor:${draggable ? "grab" : "pointer"}">${ikon}</div>`,
          className: "", iconAnchor: [11, 11],
        });

        const marker = L.marker([p.lat, p.lon], { icon: divIkon, draggable }).addTo(map);

        // Bygg statisk popup-innhold (ingen knapp ennå)
        const popupEl = document.createElement("div");
        popupEl.style.cssText = "font-family:system-ui;min-width:160px";
        popupEl.innerHTML = `
          <div style="font-weight:700;color:#0F2A5A;font-size:13px;margin-bottom:3px">${p.navn}</div>
          <div style="color:#64748b;font-size:11px;margin-bottom:6px">${p.type.replace(/_/g," ")}</div>
          ${p.avg_velocity ? `<div style="font-family:monospace;color:#0ea5e9;font-size:12px;margin-bottom:6px">⚡ ${p.avg_velocity.toFixed(2)} m/s</div>` : ""}
          ${draggable ? `<div style="color:#94a3b8;font-size:10px">Dra for å flytte</div>` : ""}
        `;
        marker.bindPopup(popupEl, { offset: [0, -6] });

        // For prosjekt-markører: injiser navigeringsknapp FERSK hver gang popup åpner
        if (!draggable) {
          const prosjektId = p.id;
          marker.on("popupopen", () => {
            // Fjern gammel knapp om den finnes
            popupEl.querySelectorAll("button").forEach(b => b.remove());
            const btn = document.createElement("button");
            btn.textContent = "Åpne prosjekt →";
            btn.style.cssText = "margin-top:6px;padding:6px 14px;background:#0F2A5A;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;width:100%;display:block";
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              window.location.href = `/planner/prosjekter/${prosjektId}`;
            });
            popupEl.appendChild(btn);
          });
        }
        markerMap.current[p.id] = marker;

        if (draggable && onMarkerDragged) {
          marker.on("dragstart", () => marker.closePopup());
          marker.on("dragend", () => {
            const ll = marker.getLatLng();
            onMarkerDragged(p.id, ll.lat, ll.lng);
          });
        }

        if (!draggable) {
          marker.on("click", () => onMarkerClickRef.current?.(p.id));
        }

        if (p.diameter_m) {
          const sirkel = L.circle([p.lat, p.lon], {
            radius: p.diameter_m / 2, color: farge, fillColor: farge,
            fillOpacity: 0.35, weight: 2, opacity: 0,
          }).addTo(map);
          map.on("zoomend", () => {
            const show = map.getZoom() >= 14;
            sirkel.setStyle({ opacity: show ? 1 : 0, fillOpacity: show ? 0.35 : 0 });
          });
        }
      });

      if (punkter.length > 0) {
        const bounds = L.latLngBounds(punkter.map(p => [p.lat, p.lon]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
      }
    });

    return () => { mapInst.current?.remove(); mapInst.current = null; };
  }, []);

  // Pan + popup ved aktivt punkt
  useEffect(() => {
    if (!mapInst.current || !aktivPunktId) return;
    const marker = markerMap.current[aktivPunktId];
    if (!marker) return;
    mapInst.current.setView(marker.getLatLng(), Math.max(mapInst.current.getZoom(), 10), { animate: true });
    marker.openPopup();
  }, [aktivPunktId]);

  return (
    <>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
      <div ref={mapRef} style={{ height, width: "100%" }} />
    </>
  );
}
