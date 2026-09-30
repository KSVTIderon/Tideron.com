import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashPassord } from "@/lib/passord";

const ADMIN = (process.env.ADMIN_EMAIL ?? "ksv@tideron.com").toLowerCase();

async function sjekkAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === ADMIN;
}

export async function GET() {
  if (!await sjekkAdmin()) return NextResponse.json({ error: "Ingen tilgang" }, { status: 403 });
  const { data } = await supabaseAdmin
    .from("allowed_users")
    .select("id, email, navn, rolle, created_at")
    .order("created_at");
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  if (!await sjekkAdmin()) return NextResponse.json({ error: "Ingen tilgang" }, { status: 403 });
  const { email, navn, passord, rolle = "bruker" } = await req.json();
  const clean = (email ?? "").trim().toLowerCase();
  if (!clean || !clean.includes("@")) return NextResponse.json({ error: "Ugyldig e-post" }, { status: 400 });
  if (!passord || passord.length < 6) return NextResponse.json({ error: "Passord må være minst 6 tegn" }, { status: 400 });
  const password_hash = await hashPassord(passord);
  const { error } = await supabaseAdmin
    .from("allowed_users")
    .insert({ email: clean, navn: navn || null, rolle, password_hash, added_by: ADMIN });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  if (!await sjekkAdmin()) return NextResponse.json({ error: "Ingen tilgang" }, { status: 403 });
  const { id, rolle, passord } = await req.json();
  const oppdatering: any = {};
  if (rolle) oppdatering.rolle = rolle;
  if (passord) {
    if (passord.length < 6) return NextResponse.json({ error: "Passord må være minst 6 tegn" }, { status: 400 });
    oppdatering.password_hash = await hashPassord(passord);
  }
  if (Object.keys(oppdatering).length === 0) return NextResponse.json({ error: "Ingenting å oppdatere" }, { status: 400 });
  await supabaseAdmin.from("allowed_users").update(oppdatering).eq("id", id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!await sjekkAdmin()) return NextResponse.json({ error: "Ingen tilgang" }, { status: 403 });
  const { id } = await req.json();
  await supabaseAdmin.from("allowed_users").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
