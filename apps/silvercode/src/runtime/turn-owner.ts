import type { AgentEvent } from "@km/agent-harness"

export type TurnOwnerPhase = "created" | "idle" | "active" | "ended"

export type TurnOwnerTransportPolicy = {
  /**
   * Stream-json CLIs such as Claude Code can accept additional stdin while an
   * assistant turn is active once the first write has reached the process.
   * Request/response transports such as ACP stay single-flight until the
   * protocol advertises a richer queue contract.
   */
  readonly acceptsInputWhileActive: boolean
}

export type TurnOwnerPromptDecision =
  | { readonly kind: "start"; readonly text: string }
  | { readonly kind: "queued"; readonly text: string }
  | { readonly kind: "noop"; readonly reason: "empty" | "backpressure" }

export type TurnOwnerObservation = {
  readonly acknowledgedStart: boolean
  readonly lifecycleEdge: boolean
  readonly shouldRetryQueue: boolean
}

export type TurnOwner = {
  readonly phase: () => TurnOwnerPhase
  readonly hasPendingStart: () => boolean
  readonly queuedText: () => string
  readonly setQueuedText: (text: string) => boolean
  readonly clearQueue: () => boolean
  readonly submitUserText: (text: string) => TurnOwnerPromptDecision
  readonly flushQueue: (opts?: { readonly force?: boolean }) => TurnOwnerPromptDecision
  readonly abandonPendingStart: () => boolean
  readonly observeProviderEvent: (event: AgentEvent) => TurnOwnerObservation
}

export function createTurnOwner(policy: TurnOwnerTransportPolicy): TurnOwner {
  let phase: TurnOwnerPhase = "created"
  let pendingStart = false
  let queueText = ""

  function canStart(force = false): boolean {
    if (pendingStart) return false
    if (phase === "created" || phase === "idle" || phase === "ended") return true
    if (phase === "active" && policy.acceptsInputWhileActive) return true
    return force
  }

  function startNeedsAcknowledgement(): boolean {
    return phase !== "active" || !policy.acceptsInputWhileActive
  }

  function appendQueue(text: string): string {
    queueText = queueText ? `${queueText}\n\n${text}` : text
    return queueText
  }

  function start(text: string): TurnOwnerPromptDecision {
    pendingStart = startNeedsAcknowledgement()
    return { kind: "start", text }
  }

  function isAcknowledgementEvent(event: AgentEvent): boolean {
    switch (event.kind) {
      case "session-init":
      case "turn-start":
      case "text-delta":
      case "thinking-delta":
      case "tool-use":
      case "tool-result":
      case "permission-request":
      case "liveness-check":
      case "assistant-message":
      case "user-message":
      case "raw-transcript":
      case "status":
      case "plan-update":
      case "slash-commands-update":
      case "km-reference":
        return true
      case "turn-end":
      case "permission-decision":
      case "session-end":
      case "session-lifecycle":
      case "error":
      case "handoff":
        return false
    }
  }

  function isActiveEvent(event: AgentEvent): boolean {
    switch (event.kind) {
      case "turn-start":
      case "text-delta":
      case "thinking-delta":
      case "tool-use":
      case "tool-result":
      case "permission-request":
      case "assistant-message":
      case "raw-transcript":
      case "plan-update":
      case "km-reference":
        return true
      default:
        return false
    }
  }

  function applyLifecycle(event: AgentEvent): boolean {
    if (event.kind === "session-init") {
      if (phase !== "active") phase = "idle"
      return false
    }
    if (event.kind === "turn-end") {
      pendingStart = false
      phase = "idle"
      return true
    }
    if (event.kind === "session-end") {
      pendingStart = false
      phase = "ended"
      return true
    }
    if (event.kind === "session-lifecycle") {
      if (event.state === "ended") {
        pendingStart = false
        phase = "ended"
      }
      return true
    }
    if (event.kind === "error") {
      pendingStart = false
      return false
    }
    if (isActiveEvent(event)) phase = "active"
    return false
  }

  return {
    phase: () => phase,
    hasPendingStart: () => pendingStart,
    queuedText: () => queueText,
    setQueuedText(text: string): boolean {
      if (text === queueText) return false
      queueText = text
      return true
    },
    clearQueue(): boolean {
      if (!queueText) return false
      queueText = ""
      return true
    },
    submitUserText(text: string): TurnOwnerPromptDecision {
      if (!canStart()) return { kind: "queued", text: appendQueue(text) }
      const pending = queueText
      queueText = ""
      return start(pending ? `${pending}\n\n${text}` : text)
    },
    flushQueue(opts?: { readonly force?: boolean }): TurnOwnerPromptDecision {
      if (!queueText) return { kind: "noop", reason: "empty" }
      if (!canStart(opts?.force ?? false)) return { kind: "noop", reason: "backpressure" }
      const text = queueText
      queueText = ""
      return start(text)
    },
    abandonPendingStart(): boolean {
      if (!pendingStart) return false
      pendingStart = false
      return true
    },
    observeProviderEvent(event: AgentEvent): TurnOwnerObservation {
      const acknowledgedStart = pendingStart && isAcknowledgementEvent(event)
      if (acknowledgedStart) pendingStart = false
      const lifecycleEdge = applyLifecycle(event)
      return {
        acknowledgedStart,
        lifecycleEdge,
        shouldRetryQueue: acknowledgedStart || lifecycleEdge,
      }
    },
  }
}
