import { NextResponse } from 'next/server';
import { loadBot, requireWorkspace } from '@/lib/auth';
import { getEntitlements } from '@/lib/billing/entitlements';
import { hmacHex, randomId } from '@/lib/crypto';
import { SHOP_RE } from '@/lib/shopify/api';

/** Starts Shopify OAuth. State = nonce bound to (workspace, chatbot, shop) and signed; also stored in an httpOnly cookie. */
export async function GET(req: Request) {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const url = new URL(req.url);
  let shop = (url.searchParams.get('shop') ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (shop && !shop.includes('.')) shop += '.myshopify.com';
  const bot = await loadBot(ctx.supabase, url.searchParams.get('chatbot_id') ?? '');
  if (!bot || !SHOP_RE.test(shop)) return NextResponse.redirect(new URL(`/chatbots/${bot?.id ?? ''}?tab=shopify&error=invalid_shop`, req.url));
  if (!(await getEntitlements(ctx.workspaceId)).shopify_enabled) return NextResponse.redirect(new URL('/billing?reason=shopify', req.url));

  const payload = Buffer.from(JSON.stringify({ n: randomId(12), w: ctx.workspaceId, b: bot.id, s: shop, u: ctx.user.id })).toString('base64url');
  const state = `${payload}.${hmacHex(process.env.SHOPIFY_API_SECRET || '', payload)}`;
  const redirect = `${process.env.NEXT_PUBLIC_APP_URL}/api/shopify/callback`;
  const auth = `https://${shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=${encodeURIComponent(process.env.SHOPIFY_SCOPES || 'read_products,read_orders')}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}`;
  const res = NextResponse.redirect(auth);
  res.cookies.set('shopify_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/api/shopify' });
  return res;
}
