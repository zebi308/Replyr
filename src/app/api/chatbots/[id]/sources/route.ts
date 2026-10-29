import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadBot, requireWorkspace } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { getEntitlements } from '@/lib/billing/entitlements';
import { ingestSource, type SourceInput } from '@/lib/rag/ingest';
import { MAX_FILE_BYTES } from '@/lib/rag/extract';

export const maxDuration = 300;
type P = { params: Promise<{ id: string }> };

const json = z.discriminatedUnion('type', [
  z.object({ type: z.literal('url'), url: z.string().url().max(500) }),
  z.object({ type: z.literal('sitemap'), url: z.string().url().max(500) }),
  z.object({ type: z.literal('text'), name: z.string().trim().min(1).max(120), text: z.string().min(1).max(200_000) }),
  z.object({ type: z.literal('faq'), pairs: z.array(z.object({ q: z.string().min(1).max(500), a: z.string().min(1).max(3000) })).min(1).max(200) }),
]);

export async function GET(_: Request, { params }: P) {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const bot = await loadBot(ctx.supabase, (await params).id);
  if (!bot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data } = await ctx.supabase.from('knowledge_sources').select('id, type, name, url, status, error, chunk_count, bytes, created_at').eq('chatbot_id', bot.id).order('created_at', { ascending: false });
  return NextResponse.json({ sources: data ?? [] });
}

export async function POST(req: Request, { params }: P) {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const bot = await loadBot(ctx.supabase, (await params).id);
  if (!bot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ent = await getEntitlements(ctx.workspaceId);
  const { count } = await ctx.supabase.from('knowledge_sources').select('id', { count: 'exact', head: true });
  if ((count ?? 0) >= ent.max_sources) return NextResponse.json({ error: `Your ${ent.plan} plan allows ${ent.max_sources} knowledge sources.` }, { status: 402 });

  let input: SourceInput;
  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const file = (await req.formData()).get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'File is larger than 10 MB' }, { status: 413 });
    input = { type: 'file', name: file.name.slice(0, 200), buffer: Buffer.from(await file.arrayBuffer()) };
  } else {
    const p = json.safeParse(await req.json().catch(() => null));
    if (!p.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    input = p.data as SourceInput;
  }
  const r = await ingestSource(ctx.workspaceId, bot.id, input);
  return NextResponse.json(r, { status: r.error ? 422 : 200 });
}

export async function DELETE(req: Request, { params }: P) {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const bot = await loadBot(ctx.supabase, (await params).id);
  const sourceId = new URL(req.url).searchParams.get('sourceId');
  if (!bot || !sourceId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await adminClient().from('knowledge_sources').delete().eq('id', sourceId).eq('chatbot_id', bot.id); // chunks cascade
  return NextResponse.json({ ok: true });
}
