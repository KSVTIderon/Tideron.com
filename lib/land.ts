// Statisk landdata — matches countries-tabellen i Supabase
// Brukes klientsiden for dropdown uten DB-kall

export type Land = {
  code: string;
  name: string;
  name_en: string;
  currency_code: string;
  currency_symbol: string;
  flag: string;
  corporate_tax_rate: number;
  vat_rate: number;
  energy_subsidy_pct: number;
  feed_in_tariff: number | null;
  regulatory_notes: string | null;
};

export const LAND: Land[] = [
  // Norden
  { code:"NO", name:"Norge",            name_en:"Norway",              currency_code:"NOK", currency_symbol:"kr", flag:"🇳🇴", corporate_tax_rate:0.22,  vat_rate:0.25, energy_subsidy_pct:0.45, feed_in_tariff:null, regulatory_notes:"NVE-konsesjon påkrevd. Enova-støtte opptil 45% av CAPEX." },
  { code:"SE", name:"Sverige",          name_en:"Sweden",              currency_code:"SEK", currency_symbol:"kr", flag:"🇸🇪", corporate_tax_rate:0.206, vat_rate:0.25, energy_subsidy_pct:0.30, feed_in_tariff:null, regulatory_notes:"Energimyndigheten. Elcertifikat-støtte." },
  { code:"DK", name:"Danmark",          name_en:"Denmark",             currency_code:"DKK", currency_symbol:"kr", flag:"🇩🇰", corporate_tax_rate:0.22,  vat_rate:0.25, energy_subsidy_pct:0.30, feed_in_tariff:null, regulatory_notes:"Energistyrelsen." },
  { code:"FI", name:"Finland",          name_en:"Finland",             currency_code:"EUR", currency_symbol:"€",  flag:"🇫🇮", corporate_tax_rate:0.20,  vat_rate:0.24, energy_subsidy_pct:0.30, feed_in_tariff:null, regulatory_notes:"Energivirasto." },
  { code:"IS", name:"Island",           name_en:"Iceland",             currency_code:"ISK", currency_symbol:"kr", flag:"🇮🇸", corporate_tax_rate:0.20,  vat_rate:0.24, energy_subsidy_pct:0,    feed_in_tariff:null, regulatory_notes:"Orkustofnun." },
  // Engelskspråklige
  { code:"CA", name:"Canada",           name_en:"Canada",              currency_code:"CAD", currency_symbol:"$",  flag:"🇨🇦", corporate_tax_rate:0.265, vat_rate:0.05, energy_subsidy_pct:0.40, feed_in_tariff:null, regulatory_notes:"CER konsesjon. Investment Tax Credit 30%." },
  { code:"US", name:"USA",              name_en:"USA",                 currency_code:"USD", currency_symbol:"$",  flag:"🇺🇸", corporate_tax_rate:0.21,  vat_rate:0,    energy_subsidy_pct:0.30, feed_in_tariff:null, regulatory_notes:"FERC-konsesjon. ITC/PTC tilgjengelig." },
  { code:"GB", name:"Storbritannia",    name_en:"United Kingdom",      currency_code:"GBP", currency_symbol:"£",  flag:"🇬🇧", corporate_tax_rate:0.25,  vat_rate:0.20, energy_subsidy_pct:0.35, feed_in_tariff:null, regulatory_notes:"Environment Agency. CfD-auksjoner." },
  { code:"DE", name:"Tyskland",         name_en:"Germany",             currency_code:"EUR", currency_symbol:"€",  flag:"🇩🇪", corporate_tax_rate:0.30,  vat_rate:0.19, energy_subsidy_pct:0.30, feed_in_tariff:null, regulatory_notes:"BNetzA-regulert. EEG-støtte." },
  { code:"FR", name:"Frankrike",        name_en:"France",              currency_code:"EUR", currency_symbol:"€",  flag:"🇫🇷", corporate_tax_rate:0.25,  vat_rate:0.20, energy_subsidy_pct:0.30, feed_in_tariff:null, regulatory_notes:"CRE-regulert. CfD-auksjoner." },
  { code:"ES", name:"Spania",           name_en:"Spain",               currency_code:"EUR", currency_symbol:"€",  flag:"🇪🇸", corporate_tax_rate:0.25,  vat_rate:0.21, energy_subsidy_pct:0.30, feed_in_tariff:null, regulatory_notes:"CNMC-regulert. IDAE-støtte." },
  { code:"PT", name:"Portugal",         name_en:"Portugal",            currency_code:"EUR", currency_symbol:"€",  flag:"🇵🇹", corporate_tax_rate:0.21,  vat_rate:0.23, energy_subsidy_pct:0.30, feed_in_tariff:null, regulatory_notes:"DGEG-regulert." },
  { code:"IT", name:"Italia",           name_en:"Italy",               currency_code:"EUR", currency_symbol:"€",  flag:"🇮🇹", corporate_tax_rate:0.278, vat_rate:0.22, energy_subsidy_pct:0.30, feed_in_tariff:null, regulatory_notes:"ARERA-regulert. Incentivi FER." },
  { code:"NL", name:"Nederland",        name_en:"Netherlands",         currency_code:"EUR", currency_symbol:"€",  flag:"🇳🇱", corporate_tax_rate:0.258, vat_rate:0.21, energy_subsidy_pct:0.35, feed_in_tariff:null, regulatory_notes:"ACM-regulert. SDE++-støtte." },
  { code:"BE", name:"Belgia",           name_en:"Belgium",             currency_code:"EUR", currency_symbol:"€",  flag:"🇧🇪", corporate_tax_rate:0.25,  vat_rate:0.21, energy_subsidy_pct:0.30, feed_in_tariff:null, regulatory_notes:"CREG-regulert." },
  { code:"PL", name:"Polen",            name_en:"Poland",              currency_code:"PLN", currency_symbol:"zł", flag:"🇵🇱", corporate_tax_rate:0.19,  vat_rate:0.23, energy_subsidy_pct:0.25, feed_in_tariff:null, regulatory_notes:"URE-regulert. OZE-auksjon." },
  { code:"AU", name:"Australia",        name_en:"Australia",           currency_code:"AUD", currency_symbol:"$",  flag:"🇦🇺", corporate_tax_rate:0.30,  vat_rate:0.10, energy_subsidy_pct:0.30, feed_in_tariff:null, regulatory_notes:"ARENA-støtte. AEMO-regulert." },
  { code:"NZ", name:"New Zealand",      name_en:"New Zealand",         currency_code:"NZD", currency_symbol:"$",  flag:"🇳🇿", corporate_tax_rate:0.28,  vat_rate:0.15, energy_subsidy_pct:0.25, feed_in_tariff:null, regulatory_notes:"MfE-konsesjon. EECA-støtte." },
  { code:"IE", name:"Irland",           name_en:"Ireland",             currency_code:"EUR", currency_symbol:"€",  flag:"🇮🇪", corporate_tax_rate:0.125, vat_rate:0.23, energy_subsidy_pct:0.30, feed_in_tariff:null, regulatory_notes:"SEAI-støtte. RESS-auksjon." },
  // Afrika
  { code:"ZA", name:"Sør-Afrika",       name_en:"South Africa",        currency_code:"ZAR", currency_symbol:"R",  flag:"🇿🇦", corporate_tax_rate:0.27,  vat_rate:0.15, energy_subsidy_pct:0.35, feed_in_tariff:null, regulatory_notes:"NERSA-lisens. REIPPPP-program." },
  { code:"GH", name:"Ghana",            name_en:"Ghana",               currency_code:"GHS", currency_symbol:"₵",  flag:"🇬🇭", corporate_tax_rate:0.25,  vat_rate:0.15, energy_subsidy_pct:0.40, feed_in_tariff:null, regulatory_notes:"EC Ghana. GEDAP-støtte." },
  { code:"NG", name:"Nigeria",          name_en:"Nigeria",             currency_code:"NGN", currency_symbol:"₦",  flag:"🇳🇬", corporate_tax_rate:0.30,  vat_rate:0.075,energy_subsidy_pct:0.35, feed_in_tariff:null, regulatory_notes:"NERC-lisens. REF-støtte." },
  { code:"KE", name:"Kenya",            name_en:"Kenya",               currency_code:"KES", currency_symbol:"Ksh",flag:"🇰🇪", corporate_tax_rate:0.30,  vat_rate:0.16, energy_subsidy_pct:0.40, feed_in_tariff:null, regulatory_notes:"ERC Kenya. SREP-støtte." },
  { code:"TZ", name:"Tanzania",         name_en:"Tanzania",            currency_code:"TZS", currency_symbol:"TSh",flag:"🇹🇿", corporate_tax_rate:0.30,  vat_rate:0.18, energy_subsidy_pct:0.40, feed_in_tariff:null, regulatory_notes:"EWURA-lisens." },
  { code:"UG", name:"Uganda",           name_en:"Uganda",              currency_code:"UGX", currency_symbol:"USh",flag:"🇺🇬", corporate_tax_rate:0.30,  vat_rate:0.18, energy_subsidy_pct:0.40, feed_in_tariff:null, regulatory_notes:"ERA Uganda." },
  { code:"ET", name:"Etiopia",          name_en:"Ethiopia",            currency_code:"ETB", currency_symbol:"Br", flag:"🇪🇹", corporate_tax_rate:0.30,  vat_rate:0.15, energy_subsidy_pct:0.40, feed_in_tariff:null, regulatory_notes:"EEA-lisens." },
  { code:"SN", name:"Senegal",          name_en:"Senegal",             currency_code:"XOF", currency_symbol:"Fr", flag:"🇸🇳", corporate_tax_rate:0.30,  vat_rate:0.18, energy_subsidy_pct:0.40, feed_in_tariff:null, regulatory_notes:"CRSE-regulert." },
  // Asia/Stillehavet
  { code:"PH", name:"Filippinene",      name_en:"Philippines",         currency_code:"PHP", currency_symbol:"₱",  flag:"🇵🇭", corporate_tax_rate:0.25,  vat_rate:0.12, energy_subsidy_pct:0.50, feed_in_tariff:null, regulatory_notes:"ERC Philippines. FIT-program for fornybar." },
  { code:"ID", name:"Indonesia",        name_en:"Indonesia",           currency_code:"IDR", currency_symbol:"Rp", flag:"🇮🇩", corporate_tax_rate:0.22,  vat_rate:0.11, energy_subsidy_pct:0.45, feed_in_tariff:null, regulatory_notes:"MEMR-lisens. PLN-samarbeid." },
  { code:"BD", name:"Bangladesh",       name_en:"Bangladesh",          currency_code:"BDT", currency_symbol:"৳",  flag:"🇧🇩", corporate_tax_rate:0.275, vat_rate:0.15, energy_subsidy_pct:0.50, feed_in_tariff:null, regulatory_notes:"BERC-lisens. SREDA-støtte." },
  { code:"IN", name:"India",            name_en:"India",               currency_code:"INR", currency_symbol:"₹",  flag:"🇮🇳", corporate_tax_rate:0.25,  vat_rate:0.18, energy_subsidy_pct:0.40, feed_in_tariff:null, regulatory_notes:"CERC/SERC-regulert. MNRE-støtte." },
  { code:"VN", name:"Vietnam",          name_en:"Vietnam",             currency_code:"VND", currency_symbol:"₫",  flag:"🇻🇳", corporate_tax_rate:0.20,  vat_rate:0.10, energy_subsidy_pct:0.40, feed_in_tariff:null, regulatory_notes:"EVN-kontrakt. FIT tilgjengelig." },
  { code:"PG", name:"Papua Ny-Guinea",  name_en:"Papua New Guinea",    currency_code:"PGK", currency_symbol:"K",  flag:"🇵🇬", corporate_tax_rate:0.30,  vat_rate:0.10, energy_subsidy_pct:0.50, feed_in_tariff:null, regulatory_notes:"PPL-regulert. Høy dieselkostnad." },
  { code:"SB", name:"Salomonøyene",     name_en:"Solomon Islands",     currency_code:"SBD", currency_symbol:"$",  flag:"🇸🇧", corporate_tax_rate:0.30,  vat_rate:0.15, energy_subsidy_pct:0.50, feed_in_tariff:null, regulatory_notes:"SIEA-regulert. Off-grid marked." },
  { code:"FJ", name:"Fiji",             name_en:"Fiji",                currency_code:"FJD", currency_symbol:"$",  flag:"🇫🇯", corporate_tax_rate:0.20,  vat_rate:0.09, energy_subsidy_pct:0.50, feed_in_tariff:null, regulatory_notes:"FEA-regulert." },
  // Latin-Amerika
  { code:"CO", name:"Colombia",         name_en:"Colombia",            currency_code:"COP", currency_symbol:"$",  flag:"🇨🇴", corporate_tax_rate:0.35,  vat_rate:0.19, energy_subsidy_pct:0.40, feed_in_tariff:null, regulatory_notes:"CREG-regulert. Ley 1715 skattefordeler." },
  { code:"PE", name:"Peru",             name_en:"Peru",                currency_code:"PEN", currency_symbol:"S/", flag:"🇵🇪", corporate_tax_rate:0.295, vat_rate:0.18, energy_subsidy_pct:0.40, feed_in_tariff:null, regulatory_notes:"OSINERGMIN-regulert." },
  { code:"EC", name:"Ecuador",          name_en:"Ecuador",             currency_code:"USD", currency_symbol:"$",  flag:"🇪🇨", corporate_tax_rate:0.25,  vat_rate:0.12, energy_subsidy_pct:0.45, feed_in_tariff:null, regulatory_notes:"ARCONEL-lisens. USD-økonomi." },
  { code:"JM", name:"Jamaica",          name_en:"Jamaica",             currency_code:"JMD", currency_symbol:"$",  flag:"🇯🇲", corporate_tax_rate:0.25,  vat_rate:0.15, energy_subsidy_pct:0.50, feed_in_tariff:null, regulatory_notes:"OUR Jamaica. Høy dieselkostnad." },
  { code:"TT", name:"Trinidad og Tobago",name_en:"Trinidad and Tobago",currency_code:"TTD", currency_symbol:"$",  flag:"🇹🇹", corporate_tax_rate:0.30,  vat_rate:0.125,energy_subsidy_pct:0.40, feed_in_tariff:null, regulatory_notes:"RIC-regulert." },
];

export function finnLand(code: string): Land | undefined {
  return LAND.find(l => l.code === code);
}

export const NOK_LAND = LAND.find(l => l.code === "NO")!;
