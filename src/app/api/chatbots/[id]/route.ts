import { NextResponse } from 'next/server';
import { loadBot, requireWorkspace } from '@/lib/auth';
import { botConfigSchema } from '@/lib/config';
import { getEntitlements } from '@/lib/billing/entitlements';

type P = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: P) {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const bot = await loadBot(ctx.supabase, (await params).id);
  return bot ? NextResponse.json({ bot }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}

/** Saves the DRAFT only. The live widget keeps serving `published` until the owner publishes. */
export async function PATCH(req: Request, { params }: P) {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const bot = await loadBot(ctx.supabase, (await params).id);
  if (!bot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = botConfigSchema.safeParse((await req.json().catch(() => ({}))).draft);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid configuration', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  if (parsed.data.useShopify && !(await getEntitlements(ctx.workspaceId)).shopify_enabled) return NextResponse.json({ error: 'Shopify is not included in your plan.' }, { status: 402 });
  await ctx.supabase.from('chatbots').update({ draft: parsed.data, name: parsed.data.name }).eq('id', bot.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: P) {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const bot = await loadBot(ctx.supabase, (await params).id);
  if (!bot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await ctx.supabase.from('chatbots').delete().eq('id', bot.id); // cascades to sources, chunks, conversations, shopify data
  return NextResponse.json({ ok: true });
}
