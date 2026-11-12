"use client";

import { MessageCircle, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AgendamentoForm } from "@/components/Agendamento";
import { msgErro, useApp } from "@/components/AppShell";
import { ContatoForm } from "@/components/Contatos";
import { Button, ConfirmDialog, Segmentado, Vazio } from "@/components/ui";
import { dataBR, dataSP, hojeSP, linkWhats, somarDias, type Contato } from "@/lib/agenda";

type Aba = "abertos" | "resolvidos";
const msg = (c: Contato) => `Olá, ${c.nome.split(" ")[0]}! Aqui é do Centro Automotivo Premier. Você falou com a gente${c.interesse ? ` sobre ${c.interesse.toLowerCase()}` : ""}. Quer que eu já deixe um horário reservado?`;

export default function Retornos() {
  const { sb, notify, avisos } = useApp();
  const [aba, setAba] = useState<Aba>("abertos");
  const [lista, setLista] = useState<Contato[]>([]);
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<Contato | null>(null);
  const [agendar, setAgendar] = useState<Contato | null>(null);
  const [apagar, setApagar] = useState<Contato | null>(null);

  const carregar = useCallback(async () => {
    const q = aba === "abertos"
      ? sb.from("contatos").select("*").eq("status", "aberto").order("lembrar_em").order("criado_em")
      : sb.from("contatos").select("*").neq("status", "aberto").order("resolvido_em", { ascending: false }).limit(200);
    const { data, error } = await q;
    if (error) { notify(msgErro(error), "erro"); return; }
    setLista((data ?? []) as Contato[]);
    avisos.recarregar();
  }, [sb, aba, notify, avisos]);
  useEffect(() => { carregar(); }, [carregar]);

  async function atualizar(c: Contato, campos: Record<string, unknown>, ok: string) {
    const { error } = await sb.from("contatos").update(campos).eq("id", c.id);
    if (error) { notify(msgErro(error), "erro"); return; }
    notify(ok); carregar();
  }
  async function excluir(c: Contato) {
    const { error } = await sb.from("contatos").delete().eq("id", c.id);
    if (error) { notify(msgErro(error), "erro"); return; }
    carregar();
  }

  const hoje = hojeSP();
  const vencidos = lista.filter((c) => c.lembrar_em <= hoje);
  const depois = lista.filter((c) => c.lembrar_em > hoje);

  const Item = ({ c }: { c: Contato }) => {
    const zap = linkWhats(c.telefone, msg(c));
    const dig = (c.telefone ?? "").replace(/\D/g, "");
    return (
      <li className="space-y-1.5 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-semibold text-neutral-900">{c.nome}</span>
          <span className="text-xs text-neutral-500">{c.telefone ?? "sem telefone"}</span>
          <span className={`ml-auto text-xs ${aba === "abertos" && c.lembrar_em < hoje ? "font-medium text-red-700" : "text-neutral-500"}`}>
            {aba === "abertos" ? (c.lembrar_em < hoje ? `atrasado desde ${dataBR(c.lembrar_em).slice(0, 5)}` : c.lembrar_em === hoje ? "lembrar hoje" : `lembrar ${dataBR(c.lembrar_em).slice(0, 5)}`)
              : c.status === "agendado" ? "agendou" : "desistiu"} · anotado {dataBR(dataSP(c.criado_em)).slice(0, 5)}
          </span>
        </div>
        {c.interesse ? <div className="text-neutral-700">{c.interesse}</div> : null}
        {c.observacoes ? <div className="whitespace-pre-line text-xs text-neutral-500">{c.observacoes}</div> : null}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {aba === "abertos" ? (
            <>
              <Button variant="primary" className="!px-2.5 !py-1 !text-xs" onClick={() => setAgendar(c)}>Agendar</Button>
              {zap ? <a href={zap} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"><MessageCircle size={12} /> WhatsApp</a> : null}
              {dig.length >= 10 ? <a href={`tel:${dig}`} className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium"><Phone size={12} /> Ligar</a> : null}
              <Button className="!px-2.5 !py-1 !text-xs" onClick={() => atualizar(c, { lembrar_em: somarDias(hoje, 1) }, "Lembro amanhã.")}>Lembrar amanhã</Button>
              <Button className="!px-2.5 !py-1 !text-xs" onClick={() => atualizar(c, { lembrar_em: somarDias(hoje, 7) }, "Lembro daqui a uma semana.")}>Daqui 1 semana</Button>
              <Button variant="danger" className="!px-2.5 !py-1 !text-xs" onClick={() => atualizar(c, { status: "desistiu", resolvido_em: new Date().toISOString() }, "Marcado como desistiu.")}>Desistiu</Button>
            </>
          ) : (
            <Button className="!px-2.5 !py-1 !text-xs" onClick={() => atualizar(c, { status: "aberto", resolvido_em: null, lembrar_em: hoje }, "Voltou para os retornos.")}>Voltar para retornos</Button>
          )}
          <Button variant="ghost" className="!px-2 !py-1" aria-label="Editar" onClick={() => setEditar(c)}><Pencil size={13} /></Button>
          <Button variant="ghost" className="!px-2 !py-1" aria-label="Excluir" onClick={() => setApagar(c)}><Trash2 size={13} /></Button>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Retornos</h1>
          <p className="text-xs text-neutral-500">Quem ligou e ficou de agendar. Fica aqui até agendar ou desistir.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Segmentado valor={aba} onChange={setAba} opcoes={[{ id: "abertos", label: "Para retornar" }, { id: "resolvidos", label: "Resolvidos" }]} />
          <Button variant="primary" onClick={() => setNovo(true)}><Plus size={15} /> Anotar contato</Button>
        </div>
      </div>
      {aba === "abertos" ? (
        <>
          <section className="rounded-xl border border-neutral-200 bg-white">
            <h2 className="border-b border-neutral-100 px-4 py-2.5 text-sm font-semibold">Para hoje {vencidos.length ? `(${vencidos.length})` : ""}</h2>
            {vencidos.length ? <ul className="divide-y divide-neutral-100">{vencidos.map((c) => <Item key={c.id} c={c} />)}</ul> : <Vazio>Nenhum retorno para hoje.</Vazio>}
          </section>
          {depois.length ? (
            <section className="rounded-xl border border-neutral-200 bg-white">
              <h2 className="border-b border-neutral-100 px-4 py-2.5 text-sm font-semibold">Próximos dias ({depois.length})</h2>
              <ul className="divide-y divide-neutral-100">{depois.map((c) => <Item key={c.id} c={c} />)}</ul>
            </section>
          ) : null}
        </>
      ) : (
        <section className="rounded-xl border border-neutral-200 bg-white">
          {lista.length ? <ul className="divide-y divide-neutral-100">{lista.map((c) => <Item key={c.id} c={c} />)}</ul> : <Vazio>Nada resolvido ainda.</Vazio>}
        </section>
      )}
      {novo || editar ? <ContatoForm editar={editar} onClose={() => { setNovo(false); setEditar(null); }} onSalvo={carregar} /> : null}
      {agendar ? (
        <AgendamentoForm inicial={{ data: hojeSP() }} contato={{ nome: agendar.nome, telefone: agendar.telefone, obs: [agendar.interesse, agendar.observacoes].filter(Boolean).join(" — ") || null }}
          onClose={() => setAgendar(null)}
          onSalvo={(id) => atualizar(agendar, { status: "agendado", agendamento_id: id ?? null, resolvido_em: new Date().toISOString() }, "Agendado: saiu dos retornos.")} />
      ) : null}
      {apagar ? <ConfirmDialog titulo="Excluir contato" texto={`Excluir ${apagar.nome} da lista?`} confirmar="Excluir" perigo onCancel={() => setApagar(null)} onConfirm={() => { excluir(apagar); setApagar(null); }} /> : null}
    </div>
  );
}
