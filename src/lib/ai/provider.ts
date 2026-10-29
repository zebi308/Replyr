// Provider abstraction: add a new vendor by implementing `Provider`.
export type ToolCall = { id: string; name: string; args: Record<string, unknown> };
export type Msg =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };
export type ToolDef = { name: string; description: string; parameters: Record<string, unknown> };
export type ChatRequest = { system: string; messages: Msg[]; tools?: ToolDef[]; maxTokens: number; temperature?: number; model?: string; timeoutMs?: number };
export type ChatResult = { text: string; toolCalls: ToolCall[]; usage: { in: number; out: number } };
export interface Provider {
  chat(req: ChatRequest): Promise<ChatResult>;
}

export class ProviderError extends Error {
  constructor(msg: string, public status?: number) { super(msg); }
}

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number) {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new ProviderError((e as Error).name === 'TimeoutError' ? 'Model timed out' : 'Model unreachable');
  }
  if (!res.ok) throw new ProviderError(`Model error ${res.status}`, res.status);
  return res.json();
}

export class OpenAICompatible implements Provider {
  async chat(r: ChatRequest): Promise<ChatResult> {
    const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const messages: unknown[] = [{ role: 'system', content: r.system }];
    for (const m of r.messages) {
      if (m.role === 'tool') messages.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
      else if (m.role === 'assistant' && m.toolCalls?.length)
        messages.push({ role: 'assistant', content: m.content || null, tool_calls: m.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.args) } })) });
      else messages.push({ role: m.role, content: m.content });
    }
    const data = await post(`${base}/chat/completions`, { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, {
      model: r.model || process.env.AI_MODEL || 'gpt-4o-mini', messages, max_tokens: r.maxTokens, temperature: r.temperature ?? 0.3,
      ...(r.tools?.length ? { tools: r.tools.map((t) => ({ type: 'function', function: t })) } : {}),
    }, r.timeoutMs ?? 30000);
    const msg = data.choices?.[0]?.message ?? {};
    const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((t: any) => {
      let args = {}; try { args = JSON.parse(t.function.arguments || '{}'); } catch { /* malformed args -> empty */ }
      return { id: t.id, name: t.function.name, args };
    });
    return { text: msg.content ?? '', toolCalls, usage: { in: data.usage?.prompt_tokens ?? 0, out: data.usage?.completion_tokens ?? 0 } };
  }
}

export class AnthropicProvider implements Provider {
  async chat(r: ChatRequest): Promise<ChatResult> {
    const messages: any[] = [];
    for (const m of r.messages) {
      if (m.role === 'user') messages.push({ role: 'user', content: m.content });
      else if (m.role === 'assistant') {
        const blocks: any[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        m.toolCalls?.forEach((t) => blocks.push({ type: 'tool_use', id: t.id, name: t.name, input: t.args }));
        messages.push({ role: 'assistant', content: blocks });
      } else {
        const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
        const last = messages[messages.length - 1];
        if (last?.role === 'user' && Array.isArray(last.content)) last.content.push(block);
        else messages.push({ role: 'user', content: [block] });
      }
    }
    const data = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' }, {
      model: r.model || process.env.AI_MODEL || 'claude-sonnet-4-5', system: r.system, messages, max_tokens: r.maxTokens, temperature: r.temperature ?? 0.3,
      ...(r.tools?.length ? { tools: r.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
    }, r.timeoutMs ?? 30000);
    const blocks: any[] = data.content ?? [];
    return {
      text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join(''),
      toolCalls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input ?? {} })),
      usage: { in: data.usage?.input_tokens ?? 0, out: data.usage?.output_tokens ?? 0 },
    };
  }
}

export function getProvider(): Provider {
  return process.env.AI_PROVIDER === 'anthropic' ? new AnthropicProvider() : new OpenAICompatible();
}

export async function embed(texts: string[]): Promise<number[][]> {
  const base = process.env.EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const key = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64).map((t) => t.slice(0, 8000));
    const data = await post(`${base}/embeddings`, { authorization: `Bearer ${key}` }, { model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small', input: batch }, 60000);
    out.push(...data.data.sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding));
  }
  return out;
}
