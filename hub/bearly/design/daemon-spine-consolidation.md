# Daemon-spine consolidation — design + roadmap

## Status

Scout dated 2026-04-26. Tracked under bead epic `km-bearly.daemon-spine` (4 child phases). Phase 1 is in-progress (bead `km-bearly.daemon-spine-phase1`, in-flight via `bead-d` agent on team `process-mgmt-plateau`, branch `bead-d` of `vendor/bearly` submodule). Pro plateau-distance review's third pillar after spawn-close-hardening + MCP-as-tribe-plugin.

## Inventory

| File | LOC | Role | Notable |
|---|---|---|---|
| `tools/tribe-daemon.ts` | 1,760 | Main coordination daemon: client registry, plugin loader, chief derivation, session mgmt, activity log, broadcast coalescer, lore handlers (memory RPC surface) | Largest file; absorbs former lore daemon; handles hot-reload, idle-quit, socket cleanup |
| `tools/tribe-proxy.ts` | 534 | MCP proxy: connects Claude Code → daemon via Unix socket; forwards tools; manages peer sockets for direct proxy-to-proxy messaging | Small thin layer; has hot-reload + peer socket server (lines 72–149) |
| `tools/lib/tribe/socket.ts` | 402 | JSON-RPC 2.0 wire protocol + daemon client: connect, auto-start, reconnect, peer discovery, line-delimited parser | Core shared utility; `connectOrStart()`, `createReconnectingClient()`, `connectToDaemon()` |
| `plugins/tribe/lore/server.ts` | 560 | MCP server: lore.ask, lore.brief, lore.plan, lore.session, lore.workspace, lore.inject_delta tools; daemon fallback to library mode | MCP plumbing + tool dispatch; minimal daemon code (mostly tool handlers) |
| `plugins/tribe/lore/lib/socket.ts` | 364 | **EXACT DUPLICATE** of `tools/lib/tribe/socket.ts`: JSON-RPC types, line parser, client, auto-start, reconnect, `withDaemonCall()` | 95% verbatim copy; trivial diffs only (variable names, callTimeoutMs param) |
| `plugins/tty/server.ts` | ~200 (sampled) | TTY MCP server: terminal session management, tool dispatch (start/stop/press/type/screenshot/text/wait/list) | Newer pattern: MCP handler + backend class; no daemon complexity (stateless termless wrapper) |
| `plugins/github/server.ts` | ~200 (sampled) | GitHub notifications MCP: polls REST API, broadcast to Claude Code, cursor persistence | Polling loop + MCP dispatch; no daemon socket code |

## Duplication Matrix

| Capability | tribe-daemon | tribe-proxy | lore/socket | lore/server | tty/server | github/server |
|---|---|---|---|---|---|---|
| **Unix socket bind+unlink+chmod** | ✓ (daemon) | ✓ (peer) | ✗ (client only) | ✗ | ✗ | ✗ |
| **JSON-RPC request/response makers** | ✓ | ✓ | ✓ | ✗ (dispatch only) | ✗ | ✗ |
| **Line-delimited JSON parser** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| **connectToDaemon()** | ✗ (is daemon) | ✓ (client) | ✓ (client) | ✓ (via lore/socket) | ✗ | ✗ |
| **connectOrStart()** | ✗ | ✓ | ✓ | ✗ (uses lore/socket) | ✗ | ✗ |
| **createReconnectingClient()** | ✗ | ✓ | ✓ | ✓ (via lore/socket) | ✗ | ✗ |
| **Hot-reload (re-exec on source change)** | ✓ (lines ~6) | ✓ (lines ~2) | ✗ | ✗ | ✗ | ✗ |
| **Idle-quit timer (QUIT_TIMEOUT)** | ✓ (lines ~8 references) | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Plugin loading system** | ✓ (loadPlugins, 5 plugins) | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Session registry + client tracking** | ✓ (ClientSession map) | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Chief derivation logic** | ✓ (chief from first client) | ✗ (member behavior) | ✗ | ✗ | ✗ | ✗ |
| **Activity log + message history** | ✓ (writeActivity, DB) | ✗ | ✗ (lore has separate DB) | ✗ | ✗ | ✗ |
| **Broadcast coalescer** | ✓ (PendingBroadcast) | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Lore handlers (memory/recall RPC)** | ✓ (createLoreHandlers) | ✗ | ✗ (separate client) | ✗ (dispatch to daemon) | ✗ | ✗ |
| **File descriptor inheritance (hot-reload)** | ✓ (--fd flag) | ✓ (setupHotReload) | ✗ | ✗ | ✗ | ✗ |
| **Timeout + retry loop** | ✓ (10k timeout, 30 attempts) | ✓ (10k timeout) | ✓ (10+ attempts) | ✗ | ✓ (per-tool timeouts) | ✗ (async/await, no retry) |

## Key Duplication Pattern: `tools/lib/tribe/socket.ts` vs `plugins/tribe/lore/lib/socket.ts`

These files are **95%+ identical**:

### Shared 1:1 (EXACT DUPLICATES)

