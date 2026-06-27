# v0.18.0 / v0.19.0 Release Notes

## v0.19.0

**Phase D goes default-on.** The previously opt-in `preferLowLatencyRoutes`
feature flag now defaults to `true` for both fresh installs and v0.18 → v0.19
state migrations. Control messages walk the sorted `networkRoutes` list, try
each entry, and fall back to `peer.address` on exhaustion — no opt-in needed.

The toggle is still in **Settings → System → Advanced** ("按延迟自动选路
v0.19+ 默认开启"); flip it off to revert to v0.18 single-address behaviour
if a regression shows up.

## v0.18.0

**Phase A — 网络感知 + 开机自动启动**

- Login screen now shows the active network (Tailscale / LAN / both / none)
  plus the detected Tailscale and LAN IPs.
- Settings → System → "开机自动启动" toggle, backed by Electron
  `setLoginItemSettings({ openAtLogin, args: ['--hidden'] })`. Windows + macOS.

**Phase B — Tailscale 子网扫描 + 房主隐身 + 智能扫描入口**

- `scanRooms` now also probes the 100.x CGNAT range when the active network
  is Tailscale (or both). Peer list source: `tailscale status --json` when the
  CLI is on PATH; otherwise falls back to a /24 sweep around every 100.x
  address we own. 32 concurrent probes, 1s per-host timeout.
- Stealth rooms: a new "隐身房间" checkbox under the create-room form
  skips UDP presence broadcasting. Stealth rooms still respond to point-to-
  point probes (manual add / LAN + tailnet HTTP scans) and to direct HTTP
  `/api/presence` requests, so existing members and people with the secret
  can still reach them. The SetupScreen shows a "隐身" badge on stealth
  rooms and reminds users that joining requires the secret by hand.
- Smart scan entry: `scanRooms` picks LAN / tailnet / both based on
  `NetworkInfo.activeNetwork`. Returns `{ rooms, scanned: { lan?,
  tailnet?, tailnetSource? } }`.

**Phase C.1 — 加入房间后的信任向导**

- Right after `createHome` / `joinHome`, the App pops a modal listing every
  peer in the room that is not yet trusted, with per-device "信任" buttons
  plus a top-level "全部信任 (N)" / "稍后再决定" pair and an X to dismiss.
- Triggered by the new transient `AppStateView.postJoinTrustPromptedAt`
  field. Decision logic isolated in `src/shared/trust-wizard.ts`.

**Phase C.2 — 多入口路由排序 + 延迟测量**

- `PeerNetworkRoute.latencyMs` and `ManualPeerAddress.latencyMs` fields
  added. `probeManualPeer()` records per-probe latency in ms;
  `connectManualPeer()` persists it on the record.
- `peerNetworkRoutes()` feeds through `sortRoutesByLatency` (online first,
  then by latency asc, then by kind priority tailnet > lan > manual).
- Renderer `routeLabel` surfaces `· N ms` in the route badge.

**Phase D — 按延迟自动选路 (off by default in v0.18.0, on by default in v0.19.0)**

- New `pickControlRoute(peer)` pure helper. Sorts the peer's `networkRoutes`
  and returns the best one, falling back to `peer.address` if the list is
  missing.
- `sendControl()` refactored: extracted `sendControlOnRoute(...)` that opens
  a single attempt and resolves with a route-timeout / route-error. When
  `state.preferLowLatencyRoutes` is true, we walk the sorted route list, dedup
  by host:port, fall through to `peer.address` as the last entry, and stop
  at the first success.

**Issue 2 — lch CLI 加 PATH**

- `package.json` `asarUnpack` now includes `scripts/lch.js` and `scripts/lch.cmd`,
  so they end up at `resources/app.asar.unpacked/scripts/` inside the asar
  bundle and are reachable by Node without an asar-aware resolver.
- Main process: new `getLchOnPath()` / `setLchOnPath(enabled)` helpers that
  read / write
  `HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\lch.exe` via `reg
  query` / `reg add` / `reg delete`. App Paths is consulted by cmd.exe /
  PowerShell before PATH, so writing here makes `lch` work from any new
  shell the user opens.
- Settings → System → "lch 命令行 (CLI)" card with a toggle.

**Tests**: 68/68 unit tests pass. Typecheck + build clean.

## Download

| File | Notes |
|---|---|
| `Lan-Control-Hub-0.19.0-win-x64-portable.exe` | Windows portable, no install |
| `Lan-Control-Hub-0.19.0-win-x64-setup.exe`     | Windows NSIS installer |
| `Lan-Control-Hub-0.19.0-mac-x64.zip`            | macOS Intel (build on Mac) |
| `Lan-Control-Hub-0.19.0-mac-arm64.zip`          | macOS Apple Silicon (build on Mac) |
| `SHA256SUMS.txt`                                | SHA-256 sums |

`v0.18.0` artifacts have the same Phase A-D + Issue 2 features but ship with
`preferLowLatencyRoutes` off by default. Upgrade to `v0.19.0` if you want
auto-route on without clicking the toggle.

## Upgrade notes

- `state.json` migrates cleanly. Legacy states missing the
  `preferLowLatencyRoutes` field get migrated to `true` on v0.19 load (and
  stay `false` on v0.18).
- `lch` App Paths is opt-in: install the new version, open Settings → System
  → "lch 命令行", click "添加 lch 到命令".
- "开机自动启动" is opt-in too; if you used the previous Run-key hack,
  enable the in-App toggle and remove the manual entry.

## Known limitations

- macOS packages require building on macOS hardware; the GitHub workflow for
  that isn't wired up yet. Windows is the only platform we ship binaries for
  today.
- The Chinese Windows locale can still mis-decode UTF-8 paths in older
  PowerShell sessions; v0.18.0+ uses UTF-8 BOM for any .ps1 wrapper scripts
  we ship, so this should no longer trigger for newly generated files.