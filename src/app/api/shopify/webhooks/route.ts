import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import { verifyWebhook } from '@/lib/shopify/api';
import { fromWebhook, upsertProducts } from '@/lib/shopify/sync';

export const maxDuration = 60;

/** Shopify webhooks. Signature is verified over the raw body; handlers are idempotent so Shopify retries are safe. */
export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  if (!verifyWebhook(raw, req.headers.get('x-shopify-hmac-sha256'))) return new NextResponse('Unauthorized', { status: 401 });
  const topic = req.headers.get('x-shopify-topic') ?? ''; const shop = (req.headers.get('x-shopify-shop-domain') ?? '').toLowerCase();
  let body: any = {}; try { body = JSON.parse(raw.toString('utf8') || '{}'); } catch { return new NextResponse('Bad request', { status: 400 }); }

  const db = adminClient();
  const { data: inst } = await db.from('shopify_installations').select('chatbot_id, workspace_id').eq('shop', shop).maybeSingle();
  if (!inst) return NextResponse.json({ ok: true }); // unknown shop: acknowledge so Shopify stops retrying

  try {
    if (topic === 'products/create' || topic === 'products/update') {
      if (body.status && body.status !== 'active') {
        await db.from('shopify_products').delete().eq('chatbot_id', inst.chatbot_id).eq('shopify_id', `gid://shopify/Product/${body.id}`);
      } else {
        const { data: any1 } = await db.from('shopify_products').select('currency').eq('chatbot_id', inst.chatbot_id).not('currency', 'is', null).limit(1).maybeSingle();
        const p = fromWebhook(shop, body); p.currency = any1?.currency ?? null;
        await upsertProducts(inst.workspace_id, inst.chatbot_id, [p]);
      }
    } else if (topic === 'products/delete') {
      await db.from('shopify_products').delete().eq('chatbot_id', inst.chatbot_id).eq('shopify_id', `gid://shopify/Product/${body.id}`);
    } else if (topic === 'app/uninstalled' || topic === 'shop/redact') {
      await db.from('shopify_products').delete().eq('chatbot_id', inst.chatbot_id);
      await db.from('shopify_installations').delete().eq('chatbot_id', inst.chatbot_id); // token destroyed
    }
    // customers/data_request & customers/redact: Replyr does not store Shopify customer data (order lookups are live, nothing persisted).
  } catch {
    return new NextResponse('Retry', { status: 500 }); // Shopify retries non-2xx responses
  }
  return NextResponse.json({ ok: true });
}
