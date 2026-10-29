import { adminClient } from '@/lib/supabase/admin';
import { getProvider, type Msg, type ToolDef } from '@/lib/ai/provider';
import { retrieve, type RetrievedChunk, type RetrievedProduct } from '@/lib/rag/retrieve';
import type { BotConfig } from '@/lib/config';
import { buildSystemPrompt, NO_ANSWER, sanitizeUserMessage } from './prompt';
import { executeTool, HUMAN_TOOL, ORDER_TOOL } from './tools';

export type ChatOutput = {
  reply: string; unanswered: boolean; sources: { name: string; similarity: number }[];
  products: { title: string; url: string; image: string | null; price: string; available: boolean }[];
  escalation?: { message: string; email: string; url: string }; tools: string[]; usage: { in: number; out: number };
};

const MAX_HISTORY = 12;

/** Single conversation engine used by the widget, the playground and every chatbot type. */
export async function runChat(p: { workspaceId: string; chatbotId: string; conversationId: string; config: BotConfig; history: { role: 'user' | 'assistant'; content: string }[]; userMessage: string }): Promise<ChatOutput> {
  const { config } = p;
  const db = adminClient();
  const userMessage = sanitizeUserMessage(p.userMessage);

  const { data: inst } = config.useShopify
    ? await db.from('shopify_installations').select('shop, access_token_enc, status').eq('chatbot_id', p.chatbotId).neq('status', 'uninstalled').maybeSingle()
    : { data: null };
  const installation = inst ? { shop: inst.shop as string, access_token_enc: inst.access_token_enc as string } : null;

  // Retrieval query includes the previous user turn so short follow-ups ("and in blue?") still retrieve well.
  const prevUser = [...p.history].reverse().find((m) => m.role === 'user')?.content ?? '';
  let chunks: RetrievedChunk[] = []; let products: RetrievedProduct[] = [];
  try {
    ({ chunks, products } = await retrieve(p.chatbotId, `${prevUser.slice(0, 300)}\n${userMessage}`.trim(), { knowledge: config.useKnowledge, products: !!installation }));
  } catch { /* retrieval failure degrades to prompt-only rather than failing the chat */ }

  const tools: ToolDef[] = [];
  if (installation) tools.push(ORDER_TOOL);
  if (config.escalation.enabled) tools.push(HUMAN_TOOL);
  const system = buildSystemPrompt(config, { chunks, products, orderTool: !!installation, humanTool: config.escalation.enabled });

  const messages: Msg[] = [
    ...p.history.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }) as Msg),
    { role: 'user', content: userMessage },
  ];
  const provider = getProvider();
  const used: string[] = []; let escalation: ChatOutput['escalation']; const usage = { in: 0, out: 0 }; let text = '';

  for (let step = 0; step < 4; step++) {
    const r = await provider.chat({ system, messages, tools: tools.length ? tools : undefined, maxTokens: config.maxReplyTokens, temperature: config.temperature, model: config.model || undefined });
    usage.in += r.usage.in; usage.out += r.usage.out;
    if (!r.toolCalls.length) { text = r.text; break; }
    messages.push({ role: 'assistant', content: r.text, toolCalls: r.toolCalls });
    for (const call of r.toolCalls) {
      const allowed = tools.some((t) => t.name === call.name); // model can only call tools that were offered for this chatbot
      const out = allowed ? await executeTool(call.name, call.args, { workspaceId: p.workspaceId, chatbotId: p.chatbotId, conversationId: p.conversationId, config, installation }) : { ok: false, result: { error: 'Tool not available' } };
      used.push(call.name);
      if (out.escalation) escalation = out.escalation;
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify(out.result) });
    }
  }

  let unanswered = text.includes(NO_ANSWER);
  let reply = text.replaceAll(NO_ANSWER, '').trim();
  if (!reply) { unanswered = true; reply = config.fallback; }
  if (unanswered && config.escalation.enabled && !escalation) escalation = { message: config.escalation.message, email: config.escalation.email, url: config.escalation.url };

  const lower = reply.toLowerCase();
  const shown = products.filter((x) => lower.includes(x.title.toLowerCase())).slice(0, 3);
  return {
    reply, unanswered, tools: used, usage, escalation,
    sources: unanswered ? [] : chunks.map((c) => ({ name: c.source_name, similarity: Math.round(c.similarity * 100) / 100 })),
    products: shown.map((x) => ({ title: x.title, url: x.url, image: x.image, price: x.price_min == null ? '' : `${x.currency ?? ''} ${x.price_min}${x.price_max !== x.price_min ? '+' : ''}`.trim(), available: x.available })),
  };
}
