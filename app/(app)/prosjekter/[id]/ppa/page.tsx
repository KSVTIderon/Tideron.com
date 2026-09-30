"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type PPA = {
  id: string; project_id: string; motpart: string;
  pris_kr_kwh: number; start_dato: string; slutt_dato: string;
  estimert_arlig_kwh: number | null; status: string; notater: string | null; created_at: string;
  spv_navn?: string; spv_org_nr?: string; spv_adresse?: string;
  spv_kontaktperson?: string; spv_epost?: string; spv_telefon?: string;
  kjoper_navn?: string; kjoper_org_nr?: string; kjoper_adresse?: string;
  kjoper_kontaktperson?: string; kjoper_epost?: string; kjoper_telefon?: string;
  anleggsnavn?: string; installert_effekt_kw?: number; estimert_arsprod_kwh?: number;
  gsrn_maalepunkt_id?: string; avregningsperiode?: string; forventet_cod_dato?: string;
  avtalens_utlop_dato?: string; antall_ar?: number; sted_signering?: string;
  goo_eier?: string; signing_status?: string;
};

type SignToken = {
  id: string; signer_email: string; signer_navn: string | null;
  sign_name: string | null; sign_ip: string | null; signed_at: string | null; created_at: string;
};

type BrregEnhet = {
  organisasjonsnummer: string;
  navn: string;
  forretningsadresse?: { adresse?: string[]; postnummer?: string; poststed?: string };
};

const SIGN_BADGE: Record<string, string> = {
  utkast: "bg-slate-100 text-slate-600",
  sendt:  "bg-amber-50 text-amber-700",
  signert:"bg-green-50 text-green-700",
  utlopt: "bg-red-50 text-red-600",
};

const TIDERON_PRESET = {
  spv_navn: "Tideron AS", spv_org_nr: "", spv_adresse: "",
  spv_kontaktperson: "Kai Svendstad", spv_epost: "ksv@tideron.com", spv_telefon: "",
};

const BLANK_FORM = {
  motpart: "", pris_kr_kwh: "0.65", start_dato: "", slutt_dato: "",
  estimert_arlig_kwh: "", status: "utkast", notater: "",
  spv_navn: "", spv_org_nr: "", spv_adresse: "", spv_kontaktperson: "", spv_epost: "", spv_telefon: "",
  kjoper_navn: "", kjoper_org_nr: "", kjoper_adresse: "", kjoper_kontaktperson: "", kjoper_epost: "", kjoper_telefon: "",
  anleggsnavn: "", installert_effekt_kw: "", kwh_per_time: "", estimert_arsprod_kwh: "", gsrn_maalepunkt_id: "",
  avregningsperiode: "Månedlig", forventet_cod_dato: "", avtalens_utlop_dato: "", antall_ar: "",
  sted_signering: "", goo_eier: "Selger",
};

function addYears(dateStr: string, years: number): string {
  if (!dateStr || !years || years <= 0) return "";
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split("T")[0];
}

