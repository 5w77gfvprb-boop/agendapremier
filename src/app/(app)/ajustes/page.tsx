"use client";

import { KeyRound, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { Backup } from "@/components/Backup";
import { useState } from "react";
import { msgErro, useApp, type ItemChecklist } from "@/components/AppShell";
import { Button, ConfirmDialog, inputCls } from "@/components/ui";
import { dataBR, duracaoTxt, type Horario, type Local, type Mecanico, type Servico, type TipoLocal } from "@/lib/agenda";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const CORES = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#ca8a04", "#525252"];
const small = "rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm";

function Secao({ titulo, desc, children }: { titulo: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-100 px-4 py-2.5"><h2 className="text-sm font-semibold">{titulo}</h2>{desc ? <p className="text-xs text-neutral-500">{desc}</p> : null}</div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function Ajustes() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-neutral-900">Ajustes</h1>
      <Mecanicos />
      <Locais />
      <Servicos />
      <Checklist />
      <Horarios />
      <Folgas />
      <Backup />
      <Secao titulo="Sua conta" desc="Senha de quem está usando agora.">
        <Link href="/nova-senha" className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium"><KeyRound size={15} /> Trocar minha senha</Link>
      </Secao>
    </div>
  );
}

/** Salva uma linha; avisa e recarrega os cadastros. */
function useSalvar() {
  const { sb, notify, recarregarCadastros } = useApp();
  return async (tabela: string, linha: Record<string, unknown>, id?: string) => {
    const r = id ? await sb.from(tabela).update(linha).eq("id", id) : await sb.from(tabela).insert(linha);
    if (r.error) {
      notify(r.error.code === "23505" ? "Já existe um cadastro com esse nome." : msgErro(r.error), "erro");
      return false;
    }
    await recarregarCadastros();
    notify("Salvo.");
    return true;
  };
}
function useApagar() {
  const { sb, notify, recarregarCadastros } = useApp();
  return async (tabela: string, id: string) => {
    const r = await sb.from(tabela).delete().eq("id", id);
    if (r.error) {
      notify(r.error.code === "23503" ? "Tem agendamentos ligados: em vez de apagar, desmarque “ativo”." : msgErro(r.error), "erro");
      return;
    }
    await recarregarCadastros();
    notify("Apagado.");
  };
}

function Mecanicos() {
  const { cad } = useApp();
  const salvar = useSalvar(); const apagar = useApagar();
  const [novo, setNovo] = useState("");
  return (
    <Secao titulo="Mecânicos" desc="Desmarque “ativo” para tirar da agenda sem perder o histórico.">
      <ul className="space-y-2">
        {cad.mecanicos.map((m) => <LinhaMecanico key={m.id} m={m} onSalvar={(x) => salvar("mecanicos", x, m.id)} onApagar={() => apagar("mecanicos", m.id)} />)}
      </ul>
      <div className="mt-3 flex gap-2">
        <input className={`${inputCls} max-w-xs`} placeholder="Nome do mecânico" value={novo} onChange={(e) => setNovo(e.target.value)} />
        <Button disabled={!novo.trim()} onClick={async () => { if (await salvar("mecanicos", { nome: novo.trim(), cor: CORES[cad.mecanicos.length % CORES.length], ordem: cad.mecanicos.length + 1 })) setNovo(""); }}><Plus size={14} /> Adicionar</Button>
      </div>
    </Secao>
  );
}
function LinhaMecanico({ m, onSalvar, onApagar }: { m: Mecanico; onSalvar: (x: Record<string, unknown>) => void; onApagar: () => void }) {
  const [nome, setNome] = useState(m.nome); const [cor, setCor] = useState(m.cor); const [ativo, setAtivo] = useState(m.ativo);
  const [conf, setConf] = useState(false);
  const mudou = nome !== m.nome || cor !== m.cor || ativo !== m.ativo;
  return (
    <li className="flex flex-wrap items-center gap-2">
      <input type="color" aria-label="Cor" className="h-9 w-10 rounded border border-neutral-300" value={cor} onChange={(e) => setCor(e.target.value)} />
      <input className={`${small} w-48`} value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome" />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> ativo</label>
      {mudou ? <Button variant="primary" onClick={() => onSalvar({ nome: nome.trim(), cor, ativo })} disabled={!nome.trim()}>Salvar</Button> : null}
      <Button variant="ghost" aria-label="Apagar" onClick={() => setConf(true)}><Trash2 size={14} /></Button>
      {conf ? <ConfirmDialog titulo="Apagar mecânico" texto={`Apagar ${m.nome}? Se ele já tem agendamentos, desmarque “ativo” em vez de apagar.`} confirmar="Apagar" perigo onCancel={() => setConf(false)} onConfirm={() => { setConf(false); onApagar(); }} /> : null}
    </li>
  );
}

function Locais() {
  const { cad } = useApp();
  const salvar = useSalvar(); const apagar = useApagar();
  const [novo, setNovo] = useState(""); const [tipo, setTipo] = useState<TipoLocal>("elevador");
  return (
    <Secao titulo="Elevadores e rampa" desc="Serviço “no elevador” só vai para elevador; serviço “na rampa” vai para a rampa.">
      <ul className="space-y-2">{cad.locais.map((l) => <LinhaLocal key={l.id} l={l} onSalvar={(x) => salvar("locais", x, l.id)} onApagar={() => apagar("locais", l.id)} />)}</ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className={`${inputCls} max-w-xs`} placeholder="Ex.: Elevador 4" value={novo} onChange={(e) => setNovo(e.target.value)} />
        <select className={small} value={tipo} onChange={(e) => setTipo(e.target.value as TipoLocal)}><option value="elevador">Elevador</option><option value="rampa">Rampa</option></select>
        <Button disabled={!novo.trim()} onClick={async () => { if (await salvar("locais", { nome: novo.trim(), tipo, ordem: cad.locais.length + 1 })) setNovo(""); }}><Plus size={14} /> Adicionar</Button>
      </div>
    </Secao>
  );
}
function LinhaLocal({ l, onSalvar, onApagar }: { l: Local; onSalvar: (x: Record<string, unknown>) => void; onApagar: () => void }) {
  const [nome, setNome] = useState(l.nome); const [tipo, setTipo] = useState(l.tipo); const [ativo, setAtivo] = useState(l.ativo); const [ordem, setOrdem] = useState(String(l.ordem));
  const [conf, setConf] = useState(false);
  const mudou = nome !== l.nome || tipo !== l.tipo || ativo !== l.ativo || Number(ordem) !== l.ordem;
  return (
    <li className="flex flex-wrap items-center gap-2">
      <input className={`${small} w-14 text-right`} type="number" aria-label="Ordem na agenda" value={ordem} onChange={(e) => setOrdem(e.target.value)} />
      <input className={`${small} w-48`} value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome" />
      <select className={small} value={tipo} onChange={(e) => setTipo(e.target.value as TipoLocal)} aria-label="Tipo"><option value="elevador">Elevador</option><option value="rampa">Rampa</option></select>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> ativo</label>
      {mudou ? <Button variant="primary" onClick={() => onSalvar({ nome: nome.trim(), tipo, ativo, ordem: Number(ordem) || 0 })} disabled={!nome.trim()}>Salvar</Button> : null}
      <Button variant="ghost" aria-label="Apagar" onClick={() => setConf(true)}><Trash2 size={14} /></Button>
      {conf ? <ConfirmDialog titulo="Apagar" texto={`Apagar ${l.nome}? Se já tem agendamentos, desmarque “ativo”.`} confirmar="Apagar" perigo onCancel={() => setConf(false)} onConfirm={() => { setConf(false); onApagar(); }} /> : null}
    </li>
  );
}

function Servicos() {
  const { cad } = useApp();
  const salvar = useSalvar(); const apagar = useApagar();
  const [novo, setNovo] = useState({ nome: "", duracao: "30", preco: "", local: "elevador" as TipoLocal | "" });
  return (
    <Secao titulo="Serviços" desc="Tempo e preço padrão: ao agendar, o sistema soma sozinho (e dá para mudar em cada agendamento). Mudar aqui não altera agendamentos já feitos.">
      <div className="mb-1 hidden gap-2 px-0.5 text-[11px] text-neutral-500 sm:flex"><span className="w-56">Serviço</span><span className="w-20">Minutos</span><span className="w-24">Preço R$</span><span>Onde</span></div>
      <ul className="space-y-2">{cad.servicos.map((s) => <LinhaServico key={s.id} s={s} onSalvar={(x) => salvar("servicos", x, s.id)} onApagar={() => apagar("servicos", s.id)} />)}</ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className={`${small} w-56`} placeholder="Ex.: Troca de óleo" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
        <input className={`${small} w-20 text-right`} type="number" min={5} step={5} value={novo.duracao} onChange={(e) => setNovo({ ...novo, duracao: e.target.value })} aria-label="Minutos" />
        <input className={`${small} w-24 text-right`} type="number" min={0} step="0.01" placeholder="0,00" value={novo.preco} onChange={(e) => setNovo({ ...novo, preco: e.target.value })} aria-label="Preço" />
        <select className={small} value={novo.local} onChange={(e) => setNovo({ ...novo, local: e.target.value as TipoLocal | "" })} aria-label="Onde"><option value="elevador">No elevador</option><option value="rampa">Na rampa</option><option value="">Sem elevador</option></select>
        <Button disabled={!novo.nome.trim() || !(Number(novo.duracao) >= 5)} onClick={async () => { if (await salvar("servicos", { nome: novo.nome.trim(), duracao_min: Number(novo.duracao), preco: Number(novo.preco || 0), local_tipo: novo.local || null })) setNovo({ nome: "", duracao: "30", preco: "", local: "elevador" }); }}><Plus size={14} /> Adicionar</Button>
      </div>
    </Secao>
  );
}
function LinhaServico({ s, onSalvar, onApagar }: { s: Servico; onSalvar: (x: Record<string, unknown>) => void; onApagar: () => void }) {
  const [nome, setNome] = useState(s.nome); const [dur, setDur] = useState(String(s.duracao_min)); const [preco, setPreco] = useState(String(s.preco));
  const [local, setLocal] = useState<TipoLocal | "">(s.local_tipo ?? ""); const [ativo, setAtivo] = useState(s.ativo);
  const [conf, setConf] = useState(false);
  const mudou = nome !== s.nome || Number(dur) !== s.duracao_min || Number(preco) !== s.preco || (local || null) !== s.local_tipo || ativo !== s.ativo;
  return (
    <li className="flex flex-wrap items-center gap-2">
      <input className={`${small} w-56`} value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Serviço" />
      <input className={`${small} w-20 text-right`} type="number" min={5} step={5} value={dur} onChange={(e) => setDur(e.target.value)} aria-label="Minutos" title={duracaoTxt(Number(dur) || 0)} />
      <input className={`${small} w-24 text-right`} type="number" min={0} step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} aria-label="Preço" />
      <select className={small} value={local} onChange={(e) => setLocal(e.target.value as TipoLocal | "")} aria-label="Onde"><option value="elevador">No elevador</option><option value="rampa">Na rampa</option><option value="">Sem elevador</option></select>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> ativo</label>
      {mudou ? <Button variant="primary" onClick={() => onSalvar({ nome: nome.trim(), duracao_min: Number(dur), preco: Number(preco || 0), local_tipo: local || null, ativo })} disabled={!nome.trim() || !(Number(dur) >= 5)}>Salvar</Button> : null}
      <Button variant="ghost" aria-label="Apagar" onClick={() => setConf(true)}><Trash2 size={14} /></Button>
      {conf ? <ConfirmDialog titulo="Apagar serviço" texto={`Apagar ${s.nome}? Agendamentos antigos continuam com o nome e o valor.`} confirmar="Apagar" perigo onCancel={() => setConf(false)} onConfirm={() => { setConf(false); onApagar(); }} /> : null}
    </li>
  );
}

