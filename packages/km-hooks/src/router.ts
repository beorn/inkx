import type {
  EnrichmentFields,
  HookEvent,
  HookSource,
  Listener,
  ListenerContext,
  ListenerResult,
  RouterResult,
} from "./types.ts"

const INGEST_DEFAULT_TIMEOUT_MS = 5_000
const NOTIFY_DEFAULT_TIMEOUT_MS = 100

interface DispatchOptions {
  sessionId?: string
  projectPath?: string
}

function matches(listener: Listener, event: HookEvent, source: HookSource): boolean {
  if (listener.events && !listener.events.includes(event)) return false
  if (listener.sources && !listener.sources.includes(source)) return false
  return true
}

async function runOne(listener: Listener, ctx: ListenerContext, timeoutMs: number): Promise<ListenerResult> {
  const started = Date.now()
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  try {
    const work = Promise.resolve().then(() => listener.handle(ctx))
    const timeout = new Promise<"__timeout__">((resolve) => {
      timeoutHandle = setTimeout(() => resolve("__timeout__"), timeoutMs)
    })
    const winner = await Promise.race([work.then(() => "__ok__" as const), timeout])
    if (winner === "__timeout__") {
      return { name: listener.name, status: "timeout", durationMs: Date.now() - started }
    }
    return { name: listener.name, status: "ok", durationMs: Date.now() - started }
  } catch (err) {
    return {
      name: listener.name,
      status: "error",
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

async function dispatch(
  listeners: readonly Listener[],
  event: HookEvent,
  source: HookSource,
  enrichment: EnrichmentFields,
  opts: DispatchOptions,
  defaultTimeoutMs: number,
): Promise<RouterResult> {
  const started = Date.now()
  const ctx: ListenerContext = {
    event,
    source,
    activityText: enrichment.activityText,
    toolName: enrichment.toolName,
    finalMessage: enrichment.finalMessage,
    hookEventName: enrichment.hookEventName,
    notificationType: enrichment.notificationType,
    metadata: enrichment.metadata,
    sessionId: opts.sessionId,
    projectPath: opts.projectPath,
    now: new Date(),
  }
  const matching = listeners.filter((l) => matches(l, event, source))
  const results = await Promise.all(matching.map((l) => runOne(l, ctx, l.timeoutMs ?? defaultTimeoutMs)))
  return { event, source, listeners: results, totalMs: Date.now() - started }
}

export async function runIngest(
  listeners: readonly Listener[],
  event: HookEvent,
  source: HookSource,
  enrichment: EnrichmentFields = {},
  opts: DispatchOptions = {},
): Promise<RouterResult> {
  return dispatch(listeners, event, source, enrichment, opts, INGEST_DEFAULT_TIMEOUT_MS)
}

export async function runNotify(
  listeners: readonly Listener[],
  event: HookEvent,
  source: HookSource,
  enrichment: EnrichmentFields = {},
  opts: DispatchOptions = {},
): Promise<RouterResult> {
  try {
    return await dispatch(listeners, event, source, enrichment, opts, NOTIFY_DEFAULT_TIMEOUT_MS)
  } catch (err) {
    return {
      event,
      source,
      listeners: [
        {
          name: "__router__",
          status: "error",
          durationMs: 0,
          error: err instanceof Error ? err.message : String(err),
        },
      ],
      totalMs: 0,
    }
  }
}
