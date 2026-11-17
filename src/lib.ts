import { createClient } from "@supabase/supabase-js";

// Environment variables prefixed with VITE_ are public in the browser.
// Only use a publishable/anon key here. Never supply a service-role or secret key.
const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

function validateUrl(value: string): string | null {
  if (!value) return "VITE_SUPABASE_URL is missing.";
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    const allowedProtocol = url.protocol === "https:" || (local && url.protocol === "http:");
    const rootOnly = url.pathname === "/" && !url.search && !url.hash;
    if (!allowedProtocol || !rootOnly || url.username || url.password) {
      return "VITE_SUPABASE_URL must be an HTTPS project origin with no path or query.";
    }
    return null;
  } catch {
    return "VITE_SUPABASE_URL is not a valid URL.";
  }
}

export const supabaseConfigError =
  validateUrl(supabaseUrl) ||
  (!supabaseAnonKey ? "VITE_SUPABASE_ANON_KEY is missing." : null);

export const hasSupabaseConfig = supabaseConfigError === null;
export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
