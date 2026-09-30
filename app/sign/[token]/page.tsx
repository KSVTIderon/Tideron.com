"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type ContractInfo = {
  motpart: string;
  pris_kr_kwh: number;
  start_dato: string;
  slutt_dato: string;
  antall_ar: number | null;
  anleggsnavn: string | null;
  installert_effekt_kw: number | null;
  estimert_arsprod_kwh: number | null;
  spv_navn: string | null;
  sted_signering: string | null;
  avtalens_utlop_dato: string | null;
};

type SignerInfo = {
  id: string;
  signer_email: string;
  signer_navn: string | null;
  signed_at: string | null;
  contract_id: string;
};

export default function SignPage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const [status, setStatus] = useState<"loading" | "ready" | "already_signed" | "invalid" | "done">("loading");
  const [signer, setSigner] = useState<SignerInfo | null>(null);
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: tokenRow, error } = await supabase
        .from("ppa_signing_tokens")
        .select("id, signer_email, signer_navn, signed_at, contract_id")
        .eq("token", params.token)
        .single();

      if (error || !tokenRow) { setStatus("invalid"); return; }
      if (tokenRow.signed_at) { setSigner(tokenRow); setSignedAt(tokenRow.signed_at); setStatus("already_signed"); return; }

      setSigner(tokenRow);

      const { data: c } = await supabase
        .from("ppa_contracts")
        .select("motpart, pris_kr_kwh, start_dato, slutt_dato, antall_ar, anleggsnavn, installert_effekt_kw, estimert_arsprod_kwh, spv_navn, sted_signering, avtalens_utlop_dato")
        .eq("id", tokenRow.contract_id)
        .single();

      setContract(c ?? null);
      setName(tokenRow.signer_navn ?? "");
      setStatus("ready");
    })();
  }, [params.token]);

  const handleSign = async () => {
    if (!name.trim()) { setError("Skriv inn ditt fulle navn for å signere"); return; }
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/sign/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sign_name: name }),
    });
    setSubmitting(false);
    if (res.ok) {
      const { signed_at } = await res.json();
      setSignedAt(signed_at);
      setStatus("done");
    } else {
      const { error: e } = await res.json().catch(() => ({ error: "Ukjent feil" }));
      setError(e ?? "Ukjent feil");
    }
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("nb-NO") : "—";
  const nok = (v: number) => v.toLocaleString("nb-NO");

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#0F2A5A", padding: "20px 32px" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 20, letterSpacing: 4 }}>TIDERON</span>
      </div>

      <div style={{ maxWidth: 640, margin: "48px auto", padding: "0 16px" }}>

        {status === "loading" && (
          <div style={{ textAlign: "center", color: "#94a3b8", paddingTop: 80 }}>Laster avtale…</div>
        )}

        {status === "invalid" && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 48, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.1)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
            <h2 style={{ color: "#0f172a", marginTop: 0 }}>Ugyldig lenke</h2>
            <p style={{ color: "#64748b" }}>Denne signeringslenken er ugyldig eller ikke lenger aktiv. Ta kontakt med avsenderen.</p>
          </div>
        )}

        {(status === "already_signed" || status === "done") && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 48, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.1)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h2 style={{ color: "#0f172a", marginTop: 0 }}>Avtalen er signert</h2>
            <p style={{ color: "#64748b" }}>
              Signert av <strong>{signer?.signer_navn ?? signer?.signer_email}</strong>
              {signedAt && <> den {fmt(signedAt)}</>}.
            </p>
            <p style={{ color: "#94a3b8", fontSize: 13 }}>Signaturen er registrert med tidsstempel og IP-adresse.</p>
          </div>
        )}

        {status === "ready" && contract && (
          <>
            <h1 style={{ color: "#0f172a", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
              Kraftkjøpsavtale (PPA)
            </h1>
            <p style={{ color: "#64748b", marginBottom: 32 }}>
              Hei{signer?.signer_navn ? ` ${signer.signer_navn}` : ""},
              vennligst les gjennom avtalevilkårene og signer under.
            </p>

            {/* Contract summary card */}
            <div style={{
              background: "#fff", borderRadius: 16, padding: 32,
              boxShadow: "0 1px 3px rgba(0,0,0,.1)", marginBottom: 24
            }}>
              <h2 style={{ color: "#0F2A5A", fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 20 }}>
                Avtaleoversikt
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 32px" }}>
                {[
                  ["Motpart", contract.motpart],
                  ["Selger (SPV)", contract.spv_navn ?? "Tideron"],
                  ["Pris", `${contract.pris_kr_kwh?.toFixed(2)} kr/kWh`],
                  ["Anlegg", contract.anleggsnavn ?? "—"],
                  ["Startdato", fmt(contract.start_dato)],
                  ["Sluttdato", contract.avtalens_utlop_dato ? fmt(contract.avtalens_utlop_dato) : fmt(contract.slutt_dato)],
                  ["Varighet", contract.antall_ar ? `${contract.antall_ar} år` : "—"],
                  ["Installert effekt", contract.installert_effekt_kw ? `${contract.installert_effekt_kw} kW` : "—"],
                  ["Estimert årsproduksjon", contract.estimert_arsprod_kwh ? `${nok(contract.estimert_arsprod_kwh)} kWh/år` : "—"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{k}</p>
                    <p style={{ color: "#0f172a", fontWeight: 500, margin: 0 }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Signature box */}
            <div style={{
              background: "#fff", borderRadius: 16, padding: 32,
              boxShadow: "0 1px 3px rgba(0,0,0,.1)"
            }}>
              <h2 style={{ color: "#0F2A5A", fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 8 }}>
                Elektronisk signatur
              </h2>
              <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>
                Ved å skrive inn ditt fulle navn og klikke "Signer avtalen" bekrefter du at du har lest og akseptert
                avtalevilkårene. Din IP-adresse og tidsstempel registreres som bevis på signaturen.
              </p>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Ditt fulle navn *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Skriv ditt fulle navn"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    border: "1px solid #e2e8f0", borderRadius: 10,
                    padding: "12px 16px", fontSize: 16, outline: "none",
                    fontFamily: "inherit"
                  }}
                />
              </div>

              {error && (
                <p style={{ color: "#ef4444", fontSize: 14, marginBottom: 12 }}>{error}</p>
              )}

              <button
                onClick={handleSign}
                disabled={submitting || !name.trim()}
                style={{
                  width: "100%", padding: "14px 24px",
                  background: submitting || !name.trim() ? "#94a3b8" : "#0F2A5A",
                  color: "#fff", border: "none", borderRadius: 10,
                  fontSize: 16, fontWeight: 600, cursor: submitting || !name.trim() ? "not-allowed" : "pointer",
                  fontFamily: "inherit"
                }}>
                {submitting ? "Signerer…" : "✍ Signer avtalen"}
              </button>

              <p style={{ color: "#cbd5e1", fontSize: 12, textAlign: "center", marginTop: 16 }}>
                Denne lenken er unik for {signer?.signer_email} og kan ikke deles.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
