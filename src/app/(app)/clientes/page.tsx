"use client";

import { Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SELECT_AG } from "@/components/Agendamento";
import { msgErro, useApp } from "@/components/AppShell";
import { Button, ConfirmDialog, Field, Modal, Vazio, inputCls } from "@/components/ui";
import { dataBR, dataSP, horaSP, limparPlaca, nomeSeguradora, placaFmt, placaValida, SEGURADORAS, STATUS, type Agendamento, type Cliente, type Seguradora, type Veiculo } from "@/lib/agenda";

type Linha = Cliente & { veiculos: Veiculo[] };

export default function Clientes() {
  const { sb, notify } = useApp();
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<Linha[]>([]);
  const [aberto, setAberto] = useState<Linha | null>(null);

  const carregar = useCallback(async () => {
    const t = busca.trim().replace(/[%,()]/g, "");
    let q = sb.from("clientes").select("*, veiculos(*)").order("nome").limit(200);
    if (t) {
      const p = limparPlaca(t);
      const { data: vs } = p.length >= 3 ? await sb.from("veiculos").select("cliente_id").ilike("placa", `%${p}%`).limit(50) : { data: [] };
      const ids = ((vs ?? []) as { cliente_id: string }[]).map((v) => v.cliente_id);
      const dig = t.replace(/\D/g, "");
      q = q.or([`nome.ilike.%${t}%`, dig.length >= 3 ? `telefone.ilike.%${dig}%` : "", ids.length ? `id.in.(${ids.join(",")})` : ""].filter(Boolean).join(","));
    }
    const { data, error } = await q;
    if (error) { notify(msgErro(error), "erro"); return; }
    setLista((data ?? []) as Linha[]);
  }, [sb, busca, notify]);
  useEffect(() => { const h = setTimeout(carregar, 250); return () => clearTimeout(h); }, [carregar]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-neutral-900">Clientes</h1>
        <div className="relative ml-auto w-full sm:w-80">
          <Search size={15} className="absolute left-3 top-2.5 text-neutral-400" />
          <input className={`${inputCls} pl-9`} placeholder="Nome, telefone ou placa" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white">
        {lista.length === 0 ? <Vazio>Nenhum cliente. Eles são cadastrados ao agendar.</Vazio> : (
          <ul className="divide-y divide-neutral-100">
            {lista.map((c) => (
              <li key={c.id}>
                <button className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-left text-sm hover:bg-neutral-50" onClick={() => setAberto(c)}>
                  <span className="font-medium text-neutral-900">{c.nome}</span>
                  <span className="text-xs text-neutral-500">{c.telefone ?? ""}</span>
                  <span className="text-xs text-neutral-500">{nomeSeguradora(c.seguradora)}</span>
                  <span className="ml-auto text-xs text-neutral-600">{c.veiculos.map((v) => `${placaFmt(v.placa)}${v.modelo ? ` ${v.modelo}` : ""}`).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {aberto ? <ClienteModal c={aberto} onClose={() => setAberto(null)} onSalvo={carregar} /> : null}
    </div>
  );
}

function ClienteModal({ c, onClose, onSalvo }: { c: Linha; onClose: () => void; onSalvo: () => void }) {
  const { sb, notify, cad } = useApp();
  const [nome, setNome] = useState(c.nome);
  const [tel, setTel] = useState(c.telefone ?? "");
  const [seg, setSeg] = useState<Seguradora>(c.seguradora);
  const [obs, setObs] = useState(c.observacoes ?? "");
  const [veiculos, setVeiculos] = useState<Veiculo[]>(c.veiculos);
  const [novo, setNovo] = useState({ placa: "", modelo: "" });
  const [hist, setHist] = useState<Agendamento[]>([]);
  const [apagarV, setApagarV] = useState<Veiculo | null>(null);
  const [excluirC, setExcluirC] = useState(false);
  const [juntar, setJuntar] = useState(false);

  useEffect(() => {
    sb.from("agendamentos").select(SELECT_AG).eq("cliente_id", c.id).order("inicio", { ascending: false }).limit(50)
      .then(({ data }) => setHist(((data ?? []) as Agendamento[]).map((a) => ({ ...a, valor_total: Number(a.valor_total) }))));
  }, [sb, c.id]);

  async function salvar() {
    const { error } = await sb.from("clientes").update({ nome: nome.trim(), telefone: tel.trim() || null, seguradora: seg, observacoes: obs.trim() || null }).eq("id", c.id);
    if (error) { notify(msgErro(error), "erro"); return; }
    for (const v of veiculos) {
      const orig = c.veiculos.find((x) => x.id === v.id);
      if (orig && (orig.placa !== v.placa || orig.modelo !== v.modelo)) {
        if (!placaValida(v.placa)) { notify(`Placa inválida: ${v.placa}`, "erro"); return; }
        const r = await sb.from("veiculos").update({ placa: limparPlaca(v.placa), modelo: v.modelo || null }).eq("id", v.id);
        if (r.error) { notify(r.error.code === "23505" ? `A placa ${v.placa} já está cadastrada em outro cliente.` : msgErro(r.error), "erro"); return; }
      }
    }
    notify("Cliente salvo."); onSalvo(); onClose();
  }
  async function addVeiculo() {
    if (!placaValida(novo.placa)) { notify("Placa inválida.", "erro"); return; }
    const { data, error } = await sb.from("veiculos").insert({ cliente_id: c.id, placa: limparPlaca(novo.placa), modelo: novo.modelo.trim() || null }).select().single();
    if (error) { notify(error.code === "23505" ? "Essa placa já está cadastrada em outro cliente." : msgErro(error), "erro"); return; }
    setVeiculos((l) => [...l, data as Veiculo]); setNovo({ placa: "", modelo: "" }); onSalvo();
  }
  async function apagar(v: Veiculo) {
    const { error } = await sb.from("veiculos").delete().eq("id", v.id);
    if (error) { notify(msgErro(error), "erro"); return; }
    setVeiculos((l) => l.filter((x) => x.id !== v.id)); onSalvo();
  }
  const feitos = hist.filter((a) => a.status === "concluido");

  return (
    <Modal titulo={c.nome} onClose={onClose} largura="max-w-2xl">
      <div className="space-y-4 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Nome"><input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
          <Field label="Telefone"><input className={inputCls} value={tel} onChange={(e) => setTel(e.target.value)} /></Field>
          <Field label="Seguradora mais comum">
            <select className={inputCls} value={seg} onChange={(e) => setSeg(e.target.value as Seguradora)}>{SEGURADORAS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
          </Field>
          <Field label="Observações"><input className={inputCls} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-600">Veículos</span>
          <ul className="space-y-1.5">
            {veiculos.map((v) => (
              <li key={v.id} className="flex gap-2">
                <input className={`${inputCls} !w-32`} value={v.placa} onChange={(e) => setVeiculos((l) => l.map((x) => (x.id === v.id ? { ...x, placa: e.target.value.toUpperCase() } : x)))} aria-label="Placa" />
                <input className={inputCls} value={v.modelo ?? ""} placeholder="Modelo" onChange={(e) => setVeiculos((l) => l.map((x) => (x.id === v.id ? { ...x, modelo: e.target.value } : x)))} aria-label="Modelo" />
                <Button variant="ghost" aria-label="Apagar veículo" onClick={() => setApagarV(v)}><Trash2 size={14} /></Button>
              </li>
            ))}
            <li className="flex gap-2">
              <input className={`${inputCls} !w-32`} placeholder="Placa" value={novo.placa} onChange={(e) => setNovo({ ...novo, placa: e.target.value.toUpperCase() })} />
              <input className={inputCls} placeholder="Modelo" value={novo.modelo} onChange={(e) => setNovo({ ...novo, modelo: e.target.value })} />
              <Button onClick={addVeiculo} disabled={!novo.placa}><Plus size={14} /></Button>
            </li>
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="text-xs text-neutral-600 underline" onClick={() => setJuntar(true)}>Cadastro em dobro? Juntar com outro</button>
          <button className="text-xs text-red-700 underline" onClick={() => setExcluirC(true)}>Excluir cliente</button>
          <div className="ml-auto flex gap-2"><Button onClick={onClose}>Fechar</Button><Button variant="primary" onClick={salvar} disabled={!nome.trim()}>Salvar</Button></div>
        </div>

        <div className="border-t border-neutral-100 pt-3">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Histórico</span>
            <span className="text-xs text-neutral-500">{feitos.length} serviço(s) feitos</span>
          </div>
          {hist.length === 0 ? <p className="text-xs text-neutral-500">Sem agendamentos.</p> : (
            <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
              {hist.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 px-3 py-1.5 text-xs">
                  <span className="w-28 tabular-nums">{dataBR(dataSP(a.inicio))} {horaSP(a.inicio)}</span>
                  <span className="min-w-0 flex-1">{(a.agendamento_itens ?? []).map((i) => i.descricao).join(", ")} · {cad.mecanicos.find((m) => m.id === a.mecanico_id)?.nome}</span>
                  <span className={`rounded-full px-1.5 py-0.5 ring-1 ring-inset ${STATUS[a.status].cls}`}>{STATUS[a.status].nome}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {excluirC ? (
        <ConfirmDialog titulo="Excluir cliente" perigo confirmar="Excluir" onCancel={() => setExcluirC(false)}
          texto={hist.length ? `${c.nome} tem ${hist.length} agendamento(s) no histórico, então não dá para excluir. Se for cadastro repetido, use “Juntar com outro”.` : `Excluir ${c.nome} e os veículos dele?`}
          onConfirm={async () => {
            setExcluirC(false);
            if (hist.length) return;
            const { error } = await sb.from("clientes").delete().eq("id", c.id);
            if (error) { notify(error.code === "23503" ? "Este cliente tem agendamentos: use “Juntar com outro”." : msgErro(error), "erro"); return; }
            notify("Cliente excluído."); onSalvo(); onClose();
          }} />
      ) : null}
      {juntar ? <JuntarModal c={c} onClose={() => setJuntar(false)} onFeito={() => { onSalvo(); onClose(); }} /> : null}
      {apagarV ? <ConfirmDialog titulo="Apagar veículo" texto={`Apagar ${placaFmt(apagarV.placa)}? Os agendamentos antigos continuam, só sem a placa.`} confirmar="Apagar" perigo onCancel={() => setApagarV(null)} onConfirm={() => { apagar(apagarV); setApagarV(null); }} /> : null}
    </Modal>
  );
}

function JuntarModal({ c, onClose, onFeito }: { c: Linha; onClose: () => void; onFeito: () => void }) {
  const { sb, notify } = useApp();
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Cliente[]>([]);
  const [outro, setOutro] = useState<Cliente | null>(null);
  useEffect(() => {
    const t = busca.trim().replace(/[%,()]/g, "");
    if (t.length < 2) { setAchados([]); return; }
    const h = setTimeout(async () => {
      const { data } = await sb.from("clientes").select("*").ilike("nome", `%${t}%`).neq("id", c.id).limit(8);
      setAchados((data ?? []) as Cliente[]);
    }, 250);
    return () => clearTimeout(h);
  }, [busca, sb, c.id]);
  async function juntar() {
    if (!outro) return;
    const { error } = await sb.rpc("juntar_clientes", { p_manter: c.id, p_apagar: outro.id });
    if (error) { notify(msgErro(error), "erro"); return; }
    notify(`${outro.nome} foi juntado em ${c.nome}.`); onFeito();
  }
  return (
    <Modal titulo={`Juntar com ${c.nome}`} onClose={onClose} largura="max-w-md">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-neutral-600">Escolha o cadastro repetido. Os veículos e agendamentos dele passam para <b>{c.nome}</b> e o repetido é apagado.</p>
        <input className={inputCls} placeholder="Buscar o cadastro repetido" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {achados.map((x) => (
            <li key={x.id}><button className={`w-full px-3 py-2 text-left ${outro?.id === x.id ? "bg-neutral-100 font-medium" : ""}`} onClick={() => setOutro(x)}>{x.nome} <span className="text-xs text-neutral-500">{x.telefone ?? ""}</span></button></li>
          ))}
        </ul>
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Fechar</Button><Button variant="primary" disabled={!outro} onClick={juntar}>Juntar</Button></div>
      </div>
    </Modal>
  );
}
