import { adminClient } from '@/lib/supabase/admin';
import { embed } from '@/lib/ai/provider';

export type RetrievedChunk = { id: string; source_name: string; content: string; similarity: number };
export type RetrievedProduct = { id: string; title: string; description: string; url: string; image: string | null; currency: string | null; price_min: number | null; price_max: number | null; available: boolean; variants: { title: string; price: string; available: boolean }[]; similarity: number };

export async function retrieve(chatbotId: string, query: string, opts: { knowledge: boolean; products: boolean }) {
  if (!opts.knowledge && !opts.products) return { chunks: [] as RetrievedChunk[], products: [] as RetrievedProduct[] };
  const [vec] = await embed([query]);
  const db = adminClient();
  const [c, p] = await Promise.all([
    opts.knowledge ? db.rpc('match_chunks', { query_embedding: vec as unknown as string, p_chatbot: chatbotId, match_count: 5, min_similarity: 0.25 }) : null,
    opts.products ? db.rpc('match_products', { query_embedding: vec as unknown as string, p_chatbot: chatbotId, match_count: 5, min_similarity: 0.2 }) : null,
  ]);
  return { chunks: ((c?.data ?? []) as RetrievedChunk[]), products: ((p?.data ?? []) as RetrievedProduct[]) };
}
