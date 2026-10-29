import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function Chatbots() {
  const supabase = await createClient();
  const { data: bots } = await supabase.from('chatbots').select('id, name, public_id, published_at, created_at').order('created_at', { ascending: false });
  return (
    <div>
      <div className="mb-6 flex items-center justify-between"><h1 className="text-2xl font-bold">Chatbots</h1><Link href="/chatbots/new" className="btn-primary">Create chatbot</Link></div>
      {!bots?.length ? <div className="card p-10 text-center text-sm text-ink/70">No chatbots yet. Create one to get started.</div> : (
        <ul className="card divide-y divide-line">
          {bots.map((b) => (
            <li key={b.id}><Link href={`/chatbots/${b.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-mist">
              <span className="font-semibold">{b.name}</span>
              <span className={`badge ${b.published_at ? 'bg-teal-soft text-teal-dark' : 'bg-amber/20 text-ink'}`}>{b.published_at ? 'Live' : 'Draft only'}</span>
            </Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