function Checklist() {
  const { cad } = useApp();
  const salvar = useSalvar(); const apagar = useApagar();
  const [novo, setNovo] = useState("");
  return (
    <Secao titulo="Checklist de entrega" desc="Para concluir um serviço, todos os itens ativos precisam ser marcados e alguém precisa assinar como conferente.">
      <ul className="space-y-2">{cad.checklist.map((i) => <LinhaChecklist key={i.id} i={i} onSalvar={(x) => salvar("checklist_itens", x, i.id)} onApagar={() => apagar("checklist_itens", i.id)} />)}</ul>
      <div className="mt-3 flex gap-2">
        <input className={`${inputCls} max-w-md`} placeholder="Ex.: Nível de óleo conferido" value={novo} onChange={(e) => setNovo(e.target.value)} />
        <Button disabled={!novo.trim()} onClick={async () => { if (await salvar("checklist_itens", { texto: novo.trim(), ordem: cad.checklist.length + 1 })) setNovo(""); }}><Plus size={14} /> Adicionar</Button>
      </div>
    </Secao>
  );
}
function LinhaChecklist({ i, onSalvar, onApagar }: { i: ItemChecklist; onSalvar: (x: Record<string, unknown>) => void; onApagar: () => void }) {
  const [texto, setTexto] = useState(i.texto); const [ordem, setOrdem] = useState(String(i.ordem)); const [ativo, setAtivo] = useState(i.ativo);
  const mudou = texto !== i.texto || Number(ordem) !== i.ordem || ativo !== i.ativo;
  return (
    <li className="flex flex-wrap items-center gap-2">
      <input className={`${small} w-14 text-right`} type="number" aria-label="Ordem" value={ordem} onChange={(e) => setOrdem(e.target.value)} />
      <input className={`${small} min-w-0 flex-1`} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Item" />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> ativo</label>
      {mudou ? <Button variant="primary" onClick={() => onSalvar({ texto: texto.trim(), ordem: Number(ordem) || 0, ativo })} disabled={!texto.trim()}>Salvar</Button> : null}
      <Button variant="ghost" aria-label="Apagar" onClick={onApagar}><Trash2 size={14} /></Button>
    </li>
  );
}

