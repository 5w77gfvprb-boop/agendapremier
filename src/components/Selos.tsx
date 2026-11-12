import { CircleAlert, CircleCheck, CircleDashed, Gift } from "lucide-react";
import { CONFIRMACAO, confirmacao, cortesiaTxt, type Agendamento } from "@/lib/agenda";

const ICONE = { confirmado: CircleCheck, sem_resposta: CircleAlert, nao_confirmado: CircleDashed } as const;
const COR = { confirmado: "text-emerald-600", sem_resposta: "text-amber-600", nao_confirmado: "text-neutral-400" } as const;

/** Selos por extenso: "Cortesia Porto" e "Confirmou / Não respondeu / Não confirmado". */
export function Selos({ a, enviadaTxt = false }: { a: Agendamento; enviadaTxt?: boolean }) {
  const c = confirmacao(a);
  const cort = cortesiaTxt(a);
  if (!c && !cort) return null;
  const Icone = c ? ICONE[c] : null;
  const quando = (ts?: string | null) => (ts ? new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  return (
    <>
      {cort ? <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-inset ring-violet-200"><Gift size={12} /> {cort}</span> : null}
      {c && Icone ? (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CONFIRMACAO[c].cls}`}>
          <Icone size={12} /> {CONFIRMACAO[c].nome}
          {enviadaTxt && c === "sem_resposta" ? <span className="font-normal"> · mensagem {quando(a.confirmacao_enviada_em)}</span> : null}
          {enviadaTxt && c === "confirmado" && a.confirmado_em ? <span className="font-normal"> · {quando(a.confirmado_em)}</span> : null}
        </span>
      ) : null}
    </>
  );
}

/** Ícones pequenos para a grade (cabem até no bloco de 30 min). */
export function IconesAg({ a }: { a: Agendamento }) {
  const c = confirmacao(a);
  const Icone = c ? ICONE[c] : null;
  return (
    <>
      {a.cortesia ? <Gift size={11} className="shrink-0 text-violet-600" aria-label={cortesiaTxt(a) ?? "Cortesia"} /> : null}
      {c && Icone ? <Icone size={11} className={`shrink-0 ${COR[c]}`} aria-label={CONFIRMACAO[c].nome} /> : null}
    </>
  );
}

export function LegendaSelos() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
      <span className="inline-flex items-center gap-1"><CircleCheck size={12} className="text-emerald-600" /> confirmou</span>
      <span className="inline-flex items-center gap-1"><CircleAlert size={12} className="text-amber-600" /> mandamos mensagem e não respondeu</span>
      <span className="inline-flex items-center gap-1"><CircleDashed size={12} className="text-neutral-400" /> ainda não confirmado</span>
      <span className="inline-flex items-center gap-1"><Gift size={12} className="text-violet-600" /> cortesia da seguradora</span>
    </div>
  );
}
