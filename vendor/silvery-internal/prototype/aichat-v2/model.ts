/**
 * Chat model — factory function with signals + async generator.
 *
 * Replaces the 327-line TEA state machine (state.ts) with ~140 lines:
 * signals for state, methods for behavior, async generators for streaming.
 * No discriminated unions, no switch/case, no timer effects.
 *
 * Key improvements over the TEA version:
 * - 14 message types → 5 named methods (submit, respond, compact, advance, confirmExit)
 * - 12-field DemoState → 11 independent signals (fine-grained reactivity)
 * - Timer-driven reveal fractions → natural async/await flow
 * - 200+ lines of switch/case → 15-line async generator
 * - Injectable delay for deterministic testing (TestClock)
 * - ctrlDPending + elapsed moved from view to model (no component side effects)
 */

import { signal, createModel } from "./signal.js"
import type { Exchange, ScriptEntry } from "./types.js"
import {
  RANDOM_AGENT_RESPONSES,
  INPUT_COST_PER_M,
  OUTPUT_COST_PER_M,
  CONTEXT_WINDOW,
} from "../../../silvery/examples/interactive/aichat/script.js"

export type Phase = "idle" | "thinking" | "streaming" | "tools"

const INTRO_TEXT = [
  "AI Chat v2 — New API prototype:",
  " \u2022 Signals — fine-grained reactive state, no full-object spreads",
  " \u2022 Async generators — streaming replaces timer-driven reveal fractions",
  " \u2022 Factory functions — models are plain objects with typed methods",
  " \u2022 Plugin composition — commands, keybindings, auto-advance as plugins",
  " \u2022 TestClock — deterministic time control for async tests",
  " \u2022 Pure tests — model tests need no React rendering",
].join("\n")

/** Default delay — replaced by TestClock in tests. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Token & Cost Utilities ──────────────────────────────────────

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

export function formatCost(inputTokens: number, outputTokens: number): string {
  const cost = (inputTokens * INPUT_COST_PER_M + outputTokens * OUTPUT_COST_PER_M) / 1_000_000
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

export function computeCumulativeTokens(exchanges: Exchange[]): {
  input: number
  output: number
  currentContext: number
} {
  let input = 0
  let output = 0
  let currentContext = 0
  for (const ex of exchanges) {
    if (ex.tokens) {
      input += ex.tokens.input
      output += ex.tokens.output
      if (ex.tokens.input > currentContext) currentContext = ex.tokens.input
    }
  }
  return { input, output, currentContext }
}

// ── Chat Model Factory ──────────────────────────────────────

export interface ChatOpts {
  fast: boolean
  /** Injectable delay for TestClock. Defaults to real setTimeout. */
  delay?: (ms: number) => Promise<void>
}

