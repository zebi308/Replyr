/** Paragraph-aware chunking with overlap. Pure function (unit tested). */
export function cleanText(raw: string): string {
  return raw.replace(/\r/g, '').replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function chunkText(raw: string, size = 1000, overlap = 150): string[] {
  const text = cleanText(raw);
  if (!text) return [];
  const paras = text.split(/\n\n+/).flatMap((p) => (p.length > size ? splitLong(p, size) : [p]));
  const chunks: string[] = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > size) {
      chunks.push(cur);
      cur = cur.slice(Math.max(0, cur.length - overlap)).replace(/^\S*\s/, '') + '\n\n' + p;
    } else cur = cur ? cur + '\n\n' + p : p;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks.map((c) => c.trim()).filter(Boolean);
}

function splitLong(p: string, size: number): string[] {
  const out: string[] = [];
  const sentences = p.split(/(?<=[.!?])\s+/);
  let cur = '';
  for (const s of sentences) {
    if (s.length > size) { if (cur) out.push(cur); for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size)); cur = ''; continue; }
    if (cur && cur.length + s.length + 1 > size) { out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
  }
  if (cur) out.push(cur);
  return out;
}
