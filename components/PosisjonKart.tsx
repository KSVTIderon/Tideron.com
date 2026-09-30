"use client";
import { useEffect, useRef } from "react";

interface Props {
  lat: number | null;
  lon: number | null;
  onChange: (lat: number, lon: number) => void;
  height?: string;
}

export default function PosisjonKart({ lat, lon, onChange, height = "240px" }: Props) {
  const mapRef    = useRef<HTMLDivElement>(null);
  const mapInst   = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;

    import("leaflet").then((L) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const startLat = lat ?? 65;
      const startLon = lon ?? 14;
      const startZoom = lat ? 10 : 5;

      const map = L.map(mapRef.current!, { zoomControl: true }).setView([startLat, startLon], startZoom);
      mapInst.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        subdomains: "abcd", maxZoom: 19,
      }).addTo(map);

      // Plasser marker hvis koordinater allerede finnes
      if (lat && lon) {
        markerRef.current = L.marker([lat, lon], { draggable: true }).addTo(map);
        markerRef.current.on("dragend", () => {
          const ll = markerRef.current.getLatLng();
          onChange(ll.lat, ll.lng);
        });
      }

      // Klikk setter/flytter marker
      map.on("click", (e: any) => {
        const { lat: clickLat, lng: clickLon } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([clickLat, clickLon]);
        } else {
          markerRef.current = L.marker([clickLat, clickLon], { draggable: true }).addTo(map);
          markerRef.current.on("dragend", () => {
            const ll = markerRef.current.getLatLng();
            onChange(ll.lat, ll.lng);
          });
        }
        onChange(clickLat, clickLon);
      });
    });

    return () => { mapInst.current?.remove(); mapInst.current = null; markerRef.current = null; };
  }, []);

  // Flytt marker eksternt (f.eks. bruker skriver i tekstfelt)
  useEffect(() => {
    if (!mapInst.current) return;
    import("leaflet").then((L) => {
      if (!lat || !lon) return;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lon]);
      } else {
        markerRef.current = L.marker([lat, lon], { draggable: true }).addTo(mapInst.current);
        markerRef.current.on("dragend", () => {
          const ll = markerRef.current.getLatLng();
          onChange(ll.lat, ll.lng);
        });
      }
    });
  }, [lat, lon]);

  return (
    <>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
      <div ref={mapRef} style={{ height, width: "100%", cursor: "crosshair" }} />
    </>
  );
}
