import Link from 'next/link';
import { redirect } from 'next/navigation';
import Logo from '@/components/Logo';
import SignOut from '@/components/SignOut';
import { createClient } from '@/lib/supabase/server';

const nav = [['/dashboard', 'Overview'], ['/chatbots', 'Chatbots'], ['/conversations', 'Conversations'], ['/billing', 'Usage & billing'], ['/settings', 'Settings']];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: ws } = await supabase.from('workspaces').select('name, plan').limit(1).maybeSingle();
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-ink px-3 py-4 text-white md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0">
        <div className="mb-4 px-3 text-white"><Logo /></div>
        <nav className="flex gap-1 overflow-x-auto md:block md:space-y-1" aria-label="Main">
          {nav.map(([href, label]) => <Link key={href} href={href} className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white">{label}</Link>)}
        </nav>
        <div className="mt-6 hidden border-t border-white/10 pt-4 md:block">
          <p className="truncate px-3 text-xs text-white/50">{ws?.name}</p>
          <p className="px-3 pb-2 text-xs text-white/50">{ws?.plan} plan · {user.email}</p>
          <SignOut />
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
