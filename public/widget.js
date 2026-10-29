/*! Replyr chat widget. Embed: <script src="https://YOUR-APP/widget.js" data-bot-id="bot_xxx" defer></script> */
(function () {
  var el = document.currentScript || document.querySelector('script[data-bot-id]');
  if (!el) return;
  var botId = el.getAttribute('data-bot-id');
  var api = new URL(el.src).origin;
  if (!botId || window.__replyrLoaded) return;
  window.__replyrLoaded = true;

  var sid; try { sid = localStorage.getItem('replyr_sid'); if (!sid) { sid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); localStorage.setItem('replyr_sid', sid); } } catch (e) { sid = 'anon-' + Math.random().toString(36).slice(2) + Date.now(); }
  var convId = null, busy = false, cfg = null;

  function h(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) { if (k === 'text') n.textContent = attrs[k]; else if (k === 'class') n.className = attrs[k]; else n.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  // Render text safely: escape everything, then linkify http(s) URLs only.
  function render(text, parent) {
    var re = /(https?:\/\/[^\s<>"')]+)/g, last = 0, m;
    while ((m = re.exec(text))) {
      parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = h('a', { href: m[1], target: '_blank', rel: 'noopener noreferrer nofollow', text: m[1] }); parent.appendChild(a); last = m.index + m[1].length;
    }
    parent.appendChild(document.createTextNode(text.slice(last)));
  }

  fetch(api + '/api/widget/' + encodeURIComponent(botId)).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (c) { cfg = c; mount(); }).catch(function () { /* widget stays hidden if bot is unpublished or domain not allowed */ });

  function mount() {
    var host = h('div'); host.style.cssText = 'all:initial;position:fixed;z-index:2147483000;bottom:0;' + (cfg.position === 'left' ? 'left:0' : 'right:0');
    var root = host.attachShadow({ mode: 'open' });
    var color = /^#[0-9a-f]{6}$/i.test(cfg.color) ? cfg.color : '#0F766E';
    var css = h('style', { text: [
      ':host{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}*{box-sizing:border-box}',
      '.btn{position:fixed;bottom:20px;' + (cfg.position === 'left' ? 'left' : 'right') + ':20px;width:56px;height:56px;border-radius:50%;border:0;background:' + color + ';color:#fff;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}',
      '.btn:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #F2A516;outline-offset:2px}',
      '.win{position:fixed;bottom:88px;' + (cfg.position === 'left' ? 'left' : 'right') + ':20px;width:370px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 110px);background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.28);display:none;flex-direction:column;overflow:hidden;color:#0B1B2B}',
      '.win.open{display:flex}.hd{background:' + color + ';color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;font-weight:600}',
      '.hd img{width:28px;height:28px;border-radius:50%;object-fit:cover}.hd .x{margin-left:auto;background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}',
      '.msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#F2F5F7}',
      '.m{max-width:84%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}.m a{color:inherit;text-decoration:underline}',
      '.u{align-self:flex-end;background:' + color + ';color:#fff;border-bottom-right-radius:3px}.b{align-self:flex-start;background:#fff;border:1px solid #DDE3E8;border-bottom-left-radius:3px}.e{align-self:center;background:#FEF2F2;color:#991B1B;font-size:13px}',
      '.card{display:flex;gap:10px;background:#fff;border:1px solid #DDE3E8;border-radius:10px;padding:8px;text-decoration:none;color:inherit;align-self:flex-start;max-width:90%}.card img{width:56px;height:56px;object-fit:cover;border-radius:6px}.card b{font-size:13px;display:block}.card span{font-size:12px;color:#516070}',
      '.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{border:1px solid ' + color + ';color:' + color + ';background:#fff;border-radius:999px;padding:5px 10px;font-size:13px;cursor:pointer}',
      '.esc{align-self:flex-start;background:#FFF8E6;border:1px solid #F2A516;border-radius:10px;padding:9px 12px;font-size:13px}',
      'form{display:flex;gap:8px;padding:10px;border-top:1px solid #DDE3E8;background:#fff}input{flex:1;border:1px solid #DDE3E8;border-radius:8px;padding:10px;font-size:14px;font-family:inherit}',
      'form button{background:' + color + ';color:#fff;border:0;border-radius:8px;padding:0 14px;font-weight:600;cursor:pointer}form button:disabled{opacity:.5}',
      '.dots{display:inline-flex;gap:3px}.dots i{width:6px;height:6px;border-radius:50%;background:#8896a5;animation:p 1s infinite}.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}@keyframes p{0%,80%,100%{opacity:.3}40%{opacity:1}}',
      '@media(prefers-reduced-motion:reduce){.dots i{animation:none}}',
      '@media(max-width:480px){.win{inset:0;width:100%;max-width:none;height:100%;max-height:none;border-radius:0}}'
    ].join('') });

    var msgs = h('div', { class: 'msgs', role: 'log', 'aria-live': 'polite' });
    var input = h('input', { type: 'text', placeholder: 'Type your message…', maxlength: '2000', 'aria-label': 'Message' });
    var send = h('button', { type: 'submit', text: 'Send' });
    var form = h('form', {}, [input, send]);
    var closeBtn = h('button', { class: 'x', 'aria-label': 'Close chat', text: '×' });
    var header = h('div', { class: 'hd' }, [cfg.avatar && /^https:\/\//.test(cfg.avatar) ? h('img', { src: cfg.avatar, alt: '' }) : null, h('span', { text: cfg.title }), closeBtn]);
    var win = h('div', { class: 'win', role: 'dialog', 'aria-label': cfg.title }, [header, msgs, form]);
    var launcher = h('button', { class: 'btn', 'aria-label': 'Open chat' });
    launcher.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
    root.appendChild(css); root.appendChild(win); root.appendChild(launcher); document.body.appendChild(host);

    function add(cls, text) { var d = h('div', { class: 'm ' + cls }); render(text, d); msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d; }
    var chips;
    function showChips() {
      if (!cfg.suggested || !cfg.suggested.length) return;
      chips = h('div', { class: 'chips' }); cfg.suggested.forEach(function (q) { var c = h('button', { class: 'chip', type: 'button', text: q }); c.onclick = function () { ask(q); }; chips.appendChild(c); }); msgs.appendChild(chips);
    }
    add('b', cfg.welcome); showChips();

    function toggle(open) { win.classList.toggle('open', open); if (open) setTimeout(function () { input.focus(); }, 50); }
    launcher.onclick = function () { toggle(!win.classList.contains('open')); };
    closeBtn.onclick = function () { toggle(false); launcher.focus(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(false); });
    form.onsubmit = function (e) { e.preventDefault(); var v = input.value.trim(); if (v) ask(v); };

    function ask(text) {
      if (busy) return; busy = true; send.disabled = true; input.value = ''; if (chips) { chips.remove(); chips = null; }
      add('u', text);
      var t = h('div', { class: 'm b' }, [h('span', { class: 'dots' }, [h('i'), h('i'), h('i')])]); msgs.appendChild(t); msgs.scrollTop = msgs.scrollHeight;
      fetch(api + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ botId: botId, sessionId: sid, message: text, conversationId: convId }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          t.remove();
          if (!res.ok) { add('e', res.j.error || 'Something went wrong. Please try again.'); return; }
          convId = res.j.conversationId; add('b', res.j.reply);
          (res.j.products || []).forEach(function (p) {
            if (!/^https?:\/\//.test(p.url)) return;
            var c = h('a', { class: 'card', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, [
              p.image && /^https:\/\//.test(p.image) ? h('img', { src: p.image, alt: '' }) : null,
              h('div', {}, [h('b', { text: p.title }), h('span', { text: (p.price || '') + (p.available ? '' : ' · Out of stock') })])]);
            msgs.appendChild(c);
          });
          var e = res.j.escalation;
          if (e && (e.email || e.url)) {
            var box = h('div', { class: 'esc' }); box.appendChild(document.createTextNode(e.message + ' '));
            if (e.email) { var m = h('a', { href: 'mailto:' + e.email, text: e.email }); box.appendChild(m); }
            if (e.url && /^https?:\/\//.test(e.url)) { box.appendChild(document.createTextNode(' ')); box.appendChild(h('a', { href: e.url, target: '_blank', rel: 'noopener noreferrer', text: 'Contact page' })); }
            msgs.appendChild(box);
          }
          msgs.scrollTop = msgs.scrollHeight;
        })
        .catch(function () { t.remove(); add('e', 'Connection problem. Please check your internet and try again.'); })
        .then(function () { busy = false; send.disabled = false; input.focus(); });
    }
  }
})();
