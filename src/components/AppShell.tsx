"use client";

import { BarChart3, CalendarDays, Car, CheckCheck, Download, LogOut, Menu, PhoneCall, Settings, Users } from "lucide-react";
import { ehFalhaDeConexao, ForaDoAr, registrarAcesso } from "@/components/ForaDoAr";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase, supabaseConfigurado } from "@/lib/supabase";
import type { Folga, Horario, Local, Mecanico, Servico } from "@/lib/agenda";

type Toast = { id: number; msg: string; tipo: "ok" | "erro" };
export type ItemChecklist = { id: string; texto: string; ordem: number; ativo: boolean };
export type Cadastros = { checklist: ItemChecklist[]; mecanicos: Mecanico[]; locais: Local[]; servicos: Servico[]; horarios: Horario[]; folgas: Folga[] };
type Avisos = { retornos: number; recarregar: () => void };
type AppCtx = { sb: SupabaseClient; notify: (msg: string, tipo?: "ok" | "erro") => void; cad: Cadastros; recarregarCadastros: () => Promise<unknown>; avisos: Avisos };

const Ctx = createContext<AppCtx | null>(null);
export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp fora do AppShell");
  return c;
}

const NAV: { href: string; label: string; icon: typeof CalendarDays; soDesktop?: boolean; soCelular?: boolean }[] = [
  { href: "/", label: "Agenda", icon: CalendarDays },
  { href: "/patio", label: "Pátio", icon: Car },
  { href: "/retornos", label: "Retornos", icon: PhoneCall },
  { href: "/finalizados", label: "Finalizados", icon: CheckCheck },
  { href: "/clientes", label: "Clientes", icon: Users, soDesktop: true },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, soDesktop: true },
  { href: "/ajustes", label: "Ajustes", icon: Settings, soDesktop: true },
  { href: "/mais", label: "Mais", icon: Menu, soCelular: true },
];

