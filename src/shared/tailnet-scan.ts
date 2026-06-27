// Helpers for the Tailscale subnet scan and stealth-room logic.
// Pure functions so they are easy to unit-test without spinning up Electron.

import type { HomeInfo } from './protocol';

/**
 * Returns true for any address inside the Tailscale CGNAT range (100.64.0.0/10)
 * or the equivalent IPv6 unique-local prefix.
 */
export function isTailnetAddress(host: string): boolean {
  if (!host) return false;
  return /^100\./.test(host) || /^fd7a:115c:a1e0:/i.test(host);
}

/**
 * Given the machine's own IPv4 addresses, returns the /24 sweep set of
 * tailnet peers to probe. We assume Tailscale hands out addresses inside
 * the same /24 for nearby devices, which is the common case for small
 * networks. Self-addresses are stripped.
 */
export function tailnetHostsFromLocalAddresses(
  ownAddresses: readonly string[]
): string[] {
  const tails = ownAddresses.filter(isTailnetAddress);
  if (!tails.length) return [];
  const hosts = new Set<string>();
  for (const ip of tails) {
    const parts = ip.split('.');
    if (parts.length !== 4) continue;
    const octets = parts.map((p) => Number(p));
    if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) continue;
    const base = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
    const prefix = base & 0xffffff00;
    for (let value = 1; value < 255; value += 1) {
      const v = (prefix + value) >>> 0;
      hosts.add(
        ((v >>> 24) & 0xff) + '.' +
        ((v >>> 16) & 0xff) + '.' +
        ((v >>> 8) & 0xff) + '.' +
        (v & 0xff)
      );
    }
  }
  for (const ip of tails) hosts.delete(ip);
  return [...hosts];
}

/**
 * Stealth homes do not broadcast UDP presence. This helper centralizes
 * the boolean so callers (broadcastPresence, /api/presence handler, etc.)
 * can stay consistent.
 */
export function isStealthHome(home: Pick<HomeInfo, 'stealth'> | null | undefined): boolean {
  return Boolean(home && home.stealth);
}