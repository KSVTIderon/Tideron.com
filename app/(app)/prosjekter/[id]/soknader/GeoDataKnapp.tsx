"use client";
/**
 * GeoDataKnapp
 *
 * Knapp + statusvisning for automatisk henting av offentlig geodata
 * basert på rotor-koordinater. Kaller /api/geodata og returnerer
 * data via onData-callback.
 *
 * Brukes i MeldingOmKraftverkForm.
 */

import { useState } from "react";

export interface GeoDataResultat {
  koordinat: { lat: number; lon: number };
  nve: {
    vassdragsnr?: string;
    elvNavn?: string;
    nedborfeltKm2?: number;
    middelavrenningLsKm2?: number;
    middelvannforingLs?: number;
    lavvannforingLs?: number;
    storsteSlukevneLs?: number;
    feil?: string;
  };
  naturmangfold: {
    naturtyper: Array<{ navn: string; kategori: string; tilstand?: string; kilde: string }>;
    trueteArter: Array<{ navn: string; rodlistekategori: string }>;
    vernOmraader: Array<{ navn: string; type: string }>;
    oppsummering: string;
    feil?: string;
  };
  kulturminner: {
    kulturminner: Array<{ navn: string; type: string; periode?: string; askeladdenId?: string }>;
    oppsummering: string;
    feil?: string;
  };
  plandata: {
    arealformaal?: string;
    reguleringsplanNavn?: string;
    vernVassdrag?: boolean;
    nasjonaltLaksevassdrag?: boolean;
    oppsummering: string;
    feil?: string;
  };
}

interface Props {
  rotorKoordinater: Array<{ lat: number | null; lon: number | null }>;
  onData: (data: GeoDataResultat) => void;
}

export default function GeoDataKnapp({ rotorKoordinater, onData }: Props) {
  const [status, setStatus] = useState<"idle" | "henter" | "ok" | "feil">("idle");
  const [melding, setMelding] = useState("");

  const plasserteRotorer = rotorKoordinater.filter(r => r.lat && r.lon);
  const harKoordinater = plasserteRotorer.length > 0;

  const hent = async () => {
    if (!harKoordinater) return;
    setStatus("henter");
    setMelding("");

    // Bruk midtpunktet av alle plasserte rotorer
    const avgLat = plasserteRotorer.reduce((s, r) => s + r.lat!, 0) / plasserteRotorer.length;
    const avgLon = plasserteRotorer.reduce((s, r) => s + r.lon!, 0) / plasserteRotorer.length;

    try {
      const res = await fetch("/planner/api/geodata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: avgLat, lon: avgLon, radius_m: 500 }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data: GeoDataResultat = await res.json();
      onData(data);
      setStatus("ok");

      // Tell hva som ble funnet
      const funnet: string[] = [];
      if (data.nve.vassdragsnr) funnet.push(`vassdrag ${data.nve.vassdragsnr}`);
      if (data.nve.middelvannforingLs) funnet.push("hydrologi");
      if (data.naturmangfold.naturtyper.length > 0)
        funnet.push(`${data.naturmangfold.naturtyper.length} naturtype(r)`);
      if (data.kulturminner.kulturminner.length > 0)
        funnet.push(`${data.kulturminner.kulturminner.length} kulturminne(r)`);
      if (data.plandata.reguleringsplanNavn) funnet.push("reguleringsplan");

      setMelding(
        funnet.length > 0
          ? `Hentet: ${funnet.join(", ")}`
          : "Ingen registrerte data funnet i dette området",
      );
    } catch (e) {
      setStatus("feil");
      setMelding((e as Error).message);
    }
  };

  return (
    <div className="card p-4 flex items-start gap-3 bg-slate-50 border-slate-200">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-800 mb-0.5">
          🌍 Hent offentlig geodata automatisk
        </p>
        <p className="text-xs text-slate-500">
          NVE vassdrag · Naturbase · Riksantikvaren Askeladden · GeoNorge planregister
          {harKoordinater
            ? ` — basert på ${plasserteRotorer.length} rotor(er) i kartet`
            : " — legg til rotorer i kartet først"}
        </p>
        {melding && (
          <p
            className={`text-xs mt-1.5 font-medium ${
              status === "ok" ? "text-green-700" : "text-red-600"
            }`}
          >
            {status === "ok" ? "✓ " : "✗ "}{melding}
          </p>
        )}
      </div>
      <button
        onClick={hent}
        disabled={!harKoordinater || status === "henter"}
        className="btn-primary text-sm shrink-0 disabled:opacity-40"
      >
        {status === "henter" ? "Henter…" : "Hent data"}
      </button>
    </div>
  );
}
