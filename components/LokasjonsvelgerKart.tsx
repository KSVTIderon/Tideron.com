"use client";
import { useEffect, useRef } from "react";

interface Props {
  lat: number | null;
  lon: number | null;
  onLokasjonValgt: (lat: number, lon: number) => void;
  height?: number;
}

export default function LokasjonsvelgerKart({ lat, lon, onLokasjonValgt, height = 300 }: Props) {
  const divRef      = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<any>(null);
  const markerRef   = useRef<any>(null);
  const plassRef    = useRef<((lat: number, lon: number) => void) | null>(null);
  // Keep callback fresh without remounting
  const cbRef       = useRef(onLokasjonValgt);
  cbRef.current     = onLokasjonValgt;

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;

    import("leaflet").then(L => {
      if (!divRef.current) return;

      if (!document.getElementById("leaflet-css-lokasjon")) {
        const link = document.createElement("link");
        link.id   = "leaflet-css-lokasjon";
        link.rel  = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      const startLat  = lat ?? 65.5;
      const startLon  = lon ?? 14.5;
      const startZoom = lat ? 13 : 5;

      const map = (L as any).map(divRef.current, {
        center: [startLat, startLon],
        zoom: startZoom,
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;

      (L as any).tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const lagIcon = () => (L as any).divIcon({
        html: `<div style="
          width:24px;height:24px;border-radius:50%;
          background:#0F2A5A;border:3px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,.45);
          cursor:grab;
        "></div>`,
        className: "",
        iconAnchor: [12, 12],
        iconSize: [24, 24],
      });

      const plassMarkør = (mlat: number, mlon: number) => {
        if (markerRef.current) {
          markerRef.current.setLatLng([mlat, mlon]);
        } else {
          const m = (L as any).marker([mlat, mlon], { icon: lagIcon(), draggable: true }).addTo(map);
          markerRef.current = m;
          m.on("dragend", () => {
            const pos = m.getLatLng();
            cbRef.current(pos.lat, pos.lng);
          });
        }
      };
      plassRef.current = plassMarkør;

      if (lat && lon) plassMarkør(lat, lon);

      map.on("click", (e: any) => {
        plassMarkør(e.latlng.lat, e.latlng.lng);
        cbRef.current(e.latlng.lat, e.latlng.lng);
      });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        plassRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brukMinPosisjon = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        cbRef.current(latitude, longitude);
        if (mapRef.current) mapRef.current.setView([latitude, longitude], 14);
        plassRef.current?.(latitude, longitude);
      },
      () => alert("Kunne ikke hente posisjon. Sjekk at nettleseren har tilgang."),
    );
  };

  return (
    <div className="space-y-2">
      <div
        ref={divRef}
        style={{
          height,
          width: "100%",
          borderRadius: 10,
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          background: "#f8fafc",
        }}
      />
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-400">
          Klikk på kartet eller dra markøren for å sette posisjon
        </p>
        <button
          type="button"
          onClick={brukMinPosisjon}
          className="text-xs text-[#0F2A5A] hover:underline flex items-center gap-1"
        >
          <span>📍</span> Bruk min posisjon
        </button>
      </div>
    </div>
  );
}
