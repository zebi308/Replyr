import { NextResponse } from 'next/server';
import { loadBot, requireWorkspace } from '@/lib/auth';
import { botConfigSchema } from '@/lib/config';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const bot = await loadBot(ctx.supabase, (await params).id);
  if (!bot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const cfg = botConfigSchema.parse(bot.draft);
  await ctx.supabase.from('chatbots').update({ published: cfg, published_at: new Date().toISOString() }).eq('id', bot.id);
  return NextResponse.json({ ok: true, publicId: bot.public_id });
}
