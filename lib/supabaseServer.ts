import { createClient } from "@supabase/supabase-js";

export function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL (set in env vars)");
  if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (set in env vars)");

  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Invalid NEXT_PUBLIC_SUPABASE_URL (must start with http/https)");
  }

  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}