'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BotConfig } from '@/lib/config';

type Bot = { id: string; publicId: string; name: string; draft: BotConfig; published: BotConfig | null };
const TABS = [['configure', 'Configure'], ['knowledge', 'Knowledge'], ['shopify', 'Shopify'], ['appearance', 'Appearance'], ['playground', 'Playground'], ['deploy', 'Deploy']] as const;

export default function BotEditor({ bot, initialTab, flash }: { bot: Bot; initialTab: string; flash: string }) {
  const router = useRouter();
  const [tab, setTab] = useState(TABS.some((t) => t[0] === initialTab) ? initialTab : 'configure');
  const [cfg, setCfg] = useState<BotConfig>(bot.draft);
  const [saved, setSaved] = useState(JSON.stringify(bot.draft));
  const [published, setPublished] = useState<string | null>(bot.published ? JSON.stringify(bot.published) : null);
  const [msg, setMsg] = useState(flash); const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(cfg) !== saved;
  const unpublished = published !== saved;
  const set = <K extends keyof BotConfig>(k: K, v: BotConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  async function save(): Promise<boolean> {
    setBusy(true); const r = await fetch(`/api/chatbots/${bot.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draft: cfg }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.error + (j.issues ? ': ' + j.issues.join(', ') : '')); return false; }
    setSaved(JSON.stringify(cfg)); setMsg('Draft saved'); return true;
  }
  async function publish() {
    if (dirty && !(await save())) return;
    setBusy(true); const r = await fetch(`/api/chatbots/${bot.id}/publish`, { method: 'POST' }); setBusy(false);
    if (r.ok) { setPublished(JSON.stringify(cfg)); setMsg('Published. Your website widget now uses this version.'); } else setMsg('Could not publish');
  }
  async function remove() {
    if (!confirm('Delete this chatbot, its knowledge, products and conversations? This cannot be undone.')) return;
    const r = await fetch(`/api/chatbots/${bot.id}`, { method: 'DELETE' }); if (r.ok) { router.push('/chatbots'); router.refresh(); }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{cfg.name || bot.name}</h1>
          <p className="text-sm text-ink/60">{published === null ? 'Not published yet' : unpublished ? 'Live version differs from your draft' : 'Draft matches the live version'}</p></div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={save} disabled={busy || !dirty}>Save draft</button>
          <button className="btn-primary" onClick={publish} disabled={busy || (!dirty && !unpublished)}>Publish</button>
        </div>
      </div>
      {msg && <p role="status" className="mb-3 rounded-lg bg-teal-soft px-3 py-2 text-sm text-teal-dark">{msg}</p>}
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${tab === k ? 'border-teal text-teal' : 'border-transparent text-ink/60 hover:text-ink'}`}>{l}</button>)}
      </div>

      {tab === 'configure' && (
        <div className="card space-y-4 p-5">
          <F label="Chatbot name"><input className="input" value={cfg.name} maxLength={80} onChange={(e) => set('name', e.target.value)} /></F>
          <F label="Role and objectives"><textarea className="input min-h-20" maxLength={600} value={cfg.role} onChange={(e) => set('role', e.target.value)} /></F>
          <F label="Tone"><input className="input" maxLength={200} value={cfg.tone} onChange={(e) => set('tone', e.target.value)} /></F>
          <F label="Instructions and business information" hint="Anything the assistant should know or do. End users cannot override this."><textarea className="input min-h-36" maxLength={6000} value={cfg.systemPrompt} onChange={(e) => set('systemPrompt', e.target.value)} /></F>
          <F label="Response guidelines"><textarea className="input min-h-20" maxLength={3000} value={cfg.guidelines} onChange={(e) => set('guidelines', e.target.value)} /></F>
          <F label="Restrictions and topics to avoid"><textarea className="input min-h-20" maxLength={3000} value={cfg.restrictions} onChange={(e) => set('restrictions', e.target.value)} /></F>
          <F label="Fallback reply" hint="Shown when the assistant has no grounded answer."><input className="input" maxLength={500} value={cfg.fallback} onChange={(e) => set('fallback', e.target.value)} /></F>
          <F label="Welcome message"><input className="input" maxLength={300} value={cfg.welcome} onChange={(e) => set('welcome', e.target.value)} /></F>
          <F label="Suggested questions" hint="One per line, up to 4."><textarea className="input min-h-20" value={cfg.suggested.join('\n')} onChange={(e) => set('suggested', e.target.value.split('\n').map((s) => s.slice(0, 100)).slice(0, 4))} /></F>
          <div className="grid gap-3 sm:grid-cols-2">
            <Check label="Use uploaded knowledge" v={cfg.useKnowledge} on={(v) => set('useKnowledge', v)} />
            <Check label="Use Shopify store" v={cfg.useShopify} on={(v) => set('useShopify', v)} />
          </div>
          <fieldset className="space-y-3 rounded-lg border border-line p-4"><legend className="px-1 text-sm font-semibold">Human handoff</legend>
            <Check label="Offer a human when the assistant cannot help" v={cfg.escalation.enabled} on={(v) => set('escalation', { ...cfg.escalation, enabled: v })} />
            <F label="Handoff message"><input className="input" maxLength={400} value={cfg.escalation.message} onChange={(e) => set('escalation', { ...cfg.escalation, message: e.target.value })} /></F>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Support email"><input className="input" type="email" maxLength={200} value={cfg.escalation.email} onChange={(e) => set('escalation', { ...cfg.escalation, email: e.target.value })} /></F>
              <F label="Support page URL"><input className="input" maxLength={300} value={cfg.escalation.url} onChange={(e) => set('escalation', { ...cfg.escalation, url: e.target.value })} /></F>
            </div>
          </fieldset>
          <details><summary className="cursor-pointer text-sm font-semibold">Model settings (optional)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <F label="Model override" hint="Blank = platform default."><input className="input" maxLength={80} value={cfg.model} onChange={(e) => set('model', e.target.value)} /></F>
              <F label={`Creativity: ${cfg.temperature}`}><input type="range" min={0} max={1} step={0.1} value={cfg.temperature} onChange={(e) => set('temperature', Number(e.target.value))} className="w-full accent-teal" /></F>
            </div></details>
          <div className="border-t border-line pt-4"><button className="btn-danger" onClick={remove}>Delete chatbot</button></div>
        </div>
      )}
      {tab === 'knowledge' && <Knowledge botId={bot.id} />}
      {tab === 'shopify' && <Shopify botId={bot.id} />}
      {tab === 'appearance' && (
        <div className="card space-y-4 p-5">
          <F label="Widget title"><input className="input" maxLength={60} value={cfg.widget.title} onChange={(e) => set('widget', { ...cfg.widget, title: e.target.value })} /></F>
          <div className="grid gap-4 sm:grid-cols-2">
            <F label="Brand colour"><input type="color" className="h-10 w-full rounded-lg border border-line" value={cfg.widget.color} onChange={(e) => set('widget', { ...cfg.widget, color: e.target.value })} /></F>
            <F label="Launcher position"><select className="input" value={cfg.widget.position} onChange={(e) => set('widget', { ...cfg.widget, position: e.target.value as 'left' | 'right' })}><option value="right">Bottom right</option><option value="left">Bottom left</option></select></F>
          </div>
          <F label="Avatar image URL (https)"><input className="input" maxLength={500} value={cfg.widget.avatar} onChange={(e) => set('widget', { ...cfg.widget, avatar: e.target.value })} /></F>
          <F label="Allowed domains" hint="One per line, e.g. mystore.com. Leave empty to allow any site. Subdomains are included."><textarea className="input min-h-20" value={cfg.widget.allowedDomains.join('\n')} onChange={(e) => set('widget', { ...cfg.widget, allowedDomains: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 20) })} /></F>
          <div className="rounded-lg p-4 text-white" style={{ background: cfg.widget.color }}><p className="font-semibold">{cfg.widget.title}</p><p className="text-sm opacity-90">{cfg.welcome}</p></div>
        </div>
      )}
      {tab === 'playground' && <Playground botId={bot.id} dirty={dirty} onSave={save} />}
      {tab === 'deploy' && (
        <div className="card space-y-4 p-5">
          {published === null ? <p className="text-sm">Publish your chatbot first. The widget only serves published versions.</p> : null}
          <div><p className="label">Embed code</p><p className="hint mb-2">Paste before the closing &lt;/body&gt; tag. For Shopify: Online Store → Themes → Edit code → theme.liquid.</p>
            <pre className="overflow-x-auto rounded-lg bg-ink p-4 text-xs text-white">{`<script src="${typeof window !== 'undefined' ? location.origin : ''}/widget.js" data-bot-id="${bot.publicId}" defer></script>`}</pre></div>
        </div>
      )}
    </div>
  );
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}{hint && <span className="hint block">{hint}</span>}</label>;
}
function Check({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-teal" checked={v} onChange={(e) => on(e.target.checked)} />{label}</label>;
}

type Source = { id: string; type: string; name: string; status: string; error: string | null; chunk_count: number };
function Knowledge({ botId }: { botId: string }) {
  const [sources, setSources] = useState<Source[]>([]); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(''); const [text, setText] = useState(''); const [title, setTitle] = useState(''); const [faq, setFaq] = useState('');
  const load = useCallback(async () => { const r = await fetch(`/api/chatbots/${botId}/sources`); if (r.ok) setSources((await r.json()).sources); }, [botId]);
  useEffect(() => { load(); }, [load]);
  async function add(body: BodyInit, json = true) {
    setBusy(true); setErr('');
    const r = await fetch(`/api/chatbots/${botId}/sources`, { method: 'POST', ...(json ? { headers: { 'content-type': 'application/json' } } : {}), body });
    const j = await r.json(); if (!r.ok) setErr(j.error || 'Failed'); setBusy(false); load();
  }
  const sitemap = /\.xml(\?|$)/i.test(url);
  return (
    <div className="space-y-5">
      <div className="card space-y-5 p-5">
        <div><label className="label" htmlFor="f">Upload a file (PDF, DOCX, TXT, MD · max 10 MB)</label><input id="f" type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.append('file', f); add(fd, false); e.target.value = ''; } }} /></div>
        <div><label className="label" htmlFor="u">Website page or sitemap.xml</label><div className="flex gap-2"><input id="u" className="input" placeholder="https://example.com/returns" value={url} onChange={(e) => setUrl(e.target.value)} /><button className="btn-ghost" disabled={busy || !url} onClick={() => { add(JSON.stringify({ type: sitemap ? 'sitemap' : 'url', url })); setUrl(''); }}>Add</button></div></div>
        <div><label className="label">Paste text</label><input className="input mb-2" placeholder="Title (e.g. Shipping policy)" value={title} onChange={(e) => setTitle(e.target.value)} /><textarea className="input min-h-24" value={text} onChange={(e) => setText(e.target.value)} /><button className="btn-ghost mt-2" disabled={busy || !text || !title} onClick={() => { add(JSON.stringify({ type: 'text', name: title, text })); setText(''); setTitle(''); }}>Add text</button></div>
        <div><label className="label">FAQ pairs</label><textarea className="input min-h-24" placeholder={'Q: Do you ship abroad?\nA: Yes, to the EU and US.\n\nQ: ...\nA: ...'} value={faq} onChange={(e) => setFaq(e.target.value)} />
          <button className="btn-ghost mt-2" disabled={busy || !faq} onClick={() => {
            const pairs = faq.split(/\n\s*\n/).map((b) => { const m = b.match(/^\s*Q:\s*([\s\S]*?)\n\s*A:\s*([\s\S]*)$/i); return m ? { q: m[1].trim(), a: m[2].trim() } : null; }).filter(Boolean);
            if (!pairs.length) { setErr('Use the format "Q: …" then "A: …", with a blank line between pairs.'); return; }
            add(JSON.stringify({ type: 'faq', pairs })); setFaq('');
          }}>Add FAQ</button></div>
        {busy && <p className="text-sm text-ink/70" role="status">Processing… large files and sitemaps can take a minute.</p>}
        {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      </div>
      <div className="card divide-y divide-line">
        {!sources.length && <p className="p-5 text-sm text-ink/70">No knowledge added yet. Turn on “Use uploaded knowledge” in Configure.</p>}
        {sources.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{s.name}</p><p className="text-xs text-ink/60">{s.type}{s.status === 'ready' ? ` · ${s.chunk_count} passages` : ''}{s.error ? ` · ${s.error}` : ''}</p></div>
            <span className={`badge ${s.status === 'ready' ? 'bg-teal-soft text-teal-dark' : s.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber/20'}`}>{s.status}</span>
            <button className="btn-danger" onClick={async () => { await fetch(`/api/chatbots/${botId}/sources?sourceId=${s.id}`, { method: 'DELETE' }); load(); }}>Delete</button>
          </div>))}
      </div>
    </div>
  );
}

