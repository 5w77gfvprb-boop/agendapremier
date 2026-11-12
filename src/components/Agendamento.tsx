"use client";

import { CalendarClock, Car, Clock, MessageCircle, Pencil, Plus, Repeat, Search, Trash2, User, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { msgErro, useApp } from "@/components/AppShell";
import { Selos } from "@/components/Selos";
import { Fotos } from "@/components/Fotos";
import { Button, ConfirmDialog, Field, Modal, inputCls } from "@/components/ui";
import {
  conflitos, dataBR, hojeSP, mensagemPronto, dataSP, duracaoTxt, horaSP, horariosLivres, hhmm, inicioFora, instante, limparPlaca, somarExpediente, linkWhats, localNecessario, mensagemConfirmacao,
  min, nomeDia, nomeSeguradora, placaFmt, placaValida, SEGURADORAS, somarDias, STATUS,
  type Agendamento, type Cliente, type Item, type Livre, type Seguradora, type Status, type TipoLocal, type Veiculo,
} from "@/lib/agenda";

export const SELECT_AG = "*, clientes(nome,telefone), veiculos(placa,modelo), agendamento_itens(*)";

/** Busca os agendamentos que tocam o intervalo de datas [de, ate]. */
export async function buscarAgendamentos(sb: ReturnType<typeof useApp>["sb"], de: string, ate: string): Promise<Agendamento[]> {
  const { data, error } = await sb.from("agendamentos").select(SELECT_AG)
    .lt("inicio", instante(somarDias(ate, 1), "00:00")).gt("fim", instante(de, "00:00")).order("inicio");
  if (error) throw error;
  return ((data ?? []) as Agendamento[]).map((a) => ({
    ...a, valor_total: Number(a.valor_total),
    agendamento_itens: [...(a.agendamento_itens ?? [])].sort((x, y) => (x.ordem ?? 0) - (y.ordem ?? 0)).map((i) => ({ ...i, preco: Number(i.preco) })),
  }));
}

export const nomeAg = (a: Agendamento) => (a.tipo === "bloqueio" ? a.titulo ?? "Bloqueio" : a.clientes?.nome ?? "Cliente");

/* ------------------------------------ Novo / editar ------------------------------------ */
type Inicial = { data: string; hora?: string; mecanico_id?: string | null; local_id?: string | null };

/** `editar` = muda este agendamento; `remarcar` = cria um novo a partir dele (o antigo fica "remarcado"). */
/** `contato` = veio da lista de retornos: já traz nome, telefone e o que o cliente quer. */
export function AgendamentoForm({ editar: base, remarcar = false, inicial, contato, onClose, onSalvo }: { editar?: Agendamento | null; remarcar?: boolean; inicial: Inicial; contato?: { nome: string; telefone: string | null; obs: string | null }; onClose: () => void; onSalvo: (id?: string) => void }) {
  const { sb, notify, cad } = useApp();
  const editar = remarcar ? null : base;
  const origem = base;   // de onde vêm os dados (edição ou remarcação)
  const ativosM = cad.mecanicos.filter((m) => m.ativo || m.id === origem?.mecanico_id);
  const ativosE = cad.locais.filter((e) => e.ativo || e.id === origem?.local_id);

  // cliente
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<{ cliente: Cliente; veiculo?: Veiculo }[]>([]);
  const [novoNome, setNovoNome] = useState(contato?.nome ?? "");
  const [telefone, setTelefone] = useState(contato?.telefone ?? "");
  const [parecidos, setParecidos] = useState<Cliente[]>([]);
  const [veiculoId, setVeiculoId] = useState<string>("");     // "" = novo
  const [placa, setPlaca] = useState("");
  const [modelo, setModelo] = useState("");
  const [seguradora, setSeguradora] = useState<Seguradora>(origem?.seguradora ?? "particular");
  const [sinistro, setSinistro] = useState(origem?.sinistro ?? "");
  const [cortesia, setCortesia] = useState(!!origem?.cortesia);

  // serviços
  const [itens, setItens] = useState<(Item & { local_tipo: TipoLocal | null })[]>(
    (origem?.agendamento_itens ?? []).map((i) => ({ ...i, local_tipo: i.servico_id ? cad.servicos.find((s) => s.id === i.servico_id)?.local_tipo ?? null : origem?.local_id ? cad.locais.find((l) => l.id === origem.local_id)?.tipo ?? null : null })),
  );
  const [outro, setOutro] = useState<{ descricao: string; duracao: string; preco: string; local: TipoLocal | "" }>({ descricao: "", duracao: "30", preco: "", local: "elevador" });

  // quando e quem
  const [data, setData] = useState(editar ? dataSP(editar.inicio) : inicial.data);
  const [hora, setHora] = useState(editar ? horaSP(editar.inicio) : inicial.hora ?? "08:00");
  const [mec, setMec] = useState<string>(origem?.mecanico_id ?? inicial.mecanico_id ?? (ativosM.length === 1 ? ativosM[0].id : ""));
  const [ele, setEle] = useState<string>(origem?.local_id ?? inicial.local_id ?? "");
  const [espera, setEspera] = useState<"aguarda" | "deixa" | "">(origem?.espera ?? "");
  const [entregaData, setEntregaData] = useState(editar?.entrega_prevista ? dataSP(editar.entrega_prevista) : "");
  const [entregaHora, setEntregaHora] = useState(editar?.entrega_prevista ? horaSP(editar.entrega_prevista) : "");
  const [encaixe, setEncaixe] = useState(false);
  const [obs, setObs] = useState(origem?.observacoes ?? contato?.obs ?? "");
  const concluido = editar?.status === "concluido";
  const [doDia, setDoDia] = useState<Agendamento[]>([]);
  const [sugestoes, setSugestoes] = useState<Livre[] | null>(null);
  const [salvando, setSalvando] = useState(false);

  // carrega o cliente do agendamento em edição
  useEffect(() => {
    if (!origem?.cliente_id) return;
    Promise.all([
      sb.from("clientes").select("*").eq("id", origem.cliente_id).single(),
      sb.from("veiculos").select("*").eq("cliente_id", origem.cliente_id).order("criado_em"),
    ]).then(([c, v]) => {
      if (c.data) { setCliente(c.data as Cliente); setTelefone((c.data as Cliente).telefone ?? ""); }
      setVeiculos((v.data ?? []) as Veiculo[]);
      setVeiculoId(origem.veiculo_id ?? "");
    });
  }, [origem, sb]);

  // busca de cliente por nome, telefone ou placa
  useEffect(() => {
    const t = busca.trim();
    if (t.length < 2) { setAchados([]); return; }
    const h = setTimeout(async () => {
      const p = limparPlaca(t);
      const [c, v] = await Promise.all([
        sb.from("clientes").select("*").or(`nome.ilike.%${t.replace(/[%,()]/g, "")}%,telefone.ilike.%${t.replace(/\D/g, "") || "x"}%`).order("nome").limit(8),
        p.length >= 3 ? sb.from("veiculos").select("*, clientes(*)").ilike("placa", `%${p}%`).limit(8) : Promise.resolve({ data: [] }),
      ]);
      const out: { cliente: Cliente; veiculo?: Veiculo }[] = [];
      for (const x of (v.data ?? []) as (Veiculo & { clientes: Cliente })[]) out.push({ cliente: x.clientes, veiculo: x });
      for (const x of (c.data ?? []) as Cliente[]) if (!out.some((o) => o.cliente.id === x.id)) out.push({ cliente: x });
      setAchados(out);
    }, 250);
    return () => clearTimeout(h);
  }, [busca, sb]);

  // cliente novo com nome ou telefone de alguém já cadastrado: avisa para não duplicar
  useEffect(() => {
    if (cliente) { setParecidos([]); return; }
    const nome = novoNome.trim().replace(/[%,()]/g, ""), dig = telefone.replace(/\D/g, "");
    if (nome.length < 3 && dig.length < 8) { setParecidos([]); return; }
    const h = setTimeout(async () => {
      const filtros = [nome.length >= 3 ? `nome.ilike.%${nome}%` : "", dig.length >= 8 ? `telefone.ilike.%${dig.slice(-4)}%` : ""].filter(Boolean).join(",");
      const { data } = await sb.from("clientes").select("*").or(filtros).limit(4);
      setParecidos((data ?? []) as Cliente[]);
    }, 400);
    return () => clearTimeout(h);
  }, [novoNome, telefone, cliente, sb]);

  async function escolherCliente(c: Cliente, v?: Veiculo) {
    setCliente(c); setBusca(""); setAchados([]); setTelefone(c.telefone ?? ""); setSeguradora(c.seguradora);
    const { data: vs } = await sb.from("veiculos").select("*").eq("cliente_id", c.id).order("criado_em");
    const lista = (vs ?? []) as Veiculo[];
    setVeiculos(lista);
    setVeiculoId(v?.id ?? (lista.length === 1 ? lista[0].id : ""));
  }

  // agenda do dia escolhido (para mostrar ocupados e avisar conflito)
  useEffect(() => {
    let ok = true;
    // serviço grande atravessa dias: traz duas semanas para conferir conflitos até o fim
    buscarAgendamentos(sb, data, somarDias(data, 14)).then((l) => { if (ok) setDoDia(l); }).catch((e) => notify(msgErro(e), "erro"));
    return () => { ok = false; };
  }, [data, sb, notify]);

  const duracao = itens.reduce((s, i) => s + Number(i.duracao_min || 0), 0);
  const precisa = localNecessario(itens.map((i) => i.local_tipo));
  const usaElevador = precisa !== null;
  const locaisOk = ativosE.filter((l) => !precisa || l.tipo === precisa || (precisa === "rampa" && l.id === ele));
  // fim pelo expediente (pula almoço/noite/fechado); encaixe = corrido, sem pular nada
  const fim = useMemo(() => {
    if (encaixe || concluido) { const m = min(hora) + duracao; return m < 24 * 60 ? { data, hora: hhmm(m) } : { data: somarDias(data, Math.floor(m / 1440)), hora: hhmm(m % 1440) }; }
    return somarExpediente(data, hora, duracao, cad.horarios, cad.folgas);
  }, [encaixe, concluido, data, hora, duracao, cad.horarios, cad.folgas]);
  const fimTxt = fim.data === data ? `às ${fim.hora}` : `${nomeDia(fim.data)} ${dataBR(fim.data).slice(0, 5)} às ${fim.hora}`;
  // o horário antigo de uma remarcação deixa de ocupar ao salvar
  const ignorar = editar?.id ?? (remarcar ? base?.id : null);
  const ocupados = useMemo(() => (duracao > 0 && !concluido ? conflitos({ data, inicio: hora, fim, mecanico: mec || null, local: ele || null, agendamentos: doDia, ignorar, nomes: nomeAg }) : []), [data, hora, fim, duracao, mec, ele, doDia, ignorar, concluido]);
  const foraExp = inicioFora(data, hora, cad.horarios, cad.folgas);
  const livre = (campo: "mecanico_id" | "local_id", id: string) => duracao <= 0 || conflitos({ data, inicio: hora, fim, mecanico: campo === "mecanico_id" ? id : null, local: campo === "local_id" ? id : null, agendamentos: doDia, ignorar, nomes: nomeAg }).length === 0;

  function alternarServico(id: string) {
    const s = cad.servicos.find((x) => x.id === id)!;
    setItens((l) => (l.some((i) => i.servico_id === id) ? l.filter((i) => i.servico_id !== id) : [...l, { servico_id: s.id, descricao: s.nome, duracao_min: s.duracao_min, preco: s.preco, local_tipo: s.local_tipo }]));
    setSugestoes(null);
  }
  function addOutro() {
    const d = Number(outro.duracao);
    if (!outro.descricao.trim() || !(d > 0)) { notify("Informe o nome e a duração do serviço.", "erro"); return; }
    setItens((l) => [...l, { servico_id: null, descricao: outro.descricao.trim(), duracao_min: d, preco: Number(outro.preco || 0), local_tipo: outro.local || null }]);
    setOutro({ descricao: "", duracao: "30", preco: "", local: "elevador" });
  }

  async function sugerir() {
    if (duracao <= 0) { notify("Escolha os serviços primeiro.", "erro"); return; }
    try {
      const ate = somarDias(data, 13);
      const lista = await buscarAgendamentos(sb, data, somarDias(ate, 14));
      const out: Livre[] = [];
      for (let d = data; d <= ate && out.length < 24; d = somarDias(d, 1)) {
        const l = horariosLivres({ data: d, duracao, precisa, agendamentos: lista, mecanicos: cad.mecanicos, locais: cad.locais, horarios: cad.horarios, folgas: cad.folgas, mecanico: mec || null, ignorar });
        out.push(...l.slice(0, 8));
      }
      setSugestoes(out);
    } catch (e) { notify(msgErro(e), "erro"); }
  }

  async function salvar() {
    if (!cliente && !novoNome.trim()) { notify("Escolha ou cadastre o cliente.", "erro"); return; }
    if (!veiculoId && placa && !placaValida(placa)) { notify("Placa inválida.", "erro"); return; }
    setSalvando(true);
    const p = {
      id: editar?.id, tipo: "servico",
      cliente_id: cliente?.id ?? null, cliente_nome: cliente ? null : novoNome, telefone,
      veiculo_id: veiculoId || null, placa: veiculoId ? null : placa, modelo: veiculoId ? null : modelo,
      seguradora, sinistro, mecanico_id: mec || null, local_id: ele || null, remarcar_de: remarcar ? base?.id : null,
      inicio: instante(data, hora), fim: null,   // o banco calcula pelo expediente
      espera, entrega_prevista: espera === "deixa" && entregaData && entregaHora ? instante(entregaData, entregaHora) : null,
      observacoes: obs, encaixe, cortesia: seguradora !== "particular" && cortesia,
      itens: itens.map((i) => ({ servico_id: i.servico_id, descricao: i.descricao, duracao_min: Number(i.duracao_min), preco: Number(i.preco || 0), local_tipo: i.local_tipo })),
    };
    // telefone novo de cliente já cadastrado
    if (cliente && telefone.trim() !== (cliente.telefone ?? "")) await sb.from("clientes").update({ telefone: telefone.trim() || null }).eq("id", cliente.id);
    const { data: idNovo, error } = await sb.rpc("salvar_agendamento", { p });
    setSalvando(false);
    if (error) { notify(msgErro(error), "erro"); return; }
    notify(editar ? "Agendamento atualizado." : remarcar ? "Remarcado." : "Agendado.");
    onSalvo((idNovo as string | null) ?? undefined);
    onClose();
  }

  const servAtivos = cad.servicos.filter((s) => s.ativo || itens.some((i) => i.servico_id === s.id));

  return (
    <Modal titulo={editar ? "Editar agendamento" : remarcar ? "Remarcar" : "Novo agendamento"} onClose={onClose} largura="max-w-3xl">
      <div className="space-y-5 text-sm">
        {remarcar && base ? <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-900">Remarcando o horário de {dataBR(dataSP(base.inicio))} às {horaSP(base.inicio)}. Escolha a nova data e hora: o horário antigo fica como “remarcado” e é liberado.</p> : null}
        {concluido ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">Serviço já concluído: você pode corrigir os dados; ele continua concluído.</p> : null}
        {/* Cliente */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500"><User size={14} /> Cliente</h3>
          {cliente ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2">
              <span className="font-medium text-neutral-900">{cliente.nome}</span>
              <button className="ml-auto text-xs text-neutral-500 underline" onClick={() => { setCliente(null); setVeiculos([]); setVeiculoId(""); }}>trocar</button>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-neutral-400" />
                <input className={`${inputCls} pl-9`} placeholder="Buscar por nome, telefone ou placa" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              {achados.length > 0 ? (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
                  {achados.map((a) => (
                    <li key={`${a.cliente.id}-${a.veiculo?.id ?? ""}`}>
                      <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-50" onClick={() => escolherCliente(a.cliente, a.veiculo)}>
                        <span className="font-medium">{a.cliente.nome}</span>
                        {a.veiculo ? <span className="text-xs text-neutral-500">{placaFmt(a.veiculo.placa)} {a.veiculo.modelo ?? ""}</span> : null}
                        <span className="ml-auto text-xs text-neutral-500">{a.cliente.telefone ?? ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-1.5 text-xs text-neutral-500">Não achou? Preencha abaixo para cadastrar.</p>
              <div className="mt-1.5">
                <Field label="Nome do cliente novo"><input className={inputCls} value={novoNome} onChange={(e) => setNovoNome(e.target.value)} /></Field>
                {parecidos.length ? (
                  <div className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Já existe no cadastro (evite duplicar):
                    {parecidos.map((c) => (
                      <button key={c.id} type="button" className="ml-2 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium" onClick={() => escolherCliente(c)}>
                        {c.nome}{c.telefone ? ` · ${c.telefone}` : ""} — usar
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Telefone (WhatsApp)"><input className={inputCls} inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(31) 9…" /></Field>
            {veiculos.length > 0 ? (
              <Field label="Veículo">
                <select className={inputCls} value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
                  {veiculos.map((v) => <option key={v.id} value={v.id}>{placaFmt(v.placa)} {v.modelo ?? ""}</option>)}
                  <option value="">Outro veículo…</option>
                </select>
              </Field>
            ) : null}
            {!veiculoId ? (
              <>
                <Field label="Placa"><input className={inputCls} value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC1D23" /></Field>
                <Field label="Modelo"><input className={inputCls} value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Onix 2020" /></Field>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <span className="mb-1 block text-xs font-medium text-neutral-600">Seguradora</span>
              <div className="inline-flex max-w-full flex-wrap rounded-lg border border-neutral-200 bg-neutral-100 p-0.5">
                {SEGURADORAS.map((s) => (
                  <button key={s.id} type="button" onClick={() => setSeguradora(s.id)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${seguradora === s.id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}>{s.nome}</button>
                ))}
              </div>
            </div>
            {seguradora !== "particular" ? <Field label="Nº do sinistro / OS" className="flex-1"><input className={inputCls} value={sinistro} onChange={(e) => setSinistro(e.target.value)} /></Field> : null}
          </div>
          {seguradora !== "particular" ? (
            <label className={`flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-sm ${cortesia ? "border-violet-300 bg-violet-50 text-violet-900" : "border-neutral-200 text-neutral-700"}`}>
              <input type="checkbox" checked={cortesia} onChange={(e) => setCortesia(e.target.checked)} /> Cortesia {nomeSeguradora(seguradora)}
            </label>
          ) : null}
        </section>

        {/* Serviços */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500"><Wrench size={14} /> Serviços</h3>
          {servAtivos.length === 0 ? <p className="text-xs text-neutral-500">Cadastre os serviços com o tempo e o preço em Ajustes.</p> : null}
          <div className="flex flex-wrap gap-1.5">
            {servAtivos.map((s) => {
              const on = itens.some((i) => i.servico_id === s.id);
              return (
                <button key={s.id} type="button" onClick={() => alternarServico(s.id)} className={`rounded-full border px-3 py-1.5 text-xs ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"}`}>
                  {s.nome} · {duracaoTxt(s.duracao_min)}
                </button>
              );
            })}
          </div>
          {itens.length > 0 ? (
            <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
              {itens.map((i, k) => (
                <li key={`${i.servico_id ?? "x"}-${k}`} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                  <span className="min-w-0 flex-1">{i.descricao}<span className="ml-1 text-xs text-neutral-500">{i.local_tipo === "rampa" ? "(rampa)" : i.local_tipo ? "" : "(sem elevador)"}</span></span>
                  <label className="flex items-center gap-1 text-xs text-neutral-500">min
                    <input className="w-16 rounded border border-neutral-300 px-1.5 py-1 text-right text-sm" type="number" min={1} value={i.duracao_min} onChange={(e) => setItens((l) => l.map((x, j) => (j === k ? { ...x, duracao_min: Number(e.target.value) } : x)))} />
                  </label>
                  <button type="button" aria-label="Tirar serviço" className="rounded p-1 text-neutral-400 hover:text-red-600" onClick={() => setItens((l) => l.filter((_, j) => j !== k))}><Trash2 size={14} /></button>
                </li>
              ))}
              <li className="flex justify-between bg-neutral-50 px-3 py-1.5 text-xs font-medium">
                <span>Total: {duracaoTxt(duracao)}</span>
              </li>
            </ul>
          ) : null}
          <details className="text-xs">
            <summary className="cursor-pointer text-neutral-600">Serviço que não está na lista</summary>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <input className={`${inputCls} !w-auto flex-1`} placeholder="Ex.: troca de bieleta" value={outro.descricao} onChange={(e) => setOutro({ ...outro, descricao: e.target.value })} />
              <input className={`${inputCls} !w-20`} type="number" min={1} placeholder="min" value={outro.duracao} onChange={(e) => setOutro({ ...outro, duracao: e.target.value })} />
              <select className={`${inputCls} !w-auto`} value={outro.local} onChange={(e) => setOutro({ ...outro, local: e.target.value as TipoLocal | "" })}><option value="elevador">no elevador</option><option value="rampa">na rampa</option><option value="">sem elevador</option></select>
              <Button type="button" onClick={addOutro}><Plus size={14} /> Pôr</Button>
            </div>
          </details>
        </section>

        {/* Quando e quem */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500"><CalendarClock size={14} /> Quando e quem</h3>
          {editar && (editar.confirmado_em || editar.confirmacao_enviada_em) && (editar.status === "agendado" || editar.status === "confirmado") && instante(data, hora) !== instante(dataSP(editar.inicio), horaSP(editar.inicio)) ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Mudou o dia/horário: a confirmação do cliente volta para “não confirmado” (ele confirmou o horário antigo).</p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label="Data"><input className={inputCls} type="date" value={data} onChange={(e) => { setData(e.target.value); setSugestoes(null); }} /></Field>
            <Field label="Início" hint={duracao > 0 ? `Termina ${fimTxt}` : undefined}><input className={inputCls} type="time" step={900} value={hora} onChange={(e) => setHora(e.target.value)} /></Field>
            <Field label="Mecânico">
              <select className={inputCls} value={mec} onChange={(e) => setMec(e.target.value)}>
                <option value="">Escolha…</option>
                {ativosM.map((m) => <option key={m.id} value={m.id}>{m.nome}{livre("mecanico_id", m.id) ? "" : " — ocupado"}</option>)}
              </select>
            </Field>
            <Field label={precisa === "rampa" ? "Rampa" : precisa ? "Elevador" : "Elevador (não precisa)"}>
              <select className={inputCls} value={ele} onChange={(e) => setEle(e.target.value)}>
                <option value="">{usaElevador ? "Escolha…" : "Nenhum"}</option>
                {locaisOk.map((x) => <option key={x.id} value={x.id}>{x.nome}{livre("local_id", x.id) ? "" : " — ocupado"}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={sugerir}><Clock size={14} /> Próximos horários livres</Button>
            {mec ? <span className="text-xs text-neutral-500">com {cad.mecanicos.find((m) => m.id === mec)?.nome}</span> : null}
          </div>
          {sugestoes ? (
            sugestoes.length === 0 ? <p className="text-xs text-neutral-500">Nenhum horário livre nas próximas duas semanas para {duracaoTxt(duracao)}.</p> : (
              <div className="space-y-1.5">
                {[...new Set(sugestoes.map((s) => s.data))].slice(0, 4).map((d) => (
                  <div key={d} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-28 text-xs capitalize text-neutral-600">{nomeDia(d)} {dataBR(d).slice(0, 5)}</span>
                    {sugestoes.filter((s) => s.data === d).map((s) => (
                      <button key={`${s.data}${s.inicio}`} type="button" className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100"
                        onClick={() => { setData(s.data); setHora(s.inicio); setMec(s.mecanico_id); if (s.local_id) setEle(s.local_id); setSugestoes(null); }}>
                        {s.inicio}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )
          ) : null}
          {ocupados.length ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">Ocupado: {ocupados.join("; ")}.</p> : null}
          {foraExp && !concluido ? (
            <label className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <input type="checkbox" checked={encaixe} onChange={(e) => setEncaixe(e.target.checked)} /> Início {foraExp}. Marcar mesmo assim como encaixe (o horário corre direto, sem pular almoço nem noite)
            </label>
          ) : null}
        </section>

        {/* Carro */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500"><Car size={14} /> O cliente</h3>
          <div className="inline-flex max-w-full flex-wrap rounded-lg border border-neutral-200 bg-neutral-100 p-0.5">
            {([["aguarda", "Aguarda na oficina"], ["deixa", "Deixa o carro"]] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setEspera(v)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${espera === v ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}>{l}</button>
            ))}
          </div>
          {espera === "deixa" ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Entregar em" hint="Em branco = quando terminar"><input className={inputCls} type="date" value={entregaData} onChange={(e) => setEntregaData(e.target.value)} /></Field>
              <Field label="Às"><input className={inputCls} type="time" step={900} value={entregaHora} onChange={(e) => setEntregaHora(e.target.value)} /></Field>
            </div>
          ) : null}
          <Field label="Observações"><textarea className={inputCls} rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
        </section>

        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
          <span className="text-xs text-neutral-600">{duracao > 0 ? `${dataBR(data)} ${hora} · termina ${fimTxt} · ${duracaoTxt(duracao)}` : "Escolha os serviços"}</span>
          <div className="ml-auto flex gap-2">
            <Button onClick={onClose}>Fechar</Button>
            <Button variant="primary" disabled={salvando || duracao <= 0 || !mec || !espera || (usaElevador && !ele) || (precisa === "elevador" && cad.locais.find((l) => l.id === ele)?.tipo === "rampa") || ocupados.length > 0 || (!!foraExp && !encaixe && !concluido)} onClick={salvar}>
              {salvando ? "Salvando…" : editar ? "Salvar" : remarcar ? "Remarcar" : "Agendar"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------ Bloquear horário ------------------------------------ */
export function BloqueioForm({ editar, inicial, onClose, onSalvo }: { editar?: Agendamento | null; inicial: Inicial; onClose: () => void; onSalvo: () => void }) {
  const { sb, notify, cad } = useApp();
  const [titulo, setTitulo] = useState(editar?.titulo ?? "");
  const [mec, setMec] = useState(editar?.mecanico_id ?? inicial.mecanico_id ?? "");
  const [ele, setEle] = useState(editar?.local_id ?? inicial.local_id ?? "");
  const [data, setData] = useState(editar ? dataSP(editar.inicio) : inicial.data);
  const [ini, setIni] = useState(editar ? horaSP(editar.inicio) : inicial.hora ?? "08:00");
  const [fim, setFim] = useState(editar ? horaSP(editar.fim) : hhmm(Math.min(min(inicial.hora ?? "08:00") + 60, 23 * 60 + 45)));
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    const { error } = await sb.rpc("salvar_agendamento", { p: { id: editar?.id, tipo: "bloqueio", titulo, mecanico_id: mec || null, local_id: ele || null, inicio: instante(data, ini), fim: instante(data, fim), encaixe: true } });
    setSalvando(false);
    if (error) { notify(msgErro(error), "erro"); return; }
    notify("Horário bloqueado."); onSalvo(); onClose();
  }
  return (
    <Modal titulo={editar ? "Editar bloqueio" : "Bloquear horário"} onClose={onClose}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Field label="Motivo" className="sm:col-span-2"><input className={inputCls} placeholder="Folga, elevador em manutenção, horário da Porto…" value={titulo} onChange={(e) => setTitulo(e.target.value)} /></Field>
        <Field label="Mecânico">
          <select className={inputCls} value={mec} onChange={(e) => setMec(e.target.value)}><option value="">Nenhum</option>{cad.mecanicos.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>
        </Field>
        <Field label="Elevador / rampa">
          <select className={inputCls} value={ele} onChange={(e) => setEle(e.target.value)}><option value="">Nenhum</option>{cad.locais.filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
        </Field>
        <Field label="Data"><input className={inputCls} type="date" value={data} onChange={(e) => setData(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="De"><input className={inputCls} type="time" step={900} value={ini} onChange={(e) => setIni(e.target.value)} /></Field>
          <Field label="Até"><input className={inputCls} type="time" step={900} value={fim} onChange={(e) => setFim(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button onClick={onClose}>Fechar</Button>
          <Button variant="primary" disabled={salvando || !titulo.trim() || (!mec && !ele) || fim <= ini} onClick={salvar}>{salvando ? "Salvando…" : "Bloquear"}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------ Checklist de entrega ------------------------------------ */
export function ChecklistModal({ a, onClose, onFeito }: { a: Agendamento; onClose: () => void; onFeito: () => void }) {
  const { sb, notify, cad } = useApp();
  const itens = cad.checklist.filter((i) => i.ativo);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [conferido, setConferido] = useState(() => { try { return localStorage.getItem("conferente") ?? ""; } catch { return ""; } });
  const [salvando, setSalvando] = useState(false);
  const tudo = itens.every((i) => marcados.has(i.id));
  async function concluir() {
    setSalvando(true);
    const { error } = await sb.rpc("concluir", { p_id: a.id, p_marcados: [...marcados], p_conferido: conferido });
    setSalvando(false);
    if (error) { notify(msgErro(error), "erro"); return; }
    try { localStorage.setItem("conferente", conferido); } catch { /* sem armazenamento */ }
    notify(a.espera === "deixa" ? "Concluído: carro pronto para retirar (Pátio) e serviço em Finalizados." : "Concluído: serviço foi para Finalizados.");
    onFeito(); onClose();
  }
  return (
    <Modal titulo={`Checklist de entrega — ${nomeAg(a)}`} onClose={onClose} largura="max-w-md">
      <div className="space-y-4 text-sm">
        {itens.length === 0 ? <p className="text-xs text-neutral-500">Nenhum item no checklist (dá para cadastrar em Ajustes).</p> : (
          <ul className="space-y-2">
            {itens.map((i) => (
              <li key={i.id}>
                <label className="flex items-start gap-2.5 rounded-lg border border-neutral-200 px-3 py-2.5">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={marcados.has(i.id)} onChange={(e) => setMarcados((m) => { const n = new Set(m); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} />
                  <span>{i.texto}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <Field label="Quem conferiu">
          <input className={inputCls} list="conferentes" value={conferido} onChange={(e) => setConferido(e.target.value)} placeholder="Seu nome" />
          <datalist id="conferentes">{["Mirza", ...cad.mecanicos.map((m) => m.nome)].map((n) => <option key={n} value={n} />)}</datalist>
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Voltar</Button>
          <Button variant="primary" disabled={salvando || !tudo || (itens.length > 0 && !conferido.trim())} onClick={concluir}>{salvando ? "Concluindo…" : "Concluir serviço"}</Button>
        </div>
      </div>
    </Modal>
  );
}

const quandoTxt = (a: Agendamento) => {
  const di = dataSP(a.inicio), df = dataSP(a.fim);
  return di === df ? `${nomeDia(di)}, ${dataBR(di)} · ${horaSP(a.inicio)}–${horaSP(a.fim)}`
    : `${nomeDia(di)} ${dataBR(di)} ${horaSP(a.inicio)} até ${nomeDia(df)} ${dataBR(df)} ${horaSP(a.fim)}`;
};

/* ------------------------------------ Detalhe ------------------------------------ */
export function DetalheAgendamento({ a, onClose, onMudou, onEditar, onRemarcar }: { a: Agendamento; onClose: () => void; onMudou: () => void; onEditar: () => void; onRemarcar: () => void }) {
  const { sb, notify, cad } = useApp();
  const [confirmar, setConfirmar] = useState<Status | null>(null);
  const [checklist, setChecklist] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [antesDaHora, setAntesDaHora] = useState(false);
  const mecanico = cad.mecanicos.find((m) => m.id === a.mecanico_id);
  const local = cad.locais.find((e) => e.id === a.local_id);
  const servs = (a.agendamento_itens ?? []).map((i) => i.descricao);
  const tel = a.clientes?.telefone ?? null;
  const whats = a.tipo === "servico" ? linkWhats(tel, mensagemConfirmacao({ cliente: a.clientes?.nome ?? "", data: dataSP(a.inicio), hora: horaSP(a.inicio), servicos: servs, placa: a.veiculos?.placa, espera: a.espera })) : null;
  const whatsPronto = a.tipo === "servico" ? linkWhats(tel, mensagemPronto(a.clientes?.nome ?? "", a.veiculos?.placa)) : null;
  const [agoraMs] = useState(() => Date.now());
  const atrasado = a.status === "em_andamento" && new Date(a.fim).getTime() < agoraMs;
  const aberto = a.status === "agendado" || a.status === "confirmado" || a.status === "em_andamento";

  async function rpc(nome: string, args: Record<string, unknown>, ok: string) {
    const { error } = await sb.rpc(nome, args);
    if (error) { notify(msgErro(error), "erro"); return; }
    notify(ok); onMudou(); onClose();
  }
  async function apagar() {
    const { data, error } = await sb.rpc("excluir_agendamento", { p_id: a.id });
    if (error) { notify(msgErro(error), "erro"); return; }
    const fotos = (data ?? []) as string[];
    if (fotos.length) await sb.storage.from("fotos").remove(fotos);
    notify(a.remarcado_de ? "Excluído. O horário antigo voltou para a agenda (ou ficou cancelado, se já estava ocupado)." : "Excluído."); onMudou(); onClose();
  }
  // concluir algo que ainda nem começou costuma ser toque errado: pergunta antes
  const pedirConcluir = () => (new Date(a.inicio).getTime() > agoraMs && a.status !== "em_andamento" ? setAntesDaHora(true) : setChecklist(true));
  const status = (s: Status) => rpc("mudar_status", { p_id: a.id, p_status: s }, s === "pausado" ? "Aguardando peça: elevador e mecânico liberados." : `${STATUS[s].nome}.`);

  return (
    <Modal titulo={nomeAg(a)} onClose={onClose} largura="max-w-2xl">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS[a.status].cls}`}>{STATUS[a.status].nome}</span>
          {atrasado ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">Passou do horário</span> : null}
          {a.tipo === "servico" && a.chegou_em && !a.entregue_em ? <span className="text-xs text-neutral-600">carro na oficina desde {dataSP(a.chegou_em) === hojeSP() ? "" : `${dataBR(dataSP(a.chegou_em)).slice(0, 5)} `}{horaSP(a.chegou_em)}</span> : null}
          {a.entregue_em ? <span className="text-xs text-emerald-700">entregue {dataBR(dataSP(a.entregue_em)).slice(0, 5)} {horaSP(a.entregue_em)}</span> : null}
          {a.tipo === "servico" ? <span className="text-xs text-neutral-600">{nomeSeguradora(a.seguradora)}{a.sinistro ? ` · ${a.sinistro}` : ""}</span> : null}
          {a.remarcado_de ? <span className="text-xs text-violet-700">remarcado de outro dia</span> : null}
          <Selos a={a} enviadaTxt />
        </div>
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-neutral-500">Quando</dt><dd className="first-letter:uppercase">{quandoTxt(a)}</dd>
          {a.tipo === "servico" ? (
            <>
              <dt className="text-neutral-500">Veículo</dt><dd>{a.veiculos ? `${placaFmt(a.veiculos.placa)} ${a.veiculos.modelo ?? ""}` : "—"}</dd>
              <dt className="text-neutral-500">Telefone</dt><dd>{tel ?? "—"}</dd>
              <dt className="text-neutral-500">Serviços</dt>
              <dd>{(a.agendamento_itens ?? []).map((i) => `${i.descricao} (${duracaoTxt(i.duracao_min)})`).join(" · ")}</dd>
              <dt className="text-neutral-500">Cliente</dt>
              <dd>{a.espera === "aguarda" ? "Aguarda na oficina" : `Deixa o carro${a.entrega_prevista ? ` · entregar ${dataSP(a.entrega_prevista) === dataSP(a.inicio) ? "às" : `em ${dataBR(dataSP(a.entrega_prevista))} às`} ${horaSP(a.entrega_prevista)}` : ""}`}</dd>
            </>
          ) : null}
          <dt className="text-neutral-500">Mecânico</dt><dd>{mecanico?.nome ?? "—"}</dd>
          <dt className="text-neutral-500">Elevador/rampa</dt><dd>{local?.nome ?? "—"}</dd>
          {a.inicio_real ? (<><dt className="text-neutral-500">Real</dt><dd>começou {horaSP(a.inicio_real)}{a.fim_real ? ` · terminou ${dataSP(a.fim_real) === dataSP(a.inicio_real) ? "" : `${dataBR(dataSP(a.fim_real)).slice(0, 5)} `}${horaSP(a.fim_real)}` : ""}{a.teve_pausa ? " · teve pausa para peça" : ""}</dd></>) : null}
          {a.status === "concluido" ? (<><dt className="text-neutral-500">Conferido</dt><dd>{a.conferido_por ?? "—"} · {a.pagamento === "recebido" ? "pagamento recebido" : "falta receber"}</dd></>) : null}
          {a.observacoes ? (<><dt className="text-neutral-500">Obs.</dt><dd className="whitespace-pre-line">{a.observacoes}</dd></>) : null}
        </dl>

        <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
          {a.tipo === "servico" && aberto ? (
            <>
              {a.status === "agendado" && !a.confirmado_em ? <Button onClick={() => rpc("marcar_confirmacao", { p_id: a.id, p_acao: "confirmou" }, "Confirmado.")}>Cliente confirmou</Button> : null}
              {a.status === "confirmado" ? <Button variant="ghost" onClick={() => rpc("marcar_confirmacao", { p_id: a.id, p_acao: "desfazer" }, "Confirmação desfeita.")}>Desfazer confirmação</Button> : null}
              {a.status !== "em_andamento" && !a.chegou_em ? <Button onClick={() => rpc("marcar_chegada", { p_id: a.id, p_chegou: true }, "Chegada registrada.")}>Chegou</Button> : null}
              {a.status !== "em_andamento" ? <Button onClick={() => status("em_andamento")}>Começar</Button> : null}
              <Button variant="primary" onClick={pedirConcluir}>Concluir</Button>
              <Button onClick={() => status("pausado")}>Aguardando peça</Button>
              {a.chegou_em && a.status !== "em_andamento" ? <Button variant="ghost" onClick={() => rpc("marcar_chegada", { p_id: a.id, p_chegou: false }, "Chegada desfeita.")}>Desfazer chegada</Button> : null}
              {a.status === "em_andamento" ? (<><Button onClick={() => rpc("estender_agendamento", { p_id: a.id, p_minutos: 15 }, "Estendido 15 min.")}>+15 min</Button><Button onClick={() => rpc("estender_agendamento", { p_id: a.id, p_minutos: 30 }, "Estendido 30 min.")}>+30 min</Button></>) : null}
              {a.status !== "em_andamento" ? <Button onClick={onRemarcar}><Repeat size={14} /> Remarcar</Button> : null}
              {a.status !== "em_andamento" ? <Button variant="danger" onClick={() => setConfirmar("faltou")}>Faltou</Button> : null}
            </>
          ) : null}
          {a.status === "pausado" ? (
            <>
              <Button variant="primary" onClick={onEditar}>Peça chegou: marcar horário</Button>
              <Button onClick={pedirConcluir}>Concluir</Button>
            </>
          ) : null}
          {a.tipo === "servico" && a.status === "faltou" ? <Button onClick={onRemarcar}><Repeat size={14} /> Remarcar</Button> : null}
          {a.status === "cancelado" ? <Button onClick={onEditar}>Reagendar em outro horário</Button> : null}
          {a.status === "concluido" && !a.entregue_em ? <Button variant="primary" onClick={() => rpc("marcar_entregue", { p_id: a.id, p_entregue: true }, "Carro entregue.")}>Cliente retirou</Button> : null}
          {a.status === "concluido" && a.entregue_em ? <Button onClick={() => rpc("marcar_entregue", { p_id: a.id, p_entregue: false }, "Entrega desfeita.")}>Desfazer entrega</Button> : null}
          {a.status === "concluido" && !a.entregue_em && whatsPronto ? <a href={whatsPronto} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"><MessageCircle size={14} /> Avisar que está pronto</a> : null}
          {aberto || a.status === "pausado" ? <Button variant="danger" onClick={() => setConfirmar("cancelado")}>{a.tipo === "bloqueio" ? "Tirar bloqueio" : "Cancelar"}</Button> : null}
          {a.status === "cancelado" || a.status === "faltou" ? <Button onClick={() => status("agendado")}>Reabrir no mesmo horário</Button> : null}
          {a.status === "concluido" ? <Button onClick={() => rpc("mudar_status", { p_id: a.id, p_status: "em_andamento" }, "Conclusão desfeita: voltou para em andamento.")}>Desfazer conclusão</Button> : null}
          {a.status === "remarcado" && !a.remarcado_para ? <Button onClick={() => status("agendado")}>Reabrir</Button> : null}
          {a.status !== "cancelado" && a.status !== "faltou" && a.status !== "remarcado" && a.status !== "pausado" ? <Button onClick={onEditar}><Pencil size={14} /> Editar</Button> : null}
          {whats && (a.status === "agendado" || a.status === "confirmado") ? <a href={whats} target="_blank" rel="noreferrer" onClick={() => { sb.rpc("marcar_confirmacao", { p_id: a.id, p_acao: "enviada" }).then(() => onMudou()); }} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"><MessageCircle size={14} /> Confirmar no WhatsApp</a> : null}
        </div>

        {a.tipo === "servico" ? <div className="border-t border-neutral-100 pt-3"><Fotos agendamentoId={a.id} /></div> : null}
        <div className="flex justify-end border-t border-neutral-100 pt-3">
          <button className="inline-flex items-center gap-1 text-xs text-red-700 hover:underline" onClick={() => setExcluir(true)}><Trash2 size={12} /> Excluir de vez</button>
        </div>
      </div>
      {excluir ? (
        <ConfirmDialog titulo="Excluir de vez" perigo confirmar="Excluir"
          texto={<>Apaga {a.tipo === "bloqueio" ? "este bloqueio" : "este agendamento"}{a.tipo === "servico" ? " com os serviços e as fotos" : ""}, sem volta. Use para o que foi lançado errado ou em dobro.{a.status === "concluido" ? " Ele também sai de Finalizados e dos relatórios." : ""}{a.remarcado_de ? " Como ele é uma remarcação, o horário antigo volta para a agenda." : ""} Para cliente que desmarcou, prefira Cancelar (fica no histórico).</>}
          onCancel={() => setExcluir(false)} onConfirm={() => { setExcluir(false); apagar(); }} />
      ) : null}
      {antesDaHora ? (
        <ConfirmDialog titulo="Concluir antes da hora?" confirmar="Sim, concluir"
          texto={`Este serviço está marcado para ${quandoTxt(a)} e ainda não começou. Concluir mesmo assim?`}
          onCancel={() => setAntesDaHora(false)} onConfirm={() => { setAntesDaHora(false); setChecklist(true); }} />
      ) : null}
      {checklist ? <ChecklistModal a={a} onClose={() => setChecklist(false)} onFeito={() => { onMudou(); onClose(); }} /> : null}
      {confirmar ? (
        <ConfirmDialog
          titulo={confirmar === "cancelado" ? (a.tipo === "bloqueio" ? "Tirar bloqueio" : "Cancelar agendamento") : "Cliente faltou"}
          texto={confirmar === "cancelado" ? "O horário fica livre para outro cliente. Dá para reabrir depois, se continuar livre." : "Registra a falta (conta no relatório) e libera o horário. Depois dá para remarcar."}
          confirmar={confirmar === "cancelado" ? (a.tipo === "bloqueio" ? "Tirar" : "Cancelar agendamento") : "Registrar falta"} perigo
          onCancel={() => setConfirmar(null)} onConfirm={() => { setConfirmar(null); status(confirmar); }}
        />
      ) : null}
    </Modal>
  );
}
