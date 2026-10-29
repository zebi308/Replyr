import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/admin';
import { botConfigSchema } from '@/lib/config';
import { corsHeaders, originAllowed } from '@/lib/security/origin';
import { clientIp, rateLimit } from '@/lib/security/ratelimit';
import { getEntitlements, messagesThisMonth } from '@/lib/billing/entitlements';
import { handleTurn } from '@/lib/engine/turn';

export const maxDuration = 60;
const body = z.object({ botId: z.string().max(60), sessionId: z.string().min(8).max(64), message: z.string().min(1).max(4000), conversationId: z.string().uuid().nullish() });

export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) }); }

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);
  const err = (status: number, error: string) => NextResponse.json({ error }, { status, headers: cors });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(400, 'Invalid request');
  const { botId, sessionId, message, conversationId } = parsed.data;

  const ip = clientIp(req);
  if (!rateLimit(`ip:${ip}`, 40, 60_000) || !rateLimit(`bot:${botId}:${sessionId}`, 12, 60_000)) return err(429, 'Too many messages. Please wait a moment.');

  const db = adminClient();
  const { data: bot } = await db.from('chatbots').select('id, workspace_id, published').eq('public_id', botId).maybeSingle();
  if (!bot || !bot.published) return err(404, 'Chatbot not found');
  const config = botConfigSchema.parse(bot.published);
  if (!originAllowed(origin, config.widget.allowedDomains)) return err(403, 'This domain is not allowed to use this chatbot');

  const ent = await getEntitlements(bot.workspace_id);
  if ((await messagesThisMonth(bot.workspace_id)) >= ent.max_messages_month) return err(402, 'This assistant is temporarily unavailable.');
  if (config.useShopify && !ent.shopify_enabled) config.useShopify = false;

  try {
    const r = await handleTurn({ workspaceId: bot.workspace_id, chatbotId: bot.id, config, channel: 'widget', sessionId, conversationId, message });
    return NextResponse.json({ conversationId: r.conversationId, reply: r.reply, products: r.products, sources: r.sources.map((s) => s.name).filter((v, i, a) => a.indexOf(v) === i), escalation: r.escalation ?? null, unanswered: r.unanswered }, { headers: cors });
  } catch {
    return err(500, 'Something went wrong. Please try again.');
  }
}
