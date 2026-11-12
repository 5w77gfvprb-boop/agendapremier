"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigurado } from "@/lib/supabase";
import { erroAuth } from "@/lib/erros-auth";
import { ehFalhaDeConexao, ForaDoAr } from "@/components/ForaDoAr";
import { Button, Field, inputCls } from "@/components/ui";

export default function Login() {
  const router = useRouter();
  const [modo, setModo] = useState<"entrar" | "esqueci">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [semConexao, setSemConexao] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const semConfig = !supabaseConfigurado();

  useEffect(() => {
    if (semConfig) return;
    getSupabase().auth.getSession().then(({ data }) => { if (data.session) router.replace("/"); });
  }, [router, semConfig]);

  function trocar(m: "entrar" | "esqueci") { setModo(m); setErro(""); setSemConexao(false); setEnviado(false); }

  function tratar(error: { message?: string; status?: number; code?: string }) {
    if (ehFalhaDeConexao(error)) { setSemConexao(true); setErro(""); } else { setSemConexao(false); setErro(erroAuth(error)); }
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(""); setSemConexao(false); setCarregando(true);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) tratar(error); else router.replace("/");
    } catch (x) { tratar(x as Error); } finally { setCarregando(false); }
  }

  async function pedirLink(e: React.FormEvent) {
    e.preventDefault();
    setErro(""); setSemConexao(false); setCarregando(true);
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/nova-senha` });
      if (error) tratar(error); else setEnviado(true);
    } catch (x) { tratar(x as Error); } finally { setCarregando(false); }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-[#F6F6F3] px-4 py-8">
      <form onSubmit={modo === "entrar" ? entrar : pedirLink} className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Agenda Premier</h1>
          <p className="text-sm text-neutral-500">{modo === "entrar" ? "Centro Automotivo Premier" : "Esqueci a senha"}</p>
        </div>
        {semConfig ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Configure o Supabase (veja SETUP.md) antes de entrar.</p> : null}

        {modo === "esqueci" && enviado ? (
          <div className="space-y-3 text-sm text-neutral-700">
            <p className="rounded-lg bg-green-50 p-3 text-green-900">
              Se <b>{email.trim()}</b> tem acesso à agenda, chega um e-mail em alguns minutos com o link para criar uma senha nova.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-neutral-600">
              <li>Olhe também o <b>spam / lixo eletrônico</b>.</li>
              <li>O link vale por 1 hora e só funciona uma vez. Pode abrir em qualquer aparelho.</li>
              <li>Não chegou em 10 minutos? Quem administra pode trocar a senha direto no Supabase.</li>
            </ul>
            <Button type="button" className="w-full" onClick={() => trocar("entrar")}>Voltar para entrar</Button>
          </div>
        ) : (
          <>
            <Field label="E-mail"><input className={inputCls} type="email" autoComplete="email" inputMode="email" autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            {modo === "entrar" ? (
              <Field label="Senha"><input className={inputCls} type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} /></Field>
            ) : (
              <p className="text-xs text-neutral-500">Digite o e-mail do seu login. Vamos mandar um link para você criar uma senha nova.</p>
            )}
            {erro ? <p className="text-sm text-red-700">{erro}</p> : null}
            {semConexao ? <ForaDoAr compacto /> : null}
            <Button variant="primary" className="w-full" disabled={carregando || semConfig}>
              {modo === "entrar" ? (carregando ? "Entrando…" : "Entrar") : (carregando ? "Enviando…" : "Enviar link")}
            </Button>
            <button type="button" className="block w-full text-center text-sm text-neutral-600 underline-offset-2 hover:underline" onClick={() => trocar(modo === "entrar" ? "esqueci" : "entrar")}>
              {modo === "entrar" ? "Esqueci a senha" : "Voltar para entrar"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
