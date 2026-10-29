import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function Dashboard() {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const head = { count: 'exact' as const, head: true };
  const [bots, convs, msgs, unans, esc, prods] = await Promise.all([
    supabase.from('chatbots').select('id', head),
    supabase.from('conversations').select('id', head).eq('channel', 'widget').gte('created_at', since),
    supabase.from('messages').select('id', head).eq('role', 'user').gte('created_at', since),
    supabase.from('messages').select('id', head).eq('unanswered', true).gte('created_at', since),
    supabase.from('conversations').select('id', head).eq('escalated', true).eq('channel', 'widget').gte('created_at', since),
    supabase.from('messages').select('products_shown').gt('products_shown', 0).gte('created_at', since),
  ]);
  const productShown = (prods.data ?? []).reduce((s, r) => s + (r.products_shown as number), 0);
  const stats = [
    ['Chatbots', bots.count ?? 0, ''], ['Live conversations', convs.count ?? 0, 'Last 30 days'], ['Customer messages', msgs.count ?? 0, 'Includes playground tests'],
    ['Unanswered', unans.count ?? 0, 'Bot had no grounded answer'], ['Handed to your team', esc.count ?? 0, 'Escalated conversations'], ['Products shown', productShown, 'Product cards in replies'],
  ];
  return (
    <div>
      <div className="mb-6 flex items-center justify-between"><h1 className="text-2xl font-bold">Overview</h1><Link href="/chatbots/new" className="btn-primary">Create chatbot</Link></div>
      {(bots.count ?? 0) === 0 ? (
        <div className="card p-10 text-center"><h2 className="text-lg font-bold">Create your first assistant</h2><p className="mx-auto mt-2 max-w-md text-sm text-ink/70">Pick Shopify, documents or custom instructions. You can test it before anyone sees it.</p><Link href="/chatbots/new" className="btn-primary mt-5">Create chatbot</Link></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map(([l, v, s]) => <div key={l as string} className="card p-5"><p className="text-sm text-ink/60">{l}</p><p className="mt-1 text-3xl font-extrabold">{v}</p><p className="hint">{s}</p></div>)}
        </div>
      )}
      <p className="hint mt-6">Resolution rate is not shown: Replyr cannot defend an automatic "resolved" label. Use unanswered questions and handoffs to decide what to improve.</p>
    </div>
  );
}
