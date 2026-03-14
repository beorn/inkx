/**
 * Chat model — pure state + commands + async generators.
 *
 * No timers, no I/O, no view concerns. The model owns:
 * - Signals (reactive state)
 * - Commands ({ fn, args? } — the primary interface)
 * - Async generators (streaming)
 *
 * The model receives scope via ModelContext — no ambient lookup,
 * no useScope(), no AsyncLocalStorage. This makes models testable
 * (pass a test scope) and composable (share an app scope).
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

  // ── Signals ────────────────────────────────────────────────
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

  // ── Commands ({ fn, args? } — the primary interface) ───────

  const commands = {
    submit: {
      args: z.object({ text: z.string() }),
      fn({ text }: { text: string }) {
        if (done.value) return

        // Fast-forward if still streaming
        if (phase.value !== "idle") {
          phase.value = "idle"
          currentContent.value = ""
          activeToolIndex.value = -1
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
      async fn() {
        if (done.value || compacting.value) return
        compacting.value = true
        contextBaseline.value = computeCumulativeTokens(messages.value).currentContext
        await scope.sleep(3000)
        compacting.value = false
      },
    },

    exit: {
      fn() {
        done.value = true
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
    messages.value = [...messages.value, msg]
    return msg
  }

  /** Streaming — thinking → content (word by word) → tools → idle. */
  async function* respond(entry: ScriptEntry): AsyncGenerator<void> {
    const msg = addMessage({ ...entry, content: "" })

    if (entry.thinking) {
      phase.value = "thinking"
      await scope.sleep(1200)
    }

    phase.value = "streaming"
    currentContent.value = ""
    for (const word of entry.content.split(/(\s+)/)) {
      currentContent.value += word
      yield
      if (word.trim()) await scope.sleep(50)
    }
    const msgs = [...messages.value]
    const idx = msgs.findIndex((m) => m.id === msg.id)
    if (idx >= 0) msgs[idx] = { ...msgs[idx]!, content: entry.content }
    messages.value = msgs
    currentContent.value = ""

    const tools = entry.toolCalls ?? []
    if (tools.length > 0) {
      phase.value = "tools"
      for (let i = 0; i < tools.length; i++) {
        activeToolIndex.value = i
        yield
        await scope.sleep(600)
      }
      activeToolIndex.value = -1
    }

    phase.value = "idle"
  }

  function scheduleResponse() {
    const agentEntry = findNextAgentEntry()
    const entry = agentEntry ?? RANDOM_AGENT_RESPONSES[Math.floor(Math.random() * RANDOM_AGENT_RESPONSES.length)]!
    scope.sleep(150).then(() => {
      if (!scope.cancelled) drain(respond(entry))
    })
  }

  function advance() {
    if (done.value || compacting.value || phase.value !== "idle") return
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
    if (done.value || phase.value !== "idle") return ""
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
  " \u2022 Signals — fine-grained reactive state",
  " \u2022 Commands — { fn, args? } as the interface",
  " \u2022 Keymap — declarative key→command dispatch via invoke()",
  " \u2022 Async generators — streaming replaces timer-driven reveals",
  " \u2022 Scope — structured concurrency for timers and lifecycle",
  " \u2022 Factory functions — models are plain objects",
  " \u2022 Pure tests — model tests need no React rendering",
].join("\n")