export const msgErro = (e: unknown) => {
  if (ehFalhaDeConexao(e)) return "Sem conexão com o banco. Confira a internet e tente de novo; se continuar, o Supabase pode estar pausado (abra a agenda de novo para ver como reativar).";
  const m = (e as { message?: string })?.message ?? String(e);
  return m.replace(/^.*?ERROR:\s*/, "");
};

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const semConfig = !supabaseConfigurado();
  const [cad, setCad] = useState<Cadastros | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [retornos, setRetornos] = useState(0);
  const [falha, setFalha] = useState<{ conexao: boolean; msg: string } | null>(null);
  const [backupDias, setBackupDias] = useState<number | null>(null);
  const recarregarAvisos = useCallback(() => {
    if (!supabaseConfigurado()) return;
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    getSupabase().from("contatos").select("id", { count: "exact", head: true }).eq("status", "aberto").lte("lembrar_em", hoje)
      .then(({ count }) => setRetornos(count ?? 0));
  }, []);

  const notify = useCallback((msg: string, tipo: "ok" | "erro" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, tipo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === "erro" ? 8000 : 3500);
  }, []);

  const recarregarCadastros = useCallback(async (): Promise<unknown> => {
    const sb = getSupabase();
    const [m, e, s, h, f, ck] = await Promise.all([
      sb.from("mecanicos").select("*").order("ordem").order("nome"),
      sb.from("locais").select("*").order("ordem").order("nome"),
      sb.from("servicos").select("*").order("nome"),
      sb.from("horarios").select("*").order("dia_semana"),
      sb.from("folgas").select("*").order("dia"),
      sb.from("checklist_itens").select("*").order("ordem"),
    ]);
    const erro = m.error ?? e.error ?? s.error ?? h.error ?? f.error ?? ck.error;
    if (erro) { notify(msgErro(erro), "erro"); return erro; }
    const hm = (x: string | null) => (x ? x.slice(0, 5) : null);
    setCad({
      mecanicos: (m.data ?? []) as Mecanico[], locais: (e.data ?? []) as Local[],
      servicos: ((s.data ?? []) as Servico[]).map((x) => ({ ...x, preco: Number(x.preco) })),
      horarios: ((h.data ?? []) as Horario[]).map((x) => ({ ...x, abre: hm(x.abre)!, fecha: hm(x.fecha)!, almoco_ini: hm(x.almoco_ini), almoco_fim: hm(x.almoco_fim) })),
      folgas: (f.data ?? []) as Folga[],
      checklist: (ck.data ?? []) as ItemChecklist[],
    });
    return null;
  }, [notify]);

  // Cópia automática semanal (feita ao abrir) e lembrete de baixar o backup a cada 30 dias.
  const cuidarDoBackup = useCallback(async () => {
    const sb = getSupabase();
    await sb.rpc("backup_se_preciso");
    const [d, p] = await Promise.all([
      sb.from("backup_log").select("criado_em").eq("tipo", "download").order("criado_em", { ascending: false }).limit(1),
      sb.from("backup_log").select("criado_em").order("criado_em").limit(1),
    ]);
    const ref = d.data?.[0]?.criado_em ?? p.data?.[0]?.criado_em;
    if (!ref) return;
    let adiado = 0;
    try { adiado = Number(localStorage.getItem("backup_aviso_ate")) || 0; } catch { /* ignora */ }
    const dias = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000);
    setBackupDias(dias >= 30 && Date.now() > adiado ? dias : null);
  }, []);

  useEffect(() => {
    if (semConfig) return;
    const sb = getSupabase();
    let ativo = true;
    (async () => {
      const { data, error } = await sb.auth.getSession();
      if (error && ehFalhaDeConexao(error)) { if (ativo) setFalha({ conexao: true, msg: error.message }); return; }
      if (!data.session) { router.replace("/login"); return; }
      const erro = ativo ? await recarregarCadastros() : null;
      if (!ativo) return;
      if (erro) { setFalha({ conexao: ehFalhaDeConexao(erro), msg: (erro as { message?: string }).message ?? String(erro) }); return; }
      registrarAcesso();
      recarregarAvisos();
      cuidarDoBackup().catch(() => { /* não atrapalha o uso */ });
    })();
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => { if (!s) router.replace("/login"); });
    return () => { ativo = false; sub.subscription.unsubscribe(); };
  }, [router, semConfig, recarregarCadastros, recarregarAvisos, cuidarDoBackup]);
  useEffect(() => { if (cad) recarregarAvisos(); }, [pathname, cad, recarregarAvisos]);

  useEffect(() => {
    const ok = () => setBackupDias(null);
    window.addEventListener("backup-baixado", ok);
    return () => window.removeEventListener("backup-baixado", ok);
  }, []);
  const avisos = useMemo(() => ({ retornos, recarregar: recarregarAvisos }), [retornos, recarregarAvisos]);
  const valor = useMemo<AppCtx | null>(() => (cad ? { sb: getSupabase(), notify, cad, recarregarCadastros, avisos } : null), [cad, notify, recarregarCadastros, avisos]);

  if (semConfig) {
    return (
      <div className="mx-auto max-w-lg p-8 text-sm text-neutral-700">
        <h1 className="mb-2 text-lg font-semibold">Configuração pendente</h1>
        <p>Defina <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (veja o arquivo <code>SETUP.md</code>).</p>
      </div>
    );
  }
  if (falha?.conexao) return <ForaDoAr detalhe={falha.msg} />;
  if (falha) {
    return (
      <div className="mx-auto max-w-lg space-y-2 p-8 text-sm text-neutral-700">
        <h1 className="text-lg font-semibold">Não consegui carregar a agenda</h1>
        <p className="break-words">{falha.msg}</p>
        <p className="text-neutral-500">Se acabou de atualizar o sistema, confira se rodou todas as migrações do SETUP.md no Supabase.</p>
        <button className="rounded-lg bg-neutral-900 px-3 py-2 text-white" onClick={() => window.location.reload()}>Tentar de novo</button>
      </div>
    );
  }
  if (!valor) return <Carregando />;
  const sair = async () => { await valor.sb.auth.signOut(); router.replace("/login"); };

  return (
    <Ctx.Provider value={valor}>
      <div className="min-h-dvh bg-[#F6F6F3] md:pl-52">
        <aside className="fixed inset-y-0 left-0 hidden w-52 flex-col border-r border-neutral-200 bg-white md:flex">
          <div className="px-5 py-5">
            <div className="text-sm font-semibold tracking-tight text-neutral-900">Agenda Premier</div>
            <div className="text-xs text-neutral-500">Centro Automotivo Premier</div>
          </div>
          <nav className="flex-1 space-y-0.5 px-3">
            {NAV.filter((n) => !n.soCelular).map((n) => {
              const ativo = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${ativo ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}>
                  <n.icon size={16} /> {n.label}
                  {n.href === "/retornos" && retornos > 0 ? <span className="ml-auto rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white">{retornos}</span> : null}
                </Link>
              );
            })}
          </nav>
          <button onClick={sair} className="m-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"><LogOut size={16} /> Sair</button>
        </aside>

        <main className="mx-auto max-w-7xl px-4 pb-24 pt-5 md:pb-10">
          {backupDias !== null && pathname !== "/ajustes" ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <Download size={15} className="shrink-0" />
              <span className="min-w-0 flex-1">Faz {backupDias} dias que ninguém baixa o backup da agenda.</span>
              <Link href="/ajustes#backup" className="rounded-md bg-amber-900 px-2.5 py-1 text-xs font-medium text-white">Baixar agora</Link>
              <button className="rounded-md px-2 py-1 text-xs text-amber-900 hover:bg-amber-100" onClick={() => {
                try { localStorage.setItem("backup_aviso_ate", String(Date.now() + 7 * 86_400_000)); } catch { /* ignora */ }
                setBackupDias(null);
              }}>Depois</button>
            </div>
          ) : null}
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.filter((n) => !n.soDesktop).map((n) => {
            const ativo = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${ativo ? "font-semibold text-neutral-900" : "text-neutral-500"}`}>
                <span className="relative"><n.icon size={19} />{n.href === "/retornos" && retornos > 0 ? <span className="absolute -right-2 -top-1 rounded-full bg-red-600 px-1 text-[9px] font-semibold leading-tight text-white">{retornos}</span> : null}</span> {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
          {toasts.map((t) => (
            <div key={t.id} className={`pointer-events-auto max-w-md rounded-lg px-4 py-2.5 text-sm shadow-lg ${t.tipo === "erro" ? "bg-red-700 text-white" : "bg-neutral-900 text-white"}`}>{t.msg}</div>
          ))}
        </div>
      </div>
    </Ctx.Provider>
  );
}

function Carregando() {
  const [demorando, setDemorando] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDemorando(true), 5000); return () => clearTimeout(t); }, []);
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center text-sm text-neutral-500">
      <div>Carregando…{demorando ? <p className="mt-2 text-xs">Está demorando: conferindo a conexão com o banco…</p> : null}</div>
    </div>
  );
}
