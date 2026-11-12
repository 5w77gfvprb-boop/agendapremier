// Regras da agenda que a tela usa (o banco confere de novo ao salvar).

export type Seguradora = "porto" | "azul" | "itau" | "particular";
export type Status = "agendado" | "confirmado" | "em_andamento" | "pausado" | "concluido" | "cancelado" | "faltou" | "remarcado";
export type TipoLocal = "elevador" | "rampa";

export const SEGURADORAS: { id: Seguradora; nome: string; cor: string }[] = [
  { id: "porto", nome: "Porto", cor: "#0b4fa3" },
  { id: "azul", nome: "Azul", cor: "#0891b2" },
  { id: "itau", nome: "Itaú", cor: "#ea580c" },
  { id: "particular", nome: "Particular", cor: "#525252" },
];
export const nomeSeguradora = (s?: string | null) => SEGURADORAS.find((x) => x.id === s)?.nome ?? "—";

export const STATUS: Record<Status, { nome: string; cls: string }> = {
  agendado: { nome: "Agendado", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
  confirmado: { nome: "Confirmado", cls: "bg-indigo-50 text-indigo-800 ring-indigo-200" },
  em_andamento: { nome: "Em andamento", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  pausado: { nome: "Aguardando peça", cls: "bg-orange-50 text-orange-800 ring-orange-200" },
  concluido: { nome: "Concluído", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  cancelado: { nome: "Cancelado", cls: "bg-neutral-100 text-neutral-500 ring-neutral-200" },
  faltou: { nome: "Faltou", cls: "bg-red-50 text-red-700 ring-red-200" },
  remarcado: { nome: "Remarcado", cls: "bg-violet-50 text-violet-800 ring-violet-200" },
};
/** Ocupa o mecânico/elevador (trava a agenda). Concluído já terminou: não trava mais nada. */
export const ocupa = (s: Status) => s === "agendado" || s === "confirmado" || s === "em_andamento";
/** Serviço que vale (aparece na grade e conta): tudo menos cancelado, faltou, remarcado e aguardando peça. */
export const vale = (s: Status) => ocupa(s) || s === "concluido";

/** Confirmação do cliente (só para serviço que ainda vai acontecer ou está acontecendo). */
export type Confirmacao = "confirmado" | "sem_resposta" | "nao_confirmado";
export function confirmacao(a: Pick<Agendamento, "tipo" | "status" | "confirmado_em" | "confirmacao_enviada_em">): Confirmacao | null {
  if (a.tipo !== "servico" || !["agendado", "confirmado", "em_andamento", "pausado"].includes(a.status)) return null;
  if (a.confirmado_em || a.status === "confirmado") return "confirmado";
  return a.confirmacao_enviada_em ? "sem_resposta" : "nao_confirmado";
}
export const CONFIRMACAO: Record<Confirmacao, { nome: string; cls: string }> = {
  confirmado: { nome: "Confirmou", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  sem_resposta: { nome: "Não respondeu", cls: "bg-amber-50 text-amber-800 ring-amber-300" },
  nao_confirmado: { nome: "Não confirmado", cls: "bg-neutral-100 text-neutral-600 ring-neutral-300" },
};
export const cortesiaTxt = (a: Pick<Agendamento, "cortesia" | "seguradora">) => (a.cortesia ? `Cortesia ${nomeSeguradora(a.seguradora)}` : null);

export type Mecanico = { id: string; nome: string; cor: string; ativo: boolean; ordem: number };
export type Local = { id: string; nome: string; tipo: TipoLocal; ativo: boolean; ordem: number };
export type Servico = { id: string; nome: string; duracao_min: number; preco: number; local_tipo: TipoLocal | null; ativo: boolean };
export type Horario = { dia_semana: number; aberto: boolean; abre: string; fecha: string; almoco_ini: string | null; almoco_fim: string | null };
export type Folga = { dia: string; motivo: string | null };
export type Cliente = { id: string; nome: string; telefone: string | null; seguradora: Seguradora; observacoes: string | null };
export type Veiculo = { id: string; cliente_id: string; placa: string; modelo: string | null; ano: string | null; cor: string | null };
export type Item = { id?: string; servico_id: string | null; descricao: string; duracao_min: number; preco: number; ordem?: number };
/** Elevador vence rampa: se algum serviço precisa de elevador, o carro vai para um elevador. */
export const localNecessario = (tipos: (TipoLocal | null | undefined)[]): TipoLocal | null => (tipos.includes("elevador") ? "elevador" : tipos.includes("rampa") ? "rampa" : null);
export type Agendamento = {
  id: string; tipo: "servico" | "bloqueio"; titulo: string | null;
  cliente_id: string | null; veiculo_id: string | null; seguradora: Seguradora | null; sinistro: string | null;
  mecanico_id: string | null; local_id: string | null;
  inicio: string; fim: string; fim_previsto: string | null;
  espera: "aguarda" | "deixa" | null; entrega_prevista: string | null;
  status: Status; inicio_real: string | null; fim_real: string | null;
  valor_total: number; observacoes: string | null;
  remarcado_de: string | null; remarcado_para: string | null;
  nf_status: "pendente" | "emitida" | "nao_precisa"; nf_numero: string | null; nf_data: string | null;
  pagamento: "pendente" | "recebido"; pagamento_data: string | null; forma_pagamento: string | null;
  cortesia?: boolean; confirmado_em?: string | null; confirmacao_enviada_em?: string | null;
  chegou_em?: string | null; entregue_em?: string | null; teve_pausa?: boolean; checklist?: { texto: string; ok: boolean }[] | null; conferido_por?: string | null;
  clientes?: { nome: string; telefone: string | null } | null;
  veiculos?: { placa: string; modelo: string | null } | null;
  agendamento_itens?: Item[];
};

/* ----------------------------- datas e horas (Brasília) ----------------------------- */
const TZ = "America/Sao_Paulo";
const partes = (d: Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
};
export const hojeSP = () => partes(new Date()).data;
export const agoraSP = () => partes(new Date());
export const dataSP = (ts: string) => partes(new Date(ts)).data;
export const horaSP = (ts: string) => partes(new Date(ts)).hora;
/** Diferença de Brasília para UTC nesse dia (hoje é sempre −03:00, mas não custa calcular). */
function offset(data: string): string {
  const meioDia = new Date(`${data}T12:00:00Z`);
  const h = Number(partes(meioDia).hora.slice(0, 2));
  const dif = h - 12;   // −3
  const s = dif < 0 ? "-" : "+";
  return `${s}${String(Math.abs(dif)).padStart(2, "0")}:00`;
}
/** "2026-11-16" + "08:30" → instante em Brasília (ISO com fuso) */
export const instante = (data: string, hhmm: string) => `${data}T${hhmm}:00${offset(data)}`;
export const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const somarDias = (data: string, n: number) => {
  const d = new Date(`${data}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
export const diaSemana = (data: string) => new Date(`${data}T12:00:00Z`).getUTCDay();
export const dataBR = (data?: string | null) => (data ? `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}` : "—");
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const nomeDia = (data: string) => DIAS[diaSemana(data)];
export const duracaoTxt = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`);
export const brl = (v: unknown) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

/** Minutos (do dia, em Brasília) que um agendamento ocupa, recortados ao dia pedido. */
export function faixa(a: Pick<Agendamento, "inicio" | "fim">, data: string): [number, number] | null {
  const di = dataSP(a.inicio), df = dataSP(a.fim);
  if (di > data || df < data) return null;
  const ini = di < data ? 0 : min(horaSP(a.inicio));
  const fim = df > data ? 24 * 60 : min(horaSP(a.fim));
  return fim > ini ? [ini, fim] : null;
}

/** Expediente do dia em minutos: [abre, fecha] e almoço; null = fechado. */
export function expediente(data: string, horarios: Horario[], folgas: Folga[]) {
  if (folgas.some((f) => f.dia === data)) return null;
  const h = horarios.find((x) => x.dia_semana === diaSemana(data));
  if (!h || !h.aberto) return null;
  return {
    abre: min(h.abre), fecha: min(h.fecha),
    almoco: h.almoco_ini && h.almoco_fim ? ([min(h.almoco_ini), min(h.almoco_fim)] as [number, number]) : null,
  };
}

/** Minutos de trabalho disponíveis no dia (expediente sem o almoço). */
export function minutosUteis(data: string, horarios: Horario[], folgas: Folga[]) {
  const e = expediente(data, horarios, folgas);
  if (!e) return 0;
  return e.fecha - e.abre - (e.almoco ? e.almoco[1] - e.almoco[0] : 0);
}

const cruza = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

export type Livre = { data: string; inicio: string; fim: string; fimData: string; mecanico_id: string; local_id: string | null };

/** O início cai no expediente (fora do almoço)? Devolve o motivo se não. */
export function inicioFora(data: string, hora: string, horarios: Horario[], folgas: Folga[]): string | null {
  const e = expediente(data, horarios, folgas);
  if (!e) return "a oficina não abre nesse dia";
  const m = min(hora);
  if (m < e.abre || m >= e.fecha) return "fora do horário de funcionamento";
  if (e.almoco && m >= e.almoco[0] && m < e.almoco[1]) return "no horário de almoço";
  return null;
}

/**
 * Soma minutos de TRABALHO a partir de (data, hora): pula almoço, noite, dias fechados e feriados
 * (a mesma conta que o banco faz). Serviço grande atravessa dias.
 */
export function somarExpediente(data: string, hora: string, minutos: number, horarios: Horario[], folgas: Folga[]): { data: string; hora: string } {
  let d = data, t = min(hora), falta = minutos;
  if (falta <= 0) return { data, hora };
  for (let guarda = 0; guarda < 400; guarda++) {
    const e = expediente(d, horarios, folgas);
    if (e) {
      const segs: [number, number][] = e.almoco ? [[e.abre, e.almoco[0]], [e.almoco[1], e.fecha]] : [[e.abre, e.fecha]];
      for (const [a, b] of segs) {
        const ini = Math.max(t, a);
        if (ini >= b) continue;
        if (falta <= b - ini) return { data: d, hora: hhmm(ini + falta) };
        falta -= b - ini;
      }
    }
    d = somarDias(d, 1); t = 0;
  }
  return { data: d, hora: hhmm(t) };
}

const ms = (data: string, hora: string) => new Date(instante(data, hora)).getTime();
const faixaMs = (a: Pick<Agendamento, "inicio" | "fim">): [number, number] => [new Date(a.inicio).getTime(), new Date(a.fim).getTime()];

/**
 * Horários livres num dia para um serviço de `duracao` minutos de trabalho.
 * Serve quando há um mecânico E (se o serviço precisa) um elevador/rampa do tipo certo livres do início ao fim
 * (o fim pula almoço/noite, então serviço grande ocupa até o outro dia). O início cai no expediente.
 * Se `mecanico`/`local` vierem escolhidos, só eles. Hoje: a partir de agora.
 * `agendamentos` precisa cobrir os dias até onde o serviço pode terminar.
 */
export function horariosLivres(p: {
  data: string; duracao: number; precisa: TipoLocal | null; agendamentos: Agendamento[];
  mecanicos: Mecanico[]; locais: Local[]; horarios: Horario[]; folgas: Folga[];
  mecanico?: string | null; local?: string | null; ignorar?: string | null; passo?: number; agora?: { data: string; hora: string };
}): Livre[] {
  const e = expediente(p.data, p.horarios, p.folgas);
  if (!e || p.duracao <= 0) return [];
  const passo = p.passo ?? 15;
  const ocupados = p.agendamentos.filter((a) => ocupa(a.status) && a.id !== p.ignorar).map((a) => ({ a, f: faixaMs(a) }));
  const livre = (campo: "mecanico_id" | "local_id", id: string, f: [number, number]) => !ocupados.some((o) => o.a[campo] === id && cruza(o.f, f));
  const mecs = p.mecanicos.filter((m) => m.ativo && (!p.mecanico || m.id === p.mecanico));
  const locs = p.locais.filter((x) => x.ativo && x.tipo === p.precisa && (!p.local || x.id === p.local));
  const agora = p.agora ?? agoraSP();
  if (p.data < agora.data) return [];
  let desde = e.abre;
  if (p.data === agora.data) desde = Math.max(desde, Math.ceil(min(agora.hora) / passo) * passo);
  // serviço que cabe num dia só é sugerido se terminar no mesmo dia (não deixa carro parado à noite à toa)
  const cabeNoDia = p.duracao <= minutosUteis(p.data, p.horarios, p.folgas);
  const out: Livre[] = [];
  for (let t = Math.ceil(desde / passo) * passo; t < e.fecha; t += passo) {
    if (e.almoco && t >= e.almoco[0] && t < e.almoco[1]) continue;
    const fim = somarExpediente(p.data, hhmm(t), p.duracao, p.horarios, p.folgas);
    if (cabeNoDia && fim.data !== p.data) continue;
    const f: [number, number] = [ms(p.data, hhmm(t)), ms(fim.data, fim.hora)];
    const m = mecs.find((x) => livre("mecanico_id", x.id, f));
    if (!m) continue;
    let lo: string | null = null;
    if (p.precisa) {
      const x = locs.find((y) => livre("local_id", y.id, f));
      if (!x) continue;
      lo = x.id;
    }
    out.push({ data: p.data, inicio: hhmm(t), fim: fim.hora, fimData: fim.data, mecanico_id: m.id, local_id: lo });
  }
  return out;
}

/** O que impede marcar este horário (para avisar antes de salvar). `fim` = data/hora do fim já calculado. */
export function conflitos(p: { data: string; inicio: string; fim: { data: string; hora: string }; mecanico: string | null; local: string | null; agendamentos: Agendamento[]; ignorar?: string | null; nomes: (a: Agendamento) => string }): string[] {
  const f: [number, number] = [ms(p.data, p.inicio), ms(p.fim.data, p.fim.hora)];
  const out: string[] = [];
  for (const a of p.agendamentos) {
    if (!ocupa(a.status) || a.id === p.ignorar) continue;
    if (!cruza(f, faixaMs(a))) continue;
    const quando = `${dataSP(a.inicio) === p.data ? "" : `${dataBR(dataSP(a.inicio)).slice(0, 5)} `}${horaSP(a.inicio)}–${dataSP(a.fim) === dataSP(a.inicio) ? "" : `${dataBR(dataSP(a.fim)).slice(0, 5)} `}${horaSP(a.fim)}`;
    if (p.mecanico && a.mecanico_id === p.mecanico) out.push(`mecânico ocupado com ${p.nomes(a)} (${quando})`);
    else if (p.local && a.local_id === p.local) out.push(`elevador/rampa ocupado com ${p.nomes(a)} (${quando})`);
  }
  return out;
}

/* ----------------------------------- relatório ----------------------------------- */
export type LinhaMecanico = {
  id: string; nome: string; carros: number; valor: number; minutos: number; disponivel: number; ocupacao: number;
  porDia: number; porSemana: number; realVsPrevisto: number | null; medidos: number;
};
export type Relatorio = {
  dias: number; semanas: number;
  mecanicos: LinhaMecanico[];
  total: { carros: number; valor: number; faltas: number; remarcados: number; cancelados: number; aguardou: number; deixou: number };
  servicos: { nome: string; qtd: number; valor: number; padrao: number | null }[];
  seguradoras: { id: Seguradora; nome: string; carros: number; valor: number }[];
  porDia: { data: string; carros: number }[];
};

/**
 * Período [inicio, fim] (datas). Conta como "carro feito" o agendamento de serviço concluído
 * (um carro com 3 serviços conta 1). Ocupação = minutos marcados (sem cancelados/faltas) ÷ minutos de expediente.
 */
export function relatorio(p: { inicio: string; fim: string; agendamentos: Agendamento[]; mecanicos: Mecanico[]; horarios: Horario[]; folgas: Folga[]; servicos: Servico[] }): Relatorio {
  const dias: string[] = [];
  for (let d = p.inicio; d <= p.fim; d = somarDias(d, 1)) dias.push(d);
  const uteis = dias.filter((d) => minutosUteis(d, p.horarios, p.folgas) > 0);
  const dispDia = Object.fromEntries(dias.map((d) => [d, minutosUteis(d, p.horarios, p.folgas)]));
  const disponivel = uteis.reduce((s, d) => s + dispDia[d], 0);
  const semanas = Math.max(uteis.length / Math.max(1, new Set(p.horarios.filter((h) => h.aberto).map((h) => h.dia_semana)).size), 1 / 7);
  const serv = p.agendamentos.filter((a) => a.tipo === "servico" && dataSP(a.inicio) >= p.inicio && dataSP(a.inicio) <= p.fim);
  const feitos = serv.filter((a) => a.status === "concluido");
  const dur = (a: Agendamento) => (new Date(a.fim_previsto ?? a.fim).getTime() - new Date(a.inicio).getTime()) / 60000;

  const mecanicos: LinhaMecanico[] = p.mecanicos.map((m) => {
    const meus = feitos.filter((a) => a.mecanico_id === m.id);
    const marcados = serv.filter((a) => a.mecanico_id === m.id && vale(a.status));
    const minutos = marcados.reduce((s, a) => s + dur(a), 0);
    const medidos = meus.filter((a) => a.inicio_real && a.fim_real && !a.teve_pausa);   // com pausa (peça) o tempo real não vale
    const prev = medidos.reduce((s, a) => s + dur(a), 0);
    const real = medidos.reduce((s, a) => s + (new Date(a.fim_real!).getTime() - new Date(a.inicio_real!).getTime()) / 60000, 0);
    return {
      id: m.id, nome: m.nome, carros: meus.length, valor: meus.reduce((s, a) => s + Number(a.valor_total), 0),
      minutos, disponivel, ocupacao: disponivel ? minutos / disponivel : 0,
      porDia: uteis.length ? meus.length / uteis.length : 0, porSemana: meus.length / semanas,
      realVsPrevisto: prev > 0 ? real / prev - 1 : null, medidos: medidos.length,
    };
  }).filter((l) => l.carros > 0 || l.minutos > 0 || p.mecanicos.find((m) => m.id === l.id)?.ativo);

  const porServ = new Map<string, { nome: string; qtd: number; valor: number; padrao: number | null }>();
  for (const a of feitos) for (const it of a.agendamento_itens ?? []) {
    const s = p.servicos.find((x) => x.id === it.servico_id);
    const k = s?.id ?? `livre:${it.descricao.toLowerCase()}`;
    const o = porServ.get(k) ?? { nome: s?.nome ?? it.descricao, qtd: 0, valor: 0, padrao: s?.duracao_min ?? null };
    o.qtd += 1; o.valor += Number(it.preco); porServ.set(k, o);
  }
  const seguradoras = SEGURADORAS.map((s) => {
    const l = feitos.filter((a) => a.seguradora === s.id);
    return { id: s.id, nome: s.nome, carros: l.length, valor: l.reduce((t, a) => t + Number(a.valor_total), 0) };
  });
  return {
    dias: uteis.length, semanas,
    mecanicos,
    total: {
      carros: feitos.length, valor: feitos.reduce((s, a) => s + Number(a.valor_total), 0),
      faltas: serv.filter((a) => a.status === "faltou").length, remarcados: serv.filter((a) => a.status === "remarcado").length, cancelados: serv.filter((a) => a.status === "cancelado").length,
      aguardou: feitos.filter((a) => a.espera === "aguarda").length, deixou: feitos.filter((a) => a.espera === "deixa").length,
    },
    servicos: [...porServ.values()].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor),
    seguradoras,
    porDia: uteis.map((d) => ({ data: d, carros: feitos.filter((a) => dataSP(a.inicio) === d).length })),
  };
}

/** Placa sem traço, maiúscula; aceita modelo antigo (ABC1234) e Mercosul (ABC1D23). */
export const limparPlaca = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const placaValida = (s: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(limparPlaca(s));
export const placaFmt = (s?: string | null) => (s ? (/^[A-Z]{3}[0-9]{4}$/.test(s) ? `${s.slice(0, 3)}-${s.slice(3)}` : s) : "");

/** Link de WhatsApp com a mensagem de confirmação. */
export function linkWhats(telefone: string | null, msg: string): string | null {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const n = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
}
export function mensagemConfirmacao(a: { cliente: string; data: string; hora: string; servicos: string[]; placa?: string | null; espera: string | null }) {
  const dia = a.data === hojeSP() ? "hoje" : a.data === somarDias(hojeSP(), 1) ? "amanhã" : `${nomeDia(a.data)}, ${dataBR(a.data)}`;
  return `Olá, ${a.cliente.split(" ")[0]}! Aqui é do Centro Automotivo Premier. Confirmando seu horário ${dia} às ${a.hora}` +
    `${a.servicos.length ? ` para ${a.servicos.join(", ").toLowerCase()}` : ""}${a.placa ? ` (veículo ${placaFmt(a.placa)})` : ""}. ` +
    `${a.espera === "aguarda" ? "Você vai aguardar na oficina. " : ""}Podemos confirmar?`;
}

export const mensagemPronto = (cliente: string, placa?: string | null) =>
  `Olá, ${cliente.split(" ")[0]}! Aqui é do Centro Automotivo Premier. Seu carro${placa ? ` (${placaFmt(placa)})` : ""} está pronto e já pode ser retirado.`;

/** Próximo dia com expediente depois de `data` (sexta → segunda; pula feriado). */
export function proximoDiaUtil(data: string, horarios: Horario[], folgas: Folga[]): string {
  let d = somarDias(data, 1);
  for (let i = 0; i < 30 && !expediente(d, horarios, folgas); i++) d = somarDias(d, 1);
  return d;
}

export type Contato = { id: string; nome: string; telefone: string | null; interesse: string | null; observacoes: string | null; lembrar_em: string; status: "aberto" | "agendado" | "desistiu"; agendamento_id: string | null; criado_em: string };
