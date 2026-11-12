import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/config";

let client: SupabaseClient | null = null;

export function supabaseConfigurado(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = SUPABASE_URL;
    const key = SUPABASE_KEY;
    if (!url || !key) throw new Error("Supabase não configurado (veja o arquivo .env.example).");
    client = createBrowserClient(url, key);
  }
  return client;
}
