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
 * Since `--bare` skips CLAUDE.md / plugins / MCP discovery, this module
 * re-mounts caller-provided MCP servers by writing a temp `mcp-config.json`
 * with the `mcpServers` block and passing it via `--mcp-config`. Combined
 * with `--strict-mcp-config` (added when mcpServers is non-empty), that
 * guarantees only the requested servers are mounted — no leak from the
 * user's global config. Closes the M2/M4 runtime gap.
 *
 * This spawner is intentionally thin. All parsing lives in parse.ts, all
 * injection lives in injectors.ts, all persistence lives in event-log.ts.
 */

import { type ChildProcess, spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentEvent, AgentInput, AgentSession, PermissionRequestId, SessionId } from "./events.ts"
import { runInjectors, type Injector } from "./injectors.ts"
import { createLineSplitter, createStreamJsonParser } from "./parse.ts"

/** MCP server spec written into settings.json for spawned Claude sessions. */
export type McpServerSpec = {
  /** Stable identifier; becomes the key under mcpServers. */
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  /** Transport. Only `stdio` is wired in M0; `sse`/`http` land later. */
  type?: "stdio"
}

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
   * Explicit CLAUDE_CONFIG_DIR for per-account isolation (v1.1 multi-account).
   * When provided, the harness does NOT synthesize a temp dir — the caller
   * owns the settings.json at this location. Mutually exclusive with
   * `mcpServers` (which implies a synthetic temp dir).
   */
  configDir?: string
  /**
   * MCP servers to mount for this session. The harness writes a temp
   * `CLAUDE_CONFIG_DIR/settings.json` with the `mcpServers` block and cleans
   * up on session close. Stdio only in M0.
   */
  mcpServers?: McpServerSpec[]
  /** Chain of injectors applied to every user message before stdin write. */
  injectors?: Injector[]
  /**
   * If true, swallow subprocess stderr rather than letting it surface as
   * error events. Useful for tests where stderr is expected to be noisy.
   */
  silentStderr?: boolean
}

function buildArgs(opts: SpawnClaudeOptions, mcpConfigPath: string | null): string[] {
  const args: string[] = []
  if (opts.bare !== false) args.push("--bare")
  args.push("-p")
  args.push("--input-format", "stream-json")
  args.push("--output-format", "stream-json")
  args.push("--include-partial-messages")
  args.push("--verbose")
  if (mcpConfigPath) {
    args.push("--mcp-config", mcpConfigPath)
    args.push("--strict-mcp-config")
  }
  if (opts.resume) args.push("--resume", opts.resume)
  if (opts.model) args.push("--model", opts.model)
  if (opts.extraArgs) args.push(...opts.extraArgs)
  return args
}

/**
 * Materialize a temp `mcp-config.json` file containing the requested MCP
 * servers in the exact shape `claude --mcp-config` expects. Returns the file
 * path and a cleanup function.
 *
 * Exported for tests so the generated file can be asserted without actually
 * spawning Claude.
 */
export function materializeMcpConfig(mcpServers: McpServerSpec[]): { path: string; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), "silvercode-mcp-"))
  const path = join(dir, "mcp-config.json")
  const body = {
    mcpServers: Object.fromEntries(
      mcpServers.map((s) => [
        s.name,
        {
          command: s.command,
          args: s.args ?? [],
          ...(s.env ? { env: s.env } : {}),
          ...(s.type ? { type: s.type } : {}),
        },
      ]),
    ),
  }
  writeFileSync(path, JSON.stringify(body, null, 2))
  return {
    path,
    cleanup(): void {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore — tempdir cleanup is best-effort */
      }
    },
  }
}

/** Spawn a Claude Code subprocess via Track 1. */
export function spawnClaude(opts: SpawnClaudeOptions = {}): AgentSession {
  const bus = new EventEmitter()
  let sessionId: SessionId = "pending" as SessionId
  let proc: ChildProcess
  let closed = false

  const env: Record<string, string | undefined> = { ...process.env, ...opts.env }
  if (opts.configDir) env.CLAUDE_CONFIG_DIR = opts.configDir

  let mcpConfigPath: string | null = null
  let cleanupMcpConfig: (() => void) | null = null
  if (opts.mcpServers && opts.mcpServers.length > 0) {
    const materialized = materializeMcpConfig(opts.mcpServers)
    mcpConfigPath = materialized.path
    cleanupMcpConfig = materialized.cleanup
  }

  const args = buildArgs(opts, mcpConfigPath)

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
    if (cleanupMcpConfig) cleanupMcpConfig()
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
      if (cleanupMcpConfig) {
        cleanupMcpConfig()
        cleanupMcpConfig = null
      }
    },
    kill(): void {
      // Immediate SIGKILL of the child. Its stdio pipes close, which lets
      // Node's event loop drain — the MCP sub-subprocesses claude spawned
      // get SIGPIPE when their stdin closes and die on their own. No
      // process-group tricks (detached:true had macOS-specific quirks that
      // caused Ctrl+C to silently do nothing).
      if (closed) return
      try {
        proc.kill("SIGKILL")
      } catch {
        /* already dead */
      }
      if (cleanupMcpConfig) {
        cleanupMcpConfig()
        cleanupMcpConfig = null
      }
    },
  }

  return session
}
