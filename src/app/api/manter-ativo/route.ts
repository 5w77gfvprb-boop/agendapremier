// Chamado pela Vercel uma vez por dia (vercel.json → crons) para o Supabase grátis não pausar por falta de uso.
// Só lê a tabela "ativo", que não tem nenhum dado da oficina.
import { connection } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/config";

export async function GET() {
  await connection();   // sempre roda na hora (nunca vem de cache)
  const url = SUPABASE_URL;
  const key = SUPABASE_KEY;
  if (!url || !key) return Response.json({ ok: false, erro: "Supabase não configurado" }, { status: 500 });
  try {
    const r = await fetch(`${url}/rest/v1/ativo?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
    const corpo = await r.text();
    return Response.json({ ok: r.ok, status: r.status, quando: new Date().toISOString(), resposta: corpo.slice(0, 200) }, { status: r.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ ok: false, erro: String(e) }, { status: 502 });
  }
}
