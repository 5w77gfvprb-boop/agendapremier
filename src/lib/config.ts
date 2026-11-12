// Endereço e chave pública (publishable) do Supabase da agenda.
// São públicas por natureza: vão para o navegador de qualquer jeito. Variáveis na Vercel, se existirem, têm prioridade.
// NUNCA coloque aqui a chave secret / service_role.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mlzgspggzfjzgvkuxzhe.supabase.co";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5pu780qoBRUmLOO9s3739A_vWFe1OEf";
