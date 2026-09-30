"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Sprak = "nb" | "en" | "es";

const oversettelser = {
  nb: {
    // Nav
    "nav.prosjekter": "Prosjekter",
    "nav.portefolje": "Portefolje",
    "nav.kart": "Stromkart",
    "nav.streamleads": "StreamLeads",
    "nav.oppgaver": "Mine oppgaver",
    "nav.assistent": "Kunnskapsassistent",
    "nav.logg_ut": "Logg ut",
    "nav.plattform": "Plattform",

    // Prosjekt-tabs
    "tab.oversikt": "Oversikt",
    "tab.kart": "Kart",
    "tab.budsjett": "Budsjett",
    "tab.oppgaver": "Oppgaver",
    "tab.soknader": "Soknader",
    "tab.ppa": "PPA-kontrakter",
    "tab.om_logg": "O&M-logg",
    "tab.investor": "Investor pitch",
    "tab.innstillinger": "Innstillinger",
    "tab.parametre": "Parametre",
    "tab.dokumenter": "Dokumenter",
    "tab.rotorer": "Rotorer",
    "tab.utstyr": "Utstyr",
    "tab.marked": "Lokalt energibehov",
    "tab.energibehov": "Lokalt energibehov",
    "tab.rapport": "Rapport",
    "tab.rapporter": "Rapporter",

    // Knapper
    "btn.lagre": "Lagre",
    "btn.avbryt": "Avbryt",
    "btn.legg_til": "+ Legg til",
    "btn.slett": "Slett",
    "btn.opprett": "Opprett",
    "btn.send": "Send",

    // Generelt
    "general.laster": "Laster...",
    "general.ingen_data": "Ingen data",
    "general.lagrer": "Lagrer...",

    // Budsjett
    "budsjett.tittel": "Rotorkonfigurasjon",
    "budsjett.modell": "Rotormodell",
    "budsjett.antall": "Antall rotorer",
    "budsjett.diameter": "Diameter",
    "budsjett.hastighet": "Avg. stromhastighet",
    "budsjett.total_effekt": "Total installert effekt",
    "budsjett.produksjon": "Estimert produksjon",
    "budsjett.lcoe": "LCOE",
    "budsjett.tilbakebetaling": "Tilbetalingstid",
    "budsjett.irr_for": "IRR (for skatt)",
    "budsjett.irr_etter": "IRR (etter skatt)",
    "budsjett.npv_for": "NPV for skatt (8%)",
    "budsjett.npv_etter": "NPV etter skatt (8%)",
    "budsjett.capex": "CAPEX",
    "budsjett.lagre_konfig": "Lagre konfigurasjon",
    "budsjett.ppa_pris": "PPA-pris (kr/kWh)",
    "budsjett.arlig_inntekt": "Arlig inntekt",
    "budsjett.arlig_opex": "Arlig OPEX (kr)",

    // Innstillinger
    "innstillinger.tittel": "Prosjektinformasjon",
    "innstillinger.land": "Land",
    "innstillinger.stadie": "Stadie",
    "innstillinger.del": "Del prosjekt",
    "innstillinger.inviter": "Inviter en ekstern part via e-post.",
    "innstillinger.epost": "E-postadresse",
    "innstillinger.tilgang": "Tilgangsniva",
    "innstillinger.send_invitasjon": "Send invitasjon",
    "innstillinger.invitasjoner": "Invitasjoner",

    // PPA
    "ppa.ny": "Ny kontrakt",
    "ppa.motpart": "Motpart",
    "ppa.pris": "Pris (kr/kWh)",
    "ppa.start": "Startdato",
    "ppa.slutt": "Sluttdato",
    "ppa.kwh": "Est. arlig kWh",
    "ppa.status": "Status",
    "ppa.notater": "Notater",

    // O&M
    "om.ny": "Ny loggforing",
    "om.dato": "Dato",
    "om.tittel": "Tittel",
    "om.type": "Type",
    "om.beskrivelse": "Beskrivelse",
    "om.kwh": "kWh produsert",
    "om.kostnad": "Kostnad (kr)",

    // Oversikt
    "oversikt.effekt": "Installert effekt",
    "oversikt.produksjon": "Arlig produksjon",
    "oversikt.lcoe": "LCOE",
    "oversikt.irr": "IRR",
    "oversikt.tilbakebetaling": "Tilbakebetaling",
    "oversikt.stadie": "Stadie",

    // Sprak
    "sprak.velg": "Sprak",
    "valuta.velg": "Valuta",
  },

  en: {
    // Nav
    "nav.prosjekter": "Projects",
    "nav.portefolje": "Portfolio",
    "nav.kart": "Current map",
    "nav.streamleads": "StreamLeads",
    "nav.oppgaver": "My tasks",
    "nav.assistent": "Knowledge assistant",
    "nav.logg_ut": "Sign out",
    "nav.plattform": "Platform",

    // Project tabs
    "tab.oversikt": "Overview",
    "tab.kart": "Map",
    "tab.budsjett": "Budget",
    "tab.oppgaver": "Tasks",
    "tab.soknader": "Applications",
    "tab.ppa": "PPA contracts",
    "tab.om_logg": "O&M log",
    "tab.investor": "Investor pitch",
    "tab.innstillinger": "Settings",
    "tab.parametre": "Parameters",
    "tab.dokumenter": "Documents",
    "tab.rotorer": "Rotors",
    "tab.utstyr": "Equipment",
    "tab.marked": "Local energy needs",
    "tab.energibehov": "Local energy needs",
    "tab.rapport": "Report",
    "tab.rapporter": "Reports",

    // Buttons
    "btn.lagre": "Save",
    "btn.avbryt": "Cancel",
    "btn.legg_til": "+ Add",
    "btn.slett": "Delete",
    "btn.opprett": "Create",
    "btn.send": "Send",

    // General
    "general.laster": "Loading...",
    "general.ingen_data": "No data",
    "general.lagrer": "Saving...",

    // Budget
    "budsjett.tittel": "Rotor configuration",
    "budsjett.modell": "Rotor model",
    "budsjett.antall": "Number of rotors",
    "budsjett.diameter": "Diameter",
    "budsjett.hastighet": "Avg. current velocity",
    "budsjett.total_effekt": "Total installed capacity",
    "budsjett.produksjon": "Estimated production",
    "budsjett.lcoe": "LCOE",
    "budsjett.tilbakebetaling": "Payback period",
    "budsjett.irr_for": "IRR (pre-tax)",
    "budsjett.irr_etter": "IRR (post-tax)",
    "budsjett.npv_for": "NPV pre-tax (8%)",
    "budsjett.npv_etter": "NPV post-tax (8%)",
    "budsjett.capex": "CAPEX",
    "budsjett.lagre_konfig": "Save configuration",
    "budsjett.ppa_pris": "PPA price (NOK/kWh)",
    "budsjett.arlig_inntekt": "Annual revenue",
    "budsjett.arlig_opex": "Annual OPEX (NOK)",

    // Settings
    "innstillinger.tittel": "Project information",
    "innstillinger.land": "Country",
    "innstillinger.stadie": "Stage",
    "innstillinger.del": "Share project",
    "innstillinger.inviter": "Invite an external party by email.",
    "innstillinger.epost": "Email address",
    "innstillinger.tilgang": "Access level",
    "innstillinger.send_invitasjon": "Send invitation",
    "innstillinger.invitasjoner": "Invitations",

    // PPA
    "ppa.ny": "New contract",
    "ppa.motpart": "Counterparty",
    "ppa.pris": "Price (NOK/kWh)",
    "ppa.start": "Start date",
    "ppa.slutt": "End date",
    "ppa.kwh": "Est. annual kWh",
    "ppa.status": "Status",
    "ppa.notater": "Notes",

    // O&M
    "om.ny": "New log entry",
    "om.dato": "Date",
    "om.tittel": "Title",
    "om.type": "Type",
    "om.beskrivelse": "Description",
    "om.kwh": "kWh produced",
    "om.kostnad": "Cost (NOK)",

    // Overview
    "oversikt.effekt": "Installed capacity",
    "oversikt.produksjon": "Annual production",
    "oversikt.lcoe": "LCOE",
    "oversikt.irr": "IRR",
    "oversikt.tilbakebetaling": "Payback",
    "oversikt.stadie": "Stage",

    // Language
    "sprak.velg": "Language",
    "valuta.velg": "Currency",
  },

  es: {
    // Nav
    "nav.prosjekter": "Proyectos",
    "nav.portefolje": "Cartera",
    "nav.kart": "Mapa de corrientes",
    "nav.streamleads": "StreamLeads",
    "nav.oppgaver": "Mis tareas",
    "nav.assistent": "Asistente de conocimiento",
    "nav.logg_ut": "Cerrar sesión",
    "nav.plattform": "Plataforma",

    // Pestañas de proyecto
    "tab.oversikt": "Resumen",
    "tab.kart": "Mapa",
    "tab.budsjett": "Presupuesto",
    "tab.oppgaver": "Tareas",
    "tab.soknader": "Solicitudes",
    "tab.ppa": "Contratos PPA",
    "tab.om_logg": "Registro O&M",
    "tab.investor": "Pitch de inversión",
    "tab.innstillinger": "Configuración",
    "tab.parametre": "Parámetros",
    "tab.dokumenter": "Documentos",
    "tab.rotorer": "Rotores",
    "tab.utstyr": "Equipamiento",
    "tab.marked": "Demanda energética local",
    "tab.energibehov": "Demanda energética local",
    "tab.rapport": "Informe",
    "tab.rapporter": "Informes",

    // Botones
    "btn.lagre": "Guardar",
    "btn.avbryt": "Cancelar",
    "btn.legg_til": "+ Añadir",
    "btn.slett": "Eliminar",
    "btn.opprett": "Crear",
    "btn.send": "Enviar",

    // General
    "general.laster": "Cargando...",
    "general.ingen_data": "Sin datos",
    "general.lagrer": "Guardando...",

    // Presupuesto
    "budsjett.tittel": "Configuración del rotor",
    "budsjett.modell": "Modelo de rotor",
    "budsjett.antall": "Número de rotores",
    "budsjett.diameter": "Diámetro",
    "budsjett.hastighet": "Velocidad promedio",
    "budsjett.total_effekt": "Capacidad instalada total",
    "budsjett.produksjon": "Producción estimada",
    "budsjett.lcoe": "LCOE",
    "budsjett.tilbakebetaling": "Período de retorno",
    "budsjett.irr_for": "TIR (antes de impuestos)",
    "budsjett.irr_etter": "TIR (después de impuestos)",
    "budsjett.npv_for": "VAN antes de impuestos (8%)",
    "budsjett.npv_etter": "VAN después de impuestos (8%)",
    "budsjett.capex": "CAPEX",
    "budsjett.lagre_konfig": "Guardar configuración",
    "budsjett.ppa_pris": "Precio PPA (NOK/kWh)",
    "budsjett.arlig_inntekt": "Ingresos anuales",
    "budsjett.arlig_opex": "OPEX anual (NOK)",

    // Configuración
    "innstillinger.tittel": "Información del proyecto",
    "innstillinger.land": "País",
    "innstillinger.stadie": "Etapa",
    "innstillinger.del": "Compartir proyecto",
    "innstillinger.inviter": "Invitar a un tercero por correo electrónico.",
    "innstillinger.epost": "Correo electrónico",
    "innstillinger.tilgang": "Nivel de acceso",
    "innstillinger.send_invitasjon": "Enviar invitación",
    "innstillinger.invitasjoner": "Invitaciones",

    // PPA
    "ppa.ny": "Nuevo contrato",
    "ppa.motpart": "Contraparte",
    "ppa.pris": "Precio (NOK/kWh)",
    "ppa.start": "Fecha de inicio",
    "ppa.slutt": "Fecha de fin",
    "ppa.kwh": "kWh anuales est.",
    "ppa.status": "Estado",
    "ppa.notater": "Notas",

    // O&M
    "om.ny": "Nuevo registro",
    "om.dato": "Fecha",
    "om.tittel": "Título",
    "om.type": "Tipo",
    "om.beskrivelse": "Descripción",
    "om.kwh": "kWh producidos",
    "om.kostnad": "Coste (NOK)",

    // Resumen
    "oversikt.effekt": "Capacidad instalada",
    "oversikt.produksjon": "Producción anual",
    "oversikt.lcoe": "LCOE",
    "oversikt.irr": "TIR",
    "oversikt.tilbakebetaling": "Retorno",
    "oversikt.stadie": "Etapa",

    // Idioma
    "sprak.velg": "Idioma",
    "valuta.velg": "Moneda",
  },
} as const;

