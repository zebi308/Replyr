'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
export default function SettingsForm({ id, name }: { id: string; name: string }) {
  const [v, setV] = useState(name); const [msg, setMsg] = useState('');
  return (
    <form className="card max-w-md space-y-3 p-5" onSubmit={async (e) => { e.preventDefault(); const { error } = await createClient().from('workspaces').update({ name: v }).eq('id', id); setMsg(error ? error.message : 'Saved'); }}>
      <label className="label" htmlFor="w">Workspace name</label><input id="w" className="input" required maxLength={80} value={v} onChange={(e) => setV(e.target.value)} />
      <button className="btn-primary">Save</button>{msg && <p role="status" className="text-sm">{msg}</p>}
    </form>
  );
}
