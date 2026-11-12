"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";

const CHAVE = "ultimo_acesso";

/** Guarda quando a agenda abriu com sucesso neste aparelho (para explicar uma possível pausa do Supabase). */
export function registrarAcesso() {
  try { localStorage.setItem(CHAVE, String(Date.now())); } catch { /* sem storage: tudo bem */ }
}
function diasSemAbrir(): number | null {
  try {
    const v = Number(localStorage.getItem(CHAVE));
    return v ? Math.floor((Date.now() - v) / 86_400_000) : null;
  } catch { return null; }
}

/** Erro de rede/servidor (banco pausado, fora do ar, sem internet) e não um erro de regra do sistema. */
export function ehFalhaDeConexao(e: unknown): boolean {
  const x = e as { message?: string; status?: number; code?: string; name?: string } | null;
  const m = `${x?.name ?? ""} ${x?.message ?? String(e)}`.toLowerCase();
  if (/failed to fetch|load failed|networkerror|fetch failed|network request failed|err_name_not_resolved|timeout|aborted|project (is )?paused|service unavailable|bad gateway/.test(m)) return true;
  return typeof x?.status === "number" && (x.status === 0 || x.status >= 500);
}

/** Tela de quando o banco não responde. Explica a pausa do plano grátis e como reativar. */
export function ForaDoAr({ detalhe, compacto = false }: { detalhe?: string; compacto?: boolean }) {
  const [semInternet] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const [dias] = useState(diasSemAbrir);

  const conteudo = semInternet ? (
    <>
      <h1 className="flex items-center gap-2 text-base font-semibold text-neutral-900"><WifiOff size={18} /> Sem internet neste aparelho</h1>
      <p className="text-sm text-neutral-600">Confira o Wi-Fi ou os dados móveis e tente de novo.</p>
    </>
  ) : (
    <>
      <h1 className="text-base font-semibold text-neutral-900">O banco de dados não respondeu</h1>
      <p className="text-sm text-neutral-600">
        {dias !== null && dias >= 7
          ? <>Faz <b>{dias} dias</b> que a agenda não é aberta neste aparelho. </>
          : null}
        O plano grátis do Supabase <b>pausa o banco depois de 7 dias sem uso</b>. Os dados não se perdem; é só reativar:
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700">
        <li>Entre em <a className="font-medium underline" href="https://supabase.com/dashboard/projects" target="_blank" rel="noreferrer">supabase.com/dashboard</a> com a sua conta.</li>
        <li>Abra o projeto da agenda (ele aparece como <i>Paused</i>).</li>
        <li>Clique em <b>Resume project</b> (ou <i>Restore</i>) e espere uns 2 a 5 minutos.</li>
        <li>Volte aqui e toque em <b>Tentar de novo</b>.</li>
      </ol>
      <p className="text-xs text-neutral-500">Se o projeto não estiver pausado, pode ser instabilidade do Supabase: espere alguns minutos e tente de novo.</p>
    </>
  );

  if (compacto) return <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">{conteudo}</div>;
  return (
    <div className="grid min-h-dvh place-items-center bg-[#F6F6F3] px-4 py-8">
      <div className="w-full max-w-md space-y-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        {conteudo}
        {detalhe ? <p className="break-words text-[11px] text-neutral-400">Detalhe: {detalhe}</p> : null}
        <Button variant="primary" className="w-full" onClick={() => window.location.reload()}><RefreshCw size={15} /> Tentar de novo</Button>
      </div>
    </div>
  );
}
