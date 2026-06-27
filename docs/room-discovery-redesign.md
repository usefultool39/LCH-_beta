# 房间发现与信任流程 — 设计路线图

> 状态：部分落地（v0.16.1），其余进入下一阶段路线图。
> 目标：让「有时 Tailscale、有时局域网」的实际使用场景下，房间发现 / 加入 / 信任三个动作一次就懂。

---

## 用户原话

> 我现在有一些问题，就是我有时候用 tailscale 嘛，然后有时候用局域网，有时候是不同的。
>
> 我在想，这个客户端 lch.exe 应该能识别我现在是在用什么：
> - 如果我开了 Tailscale，就**只**识别 Tailscale 的
> - 如果没开，就是本地局域网的
>
> 在点开登录界面扫描的时候，就应该是扫描 Tailscale 或者本地局域网是否已经存在房间。
>
> 如果有，可以选择加入房间，需要输入密码。
> （本地第一台设备选择创建房间，设定密码。）
>
> 然后其他设备发现房间，可以选择加入（最开始的房间房主也可以选择隐身）。
>
> 然后加入之后，可以选择是否信任房间里已经存在的设备（包括房主）。有一个信任的过程。
> 每一台设备都应该可以自己主动选择是否信任房间里其他设备（也有自动信任按钮）。

---

## 已落地（v0.16.1）

### 1. 登录界面显示当前网络

SetupScreen 顶部加了网络状态条：
- `当前网络：Tailscale`（仅 100.x 可用）
- `当前网络：局域网`（仅 192.168/10.x 可用）
- `当前网络：Tailscale + 局域网`（两个都在）
- `当前网络：未连接`

并把可用 IP 显式列出（Tailscale IP 和局域网 IP 分开展示）。

实现：`os.networkInterfaces()` + `isTailnetAddress()`，结果写到 `NetworkInfo.activeNetwork / lanAddresses / tailnetAddresses`。

### 2. 开机自动启动

设置 → 系统 → 开机自动启动。
Tailscale 自启和 LCH 自启独立，不冲突。

详见 [docs/开机自动启动.md](开机自动启动.md)。

---

## 路线图（下一阶段）

### A. 智能扫描：按当前网络选择扫描范围

**目标**：当 `activeNetwork === 'tailnet'` 时只扫 Tailscale 子网；当 `'lan'` 时只扫局域网。

当前实现：`scanRooms()` 走 UDP 广播（`udp4`）只能覆盖同子网 LAN。要支持 Tailscale 子网扫描，需要新加：

#### A.1 Tailscale 子网扫描

Tailscale 给每台机器一个 100.x IP，整个 tailnet 共享这个前缀。要扫到其他房间，需要主动探测：

1. 通过 `tailscale status --json`（如果 CLI 在 PATH）或读 Tailscale 本地 socket（`/var/run/tailscale/tailscaled.sock` / Windows named pipe）拿到当前 tailnet 的所有节点 IP。
2. 对每个 100.x IP 在 `:46882` 端口发 HTTP `GET /api/discover` 或 UDP discovery probe。
3. 响应方回 `DiscoveryPacket`，记录到 `nearbyRooms`。
4. 加超时和并发限制（建议 50 并发，每个 1s 超时）。

边界：
- **性能**：tailnet 通常 < 100 节点，一次扫描 ~2s 可接受。
- **隐私**：扫描者要让对方知道「我在找你」，被扫方应只回 homeId 摘要（不暴露 homeName），避免未授权设备枚举房间名。
- **隐身**：见 B。

#### A.2 UI 切换

登录界面把扫描按钮拆成两个：
- **扫描局域网**（仅 LAN 模式时可用）
- **扫描 Tailscale**（仅 tailnet 模式时可用）

或保持一个按钮但扫描范围 = `activeNetwork`（当前最自然的选择）。

### B. 房主隐身模式

**目标**：第一台设备创房间时，可以勾选「隐身 — 不广播房间信息」。

实现要点：
- 在 `HomeInfo` 加 `stealth: boolean` 字段，state migration 兼容。
- `broadcastPresence()` 周期内不发 discovery packet（stealth = true 时）。
- stealth 房间**仍然**响应点对点探测（用于已加入设备的网络入口同步），但不主动广播。
- stealth 房间扫描到的设备要加入，必须**手动**输入房间密钥（不能通过扫描列表点选）。
- UI：创房间表单加 checkbox；房间卡片显示「隐身」徽章。

副作用：
- 不影响已加入设备的持续连接。
- 不影响 CLI / Local API（操作通过 homeId，不靠广播）。

### C. 信任流程细化

**目标**：加入房间后，明确的「信任选择」步骤，而不是被动加信任。

当前：默认所有 trusted，新增设备按 `autoTrustDevices` 决定自动/手动。

提议：
- 加入房间后弹「**信任本房间设备**」向导：
  - 列出房间内所有设备（含房主），每台一个「信任 / 跳过」按钮。
  - 顶部一个「全部信任」按钮（等价于 `autoTrustDevices` 的一次性版本）。
  - 也提供「稍后再决定」，先进入主界面，未信任设备显示为「待信任」。
- 主界面工作台把「待信任」状态单独高亮（已是，离散化）。
- 已信任列表允许**单台撤销**（已是）。
- 增加一个「信任摘要」面板，看当前每台设备的「谁信谁」矩阵。

实现：
- 复用 `state.trustedDevices`、`state.blockedDevices`、`state.devicePreferences`，无需新结构。
- renderer 新增 `TrustOnboardingDialog` 组件，在 `joinHome()` 成功后弹一次。

### D. 跨网路由优先

**目标**：Tailscale 在的时候优先用 Tailscale，LAN 失败时回退。

当前：`routeBadges` 已经在 UI 上展示所有入口，但**实际连接**只走一个地址。要做优先：

- 客户端维护 `peer.routes`（多入口），按 `kind` 排序：`tailnet > lan > manual`。
- 探测每个入口，握手成功的放到 active list。
- 之后所有控制消息只走 active list 里延迟最低的一个。

---

## 不打算做的事

- 公网直连：明确不做，参见 [docs/外网访问推荐配置.md](外网访问推荐配置.md)。
- P2P 跨 NAT 的非 Tailscale / ZeroTier / WireGuard 方案：保持现状。
- 自动「帮我加信任」跨设备的隐式信任图：信任永远是显式的，避免用户被 silent trust 攻击。

---

## 优先级建议

| 优先级 | 项目 | 工作量 |
|---|---|---|
| P0 | A.1 Tailscale 子网扫描 | ~2-3 天（含测试） |
| P0 | B 隐身模式 | ~1 天 |
| P1 | C 信任向导 | ~1-2 天 |
| P1 | D 跨网路由优先 | ~3-4 天（含探测重试） |

P0 一起发车，下个 minor 版本（v0.17.0）落地。

---

## 给贡献者的小贴士

- `src/shared/protocol.ts` 是协议单一来源（IPC/REST/renderer 都从这里读）。
- 加新网络入口类型时先在 `NetworkInfo` / `PeerInfo.networkRoutes` 扩展，再回头改 main / preload / renderer / global.d.ts。
- 隐身模式要在文档明确说明「不广播≠ 隐身 — 已加入设备仍可继续通信」。
- 信任流程改动先想好 matrix 视图（who trusts whom），别只改单边。