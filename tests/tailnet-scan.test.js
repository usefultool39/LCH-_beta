const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isStealthHome,
  isTailnetAddress,
  tailnetHostsFromLocalAddresses
} = require('../dist/shared/tailnet-scan');

test('isTailnetAddress matches Tailscale CGNAT and IPv6 ULA prefixes', () => {
  assert.equal(isTailnetAddress('100.64.1.2'), true);
  assert.equal(isTailnetAddress('100.127.255.254'), true);
  assert.equal(isTailnetAddress('fd7a:115c:a1e0::1'), true);
  assert.equal(isTailnetAddress('192.168.1.5'), false);
  assert.equal(isTailnetAddress('10.0.0.1'), false);
  assert.equal(isTailnetAddress(''), false);
});

test('tailnetHostsFromLocalAddresses returns the /24 sweep minus self', () => {
  const hosts = tailnetHostsFromLocalAddresses(['100.64.1.5']);
  assert.equal(hosts.length, 253, 'expected 253 host addresses in the /24 (excluding self .5)');
  assert.equal(hosts.includes('100.64.1.5'), false, 'self must be excluded');
  assert.equal(hosts.includes('100.64.1.0'), false, 'network address excluded');
  assert.equal(hosts.includes('100.64.1.255'), false, 'broadcast address excluded');
  assert.equal(hosts.includes('100.64.1.1'), true);
  assert.equal(hosts.includes('100.64.1.254'), true);
});

test('tailnetHostsFromLocalAddresses skips non-tailnet addresses and empty input', () => {
  assert.deepEqual(tailnetHostsFromLocalAddresses([]), []);
  assert.deepEqual(tailnetHostsFromLocalAddresses(['192.168.1.5', '10.0.0.2']), []);
});

test('tailnetHostsFromLocalAddresses handles multiple tailnet addresses', () => {
  const hosts = tailnetHostsFromLocalAddresses(['100.64.1.5', '100.64.2.7']);
  assert.equal(hosts.length, 506, 'two /24s minus two self addresses');
  assert.equal(hosts.includes('100.64.1.5'), false);
  assert.equal(hosts.includes('100.64.2.7'), false);
  assert.equal(hosts.includes('100.64.1.100'), true);
  assert.equal(hosts.includes('100.64.2.100'), true);
});

test('isStealthHome is true only when stealth flag is explicitly set', () => {
  assert.equal(isStealthHome({ stealth: true }), true);
  assert.equal(isStealthHome({ stealth: false }), false);
  assert.equal(isStealthHome({}), false);
  assert.equal(isStealthHome(null), false);
  assert.equal(isStealthHome(undefined), false);
});