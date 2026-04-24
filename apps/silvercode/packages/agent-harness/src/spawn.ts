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
import createDebug from "debug"
import type { AgentEvent, AgentInput, AgentSession, PermissionRequestId, SessionId } from "./events.ts"
import { runInjectors, type Injector } from "./injectors.ts"
import { createLineSplitter, createStreamJsonParser } from "./parse.ts"

// Namespaces — enable with DEBUG=agent-harness:* (or agent-harness:spawn,
// agent-harness:stdin, agent-harness:stdout, agent-harness:stderr for
// finer control). Combined with DEBUG_LOG=<path>, routes output to a
// file so it doesn't pollute the alt-screen TUI.
const dSpawn = createDebug("agent-harness:spawn")
const dIn = createDebug("agent-harness:stdin")
const dOut = createDebug("agent-harness:stdout")
const dErr = createDebug("agent-harness:stderr")
const dEvent = createDebug("agent-harness:event")

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

  dSpawn("spawned pid=%d cmd=%s %o cwd=%s", proc.pid, binary, args, opts.cwd ?? process.cwd())

  const parser = createStreamJsonParser((event: AgentEvent) => {
    if (event.kind === "session-init") sessionId = event.sessionId
    dEvent("event kind=%s session=%s", event.kind, event.sessionId)
    bus.emit("event", event)
  })
  const splitter = createLineSplitter((line) => {
    dOut("line %s", line.length > 400 ? `${line.slice(0, 400)}…(+${line.length - 400})` : line)
    parser.push(line)
  })

  proc.stdout?.on("data", (chunk: Buffer) => splitter.push(chunk))
  proc.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString("utf8").trim()
    dErr("%s", msg)
    if (opts.silentStderr) return
    bus.emit("event", {
      kind: "error",
      sessionId,
      message: msg,
      ts: Date.now(),
    } satisfies AgentEvent)
  })
  proc.on("error", (err) => {
    dSpawn("proc error: %s", err.message)
    bus.emit("event", {
      kind: "error",
      sessionId,
      message: `spawn error: ${err.message}`,
      ts: Date.now(),
    } satisfies AgentEvent)
  })
  proc.on("close", (code, signal) => {
    dSpawn("close code=%s signal=%s stdin=%s", code, signal, proc.stdin?.destroyed)
  })
  proc.on("exit", (code, signal) => {
    dSpawn("exit code=%s signal=%s", code, signal)
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
    dIn("write type=%s len=%d %s", input.type, json.length, json.length > 200 ? `${json.slice(0, 200)}…` : json.trim())
    proc.stdin?.write(json, (err) => {
      if (err) {
        dIn("write error: %s", err.message)
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
      dSpawn("session.send() called text.len=%d sessionId=%s closed=%s", text.length, sessionId, closed)
      const finalText = runInjectors(injectors, text, { sessionId, cwd: opts.cwd ?? process.cwd() })
      dSpawn("session.send() after injectors finalText.len=%d", finalText.length)
      writeInput({ type: "user", message: { role: "user", content: finalText } })
      dSpawn("session.send() writeInput returned")
    },
    respondToPermission(requestId: PermissionRequestId, approved: boolean): void {
      writeInput({ type: "permission-response", request_id: requestId, approved })
    },
    subscribe(handler: (event: AgentEvent) => void): () => void {
      bus.on("event", handler)
      return () => bus.off("event", handler)
    },
    close(): void {
      // Graceful shutdown: SIGTERM to claude. Well-behaved CLIs (claude
      // included) treat SIGTERM as "please shut down cleanly" — flushes
      // pending stream-json, tears down MCP sub-subprocesses, closes its
      // stdio. Pipes close, our event loop drains, Node exits.
      //
      // SIGTERM over SIGINT: SIGTERM is the conventional "programmatic
      // shutdown" signal (what `kill <pid>`, systemctl stop, docker stop
      // send). SIGINT semantically means "user interrupted" and is
      // already what the TTY driver synthesizes from Ctrl+C — reserving
      // SIGINT for actual user-interrupts keeps the semantics clean.
      // Claude handles both identically; the choice is conventional.
      //
      // Synchronous fire-and-forget. Listeners get 'session-end' via
      // subscribe() when the child actually exits.
      if (closed) return
      try {
        proc.kill("SIGTERM")
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
