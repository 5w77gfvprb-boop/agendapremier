"use client";

import { Pencil } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AgendamentoForm, SELECT_AG } from "@/components/Agendamento";
import { msgErro, useApp } from "@/components/AppShell";
import { Button, Segmentado, Vazio, inputCls } from "@/components/ui";
import { brl, dataBR, dataSP, hojeSP, horaSP, nomeSeguradora, placaFmt, SEGURADORAS, somarDias, type Agendamento } from "@/lib/agenda";

type Aba = "receber" | "recebidos";

export default function Finalizados() {
  const { sb, notify, cad } = useApp();
  const [aba, setAba] = useState<Aba>("receber");
  const [de, setDe] = useState(somarDias(hojeSP(), -30));
  const [ate, setAte] = useState(hojeSP());
  const [seg, setSeg] = useState("");
  const [lista, setLista] = useState<Agendamento[]>([]);
  const [editar, setEditar] = useState<Agendamento | null>(null);

  const carregar = useCallback(async () => {
    let q = sb.from("agendamentos").select(SELECT_AG).eq("tipo", "servico").eq("status", "concluido").limit(1000);
    // a receber: de qualquer data, para nada ficar esquecido; recebidos: pelo período
    if (aba === "receber") q = q.eq("pagamento", "pendente").order("inicio");
    else q = q.eq("pagamento", "recebido").gte("pagamento_data", de).lte("pagamento_data", ate).order("pagamento_data", { ascending: false });
    if (seg) q = q.eq("seguradora", seg);
    const { data, error } = await q;
    if (error) { notify(msgErro(error), "erro"); return; }
    setLista(((data ?? []) as Agendamento[]).map((a) => ({ ...a, valor_total: Number(a.valor_total) })));
  }, [sb, aba, de, ate, seg, notify]);
  useEffect(() => { carregar(); }, [carregar]);

  async function marcar(a: Agendamento, recebido: boolean) {
    const { error } = await sb.rpc("marcar_recebido", { p_id: a.id, p_recebido: recebido });
    if (error) { notify(msgErro(error), "erro"); return; }
    notify(recebido ? `${a.clientes?.nome ?? ""}: recebido.` : "Voltou para A receber.");
    carregar();
  }
  const total = lista.reduce((s, a) => s + a.valor_total, 0);
  const antigos = aba === "receber" ? lista.filter((a) => dataSP(a.fim_real ?? a.fim) < somarDias(hojeSP(), -15)).length : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Serviços finalizados</h1>
          <p className="text-xs text-neutral-500">Todo serviço concluído aparece aqui até você marcar que recebeu.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <Segmentado valor={aba} onChange={setAba} opcoes={[{ id: "receber", label: "A receber" }, { id: "recebidos", label: "Recebidos" }]} />
          <select className={`${inputCls} !w-auto`} value={seg} onChange={(e) => setSeg(e.target.value)} aria-label="Seguradora">
            <option value="">Todas as seguradoras</option>{SEGURADORAS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          {aba === "recebidos" ? (<><input type="date" className={`${inputCls} !w-auto`} value={de} onChange={(e) => setDe(e.target.value)} aria-label="Recebido de" /><input type="date" className={`${inputCls} !w-auto`} value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Recebido até" /></>) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">
        <span>{aba === "receber" ? "Falta receber" : "Recebido no período"}: <b className={aba === "receber" && total ? "text-amber-700" : ""}>{brl(total)}</b> em {lista.length} serviço(s)</span>
        {antigos ? <span className="text-red-700">{antigos} concluído(s) há mais de 15 dias ainda sem receber</span> : null}
      </div>

      {/* celular: cartões, com o botão Recebi sempre à vista */}
      {lista.length ? (
        <ul className="space-y-2 md:hidden">
          {lista.map((a) => {
            const quando = a.fim_real ?? a.fim;
            return (
              <li key={a.id} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{a.clientes?.nome}</span>
                  <span className="font-semibold tabular-nums">{brl(a.valor_total)}</span>
                </div>
                <div className="text-xs text-neutral-600">{(a.agendamento_itens ?? []).map((i) => i.descricao).join(", ")}</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {a.veiculos ? `${placaFmt(a.veiculos.placa)} · ` : ""}{nomeSeguradora(a.seguradora)}{a.cortesia ? " (cortesia)" : ""}{a.sinistro ? ` ${a.sinistro}` : ""} · concluído {dataBR(dataSP(quando)).slice(0, 5)} {horaSP(quando)} · {cad.mecanicos.find((m) => m.id === a.mecanico_id)?.nome}
                  {aba === "recebidos" ? ` · recebido ${dataBR(a.pagamento_data)}` : ""}
                </div>
                <div className="mt-2 flex gap-2">
                  {aba === "receber" ? <Button variant="primary" className="flex-1" onClick={() => marcar(a, true)}>Recebi</Button> : <Button className="flex-1" onClick={() => marcar(a, false)}>Desfazer</Button>}
                  <Button aria-label="Editar serviço" onClick={() => setEditar(a)}><Pencil size={14} /></Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className={`overflow-x-auto rounded-xl border border-neutral-200 bg-white ${lista.length ? "hidden md:block" : ""}`}>
        {lista.length === 0 ? <Vazio>{aba === "receber" ? "Nada a receber: tudo o que foi concluído já foi recebido." : "Nada recebido neste período."}</Vazio> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Concluído</th><th className="px-3 py-2 font-medium">Cliente</th><th className="px-3 py-2 font-medium">Serviços</th>
                <th className="px-3 py-2 font-medium">Seguradora</th><th className="px-3 py-2 text-right font-medium">Valor</th><th className="px-3 py-2"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {lista.map((a) => {
                const quando = a.fim_real ?? a.fim;
                return (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{dataBR(dataSP(quando))}<div className="text-xs text-neutral-500">{horaSP(quando)} · {cad.mecanicos.find((m) => m.id === a.mecanico_id)?.nome}</div></td>
                    <td className="px-3 py-2">{a.clientes?.nome}<div className="text-xs text-neutral-500">{a.veiculos ? `${placaFmt(a.veiculos.placa)} ${a.veiculos.modelo ?? ""}` : ""}</div></td>
                    <td className="px-3 py-2 text-xs">{(a.agendamento_itens ?? []).map((i) => i.descricao).join(", ")}</td>
                    <td className="px-3 py-2 text-xs">{nomeSeguradora(a.seguradora)}{a.cortesia ? " (cortesia)" : ""}{a.sinistro ? <div className="text-neutral-500">{a.sinistro}</div> : null}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">{brl(a.valor_total)}{aba === "recebidos" ? <div className="text-xs font-normal text-neutral-500">em {dataBR(a.pagamento_data)}</div> : null}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {aba === "receber" ? <Button variant="primary" onClick={() => marcar(a, true)}>Recebi</Button> : <Button onClick={() => marcar(a, false)}>Desfazer</Button>}
                      <Button variant="ghost" aria-label="Editar serviço" onClick={() => setEditar(a)}><Pencil size={14} /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {editar ? <AgendamentoForm editar={editar} inicial={{ data: dataSP(editar.inicio) }} onClose={() => setEditar(null)} onSalvo={carregar} /> : null}
    </div>
  );
}
