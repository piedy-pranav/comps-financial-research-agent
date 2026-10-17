import "server-only";
import { createClient } from "@supabase/supabase-js";

// Admin Supabase client. Uses SUPABASE_SECRET_KEY and BYPASSES row-level security.
// Use it only for writes users must not be able to do themselves:
// saving runs, setting plan = 'pro' from the Stripe webhook, and so on.
// Never import this from a Client Component ("server-only" makes that a build error).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY environment variable.",
    );
  }

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
