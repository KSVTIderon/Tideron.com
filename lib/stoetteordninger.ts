/**
 * Søkbar database av støtteordninger for elektrisitetsproduksjon,
 * innovasjon, nettbalansering og kritisk infrastruktur.
 *
 * Kategorier:
 *   produksjon    — tilskudd til fornybar energiproduksjon
 *   innovasjon    — FoU, demonstrasjon, teknologiutvikling
 *   nett          — nettbalansering, fleksibel kapasitet, demand response
 *   infrastruktur — kritisk infrastruktur, forsyningssikkerhet, energi i isolerte nett
 */

export type Kategori = "produksjon" | "innovasjon" | "nett" | "infrastruktur";
export type LandKode = "NO" | "EU" | "GB" | "DE" | "FR" | "US" | "INT";

export interface Stoetteordning {
  id: string;
  navn: string;
  kilde: string;          // Organisasjon/departement
  land: LandKode;
  kategori: Kategori[];
  typisk_prosent?: number; // Typisk dekningsgrad i % av CAPEX
  maks_belop_nok?: number; // Maksimalt tilskudd i NOK (ca.)
  beskrivelse: string;
  url: string;
}

export const STOETTEORDNINGER: Stoetteordning[] = [

  // ── Norge ─────────────────────────────────────────────────────────────────
  {
    id: "enova-fornybar",
    navn: "Enova — Fornybar energiproduksjon",
    kilde: "Enova SF",
    land: "NO",
    kategori: ["produksjon"],
    typisk_prosent: 35,
    maks_belop_nok: 100_000_000,
    beskrivelse: "Støtte til prosjekter som produserer fornybar energi, inkl. vannkraft, havenergi og andre innovative teknologier. Vurderes ut fra teknologimodenhet og kostnadseffektivitet.",
    url: "https://www.enova.no/bedrift/industri-og-anlegg/",
  },
  {
    id: "enova-nett",
    navn: "Enova — Fleksibelt og robust energisystem",
    kilde: "Enova SF",
    land: "NO",
    kategori: ["nett", "infrastruktur"],
    typisk_prosent: 30,
    maks_belop_nok: 50_000_000,
    beskrivelse: "Støtte til tiltak som bidrar til bedre utnyttelse av eksisterende nett, balansering av produksjon og forbruk, og økt forsyningssikkerhet i isolerte nett og øyer.",
    url: "https://www.enova.no/bedrift/",
  },
  {
    id: "enova-pilot",
    navn: "Enova — Pilot og demonstrasjon",
    kilde: "Enova SF",
    land: "NO",
    kategori: ["innovasjon"],
    typisk_prosent: 50,
    maks_belop_nok: 30_000_000,
    beskrivelse: "Støtte til pilot- og demonstrasjonsprosjekter for ny energiteknologi som ennå ikke er kommersielt etablert i Norge.",
    url: "https://www.enova.no/bedrift/",
  },
  {
    id: "in-miljo",
    navn: "Innovasjon Norge — Miljøteknologi",
    kilde: "Innovasjon Norge",
    land: "NO",
    kategori: ["innovasjon", "produksjon"],
    typisk_prosent: 35,
    maks_belop_nok: 15_000_000,
    beskrivelse: "Tilskudd til norske bedrifter som utvikler og kommersialiserer miljøteknologi, inkl. marin fornybar energi og hydrokinetiske systemer.",
    url: "https://www.innovasjonnorge.no/no/tjenester/miljobasert/miljoeteknologiordningen/",
  },
  {
    id: "in-innovasjon",
    navn: "Innovasjon Norge — Innovasjonstilskudd",
    kilde: "Innovasjon Norge",
    land: "NO",
    kategori: ["innovasjon"],
    typisk_prosent: 25,
    maks_belop_nok: 10_000_000,
    beskrivelse: "Bredt tilskudd til innovative prosjekter med internasjonalt vekstpotensial. Kan kombineres med lån og garantier fra IN.",
    url: "https://www.innovasjonnorge.no/no/tjenester/",
  },
  {
    id: "in-distrikts",
    navn: "Innovasjon Norge — Distriktsrettet risikolån",
    kilde: "Innovasjon Norge",
    land: "NO",
    kategori: ["infrastruktur", "produksjon"],
    typisk_prosent: 20,
    maks_belop_nok: 50_000_000,
    beskrivelse: "Lån og tilskudd til bedrifter i distrikts-Norge, særlig relevant for kystnære og isolerte lokalsamfunn som er avhengige av dieselgeneratorer.",
    url: "https://www.innovasjonnorge.no/no/tjenester/finansiering/distriktsrettet-risikolan/",
  },
  {
    id: "nfr-energix",
    navn: "Forskningsrådet — ENERGIX",
    kilde: "Norges forskningsråd",
    land: "NO",
    kategori: ["innovasjon"],
    typisk_prosent: 50,
    maks_belop_nok: 20_000_000,
    beskrivelse: "FoU-støtte til langsiktig forskning på fornybar energi, energisystemer og energieffektivisering. Krever FoU-samarbeid med forskningsinstitutt.",
    url: "https://www.forskningsradet.no/finansiering/energi/energix/",
  },
  {
    id: "nfr-gronnplattform",
    navn: "Forskningsrådet — Grønn plattform",
    kilde: "NFR / IN / Siva",
    land: "NO",
    kategori: ["innovasjon"],
    typisk_prosent: 50,
    maks_belop_nok: 50_000_000,
    beskrivelse: "Tverrfaglig satsing på grønn omstilling. Krav om konsortium med bedrifter og FoU-miljø. Egnet for systemleverandører av marin fornybar energi.",
    url: "https://www.forskningsradet.no/finansiering/brukerstyrt-forskning/gronn-plattform/",
  },

  // ── EU ────────────────────────────────────────────────────────────────────
  {
    id: "eu-innovation-large",
    navn: "EU Innovation Fund — Large Scale",
    kilde: "European Commission / CINEA",
    land: "EU",
    kategori: ["produksjon", "innovasjon"],
    typisk_prosent: 60,
    maks_belop_nok: 10_000_000_000,
    beskrivelse: "Største europeiske tilskuddsordning for innovative lavkarbonteknologier. Over €1M CAPEX. Finansierer opp til 60% av ekstra investeringskostnader. Søknadsprosess to ganger per år.",
    url: "https://climate.ec.europa.eu/eu-action/eu-emissions-trading-system-eu-ets/innovation-fund_en",
  },
  {
    id: "eu-innovation-small",
    navn: "EU Innovation Fund — Small Scale",
    kilde: "European Commission / CINEA",
    land: "EU",
    kategori: ["produksjon", "innovasjon"],
    typisk_prosent: 60,
    maks_belop_nok: 50_000_000,
    beskrivelse: "Forenklet versjon av Innovation Fund for prosjekter under €7,5M CAPEX. Lavere administrativ byrde. Relevant for pilot- og demonstrasjonsprosjekter.",
    url: "https://climate.ec.europa.eu/eu-action/eu-emissions-trading-system-eu-ets/innovation-fund_en",
  },
  {
    id: "horizon-europe",
    navn: "Horizon Europe — Klima, energi og mobilitet",
    kilde: "European Commission / UKRI",
    land: "EU",
    kategori: ["innovasjon"],
    typisk_prosent: 70,
    maks_belop_nok: 30_000_000,
    beskrivelse: "EUs rammeprogram for forskning og innovasjon. Klynge 5 dekker fornybar energi, havenergi og energisystemintegrasjon. Inntil 100% for non-profit; 70% for bedrifter.",
    url: "https://research-and-innovation.ec.europa.eu/funding/funding-opportunities/funding-programmes-and-open-calls/horizon-europe_en",
  },
  {
    id: "eic-accelerator",
    navn: "EIC Accelerator",
    kilde: "European Innovation Council",
    land: "EU",
    kategori: ["innovasjon"],
    typisk_prosent: 70,
    maks_belop_nok: 170_000_000,
    beskrivelse: "Kombinerer tilskudd (opp til €2,5M) med egenkapitalinvestering (opp til €15M) for vekstbedrifter. Svært konkurranseutsatt (~5% akseptrate). Relevant for TRL 5-8.",
    url: "https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en",
  },
  {
    id: "life-programme",
    navn: "LIFE Programme — Clean Energy Transition",
    kilde: "European Commission / CINEA",
    land: "EU",
    kategori: ["produksjon", "innovasjon"],
    typisk_prosent: 55,
    maks_belop_nok: 50_000_000,
    beskrivelse: "EUs finansieringsinstrument for miljø og klima. Prosjekter innen ren energi, energieffektivitet og demonstrasjon av innovative løsninger.",
    url: "https://cinea.ec.europa.eu/programmes/life_en",
  },
  {
    id: "cef-energy",
    navn: "CEF — Connecting Europe Facility Energy",
    kilde: "European Commission / CINEA",
    land: "EU",
    kategori: ["nett", "infrastruktur"],
    typisk_prosent: 50,
    maks_belop_nok: 5_000_000_000,
    beskrivelse: "Støtte til infrastruktur av europeisk interesse, inkl. smart nett, energilagring og offshore energiinfrastruktur. Primært for prosjekter på PCI/IPCEI-listen.",
    url: "https://cinea.ec.europa.eu/programmes/cef_en",
  },
  {
    id: "erdf",
    navn: "ERDF — European Regional Development Fund",
    kilde: "EU / Nasjonale myndigheter",
    land: "EU",
    kategori: ["produksjon", "infrastruktur"],
    typisk_prosent: 40,
    maks_belop_nok: 500_000_000,
    beskrivelse: "Regionalt utviklingsfond med fokus på å redusere ulikheter. Støtter fornybar energi og klimatilpasning i mindre utviklede regioner. Midler tildeles via nasjonale programmer.",
    url: "https://ec.europa.eu/regional_policy/funding/erdf_en",
  },
  {
    id: "just-transition",
    navn: "Just Transition Fund (JTF)",
    kilde: "EU / Nasjonale myndigheter",
    land: "EU",
    kategori: ["produksjon", "innovasjon"],
    typisk_prosent: 60,
    maks_belop_nok: 2_000_000_000,
    beskrivelse: "Støtter regioner med tunge fossile industrier i omstilling til grønn økonomi. Inkl. fornybar energi, ren teknologi og ny næringsvirksomhet.",
    url: "https://ec.europa.eu/regional_policy/funding/just-transition-fund_en",
  },
  {
    id: "interreg-npa",
    navn: "Interreg Northern Periphery & Arctic",
    kilde: "Interreg",
    land: "EU",
    kategori: ["innovasjon", "infrastruktur"],
    typisk_prosent: 60,
    maks_belop_nok: 20_000_000,
    beskrivelse: "Transnasjonalt samarbeidsprogram for arktiske og perifere regioner, inkl. Nord-Norge, Island, Færøyene, Grønland. Støtter fornybar energi og robuste energisystemer i isolerte lokalsamfunn.",
    url: "https://www.interreg-npa.eu/",
  },
  {
    id: "interreg-northsea",
    navn: "Interreg North Sea Region",
    kilde: "Interreg",
    land: "EU",
    kategori: ["innovasjon", "nett"],
    typisk_prosent: 60,
    maks_belop_nok: 10_000_000,
    beskrivelse: "Samarbeid om bærekraftig vann og energiforvaltning i Nordsjøregionen. Havenergi, tidevannskraft og nettintegrasjon er relevante temaer.",
    url: "https://www.northsearegion.eu/",
  },
  {
    id: "nordforsk",
    navn: "NordForsk — Nordic Energy Research",
    kilde: "NordForsk / Nordic Energy Research",
    land: "EU",
    kategori: ["innovasjon"],
    typisk_prosent: 50,
    maks_belop_nok: 15_000_000,
    beskrivelse: "Nordisk samarbeidsprogram for energiforskning. Støtter tverrfaglige konsortier på tvers av nordiske land. Særlig relevant for nordisk energisystem og havenergi.",
    url: "https://www.nordicenergy.org/",
  },
  {
    id: "nib-loans",
    navn: "Nordic Investment Bank — Green Loans",
    kilde: "Nordic Investment Bank (NIB)",
    land: "EU",
    kategori: ["produksjon", "infrastruktur"],
    typisk_prosent: 50,
    maks_belop_nok: 5_000_000_000,
    beskrivelse: "NIB finansierer prosjekter som styrker produktivitet og miljø i Norden og nærområdene. Grønne lån til fornybar energi og infrastruktur på gunstige betingelser.",
    url: "https://www.nib.int/financing/products/loans",
  },

  // ── Storbritannia ─────────────────────────────────────────────────────────
  {
    id: "innovate-uk",
    navn: "Innovate UK — Net Zero Living",
    kilde: "Innovate UK / UKRI",
    land: "GB",
    kategori: ["innovasjon", "produksjon"],
    typisk_prosent: 60,
    maks_belop_nok: 20_000_000,
    beskrivelse: "Britisk innovasjonstilskudd for netto nullteknologier, inkl. marine fornybare energikilder. Ulike programmer med løpende søknadsfrister.",
    url: "https://www.ukri.org/councils/innovate-uk/",
  },
  {
    id: "uk-contracts-for-difference",
    navn: "UK Contracts for Difference (CfD)",
    kilde: "DESNZ (UK Dept. Energy Security)",
    land: "GB",
    kategori: ["produksjon"],
    typisk_prosent: 0,
    beskrivelse: "Britisk støttemekanisme der produsenter garanteres en fast strømpris (strike price) over 15 år, som beskytter mot markedsrisiko. Ikke direkte CAPEX-støtte, men viktig for bankability.",
    url: "https://www.gov.uk/government/collections/contracts-for-difference",
  },

  // ── Tyskland ──────────────────────────────────────────────────────────────
  {
    id: "kfw-erneuerbare",
    navn: "KfW — Renewable Energies",
    kilde: "KfW Bank",
    land: "DE",
    kategori: ["produksjon"],
    typisk_prosent: 100,
    maks_belop_nok: 1_000_000_000,
    beskrivelse: "Gunstige lån (ikke tilskudd) fra KfW for fornybar energiproduksjon. Lav rente og lang løpetid. Kan dekke hele investeringen. Tilgjengelig via partnerbanker.",
    url: "https://www.kfw.de/inlandsfoerderung/Unternehmen/Energie-Umwelt/",
  },
  {
    id: "bmwk-forschung",
    navn: "BMWK — Forschungsförderung Energie",
    kilde: "Bundesministerium für Wirtschaft und Klimaschutz",
    land: "DE",
    kategori: ["innovasjon"],
    typisk_prosent: 50,
    maks_belop_nok: 50_000_000,
    beskrivelse: "Tysk FoU-støtte til energiteknologi, inkl. marine fornybare energikilder, energisystemer og nettintegrasjon. Krav om tysk forankring.",
    url: "https://www.bmwk.de/Redaktion/DE/Dossier/energieforschung.html",
  },

  // ── Frankrike ─────────────────────────────────────────────────────────────
  {
    id: "ademe-france",
    navn: "ADEME — Fonds Chaleur & Énergies Renouvelables",
    kilde: "ADEME (Agence de la transition écologique)",
    land: "FR",
    kategori: ["produksjon"],
    typisk_prosent: 40,
    maks_belop_nok: 100_000_000,
    beskrivelse: "Fransk støtte til fornybar energiproduksjon og varme. Inkl. demonstration av nye teknologier i marin energi. Krav om prosjektbase i Frankrike.",
    url: "https://www.ademe.fr/nos-missions/financer-la-transition/",
  },

  // ── USA ───────────────────────────────────────────────────────────────────
  {
    id: "doe-ooe",
    navn: "DOE — Water Power Technologies Office",
    kilde: "U.S. Dept. of Energy",
    land: "US",
    kategori: ["innovasjon", "produksjon"],
    typisk_prosent: 50,
    maks_belop_nok: 200_000_000,
    beskrivelse: "Amerikansk FoU og demonstrasjonsstøtte til marin energi (tidal, bølge, elvestrom). Aktiv satsing på tidlig-TRL-teknologier for å bygge ned kostnadene.",
    url: "https://www.energy.gov/eere/water/water-power-technologies-office",
  },
  {
    id: "usaid-dfc",
    navn: "DFC / USAID — Power Africa",
    kilde: "U.S. International Development Finance Corporation",
    land: "US",
    kategori: ["produksjon", "infrastruktur"],
    typisk_prosent: 30,
    maks_belop_nok: 2_000_000_000,
    beskrivelse: "Risikokapital, garantier og forsikring for energiprosjekter i Afrika og andre fremvoksende markeder. Sikter mot energitilgang for u-elektrifiserte samfunn.",
    url: "https://www.dfc.gov/our-work/energy",
  },

  // ── Internasjonalt ────────────────────────────────────────────────────────
  {
    id: "ebrd-green",
    navn: "EBRD — Green Economy Financing Facility",
    kilde: "European Bank for Reconstruction and Development",
    land: "INT",
    kategori: ["produksjon", "infrastruktur"],
    typisk_prosent: 15,
    maks_belop_nok: 5_000_000_000,
    beskrivelse: "EBRD kombinerer lån med tilskudd (incentive payments) for grønne investeringer i Europa og naboland. Aktiv i energisektoren i Sentral- og Øst-Europa, Kaukasus og MENA.",
    url: "https://www.ebrd.com/what-we-do/sectors/energy/renewable-energy.html",
  },
  {
    id: "ifc-clean",
    navn: "IFC (World Bank) — Scaling Solar / Clean Energy",
    kilde: "International Finance Corporation",
    land: "INT",
    kategori: ["produksjon"],
    typisk_prosent: 20,
    maks_belop_nok: 10_000_000_000,
    beskrivelse: "IFC finansierer fornybar energi i fremvoksende markeder med lån, aksjer og garantier. Scaling Solar er raskeste vei til finansiering for solenergi; tilsvarende program finnes for marin energi.",
    url: "https://www.ifc.org/en/sectors/climate-and-environmental-sustainability",
  },
  {
    id: "gcf",
    navn: "Green Climate Fund (GCF)",
    kilde: "Green Climate Fund (FN)",
    land: "INT",
    kategori: ["produksjon", "infrastruktur"],
    typisk_prosent: 40,
    maks_belop_nok: 20_000_000_000,
    beskrivelse: "FNs største klimafond. Støtter fornybar energi og klimatilpasning i utviklingsland. Krever akkreditert enhet (f.eks. NORFUND eller NIB) som søker på vegne av prosjektet.",
    url: "https://www.greenclimate.fund/",
  },
  {
    id: "norfund",
    navn: "Norfund — Renewable Energy",
    kilde: "Norfund (Statens investeringsfond for næringsvirksomhet)",
    land: "INT",
    kategori: ["produksjon"],
    typisk_prosent: 40,
    maks_belop_nok: 2_000_000_000,
    beskrivelse: "Norsk statlig investeringsfond for utviklingsland. Investerer i egenkapital og lån for fornybar energi i Afrika, Asia og Latin-Amerika. Særlig relevant for off-grid-prosjekter.",
    url: "https://www.norfund.no/investments/renewable-energy/",
  },
  {
    id: "norad-energy",
    navn: "NORAD — Energy+ Initiative",
    kilde: "NORAD / UD",
    land: "INT",
    kategori: ["produksjon", "infrastruktur"],
    typisk_prosent: 30,
    maks_belop_nok: 500_000_000,
    beskrivelse: "Norsk bistandsprogram for energitilgang og ren energi i fattige land. Fokus på off-grid og mini-grid i isolerte samfunn — tett alignment med Tiderons niche.",
    url: "https://www.norad.no/en/front/thematic-areas/energy/",
  },
  {
    id: "adb-clean",
    navn: "Asian Development Bank — Clean Energy",
    kilde: "Asian Development Bank",
    land: "INT",
    kategori: ["produksjon", "infrastruktur"],
    typisk_prosent: 25,
    maks_belop_nok: 10_000_000_000,
    beskrivelse: "ADB finansierer fornybar energi og energiinfrastruktur i Asia og Stillehavet. Grantmekanisme for minst utviklede land; lån og garantier for øvrige.",
    url: "https://www.adb.org/sectors/energy/main",
  },
  {
    id: "afdb-energy",
    navn: "African Development Bank — New Deal on Energy",
    kilde: "African Development Bank",
    land: "INT",
    kategori: ["produksjon", "infrastruktur"],
    typisk_prosent: 30,
    maks_belop_nok: 5_000_000_000,
    beskrivelse: "AfDB sikter mot universell energitilgang i Afrika innen 2030. Støtter mini-grid og off-grid løsninger for rurale og isolerte samfunn, inkl. øyer med dieselgeneratorer.",
    url: "https://www.afdb.org/en/topics-and-sectors/sectors/energy",
  },
  {
    id: "cif-climate",
    navn: "Climate Investment Funds (CIF)",
    kilde: "Climate Investment Funds",
    land: "INT",
    kategori: ["produksjon", "innovasjon"],
    typisk_prosent: 25,
    maks_belop_nok: 10_000_000_000,
    beskrivelse: "Konsorsiefond administrert av MDB-er (Verdensbanken, ADB m.fl.). CTF og SREP-fondene er relevante for fornybar energi i utviklingsland.",
    url: "https://www.climateinvestmentfunds.org/",
  },
  {
    id: "ocean-energy-europe",
    navn: "Ocean Energy Europe — Policy & Funding",
    kilde: "Ocean Energy Europe (bransjeorg.)",
    land: "EU",
    kategori: ["produksjon", "innovasjon"],
    beskrivelse: "Ikke en tilskuddsordning, men et navigeringsverktøy for å finne EU-finansiering til marin energi. Oversikt over aktuelle calls og programmer.",
    url: "https://www.oceanenergy-europe.eu/oe-policy/funding/",
  },
];

