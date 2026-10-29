/** Domain allowlist check. Empty list = any origin allowed. */
export function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (!allowed.length) return true;
  if (!origin) return false;
  let host: string;
  try { host = new URL(origin).hostname.toLowerCase(); } catch { return false; }
  return allowed.some((d) => {
    const dom = d.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^\*\./, '');
    return host === dom || host.endsWith('.' + dom);
  });
}
export function corsHeaders(origin: string | null): Record<string, string> {
  return { 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Vary': 'Origin' };
}
