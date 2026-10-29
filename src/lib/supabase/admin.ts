import { createClient } from '@supabase/supabase-js';
// Service-role client. Server only. Bypasses RLS: every query MUST be scoped by a verified workspace/chatbot id.
import type { SupabaseClient } from '@supabase/supabase-js';
let admin: SupabaseClient<any> | null = null;
export function adminClient() {
  if (!admin) admin = createClient<any>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  return admin;
}
