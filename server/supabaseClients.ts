import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
}

export function getSupabaseAnonKey(): string {
  return (
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    ""
  );
}

export function supabaseAuthClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY (or VITE_* equivalents)");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** User-scoped DB client (RLS applies via JWT in Authorization header). */
export function supabaseUserClient(accessToken: string): SupabaseClient {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY (or VITE_* equivalents)");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
