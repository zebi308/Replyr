import * as cheerio from 'cheerio';
import { assertPublicUrl } from '@/lib/security/ssrf';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_EXT = ['pdf', 'txt', 'md', 'docx'];

export async function extractFile(name: string, buf: Buffer): Promise<string> {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXT.includes(ext)) throw new Error(`Unsupported file type .${ext}. Use PDF, TXT, MD or DOCX.`);
  if (buf.length > MAX_FILE_BYTES) throw new Error('File is larger than 10 MB');
  if (ext === 'pdf') {
    if (buf.slice(0, 5).toString() !== '%PDF-') throw new Error('File is not a valid PDF');
    const pdf = (await import('pdf-parse/lib/pdf-parse.js' as string)).default as (b: Buffer) => Promise<{ text: string }>;
    return (await pdf(buf)).text;
  }
  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    return (await mammoth.extractRawText({ buffer: buf })).value;
  }
  return buf.toString('utf8');
}

async function fetchHtml(url: string): Promise<string> {
  const u = await assertPublicUrl(url);
  const res = await fetch(u, { headers: { 'user-agent': 'ReplyrBot/1.0' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!res.ok) throw new Error(`Could not fetch ${u.href} (${res.status})`);
  const text = await res.text();
  return text.slice(0, 3_000_000);
}

export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script,style,noscript,nav,footer,header,svg,iframe,form').remove();
  const title = $('title').first().text().trim();
  const body = ($('main').length ? $('main') : $('body')).text();
  return (title ? title + '\n\n' : '') + body;
}

export async function extractUrl(url: string): Promise<string> {
  return htmlToText(await fetchHtml(url));
}

/** Expand a sitemap.xml into up to `limit` page URLs (same host only), then extract each page. */
export async function extractSitemap(url: string, limit = 30): Promise<string> {
  const xml = await fetchHtml(url);
  const host = new URL(url).hostname;
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]).filter((l) => { try { return new URL(l).hostname === host && !l.endsWith('.xml'); } catch { return false; } }).slice(0, limit);
  if (!locs.length) throw new Error('No page URLs found in sitemap');
  const parts: string[] = [];
  for (const l of locs) { try { parts.push(`# ${l}\n${await extractUrl(l)}`); } catch { /* skip unreachable pages */ } }
  if (!parts.length) throw new Error('None of the sitemap pages could be fetched');
  return parts.join('\n\n');
}
