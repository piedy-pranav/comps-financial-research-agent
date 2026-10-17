import { createBrowserClient } from "@supabase/ssr";

// Supabase client for Client Components ("use client").
// Uses the publishable key, so it can only do what row-level security allows.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