// Fetch fra Brønnøysundregistrene
async function sokBrreg(navn: string): Promise<BrregEnhet[]> {
  if (navn.length < 2) return [];
  const res = await fetch(
    `https://data.brreg.no/enhetsregisteret/api/enheter?navn=${encodeURIComponent(navn)}&size=8`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return [];
  const json = await res.json();
  return json._embedded?.enheter ?? [];
}

function brregAdresse(e: BrregEnhet): string {
  const fa = e.forretningsadresse;
  if (!fa) return "";
  const gate = fa.adresse?.join(", ") ?? "";
  const sted = [fa.postnummer, fa.poststed].filter(Boolean).join(" ");
  return [gate, sted].filter(Boolean).join(", ");
}

// BRREG-søkefelt med dropdown
function BrregSok({
  label, fieldNavn, fieldOrgNr, fieldAdresse, form, setForm,
}: {
  label: string;
  fieldNavn: keyof typeof BLANK_FORM;
  fieldOrgNr: keyof typeof BLANK_FORM;
  fieldAdresse: keyof typeof BLANK_FORM;
  form: typeof BLANK_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof BLANK_FORM>>;
}) {
  const [treff, setTreff] = useState<BrregEnhet[]>([]);
  const [vis, setVis] = useState(false);
  const timer = useRef<NodeJS.Timeout | null>(null);

  const onChange = (val: string) => {
    setForm(f => ({ ...f, [fieldNavn]: val }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await sokBrreg(val);
      setTreff(res);
      setVis(res.length > 0);
    }, 350);
  };

  const velg = (e: BrregEnhet) => {
    setForm(f => ({
      ...f,
      [fieldNavn]:    e.navn,
      [fieldOrgNr]:   e.organisasjonsnummer,
      [fieldAdresse]: brregAdresse(e),
    }));
    setVis(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{label}</label>
      <input
        type="text"
        value={(form as any)[fieldNavn]}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setTimeout(() => setVis(false), 150)}
        placeholder="Søk i Brønnøysund…"
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
      />
      {vis && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,.12)", overflow: "hidden",
        }}>
          {treff.map(e => (
            <button key={e.organisasjonsnummer} type="button"
              onMouseDown={() => velg(e)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", background: "none", cursor: "pointer" }}
              className="hover:bg-slate-50"
            >
              <div className="text-sm font-medium text-slate-800">{e.navn}</div>
              <div className="text-xs text-slate-400">{e.organisasjonsnummer} · {brregAdresse(e)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PPAPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [kontrakter, setKontrakter] = useState<PPA[]>([]);
  const [visNy, setVisNy] = useState(false);
  const [visDetalj, setVisDetalj] = useState<PPA | null>(null);
  const [tokens, setTokens] = useState<SignToken[]>([]);
  const [lagrer, setLagrer] = useState(false);
  const [lagreUtkast, setLagreUtkast] = useState(false);
  const [lagreFeil, setLagreFeil] = useState<string | null>(null);
  const [sender, setSender] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [editId, setEditId] = useState<string | null>(null); // ID of contract being edited
  const [signerEpost, setSignerEpost] = useState("");
  const [signerNavn, setSignerNavn] = useState("");
  const [visSend, setVisSend] = useState<PPA | null>(null);
  const [sendtOk, setSendtOk] = useState<string | null>(null);

  const hent = useCallback(async () => {
    const { data } = await supabase.from("ppa_contracts").select("*")
      .eq("project_id", params.id).order("created_at", { ascending: false });
    setKontrakter(data ?? []);
  }, [params.id]);

  useEffect(() => { hent(); }, [hent]);

  const hentTokens = async (contract_id: string) => {
    const { data } = await supabase.from("ppa_signing_tokens")
      .select("*").eq("contract_id", contract_id).order("created_at", { ascending: false });
    setTokens(data ?? []);
  };

  // Regn ut estimert årsproduksjon automatisk fra kWh/time
  const onKwhPerTime = (val: string) => {
    const kw = parseFloat(val);
    setForm(f => ({
      ...f,
      kwh_per_time: val,
      installert_effekt_kw: val,
      estimert_arsprod_kwh: isNaN(kw) ? "" : Math.round(kw * 8760).toString(),
    }));
  };

  // Auto-beregn sluttdato fra startdato + varighet
  const onStartDato = (val: string) => {
    const ar = parseInt(form.antall_ar);
    const slutt = addYears(val, ar);
    setForm(f => ({ ...f, start_dato: val, slutt_dato: slutt || f.slutt_dato, avtalens_utlop_dato: slutt || f.avtalens_utlop_dato }));
  };

  const onVarighetAr = (val: string) => {
    const ar = parseInt(val);
    const slutt = addYears(form.start_dato, ar);
    setForm(f => ({ ...f, antall_ar: val, slutt_dato: slutt || f.slutt_dato, avtalens_utlop_dato: slutt || f.avtalens_utlop_dato }));
  };

  // Pre-fyll Tideron AS som selger (henter org.nr fra BRREG)
  const brukTideronAS = async () => {
    setForm(f => ({ ...f, ...TIDERON_PRESET }));
    try {
      const res = await sokBrreg("Tideron AS");
      if (res.length > 0) {
        const e = res[0];
        setForm(f => ({
          ...f,
          spv_navn: e.navn,
          spv_org_nr: e.organisasjonsnummer,
          spv_adresse: brregAdresse(e),
        }));
      }
    } catch { /* ignorer nettverksfeil */ }
  };

  const byggRow = (isDraft = false) => {
    const d = (v: string) => v || null;
    const n = (v: string) => v ? +v : null;
    return {
      project_id:           params.id,
      motpart:              form.motpart,
      pris_kr_kwh:          +form.pris_kr_kwh,
      start_dato:           d(form.start_dato),
      slutt_dato:           d(form.slutt_dato),
      estimert_arlig_kwh:   n(form.estimert_arsprod_kwh),
      status:               isDraft ? "utkast" : (form.status || "utkast"),
      notater:              d(form.notater),
      spv_navn:             d(form.spv_navn),
      spv_org_nr:           d(form.spv_org_nr),
      spv_adresse:          d(form.spv_adresse),
      spv_kontaktperson:    d(form.spv_kontaktperson),
      spv_epost:            d(form.spv_epost),
      spv_telefon:          d(form.spv_telefon),
      kjoper_navn:          form.kjoper_navn || form.motpart,
      kjoper_org_nr:        d(form.kjoper_org_nr),
      kjoper_adresse:       d(form.kjoper_adresse),
      kjoper_kontaktperson: d(form.kjoper_kontaktperson),
      kjoper_epost:         d(form.kjoper_epost),
      kjoper_telefon:       d(form.kjoper_telefon),
      anleggsnavn:          d(form.anleggsnavn),
      installert_effekt_kw: n(form.installert_effekt_kw),
      estimert_arsprod_kwh: n(form.estimert_arsprod_kwh),
      gsrn_maalepunkt_id:   d(form.gsrn_maalepunkt_id),
      avregningsperiode:    form.avregningsperiode || "Månedlig",
      forventet_cod_dato:   d(form.forventet_cod_dato),
      avtalens_utlop_dato:  d(form.avtalens_utlop_dato),
      antall_ar:            n(form.antall_ar),
      sted_signering:       d(form.sted_signering),
      goo_eier:             form.goo_eier || "Selger",
      signing_status:       "utkast",
    };
  };

  /** Lagre utkast — behold modalen åpen, oppdater eksisterende rad om mulig */
  const lagreUtkastHandler = async () => {
    setLagreFeil(null);
    setLagreUtkast(true);
    const row = byggRow(true);
    try {
      if (editId) {
        const { error } = await supabase.from("ppa_contracts").update(row).eq("id", editId);
        if (error) { setLagreFeil(error.message); return; }
      } else {
        const { data, error } = await supabase.from("ppa_contracts").insert(row).select("id").single();
        if (error) { setLagreFeil(error.message); return; }
        if (data?.id) setEditId(data.id);
      }
      hent();
    } finally {
      setLagreUtkast(false);
    }
  };

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    setLagreFeil(null);
    setLagrer(true);
    const row = byggRow(false);
    try {
      if (editId) {
        const { error } = await supabase.from("ppa_contracts").update(row).eq("id", editId);
        if (error) { setLagreFeil(error.message); return; }
      } else {
        const { error } = await supabase.from("ppa_contracts").insert(row);
        if (error) {
          // Fallback: bare grunnfelt
          const { error: e2 } = await supabase.from("ppa_contracts").insert({
            project_id: params.id, motpart: form.motpart,
            pris_kr_kwh: +form.pris_kr_kwh, start_dato: form.start_dato || null,
            slutt_dato: form.slutt_dato || null, status: form.status || "utkast",
          });
          if (e2) { setLagreFeil(e2.message); return; }
        }
      }
      setVisNy(false);
      setForm({ ...BLANK_FORM });
      setEditId(null);
      hent();
    } finally {
      setLagrer(false);
    }
  };

  const lastNedDocx = async (k: PPA) => {
    const res = await fetch("/planner/api/ppa/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract_id: k.id }),
    });
    if (!res.ok) { alert("Kunne ikke generere DOCX"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `PPA_${k.motpart}.docx`; a.click();
    URL.revokeObjectURL(url);
  };

  const sendTilSignering = async () => {
    if (!visSend || !signerEpost) return;
    setSender(true);
    const res = await fetch("/planner/api/ppa/send-signing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract_id: visSend.id, signer_email: signerEpost, signer_navn: signerNavn || null }),
    });
    setSender(false);
    if (res.ok) {
      setSendtOk(signerEpost);
      setSignerEpost(""); setSignerNavn("");
      hent();
    } else {
      alert("Feil ved sending av e-post");
    }
  };

  const nok = (v: number) => v.toLocaleString("nb-NO");
  const totSignert = kontrakter.filter(k => k.signing_status === "signert" || k.status === "signert");
  const totVolum = totSignert.reduce((s, k) => s + (k.estimert_arlig_kwh ?? 0), 0);

  const inp = (field: keyof typeof BLANK_FORM, label: string, type = "text", placeholder = "") => (
    <div key={field}>
      <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">{label}</label>
      <input type={type} placeholder={placeholder}
        value={(form as any)[field]}
        step={type === "number" ? "any" : undefined}
        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-slate-900">PPA-kontrakter</h2>
        <button onClick={() => setVisNy(true)} className="btn-primary">+ Ny kontrakt</button>
      </div>

      {/* Stats */}
      {kontrakter.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Signerte</p>
            <p className="text-2xl font-semibold">{totSignert.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Kontraktsfestet volum</p>
            <p className="text-2xl font-semibold">{nok(totVolum)} kWh/år</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Siste pris</p>
            <p className="text-2xl font-semibold">
              {totSignert[0] ? `${totSignert[0].pris_kr_kwh?.toFixed(2)} kr/kWh` : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {kontrakter.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Motpart</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Pris</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Periode</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Signering</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {kontrakter.map(k => (
                <tr key={k.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{k.motpart}</td>
                  <td className="px-4 py-3 text-slate-700">{k.pris_kr_kwh?.toFixed(2)} kr/kWh</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{k.start_dato} → {k.slutt_dato}</td>
                  <td className="px-4 py-3">
                    <span className={`badge text-xs ${SIGN_BADGE[k.status] ?? ""}`}>{k.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge text-xs ${SIGN_BADGE[k.signing_status ?? "utkast"] ?? ""}`}>
                      {k.signing_status ?? "utkast"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => lastNedDocx(k)} title="Last ned DOCX"
                        className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-50 text-slate-600">
                        ⬇ DOCX
                      </button>
                      <button onClick={() => { setVisSend(k); setSendtOk(null); }} title="Send til signering"
                        className="px-2 py-1 text-xs rounded border border-[#0F2A5A]/30 hover:bg-[#0F2A5A]/5 text-[#0F2A5A]">
                        ✉ Send
                      </button>
                      <button onClick={() => { setVisDetalj(k); hentTokens(k.id); }} title="Detaljer"
                        className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-50 text-slate-600">
                        👁
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center text-slate-400">
            <p className="text-3xl mb-3">📄</p>
            <p className="font-medium text-slate-600">Ingen PPA-kontrakter registrert</p>
            <p className="text-sm mt-1">Registrer kraftkjøpsavtaler og prisnivåer her</p>
          </div>
        )}
      </div>

      {/* ─── Ny kontrakt-modal ─── z-index over fanelinjen (z-[9999]) */}
      {visNy && (
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-start justify-center p-4 overflow-y-auto">
          <form onSubmit={lagre} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8 p-6 space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-900 text-lg">
                {editId ? "Rediger PPA-utkast" : "Ny PPA-kontrakt"}
              </h3>
              <button type="button" onClick={() => { setVisNy(false); setLagreFeil(null); setEditId(null); }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>

            {/* Grunnleggende */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Grunnleggende</p>
              <div className="grid grid-cols-2 gap-3">
                {inp("motpart", "Motpart / kjøpers navn", "text", "Statkraft AS")}
                {inp("pris_kr_kwh", "Pris (kr/kWh)", "number", "0.65")}

                {/* Startdato med auto-sluttdato */}
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Startdato</label>
                  <input type="date" value={form.start_dato}
                    onChange={e => onStartDato(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20" />
                </div>

                {/* Varighet med auto-sluttdato */}
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Varighet (år)</label>
                  <input type="number" min="1" max="30" placeholder="15" value={form.antall_ar}
                    onChange={e => onVarighetAr(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20" />
                </div>

                {/* Sluttdato — vises auto-beregnet, kan overstyres */}
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
                    Sluttdato
                    {form.start_dato && form.antall_ar && (
                      <span className="text-[#0F2A5A] ml-2">↳ beregnet fra startdato + {form.antall_ar} år</span>
                    )}
                  </label>
                  <input type="date" value={form.slutt_dato}
                    onChange={e => setForm(f => ({ ...f, slutt_dato: e.target.value, avtalens_utlop_dato: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20" />
                </div>

                {inp("sted_signering", "Sted for signering", "text", "Oslo")}
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Avregningsperiode</label>
                  <select value={form.avregningsperiode}
                    onChange={e => setForm(f => ({ ...f, avregningsperiode: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20">
                    <option>Månedlig</option><option>Kvartalsvis</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">GOO-eier</label>
                  <select value={form.goo_eier}
                    onChange={e => setForm(f => ({ ...f, goo_eier: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20">
                    <option>Selger</option><option>Kjøper</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Status</label>
                  <select value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20">
                    <option value="utkast">Utkast</option>
                    <option value="forhandlet">Forhandlet</option>
                    <option value="signert">Signert</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Anlegg */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Anlegg</p>
              <div className="grid grid-cols-2 gap-3">
                {inp("anleggsnavn", "Anleggsnavn / lokasjon")}
                {inp("gsrn_maalepunkt_id", "GSRN / Målepunkt-ID")}

                {/* kWh/time med auto-beregning */}
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
                    Effekt (kWh/time)
                  </label>
                  <input type="number" step="any" placeholder="f.eks. 500"
                    value={form.kwh_per_time}
                    onChange={e => onKwhPerTime(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
                    Estimert årsproduksjon (kWh/år)
                    {form.kwh_per_time && <span className="text-[#0F2A5A] ml-1">↳ auto</span>}
                  </label>
                  <input type="number" step="any" placeholder="Beregnes automatisk"
                    value={form.estimert_arsprod_kwh}
                    onChange={e => setForm(f => ({ ...f, estimert_arsprod_kwh: e.target.value, kwh_per_time: "" }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20"
                  />
                </div>

                {inp("forventet_cod_dato", "Forventet COD-dato", "date")}
                {inp("avtalens_utlop_dato", "Avtalens utløpsdato", "date")}
              </div>
            </div>

            {/* Selger (SPV) — med BRREG-søk */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Selger (Tideron AS / SPV)
                </p>
                <button type="button" onClick={brukTideronAS}
                  className="text-xs px-3 py-1 rounded-lg border border-[#0F2A5A]/30 text-[#0F2A5A] hover:bg-[#0F2A5A]/5 font-medium">
                  Bruk Tideron AS
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Tideron AS kan stå som selger og overdra til SPV ved etablering — dette er regulert i kontraktens Art. 13.1.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <BrregSok label="Selskapsnavn" fieldNavn="spv_navn" fieldOrgNr="spv_org_nr" fieldAdresse="spv_adresse" form={form} setForm={setForm} />
                {inp("spv_org_nr", "Org.nr")}
                {inp("spv_adresse", "Adresse")}
                {inp("spv_kontaktperson", "Kontaktperson")}
                {inp("spv_epost", "E-post", "email")}
                {inp("spv_telefon", "Telefon")}
              </div>
            </div>

            {/* Kjøper — med BRREG-søk */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Kjøper
              </p>
              <div className="grid grid-cols-2 gap-3">
                <BrregSok label="Selskapsnavn" fieldNavn="kjoper_navn" fieldOrgNr="kjoper_org_nr" fieldAdresse="kjoper_adresse" form={form} setForm={setForm} />
                {inp("kjoper_org_nr", "Org.nr")}
                {inp("kjoper_adresse", "Adresse")}
                {inp("kjoper_kontaktperson", "Kontaktperson")}
                {inp("kjoper_epost", "E-post", "email")}
                {inp("kjoper_telefon", "Telefon")}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Notater</label>
              <textarea rows={2} value={form.notater}
                onChange={e => setForm(f => ({ ...f, notater: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20 resize-none" />
            </div>

            {lagreFeil && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                ⚠ Kunne ikke lagre: {lagreFeil}
              </div>
            )}

            {editId && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-2 text-xs text-blue-700">
                💾 Utkast lagret — du kan fortsette å redigere og lagre igjen.
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={lagrer} className="btn-primary flex-1">
                {lagrer ? "Lagrer…" : editId ? "Fullfør og lagre" : "Lagre kontrakt"}
              </button>
              <button type="button" onClick={lagreUtkastHandler} disabled={lagreUtkast}
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50">
                {lagreUtkast ? "Lagrer…" : "Lagre utkast"}
              </button>
              <button type="button" onClick={() => { setVisNy(false); setLagreFeil(null); setEditId(null); }} className="btn-secondary">Avbryt</button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Send til signering-modal ─── */}
      {visSend && (
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-900">Send til signering</h3>
              <button onClick={() => { setVisSend(null); setSendtOk(null); }}
                className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <p className="text-sm text-slate-500">
              Kontrakt: <span className="font-medium text-slate-700">{visSend.motpart}</span>
            </p>
            {sendtOk ? (
              <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
                <p className="text-green-700 font-medium">✓ E-post sendt til {sendtOk}</p>
                <p className="text-green-600 text-sm mt-1">Mottakeren får en unik signeringslenke.</p>
                <button onClick={() => setSendtOk(null)} className="mt-3 text-sm text-green-700 underline">
                  Send til en ny mottaker
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Mottakers navn</label>
                  <input type="text" value={signerNavn} onChange={e => setSignerNavn(e.target.value)}
                    placeholder="Ola Nordmann"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Mottakers e-post *</label>
                  <input type="email" required value={signerEpost} onChange={e => setSignerEpost(e.target.value)}
                    placeholder="ola@selskap.no"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20" />
                </div>
                <p className="text-xs text-slate-400">
                  Mottakeren får en unik lenke der de kan lese avtalen og signere med navn.
                  IP-adresse og tidsstempel registreres automatisk.
                </p>
                <div className="flex gap-3">
                  <button onClick={sendTilSignering} disabled={sender || !signerEpost} className="btn-primary flex-1">
                    {sender ? "Sender…" : "Send signeringslenke"}
                  </button>
                  <button onClick={() => { setVisSend(null); setSendtOk(null); }} className="btn-secondary">Avbryt</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Detaljer + signaturer ─── */}
      {visDetalj && (
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl my-8 p-6 space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-900 text-lg">{visDetalj.motpart}</h3>
              <button onClick={() => setVisDetalj(null)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Pris", `${visDetalj.pris_kr_kwh?.toFixed(2)} kr/kWh`],
                ["Periode", `${visDetalj.start_dato} → ${visDetalj.slutt_dato}`],
                ["Varighet", visDetalj.antall_ar ? `${visDetalj.antall_ar} år` : "—"],
                ["Anlegg", visDetalj.anleggsnavn ?? "—"],
                ["Effekt", visDetalj.installert_effekt_kw ? `${visDetalj.installert_effekt_kw} kW` : "—"],
                ["Volum", visDetalj.estimert_arsprod_kwh ? `${nok(visDetalj.estimert_arsprod_kwh)} kWh/år` : "—"],
                ["GSRN", visDetalj.gsrn_maalepunkt_id ?? "—"],
                ["Sted", visDetalj.sted_signering ?? "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-slate-400">{k}</p>
                  <p className="text-slate-700 font-medium">{v}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => lastNedDocx(visDetalj)} className="btn-secondary flex-1">⬇ Last ned DOCX</button>
              <button onClick={() => { setVisSend(visDetalj); setVisDetalj(null); setSendtOk(null); }} className="btn-primary flex-1">✉ Send til signering</button>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Signaturer</p>
              {tokens.length === 0 ? (
                <p className="text-sm text-slate-400">Ingen signaturer ennå</p>
              ) : (
                <div className="space-y-2">
                  {tokens.map(t => (
                    <div key={t.id}
                      className={`rounded-lg px-4 py-3 text-sm border ${t.signed_at ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50"}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-slate-800">{t.sign_name ?? t.signer_navn ?? t.signer_email}</p>
                          <p className="text-xs text-slate-500">{t.signer_email}</p>
                        </div>
                        {t.signed_at
                          ? <span className="badge bg-green-100 text-green-700 text-xs">✓ Signert</span>
                          : <span className="badge bg-amber-50 text-amber-600 text-xs">Venter</span>}
                      </div>
                      {t.signed_at && (
                        <div className="mt-2 text-xs text-slate-400">
                          {new Date(t.signed_at).toLocaleString("nb-NO")}
                          {t.sign_ip && <span className="ml-2">· IP: {t.sign_ip}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
