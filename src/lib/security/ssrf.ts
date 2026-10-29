import dns from 'dns/promises';
import net from 'net';

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const l = ip.toLowerCase();
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.');
}

/** Throws if the URL is not public http(s). Used before fetching customer-supplied URLs. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http(s) URLs are allowed');
  if (u.username || u.password) throw new Error('URLs with credentials are not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('URL resolves to a private address');
  return u;
}
