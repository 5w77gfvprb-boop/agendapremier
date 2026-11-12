/** Traduz os erros de login/senha do Supabase para mensagens claras. */
export function erroAuth(e: { message?: string; status?: number; code?: string } | null | undefined): string {
  const m = e?.message ?? "";
  const c = e?.code ?? "";
  if (m === "Invalid login credentials" || c === "invalid_credentials") return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(m)) return "Este login ainda não foi confirmado. No Supabase, em Authentication → Users, confirme o usuário.";
  if (/not authorized/i.test(m) || c === "email_address_not_authorized")
    return "O Supabase ainda não está liberado para mandar e-mail para este endereço. Quem administra o sistema precisa fazer o passo “Esqueci a senha” do SETUP (ou trocar a senha direto no Supabase).";
  if (/only request this after|after \d+ seconds/i.test(m) || c === "over_request_rate_limit") return "Espere um minuto antes de pedir de novo.";
  if (e?.status === 429 || /rate limit/i.test(m) || c === "over_email_send_rate_limit")
    return "Muitos e-mails pedidos em pouco tempo. Espere 1 hora e tente de novo, ou peça para quem administra trocar a senha no Supabase.";
  if (/should be different/i.test(m) || c === "same_password") return "A nova senha precisa ser diferente da atual.";
  if (/at least \d+ characters/i.test(m)) return `A senha é curta demais (${m.match(/\d+/)?.[0] ?? "6"} caracteres no mínimo).`;
  if (c === "weak_password" || /weak/i.test(m)) return "Senha fraca: misture letras e números e use pelo menos 8 caracteres.";
  if (/expired|invalid/i.test(m) || c === "otp_expired") return "Este link venceu ou já foi usado. Peça um novo em “Esqueci a senha”.";
  return m || "Algo deu errado. Tente de novo.";
}
