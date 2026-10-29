import { adminClient } from '@/lib/supabase/admin';

export type Entitlements = { plan: string; max_chatbots: number; max_messages_month: number; max_sources: number; shopify_enabled: boolean };
const ACTIVE = ['active', 'trialing'];
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

/** Paid plans with a lapsed subscription fall back to Free limits. Limits come from the `plans` table. */
export async function getEntitlements(workspaceId: string): Promise<Entitlements> {
  const db = adminClient();
  const { data: ws } = await db.from('workspaces').select('plan, subscription_status').eq('id', workspaceId).single();
  const effective = ws && ws.plan !== 'free' && !ACTIVE.includes(ws.subscription_status) ? 'free' : ws?.plan ?? 'free';
  const { data: p } = await db.from('plans').select('*').eq('id', effective).single();
  return { plan: effective, max_chatbots: p?.max_chatbots ?? 1, max_messages_month: p?.max_messages_month ?? 100, max_sources: p?.max_sources ?? 5, shopify_enabled: !!p?.shopify_enabled };
}

export async function messagesThisMonth(workspaceId: string): Promise<number> {
  const { data } = await adminClient().from('usage_monthly').select('messages').eq('workspace_id', workspaceId).eq('month', monthKey()).maybeSingle();
  return data?.messages ?? 0;
}

export async function recordUsage(workspaceId: string, tokens: number) {
  await adminClient().rpc('increment_usage', { p_workspace: workspaceId, p_month: monthKey(), p_tokens: tokens });
}
