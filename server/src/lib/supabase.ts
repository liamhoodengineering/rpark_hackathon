import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

/**
 * Supabase client using the SERVICE ROLE key.
 * SERVER-SIDE ONLY — this key bypasses Row Level Security and must never
 * reach the browser bundle. All DB access goes through the Node API.
 */
export const supabase: SupabaseClient = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