function Shopify({ botId }: { botId: string }) {
  const [state, setState] = useState<{ installation: { shop: string; status: string; last_error: string | null; last_synced_at: string | null } | null; productCount: number } | null>(null);
  const [shop, setShop] = useState('');
  const load = useCallback(async () => { const r = await fetch(`/api/chatbots/${botId}/shopify`); if (r.ok) setState(await r.json()); }, [botId]);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  const i = state?.installation;
  return (
    <div className="card space-y-4 p-5">
      {i ? (<>
        <div className="flex items-center justify-between"><div><p className="font-semibold">{i.shop}</p><p className="text-sm text-ink/60">{state?.productCount} products synced{i.last_synced_at ? ` · last sync ${new Date(i.last_synced_at).toLocaleString()}` : ''}</p></div>
          <span className={`badge ${i.status === 'active' ? 'bg-teal-soft text-teal-dark' : i.status === 'error' ? 'bg-red-100 text-red-800' : 'bg-amber/20'}`}>{i.status}</span></div>
        {i.last_error && <p className="text-sm text-red-700" role="alert">{i.last_error}</p>}
        <div className="flex gap-2"><button className="btn-ghost" onClick={async () => { await fetch(`/api/chatbots/${botId}/shopify`, { method: 'POST' }); load(); }}>Re-sync products</button>
          <button className="btn-danger" onClick={async () => { if (confirm('Disconnect this store? Stored access and synced products are deleted.')) { await fetch(`/api/chatbots/${botId}/shopify`, { method: 'DELETE' }); load(); } }}>Disconnect</button></div>
        <p className="hint">Enable “Use Shopify store” in Configure. Product changes arrive by webhook; re-sync if anything looks stale.</p>
      </>) : (
        <form action="/api/shopify/install" method="get" className="space-y-3">
          <input type="hidden" name="chatbot_id" value={botId} />
          <label className="label" htmlFor="shop">Your Shopify store</label>
          <div className="flex gap-2"><input id="shop" name="shop" className="input" placeholder="your-store.myshopify.com" required value={shop} onChange={(e) => setShop(e.target.value)} /><button className="btn-primary">Connect</button></div>
          <p className="hint">You will approve read-only access to products and orders on Shopify.</p>
        </form>)}
    </div>
  );
}

