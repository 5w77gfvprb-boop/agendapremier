"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigurado } from "@/lib/supabase";
import { erroAuth } from "@/lib/erros-auth";
import { ehFalhaDeConexao, ForaDoAr } from "@/components/ForaDoAr";
import { Button, Field, inputCls } from "@/components/ui";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "link"; tokenHash: string }            // veio do e-mail; a troca só confirma o link ao salvar
  | { tipo: "logado"; email: string }
  | { tipo: "invalido"; motivo: string }
  | { tipo: "pronto" };

export default function NovaSenha() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [semConexao, setSemConexao] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!supabaseConfigurado()) { setEstado({ tipo: "invalido", motivo: "Supabase não configurado." }); return; }
    const sb = getSupabase();
    const busca = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const erroUrl = busca.get("error_description") ?? hash.get("error_description") ?? busca.get("error") ?? hash.get("error");
    const codigoErro = busca.get("error_code") ?? hash.get("error_code") ?? "";
    const tokenHash = busca.get("token_hash");
    const temCodigo = busca.has("code");

    (async () => {
      if (erroUrl) { setEstado({ tipo: "invalido", motivo: erroAuth({ message: erroUrl.replace(/\+/g, " "), code: codigoErro }) }); return; }
      if (tokenHash) { setEstado({ tipo: "link", tokenHash }); return; }
      // link no formato padrão do Supabase (?code=...): o próprio cliente troca o código ao carregar
      const { data, error } = await sb.auth.getSession();
      if (error && ehFalhaDeConexao(error)) { setSemConexao(true); setEstado({ tipo: "invalido", motivo: "" }); return; }
      if (data.session) {
        if (temCodigo) window.history.replaceState(null, "", "/nova-senha");
        setEstado({ tipo: "logado", email: data.session.user.email ?? "" });
        return;
      }
      setEstado({
        tipo: "invalido",
        motivo: temCodigo
          ? "Não consegui usar este link. Ele pode ter vencido, já ter sido usado, ou ter sido aberto em outro aparelho/navegador. Peça um novo e abra no mesmo aparelho em que pediu."
          : "Para trocar a senha, entre na agenda ou peça um link em “Esqueci a senha”.",
      });
    })();
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(""); setSemConexao(false);
    if (senha.length < 6) { setErro("A senha precisa ter pelo menos 6 caracteres."); return; }
    if (senha !== confirma) { setErro("As duas senhas não estão iguais."); return; }
    const sb = getSupabase();
    setSalvando(true);
    try {
      if (estado.tipo === "link") {
        const { error } = await sb.auth.verifyOtp({ token_hash: estado.tokenHash, type: "recovery" });
        if (error) {
          if (ehFalhaDeConexao(error)) { setSemConexao(true); return; }
          setEstado({ tipo: "invalido", motivo: erroAuth({ ...error, code: "otp_expired" }) });
          return;
        }
        window.history.replaceState(null, "", "/nova-senha");
      }
      const { error } = await sb.auth.updateUser({ password: senha });
      if (error) { if (ehFalhaDeConexao(error)) setSemConexao(true); else setErro(erroAuth(error)); return; }
      setEstado({ tipo: "pronto" });
    } catch (x) {
      if (ehFalhaDeConexao(x)) setSemConexao(true); else setErro(erroAuth(x as Error));
    } finally { setSalvando(false); }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-[#F6F6F3] px-4 py-8">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Agenda Premier</h1>
          <p className="text-sm text-neutral-500">Nova senha</p>
        </div>

        {estado.tipo === "carregando" ? <p className="text-sm text-neutral-500">Carregando…</p> : null}

        {estado.tipo === "invalido" ? (
          <div className="space-y-3">
            {estado.motivo ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{estado.motivo}</p> : null}
            {semConexao ? <ForaDoAr compacto /> : null}
            <Button variant="primary" className="w-full" onClick={() => router.replace("/login")}>Ir para a tela de entrar</Button>
          </div>
        ) : null}

        {estado.tipo === "pronto" ? (
          <div className="space-y-3">
            <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">Senha trocada. Nos outros aparelhos, use a senha nova da próxima vez que pedir.</p>
            <Button variant="primary" className="w-full" onClick={() => router.replace("/")}>Abrir a agenda</Button>
          </div>
        ) : null}

        {estado.tipo === "link" || estado.tipo === "logado" ? (
          <form onSubmit={salvar} className="space-y-4">
            {estado.tipo === "logado" && estado.email ? <p className="text-sm text-neutral-600">Trocando a senha de <b>{estado.email}</b>.</p> : null}
            <Field label="Senha nova" hint="Pelo menos 6 caracteres. Misture letras e números.">
              <input className={inputCls} type="password" autoComplete="new-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
            </Field>
            <Field label="Repita a senha nova">
              <input className={inputCls} type="password" autoComplete="new-password" required value={confirma} onChange={(e) => setConfirma(e.target.value)} />
            </Field>
            {erro ? <p className="text-sm text-red-700">{erro}</p> : null}
            {semConexao ? <ForaDoAr compacto /> : null}
            <Button variant="primary" className="w-full" disabled={salvando}>{salvando ? "Salvando…" : "Salvar senha nova"}</Button>
            {estado.tipo === "logado" ? <Button type="button" className="w-full" onClick={() => router.back()}>Voltar</Button> : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}
