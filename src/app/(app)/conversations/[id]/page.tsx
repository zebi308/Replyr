import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase.from('conversations').select('id, created_at, escalated, escalation_reason, contact_email, chatbots(name)').eq('id', id).maybeSingle();
  if (!c) notFound();
  const { data: msgs } = await supabase.from('messages').select('id, role, content, sources, unanswered, created_at').eq('conversation_id', id).order('created_at');
  return (
    <div className="max-w-2xl">
      <Link href="/conversations" className="text-sm text-teal">Back to conversations</Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">{(c as any).chatbots?.name}</h1>
      <p className="mb-4 text-sm text-ink/60">{new Date(c.created_at).toLocaleString()}{c.escalated && ` · Handed to team: ${c.escalation_reason ?? ''}`}{c.contact_email && ` · Contact: ${c.contact_email}`}</p>
      <div className="card space-y-3 p-4">{msgs?.map((m) => (
        <div key={m.id} className={m.role === 'user' ? 'text-right' : ''}>
          <div className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-sm ${m.role === 'user' ? 'bg-teal text-white' : 'bg-mist'}`}>{m.content}</div>
          {m.unanswered && <p className="text-xs text-amber">Unanswered</p>}
          {Array.isArray(m.sources) && m.sources.length > 0 && <p className="text-xs text-ink/60">Sources: {(m.sources as { name: string }[]).map((s) => s.name).join(', ')}</p>}
        </div>))}</div>
    </div>
  );
}
