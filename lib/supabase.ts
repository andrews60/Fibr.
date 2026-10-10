import { createClient } from "@supabase/supabase-js";

// One shared connection to Supabase that every page uses
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);