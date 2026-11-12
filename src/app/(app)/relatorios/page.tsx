"use client";

import { useEffect, useMemo, useState } from "react";
import { buscarAgendamentos } from "@/components/Agendamento";
import { msgErro, useApp } from "@/components/AppShell";
import { Segmentado, inputCls } from "@/components/ui";
import { dataBR, diaSemana, duracaoTxt, hojeSP, nomeDia, relatorio, somarDias, type Agendamento } from "@/lib/agenda";

type Per = "semana" | "semana_passada" | "mes" | "mes_passado" | "custom";
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: v > 0 && v < 1 ? 2 : 1 });

function periodo(p: Per, de: string, ate: string): [string, string] {
  const h = hojeSP();
  const seg = somarDias(h, -((diaSemana(h) + 6) % 7));
  const iniMes = `${h.slice(0, 8)}01`;
  const fimMes = somarDias(`${somarDias(iniMes, 32).slice(0, 8)}01`, -1);
  const iniAnt = `${somarDias(iniMes, -1).slice(0, 8)}01`;
  switch (p) {
    case "semana": return [seg, somarDias(seg, 6)];
    case "semana_passada": return [somarDias(seg, -7), somarDias(seg, -1)];
    case "mes": return [iniMes, fimMes];
    case "mes_passado": return [iniAnt, somarDias(iniMes, -1)];
    default: return [de, ate];
  }
}

export default function Relatorios() {
  const { sb, notify, cad } = useApp();
  const [per, setPer] = useState<Per>("mes");
  const [de, setDe] = useState(somarDias(hojeSP(), -30));
  const [ate, setAte] = useState(hojeSP());
  const [lista, setLista] = useState<Agendamento[]>([]);
  const [ini, fim] = periodo(per, de, ate);

  useEffect(() => { buscarAgendamentos(sb, ini, fim).then(setLista).catch((e) => notify(msgErro(e), "erro")); }, [sb, ini, fim, notify]);
  const r = useMemo(() => relatorio({ inicio: ini, fim, agendamentos: lista, mecanicos: cad.mecanicos, horarios: cad.horarios, folgas: cad.folgas, servicos: cad.servicos }), [ini, fim, lista, cad]);
  const maxDia = Math.max(1, ...r.porDia.map((d) => d.carros));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Relatórios</h1>
          <p className="text-xs text-neutral-500">{dataBR(ini)} a {dataBR(fim)} · {r.dias} dia(s) de expediente</p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-end gap-2 sm:ml-auto">
          <Segmentado valor={per} onChange={setPer} opcoes={[{ id: "semana", label: "Esta semana" }, { id: "semana_passada", label: "Semana passada" }, { id: "mes", label: "Este mês" }, { id: "mes_passado", label: "Mês passado" }, { id: "custom", label: "Escolher" }]} />
          {per === "custom" ? (<><input type="date" className={`${inputCls} !w-auto`} value={de} onChange={(e) => setDe(e.target.value)} aria-label="De" /><input type="date" className={`${inputCls} !w-auto`} value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" /></>) : null}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Carros feitos", String(r.total.carros)], ["Cancelados", String(r.total.cancelados)],
          ["Média por dia", num(r.dias ? r.total.carros / r.dias : 0)], ["Faltas", String(r.total.faltas)], ["Remarcados", String(r.total.remarcados)],
        ].map(([t, v]) => (
          <div key={t} className="rounded-xl border border-neutral-200 bg-white px-4 py-3"><div className="text-xs text-neutral-500">{t}</div><div className="text-lg font-semibold">{v}</div></div>
        ))}
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white">
        <h2 className="border-b border-neutral-100 px-4 py-2.5 text-sm font-semibold">Por mecânico</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr><th className="px-4 py-2 font-medium">Mecânico</th><th className="px-3 py-2 text-right font-medium">Carros</th><th className="px-3 py-2 text-right font-medium">Média/dia</th><th className="px-3 py-2 text-right font-medium">Média/semana</th><th className="px-3 py-2 text-right font-medium">Horas marcadas</th><th className="px-3 py-2 text-right font-medium">Ocupação</th><th className="px-3 py-2 text-right font-medium">Tempo real × previsto</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {r.mecanicos.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 font-medium">{m.nome}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.carros}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(m.porDia)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(m.porSemana)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{duracaoTxt(Math.round(m.minutos))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(m.ocupacao)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${m.realVsPrevisto !== null && m.realVsPrevisto > 0.1 ? "text-amber-700" : ""}`}>
                    {m.realVsPrevisto === null ? "—" : `${m.realVsPrevisto >= 0 ? "+" : ""}${pct(m.realVsPrevisto)} (${m.medidos})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-xs text-neutral-500">
          Carro feito = agendamento concluído (um carro com vários serviços conta 1). Ocupação = horas marcadas ÷ horas de expediente.
          Tempo real × previsto só conta os serviços em que você apertou “Começar” e “Concluir”: +20% quer dizer que ele leva 20% a mais que o tempo cadastrado.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white">
          <h2 className="border-b border-neutral-100 px-4 py-2.5 text-sm font-semibold">Serviços mais feitos</h2>
          {r.servicos.length === 0 ? <p className="px-4 py-6 text-center text-sm text-neutral-500">Nenhum serviço concluído no período.</p> : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {r.servicos.map((s) => <li key={s.nome} className="flex justify-between px-4 py-2"><span>{s.nome}</span><span className="tabular-nums text-neutral-700">{s.qtd}</span></li>)}
            </ul>
          )}
        </section>
        <section className="rounded-xl border border-neutral-200 bg-white">
          <h2 className="border-b border-neutral-100 px-4 py-2.5 text-sm font-semibold">Seguradoras e clientes</h2>
          <ul className="divide-y divide-neutral-100 text-sm">
            {r.seguradoras.map((s) => <li key={s.id} className="flex justify-between px-4 py-2"><span>{s.nome}</span><span className="tabular-nums text-neutral-700">{s.carros} carro(s)</span></li>)}
            <li className="flex justify-between px-4 py-2 text-neutral-600"><span>Aguardaram na oficina / deixaram o carro</span><span className="tabular-nums">{r.total.aguardou} / {r.total.deixou}</span></li>
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <h2 className="mb-2 text-sm font-semibold">Carros feitos por dia</h2>
        {r.porDia.length === 0 ? <p className="text-sm text-neutral-500">Sem dias de expediente no período.</p> : (
          <div className="flex h-36 items-end gap-1 overflow-x-auto">
            {r.porDia.map((d) => (
              <div key={d.data} className="flex min-w-[22px] flex-1 flex-col items-center gap-1" title={`${nomeDia(d.data)} ${dataBR(d.data)}: ${d.carros} carro(s)`}>
                <span className="text-[10px] tabular-nums text-neutral-600">{d.carros || ""}</span>
                <div className="w-full rounded-t bg-neutral-800" style={{ height: `${(d.carros / maxDia) * 100}px` }} />
                <span className="text-[10px] text-neutral-500">{d.data.slice(8, 10)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
