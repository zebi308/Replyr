import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';

/** Resolves the signed-in user and their workspace (creating one on first use). All dashboard queries use `supabase` (RLS enforced). */
export async function requireWorkspace() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;

  let m: { workspace_id: string; role: string } | null = null;
  const q = await supabase.from('memberships').select('workspace_id, role').eq('user_id', user.id).limit(1).maybeSingle();
  m = q.data as typeof m;

  if (!m) {
    const db = adminClient();
    const found = await db.from('memberships').select('workspace_id, role').eq('user_id', user.id).limit(1).maybeSingle();
    if (found.error) return { error: NextResponse.json({ error: 'Database error: ' + found.error.message }, { status: 500 }) } as const;
    if (found.data) {
      m = found.data as typeof m;
    } else {
      const ws = await db.from('workspaces').insert({ name: `${(user.email ?? 'My').split('@')[0]}'s workspace` }).select('id').single();
      if (ws.error || !ws.data) return { error: NextResponse.json({ error: 'Could not create workspace: ' + (ws.error?.message ?? 'unknown') }, { status: 500 }) } as const;
      const mem = await db.from('memberships').insert({ workspace_id: ws.data.id, user_id: user.id, role: 'owner' });
      if (mem.error) return { error: NextResponse.json({ error: 'Could not create membership: ' + mem.error.message }, { status: 500 }) } as const;
      m = { workspace_id: ws.data.id, role: 'owner' };
    }
  }
  return { supabase, user, workspaceId: m!.workspace_id, role: m!.role } as const;
}

/** Loads a chatbot through RLS: returns null if it belongs to another tenant. */
export async function loadBot(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase.from('chatbots').select('*').eq('id', id).maybeSingle();
  return data;
}