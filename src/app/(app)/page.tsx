"use client";

import { ChevronLeft, ChevronRight, Lock, MessageCircle, PhoneCall, Plus, UserRound } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { AgendamentoForm, BloqueioForm, DetalheAgendamento, buscarAgendamentos, nomeAg } from "@/components/Agendamento";
import { ContatoForm } from "@/components/Contatos";
import { IconesAg, LegendaSelos, Selos } from "@/components/Selos";
import { msgErro, useApp } from "@/components/AppShell";
import { Button, Modal, Segmentado } from "@/components/ui";
import {
  agoraSP, dataBR, dataSP, linkWhats, mensagemConfirmacao, proximoDiaUtil, diaSemana, expediente, faixa, hhmm, hojeSP, horaSP, horariosLivres, min, nomeDia, nomeSeguradora, placaFmt, vale, somarDias, STATUS,
  type Agendamento,
} from "@/lib/agenda";

type Visao = "locais" | "mecanicos" | "semana" | "mes";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** Primeiro dia do mês de `data`, andando `n` meses. */
const inicioMes = (data: string, n = 0) => {
  const y = Number(data.slice(0, 4)), m = Number(data.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
};
const PX = 1.4;   // pixels por minuto (1 h = 84 px)

export default function Page() {
  return <Suspense><Agenda /></Suspense>;
}

function Agenda() {
  const { sb, notify, cad } = useApp();
  const [data, setData] = useState(hojeSP());
  const [visao, setVisao] = useState<Visao>("locais");
  const [lista, setLista] = useState<Agendamento[]>([]);
  const [novo, setNovo] = useState<{ data: string; hora?: string; mecanico_id?: string | null; local_id?: string | null } | null>(null);
  const [bloquear, setBloquear] = useState<{ data: string; hora?: string } | null>(null);
  const [aberto, setAberto] = useState<Agendamento | null>(null);
  const [editar, setEditar] = useState<Agendamento | null>(null);
  const [remarcar, setRemarcar] = useState<Agendamento | null>(null);
  const [agora, setAgora] = useState(agoraSP());
  const [confirmarAmanha, setConfirmarAmanha] = useState(false);
  const [anotar, setAnotar] = useState(false);
  const [todos, setTodos] = useState(false);   // mostrar cancelados, faltas, remarcados e aguardando peça na grade

  useEffect(() => { try { const v = localStorage.getItem("visao") as Visao | null; if (v) setVisao(v); setTodos(localStorage.getItem("todos") === "1"); } catch { /* sem armazenamento */ } }, []);
  useEffect(() => { const t = setInterval(() => setAgora(agoraSP()), 60000); return () => clearInterval(t); }, []);

  const segunda = somarDias(data, -((diaSemana(data) + 6) % 7));
  const fimSemana = [6, 5, 4, 3, 2, 1, 0].map((i) => somarDias(segunda, i)).find((d) => abreNoDia(d, cad.horarios)) ?? somarDias(segunda, 6);
  // mês: semanas inteiras (segunda a domingo) que cobrem o mês
  const mes1 = inicioMes(data);
  const mesFim = somarDias(inicioMes(data, 1), -1);
  const gradeIni = somarDias(mes1, -((diaSemana(mes1) + 6) % 7));
  const gradeFim = somarDias(mesFim, (7 - diaSemana(mesFim)) % 7);
  const de = visao === "semana" ? segunda : visao === "mes" ? gradeIni : data;
  const ate = visao === "semana" ? somarDias(segunda, 6) : visao === "mes" ? gradeFim : data;
  const [versao, setVersao] = useState(0);
  const carregar = useCallback(() => setVersao((v) => v + 1), []);
  useEffect(() => {
    let ativo = true;
    buscarAgendamentos(sb, de, ate).then((l) => { if (ativo) setLista(l); }).catch((e) => notify(msgErro(e), "erro"));
    return () => { ativo = false; };   // trocou de dia/mês antes de chegar: ignora a resposta antiga
  }, [sb, de, ate, notify, versao]);

  const andar = (n: number) => {
    if (visao === "mes") return setData(inicioMes(data, n));
    if (visao === "semana") return setData(somarDias(data, 7 * n));
    // um dia por vez, pulando os dias da semana em que a oficina não abre (sábado, domingo...)
    let d = somarDias(data, n);
    for (let i = 0; i < 6 && !abreNoDia(d, cad.horarios); i++) d = somarDias(d, n);
    setData(d);
  };
  const mudarVisao = (v: Visao) => { setVisao(v); try { localStorage.setItem("visao", v); } catch { /* sem armazenamento */ } };
  const visiveis = todos ? lista : lista.filter((a) => vale(a.status));
  const doDia = visiveis.filter((a) => faixa(a, data));
  const servicosDia = lista.filter((a) => faixa(a, data) && a.tipo === "servico" && vale(a.status));
  const ocultos = lista.filter((a) => faixa(a, data) && !vale(a.status)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <Button variant="ghost" aria-label="Anterior" onClick={() => andar(-1)}><ChevronLeft size={18} /></Button>
          <Button onClick={() => setData(hojeSP())}>Hoje</Button>
          <Button variant="ghost" aria-label="Próximo" onClick={() => andar(1)}><ChevronRight size={18} /></Button>
          <input type="date" aria-label="Ir para a data" className="ml-1 w-[9.5rem] min-w-0 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm" value={data} onChange={(e) => e.target.value && setData(e.target.value)} />
        </div>
        <h1 className="text-lg font-semibold text-neutral-900 first-letter:uppercase">
          {visao === "mes" ? `${MESES[Number(data.slice(5, 7)) - 1]} de ${data.slice(0, 4)}` : visao === "semana" ? `Semana de ${dataBR(segunda).slice(0, 5)} a ${dataBR(fimSemana).slice(0, 5)}` : `${nomeDia(data)}, ${dataBR(data)}`}
        </h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <Segmentado valor={visao} onChange={mudarVisao} opcoes={[{ id: "locais", label: "Elevadores" }, { id: "mecanicos", label: "Mecânicos" }, { id: "semana", label: "Semana" }, { id: "mes", label: "Mês" }]} />
          <Button onClick={() => setAnotar(true)}><PhoneCall size={15} /> Anotar contato</Button>
          <Button onClick={() => setConfirmarAmanha(true)}><MessageCircle size={15} /> Confirmar amanhã</Button>
          <Button onClick={() => setBloquear({ data })}><Lock size={15} /> Bloquear</Button>
          <Button variant="primary" onClick={() => setNovo({ data })}><Plus size={15} /> Agendar</Button>
        </div>
      </div>

      {visao === "locais" || visao === "mecanicos" ? (
        <>
          <ResumoDia data={data} doDia={doDia} servicos={servicosDia} />
          {ocultos || todos ? (
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input type="checkbox" checked={todos} onChange={(e) => { setTodos(e.target.checked); try { localStorage.setItem("todos", e.target.checked ? "1" : "0"); } catch { /* sem armazenamento */ } }} />
              Mostrar cancelados, faltas, remarcados e aguardando peça{ocultos ? ` (${ocultos} neste dia)` : ""}
            </label>
          ) : null}
          <LegendaSelos />
          <GradeDia data={data} visao={visao} doDia={doDia} agora={agora} onVazio={(hora, rec) => setNovo({ data, hora, ...(visao === "locais" ? { local_id: rec } : { mecanico_id: rec }) })} onAbrir={setAberto} />
        </>
      ) : visao === "semana" ? (
        <Semana segunda={segunda} lista={visiveis} onAbrir={setAberto} onDia={(d) => { setData(d); mudarVisao("locais"); }} />
      ) : (
        <Mes data={data} ini={gradeIni} fim={gradeFim} lista={visiveis} onAbrir={setAberto} onDia={(d) => { setData(d); mudarVisao("locais"); }} />
      )}

      {novo ? <AgendamentoForm inicial={novo} onClose={() => setNovo(null)} onSalvo={carregar} /> : null}
      {editar ? (editar.tipo === "bloqueio"
        ? <BloqueioForm editar={editar} inicial={{ data }} onClose={() => setEditar(null)} onSalvo={carregar} />
        : <AgendamentoForm editar={editar} inicial={{ data }} onClose={() => setEditar(null)} onSalvo={carregar} />) : null}
      {remarcar ? <AgendamentoForm editar={remarcar} remarcar inicial={{ data: somarDias(dataSP(remarcar.inicio), 1) }} onClose={() => setRemarcar(null)} onSalvo={carregar} /> : null}
      {confirmarAmanha ? <ConfirmarAmanha onClose={() => { setConfirmarAmanha(false); carregar(); }} onAbrir={(a) => { setConfirmarAmanha(false); setAberto(a); }} /> : null}
      {anotar ? <ContatoForm onClose={() => setAnotar(false)} onSalvo={() => notify("Contato anotado: aparece em Retornos.")} /> : null}
      {bloquear ? <BloqueioForm inicial={bloquear} onClose={() => setBloquear(null)} onSalvo={carregar} /> : null}
      {aberto ? <DetalheAgendamento a={aberto} onClose={() => setAberto(null)} onMudou={carregar} onEditar={() => { setEditar(aberto); setAberto(null); }} onRemarcar={() => { setRemarcar(aberto); setAberto(null); }} /> : null}
    </div>
  );
}

/* Resumo do dia + janelas livres (para trancar na Ultracar o que estiver ocupado) */
function ResumoDia({ data, doDia, servicos }: { data: string; doDia: Agendamento[]; servicos: Agendamento[] }) {
  const { cad } = useApp();
  const exp = expediente(data, cad.horarios, cad.folgas);
  const janelas = useMemo(() => {
    // trechos de 15 min com pelo menos um mecânico e um elevador livres, juntados em janelas
    // hoje: a partir de agora; outros dias: o dia todo
    const l = horariosLivres({ data, duracao: 15, precisa: "elevador", agendamentos: doDia, mecanicos: cad.mecanicos, locais: cad.locais, horarios: cad.horarios, folgas: cad.folgas, ...(data === hojeSP() ? {} : { agora: { data: "0000-00-00", hora: "00:00" } }) });
    const out: [string, string][] = [];
    for (const x of l) {
      const ult = out.at(-1);
      if (ult && ult[1] === x.inicio) ult[1] = x.fim; else out.push([x.inicio, x.fim]);
    }
    return out;
  }, [data, doDia, cad]);
  const folga = cad.folgas.find((f) => f.dia === data);
  const bloqueios = doDia.filter((a) => a.tipo === "bloqueio" && vale(a.status));
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm">
      {!exp ? <span className="font-medium text-amber-800">Oficina fechada{folga?.motivo ? ` (${folga.motivo})` : ""}</span> : null}
      <span><b>{servicos.length}</b> carro(s)</span>
      <span><b>{servicos.filter((a) => a.espera === "aguarda").length}</b> aguardando</span>
      <span><b>{servicos.filter((a) => a.espera === "deixa").length}</b> deixam o carro</span>
      {exp ? (
        <span className="text-xs text-neutral-600">
          Livre (mecânico + elevador){data === hojeSP() ? " daqui pra frente" : ""}: {janelas.length ? janelas.map(([a, b]) => `${a}–${b}`).join(", ") : "nada"}
        </span>
      ) : null}
      {bloqueios.length ? (
        <span className="text-xs text-neutral-600">
          Bloqueios: {bloqueios.map((b) => `${b.titulo ?? "bloqueio"} (${[cad.mecanicos.find((m) => m.id === b.mecanico_id)?.nome, cad.locais.find((l) => l.id === b.local_id)?.nome].filter(Boolean).join(", ")} ${horaSP(b.inicio)}–${horaSP(b.fim)})`).join("; ")}
        </span>
      ) : null}
    </div>
  );
}

