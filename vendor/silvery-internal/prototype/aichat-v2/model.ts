/**
 * Chat model — pure state + commands + async generators.
 *
 * No timers, no I/O, no view concerns. The model owns:
 * - Signals (reactive state — optional, from @silvery/signals)
 * - Commands ({ title, fn, args? } — from @silvery/commands, state-agnostic)
 * - Async generators (streaming)
 *
 * The model receives scope via ModelContext — no ambient lookup,
 * no useScope(), no AsyncLocalStorage. This makes models testable
 * (pass a test scope) and composable (share an app scope).
 *
 * In production, imports would come from:
 * - signal()       → `@silvery/signals` (plural, Decision 35; optional, Decision 34)
 * - createModel()  → `@silvery/model` (optional, Decision 34)
 * - Commands       → `@silvery/commands` (depends only on @silvery/create)
 * - tea()          → `@silvery/create` (Decision 31 — tea dissolved into create)
 *
 * Key design points:
 * - Signals use callable accessors: phase() to read, phase("idle") to write (Decision 29)
 * - Commands are plain objects { title, fn, args? } — closures capture whatever state they use (Decision 30)
 * - Commands are state-agnostic — @silvery/commands has no signal dependency (Decision 30)
 * - Signals are optional — commands work without them (Decision 34)
 */

import { z } from "zod"
import { signal, createModel, type ModelContext } from "./signal.js"
import type { Message, ScriptEntry } from "./types.js"
import {
  RANDOM_AGENT_RESPONSES,
  INPUT_COST_PER_M,
  OUTPUT_COST_PER_M,
  CONTEXT_WINDOW,
} from "../../../silvery/examples/interactive/aichat/script.js"

export type Phase = "idle" | "thinking" | "streaming" | "tools"

// ── Chat Model Factory ──────────────────────────────────────

