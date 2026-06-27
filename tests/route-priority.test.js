const assert = require('node:assert/strict');
const test = require('node:test');
const { pickControlRoute, pickPrimaryRoute, sortRoutesByLatency } = require('../dist/shared/route-priority');

test('sortRoutesByLatency prefers online routes over offline ones', () => {
  const input = [
    { kind: 'lan', status: 'offline', latencyMs: 10 },
    { kind: 'lan', status: 'online', latencyMs: 50 }
  ];
  const sorted = sortRoutesByLatency(input);
  assert.equal(sorted[0].status, 'online');
  assert.equal(sorted[1].status, 'offline');
});

test('sortRoutesByLatency orders by latency when both are online', () => {
  const input = [
    { kind: 'lan', status: 'online', latencyMs: 80 },
    { kind: 'tailnet', status: 'online', latencyMs: 20 },
    { kind: 'manual', status: 'online', latencyMs: 50 }
  ];
  const sorted = sortRoutesByLatency(input);
  assert.deepEqual(sorted.map((r) => r.latencyMs), [20, 50, 80]);
});

test('sortRoutesByLatency keeps measured routes ahead of unmeasured', () => {
  const input = [
    { kind: 'lan', status: 'online' },
    { kind: 'tailnet', status: 'online', latencyMs: 5 }
  ];
  const sorted = sortRoutesByLatency(input);
  assert.equal(sorted[0].latencyMs, 5);
  assert.equal(typeof sorted[1].latencyMs, 'undefined');
});

test('sortRoutesByLatency falls back to kind priority when no latency info', () => {
  const input = [
    { kind: 'manual', status: 'online' },
    { kind: 'lan', status: 'online' },
    { kind: 'tailnet', status: 'online' }
  ];
  const sorted = sortRoutesByLatency(input);
  assert.deepEqual(sorted.map((r) => r.kind), ['tailnet', 'lan', 'manual']);
});

test('sortRoutesByLatency does not mutate input array', () => {
  const input = [
    { kind: 'lan', status: 'online', latencyMs: 80 },
    { kind: 'tailnet', status: 'online', latencyMs: 20 }
  ];
  const snapshot = JSON.stringify(input);
  sortRoutesByLatency(input);
  assert.equal(JSON.stringify(input), snapshot);
});

test('pickPrimaryRoute returns the best route after sorting', () => {
  const primary = pickPrimaryRoute([
    { kind: 'lan', status: 'online', latencyMs: 30 },
    { kind: 'tailnet', status: 'online', latencyMs: 5 },
    { kind: 'manual', status: 'offline', latencyMs: 100 }
  ]);
  assert.ok(primary);
  assert.equal(primary.kind, 'tailnet');
  assert.equal(primary.latencyMs, 5);
});

test('pickPrimaryRoute returns null on empty input', () => {
  assert.equal(pickPrimaryRoute([]), null);
});

test('pickControlRoute prefers the best sorted route over peer.address', () => {
  const peer = {
    address: '192.168.1.5',
    controlPort: 46881,
    networkRoutes: [
      { kind: 'lan', host: '192.168.1.5', controlPort: 46881, webPort: 46882, status: 'online', latencyMs: 80, source: 'discovery' },
      { kind: 'tailnet', host: '100.64.1.5', controlPort: 46881, webPort: 46882, status: 'online', latencyMs: 12, source: 'discovery' }
    ]
  };
  const target = pickControlRoute(peer);
  assert.equal(target.host, '100.64.1.5');
  assert.equal(target.port, 46881);
  assert.equal(target.kind, 'tailnet');
  assert.equal(target.source, 'sorted-route');
  assert.equal(target.latencyMs, 12);
});

test('pickControlRoute falls back to peer.address when networkRoutes is empty', () => {
  const peer = { address: '100.64.1.5', controlPort: 46881, networkRoutes: [] };
  const target = pickControlRoute(peer);
  assert.equal(target.host, '100.64.1.5');
  assert.equal(target.port, 46881);
  assert.equal(target.kind, 'tailnet');
  assert.equal(target.source, 'peer-fallback');
});

test('pickControlRoute falls back when networkRoutes is missing', () => {
  const peer = { address: '192.168.1.5', controlPort: 46881 };
  const target = pickControlRoute(peer);
  assert.equal(target.host, '192.168.1.5');
  assert.equal(target.kind, 'lan');
  assert.equal(target.source, 'peer-fallback');
});

test('pickControlRoute uses webPort when controlPort missing on a route', () => {
  const peer = {
    address: '192.168.1.5',
    controlPort: 46881,
    networkRoutes: [
      { kind: 'manual', host: '100.64.9.9', webPort: 46882, status: 'online', latencyMs: 5, source: 'manual' }
    ]
  };
  const target = pickControlRoute(peer);
  assert.equal(target.host, '100.64.9.9');
  assert.equal(target.port, 46882);
  assert.equal(target.kind, 'manual');
});

test('pickControlRoute skips routes with neither port set', () => {
  const peer = {
    address: '192.168.1.5',
    controlPort: 46881,
    networkRoutes: [
      { kind: 'lan', host: '0.0.0.0', status: 'offline' },
      { kind: 'lan', host: '192.168.1.5', controlPort: 46881, status: 'online', latencyMs: 5 }
    ]
  };
  const target = pickControlRoute(peer);
  assert.equal(target.host, '192.168.1.5');
  assert.equal(target.source, 'sorted-route');
});

test('pickControlRoute infers tailnet kind from 100.x addresses', () => {
  const peer = {
    address: '100.64.7.7',
    controlPort: 46881,
    networkRoutes: []
  };
  const target = pickControlRoute(peer);
  assert.equal(target.kind, 'tailnet');
});