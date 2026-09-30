import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { sign_name } = await req.json();
  if (!sign_name?.trim())
    return NextResponse.json({ error: "Navn er påkrevd" }, { status: 400 });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "ukjent";

  const supabase = createClient();

  const { data: token_row, error } = await supabase
    .from("ppa_signing_tokens")
    .select("id, contract_id, signed_at")
    .eq("token", params.token)
    .single();

  if (error || !token_row)
    return NextResponse.json({ error: "Ugyldig eller utløpt lenke" }, { status: 404 });

  if (token_row.signed_at)
    return NextResponse.json({ error: "Allerede signert" }, { status: 409 });

  const now = new Date().toISOString();

  await supabase.from("ppa_signing_tokens").update({
    sign_name: sign_name.trim(),
    sign_ip:   ip,
    signed_at: now,
  }).eq("id", token_row.id);

  // Update contract status
  await supabase.from("ppa_contracts")
    .update({ signing_status: "signert" })
    .eq("id", token_row.contract_id);

  return NextResponse.json({ ok: true, signed_at: now });
}