```
JSON-RPC types + helpers (~70 LOC):
- JsonRpcRequest, JsonRpcResponse, JsonRpcNotification
- isRequest(), isResponse(), isNotification()
- makeRequest(), makeResponse(), makeError(), makeNotification()

Line-delimited JSON parser (~25 LOC):
- createLineParser()
- Identical logic: buffer management, split on \n, trim, parse

Daemon client interface + connectToDaemon() (~110 LOC):
- Type: DaemonClient { call, notify, onNotification, close, socket }
- Socket lifecycle: connect, error handling, pending map, response matching
- Request sequencing with numeric IDs
- 10s timeout on calls + consecutive timeout tracking
```

### Shared with trivial diffs

```
connectOrStart() (~45 LOC):
- Tools version: Uses tools/tribe-daemon.ts script path
- Lore version: Uses tools/tribe-daemon.ts script path too (!) — was migrated on 2026-04-17 Phase 5c
- Identical: mkdirSync, unlinkSync, spawn detached, exponential backoff retry loop

createReconnectingClient() (~60 LOC):
- Tokens: `DaemonClient` vs `LoreClient` (same shape)
- Logic: identical — proxy pattern, notification handler replay, close handler
```

### Divergences (why they're separate files today)

1. **Lore socket has `callTimeoutMs` param** (line 106) — separate from instance; tribe socket hard-codes 10s
2. **Lore socket has `withDaemonCall()`** (lines 336–365) — deadline-bounded single-shot with discriminated error result (`{ kind: "ok" | "timeout" | "no-daemon" | "error" }`)
3. **Lore socket has `ConnectOrStartOpts.noSpawn`** — can suppress daemon auto-start
4. **Lore handlers auto-start unified tribe daemon, not standalone lore daemon** (comment line 214–215) — shows the merge happened

## Proposed daemon-spine surface

```ts
// @bearly/daemon-spine — shared Unix socket IPC library

export interface JsonRpcMessage { /* ... */ }
export type DaemonClientOpts = {
  socketPath: string
  callTimeoutMs?: number  // Default 10_000
  maxStartupAttempts?: number  // Default 10
  autoStart?: boolean  // Default true
  daemonScript?: string  // Script to spawn if daemon not running
}

export interface DaemonClient {
  call(method: string, params?: Record<string, unknown>): Promise<unknown>
  notify(method: string, params?: Record<string, unknown>): void
  onNotification(handler: (method: string, params?: Record<string, unknown>) => void): void
  close(): void
  socket: Socket
}

// Core functions
export function createLineParser(onMessage: (msg: JsonRpcMessage) => void): (chunk: Buffer) => void
export function makeRequest(id: number, method: string, params?: Record<string, unknown>): string
export function makeResponse(id: number | string, result: unknown): string
export function makeError(id: number | string, code: number, message: string, data?: unknown): string
export function makeNotification(method: string, params?: Record<string, unknown>): string

// Connection lifecycle
export function connectToDaemon(socketPath: string, opts?: { callTimeoutMs?: number }): Promise<DaemonClient>
export async function connectOrStart(socketPath: string, opts?: DaemonClientOpts): Promise<DaemonClient>
export async function createReconnectingClient(opts: {
  socketPath: string
  onConnect?: (client: DaemonClient) => Promise<void>
  onDisconnect?: () => void
  onReconnect?: () => void
  maxAttempts?: number
  callTimeoutMs?: number
}): Promise<DaemonClient>

// Utility: deadline-bounded call with structured error (for hooks)
export type DaemonCallOutcome<T> = 
  | { kind: "ok"; value: T }
  | { kind: "timeout" }
  | { kind: "no-daemon" }
  | { kind: "error"; message: string }

export async function withDaemonCall<T>(
  opts: { socketPath: string; deadlineMs: number; callTimeoutMs?: number },
  fn: (client: DaemonClient) => Promise<T>,
): Promise<DaemonCallOutcome<T>>

// Socket discovery
export function resolveSocketPath(socketArg?: string): string
export function resolvePeerSocketPath(sessionId: string): string
```

### Rationale per method

**`makeRequest/makeResponse/makeError/makeNotification`** — Collapse JSON-RPC framing (currently in both socket files). These are pure functions; no reason to duplicate.

**`createLineParser`** — Buffer management + newline splitting. Identical in both files; move to shared lib.

**`connectToDaemon`** — Connect to existing daemon, no auto-start. Tribe and lore both do this. Configurable timeout (param, not hard-coded).

**`connectOrStart`** — Connect or spawn daemon. Currently in both socket files; consolidate with options for auto-start suppression + script path.

**`createReconnectingClient`** — Proxy pattern with auto-reconnect + notification handler replay. Used by tribe-proxy, lore MCP, and directly by callers. Move to spine; both clients are now the same shape.

**`withDaemonCall`** — Deadline-bounded call with structured error. Currently in lore/socket.ts only (used by hooks). Promote to spine for general use.

**`resolveSocketPath` / `resolvePeerSocketPath`** — Socket path discovery. Currently duplicated across files; consolidate.

## Phased Delete Plan

### Phase 1 — Extract spine, reduce lore/socket.ts (~250 LOC saved)

