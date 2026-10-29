'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
export default function SignOut() {
  const router = useRouter();
  return <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/70 hover:bg-white/10" onClick={async () => { await createClient().auth.signOut(); router.push('/'); router.refresh(); }}>Sign out</button>;
}
