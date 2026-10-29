import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { loadBot, requireWorkspace } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/crypto';
import { syncProducts } from '@/lib/shopify/sync';

type P = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: P) {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const bot = await loadBot(ctx.supabase, (await params).id);
  if (!bot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: installation } = await ctx.supabase.from('shopify_installations').select('shop, status, last_error, last_synced_at, scopes, installed_at').eq('chatbot_id', bot.id).maybeSingle();
  const { count } = await ctx.supabase.from('shopify_products').select('id', { count: 'exact', head: true }).eq('chatbot_id', bot.id);
  return NextResponse.json({ installation, productCount: count ?? 0 });
}

/** Manual re-sync (recovery if webhooks were missed). */
export async function POST(_: Request, { params }: P) {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const bot = await loadBot(ctx.supabase, (await params).id);
  if (!bot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: inst } = await adminClient().from('shopify_installations').select('shop, access_token_enc').eq('chatbot_id', bot.id).maybeSingle();
  if (!inst) return NextResponse.json({ error: 'Not connected' }, { status: 400 });
  after(() => syncProducts(ctx.workspaceId, bot.id, inst.shop, decrypt(inst.access_token_enc)));
  return NextResponse.json({ ok: true });
}

/** Disconnect: deletes the stored token and all synced products. Merchant should also uninstall the app in Shopify admin. */
export async function DELETE(_: Request, { params }: P) {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const bot = await loadBot(ctx.supabase, (await params).id);
  if (!bot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const db = adminClient();
  await db.from('shopify_products').delete().eq('chatbot_id', bot.id);
  await db.from('shopify_installations').delete().eq('chatbot_id', bot.id);
  return NextResponse.json({ ok: true });
}
