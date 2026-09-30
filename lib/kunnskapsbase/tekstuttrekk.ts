/**
 * Tekstuttrekk for kunnskapsassistenten.
 * Støtter pdf, docx, xlsx, md, txt, html.
 */
import { readFile } from "fs/promises";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import * as cheerio from "cheerio";

const NULLTEGN = String.fromCharCode(0);

function rens(tekst: string): string {
  return tekst
    .split(NULLTEGN).join(" ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function lesPdf(path: string): Promise<string> {
  const buffer = await readFile(path);
  const data = await pdfParse(buffer);
  return rens(data.text);
}

export async function lesDocx(path: string): Promise<string> {
  const buffer = await readFile(path);
  const { value } = await mammoth.extractRawText({ buffer });
  return rens(value);
}

export async function lesXlsx(path: string): Promise<string> {
  const buffer = await readFile(path);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const deler: string[] = [];
  for (const navn of wb.SheetNames) {
    deler.push(`[Ark: ${navn}]`);
    const ark = wb.Sheets[navn];
    const rader = XLSX.utils.sheet_to_json(ark, { header: 1, defval: "" }) as unknown[][];
    for (const rad of rader) {
      const verdier = rad.filter((v) => v !== "" && v != null).map(String);
      if (verdier.length) deler.push(verdier.join(" | "));
    }
  }
  return rens(deler.join("\n"));
}

export async function lesMdEllerTxt(path: string): Promise<string> {
  const tekst = await readFile(path, "utf-8");
  return rens(tekst);
}

export async function lesHtml(path: string): Promise<string> {
  const raatekst = await readFile(path, "utf-8");
  const $ = cheerio.load(raatekst);
  $("script, style").remove();
  return rens($.text());
}

const LESERE: Record<string, (path: string) => Promise<string>> = {
  ".pdf": lesPdf,
  ".docx": lesDocx,
  ".xlsx": lesXlsx,
  ".md": lesMdEllerTxt,
  ".txt": lesMdEllerTxt,
  ".html": lesHtml,
  ".htm": lesHtml,
};

function filendelse(filnavn: string): string {
  const i = filnavn.lastIndexOf(".");
  return i === -1 ? "" : filnavn.slice(i).toLowerCase();
}

export function stottetFiltype(filnavn: string): boolean {
  return filendelse(filnavn) in LESERE;
}

export async function lesDokument(path: string, filnavn: string): Promise<string> {
  const leser = LESERE[filendelse(filnavn)];
  if (!leser) throw new Error(`Ustøttet filtype: ${filendelse(filnavn)}`);
  return leser(path);
}
