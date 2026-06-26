const assert = require('node:assert/strict');
const test = require('node:test');
const {
  applyManualPeerProbeResults,
  classifyManualPeerError
} = require('../dist/shared/manual-peers');

test('classifyManualPeerError maps known failure modes', () => {
  assert.equal(classifyManualPeerError('远程设备不在当前家庭网络'), 'home-mismatch');
  assert.equal(classifyManualPeerError('不能添加本机地址'), 'self');
  assert.equal(classifyManualPeerError('connect ECONNREFUSED 100.64.1.2:46882'), 'offline');
  assert.equal(classifyManualPeerError(''), 'offline');
});

test('applyManualPeerProbeResults updates records from fulfilled probe results', () => {
  const records = [
    { address: '100.64.1.2', status: 'unknown' },
    { address: '100.64.1.3', status: 'unknown' }
  ];
  const results = [
    { status: 'fulfilled', value: { packet: { device: { id: 'peer-A', name: 'L001' } } } },
    { status: 'fulfilled', value: { packet: { device: { id: 'peer-B', name: 'L002' } } } }
  ];
  applyManualPeerProbeResults(records, results);
  assert.equal(records[0].status, 'online');
  assert.equal(records[0].peerId, 'peer-A');
  assert.equal(records[0].peerName, 'L001');
  assert.ok(records[0].lastSeenAt > 0);
  assert.ok(records[0].lastCheckedAt > 0);
  assert.equal(records[0].lastError, undefined);
  assert.equal(records[1].status, 'online');
  assert.equal(records[1].peerId, 'peer-B');
});

test('applyManualPeerProbeResults classifies rejected reasons into status states', () => {
  const records = [
    { address: '100.64.1.2', status: 'unknown' },
    { address: '100.64.1.3', status: 'unknown' },
    { address: '100.64.1.4', status: 'unknown' }
  ];
  const results = [
    { status: 'rejected', reason: new Error('远程设备不在当前家庭网络') },
    { status: 'rejected', reason: new Error('不能添加本机地址') },
    { status: 'rejected', reason: new Error('connect ECONNREFUSED') }
  ];
  applyManualPeerProbeResults(records, results);
  assert.equal(records[0].status, 'home-mismatch');
  assert.equal(records[1].status, 'self');
  assert.equal(records[2].status, 'offline');
  assert.match(records[2].lastError, /ECONNREFUSED/);
});

test('applyManualPeerProbeResults survives concurrent removal mid-refresh (regression)', () => {
  // Reproduces the original bug: removeManualPeer mutates the array while
  // refreshManualPeers' await is pending. Without snapshotting the array,
  // results.forEach hits `undefined` and throws
  //   `Cannot set properties of undefined (setting 'lastCheckedAt')`.
  // The fix snapshots before await and skips indices that no longer have
  // a live record; it does NOT try to re-align stale probe results, which
  // would require a much heavier reconcile step. We just assert no throw
  // and that the surviving record at index 0 still gets updated correctly.
  const records = [
    { address: '100.64.1.2', status: 'unknown' },
    { address: '100.64.1.3', status: 'unknown' },
    { address: '100.64.1.4', status: 'unknown' }
  ];
  const results = [
    { status: 'fulfilled', value: { packet: { device: { id: 'A', name: 'A' } } } },
    { status: 'fulfilled', value: { packet: { device: { id: 'B', name: 'B' } } } },
    { status: 'fulfilled', value: { packet: { device: { id: 'C', name: 'C' } } } }
  ];
  // Simulate concurrent removal of the middle entry before apply.
  records.splice(1, 1);
  assert.doesNotThrow(() => {
    applyManualPeerProbeResults(records, results);
  });
  assert.equal(records[0].status, 'online');
  assert.equal(records[0].peerId, 'A');
});

test('applyManualPeerProbeResults accepts non-Error rejected reasons', () => {
  const records = [{ address: '100.64.1.2', status: 'unknown' }];
  const results = [{ status: 'rejected', reason: 'plain string failure' }];
  applyManualPeerProbeResults(records, results);
  assert.equal(records[0].status, 'offline');
  assert.equal(records[0].lastError, 'plain string failure');
});

test('applyManualPeerProbeResults returns an array-level snapshot independent of later splices', () => {
  const records = [
    { address: '100.64.1.2', status: 'unknown' },
    { address: '100.64.1.3', status: 'unknown' }
  ];
  const results = [
    { status: 'fulfilled', value: { packet: { device: { id: 'X', name: 'X' } } } },
    { status: 'fulfilled', value: { packet: { device: { id: 'Y', name: 'Y' } } } }
  ];
  const snapshot = applyManualPeerProbeResults(records, results);
  assert.equal(snapshot.length, 2);
  assert.equal(snapshot[0].peerId, 'X');
  assert.equal(snapshot[1].peerId, 'Y');
  // Mutating the live records array must not affect the snapshot's length
  // or its index alignment. (Object identity is intentionally shared — the
  // snapshot's purpose is to freeze the array shape, not deep-clone.)
  records.splice(0, 1);
  assert.equal(snapshot.length, 2);
  assert.equal(records.length, 1);
});