import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function Conversations({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = '', f = 'all' } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from('conversations').select('id, created_at, escalated, chatbot_id, chatbots(name), messages(content, role, unanswered, created_at)').eq('channel', 'widget').order('last_message_at', { ascending: false }).limit(100);
  if (f === 'escalated') query = query.eq('escalated', true);
  const { data } = await query;
  let rows = (data ?? []).map((c: any) => { const ms = [...(c.messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)); return { ...c, first: ms.find((m) => m.role === 'user')?.content ?? '', n: ms.length, unanswered: ms.some((m) => m.unanswered), text: ms.map((m) => m.content).join(' ').toLowerCase() }; });
  if (f === 'unanswered') rows = rows.filter((r) => r.unanswered);
  if (q) rows = rows.filter((r) => r.text.includes(q.toLowerCase()));
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Conversations</h1>
      <form className="mb-4 flex flex-wrap gap-2"><input name="q" defaultValue={q} className="input max-w-xs" placeholder="Search messages" aria-label="Search" />
        <select name="f" defaultValue={f} className="input max-w-44" aria-label="Filter"><option value="all">All</option><option value="unanswered">With unanswered questions</option><option value="escalated">Handed to team</option></select><button className="btn-ghost">Apply</button></form>
      {!rows.length ? <div className="card p-10 text-center text-sm text-ink/70">No conversations match. Widget conversations appear here once customers start chatting.</div> : (
        <ul className="card divide-y divide-line">{rows.map((r: any) => (
          <li key={r.id}><Link href={`/conversations/${r.id}`} className="block px-5 py-4 hover:bg-mist">
            <div className="flex items-center justify-between gap-3"><p className="truncate font-semibold">{r.first || '(empty)'}</p><span className="shrink-0 text-xs text-ink/60">{new Date(r.created_at).toLocaleString()}</span></div>
            <p className="mt-1 text-xs text-ink/60">{r.chatbots?.name} · {r.n} messages {r.unanswered && <span className="badge ml-1 bg-amber/20 text-ink">Unanswered</span>} {r.escalated && <span className="badge ml-1 bg-red-100 text-red-800">Handed to team</span>}</p>
          </Link></li>))}</ul>)}
    </div>
  );
}
