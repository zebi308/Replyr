import { adminClient } from '@/lib/supabase/admin';
import { embed } from '@/lib/ai/provider';
import { gql } from './api';

type Variant = { title: string; price: string; available: boolean };
export type ProductInput = { shopifyId: string; title: string; description: string; handle: string; url: string; image: string | null; currency: string | null; variants: Variant[] };

const stripHtml = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export async function upsertProducts(workspaceId: string, chatbotId: string, items: ProductInput[]) {
  if (!items.length) return;
  const texts = items.map((p) => `${p.title}\n${p.description}\nOptions: ${p.variants.map((v) => v.title).join(', ')}`);
  const vecs = await embed(texts);
  const rows = items.map((p, i) => {
    const prices = p.variants.map((v) => Number(v.price)).filter((n) => !isNaN(n));
    return {
      workspace_id: workspaceId, chatbot_id: chatbotId, shopify_id: p.shopifyId, title: p.title, description: p.description.slice(0, 2000), handle: p.handle, url: p.url,
      image: p.image, currency: p.currency, price_min: prices.length ? Math.min(...prices) : null, price_max: prices.length ? Math.max(...prices) : null,
      available: p.variants.some((v) => v.available), variants: p.variants.slice(0, 30), embedding: vecs[i] as unknown as string, updated_at: new Date().toISOString(),
    };
  });
  const { error } = await adminClient().from('shopify_products').upsert(rows, { onConflict: 'chatbot_id,shopify_id' });
  if (error) throw new Error('Failed to store products');
}

/** Full catalogue sync (paginated). Updates installation status so failures are visible in the dashboard. */
export async function syncProducts(workspaceId: string, chatbotId: string, shop: string, token: string) {
  const db = adminClient();
  await db.from('shopify_installations').update({ status: 'syncing', last_error: null }).eq('chatbot_id', chatbotId);
  try {
    let cursor: string | null = null; let total = 0; const seen: string[] = [];
    do {
      const data: any = await gql(shop, token, `query($after:String){ products(first:50, after:$after, query:"status:active"){
        pageInfo{ hasNextPage endCursor }
        nodes{ id title description handle onlineStoreUrl featuredImage{ url } variants(first:50){ nodes{ title price availableForSale } } }
      } shop{ currencyCode } }`, { after: cursor });
      const items: ProductInput[] = data.products.nodes.map((n: any) => ({
        shopifyId: n.id, title: n.title, description: stripHtml(n.description || ''), handle: n.handle,
        url: n.onlineStoreUrl || `https://${shop}/products/${n.handle}`, image: n.featuredImage?.url ?? null, currency: data.shop.currencyCode,
        variants: n.variants.nodes.map((v: any) => ({ title: v.title, price: v.price, available: v.availableForSale })),
      }));
      await upsertProducts(workspaceId, chatbotId, items);
      seen.push(...items.map((i) => i.shopifyId)); total += items.length;
      cursor = data.products.pageInfo.hasNextPage && total < 2000 ? data.products.pageInfo.endCursor : null;
    } while (cursor);
    // remove products that no longer exist / are no longer active
    const { data: existing } = await db.from('shopify_products').select('shopify_id').eq('chatbot_id', chatbotId);
    const stale = (existing ?? []).map((r) => r.shopify_id as string).filter((id) => !seen.includes(id));
    if (stale.length) await db.from('shopify_products').delete().eq('chatbot_id', chatbotId).in('shopify_id', stale);
    await db.from('shopify_installations').update({ status: 'active', last_synced_at: new Date().toISOString() }).eq('chatbot_id', chatbotId);
  } catch (e) {
    await db.from('shopify_installations').update({ status: 'error', last_error: (e as Error).message.slice(0, 300) }).eq('chatbot_id', chatbotId);
  }
}

/** Maps a REST products/* webhook payload to ProductInput. */
export function fromWebhook(shop: string, p: any): ProductInput {
  return {
    shopifyId: `gid://shopify/Product/${p.id}`, title: p.title, description: stripHtml(p.body_html || ''), handle: p.handle,
    url: `https://${shop}/products/${p.handle}`, image: p.image?.src ?? null, currency: null,
    variants: (p.variants ?? []).map((v: any) => ({ title: v.title, price: v.price, available: v.inventory_policy === 'continue' || (v.inventory_quantity ?? 1) > 0 || v.inventory_management == null })),
  };
}
