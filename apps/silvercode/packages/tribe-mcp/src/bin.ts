#!/usr/bin/env bun
/**
 * tribe-mcp stdio binary.
 *
 * Reads JSON-RPC requests from stdin, writes responses to stdout, stderr for
 * logs. Spawned per-session by the agent harness via the mcpServers spec.
 *
 * Identity is sourced from env vars:
 *   - TRIBE_SESSION_NAME — required for outbox / from-identity (default "unknown")
 *   - TRIBE_AGENT_ID    — agent label used by `scope: agent` (e.g. "claude")
 *   - TRIBE_PARENT      — parent session name used by `scope: tree`
 *   - TRIBE_SCOPE       — default scope when a tools/call doesn't include one
 *
 * Backend selection (TRIBE_BACKEND):
 *   - "jsonl" (default) — file-backed bus at TRIBE_BUS_PATH
 *     (default ~/.km/tribe-bus.jsonl + sibling tribe-state.json for chief/peers)
 *   - "daemon"          — bearly tribe over UDS. Hook only — not implemented.
 *
 * The JSONL bus gives us a cross-process shared tribe for the common
 * silvercode case where all sessions are siblings under the same silvercode
 * host, without needing a daemon. Switching to a daemon-backed adapter only
 * requires implementing TribeBackend against the UDS API.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { Readable, Writable } from "node:stream"
import {
  applyHistoryFilter,
  createTribeMcpServer,
  filterRecipientsByScope,
  type HistoryFilter,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type TribeBackend,
  type TribeMember,
  type TribeMessage,
  type TribeScope,
  TRIBE_SCOPES,
} from "./index.ts"

const sessionName = process.env.TRIBE_SESSION_NAME ?? "unknown"
const selfAgentId = process.env.TRIBE_AGENT_ID
const selfParent = process.env.TRIBE_PARENT
const defaultScope: TribeScope | undefined = isScope(process.env.TRIBE_SCOPE) ? process.env.TRIBE_SCOPE : undefined
const busPath = process.env.TRIBE_BUS_PATH ?? join(homedir(), ".km", "tribe-bus.jsonl")
const statePath = process.env.TRIBE_STATE_PATH ?? join(dirname(busPath), "tribe-state.json")
const backendKind = process.env.TRIBE_BACKEND ?? "jsonl"

function isScope(v: unknown): v is TribeScope {
  return typeof v === "string" && (TRIBE_SCOPES as readonly string[]).includes(v)
}

type PersistedState = {
  chief: string | null
  members: Record<string, TribeMember>
}

function ensureBus(): void {
  const dir = dirname(busPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  if (!existsSync(busPath)) writeFileSync(busPath, "")
  const stateDir = dirname(statePath)
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true })
  if (!existsSync(statePath)) writeFileSync(statePath, JSON.stringify({ chief: null, members: {} }))
}

function readState(): PersistedState {
  try {
    const raw = readFileSync(statePath, "utf8")
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      chief: typeof parsed.chief === "string" ? parsed.chief : null,
      members: parsed.members && typeof parsed.members === "object" ? parsed.members : {},
    }
  } catch {
    return { chief: null, members: {} }
  }
}

function writeState(state: PersistedState): void {
  writeFileSync(statePath, JSON.stringify(state))
}

function readAllMessages(): TribeMessage[] {
  try {
    const raw = readFileSync(busPath, "utf8")
    return raw
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => {
        try {
          return JSON.parse(l) as TribeMessage
        } catch {
          return null
        }
      })
      .filter((m): m is TribeMessage => m != null)
  } catch {
    return []
  }
}

function appendMessage(msg: TribeMessage): void {
  ensureBus()
  appendFileSync(busPath, JSON.stringify(msg) + "\n")
}

function upsertMember(state: PersistedState, name: string, patch: Partial<TribeMember>): TribeMember {
  const existing = state.members[name]
  const next: TribeMember = {
    name,
    status: "online",
    lastActive: Date.now(),
    ...existing,
    ...patch,
    isChief: state.chief === name,
  }
  state.members[name] = next
  return next
}

function knownPeer(state: PersistedState, name: string): TribeMember {
  return state.members[name] ?? { name, status: "online" as const, isChief: state.chief === name }
}

function membersAsArray(state: PersistedState): TribeMember[] {
  return Object.values(state.members).map((m) => ({ ...m, isChief: state.chief === m.name }))
}

export function createJsonlBackend(): TribeBackend {
  return {
    async send(opts): Promise<void> {
      const state = readState()
      const sender = upsertMember(state, opts.from, { agentId: selfAgentId, parent: selfParent })
      if (opts.to !== "*") {
        // Don't fabricate metadata for unknown targets — register name only.
        upsertMember(state, opts.to, {})
      }
      const scope = opts.scope ?? "tree"
      const all = membersAsArray(state)
      const reachable = filterRecipientsByScope(scope, sender, all)

      if (opts.to !== "*") {
        if (!state.members[opts.to]) {
          throw new Error(`tribe: unknown peer '${opts.to}'`)
        }
        if (!reachable.some((p) => p.name === opts.to)) {
          throw new Error(`tribe: peer '${opts.to}' is out of scope '${scope}'`)
        }
      }

      writeState(state)
      appendMessage({
        from: opts.from,
        to: opts.to,
        text: opts.text,
        ts: Date.now(),
        agentId: sender.agentId,
        parent: sender.parent,
      })
    },
    async history(opts): Promise<TribeMessage[]> {
      const state = readState()
      const sender = knownPeer(state, opts.forSession)
      const scope = opts.scope ?? "tree"
      const all = membersAsArray(state)
      const reachableNames = new Set(filterRecipientsByScope(scope, sender, all).map((p) => p.name))
      reachableNames.add(opts.forSession)

      const messages = readAllMessages().filter((m) => {
        if (m.from === opts.forSession || m.to === opts.forSession) return true
        if (m.to === "*" && reachableNames.has(m.from)) return true
        if (scope === "all" || scope === "agent") {
          return reachableNames.has(m.from) && (m.to === "*" || reachableNames.has(m.to))
        }
        return false
      })

      const filter: HistoryFilter | undefined = opts.filter
      const filtered = applyHistoryFilter(messages, filter)
      const limit = opts.limit ?? 50
      return filtered.slice(-limit)
    },
    async members(opts): Promise<TribeMember[]> {
      const state = readState()
      // Backfill members from message stream so a fresh state still discovers
      // existing peers on first read.
      for (const m of readAllMessages()) {
        if (!state.members[m.from]) {
          state.members[m.from] = {
            name: m.from,
            status: "online",
            lastActive: m.ts,
            agentId: m.agentId,
            parent: m.parent,
            isChief: state.chief === m.from,
          }
        }
        if (m.to !== "*" && !state.members[m.to]) {
          state.members[m.to] = {
            name: m.to,
            status: "online",
            lastActive: m.ts,
            isChief: state.chief === m.to,
          }
        }
      }
      const sender = knownPeer(state, opts.forSession)
      const scope = opts.scope ?? "tree"
      return filterRecipientsByScope(scope, sender, membersAsArray(state)).map((m) => ({
        ...m,
        isChief: state.chief === m.name,
      }))
    },
    async join(opts): Promise<void> {
      const state = readState()
      upsertMember(state, opts.name, { agentId: opts.agentId, parent: opts.parent })
      writeState(state)
    },
    async claimChief(opts): Promise<{ ok: boolean; chief: string | null }> {
      const state = readState()
      upsertMember(state, opts.name, {})
      if (state.chief == null) {
        state.chief = opts.name
        writeState(state)
        return { ok: true, chief: state.chief }
      }
      if (state.chief === opts.name) return { ok: true, chief: state.chief }
      return { ok: false, chief: state.chief }
    },
    async releaseChief(opts): Promise<{ ok: boolean; chief: string | null }> {
      const state = readState()
      if (state.chief === opts.name) {
        state.chief = null
        writeState(state)
        return { ok: true, chief: null }
      }
      return { ok: false, chief: state.chief }
    },
    async chief(): Promise<string | null> {
      return readState().chief
    },
  }
}

function createBackend(): TribeBackend {
  if (backendKind === "daemon") {
    // Hook for a future bearly tribe UDS backend. Implement against the same
    // TribeBackend interface and select via TRIBE_BACKEND=daemon.
    throw new Error("tribe-mcp: daemon backend not implemented yet (set TRIBE_BACKEND=jsonl)")
  }
  if (backendKind !== "jsonl") {
    process.stderr.write(`tribe-mcp: unknown TRIBE_BACKEND='${backendKind}', falling back to jsonl\n`)
  }
  return createJsonlBackend()
}

ensureBus()

const backend = createBackend()
const server = createTribeMcpServer(backend, sessionName, {
  defaultScope,
  selfAgentId,
  selfParent,
})

export async function run(input: Readable = process.stdin, output: Writable = process.stdout): Promise<void> {
  let buffer = ""
  const decoder = new TextDecoder()
  await new Promise<void>((resolve) => {
    async function handleChunk(chunk: Buffer | string): Promise<void> {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk)
      let idx = buffer.indexOf("\n")
      while (idx !== -1) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (line.length > 0) {
          try {
            const msg = JSON.parse(line) as JsonRpcRequest
            const resp = await server.handle(msg)
            if (resp) output.write(JSON.stringify(resp) + "\n")
          } catch (err) {
            const errResp: JsonRpcResponse = {
              jsonrpc: "2.0",
              id: 0,
              error: { code: -32700, message: `parse error: ${(err as Error).message}` },
            }
            output.write(JSON.stringify(errResp) + "\n")
          }
        }
        idx = buffer.indexOf("\n")
      }
    }
    input.on("data", (chunk: Buffer | string) => {
      void handleChunk(chunk)
    })
    input.on("end", () => resolve())
    input.on("close", () => resolve())
  })
}

// Only auto-run when invoked as a binary (not when imported by tests).
const isMain = (() => {
  try {
    const argv1 = process.argv[1]
    if (!argv1) return false
    return argv1.endsWith("/bin.ts") || argv1.endsWith("/bin.js") || argv1.endsWith("km-tribe-mcp")
  } catch {
    return false
  }
})()

if (isMain) {
  await run()
}