/** Søk i støtteordninger basert på fritekst og/eller kategori */
export function sokStoetteordninger(
  query: string,
  kategorier?: Kategori[],
): Stoetteordning[] {
  const q = query.toLowerCase().trim();
  return STOETTEORDNINGER.filter(s => {
    const katMatch = !kategorier || kategorier.length === 0
      || kategorier.some(k => s.kategori.includes(k));
    if (!katMatch) return false;
    if (!q) return true;
    return (
      s.navn.toLowerCase().includes(q) ||
      s.kilde.toLowerCase().includes(q) ||
      s.beskrivelse.toLowerCase().includes(q) ||
      s.land.toLowerCase().includes(q)
    );
  });
}

export const KATEGORI_LABEL: Record<Kategori, string> = {
  produksjon:    "⚡ Produksjon",
  innovasjon:    "🔬 Innovasjon / FoU",
  nett:          "🔌 Nettbalansering",
  infrastruktur: "🏗 Kritisk infrastruktur",
};

export const LAND_LABEL: Record<LandKode, string> = {
  NO:  "🇳🇴 Norge",
  EU:  "🇪🇺 EU / EØS",
  GB:  "🇬🇧 Storbritannia",
  DE:  "🇩🇪 Tyskland",
  FR:  "🇫🇷 Frankrike",
  US:  "🇺🇸 USA",
  INT: "🌍 Internasjonalt",
};
