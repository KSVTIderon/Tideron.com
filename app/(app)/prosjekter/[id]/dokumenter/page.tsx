"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "next-auth/react";

const KATEGORIER = ["konsesjon","kontrakt","kart","teknisk","okonomisk","annet"];
const IKONER: Record<string, string> = {
  konsesjon: "📋", kontrakt: "📄", kart: "🗺️",
  teknisk: "⚙️", okonomisk: "💰", annet: "📎",
};

function filstorrelseTekst(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const BUCKET = "project-documents";

export default function DokumenterPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  const supabase = createClient();
  const [docs, setDocs] = useState<any[]>([]);
  const [laster, setLaster] = useState(false);
  const [kategori, setKategori] = useState("annet");
  const [filter, setFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const hent = useCallback(async () => {
    const { data } = await supabase
      .from("project_documents")
      .select("*, profiles(navn)")
      .eq("project_id", params.id)
      .order("created_at", { ascending: false });
    setDocs(data ?? []);
  }, [params.id]);

  useEffect(() => { hent(); }, [hent]);

  const lastOpp = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fil = e.target.files?.[0];
    if (!fil) return;
    setLaster(true);

    const ext = fil.name.split(".").pop();
    const path = `${params.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET).upload(path, fil, { contentType: fil.type });

    if (uploadError) {
      alert("Opplasting feilet: " + uploadError.message);
      setLaster(false);
      return;
    }

    const userId = (session?.user as { id?: string })?.id;
    await supabase.from("project_documents").insert({
      project_id: params.id,
      filnavn: fil.name,
      storage_path: path,
      filstorrelse: fil.size,
      mime_type: fil.type,
      kategori,
      lastet_opp_av: userId ?? null,
    });

    setLaster(false);
    if (fileRef.current) fileRef.current.value = "";
    hent();
  };

  const lastNed = async (doc: any) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const slett = async (doc: any) => {
    await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    await supabase.from("project_documents").delete().eq("id", doc.id);
    hent();
  };

  const filtrert = docs.filter(d =>
    !filter || d.kategori === filter
  );

  return (
    <div className="space-y-5">
      {/* Opplasting */}
      <div className="card p-5">
        <h2 className="font-semibold text-slate-900 mb-4">Last opp dokument</h2>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Kategori</label>
            <select value={kategori} onChange={e => setKategori(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2A5A]/20">
              {KATEGORIER.map(k => <option key={k} value={k}>{IKONER[k]} {k}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Fil</label>
            <input ref={fileRef} type="file"
              onChange={lastOpp}
              disabled={laster}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-[#0F2A5A] file:text-white cursor-pointer disabled:opacity-50" />
          </div>
          {laster && <p className="text-sm text-slate-500">Laster opp...</p>}
        </div>
      </div>

      {/* Filter + liste */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-semibold text-slate-900">Dokumenter ({docs.length})</h2>
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none">
            <option value="">Alle kategorier</option>
            {KATEGORIER.map(k => <option key={k} value={k}>{IKONER[k]} {k}</option>)}
          </select>
        </div>

        {filtrert.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Filnavn</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Kategori</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">Storrelse</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Lastet opp av</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Dato</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrert.map(d => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <button onClick={() => lastNed(d)} className="hover:text-[#0F2A5A] hover:underline text-left">
                      {d.filnavn}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{IKONER[d.kategori]} {d.kategori}</td>
                  <td className="px-4 py-3 text-right text-slate-400 text-xs">
                    {d.filstorrelse ? filstorrelseTekst(d.filstorrelse) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{d.profiles?.navn ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(d.created_at).toLocaleDateString("nb-NO")}
                  </td>
                  <td className="px-4 py-3 text-right flex gap-2 justify-end">
                    <button onClick={() => lastNed(d)} className="text-xs text-[#0F2A5A] hover:underline">Last ned</button>
                    <button onClick={() => slett(d)} className="text-xs text-slate-300 hover:text-red-400">X</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center text-slate-400 text-sm">
            <p className="text-3xl mb-2">📎</p>
            <p>{docs.length === 0 ? "Ingen dokumenter lastet opp ennå" : "Ingen dokumenter i valgt kategori"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
