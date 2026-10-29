'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const TEMPLATES = {
  support: 'You are a polite customer support representative. Answer questions about our service using the information provided, keep replies short, and direct people to a human for anything you cannot resolve.',
  blank: '',
};

export default function NewChatbot() {
  const router = useRouter();
  const [name, setName] = useState(''); const [shopify, setShopify] = useState(false); const [knowledge, setKnowledge] = useState(false);
  const [prompt, setPrompt] = useState(TEMPLATES.support); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    const res = await fetch('/api/chatbots', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, useShopify: shopify, useKnowledge: knowledge, systemPrompt: prompt, role: 'Customer support assistant' }) });
    const j = await res.json();
    if (!res.ok) { setError(j.error || 'Could not create chatbot'); setBusy(false); return; }
    router.push(`/chatbots/${j.id}?tab=${shopify ? 'shopify' : knowledge ? 'knowledge' : 'playground'}`);
  }
  const opt = (checked: boolean, set: (v: boolean) => void, title: string, desc: string) => (
    <label className={`card flex cursor-pointer items-start gap-3 p-4 ${checked ? 'border-teal ring-2 ring-teal/20' : ''}`}>
      <input type="checkbox" className="mt-1 h-4 w-4 accent-teal" checked={checked} onChange={(e) => set(e.target.checked)} />
      <span><span className="block font-semibold">{title}</span><span className="text-sm text-ink/70">{desc}</span></span>
    </label>
  );
  return (
    <form onSubmit={create} className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-bold">Create chatbot</h1>
      <div><label className="label" htmlFor="n">Name</label><input id="n" className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Store support" /></div>
      <fieldset className="space-y-3"><legend className="label">What should it know? Combine as many as you like.</legend>
        {opt(shopify, setShopify, 'Shopify store', 'Products, prices, stock and verified order status.')}
        {opt(knowledge, setKnowledge, 'Documents and website', 'PDFs, Word files, web pages, FAQs.')}
        <p className="hint">Custom instructions are always included.</p>
      </fieldset>
      <div><label className="label" htmlFor="p">Instructions</label><textarea id="p" className="input min-h-32" maxLength={6000} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button className="btn-primary" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create chatbot'}</button>
    </form>
  );
}
