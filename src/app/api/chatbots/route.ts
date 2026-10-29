import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspace } from '@/lib/auth';
import { defaultConfig } from '@/lib/config';
import { getEntitlements } from '@/lib/billing/entitlements';

const schema = z.object({ name: z.string().trim().min(1).max(80), useShopify: z.boolean().default(false), useKnowledge: z.boolean().default(false), role: z.string().max(600).optional(), systemPrompt: z.string().max(6000).optional() });

export async function GET() {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const { data } = await ctx.supabase.from('chatbots').select('id, name, public_id, published_at, created_at').order('created_at', { ascending: false });
  return NextResponse.json({ chatbots: data ?? [] });
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const ent = await getEntitlements(ctx.workspaceId);
  const { count } = await ctx.supabase.from('chatbots').select('id', { count: 'exact', head: true });
  if ((count ?? 0) >= ent.max_chatbots) return NextResponse.json({ error: `Your ${ent.plan} plan allows ${ent.max_chatbots} chatbot(s). Upgrade to add more.` }, { status: 402 });
  if (parsed.data.useShopify && !ent.shopify_enabled) return NextResponse.json({ error: 'Shopify is not included in your plan.' }, { status: 402 });
  const { name, ...rest } = parsed.data;
  const draft = defaultConfig(name, rest);
  const { data, error } = await ctx.supabase.from('chatbots').insert({ workspace_id: ctx.workspaceId, name, draft }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
