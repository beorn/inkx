export const HOOK_EVENTS = [
  "session_start",
  "session_end",
  "user_prompt_submit",
  "pre_tool_use",
  "post_tool_use",
  "post_tool_use_failure",
  "stop",
  "subagent_stop",
  "notification",
  "permission_request",
] as const

export type HookEvent = (typeof HOOK_EVENTS)[number]

export type HookSource = "claude" | "codex" | "gemini" | "opencode" | "km" | (string & {})

export interface EnrichmentFields {
  activityText?: string
  toolName?: string
  finalMessage?: string
  hookEventName?: string
  notificationType?: string
  metadata?: unknown
}

export interface ListenerContext extends EnrichmentFields {
  event: HookEvent
  source: HookSource
  sessionId?: string
  projectPath?: string
  now: Date
}

export interface Listener {
  name: string
  events?: readonly HookEvent[]
  sources?: readonly HookSource[]
  timeoutMs?: number
  handle: (ctx: ListenerContext) => Promise<void> | void
}

export function defineListener(listener: Listener): Listener {
  return listener
}

export interface ListenerResult {
  name: string
  status: "ok" | "error" | "timeout"
  durationMs: number
  error?: string
}

export interface RouterResult {
  event: HookEvent
  source: HookSource
  listeners: ListenerResult[]
  totalMs: number
}
