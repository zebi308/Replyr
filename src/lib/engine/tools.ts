import { adminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/crypto';
import { lookupOrderByName } from '@/lib/shopify/api';
import type { BotConfig } from '@/lib/config';
import type { ToolDef } from '@/lib/ai/provider';

export const ORDER_TOOL: ToolDef = {
  name: 'lookup_order',
  description: 'Look up the status of a customer order. Requires the order number AND the email used at checkout. Returns data only if both match.',
  parameters: { type: 'object', properties: { order_number: { type: 'string' }, email: { type: 'string' } }, required: ['order_number', 'email'] },
};
export const HUMAN_TOOL: ToolDef = {
  name: 'request_human',
  description: 'Escalate the conversation to the human support team.',
  parameters: { type: 'object', properties: { reason: { type: 'string' }, customer_email: { type: 'string', description: 'Only if the customer agreed to be contacted' } }, required: ['reason'] },
};

export type ToolCtx = { workspaceId: string; chatbotId: string; conversationId: string; config: BotConfig; installation: { shop: string; access_token_enc: string } | null };
export type ToolOutcome = { result: unknown; ok: boolean; escalation?: { message: string; email: string; url: string } };

const MAX_LOOKUPS_PER_CONVERSATION = 5;
const GENERIC_NOT_FOUND = { found: false, message: 'No order matched those details. Ask the customer to double-check the order number and checkout email.' };

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<ToolOutcome> {
  const db = adminClient();
  const log = (ok: boolean, detail?: string) => db.from('tool_executions').insert({ conversation_id: ctx.conversationId, workspace_id: ctx.workspaceId, name, ok, detail: detail?.slice(0, 200) });

  if (name === 'lookup_order') {
    if (!ctx.config.useShopify || !ctx.installation) { await log(false, 'shopify not connected'); return { ok: false, result: { error: 'Order lookup is not available.' } }; }
    const orderNumber = String(args.order_number ?? '').trim(); const email = String(args.email ?? '').trim().toLowerCase();
    if (!orderNumber || !/^\S+@\S+\.\S+$/.test(email)) return { ok: false, result: { error: 'Both order number and a valid email are required.' } };
    const { count } = await db.from('tool_executions').select('id', { count: 'exact', head: true }).eq('conversation_id', ctx.conversationId).eq('name', 'lookup_order');
    if ((count ?? 0) >= MAX_LOOKUPS_PER_CONVERSATION) { await log(false, 'lookup limit'); return { ok: false, result: { error: 'Too many lookup attempts. Suggest contacting support.' } }; }
    try {
      const order = await lookupOrderByName(ctx.installation.shop, decrypt(ctx.installation.access_token_enc), orderNumber);
      // Identical response for "not found" and "email mismatch" so the tool cannot be used to probe for orders.
      if (!order || String(order.email ?? '').trim().toLowerCase() !== email) { await log(false, 'no verified match'); return { ok: false, result: GENERIC_NOT_FOUND }; }
      await log(true, 'verified');
      return { ok: true, result: {
        found: true, order: order.name, placed: order.createdAt, payment_status: order.displayFinancialStatus, fulfilment_status: order.displayFulfillmentStatus,
        shipments: (order.fulfillments ?? []).map((f: any) => ({ status: f.status, delivered_at: f.deliveredAt, estimated_delivery: f.estimatedDeliveryAt, tracking: (f.trackingInfo ?? []).map((t: any) => ({ carrier: t.company, number: t.number, url: t.url })) })),
      } };
    } catch (e) {
      await log(false, (e as Error).message);
      return { ok: false, result: { error: 'The order system is temporarily unavailable. Suggest trying again shortly or contacting support.' } };
    }
  }

  if (name === 'request_human') {
    if (!ctx.config.escalation.enabled) return { ok: false, result: { error: 'Human handoff is not enabled.' } };
    const email = String(args.customer_email ?? '').trim();
    await db.from('conversations').update({ escalated: true, escalation_reason: String(args.reason ?? '').slice(0, 300), ...( /^\S+@\S+\.\S+$/.test(email) ? { contact_email: email.slice(0, 200) } : {}) }).eq('id', ctx.conversationId).eq('workspace_id', ctx.workspaceId);
    await log(true, 'escalated');
    const e = ctx.config.escalation;
    return { ok: true, escalation: { message: e.message, email: e.email, url: e.url }, result: { escalated: true, message: e.message, contact_email: e.email, contact_url: e.url } };
  }
  await log(false, 'unknown tool');
  return { ok: false, result: { error: 'Unknown tool' } };
}