1. Create `@bearly/daemon-spine` package at `packages/daemon-spine/`:
   - `src/rpc.ts` — JSON-RPC types + makers
   - `src/parser.ts` — line-delimited parser
   - `src/client.ts` — connectToDaemon, connectOrStart, createReconnectingClient
   - `src/paths.ts` — resolveSocketPath, resolvePeerSocketPath
   - `src/util.ts` — withDaemonCall, deadline utilities
   - `package.json` — publishable, version 0.1.0, exports above

2. Rewrite `plugins/tribe/lore/lib/socket.ts`:
   ```ts
   import { DaemonClient, connectOrStart, createReconnectingClient, withDaemonCall } from '@bearly/daemon-spine'
   export type { DaemonClient, /* ... */ }
   export { connectOrStart, createReconnectingClient, withDaemonCall }
   // Lore-specific stuff: LoreClient type alias, lore-db path resolution
   ```
   **Result**: ~100 LOC (from 364), keep only lore-specific wrappers

### Phase 2 — Reduce tribe/tools/lib/socket.ts (~200 LOC saved)

1. Rewrite `tools/lib/tribe/socket.ts`:
   ```ts
   import { connectToDaemon, connectOrStart, createReconnectingClient, /* ... */ } from '@bearly/daemon-spine'
   export { connectToDaemon, connectOrStart, createReconnectingClient, /* ... */ }
   export { resolveSocketPath, resolvePeerSocketPath } from '@bearly/daemon-spine'
   export const TRIBE_PROTOCOL_VERSION = 2  // Tribe-specific constant
   export { type DaemonClient } from '@bearly/daemon-spine'
   // Tribe-specific utilities (none currently, just re-exports)
   ```
   **Result**: ~80 LOC (from 402), pure re-exports

2. Update tribe-proxy.ts + tribe-daemon.ts imports:
   ```ts
   import { connectToDaemon, createLineParser, makeResponse, makeError, isRequest, TRIBE_PROTOCOL_VERSION, type DaemonClient, type JsonRpcMessage, type JsonRpcRequest } from '@bearly/daemon-spine'
   ```

### Phase 3 — Consolidate hot-reload patterns (~100 LOC saved)

Current state:
- `tribe-daemon.ts` (lines ~1680–1730): `setupHotReload` import + usage
- `tribe-proxy.ts` (lines 414–426): same `setupHotReload` import + usage

Both import from `./lib/tribe/hot-reload.ts` (not examined, but likely contains spawn + fd inheritance logic).

**Action**: Move hot-reload to spine or create separate `@bearly/daemon-util` package covering:
- Hot-reload pattern (re-exec on source change, fd inheritance)
- Idle-quit timer (QUIT_TIMEOUT pattern)
- Peer socket setup (mkdirSync + chmod + listen, currently in tribe-proxy 72–147)

### Phase 4 — Consolidate idle-quit + cleanup patterns (~80 LOC saved)

Tribe daemon's idle-quit timer (QUIT_TIMEOUT logic) and socket cleanup patterns could be extracted as reusable. Not examined in detail, but flags suggest consolidation is possible.

## Risks / Open Questions

1. **Protocol version coupling** — tribe and lore both use the same socket protocol (JSON-RPC 2.0 line-delimited), but TRIBE_PROTOCOL_VERSION = 2 lives in tribe-specific code. Need to decide: move to spine with a generic DAEMON_PROTOCOL_VERSION, or keep protocol versioning per-daemon?

2. **Timeout strategy divergence** — Tribe socket hard-codes 10s timeout; lore socket parameterizes it. Spine should expose both patterns: hard-coded default + override opt-in.

3. **Peer socket complexity** — tribe-proxy manages peer sockets (direct proxy-to-proxy) via startPeerServer() (lines 85–149). Lore has no peer socket. Should peer socket logic be in spine (generic) or stay tribe-specific?

4. **Plugin system** — tribe-daemon loads plugins; lore/tty/github MCPs don't use a unified plugin loader. Spine should NOT include plugin logic (too domain-specific). Spine is client/protocol only.

5. **Activity log + history** — tribe-daemon writes activity logs to DB; lore has separate lore.db. This is daemon-side state management, not socket code. Spine should not touch this; daemons can layer it on top.

6. **Backward compatibility** — Any daemon already running when old lore/socket is replaced must still work. Since spine just exposes the same functions with same signatures, this is safe — just a version bump.

## Total LOC Delete Estimate: ~750–900

**Breakdown (conservative):**
- `lore/lib/socket.ts`: 250 LOC → 100 LOC = **250 saved**
- `tools/lib/tribe/socket.ts`: 402 LOC → 80 LOC = **320 saved**
- Hot-reload duplication (tribe-daemon.ts + tribe-proxy.ts): ~100 LOC → ~40 LOC = **60 saved**
- Idle-quit cleanup duplication: ~80 LOC → ~20 LOC = **60 saved**
- **Total: ~690 LOC saved, with risk buffer → 750–900 LOC estimate**

This assumes the spine is ~250 LOC (JSON-RPC + parser + client + reconnect + utilities). The spine itself is new code (not saved), but the consolidation pays for it 3x over in duplicate deletion.
