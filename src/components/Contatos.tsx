"use client";

import { useState } from "react";
import { msgErro, useApp } from "@/components/AppShell";
import { Button, Field, Modal, inputCls } from "@/components/ui";
import { hojeSP, somarDias, type Contato } from "@/lib/agenda";

/** Anotar (ou editar) um cliente que ligou e ficou de agendar. */
export function ContatoForm({ editar, onClose, onSalvo }: { editar?: Contato | null; onClose: () => void; onSalvo: () => void }) {
  const { sb, notify } = useApp();
  const [nome, setNome] = useState(editar?.nome ?? "");
  const [tel, setTel] = useState(editar?.telefone ?? "");
  const [interesse, setInteresse] = useState(editar?.interesse ?? "");
  const [obs, setObs] = useState(editar?.observacoes ?? "");
  const [lembrar, setLembrar] = useState(editar?.lembrar_em ?? somarDias(hojeSP(), 1));
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    const linha = { nome: nome.trim(), telefone: tel.trim() || null, interesse: interesse.trim() || null, observacoes: obs.trim() || null, lembrar_em: lembrar };
    const r = editar ? await sb.from("contatos").update(linha).eq("id", editar.id) : await sb.from("contatos").insert(linha);
    setSalvando(false);
    if (r.error) { notify(msgErro(r.error), "erro"); return; }
    onSalvo(); onClose();
  }
  return (
    <Modal titulo={editar ? "Editar contato" : "Anotar contato para retornar"} onClose={onClose} largura="max-w-md">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-neutral-500">Cliente ligou e ficou de agendar? Anote aqui: ele aparece em Retornos no dia de lembrar, até você agendar ou marcar que desistiu.</p>
        <Field label="Nome"><input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></Field>
        <Field label="Telefone (WhatsApp)"><input className={inputCls} inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="(31) 9…" /></Field>
        <Field label="O que ele quer"><input className={inputCls} value={interesse} onChange={(e) => setInteresse(e.target.value)} placeholder="Ex.: alinhamento e barulho na suspensão" /></Field>
        <Field label="Observações"><textarea className={inputCls} rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Carro, melhor horário, valor que passou…" /></Field>
        <Field label="Lembrar em">
          <div className="flex flex-wrap items-center gap-1.5">
            <input className={`${inputCls} !w-auto`} type="date" value={lembrar} onChange={(e) => setLembrar(e.target.value)} />
            {[["Hoje", 0], ["Amanhã", 1], ["3 dias", 3], ["1 semana", 7]].map(([l, n]) => (
              <button key={l} type="button" className="rounded-md border border-neutral-300 px-2 py-1 text-xs" onClick={() => setLembrar(somarDias(hojeSP(), n as number))}>{l}</button>
            ))}
          </div>
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Fechar</Button>
          <Button variant="primary" disabled={salvando || !nome.trim() || !lembrar} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </div>
      </div>
    </Modal>
  );
}
