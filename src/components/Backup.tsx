"use client";

import { Archive, Download, FileUp, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { msgErro, useApp } from "@/components/AppShell";
import { Button, Field, Modal, inputCls } from "@/components/ui";
import { hojeSP } from "@/lib/agenda";

type ArquivoBackup = { sistema?: string; gerado_em?: string; tabelas: Record<string, unknown[]> };
type Copia = { id: string; criado_em: string; tipo: string; linhas: number };

const TIPO: Record<string, string> = { automatico: "Automática (semanal)", manual: "Feita por você", antes_de_restaurar: "Segurança (antes de uma restauração)" };
const NOME_TABELA: Record<string, string> = {
  agendamentos: "Agendamentos e bloqueios", agendamento_itens: "Serviços dos agendamentos", clientes: "Clientes", veiculos: "Veículos",
  contatos: "Retornos", mecanicos: "Mecânicos", locais: "Elevadores e rampa", servicos: "Serviços", horarios: "Horários",
  folgas: "Folgas e feriados", checklist_itens: "Itens do checklist", fotos: "Fotos (só a lista)",
};
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

function baixarArquivo(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function Backup() {
  const { sb, notify } = useApp();
  const [trabalhando, setTrabalhando] = useState<"" | "baixar" | "copia">("");
  const [copias, setCopias] = useState<Copia[]>([]);
  const [ultimo, setUltimo] = useState<string | null | undefined>(undefined);
  const [diasDesde, setDiasDesde] = useState<number | null>(null);
  const [restaurar, setRestaurar] = useState<null | { rotulo: string; copiaId?: string; arquivo?: ArquivoBackup }>(null);

  const carregar = useCallback(async () => {
    const [c, d] = await Promise.all([
      sb.from("backups_guardados").select("id,criado_em,tipo,linhas").order("criado_em", { ascending: false }),
      sb.from("backup_log").select("criado_em").eq("tipo", "download").order("criado_em", { ascending: false }).limit(1),
    ]);
    setCopias((c.data ?? []) as Copia[]);
    const u: string | null = d.data?.[0]?.criado_em ?? null;
    setUltimo(u);
    setDiasDesde(u ? Math.floor((Date.now() - new Date(u).getTime()) / 86_400_000) : null);
  }, [sb]);
  useEffect(() => { carregar(); }, [carregar]);

  async function registrarDownload() {
    await sb.rpc("registrar_download_backup");
    window.dispatchEvent(new Event("backup-baixado"));
    carregar();
  }

  async function baixar() {
    setTrabalhando("baixar");
    try {
      const { data, error } = await sb.rpc("exportar_backup");
      if (error) throw error;
      baixarArquivo(new Blob([JSON.stringify(data)], { type: "application/json" }), `backup_agenda_${hojeSP()}.json`);
      await registrarDownload();
      notify("Backup baixado. Guarde o arquivo no Drive ou mande para o seu e-mail.");
    } catch (e) { notify(msgErro(e), "erro"); } finally { setTrabalhando(""); }
  }

  async function guardarCopia() {
    setTrabalhando("copia");
    const { error } = await sb.rpc("salvar_backup", { p_tipo: "manual" });
    setTrabalhando("");
    if (error) notify(msgErro(error), "erro"); else { notify("Cópia guardada no sistema."); carregar(); }
  }

  async function baixarCopia(c: Copia) {
    const { data, error } = await sb.from("backups_guardados").select("dados").eq("id", c.id).single();
    if (error || !data) { notify(error ? msgErro(error) : "Cópia não encontrada.", "erro"); return; }
    baixarArquivo(new Blob([JSON.stringify(data.dados)], { type: "application/json" }), `backup_agenda_${c.criado_em.slice(0, 10)}.json`);
    await registrarDownload();
  }

  async function lerArquivo(f: File | undefined) {
    if (!f) return;
    try {
      const j = JSON.parse(await f.text()) as ArquivoBackup;
      if (!j || typeof j.tabelas !== "object") throw new Error("Este arquivo não é um backup do sistema.");
      if (j.sistema !== "agenda-premier") throw new Error("Este arquivo não é um backup da Agenda Premier (o do financeiro não serve aqui).");
      if (!Array.isArray(j.tabelas.mecanicos) || j.tabelas.mecanicos.length === 0) throw new Error("Este arquivo não parece ser um backup completo.");
      setRestaurar({ rotulo: `arquivo ${f.name}${j.gerado_em ? `, de ${dataHora(j.gerado_em)}` : ""}`, arquivo: j });
    } catch (e) { notify(e instanceof SyntaxError ? "Não consegui ler o arquivo. Use o .json baixado aqui." : msgErro(e), "erro"); }
  }

  return (
    <section id="backup" className="scroll-mt-4 rounded-xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold">Backup</h2>
        <p className="text-xs text-neutral-500">
          O sistema guarda uma cópia sozinho toda semana (as 8 últimas), mas ela fica no mesmo banco. Por isso, uma vez por mês baixe o arquivo e guarde fora (Drive ou e-mail).
          As fotos não entram no arquivo: continuam no Supabase.
        </p>
      </div>
      <div className="space-y-3 p-4">
        <p className={`text-sm ${diasDesde === null || diasDesde >= 30 ? "text-amber-800" : "text-neutral-600"}`}>
          {ultimo === undefined ? "…" : ultimo === null ? "Nenhum backup baixado ainda." : `Último backup baixado: ${dataHora(ultimo)} (${diasDesde === 0 ? "hoje" : `há ${diasDesde} dia(s)`}).`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={baixar} disabled={!!trabalhando}><Download size={15} /> {trabalhando === "baixar" ? "Gerando…" : "Baixar backup"}</Button>
          <Button onClick={guardarCopia} disabled={!!trabalhando}><Archive size={15} /> {trabalhando === "copia" ? "Guardando…" : "Guardar uma cópia agora"}</Button>
          <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
            <FileUp size={15} /> Restaurar de um arquivo…
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { lerArquivo(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>

        <div className="rounded-lg border border-neutral-200">
          <div className="border-b border-neutral-100 px-3 py-2 text-xs font-medium text-neutral-600">Cópias guardadas no sistema</div>
          {copias.length === 0 ? <p className="px-3 py-3 text-sm text-neutral-500">Nenhuma ainda.</p> : (
            <ul className="divide-y divide-neutral-100">
              {copias.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm">
                  <span className="tabular-nums">{dataHora(c.criado_em)}</span>
                  <span className="min-w-0 flex-1 text-xs text-neutral-500">{TIPO[c.tipo] ?? c.tipo} · {c.linhas} registros</span>
                  <span className="flex gap-1.5">
                    <Button className="!px-2.5 !py-1 text-xs" onClick={() => baixarCopia(c)}><Download size={13} /> Baixar</Button>
                    <Button variant="danger" className="!px-2.5 !py-1 text-xs" onClick={() => setRestaurar({ rotulo: `cópia de ${dataHora(c.criado_em)}`, copiaId: c.id })}><RotateCcw size={13} /> Voltar para esta</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {restaurar ? <RestaurarModal alvo={restaurar} onClose={() => setRestaurar(null)} /> : null}
    </section>
  );
}

function RestaurarModal({ alvo, onClose }: { alvo: { rotulo: string; copiaId?: string; arquivo?: ArquivoBackup }; onClose: () => void }) {
  const { sb, notify } = useApp();
  const [texto, setTexto] = useState("");
  const [trabalhando, setTrabalhando] = useState(false);
  const contagem = alvo.arquivo ? Object.entries(alvo.arquivo.tabelas).filter(([, l]) => Array.isArray(l) && l.length > 0) : [];

  async function confirmar() {
    setTrabalhando(true);
    const { error } = alvo.copiaId
      ? await sb.rpc("restaurar_copia", { p_id: alvo.copiaId })
      : await sb.rpc("restaurar_backup", { p_dados: alvo.arquivo });
    setTrabalhando(false);
    if (error) { notify(`Nada foi alterado. ${msgErro(error)}`, "erro"); return; }
    notify("Agenda restaurada. Recarregando…");
    setTimeout(() => window.location.reload(), 1200);
  }

  return (
    <Modal titulo="Restaurar backup" onClose={onClose} largura="max-w-md">
      <div className="space-y-3 text-sm">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-red-900">
          Isto <b>troca todos os dados atuais</b> pelos do backup ({alvo.rotulo}). O que foi agendado ou alterado depois dele some.
        </p>
        <p className="text-neutral-600">Antes de trocar, o sistema guarda uma cópia do estado de agora, então dá para voltar atrás em “Cópias guardadas”. Se der qualquer erro, nada é alterado.</p>
        {contagem.length ? (
          <div className="max-h-36 overflow-auto rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-600">
            {contagem.map(([t, l]) => <div key={t} className="flex justify-between gap-3"><span>{NOME_TABELA[t] ?? t}</span><span className="tabular-nums">{l.length}</span></div>)}
          </div>
        ) : null}
        <Field label="Para confirmar, digite RESTAURAR">
          <input className={inputCls} value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" autoCapitalize="characters" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="danger" disabled={texto.trim().toUpperCase() !== "RESTAURAR" || trabalhando} onClick={confirmar}>{trabalhando ? "Restaurando…" : "Restaurar agora"}</Button>
        </div>
      </div>
    </Modal>
  );
}