type NokkelNb = keyof typeof oversettelser.nb;
type NokkelEn = keyof typeof oversettelser.en;
type NokkelEs = keyof typeof oversettelser.es;
export type I18nNokkel = NokkelNb & NokkelEn & NokkelEs;

interface I18nContextType {
  sprak: Sprak;
  settSprak: (s: Sprak) => void;
  t: (nokkel: I18nNokkel) => string;
}

const I18nContext = createContext<I18nContextType>({
  sprak: "nb",
  settSprak: () => {},
  t: (k) => k,
});

export function SprakProvider({ children }: { children: ReactNode }) {
  const [sprak, settSprakState] = useState<Sprak>("nb");

  useEffect(() => {
    const lagret = localStorage.getItem("tideron_sprak") as Sprak | null;
    if (lagret === "nb" || lagret === "en" || lagret === "es") settSprakState(lagret);
  }, []);

  const settSprak = (s: Sprak) => {
    settSprakState(s);
    localStorage.setItem("tideron_sprak", s);
  };

  const t = (nokkel: I18nNokkel): string => {
    return (oversettelser[sprak] as Record<string, string>)[nokkel] ?? nokkel;
  };

  return (
    <I18nContext.Provider value={{ sprak, settSprak, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() { return useContext(I18nContext); }

// ── Global valuta ─────────────────────────────────────────────────────────────

interface ValutaContextType {
  valuta: string;       // ISO currency code, e.g. "NOK", "USD", "EUR"
  settValuta: (v: string) => void;
}

const ValutaContext = createContext<ValutaContextType>({
  valuta: "NOK",
  settValuta: () => {},
});

export function ValutaProvider({ children }: { children: ReactNode }) {
  const [valuta, settValutaState] = useState("NOK");

  useEffect(() => {
    const lagret = localStorage.getItem("tideron_valuta");
    if (lagret) settValutaState(lagret);
  }, []);

  const settValuta = (v: string) => {
    settValutaState(v);
    localStorage.setItem("tideron_valuta", v);
  };

  return (
    <ValutaContext.Provider value={{ valuta, settValuta }}>
      {children}
    </ValutaContext.Provider>
  );
}

export function useValuta() { return useContext(ValutaContext); }
