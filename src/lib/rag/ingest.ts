import { adminClient } from '@/lib/supabase/admin';
import { embed } from '@/lib/ai/provider';
import { chunkText } from './chunk';
import { extractFile, extractSitemap, extractUrl } from './extract';

export type SourceInput =
  | { type: 'file'; name: string; buffer: Buffer }
  | { type: 'url'; url: string }
  | { type: 'sitemap'; url: string }
  | { type: 'text'; name: string; text: string }
  | { type: 'faq'; pairs: { q: string; a: string }[] };

const MAX_CHUNKS_PER_SOURCE = 400;

/** Creates the source row, runs extract -> chunk -> embed -> store, and records ready/failed. Never throws. */
export async function ingestSource(workspaceId: string, chatbotId: string, input: SourceInput) {
  const db = adminClient();
  const name = input.type === 'file' ? input.name : input.type === 'url' || input.type === 'sitemap' ? input.url : input.type === 'text' ? input.name : 'FAQ';
  const { data: src, error } = await db.from('knowledge_sources').insert({
    workspace_id: workspaceId, chatbot_id: chatbotId, type: input.type, name: name.slice(0, 200),
    url: 'url' in input ? input.url : null, status: 'processing',
  }).select().single();
  if (error || !src) return { error: 'Could not create source' };
  try {
    let text = '';
    if (input.type === 'file') text = await extractFile(input.name, input.buffer);
    else if (input.type === 'url') text = await extractUrl(input.url);
    else if (input.type === 'sitemap') text = await extractSitemap(input.url);
    else if (input.type === 'text') text = input.text;
    else text = input.pairs.map((p) => `Q: ${p.q}\nA: ${p.a}`).join('\n\n');

    const chunks = chunkText(text).slice(0, MAX_CHUNKS_PER_SOURCE);
    if (!chunks.length) throw new Error('No readable text found. Scanned PDFs (images) are not supported.');
    const vectors = await embed(chunks);
    const rows = chunks.map((content, i) => ({ workspace_id: workspaceId, chatbot_id: chatbotId, source_id: src.id, ordinal: i, content, embedding: vectors[i] as unknown as string }));
    for (let i = 0; i < rows.length; i += 100) {
      const { error: e } = await db.from('chunks').insert(rows.slice(i, i + 100));
      if (e) throw new Error('Failed to store embeddings');
    }
    await db.from('knowledge_sources').update({ status: 'ready', chunk_count: chunks.length, bytes: Buffer.byteLength(text) }).eq('id', src.id);
    return { id: src.id as string };
  } catch (e) {
    await db.from('chunks').delete().eq('source_id', src.id);
    await db.from('knowledge_sources').update({ status: 'failed', error: (e as Error).message.slice(0, 300) }).eq('id', src.id);
    return { id: src.id as string, error: (e as Error).message };
  }
}
