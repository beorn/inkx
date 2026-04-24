/**
 * Spawn the official `claude` binary with stream-json I/O.
 *
 * Canonical command:
 *   claude --bare -p --input-format stream-json --output-format stream-json \
 *          --include-partial-messages --verbose
 *
 * `--bare` suppresses the user's hooks/plugins/MCP/skills for deterministic
 * subprocess behaviour; Anthropic has indicated `--bare` will likely become
 * the `-p` default. See 00-agent-workspace.md for the rationale.
 *
 * This spawner is intentionally thin. All parsing lives in parse.ts, all
 * injection lives in injectors.ts, all persistence lives in event-log.ts.
 */

import { type ChildProcess, spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import type { AgentEvent, AgentInput, AgentSession, PermissionRequestId, SessionId } from "./events.ts"
import { runInjectors, type Injector } from "./injectors.ts"
import { createLineSplitter, createStreamJsonParser } from "./parse.ts"

export type SpawnClaudeOptions = {
  /** Working directory for the subprocess. Defaults to process.cwd(). */
  cwd?: string
  /** Override the claude binary path. Defaults to `claude` on PATH. */
  binary?: string
  /** Additional env vars. Merged over process.env. */
  env?: Record<string, string | undefined>
  /** Resume a previous session by id. Adds `--resume <id>`. */
  resume?: string
  /**
   * Run without `--bare` so the user's hooks/plugins/skills fire inside the
   * subprocess. Default false (bare is the recommended mode).
   */
  bare?: boolean
  /** Override the model (`--model <name>`). */
  model?: string
  /** Additional CLI args appended at the end. */
  extraArgs?: string[]
  /**
   * CLAUDE_CONFIG_DIR for per-account isolation (see v1.1 multi-account). If
   * provided, exported as env to the subprocess.
   */
  configDir?: string
  /** Chain of injectors applied to every user message before stdin write. */
  injectors?: Injector[]
  /**
   * If true, swallow subprocess stderr rather than letting it surface as
   * error events. Useful for tests where stderr is expected to be noisy.
   */
  silentStderr?: boolean
}

function buildArgs(opts: SpawnClaudeOptions): string[] {
  const args: string[] = []
  if (opts.bare !== false) args.push("--bare")
  args.push("-p")
  args.push("--input-format", "stream-json")
  args.push("--output-format", "stream-json")
  args.push("--include-partial-messages")
  args.push("--verbose")
  if (opts.resume) args.push("--resume", opts.resume)
  if (opts.model) args.push("--model", opts.model)
  if (opts.extraArgs) args.push(...opts.extraArgs)
  return args
}

/** Spawn a Claude Code subprocess via Track 1. */
export function spawnClaude(opts: SpawnClaudeOptions = {}): AgentSession {
  const bus = new EventEmitter()
  let sessionId: SessionId = "pending" as SessionId
  let proc: ChildProcess
  let closed = false

  const args = buildArgs(opts)
  const env: Record<string, string | undefined> = { ...process.env, ...opts.env }
  if (opts.configDir) env.CLAUDE_CONFIG_DIR = opts.configDir

  const binary = opts.binary ?? "claude"

  proc = spawn(binary, args, {
    cwd: opts.cwd ?? process.cwd(),
    env: env as NodeJS.ProcessEnv,
    stdio: ["pipe", "pipe", "pipe"],
  })

  const parser = createStreamJsonParser((event: AgentEvent) => {
    if (event.kind === "session-init") sessionId = event.sessionId
    bus.emit("event", event)
  })
  const splitter = createLineSplitter((line) => parser.push(line))

  proc.stdout?.on("data", (chunk: Buffer) => splitter.push(chunk))
  proc.stderr?.on("data", (chunk: Buffer) => {
    if (opts.silentStderr) return
    bus.emit("event", {
      kind: "error",
      sessionId,
      message: chunk.toString("utf8").trim(),
      ts: Date.now(),
    } satisfies AgentEvent)
  })
  proc.on("error", (err) => {
    bus.emit("event", {
      kind: "error",
      sessionId,
      message: `spawn error: ${err.message}`,
      ts: Date.now(),
    } satisfies AgentEvent)
  })
  proc.on("exit", (code, signal) => {
    closed = true
    splitter.flush()
    bus.emit("event", {
      kind: "session-lifecycle",
      sessionId,
      state: "ended",
      ts: Date.now(),
    } satisfies AgentEvent)
    bus.emit("event", {
      kind: "session-end",
      sessionId,
      stopReason: signal ?? (code != null ? `exit-${code}` : undefined),
      ts: Date.now(),
    } satisfies AgentEvent)
  })

  function writeInput(input: AgentInput): void {
    if (closed) return
    const json = JSON.stringify(input) + "\n"
    proc.stdin?.write(json, (err) => {
      if (err) {
        bus.emit("event", {
          kind: "error",
          sessionId,
          message: `stdin write error: ${err.message}`,
          ts: Date.now(),
        } satisfies AgentEvent)
      }
    })
  }

  const injectors = opts.injectors ?? []

  const session: AgentSession = {
    get sessionId(): SessionId {
      return sessionId
    },
    get closed(): boolean {
      return closed
    },
    send(text: string): void {
      const finalText = runInjectors(injectors, text, { sessionId, cwd: opts.cwd ?? process.cwd() })
      writeInput({ type: "user", message: { role: "user", content: finalText } })
    },
    respondToPermission(requestId: PermissionRequestId, approved: boolean): void {
      writeInput({ type: "permission-response", request_id: requestId, approved })
    },
    subscribe(handler: (event: AgentEvent) => void): () => void {
      bus.on("event", handler)
      return () => bus.off("event", handler)
    },
    async close(): Promise<void> {
      if (closed) return
      proc.stdin?.end()
      await new Promise<void>((resolve) => {
        if (closed) return resolve()
        proc.on("exit", () => resolve())
        // Hard kill after a grace period in case the subprocess hangs.
        const timer = setTimeout(() => {
          if (!proc.killed) proc.kill("SIGTERM")
        }, 2000)
        proc.on("exit", () => clearTimeout(timer))
      })
    },
  }

  return session
}
