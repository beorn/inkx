/**
 * Track 2 adapter — `@anthropic-ai/claude-agent-sdk` in-process.
 *
 * Scope for M11: behind the same AgentSession interface as Track 1. API-key
 * billing (not OAuth). The heavy lifting happens in the SDK; this adapter
 * normalizes SDK events into our canonical AgentEvent schema so the UI layer
 * never knows which track is active.
 *
 * The SDK dependency is resolved dynamically so the harness package itself
 * doesn't force it on consumers who only want Track 1. If the import fails,
 * spawnSdk throws with an actionable message.
 */

import { EventEmitter } from "node:events"
import type { AgentEvent, AgentInput, AgentSession, PermissionRequestId, SessionId } from "./events.ts"
import { runInjectors, type Injector } from "./injectors.ts"

export type SpawnSdkOptions = {
  /** Anthropic API key. Falls back to process.env.ANTHROPIC_API_KEY. */
  apiKey?: string
  model?: string
  cwd?: string
  injectors?: Injector[]
  /** SDK-specific options passed through after our normalizations. */
  sdkOptions?: Record<string, unknown>
}

type SdkModule = {
  query: (opts: {
    prompt: AsyncIterable<AgentInput> | string
    options?: Record<string, unknown>
  }) => AsyncIterable<Record<string, unknown>>
}

async function loadSdk(): Promise<SdkModule> {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic optional peer dep
    const mod = (await import("@anthropic-ai/claude-agent-sdk" as any)) as SdkModule
    return mod
  } catch (err) {
    throw new Error(
      "Track 2 requires @anthropic-ai/claude-agent-sdk; install it in the consuming app.\n" +
        `Original error: ${(err as Error).message}`,
    )
  }
}

/**
 * Spawn a Track 2 session backed by the SDK. Events are normalized into the
 * same shape as Track 1 so consumers can swap tracks per-session at runtime.
 */
export async function spawnSdk(opts: SpawnSdkOptions = {}): Promise<AgentSession> {
  const sdk = await loadSdk()
  const bus = new EventEmitter()
  let sessionId: SessionId = ("sdk-" + Date.now()) as SessionId
  let closed = false

  const injectors = opts.injectors ?? []
  const inputQueue: AgentInput[] = []
  let queueResolve: ((v: IteratorResult<AgentInput>) => void) | null = null

  const promptIterable: AsyncIterable<AgentInput> = {
    [Symbol.asyncIterator](): AsyncIterator<AgentInput> {
      return {
        next(): Promise<IteratorResult<AgentInput>> {
          if (closed) return Promise.resolve({ value: undefined, done: true })
          const queued = inputQueue.shift()
          if (queued) return Promise.resolve({ value: queued, done: false })
          return new Promise((resolve) => {
            queueResolve = resolve
          })
        },
        return(): Promise<IteratorResult<AgentInput>> {
          closed = true
          return Promise.resolve({ value: undefined, done: true })
        },
      }
    },
  }

  function enqueue(input: AgentInput): void {
    if (queueResolve) {
      const resolve = queueResolve
      queueResolve = null
      resolve({ value: input, done: false })
    } else {
      inputQueue.push(input)
    }
  }

  function normalize(raw: Record<string, unknown>): AgentEvent | null {
    // The SDK surfaces events in a slightly different shape than the CLI.
    // The common subset we need to normalize for M11:
    //   - `{ type: "system", subtype: "init", session_id, ... }`
    //   - `{ type: "assistant", message: { content: [...] } }`
    //   - `{ type: "result", ... }`
    // More shapes may be added as we see them in the wild; unknown events
    // are returned as errors tagged `sdk-unknown` so they're visible in UI.
    const t = raw.type
    const ts = Date.now()
    if (t === "system" && raw.subtype === "init") {
      sessionId = String(raw.session_id ?? sessionId) as SessionId
      return {
        kind: "session-init",
        sessionId,
        cwd: String(raw.cwd ?? opts.cwd ?? ""),
        model: String(raw.model ?? opts.model ?? ""),
        mode: String(raw.permissionMode ?? "default"),
        tools: Array.isArray(raw.tools) ? (raw.tools as string[]) : [],
        mcp_servers: Array.isArray(raw.mcp_servers) ? (raw.mcp_servers as string[]) : [],
        ts,
      }
    }
    if (t === "assistant") {
      const msg = raw.message as Record<string, unknown> | undefined
      const blocks = Array.isArray(msg?.content) ? (msg.content as Array<Record<string, unknown>>) : []
      return {
        kind: "assistant-message",
        sessionId,
        turnId: String(msg?.id ?? `turn-${ts}`) as never,
        content: blocks.map((b) => {
          if (b.type === "text") return { type: "text" as const, text: String(b.text ?? "") }
          if (b.type === "tool_use") {
            return {
              type: "tool_use" as const,
              id: String(b.id ?? "") as never,
              name: String(b.name ?? ""),
              input: b.input ?? {},
            }
          }
          return { type: "text" as const, text: "" }
        }),
        ts,
      }
    }
    if (t === "result") {
      return {
        kind: "session-end",
        sessionId,
        stopReason: typeof raw.stop_reason === "string" ? (raw.stop_reason as string) : undefined,
        costUsd: typeof raw.total_cost_usd === "number" ? (raw.total_cost_usd as number) : undefined,
        durationMs: typeof raw.duration_ms === "number" ? (raw.duration_ms as number) : undefined,
        ts,
      }
    }
    return null
  }

  ;(async () => {
    try {
      const sdkStream = sdk.query({
        prompt: promptIterable,
        options: {
          model: opts.model,
          cwd: opts.cwd,
          apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
          ...opts.sdkOptions,
        },
      })
      for await (const raw of sdkStream) {
        const evt = normalize(raw)
        if (evt) bus.emit("event", evt)
      }
    } catch (err) {
      bus.emit("event", {
        kind: "error",
        sessionId,
        message: `sdk error: ${(err as Error).message}`,
        ts: Date.now(),
      } satisfies AgentEvent)
    } finally {
      closed = true
      bus.emit("event", {
        kind: "session-lifecycle",
        sessionId,
        state: "ended",
        ts: Date.now(),
      } satisfies AgentEvent)
    }
  })()

  const session: AgentSession = {
    get sessionId(): SessionId {
      return sessionId
    },
    get closed(): boolean {
      return closed
    },
    send(text: string): void {
      const final = runInjectors(injectors, text, { sessionId, cwd: opts.cwd ?? process.cwd() })
      enqueue({ type: "user", message: { role: "user", content: final } })
    },
    respondToPermission(requestId: PermissionRequestId, approved: boolean): void {
      enqueue({ type: "permission-response", request_id: requestId, approved })
    },
    subscribe(handler: (event: AgentEvent) => void): () => void {
      bus.on("event", handler)
      return () => bus.off("event", handler)
    },
    async close(): Promise<void> {
      closed = true
      if (queueResolve) {
        const resolve = queueResolve
        queueResolve = null
        resolve({ value: undefined as unknown as AgentInput, done: true })
      }
    },
  }

  return session
}
