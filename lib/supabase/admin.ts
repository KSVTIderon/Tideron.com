import { createClient } from "@supabase/supabase-js";

// Brukes kun i Edge Functions / API routes — aldri på klienten
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
