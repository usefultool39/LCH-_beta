const assert = require('node:assert/strict');
const test = require('node:test');
const { attachManualPeersToDevices, manualPeerAliases, matchDevice, parseBoolean, parsePointInput, splitHotkey, takeOption } = require('../scripts/lch');

test('CLI splitHotkey accepts plus and comma separators', () => {
  assert.deepEqual(splitHotkey('ctrl+shift+s'), ['ctrl', 'shift', 's']);
  assert.deepEqual(splitHotkey('ctrl, alt, delete'), ['ctrl', 'alt', 'delete']);
});

test('CLI parseBoolean handles explicit true and false values', () => {
  assert.equal(parseBoolean('yes'), true);
  assert.equal(parseBoolean('0'), false);
  assert.throws(() => parseBoolean('maybe'), /Invalid boolean/);
});

test('CLI parsePointInput distinguishes normalized and absolute coordinates', () => {
  const normalizedArgs = ['--x', '0.25', '--y', '0.75'];
  assert.deepEqual(parsePointInput(normalizedArgs), { normalizedX: 0.25, normalizedY: 0.75 });

  const absoluteArgs = ['--x', '120', '--y', '240'];
  assert.deepEqual(parsePointInput(absoluteArgs), { x: 120, y: 240 });
});

test('CLI takeOption removes consumed option and value', () => {
  const args = ['--device', 'desk', 'hostname'];
  assert.equal(takeOption(args, '--device'), 'desk');
  assert.deepEqual(args, ['hostname']);
});

test('CLI matchDevice accepts manual Tailscale peer addresses', () => {
  const device = {
    id: 'device-12345678',
    name: 'L002',
    address: '192.168.2.94',
    controlPort: 46881,
    manualPeers: [{ address: '100.120.218.47:46882', host: '100.120.218.47', label: '100.120.218.47:46882' }]
  };
  assert.equal(matchDevice(device, '100.120.218.47'), true);
  assert.equal(matchDevice(device, '100.120.218.47:46882'), true);
  assert.deepEqual(manualPeerAliases(device), ['100.120.218.47:46882', '100.120.218.47', '100.120.218.47:46882']);
});

test('CLI attachManualPeersToDevices links known peer ids only', () => {
  const devices = [{ id: 'peer-1', name: 'Desk', address: '192.168.1.10', controlPort: 46881 }];
  const enriched = attachManualPeersToDevices(devices, [
    { peerId: 'peer-1', address: '100.64.1.2:46882', host: '100.64.1.2' },
    { peerId: 'missing', address: '100.64.1.3:46882', host: '100.64.1.3' }
  ]);
  assert.equal(enriched.length, 1);
  assert.equal(enriched[0].manualPeers.length, 1);
  assert.equal(enriched[0].manualPeers[0].address, '100.64.1.2:46882');
});
