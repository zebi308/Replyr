import { adminClient } from '@/lib/supabase/admin';
import { recordUsage } from '@/lib/billing/entitlements';
import type { BotConfig } from '@/lib/config';
import { runChat, type ChatOutput } from './run';
import { sanitizeUserMessage } from './prompt';

/** One user turn: persist conversation + messages, run the engine, track usage. Shared by widget and playground. */
export async function handleTurn(p: { workspaceId: string; chatbotId: string; config: BotConfig; channel: 'widget' | 'playground'; sessionId: string; conversationId?: string | null; message: string }) {
  const db = adminClient();
  const text = sanitizeUserMessage(p.message);
  if (!text) throw new Error('Empty message');

  let conversationId = p.conversationId ?? null;
  if (conversationId) {
    const { data } = await db.from('conversations').select('id').eq('id', conversationId).eq('chatbot_id', p.chatbotId).eq('session_id', p.sessionId).maybeSingle();
    if (!data) conversationId = null; // unknown/foreign id -> start a fresh conversation, never reuse someone else's
  }
  if (!conversationId) {
    const { data, error } = await db.from('conversations').insert({ workspace_id: p.workspaceId, chatbot_id: p.chatbotId, session_id: p.sessionId, channel: p.channel }).select('id').single();
    if (error || !data) throw new Error('Could not start conversation');
    conversationId = data.id as string;
  }

  const { data: hist } = await db.from('messages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(12);
  const history = (hist ?? []).reverse() as { role: 'user' | 'assistant'; content: string }[];
  await db.from('messages').insert({ conversation_id: conversationId, workspace_id: p.workspaceId, role: 'user', content: text });

  let out: ChatOutput; let failed = false;
  try {
    out = await runChat({ workspaceId: p.workspaceId, chatbotId: p.chatbotId, conversationId, config: p.config, history, userMessage: text });
  } catch {
    failed = true;
    out = { reply: p.config.fallback, unanswered: true, sources: [], products: [], tools: [], usage: { in: 0, out: 0 } };
  }
  await db.from('messages').insert({
    conversation_id: conversationId, workspace_id: p.workspaceId, role: 'assistant', content: out.reply, sources: out.sources.length ? out.sources : null,
    products_shown: out.products.length, unanswered: out.unanswered, tokens_in: out.usage.in, tokens_out: out.usage.out,
  });
  await db.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
  if (!failed) await recordUsage(p.workspaceId, out.usage.in + out.usage.out);
  return { conversationId, failed, ...out };
}
