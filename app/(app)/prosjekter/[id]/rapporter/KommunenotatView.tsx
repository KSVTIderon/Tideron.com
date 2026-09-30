"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props { prosjektId: string; }

interface ProsjektData {
  navn: string;
  sted: string;
  lat: number | null;
  lon: number | null;
  stadie: string | null;
  beskrivelse: string | null;
}

interface StreamData {
  stream_type: string | null;
  avg_velocity_m_s: number | null;
  peak_velocity_m_s: number | null;
  bredde_m: number | null;
  datakilde: string | null;
}

interface RotorData {
  modell: string | null;
  diameter_m: number | null;
  lengde_m: number | null;
  lat: number | null;
  lon: number | null;
}

const STREAM_TYPE_LABEL: Record<string, string> = {
  tidevann: "tidevann", elv: "elv", havstrøm: "havstrøm",
};

const DATO_NÅ = new Date().toLocaleDateString("nb-NO", {
  day: "numeric", month: "long", year: "numeric",
});

export default function KommunenotatView({ prosjektId }: Props) {
  const sb = createClient();

  const [prosjekt, setProsjekt] = useState<ProsjektData | null>(null);
  const [stream,   setStream]   = useState<StreamData | null>(null);
  const [rotorer,  setRotorer]  = useState<RotorData[]>([]);
  const [laster,   setLaster]   = useState(true);

  // Redigerbare felt
  const [kontaktNavn,    setKontaktNavn]    = useState("Kai Svendstad");
  const [kontaktEpost,   setKontaktEpost]   = useState("ksv@tideron.com");
  const [kontaktTlf,     setKontaktTlf]     = useState("+47 922 23 456");
  const [kommuneNavn,    setKommuneNavn]    = useState("");
  const [saksnummer,     setSaksnummer]     = useState("");
  const [dato,           setDato]           = useState(DATO_NÅ);
  const [tiltakBeskr,    setTiltakBeskr]    = useState("");
  const [formål,         setFormål]         = useState("");
  const [lokasjBeskr,    setLokasjBeskr]    = useState("");
  const [reguleringsStatus, setReguleringsStatus] = useState("");
  const [miljøHensyn,    setMiljøHensyn]    = useState(
    "Naturmangfoldloven §§ 8–12 vurderes. Ingen kjente rødlistede arter i planområdet. Hydrofon benyttes for lydovervåking. Undervannskamera og multiparametersonde dokumenterer vannmiljøet."
  );
  const [avklaringsPunkter, setAvklaringsPunkter] = useState(
    "• Er tiltaket konsesjonspliktig etter vannressursloven?\n• Kreves reguleringsplan eller kan tiltaket behandles som søknad etter plan- og bygningsloven?\n• Hvilke fagmyndigheter ønsker kommunen å trekke inn i prosessen?\n• Krav til konsekvensutredning (KU)?"
  );

  // Send-modal
  const [visSend,     setVisSend]     = useState(false);
  const [sendEpost,   setSendEpost]   = useState("");
  const [sendNavn,    setSendNavn]    = useState("");
  const [sender,      setSender]      = useState(false);
  const [sendtOk,     setSendtOk]     = useState(false);
  const [sendFeil,    setSendFeil]    = useState<string | null>(null);

  const notatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      sb.from("projects").select("navn,sted,lat,lon,stadie,beskrivelse").eq("id", prosjektId).single(),
      sb.from("streams").select("stream_type,avg_velocity_m_s,peak_velocity_m_s,bredde_m,datakilde").eq("project_id", prosjektId).maybeSingle(),
      sb.from("rotors").select("modell,diameter_m,lengde_m,lat,lon").eq("project_id", prosjektId),
    ]).then(([{ data: p }, { data: s }, { data: r }]) => {
      if (p) {
        setProsjekt(p as ProsjektData);
        setKommuneNavn(p.sted ? p.sted.split(",")[0].trim() : "");
        // Forslag til tiltaksbeskrivelse
        const antall = (r ?? []).filter((x: any) => x.lat && x.lon).length;
        const streamType = (s as StreamData | null)?.stream_type;
        setTiltakBeskr(
          `Etablering av ${antall > 0 ? antall : "1–4"} hydrokinetisk ${streamType ? STREAM_TYPE_LABEL[streamType] + "s" : ""}kraftverk (Waterotor-teknologi) i ${p.sted ?? "planområdet"}. `
          + `Waterotor er et lavtliggende flytende eller bunnforankret strømaggregat uten demning eller inntakskanal. `
          + `Anlegget produserer fornybar kraft fra eksisterende strømforhold og krever minimal fysisk infrastruktur i elv eller sjø.`
        );
        setFormål(
          `Utnytte fornybar hydrokinetisk energi til lokal strømproduksjon. `
          + `Prosjektet er en del av Tideron AS sitt mål om å levere kostnadseffektiv, naturvennlig småkraft i norske kommuner.`
        );
        setLokasjBeskr(
          p.sted
            ? `Tiltaket planlegges i ${p.sted}${p.lat && p.lon ? ` (ca. ${p.lat.toFixed(4)}°N, ${p.lon.toFixed(4)}°Ø)` : ""}.`
            : ""
        );
      }
      setStream((s as StreamData | null));
      setRotorer((r ?? []) as RotorData[]);
      setLaster(false);
    });
  }, [prosjektId]); // eslint-disable-line

  const antallPlassert = rotorer.filter(r => r.lat && r.lon).length;
  const avgV = stream?.avg_velocity_m_s ?? stream?.peak_velocity_m_s;

  // Generer HTML for e-post / Odoo
  const genererHtml = () => {
    const li = (tekst: string) => `<li style="margin:4px 0;">${tekst}</li>`;
    const avklPunkter = avklaringsPunkter
      .split("\n")
      .filter(l => l.trim())
      .map(l => li(l.replace(/^[•\-]\s*/, "")))
      .join("\n");

    return `
<h2 style="color:#0F2A5A;font-size:18px;font-weight:700;margin:0 0 4px;">Planavklaringsnotat</h2>
<p style="color:#64748b;font-size:13px;margin:0 0 24px;">
  Prosjekt: <strong>${prosjekt?.navn ?? ""}</strong> &nbsp;·&nbsp;
  Dato: ${dato} &nbsp;·&nbsp;
  ${saksnummer ? "Ref./saksnr.: " + saksnummer : ""}
</p>

<h3 style="color:#0F2A5A;font-size:14px;font-weight:700;margin:20px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">
  1. Tiltakshaver og kontaktperson
</h3>
<table style="font-size:13px;color:#334155;border-collapse:collapse;">
  <tr><td style="padding:3px 16px 3px 0;color:#64748b;">Tiltakshaver</td><td>Tideron AS</td></tr>
  <tr><td style="padding:3px 16px 3px 0;color:#64748b;">Kontaktperson</td><td>${kontaktNavn}</td></tr>
  <tr><td style="padding:3px 16px 3px 0;color:#64748b;">E-post</td><td>${kontaktEpost}</td></tr>
  <tr><td style="padding:3px 16px 3px 0;color:#64748b;">Telefon</td><td>${kontaktTlf}</td></tr>
  <tr><td style="padding:3px 16px 3px 0;color:#64748b;">Kommune</td><td>${kommuneNavn}</td></tr>
</table>

<h3 style="color:#0F2A5A;font-size:14px;font-weight:700;margin:24px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">
  2. Beskrivelse av tiltaket
</h3>
<p style="font-size:13px;color:#334155;line-height:1.65;margin:0 0 12px;">${tiltakBeskr}</p>
${avgV ? `<p style="font-size:13px;color:#334155;margin:0 0 12px;">Målt gjennomsnittshastighet: <strong>${(+avgV).toFixed(2)} m/s</strong>${stream?.datakilde ? ` (kilde: ${stream.datakilde})` : ""}.</p>` : ""}
${antallPlassert > 0 ? `<p style="font-size:13px;color:#334155;margin:0 0 12px;">Antall planlagte rotorer: <strong>${antallPlassert} stk</strong>.</p>` : ""}

<h3 style="color:#0F2A5A;font-size:14px;font-weight:700;margin:24px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">
  3. Formål
</h3>
<p style="font-size:13px;color:#334155;line-height:1.65;margin:0 0 12px;">${formål}</p>

<h3 style="color:#0F2A5A;font-size:14px;font-weight:700;margin:24px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">
  4. Lokalisering
</h3>
<p style="font-size:13px;color:#334155;line-height:1.65;margin:0 0 12px;">${lokasjBeskr}</p>
${reguleringsStatus ? `<p style="font-size:13px;color:#334155;line-height:1.65;margin:0 0 12px;"><strong>Gjeldende planer:</strong> ${reguleringsStatus}</p>` : ""}

<h3 style="color:#0F2A5A;font-size:14px;font-weight:700;margin:24px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">
  5. Miljø- og naturmangfoldsvurdering
</h3>
<p style="font-size:13px;color:#334155;line-height:1.65;margin:0 0 12px;">${miljøHensyn}</p>

<h3 style="color:#0F2A5A;font-size:14px;font-weight:700;margin:24px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">
  6. Ønskede avklaringspunkter
</h3>
<ul style="font-size:13px;color:#334155;line-height:1.65;margin:0 0 12px;padding-left:20px;">
${avklPunkter}
</ul>

<p style="font-size:12px;color:#94a3b8;margin:24px 0 0;border-top:1px solid #e2e8f0;padding-top:16px;">
  Notatet er utarbeidet med referanse til plan- og bygningsloven § 12-8 (oppstartsmøte) og
  er ment som grunnlag for dialog med kommunens planmyndighet. Det er ikke en formell søknad.
</p>`;
  };

  const sendNotat = async () => {
    if (!sendEpost) return;
    setSender(true);
    setSendFeil(null);
    try {
      const res = await fetch("/planner/api/varsler/kommunenotat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: prosjektId,
          mottaker_epost: sendEpost,
          mottaker_navn: sendNavn || undefined,
          notat_html: genererHtml(),
          notat_emne: `Planavklaringsnotat: ${prosjekt?.navn ?? "prosjekt"}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ukjent feil");
      setSendtOk(true);
    } catch (err: any) {
      setSendFeil(err.message);
    } finally {
      setSender(false);
    }
  };

  const skrivUt = () => window.print();

  if (laster) {
    return <div className="p-10 text-center text-slate-400 text-sm">Laster prosjektdata…</div>;
  }

  const felt = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    rows?: number,
    placeholder?: string,
  ) => (
    <div>
      <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{label}</label>
      {rows ? (
        <textarea
          rows={rows}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 resize-y"
        />
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Rediger-panel */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-slate-900 text-base">Planavklaringsnotat — rediger innhold</h2>

        <div className="grid grid-cols-3 gap-4">
          {felt("Kontaktperson",   kontaktNavn,  setKontaktNavn)}
          {felt("E-post",          kontaktEpost, setKontaktEpost)}
          {felt("Telefon",         kontaktTlf,   setKontaktTlf)}
          {felt("Kommune",         kommuneNavn,  setKommuneNavn)}
          {felt("Dato",            dato,         setDato)}
          {felt("Ref./saksnr. (valgfritt)", saksnummer, setSaksnummer, undefined, "f.eks. 2024/1234")}
        </div>

        <div className="grid grid-cols-1 gap-4">
          {felt("Beskrivelse av tiltaket", tiltakBeskr, setTiltakBeskr, 4)}
          {felt("Formål", formål, setFormål, 2)}
          {felt("Lokalisering (tekstlig)", lokasjBeskr, setLokasjBeskr, 2)}
          {felt("Gjeldende reguleringsplan / plansituasjon (valgfritt)", reguleringsStatus, setReguleringsStatus, 2,
            "f.eks. LNF-formål i kommuneplanens arealdel, ingen reguleringsplan")}
          {felt("Miljø- og naturmangfoldsvurdering", miljøHensyn, setMiljøHensyn, 4)}
          {felt("Ønskede avklaringspunkter (ett per linje, bruk • for bullet)", avklaringsPunkter, setAvklaringsPunkter, 5)}
        </div>
      </div>

      {/* Forhåndsvisning */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-semibold text-slate-900">Forhåndsvisning</h2>
          <div className="flex gap-2">
            <button onClick={skrivUt}
              className="btn-secondary text-sm">
              🖨 Skriv ut / PDF
            </button>
            <button onClick={() => { setSendtOk(false); setSendFeil(null); setVisSend(true); }}
              className="btn-primary text-sm">
              📧 Send til kommune
            </button>
          </div>
        </div>
        <div
          ref={notatRef}
          className="p-8 max-w-3xl mx-auto"
          dangerouslySetInnerHTML={{ __html: genererHtml() }}
        />
      </div>

      {/* Send-modal */}
      {visSend && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 text-lg">Send planavklaringsnotat</h3>

            {sendtOk ? (
              <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-4 text-sm">
                ✅ Notatet er sendt til <strong>{sendEpost}</strong> og logget i Odoo.
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Mottaker (e-post) *</label>
                    <input
                      type="email"
                      value={sendEpost}
                      onChange={e => setSendEpost(e.target.value)}
                      placeholder="postmottak@kommune.no"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Mottakernavn (valgfritt)</label>
                    <input
                      type="text"
                      value={sendNavn}
                      onChange={e => setSendNavn(e.target.value)}
                      placeholder="Plan- og bygningsavdelingen"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                    />
                  </div>
                </div>

                {sendFeil && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                    ❌ {sendFeil}
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={() => setVisSend(false)} className="btn-secondary text-sm">Avbryt</button>
                  <button
                    onClick={sendNotat}
                    disabled={!sendEpost || sender}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {sender ? "Sender…" : "Send notat"}
                  </button>
                </div>
              </>
            )}

            {sendtOk && (
              <div className="flex justify-end">
                <button onClick={() => setVisSend(false)} className="btn-secondary text-sm">Lukk</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