function GradeDia({ data, visao, doDia, agora, onVazio, onAbrir }: {
  data: string; visao: "locais" | "mecanicos"; doDia: Agendamento[]; agora: { data: string; hora: string };
  onVazio: (hora: string, recurso: string) => void; onAbrir: (a: Agendamento) => void;
}) {
  const { cad } = useApp();
  const exp = expediente(data, cad.horarios, cad.folgas);
  const ab = Math.min(exp?.abre ?? 8 * 60, ...doDia.map((a) => faixa(a, data)![0]));
  const fe = Math.max(exp?.fecha ?? 18 * 60, ...doDia.map((a) => faixa(a, data)![1]));
  const ini = Math.floor(ab / 60) * 60, fim = Math.ceil(fe / 60) * 60;
  const colunas = visao === "locais"
    ? cad.locais.filter((l) => l.ativo || doDia.some((a) => a.local_id === l.id)).map((l) => ({ id: l.id, nome: l.nome, cor: undefined as string | undefined }))
    : cad.mecanicos.filter((m) => m.ativo || doDia.some((a) => a.mecanico_id === m.id)).map((m) => ({ id: m.id, nome: m.nome, cor: m.cor }));
  const campo = visao === "locais" ? "local_id" : "mecanico_id";
  const semLocal = visao === "locais" ? doDia.filter((a) => !a.local_id && a.tipo === "servico") : [];
  if (semLocal.length) colunas.push({ id: "", nome: "Sem elevador", cor: undefined });
  const altura = (fim - ini) * PX;
  const horas = Array.from({ length: (fim - ini) / 60 + 1 }, (_, i) => ini + i * 60);
  const agoraMin = agora.data === data ? min(agora.hora) : null;

  if (!colunas.length) return <p className="rounded-xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">Cadastre os elevadores e mecânicos em Ajustes.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <div className="flex" style={{ minWidth: 60 + colunas.length * 170 }}>
        <div className="w-[60px] shrink-0 border-r border-neutral-100">
          <div className="h-9 border-b border-neutral-200" />
          <div className="relative" style={{ height: altura }}>
            {horas.map((h) => <div key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-neutral-400" style={{ top: (h - ini) * PX }}>{hhmm(h)}</div>)}
          </div>
        </div>
        {colunas.map((c) => {
          const meus = c.id ? doDia.filter((a) => a[campo] === c.id) : semLocal;
          return (
            <div key={c.id || "sem"} className="min-w-[170px] flex-1 border-r border-neutral-100 last:border-r-0">
              <div className="sticky top-0 flex h-9 items-center gap-1.5 border-b border-neutral-200 px-2 text-xs font-semibold text-neutral-700">
                {c.cor ? <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} /> : null}{c.nome}
              </div>
              <div
                className="relative cursor-pointer"
                style={{ height: altura }}
                onClick={(e) => {
                  if (!c.id) return;
                  const y = e.clientY - (e.currentTarget as HTMLDivElement).getBoundingClientRect().top;
                  const m = Math.floor((ini + y / PX) / 15) * 15;
                  onVazio(hhmm(m), c.id);
                }}
              >
                {horas.map((h) => <div key={h} className="absolute inset-x-0 border-t border-neutral-100" style={{ top: (h - ini) * PX }} />)}
                {exp ? (
                  <>
                    {exp.abre > ini ? <div className="absolute inset-x-0 bg-neutral-100/70" style={{ top: 0, height: (exp.abre - ini) * PX }} /> : null}
                    {exp.fecha < fim ? <div className="absolute inset-x-0 bg-neutral-100/70" style={{ top: (exp.fecha - ini) * PX, height: (fim - exp.fecha) * PX }} /> : null}
                    {exp.almoco ? <div className="absolute inset-x-0 flex items-center justify-center bg-neutral-100/80 text-[11px] text-neutral-400" style={{ top: (exp.almoco[0] - ini) * PX, height: (exp.almoco[1] - exp.almoco[0]) * PX }}>almoço</div> : null}
                  </>
                ) : <div className="absolute inset-0 bg-neutral-100/70" />}
                {agoraMin !== null && agoraMin >= ini && agoraMin <= fim ? <div className="absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: (agoraMin - ini) * PX }} /> : null}
                {meus.map((a) => <Bloco key={a.id} a={a} data={data} ini={ini} visao={visao} agora={agora} onAbrir={onAbrir} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bloco({ a, data, ini, visao, agora, onAbrir }: { a: Agendamento; data: string; ini: number; visao: "locais" | "mecanicos"; agora: { data: string; hora: string }; onAbrir: (a: Agendamento) => void }) {
  const { cad } = useApp();
  const f = faixa(a, data)!;
  const mec = cad.mecanicos.find((m) => m.id === a.mecanico_id);
  const loc = cad.locais.find((l) => l.id === a.local_id);
  const morto = !vale(a.status) && a.status !== "pausado";
  const pausa = a.status === "pausado";
  const atrasado = a.status === "em_andamento" && `${dataSP(a.fim)} ${horaSP(a.fim)}` < `${agora.data} ${agora.hora}`;
  const cor = a.tipo === "bloqueio" ? "#a3a3a3" : mec?.cor ?? "#525252";
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onAbrir(a); }}
      className={`absolute left-1 right-1 z-20 overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm ${morto ? "border-dashed border-neutral-300 bg-white/70 text-neutral-400 line-through" : pausa ? "border-dashed border-orange-300 bg-orange-50/70 text-neutral-700" : a.tipo === "bloqueio" ? "border-neutral-300 bg-[repeating-linear-gradient(45deg,#f5f5f5,#f5f5f5_6px,#e5e5e5_6px,#e5e5e5_12px)] text-neutral-600" : "bg-white text-neutral-800"} ${atrasado ? "ring-2 ring-red-500" : ""}`}
      style={{ top: (f[0] - ini) * PX + 1, height: Math.max((f[1] - f[0]) * PX - 2, 18), borderLeft: morto ? undefined : `4px solid ${cor}` }}
    >
      <div className="flex items-center gap-1 font-semibold">
        <span className="truncate">{nomeAg(a)}</span>
        {a.espera === "aguarda" && !morto ? <UserRound size={11} className="shrink-0 text-amber-600" aria-label="Aguardando na oficina" /> : null}
        {!morto ? <IconesAg a={a} /> : null}
      </div>
      <div className="truncate text-neutral-600">{dataSP(a.inicio) === data ? horaSP(a.inicio) : "↳"}–{dataSP(a.fim) === data ? horaSP(a.fim) : "continua"} {a.veiculos ? `· ${placaFmt(a.veiculos.placa)}` : ""}</div>
      {a.tipo === "servico" ? <div className="truncate text-neutral-500">{(a.agendamento_itens ?? []).map((i) => i.descricao).join(", ")}</div> : null}
      <div className="truncate text-neutral-500">{visao === "locais" ? mec?.nome : loc?.nome}{a.tipo === "servico" ? ` · ${nomeSeguradora(a.seguradora)}` : ""}</div>
      {a.status !== "agendado" && a.status !== "confirmado" ? <span className={`mt-0.5 inline-flex rounded px-1 text-[10px] ring-1 ring-inset ${STATUS[a.status].cls}`}>{STATUS[a.status].nome}</span> : null}
    </button>
  );
}

function Semana({ segunda, lista, onAbrir, onDia }: { segunda: string; lista: Agendamento[]; onAbrir: (a: Agendamento) => void; onDia: (d: string) => void }) {
  const { cad } = useApp();
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i)).filter((d) => abreNoDia(d, cad.horarios) || lista.some((a) => faixa(a, d)));
  return (
    <div className="grid gap-2 md:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" style={{ "--n": dias.length } as CSSProperties}>
      {dias.map((d) => {
        const meus = lista.filter((a) => faixa(a, d));   // serviço de vários dias aparece em todos os dias
        const carros = meus.filter((a) => a.tipo === "servico" && vale(a.status)).length;
        const fechado = !expediente(d, cad.horarios, cad.folgas);
        return (
          <div key={d} className={`rounded-xl border border-neutral-200 ${fechado ? "bg-neutral-50" : "bg-white"} p-2`}>
            <button onClick={() => onDia(d)} className={`mb-1.5 flex w-full items-baseline justify-between text-left ${d === hojeSP() ? "text-red-600" : "text-neutral-800"}`}>
              <span className="text-xs font-semibold capitalize">{nomeDia(d).slice(0, 3)} {dataBR(d).slice(0, 5)}</span>
              <span className="text-[11px] text-neutral-500">{fechado ? "fechado" : `${carros} carro(s)`}</span>
            </button>
            <div className="space-y-1">
              {meus.map((a) => (
                <button key={a.id} onClick={() => onAbrir(a)} className={`block w-full rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight ${vale(a.status) ? "border-neutral-200" : "border-dashed border-neutral-200 text-neutral-400 line-through"}`}
                  style={{ borderLeft: vale(a.status) ? `3px solid ${a.tipo === "bloqueio" ? "#a3a3a3" : cad.mecanicos.find((m) => m.id === a.mecanico_id)?.cor ?? "#525252"}` : undefined }}>
                  <div className="font-semibold">{dataSP(a.inicio) === d ? horaSP(a.inicio) : "↳ continua"} {nomeAg(a)}</div>
                  <div className="truncate text-neutral-500">{(a.agendamento_itens ?? []).map((i) => i.descricao).join(", ")}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A oficina abre nesse dia da semana? (folga/feriado não conta aqui: o dia aparece, marcado como fechado) */
const abreNoDia = (d: string, horarios: { dia_semana: number; aberto: boolean }[]) => horarios.some((h) => h.dia_semana === diaSemana(d) && h.aberto);

/* Mês: um quadradinho por dia; no celular só a contagem, no computador os primeiros horários */
function Mes({ data, ini, fim, lista, onAbrir, onDia }: { data: string; ini: string; fim: string; lista: Agendamento[]; onAbrir: (a: Agendamento) => void; onDia: (d: string) => void }) {
  const { cad } = useApp();
  const mes = data.slice(0, 7);
  const todos: string[] = [];
  for (let d = ini; d <= fim; d = somarDias(d, 1)) todos.push(d);
  // só os dias da semana em que a oficina abre (ou que têm algo marcado por encaixe)
  const usados = new Set(todos.filter((d) => abreNoDia(d, cad.horarios) || lista.some((a) => faixa(a, d))).map((d) => (diaSemana(d) + 6) % 7));
  const colunas = [0, 1, 2, 3, 4, 5, 6].filter((i) => usados.has(i));
  const dias = todos.filter((d) => usados.has((diaSemana(d) + 6) % 7));
  const hoje = hojeSP();
  const totalMes = new Set(lista.filter((a) => a.tipo === "servico" && vale(a.status) && dataSP(a.inicio).startsWith(mes)).map((a) => a.id)).size;
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">{totalMes} carro(s) marcados no mês. Toque num dia para abrir a agenda dele.</p>
      <div className="grid gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200" style={{ gridTemplateColumns: `repeat(${colunas.length || 1}, minmax(0, 1fr))` }}>
        {colunas.map((i) => ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][i]).map((n) => <div key={n} className="bg-neutral-50 py-1.5 text-center text-[11px] font-medium text-neutral-500">{n}</div>)}
        {dias.map((d) => {
          const fora = !d.startsWith(mes);
          const fechado = !expediente(d, cad.horarios, cad.folgas);
          const folga = cad.folgas.find((f) => f.dia === d);
          const meus = lista.filter((a) => faixa(a, d)).sort((x, y) => x.inicio.localeCompare(y.inicio));
          const carros = meus.filter((a) => a.tipo === "servico" && vale(a.status));
          const MAX = 4;
          return (
            <div key={d} className={`min-h-16 min-w-0 p-1 sm:min-h-28 sm:p-1.5 ${fora ? "bg-neutral-50/70" : fechado ? "bg-neutral-50" : "bg-white"}`}>
              <button onClick={() => onDia(d)} className="flex w-full flex-col items-start gap-0.5 text-left sm:flex-row sm:items-baseline sm:justify-between" aria-label={`Abrir ${dataBR(d)}`}>
                <span className={`text-xs font-semibold tabular-nums ${d === hoje ? "rounded-full bg-red-600 px-1.5 text-white" : fora ? "text-neutral-400" : "text-neutral-800"}`}>{Number(d.slice(8))}</span>
                {fechado ? <span className="truncate text-[10px] text-neutral-400">{folga?.motivo ?? "fechado"}</span>
                  : carros.length ? <span className={`rounded px-1 text-[10px] font-medium ${fora ? "text-neutral-400" : "bg-neutral-900 text-white"}`}>{carros.length}<span className="hidden sm:inline"> carro{carros.length > 1 ? "s" : ""}</span></span> : null}
              </button>
              {/* pontinhos por mecânico no celular */}
              {carros.length ? (
                <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                  {carros.slice(0, 8).map((a) => <span key={a.id} className="h-1.5 w-1.5 rounded-full" style={{ background: cad.mecanicos.find((m) => m.id === a.mecanico_id)?.cor ?? "#525252" }} />)}
                </div>
              ) : null}
              <div className="mt-1 hidden space-y-0.5 sm:block">
                {meus.slice(0, MAX).map((a) => (
                  <button key={a.id} onClick={() => onAbrir(a)} className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:bg-neutral-100 ${vale(a.status) ? "" : "text-neutral-400 line-through"}`}
                    style={{ borderLeft: `3px solid ${a.tipo === "bloqueio" ? "#a3a3a3" : cad.mecanicos.find((m) => m.id === a.mecanico_id)?.cor ?? "#525252"}` }}>
                    <span className="shrink-0 tabular-nums text-neutral-500">{dataSP(a.inicio) === d ? horaSP(a.inicio) : "↳"}</span>
                    <span className="min-w-0 truncate">{nomeAg(a)}</span>
                    {vale(a.status) ? <IconesAg a={a} /> : null}
                  </button>
                ))}
                {meus.length > MAX ? <button onClick={() => onDia(d)} className="px-1 text-[11px] font-medium text-neutral-600 hover:underline">+{meus.length - MAX} mais</button> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Lista para confirmar os clientes do próximo dia de expediente, um clique por cliente */
function ConfirmarAmanha({ onClose, onAbrir }: { onClose: () => void; onAbrir: (a: Agendamento) => void }) {
  const { sb, notify, cad } = useApp();
  const dia = proximoDiaUtil(hojeSP(), cad.horarios, cad.folgas);
  const [lista, setLista] = useState<Agendamento[] | null>(null);
  const carregar = useCallback(() => {
    buscarAgendamentos(sb, dia, dia).then((l) => setLista(l.filter((a) => a.tipo === "servico" && dataSP(a.inicio) === dia && (a.status === "agendado" || a.status === "confirmado"))))
      .catch((e) => notify(msgErro(e), "erro"));
  }, [sb, dia, notify]);
  useEffect(() => { carregar(); }, [carregar]);
  async function acao(a: Agendamento, p_acao: "enviada" | "confirmou" | "desfazer") {
    const { error } = await sb.rpc("marcar_confirmacao", { p_id: a.id, p_acao });
    if (error) { notify(msgErro(error), "erro"); return; }
    carregar();
  }
  const faltam = (lista ?? []).filter((a) => !a.confirmado_em && a.status !== "confirmado").length;
  const semResposta = (lista ?? []).filter((a) => !a.confirmado_em && a.status !== "confirmado" && a.confirmacao_enviada_em).length;
  return (
    <Modal titulo={`Confirmar ${nomeDia(dia)}, ${dataBR(dia)}`} onClose={onClose} largura="max-w-2xl">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-neutral-600">Mande a mensagem pelo WhatsApp e, quando o cliente responder, toque em “Confirmou”. Quem recebeu e não respondeu fica marcado como “Não respondeu” na agenda. {lista ? `${faltam} de ${lista.length} sem confirmar${semResposta ? ` (${semResposta} não responderam)` : ""}.` : ""}</p>
        {lista === null ? <p className="text-neutral-500">Carregando…</p> : lista.length === 0 ? <p className="py-6 text-center text-neutral-500">Ninguém agendado.</p> : (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {lista.map((a) => {
              const zap = linkWhats(a.clientes?.telefone ?? null, mensagemConfirmacao({ cliente: a.clientes?.nome ?? "", data: dia, hora: horaSP(a.inicio), servicos: (a.agendamento_itens ?? []).map((i) => i.descricao), placa: a.veiculos?.placa, espera: a.espera }));
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="w-12 font-semibold tabular-nums">{horaSP(a.inicio)}</span>
                  <button className="min-w-0 flex-1 text-left" onClick={() => onAbrir(a)}>
                    <div className="font-medium">{a.clientes?.nome}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1"><Selos a={a} enviadaTxt /></div>
                    <div className="truncate text-xs text-neutral-500">{(a.agendamento_itens ?? []).map((i) => i.descricao).join(", ")} · {cad.mecanicos.find((m) => m.id === a.mecanico_id)?.nome}</div>
                  </button>
                  {a.confirmado_em || a.status === "confirmado" ? <Button variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => acao(a, "desfazer")}>Desfazer</Button> : (
                    <span className="flex gap-1.5">
                      {zap ? (
                        <a href={zap} target="_blank" rel="noreferrer" onClick={() => acao(a, "enviada")}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${a.confirmacao_enviada_em ? "border-neutral-200 text-neutral-500" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
                          <MessageCircle size={12} /> {a.confirmacao_enviada_em ? "Mandar de novo" : "WhatsApp"}
                        </a>
                      ) : <span className="text-xs text-neutral-400">sem telefone</span>}
                      {!a.confirmacao_enviada_em ? <Button variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => acao(a, "enviada")}>Já mandei</Button> : null}
                      <Button className="!px-2 !py-1 !text-xs" onClick={() => acao(a, "confirmou")}>Confirmou</Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