export function createChat(ctx: ModelContext, script: ScriptEntry[]) {
  const { scope } = ctx

  // ── Signals (from @silvery/signals — optional) ──────────────
  // Callable accessor pattern: messages() to read, messages([...]) to write
  const messages = signal<Message[]>([{ id: 0, role: "system", content: INTRO_TEXT }])
  const phase = signal<Phase>("idle")
  const currentContent = signal("")
  const activeToolIndex = signal(-1)
  const done = signal(false)
  const compacting = signal(false)
  const contextBaseline = signal(0)
  const autoTypingText = signal<string | null>(null)

  let scriptIdx = 0
  let nextId = 1

  // ── Commands (from @silvery/commands — state-agnostic, depends only on @silvery/create) ──
  // Commands are plain objects { title, fn, args? } (Decision 4, 30)
  // Closures capture whatever state they use — no signal dependency in the command system
  // when() predicates are () => boolean — commands work with any state system or none

  const commands = {
    submit: {
      title: "Submit Message",
      args: z.object({ text: z.string() }),
      fn({ text }: { text: string }) {
        if (done()) return

        // Fast-forward if still streaming
        if (phase() !== "idle") {
          phase("idle")
          currentContent("")
          activeToolIndex(-1)
        }

        if (!text.trim()) return

        addMessage({
          role: "user",
          content: text,
          tokens: { input: text.length * 4, output: 0 },
        })

        scheduleResponse()
      },
    },

    compact: {
      title: "Compact Context",
      async fn() {
        if (done() || compacting()) return
        compacting(true)
        contextBaseline(computeCumulativeTokens(messages()).currentContext)
        await scope.sleep(3000)
        compacting(false)
      },
    },

    exit: {
      title: "Exit",
      fn() {
        done(true)
      },
    },
  }

  // ── Return ─────────────────────────────────────────────────

  return {
    messages,
    phase,
    currentContent,
    activeToolIndex,
    done,
    compacting,
    contextBaseline,
    autoTypingText,
    commands,
    respond,
    addMessage,
    advance,
    getNextHint,
    CONTEXT_WINDOW,
  }

  // ── Internal (hoisted) ─────────────────────────────────────

  function addMessage(entry: Omit<Message, "id">): Message {
    const msg: Message = { ...entry, id: nextId++ }
    messages([...messages(), msg])
    return msg
  }

  /** Streaming — thinking → content (word by word) → tools → idle. */
  async function* respond(entry: ScriptEntry): AsyncGenerator<void> {
    const msg = addMessage({ ...entry, content: "" })

    if (entry.thinking) {
      phase("thinking")
      await scope.sleep(1200)
    }

    phase("streaming")
    currentContent("")
    for (const word of entry.content.split(/(\s+)/)) {
      currentContent(currentContent() + word)
      yield
      if (word.trim()) await scope.sleep(50)
    }
    const msgs = [...messages()]
    const idx = msgs.findIndex((m) => m.id === msg.id)
    if (idx >= 0) msgs[idx] = { ...msgs[idx]!, content: entry.content }
    messages(msgs)
    currentContent("")

    const tools = entry.toolCalls ?? []
    if (tools.length > 0) {
      phase("tools")
      for (let i = 0; i < tools.length; i++) {
        activeToolIndex(i)
        yield
        await scope.sleep(600)
      }
      activeToolIndex(-1)
    }

    phase("idle")
  }

  function scheduleResponse() {
    const agentEntry = findNextAgentEntry()
    const entry = agentEntry ?? RANDOM_AGENT_RESPONSES[Math.floor(Math.random() * RANDOM_AGENT_RESPONSES.length)]!
    scope.sleep(150).then(() => {
      if (!scope.cancelled) drain(respond(entry))
    })
  }

  function advance() {
    if (done() || compacting() || phase() !== "idle") return
    if (scriptIdx >= script.length) return

    const entry = script[scriptIdx++]!
    if (entry.role === "user") {
      addMessage(entry)
      const agentEntry = findNextAgentEntry()
      if (agentEntry) drain(respond(agentEntry))
    } else {
      drain(respond(entry))
    }
  }

  function getNextHint(): string {
    if (done() || phase() !== "idle") return ""
    const entry = script[scriptIdx]
    return entry?.role === "user" ? entry.content : ""
  }

  function findNextAgentEntry(): ScriptEntry | null {
    while (scriptIdx < script.length && script[scriptIdx]!.role === "user") scriptIdx++
    if (scriptIdx >= script.length) return null
    return script[scriptIdx++]!
  }
}

export type ChatModel = ReturnType<typeof createChat>
export const useChat = createModel(createChat)

// ── Utilities ────────────────────────────────────────────────

async function drain(gen: AsyncGenerator): Promise<void> {
  for await (const _ of gen) {
    /* drain */
  }
}

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

export function computeCumulativeTokens(messages: Message[]): {
  input: number
  output: number
  currentContext: number
} {
  let input = 0
  let output = 0
  let currentContext = 0
  for (const msg of messages) {
    if (msg.tokens) {
      input += msg.tokens.input
      output += msg.tokens.output
      if (msg.tokens.input > currentContext) currentContext = msg.tokens.input
    }
  }
  return { input, output, currentContext }
}

const INTRO_TEXT = [
  "AI Chat v2 — Era 2 API prototype:",
  " \u2022 @silvery/signals — callable accessor: count() read, count(5) write (optional)",
  " \u2022 @silvery/commands — { title, fn, args? } state-agnostic (depends on create only)",
  " \u2022 @silvery/commands — keymap(), when(() => bool), invoke()",
  " \u2022 @silvery/create — pipe(), tea() (zero deps)",
  " \u2022 @silvery/scope — structured concurrency for timers and lifecycle",
  " \u2022 @silvery/model — factory functions, explicit DI (optional)",
  " \u2022 @silvery/ag-react — rendering, @silvery/ag-term — terminal surface",
  " \u2022 Signals optional — commands work without them (Decision 34)",
  " \u2022 Pure tests — model tests need no React rendering",
].join("\n")
