import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import path from "path";
import fs from "fs";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PizZip = require("pizzip");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Docxtemplater = require("docxtemplater");

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { project_id, feltData } = body as {
    project_id: string;
    feltData: Record<string, string>;
  };

  if (!project_id) {
    return NextResponse.json({ error: "Mangler project_id" }, { status: 400 });
  }

  // Fetch project data to auto-fill fields
  const supabase = createClient();
  const [{ data: p }, { data: rotorer }, { data: stream }] = await Promise.all([
    supabase.from("projects").select("navn, sted").eq("id", project_id).single(),
    supabase.from("rotors").select("modell, diameter_m, lengde_m").eq("project_id", project_id),
    supabase
      .from("streams")
      .select("avg_velocity_m_s, bredde_m, stream_type")
      .eq("project_id", project_id)
      .single(),
  ]);

  if (!p) return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });

  // Parse kommune and fylke from p.sted  (format: "Bjordal, Høyanger, Vestland")
  const stedDeler = (p.sted ?? "").split(",").map((s: string) => s.trim());
  const kommuneNavn = stedDeler[1] ?? stedDeler[0] ?? "";
  const fylkeNavn = stedDeler[2] ?? "";

  // Compute technical values from rotors
  const antallRotorer = (rotorer ?? []).length;
  // Waterotor: effekt per rotor ≈ CP * 0.5 * rho * A * v^3, simplified from finans.ts
  const avgV = stream?.avg_velocity_m_s ?? 1.5;
  const rho = 1000;
  const CP = 0.42;
  const rotor = (rotorer ?? [])[0];
  const diameter = rotor?.diameter_m ?? 1.5;
  const lengde = rotor?.lengde_m ?? 3.0;
  const A = diameter * lengde;
  const effektPerRotor = CP * 0.5 * rho * A * Math.pow(avgV, 3); // W
  const totalEffektKw = (effektPerRotor * antallRotorer) / 1000;
  const arligProdGwh = ((totalEffektKw * 8760 * 0.45) / 1_000_000).toFixed(4);

  // Merge auto-computed values with user-provided feltData
  const data: Record<string, string> = {
    kraftverkNavn: p.navn ?? "Waterotor",
    elvNavn: stedDeler[0] ?? "",
    kommuneNavn,
    fylkeNavn,
    tiltakshaverNavn: "Tideron AS",
    tiltakshaverAdresse: "Ortnevik 3",
    tiltakshaverPostnr: "5962",
    tiltakshaverPoststed: "Bjordal",
    tiltakshaverTlf: "+47 905 39 965",
    tiltakshaverEpost: "ksv@tideron.com",
    installertEffektKw: `${totalEffektKw.toFixed(1)} kW`,
    arligProdGwh: `${arligProdGwh} GWh`,
    antallRoer: String(antallRotorer),
    lengdeBeroertElv: stream?.bredde_m ? `${(+stream.bredde_m * antallRotorer).toFixed(0)} m` : "",
    geografiskBeskrivelse: "",
    tiltaksBeskrivelse:
      `Tiltaket innebærer installasjon av ${antallRotorer} Waterotor-${rotor?.modell ?? ""}-rotorer i ${stedDeler[0] ?? "vassdraget"}. ` +
      `Waterotor er et kompakt helnedsenkbart strømaggregat som utnytter kinetisk energi i vannstrømmen uten inngrep i vassdragets naturlige forløp. ` +
      `Det benyttes ikke dam, inntaksmagasin eller rørgater. Rotorene plasseres på elvebunnen og festes i eksisterende substrat.`,
    vannforingsBeskrivelse:
      "Det planlegges ikke reguleringsmagasin, dam eller minstevannføring. " +
      "Tiltaket påvirker ikke vannstand oppstrøms, og det er ikke planlagt slipp av minstevannføring ettersom tiltaket ikke påvirker naturlig vannføring.",
    vannuttakMerknad: "",
    allmenneInteresserBeskrivelse:
      `Tiltaksområdet er lokalisert i ${kommuneNavn} kommune. Eksisterende bruk av vassdraget er kartlagt. ` +
      `Det er ikke registrert allmenne friluftslivsinteresser, fiske- eller ferdselstiltak i direkte berørt sone.`,
    dammKlassifisering: "Ikke aktuelt – tiltaket omfatter ingen dam eller trykkrør.",
    dammSkjema: "Ikke aktuelt.",
    tilleggsopplysninger: "Se vedlagte teknisk rapport og kart for mer informasjon.",
    grunneiereListe: "",
    // User-provided fields override auto-filled
    ...feltData,
  };

  // Load template
  const templatePath = path.join(process.cwd(), "public", "templates", "melding-om-kraftverk-template.docx");
  const templateBuf = fs.readFileSync(templatePath);

  const zip = new PizZip(templateBuf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
  });

  doc.render(data);

  const output = doc.getZip().generate({
    type: "nodebuffer",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  return new NextResponse(output, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="melding-om-kraftverk-${p.navn ?? project_id}.docx"`,
    },
  });
}
