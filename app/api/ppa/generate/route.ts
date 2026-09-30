import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import path from "path";
import fs from "fs";

// Build template variables from a contract row
function buildVars(c: Record<string, any>) {
  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("nb-NO") : "—";
  return {
    "SPV NAVN":                  c.spv_navn           ?? "",
    "SPV ORG.NR":                c.spv_org_nr         ?? "",
    "SPV ADRESSE":               c.spv_adresse        ?? "",
    "SPV KONTAKTPERSON":         c.spv_kontaktperson  ?? "",
    "SPV E-POST":                c.spv_epost          ?? "",
    "SPV TELEFON":               c.spv_telefon        ?? "",
    "KJØPER NAVN":               c.kjoper_navn        ?? c.motpart ?? "",
    "KJØPER ORG.NR":             c.kjoper_org_nr      ?? "",
    "KJØPER ADRESSE":            c.kjoper_adresse     ?? "",
    "KJØPER KONTAKTPERSON":      c.kjoper_kontaktperson ?? "",
    "KJØPER E-POST":             c.kjoper_epost       ?? "",
    "KJØPER TELEFON":            c.kjoper_telefon     ?? "",
    "STED":                      c.sted_signering     ?? "",
    "DATO FOR SIGNERING":        fmt(c.start_dato),
    "ANLEGGSNAVN/LOKASJON":      c.anleggsnavn        ?? "",
    "INSTALLERT EFFEKT KW":      String(c.installert_effekt_kw ?? ""),
    "ESTIMERT ÅRSPRODUKSJON KWH": String(c.estimert_arsprod_kwh ?? ""),
    "GSRN/MÅLEPUNKT-ID":         c.gsrn_maalepunkt_id ?? "",
    "MÅNEDLIG/KVARTALSVIS":      c.avregningsperiode  ?? "Månedlig",
    "FORVENTET COD-DATO":        fmt(c.forventet_cod_dato),
    "ANTALL":                    String(c.antall_ar   ?? ""),
    "PRIS NOK/KWH":              String(c.pris_kr_kwh ?? ""),
    "ÅR":                        String(c.antall_ar   ?? ""),
    "X":                         c.goo_eier           ?? "Selger",
    "SELGER/KJØPER":             c.goo_eier           ?? "Selger",
    "DATO FOR AVTALENS UTLØP":   fmt(c.avtalens_utlop_dato),
    "ANTALL ÅR":                 String(c.antall_ar   ?? ""),
    "VERNETING":                 c.sted_signering     ?? "Oslo",
    "TOKENS":                    "",
  };
}

export async function POST(req: NextRequest) {
  const { contract_id } = await req.json();
  if (!contract_id) return NextResponse.json({ error: "Mangler contract_id" }, { status: 400 });

  const supabase = createClient();
  const { data: c, error } = await supabase
    .from("ppa_contracts").select("*").eq("id", contract_id).single();
  if (error || !c) return NextResponse.json({ error: "Fant ikke kontrakt" }, { status: 404 });

  // Load template
  const templatePath = path.join(process.cwd(), "public", "templates", "ppa_mal.docx");
  if (!fs.existsSync(templatePath))
    return NextResponse.json({ error: "Mal ikke funnet" }, { status: 500 });

  const content = fs.readFileSync(templatePath);

  // Dynamic imports — installed via package.json; types asserted at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PizZip = ((await import("pizzip" as any)) as any).default;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Docxtemplater = ((await import("docxtemplater" as any)) as any).default;

  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  // The template uses [VARIABLE] brackets — map to {variable} style via raw XML replacement
  const vars = buildVars(c);
  // Replace [VAR] patterns directly in the XML before docxtemplater processing
  let xmlContent = zip.file("word/document.xml")!.asText();
  for (const [key, value] of Object.entries(vars)) {
    // Brackets may have XML-encoded chars; replace escaped and plain versions
    xmlContent = xmlContent.replaceAll(`[${key}]`, value);
  }
  zip.file("word/document.xml", xmlContent);

  const buf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="PPA_${c.motpart ?? contract_id}.docx"`,
    },
  });
}
