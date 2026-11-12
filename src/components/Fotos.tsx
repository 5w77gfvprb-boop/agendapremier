"use client";

import { Camera, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { msgErro, useApp } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ui";

type Foto = { id: string; path: string; criado_em: string; url?: string };

/** Diminui a foto do celular (até 1600 px, JPEG) para caber bem no armazenamento grátis. */
async function comprimir(f: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.8));
    return b ?? f;
  } catch {
    return f;   // formato que o navegador não abre (ex.: HEIC em alguns aparelhos): sobe como veio
  }
}

export function Fotos({ agendamentoId }: { agendamentoId: string }) {
  const { sb, notify } = useApp();
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [enviando, setEnviando] = useState(0);
  const [apagar, setApagar] = useState<Foto | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await sb.from("fotos").select("*").eq("agendamento_id", agendamentoId).order("criado_em");
    if (error) { notify(msgErro(error), "erro"); return; }
    const lista = (data ?? []) as Foto[];
    if (lista.length) {
      const { data: urls } = await sb.storage.from("fotos").createSignedUrls(lista.map((f) => f.path), 3600);
      for (const f of lista) f.url = urls?.find((u) => u.path === f.path)?.signedUrl ?? undefined;
    }
    setFotos(lista);
  }, [sb, agendamentoId, notify]);
  useEffect(() => { carregar(); }, [carregar]);

  async function enviar(arquivos: FileList | null) {
    const lista = Array.from(arquivos ?? []).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!lista.length) return;
    setEnviando(lista.length);
    let ok = 0;
    for (const f of lista) {
      const blob = await comprimir(f);
      const ext = blob.type === "image/jpeg" ? "jpg" : (f.name.split(".").pop() ?? "img").toLowerCase();
      const path = `${agendamentoId}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from("fotos").upload(path, blob, { contentType: blob.type || f.type, upsert: false });
      if (up.error) { notify(`Não subiu ${f.name}: ${msgErro(up.error)}`, "erro"); continue; }
      const ins = await sb.from("fotos").insert({ agendamento_id: agendamentoId, path });
      if (ins.error) { await sb.storage.from("fotos").remove([path]); notify(msgErro(ins.error), "erro"); continue; }
      ok++;
      setEnviando((n) => n - 1);
    }
    setEnviando(0);
    if (ok) notify(`${ok} foto(s) salva(s).`);
    carregar();
  }

  async function tirar(f: Foto) {
    const r = await sb.from("fotos").delete().eq("id", f.id);
    if (r.error) { notify(msgErro(r.error), "erro"); return; }
    await sb.storage.from("fotos").remove([f.path]);
    carregar();
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Fotos do carro</span>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50">
          <Camera size={14} /> {enviando ? `Enviando ${enviando}…` : "Adicionar fotos"}
          <input type="file" accept="image/*" multiple className="hidden" disabled={enviando > 0} onChange={(e) => { enviar(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      {fotos.length === 0 ? <p className="text-xs text-neutral-500">Nenhuma foto. Tire na chegada (riscos, amassados, painel) para evitar discussão depois.</p> : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((f) => (
            <div key={f.id} className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
              {f.url ? (
                <a href={f.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt="Foto do carro" className="h-full w-full object-cover" />
                </a>
              ) : null}
              <button aria-label="Apagar foto" onClick={() => setApagar(f)} className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-red-600 shadow"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
      {apagar ? <ConfirmDialog titulo="Apagar foto" texto="A foto será apagada de vez." confirmar="Apagar" perigo onCancel={() => setApagar(null)} onConfirm={() => { tirar(apagar); setApagar(null); }} /> : null}
    </div>
  );
}