type Turn = { role: 'user' | 'bot'; text: string; meta?: { sources: { name: string; similarity: number }[]; tools: string[]; unanswered: boolean; products: { title: string; url: string }[] } };
function Playground({ botId, dirty, onSave }: { botId: string; dirty: boolean; onSave: () => Promise<boolean> }) {
  const [turns, setTurns] = useState<Turn[]>([]); const [input, setInput] = useState(''); const [busy, setBusy] = useState(false); const conv = useRef<string | null>(null); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [turns]);
  async function send(e: React.FormEvent) {
    e.preventDefault(); const text = input.trim(); if (!text || busy) return;
    if (dirty && !(await onSave())) return; // playground always tests the latest draft
    setInput(''); setBusy(true); setTurns((t) => [...t, { role: 'user', text }]);
    const r = await fetch(`/api/chatbots/${botId}/playground`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text, conversationId: conv.current }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setTurns((t) => [...t, { role: 'bot', text: j.error || 'Error' }]); return; }
    conv.current = j.conversationId;
    setTurns((t) => [...t, { role: 'bot', text: j.reply, meta: { sources: j.sources, tools: j.tools, unanswered: j.unanswered, products: j.products } }]);
  }
  return (
    <div className="card flex h-[34rem] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {!turns.length && <p className="text-sm text-ink/60">Ask a test question. This runs your latest draft, not the published version.</p>}
        {turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'text-right' : ''}>
            <div className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-sm ${t.role === 'user' ? 'bg-teal text-white' : 'bg-mist'}`}>{t.text}</div>
            {t.meta && <div className="mt-1 text-xs text-ink/60">
              {t.meta.unanswered && <span className="badge bg-amber/20 text-ink">Unanswered</span>}{' '}
              {t.meta.tools.length > 0 && <span>Tools: {t.meta.tools.join(', ')} · </span>}
              {t.meta.sources.length > 0 && <span>Sources: {t.meta.sources.map((s) => `${s.name} (${s.similarity})`).join('; ')}</span>}
              {t.meta.products.length > 0 && <span> Products: {t.meta.products.map((p) => p.title).join(', ')}</span>}
            </div>}
          </div>))}
        {busy && <p className="text-sm text-ink/60" role="status">Thinking…</p>}<div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line p-3"><input className="input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} placeholder="Type a test message" aria-label="Test message" /><button className="btn-primary" disabled={busy}>Send</button><button type="button" className="btn-ghost" onClick={() => { setTurns([]); conv.current = null; }}>Reset</button></form>
    </div>
  );
}
