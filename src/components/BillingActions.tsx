'use client';
import { useState } from 'react';
export default function BillingActions({ plans, current, hasCustomer }: { plans: { id: string; name: string; display_price: string }[]; current: string; hasCustomer: boolean }) {
  const [err, setErr] = useState('');
  async function go(url: string, body?: object) {
    setErr(''); const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json(); if (j.url) location.href = j.url; else setErr(j.error || 'Failed');
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">{plans.filter((p) => p.id !== 'free').map((p) => (
        <div key={p.id} className="card p-5"><p className="font-bold">{p.name}</p><p className="text-sm text-ink/60">{p.display_price}</p>
          <button className="btn-primary mt-3" disabled={current === p.id} onClick={() => go('/api/stripe/checkout', { plan: p.id })}>{current === p.id ? 'Current plan' : `Choose ${p.name}`}</button></div>))}</div>
      {hasCustomer && <button className="btn-ghost" onClick={() => go('/api/stripe/portal')}>Manage billing, change or cancel</button>}
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