export function createChat(script: ScriptEntry[], opts: ChatOpts) {
  const delayFn = opts.delay ?? delay

  // ── Signals (reactive state) ──────────────────────────────
  const exchanges = signal<Exchange[]>([{ id: 0, role: "system", content: INTRO_TEXT }])
  const phase = signal<Phase>("idle")
  const currentContent = signal("")
  const activeToolIndex = signal(-1)
  const done = signal(false)
  const compacting = signal(false)
  const pulse = signal(false)
  const contextBaseline = signal(0)
  const autoTypingText = signal<string | null>(null)
  const ctrlDPending = signal(false)
  const elapsed = signal(0)

  let scriptIdx = 0
  let nextId = 1
  let ctrlDResetTimer: ReturnType<typeof setTimeout> | null = null
  let elapsedTimer: ReturnType<typeof setInterval> | null = null

  // Pulse timer (visual heartbeat for activity indicator)
  const pulseTimer = setInterval(() => {
    pulse.value = !pulse.value
  }, 400)

  function addExchange(entry: Omit<Exchange, "id">): Exchange {
    const ex: Exchange = { ...entry, id: nextId++ }
    exchanges.value = [...exchanges.value, ex]
    return ex
  }

  /**
   * Stream an agent response — the headline feature.
   *
   * This async generator replaces 200+ lines of switch/case (streamTick,
   * endThinking, endTools, revealFraction arithmetic) with a linear control
   * flow: thinking → streaming → tools → idle.
   *
   * Each `yield` signals the view to re-render with accumulated content.
   * No revealFraction, no streamTick timer, no named timer effects.
   */
  async function* respond(entry: ScriptEntry): AsyncGenerator<void> {
    const ex = addExchange({ ...entry, content: opts.fast ? entry.content : "" })

    // Phase 1: Thinking
    if (entry.thinking && !opts.fast) {
      phase.value = "thinking"
      await delayFn(1200)
    }

    // Phase 2: Streaming content — word by word
    if (!opts.fast) {
      phase.value = "streaming"
      currentContent.value = ""
      for (const word of entry.content.split(/(\s+)/)) {
        currentContent.value += word
        yield // signal the view to re-render with accumulated content
        if (word.trim()) await delayFn(50)
      }

      // Finalize content on the exchange
      const exs = [...exchanges.value]
      const idx = exs.findIndex((e) => e.id === ex.id)
      if (idx >= 0) exs[idx] = { ...exs[idx]!, content: entry.content }
      exchanges.value = exs
      currentContent.value = ""
    }

    // Phase 3: Tool calls
    const tools = entry.toolCalls ?? []
    if (tools.length > 0 && !opts.fast) {
      phase.value = "tools"
      for (let i = 0; i < tools.length; i++) {
        activeToolIndex.value = i
        yield
        await delayFn(600)
      }
      activeToolIndex.value = -1
    }

    phase.value = "idle"
  }

  async function consumeGenerator(gen: AsyncGenerator): Promise<void> {
    for await (const _ of gen) {
    }
  }

  function findNextAgentEntry(): ScriptEntry | null {
    while (scriptIdx < script.length && script[scriptIdx]!.role === "user") scriptIdx++
    if (scriptIdx >= script.length) return null
    return script[scriptIdx++]!
  }

  // ── Extracted functions (shared by methods + commands) ──────
  function submitFn({ text }: { text: string }) {
    if (done.value) return

    // Fast-forward if still streaming
    if (phase.value !== "idle") {
      phase.value = "idle"
      currentContent.value = ""
      activeToolIndex.value = -1
    }

    if (!text.trim()) return

    addExchange({
      role: "user",
      content: text,
      tokens: { input: text.length * 4, output: 0 },
    })

    // Schedule scripted agent response (uses injectable delay)
    const agentEntry = findNextAgentEntry()
    const entry = agentEntry ?? RANDOM_AGENT_RESPONSES[Math.floor(Math.random() * RANDOM_AGENT_RESPONSES.length)]!
    delayFn(150).then(() => consumeGenerator(respond(entry)))
  }

  async function compactFn() {
    if (done.value || compacting.value) return
    compacting.value = true
    contextBaseline.value = computeCumulativeTokens(exchanges.value).currentContext
    await delayFn(opts.fast ? 300 : 3000)
    compacting.value = false
  }

  function exitFn() {
    done.value = true
  }

  return {
    // Signals (reactive state)
    exchanges,
    phase,
    currentContent,
    activeToolIndex,
    done,
    compacting,
    pulse,
    contextBaseline,
    autoTypingText,
    ctrlDPending,
    elapsed,

    // Internal (for auto-advance plugin)
    addExchange,

    // Constants
    CONTEXT_WINDOW,

    // Methods (behavior) — replaces 14-variant DemoMsg discriminated union

    /** Add a user exchange and trigger scripted agent response. */
    submit: submitFn,

    /** Expose the generator directly for auto-advance and testing. */
    respond,

    /** Compact context — simulates pruning old exchanges. */
    compact: compactFn,

    /** Advance to the next script entry (for initial mount). */
    advance() {
      if (done.value || compacting.value || phase.value !== "idle") return
      if (scriptIdx >= script.length) return

      const entry = script[scriptIdx++]!
      if (entry.role === "user") {
        addExchange(entry)
        // After user entry, auto-play agent response
        const agentEntry = findNextAgentEntry()
        if (agentEntry) consumeGenerator(respond(agentEntry))
      } else {
        consumeGenerator(respond(entry))
      }
    },

    /** Next scripted user message (for footer placeholder hint). */
    getNextHint(): string {
      if (done.value || phase.value !== "idle") return ""
      const entry = script[scriptIdx]
      return entry?.role === "user" ? entry.content : ""
    },

    /** Returns true if should exit (double ctrl+d within 2s). */
    confirmExit(): boolean {
      if (ctrlDPending.value) {
        ctrlDPending.value = false
        if (ctrlDResetTimer) clearTimeout(ctrlDResetTimer)
        return true
      }
      ctrlDPending.value = true
      ctrlDResetTimer = setTimeout(() => {
        ctrlDPending.value = false
      }, 2000)
      return false
    },

    /** Start elapsed-time counter. Call once on app start. */
    startTimer() {
      if (elapsedTimer) return
      const startTime = Date.now()
      elapsedTimer = setInterval(() => {
        elapsed.value = Math.floor((Date.now() - startTime) / 1000)
      }, 1000)
    },

    /** Cleanup all timers. In production, structured concurrency handles this. */
    dispose() {
      clearInterval(pulseTimer)
      if (elapsedTimer) clearInterval(elapsedTimer)
      if (ctrlDResetTimer) clearTimeout(ctrlDResetTimer)
    },

    // ── Commands ({ fn, args? } shape) ────────────────────────────
    // Era 2 structured commands — same behavior, discoverable shape.
    // In production, commands would be the primary interface.
    commands: {
      submit: { fn: submitFn },
      compact: { fn: compactFn },
      exit: { fn: exitFn },
    },
  }
}

export type ChatModel = ReturnType<typeof createChat>

// ── Model Hook ─────────────────────────────────────────────────
//
// createModel wraps the factory → typed hook with Zustand-like API:
//   useChat(m => m.phase)       — signal-aware selector (auto-unwraps)
//   useChat.get()               — raw instance (signals NOT unwrapped)
//   useChat.create(script, opts) — isolated instance (for tests)
//   useChat.bind(script, opts)  — initialize the singleton
//
export const useChat = createModel(createChat)