function Horarios() {
  const { cad, sb, notify, recarregarCadastros } = useApp();
  const [h, setH] = useState<Horario[]>(cad.horarios);
  const mudou = JSON.stringify(h) !== JSON.stringify(cad.horarios);
  const set = (d: number, x: Partial<Horario>) => setH((l) => l.map((y) => (y.dia_semana === d ? { ...y, ...x } : y)));
  async function salvar() {
    for (const x of h) {
      const { error } = await sb.from("horarios").update({ aberto: x.aberto, abre: x.abre, fecha: x.fecha, almoco_ini: x.almoco_ini || null, almoco_fim: x.almoco_fim || null }).eq("dia_semana", x.dia_semana);
      if (error) { notify(`${DIAS[x.dia_semana]}: ${error.message.includes("check") ? "horário inválido (o almoço precisa ficar dentro do expediente)" : msgErro(error)}`, "erro"); return; }
    }
    await recarregarCadastros(); notify("Horários salvos.");
  }
  return (
    <Secao titulo="Horário de funcionamento" desc="A agenda só deixa marcar dentro do expediente e fora do almoço (com a opção de encaixe para exceções).">
      <ul className="space-y-1.5">
        {h.map((x) => (
          <li key={x.dia_semana} className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex w-28 items-center gap-1.5"><input type="checkbox" checked={x.aberto} onChange={(e) => set(x.dia_semana, { aberto: e.target.checked })} /> {DIAS[x.dia_semana]}</label>
            {x.aberto ? (
              <>
                <input className={small} type="time" step={900} value={x.abre} onChange={(e) => set(x.dia_semana, { abre: e.target.value })} aria-label="Abre" />
                <span className="text-xs text-neutral-500">às</span>
                <input className={small} type="time" step={900} value={x.fecha} onChange={(e) => set(x.dia_semana, { fecha: e.target.value })} aria-label="Fecha" />
                <span className="ml-2 text-xs text-neutral-500">almoço</span>
                <input className={small} type="time" step={900} value={x.almoco_ini ?? ""} onChange={(e) => set(x.dia_semana, { almoco_ini: e.target.value || null, almoco_fim: e.target.value ? x.almoco_fim ?? "" : null })} aria-label="Almoço de" />
                <span className="text-xs text-neutral-500">às</span>
                <input className={small} type="time" step={900} value={x.almoco_fim ?? ""} onChange={(e) => set(x.dia_semana, { almoco_fim: e.target.value || null })} aria-label="Almoço até" />
              </>
            ) : <span className="text-xs text-neutral-500">fechado</span>}
          </li>
        ))}
      </ul>
      {mudou ? <div className="mt-3"><Button variant="primary" onClick={salvar}>Salvar horários</Button></div> : null}
    </Secao>
  );
}

