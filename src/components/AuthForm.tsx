'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Logo from './Logo';

export default function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [info, setInfo] = useState(''); const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setInfo('');
    const supabase = createClient();
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/dashboard` } });
      if (error) setError(error.message);
      else if (!data.session) setInfo('Check your email to confirm your account, then sign in.');
      else { router.push('/dashboard'); router.refresh(); }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message); else { router.push(new URLSearchParams(location.search).get('next') || '/dashboard'); router.refresh(); }
    }
    setBusy(false);
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <Link href="/"><Logo /></Link>
        <h1 className="text-xl font-bold">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
        <div><label className="label" htmlFor="email">Email</label><input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label" htmlFor="pw">Password</label><input id="pw" className="input" type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />{mode === 'signup' && <p className="hint">At least 8 characters.</p>}</div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {info && <p className="text-sm text-teal-dark">{info}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <p className="text-center text-sm text-ink/70">{mode === 'login' ? <>New here? <Link className="font-semibold text-teal" href="/signup">Create an account</Link></> : <>Have an account? <Link className="font-semibold text-teal" href="/login">Sign in</Link></>}</p>
      </form>
    </main>
  );
}
