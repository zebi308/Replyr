import { hmacHex, hmacB64, safeEqual } from '@/lib/crypto';

export const API_VERSION = () => process.env.SHOPIFY_API_VERSION || '2026-04';
export const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export async function gql<T = any>(shop: string, token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION()}/graphql.json`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': token },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20000),
  });
  if (res.status === 429 || res.status >= 500) throw new Error(`Shopify temporarily unavailable (${res.status})`);
  if (!res.ok) throw new Error(`Shopify API error ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error('Shopify GraphQL error: ' + JSON.stringify(json.errors).slice(0, 300));
  return json.data as T;
}

/** Verifies the HMAC Shopify appends to OAuth redirects. */
export function verifyOAuthHmac(params: URLSearchParams): boolean {
  const hmac = params.get('hmac'); if (!hmac) return false;
  const msg = [...params.entries()].filter(([k]) => k !== 'hmac').sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
  return safeEqual(hmacHex(process.env.SHOPIFY_API_SECRET || '', msg), hmac);
}
/** Verifies webhook signature over the raw body. */
export function verifyWebhook(raw: Buffer, header: string | null): boolean {
  return !!header && safeEqual(hmacB64(process.env.SHOPIFY_API_SECRET || '', raw), header);
}

const WEBHOOK_TOPICS = ['products/create', 'products/update', 'products/delete', 'app/uninstalled'];
export async function registerWebhooks(shop: string, token: string) {
  const address = `${process.env.NEXT_PUBLIC_APP_URL}/api/shopify/webhooks`;
  for (const topic of WEBHOOK_TOPICS) {
    const res = await fetch(`https://${shop}/admin/api/${API_VERSION()}/webhooks.json`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': token },
      body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
    });
    // 422 = already registered; anything else is surfaced to the caller
    if (!res.ok && res.status !== 422) throw new Error(`Webhook registration failed for ${topic} (${res.status})`);
  }
}

export async function lookupOrderByName(shop: string, token: string, orderNumber: string) {
  const name = '#' + orderNumber.replace(/[^0-9A-Za-z-]/g, '');
  const data = await gql(shop, token, `query($q:String!){ orders(first:1, query:$q){ nodes{
    name email createdAt displayFinancialStatus displayFulfillmentStatus
    fulfillments{ status deliveredAt estimatedDeliveryAt trackingInfo{ company number url } }
  } } }`, { q: `name:${name}` });
  return data?.orders?.nodes?.[0] ?? null;
}