function Folgas() {
  const { cad, sb, notify, recarregarCadastros } = useApp();
  const [dia, setDia] = useState(""); const [motivo, setMotivo] = useState("");
  async function add() {
    const { error } = await sb.from("folgas").upsert({ dia, motivo: motivo.trim() || null });
    if (error) { notify(msgErro(error), "erro"); return; }
    setDia(""); setMotivo(""); await recarregarCadastros();
  }
  async function tirar(d: string) {
    const { error } = await sb.from("folgas").delete().eq("dia", d);
    if (error) { notify(msgErro(error), "erro"); return; }
    await recarregarCadastros();
  }
  return (
    <Secao titulo="Feriados e dias sem expediente" desc="Nesses dias a agenda não oferece horários (agendamentos que já existiam continuam lá).">
      <ul className="space-y-1">
        {cad.folgas.map((f) => (
          <li key={f.dia} className="flex items-center gap-2 text-sm"><span className="w-24 tabular-nums">{dataBR(f.dia)}</span><span className="flex-1 text-neutral-600">{f.motivo}</span><Button variant="ghost" aria-label="Tirar" onClick={() => tirar(f.dia)}><Trash2 size={14} /></Button></li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className={small} type="date" value={dia} onChange={(e) => setDia(e.target.value)} aria-label="Dia" />
        <input className={`${small} w-56`} placeholder="Motivo (ex.: Natal)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <Button disabled={!dia} onClick={add}><Plus size={14} /> Adicionar</Button>
      </div>
    </Secao>
  );
}
