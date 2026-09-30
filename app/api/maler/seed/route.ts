import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const STANDARD_MALER = [
  {
    navn: "NVE Konsesjonssøknad",
    type: "NVE",
    mal_innhold: `# NVE Konsesjonssøknad — Hydrokinetisk kraftanlegg

## 1. Søker
**Selskap:** {{selskap}}
**Organisasjonsnummer:** {{orgnr}}
**Kontaktperson:** {{kontakt}}

## 2. Prosjektbeskrivelse
Prosjektet gjelder installasjon av hydrokinetisk kraftanlegg i {{lokasjon}}.
Anlegget vil bestå av {{antall_rotorer}} rotor(er) med en total installert effekt på {{effekt_kw}} kW.

## 3. Tekniske data
- Rotortype: {{rotormodell}}
- Rotordiameter: {{diameter_m}} m
- Gjennomsnittlig strømhastighet: {{avg_velocity}} m/s
- Estimert årsproduksjon: {{arlig_kwh}} kWh

## 4. Miljøvurdering
Anlegget er ikke-demmende og påvirker ikke naturlig vannføring.

## 5. Tidsplan
Planlagt oppstart: {{oppstart}}
`,
  },
  {
    navn: "Statsforvalter — Miljøutredning",
    type: "Statsforvalter",
    mal_innhold: `# Søknad om dispensasjon — Miljøutredning

## Prosjekt
{{prosjektnavn}} — {{lokasjon}}

## Miljøpåvirkning
Hydrokinetiske anlegg er ikke-inngripende og krever ikke varige installasjoner i elvebunn eller sjøbunn.

## Konsekvenser for naturmangfold
Ingen kjente negative konsekvenser for fisk, fugl eller annet naturmangfold er identifisert.
`,
  },
  {
    navn: "Enova Støttesøknad",
    type: "Enova",
    mal_innhold: `# Enova — Søknad om støtte til fornybar energiproduksjon

## Prosjektsammendrag
{{prosjektnavn}} er et pilotprosjekt for hydrokinetisk energiproduksjon i {{lokasjon}}.

## Teknologi
Waterotor vertikalakse-rotorer — bevist teknologi testet 2011–2021 med Cp = 0,30.

## Økonomi
- CAPEX: {{capex}} kr
- LCOE: {{lcoe}} kr/kWh
- IRR: {{irr}} %
`,
  },
  {
    navn: "Innovasjon Norge — Pilottilskudd",
    type: "InnoNorge",
    mal_innhold: `# Innovasjon Norge — Søknad om pilottilskudd

## Prosjektnavn
{{prosjektnavn}}

## Innovasjonsinnhold
Prosjektet demonstrerer kommersiell levedyktighet for hydrokinetisk energiproduksjon i norske farvann.

## Budsjett
Total prosjektkostnad: {{capex}} kr
Søkt tilskudd: {{tilskudd}} kr
`,
  },
  {
    navn: "Kommunal byggetillatelse",
    type: "Kommune",
    mal_innhold: `# Søknad om byggetillatelse

## Tiltakshaver
{{selskap}}, org.nr. {{orgnr}}

## Tiltak
Installasjon av hydrokinetisk kraftanlegg (flytende/forankret) i {{lokasjon}}.
Anlegget er midlertidig/demonterbart og krever ikke permanent fundament.
`,
  },
];

export async function POST() {
  const { error } = await supabaseAdmin
    .from("application_templates")
    .upsert(STANDARD_MALER, { onConflict: "navn" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, antall: STANDARD_MALER.length });
}
