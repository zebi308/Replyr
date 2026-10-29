import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { cookies } from 'next/headers';
import { loadBot, requireWorkspace } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { encrypt, hmacHex, safeEqual } from '@/lib/crypto';
import { registerWebhooks, SHOP_RE, verifyOAuthHmac } from '@/lib/shopify/api';
import { syncProducts } from '@/lib/shopify/sync';

export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (id: string, q: string) => NextResponse.redirect(new URL(`/chatbots/${id}?tab=shopify&${q}`, req.url));
  const ctx = await requireWorkspace(); if ('error' in ctx) return NextResponse.redirect(new URL('/login', req.url));

  const state = url.searchParams.get('state') ?? ''; const shop = url.searchParams.get('shop') ?? ''; const code = url.searchParams.get('code') ?? '';
  const cookieState = (await cookies()).get('shopify_state')?.value ?? '';
  const [payload, sig] = state.split('.');
  if (!payload || !sig || !cookieState || !safeEqual(state, cookieState) || !safeEqual(hmacHex(process.env.SHOPIFY_API_SECRET || '', payload), sig)) return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
  let st: { w: string; b: string; s: string; u: string };
  try { st = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return NextResponse.json({ error: 'Invalid state' }, { status: 400 }); }
  if (st.u !== ctx.user.id || st.w !== ctx.workspaceId || st.s !== shop || !SHOP_RE.test(shop)) return NextResponse.json({ error: 'State mismatch' }, { status: 400 });
  if (!verifyOAuthHmac(url.searchParams)) return NextResponse.json({ error: 'Invalid HMAC' }, { status: 400 });
  const bot = await loadBot(ctx.supabase, st.b);
  if (!bot) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.SHOPIFY_API_KEY, client_secret: process.env.SHOPIFY_API_SECRET, code }),
  });
  if (!tokenRes.ok) {
    console.error('Shopify token exchange failed', tokenRes.status, (await tokenRes.text()).slice(0, 500));
    return back(bot.id, 'error=token_exchange_failed');
  }
  const { access_token, scope } = await tokenRes.json();

  const db = adminClient();
  // A shop can be linked to only one chatbot at a time.
  await db.from('shopify_installations').delete().eq('shop', shop);
  const { error } = await db.from('shopify_installations').upsert({
    workspace_id: ctx.workspaceId, chatbot_id: bot.id, shop, access_token_enc: encrypt(access_token), scopes: scope ?? '', status: 'syncing', last_error: null,
  }, { onConflict: 'chatbot_id' });
  if (error) return back(bot.id, 'error=save_failed');

  const res = back(bot.id, 'connected=1');
  res.cookies.delete({ name: 'shopify_state', path: '/api/shopify' });
  after(async () => {
    try { await registerWebhooks(shop, access_token); } catch (e) { await db.from('shopify_installations').update({ last_error: (e as Error).message.slice(0, 300) }).eq('chatbot_id', bot.id); }
    await syncProducts(ctx.workspaceId, bot.id, shop, access_token);
  });
  return res;
}
