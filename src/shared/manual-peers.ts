// Helpers for the manual peer address list. Pure functions so they can be
// unit-tested without booting Electron.

export type ManualPeerRecord = {
  address: string;
  host?: string;
  port?: number;
  label?: string;
  status?: string;
  lastCheckedAt?: number;
  lastSeenAt?: number;
  lastError?: string;
  peerId?: string;
  peerName?: string;
};

export type ManualPeerProbeFulfilled = {
  packet?: { device?: { id?: string; name?: string } };
};

export function classifyManualPeerError(message: string): 'home-mismatch' | 'self' | 'offline' {
  if (message.includes('家庭网络')) return 'home-mismatch';
  if (message.includes('本机')) return 'self';
  return 'offline';
}

function reasonMessage(reason: unknown): string {
  if (reason && typeof reason === 'object' && 'message' in reason && typeof (reason as { message: unknown }).message === 'string') {
    return (reason as { message: string }).message;
  }
  return String(reason);
}

/**
 * Apply a batch of manual peer probe results back to the in-memory records.
 *
 * The original implementation indexed into `state.manualPeerAddresses`
 * directly after an `await`, so any concurrent mutation (such as
 * `removeManualPeer` running while probes are in flight) could shift the
 * array and crash the refresh with
 *   `TypeError: Cannot set properties of undefined (setting 'lastCheckedAt')`.
 *
 * We snapshot the input array up front and operate on the snapshot, so
 * concurrent splices only cause a graceful skip for the affected slot —
 * never a crash.
 */
export function applyManualPeerProbeResults<T extends ManualPeerRecord>(
  records: T[],
  results: Array<PromiseSettledResult<unknown>>
): T[] {
  const snapshot = records.slice();
  results.forEach((result, index) => {
    const record = snapshot[index];
    if (!record) return;
    record.lastCheckedAt = Date.now();
    if (result.status === 'fulfilled') {
      const value = result.value as ManualPeerProbeFulfilled;
      record.status = 'online';
      record.lastSeenAt = Date.now();
      record.lastError = undefined;
      record.peerId = value?.packet?.device?.id;
      record.peerName = value?.packet?.device?.name;
    } else {
      const message = reasonMessage((result as PromiseRejectedResult).reason);
      record.status = classifyManualPeerError(message);
      record.lastError = message;
    }
  });
  return snapshot;
}