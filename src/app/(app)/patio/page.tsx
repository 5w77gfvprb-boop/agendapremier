"use client";

import { MessageCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AgendamentoForm, DetalheAgendamento, SELECT_AG } from "@/components/Agendamento";
import { msgErro, useApp } from "@/components/AppShell";
import { Button } from "@/components/ui";
import { Selos } from "@/components/Selos";
import { brl, dataBR, dataSP, hojeSP, horaSP, linkWhats, mensagemPronto, nomeSeguradora, placaFmt, type Agendamento } from "@/lib/agenda";

const COLUNAS: { id: string; titulo: string; desc: string; filtro: (a: Agendamento) => boolean }[] = [
  { id: "chegou", titulo: "Chegou", desc: "esperando começar", filtro: (a) => (a.status === "agendado" || a.status === "confirmado") && !!a.chegou_em },
  { id: "servico", titulo: "Em serviço", desc: "no elevador/rampa", filtro: (a) => a.status === "em_andamento" },
  { id: "peca", titulo: "Aguardando peça", desc: "elevador liberado", filtro: (a) => a.status === "pausado" },
  { id: "pronto", titulo: "Pronto para retirar", desc: "avise o cliente", filtro: (a) => a.status === "concluido" && !a.entregue_em },
];

const desde = (ts?: string | null) => {
  if (!ts) return "";
  const d = dataSP(ts);
  return d === hojeSP() ? `hoje ${horaSP(ts)}` : `${dataBR(d).slice(0, 5)} ${horaSP(ts)}`;
};

export default function Patio() {
  const { sb, notify, cad } = useApp();
  const [lista, setLista] = useState<Agendamento[]>([]);
  const [aberto, setAberto] = useState<Agendamento | null>(null);
  const [editar, setEditar] = useState<Agendamento | null>(null);
  const [remarcar, setRemarcar] = useState<Agendamento | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await sb.from("agendamentos").select(SELECT_AG).eq("tipo", "servico").is("entregue_em", null)
      .in("status", ["agendado", "confirmado", "em_andamento", "pausado", "concluido"]).order("inicio").limit(500);
    if (error) { notify(msgErro(error), "erro"); return; }
    setLista(((data ?? []) as Agendamento[]).map((a) => ({ ...a, valor_total: Number(a.valor_total) })));
  }, [sb, notify]);
  useEffect(() => { carregar(); }, [carregar]);

  async function retirou(a: Agendamento) {
    const { error } = await sb.rpc("marcar_entregue", { p_id: a.id, p_entregue: true });
    if (error) { notify(msgErro(error), "erro"); return; }
    notify(`${a.clientes?.nome ?? "Carro"} retirado.`); carregar();
  }

  const noPatio = lista.filter((a) => COLUNAS.some((c) => c.filtro(a)));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Pátio · {noPatio.length} carro(s) na oficina</h1>
        <p className="text-xs text-neutral-500">Onde está cada carro, da chegada até o cliente retirar.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUNAS.map((c) => {
          const meus = lista.filter(c.filtro);
          return (
            <section key={c.id} className="rounded-xl border border-neutral-200 bg-white">
              <div className="border-b border-neutral-100 px-3 py-2">
                <div className="text-sm font-semibold">{c.titulo} <span className="font-normal text-neutral-500">({meus.length})</span></div>
                <div className="text-xs text-neutral-500">{c.desc}</div>
              </div>
              <div className="space-y-2 p-2">
                {meus.length === 0 ? <p className="px-1 py-3 text-center text-xs text-neutral-400">Nenhum</p> : meus.map((a) => {
                  const mec = cad.mecanicos.find((m) => m.id === a.mecanico_id);
                  const loc = cad.locais.find((l) => l.id === a.local_id);
                  const zap = c.id === "pronto" ? linkWhats(a.clientes?.telefone ?? null, mensagemPronto(a.clientes?.nome ?? "", a.veiculos?.placa)) : null;
                  return (
                    <div key={a.id} className="rounded-lg border border-neutral-200 p-2.5 text-sm" style={{ borderLeft: `4px solid ${mec?.cor ?? "#525252"}` }}>
                      <button className="block w-full text-left" onClick={() => setAberto(a)}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold">{a.clientes?.nome}</span>
                          <span className="text-xs text-neutral-500">{a.veiculos ? placaFmt(a.veiculos.placa) : ""}</span>
                        </div>
                        <div className="text-xs text-neutral-600">{(a.agendamento_itens ?? []).map((i) => i.descricao).join(", ")}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {mec?.nome}{c.id === "servico" && loc ? ` · ${loc.nome}` : ""} · {nomeSeguradora(a.seguradora)} · {brl(a.valor_total)}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {c.id === "pronto" ? `pronto ${desde(a.fim_real)}` : c.id === "chegou" ? `chegou ${desde(a.chegou_em)} · marcado ${horaSP(a.inicio)}` : c.id === "servico" ? `começou ${desde(a.inicio_real)} · previsto até ${desde(a.fim)}` : `na oficina desde ${desde(a.chegou_em)}`}
                          {a.espera === "aguarda" ? " · cliente aguardando" : ""}
                        </div>
                        {c.id === "chegou" || a.cortesia ? <div className="mt-1 flex flex-wrap gap-1"><Selos a={c.id === "chegou" ? a : { ...a, confirmado_em: null, confirmacao_enviada_em: null, status: "concluido" }} /></div> : null}
                      </button>
                      {c.id === "pronto" ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {zap ? <a href={zap} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"><MessageCircle size={12} /> Avisar</a> : null}
                          <Button className="!px-2 !py-1 !text-xs" onClick={() => retirou(a)}>Cliente retirou</Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {aberto ? <DetalheAgendamento a={aberto} onClose={() => setAberto(null)} onMudou={carregar} onEditar={() => { setEditar(aberto); setAberto(null); }} onRemarcar={() => { setRemarcar(aberto); setAberto(null); }} /> : null}
      {editar ? <AgendamentoForm editar={editar} inicial={{ data: hojeSP() }} onClose={() => setEditar(null)} onSalvo={carregar} /> : null}
      {remarcar ? <AgendamentoForm editar={remarcar} remarcar inicial={{ data: hojeSP() }} onClose={() => setRemarcar(null)} onSalvo={carregar} /> : null}
    </div>
  );
}
