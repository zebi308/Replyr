import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadBot, requireWorkspace } from '@/lib/auth';
import { botConfigSchema } from '@/lib/config';
import { getEntitlements, messagesThisMonth } from '@/lib/billing/entitlements';
import { handleTurn } from '@/lib/engine/turn';
import { rateLimit } from '@/lib/security/ratelimit';

export const maxDuration = 60;
const schema = z.object({ message: z.string().min(1).max(4000), conversationId: z.string().uuid().nullish() });

/** Runs the DRAFT configuration so changes can be tested before publishing. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const bot = await loadBot(ctx.supabase, (await params).id);
  if (!bot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  if (!rateLimit(`pg:${ctx.user.id}`, 30, 60_000)) return NextResponse.json({ error: 'Slow down a little.' }, { status: 429 });
  const ent = await getEntitlements(ctx.workspaceId);
  if ((await messagesThisMonth(ctx.workspaceId)) >= ent.max_messages_month) return NextResponse.json({ error: 'Monthly message limit reached. Upgrade your plan.' }, { status: 402 });
  const config = botConfigSchema.parse(bot.draft);
  if (!ent.shopify_enabled) config.useShopify = false;
  const r = await handleTurn({ workspaceId: ctx.workspaceId, chatbotId: bot.id, config, channel: 'playground', sessionId: `pg-${ctx.user.id}`, conversationId: parsed.data.conversationId, message: parsed.data.message });
  return NextResponse.json(r);
}
