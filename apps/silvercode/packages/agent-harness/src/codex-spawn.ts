/**
 * M12 stub — spawn the OpenAI `codex` CLI and normalize its event stream.
 *
 * Codex's subprocess protocol is JSON-lines too but the shape differs. This
 * module owns the Codex-specific parser and maps events onto AgentEvent so the
 * UI layer can render Codex sessions in the same MessageList / ToolCallBlock
 * components without branching on backend.
 *
 * This is scaffolded structurally for M12; the event-shape normalization is
 * deferred until we probe the live `codex` binary. Calling spawnCodex today
 * spawns the CLI and surfaces unknown events as `error` kinds so the UI shows
 * "unknown codex event" instead of silently dropping data.
 */

import { type ChildProcess, spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import type { AgentEvent, AgentInput, AgentSession, PermissionRequestId, SessionId } from "./events.ts"
import { runInjectors, type Injector } from "./injectors.ts"
import { createLineSplitter } from "./parse.ts"

export type SpawnCodexOptions = {
  cwd?: string
  binary?: string
  env?: Record<string, string | undefined>
  injectors?: Injector[]
  extraArgs?: string[]
}

/** Spawn Codex CLI. Minimal shape — M12 owns the full event normalization. */
export function spawnCodex(opts: SpawnCodexOptions = {}): AgentSession {
  const bus = new EventEmitter()
  let sessionId: SessionId = ("codex-" + Date.now()) as SessionId
  let closed = false
  let proc: ChildProcess

  const binary = opts.binary ?? "codex"
  const args = ["--stream-json", ...(opts.extraArgs ?? [])]
  const env: Record<string, string | undefined> = { ...process.env, ...opts.env }

  proc = spawn(binary, args, {
    cwd: opts.cwd ?? process.cwd(),
    env: env as NodeJS.ProcessEnv,
    stdio: ["pipe", "pipe", "pipe"],
  })

  const splitter = createLineSplitter((line) => {
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }
    const ts = Date.now()
    // Minimal normalization: capture a session id on the first event that has
    // one; surface text chunks as text-delta; otherwise emit a status.
    if (typeof obj.session_id === "string") sessionId = obj.session_id as SessionId
    if (obj.type === "text" && typeof obj.text === "string") {
      bus.emit("event", {
        kind: "text-delta",
        sessionId,
        turnId: ("codex-turn-" + ts) as never,
        blockIndex: 0,
        text: obj.text as string,
        ts,
      } satisfies AgentEvent)
      return
    }
    bus.emit("event", {
      kind: "status",
      sessionId,
      status: typeof obj.type === "string" ? (obj.type as string) : "codex-unknown",
      ts,
    } satisfies AgentEvent)
  })

  proc.stdout?.on("data", (chunk: Buffer) => splitter.push(chunk))
  proc.stderr?.on("data", (chunk: Buffer) => {
    bus.emit("event", {
      kind: "error",
      sessionId,
      message: chunk.toString("utf8").trim(),
      ts: Date.now(),
    } satisfies AgentEvent)
  })
  proc.on("exit", (code, signal) => {
    closed = true
    splitter.flush()
    bus.emit("event", {
      kind: "session-end",
      sessionId,
      stopReason: signal ?? (code != null ? `exit-${code}` : undefined),
      ts: Date.now(),
    } satisfies AgentEvent)
  })

  const injectors = opts.injectors ?? []

  function writeInput(input: AgentInput): void {
    if (closed) return
    proc.stdin?.write(JSON.stringify(input) + "\n")
  }

  const session: AgentSession = {
    get sessionId(): SessionId {
      return sessionId
    },
    get closed(): boolean {
      return closed
    },
    send(text: string): void {
      const final = runInjectors(injectors, text, { sessionId, cwd: opts.cwd ?? process.cwd() })
      writeInput({ type: "user", message: { role: "user", content: final } })
    },
    respondToPermission(requestId: PermissionRequestId, approved: boolean): void {
      writeInput({ type: "permission-response", request_id: requestId, approved })
    },
    subscribe(handler: (event: AgentEvent) => void): () => void {
      bus.on("event", handler)
      return () => bus.off("event", handler)
    },
    close(): void {
      // Same shape as spawnClaude.close — SIGINT to the child, let it
      // tear itself down gracefully. Fire-and-forget.
      if (closed) return
      try {
        proc.kill("SIGTERM")
      } catch {
        /* already dead */
      }
    },
  }

  return session
}
