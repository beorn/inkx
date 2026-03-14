/**
 * Era 2 input system + composition helpers.
 *
 * Implements the core primitives from @silvery/input:
 * - Command, Invocation, Mapping<E> — the shapes
 * - invoke() — single dispatch point
 * - keymap(), when() — declarative key→command mapping
 * - doublePress() — chord-like stateful binding
 * - autoAdvance() — behavioral plugin
 */

import { signal } from "./signal.js"
import { delay } from "./model.js"
import type { ChatModel } from "./model.js"
import type { ScriptEntry } from "./types.js"
import type { Signal } from "./signal.js"

// ── Shapes ───────────────────────────────────────────────────

export interface Command {
  fn: (...args: any[]) => any
  args?: { parse(input: any): any }
}

export interface Invocation {
  command: Command
  args?: Record<string, unknown>
}

export type Mapping<E> = (event: E) => Invocation | null

// ── Dispatch ─────────────────────────────────────────────────

export function invoke({ command, args }: Invocation): unknown {
  if (command.args) return command.fn(command.args.parse(args ?? {}))
  return command.fn()
}

export function canInvoke(command: Command, args?: Record<string, unknown>): boolean {
  if (!command.args) return true
  try {
    command.args.parse(args ?? {})
    return true
  } catch {
    return false
  }
}

// ── Keymap ───────────────────────────────────────────────────

interface Binding {
  key: string
  command: Command
  args?: Record<string, unknown>
  when?: Signal<boolean>
}

export function when(predicate: Signal<boolean>, bindings: Record<string, Command>): Binding[] {
  return Object.entries(bindings).map(([key, command]) => ({ key, command, when: predicate }))
}

/**
 * doublePress() — chord-like binding requiring two presses within a timeout.
 *
 * State lives in the keymap closure as a signal (same primitive, narrower scope).
 * The `pending` signal is returned so the view can show "press again to exit".
 */
export function doublePress(
  key: string,
  command: Command,
  timeoutMs = 2000,
): { bindings: Binding[]; pending: Signal<boolean> } {
  const pending = signal(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  const wrapper: Command = {
    fn() {
      if (pending.value) {
        pending.value = false
        if (timer) clearTimeout(timer)
        command.fn()
      } else {
        pending.value = true
        timer = setTimeout(() => {
          pending.value = false
        }, timeoutMs)
      }
    },
  }

  return { bindings: [{ key, command: wrapper }], pending }
}

export function keymap(...groups: Array<Binding[] | Record<string, Command>>): Mapping<string> {
  const bindings: Binding[] = []
  for (const group of groups) {
    if (Array.isArray(group)) bindings.push(...group)
    else for (const [key, command] of Object.entries(group)) bindings.push({ key, command })
  }

  return (event: string) => {
    for (const b of bindings) {
      if (b.when && !b.when.value) continue
      if (b.key === event) return { command: b.command, args: b.args }
    }
    return null
  }
}

// ── Composition ──────────────────────────────────────────────

export function pipe<T>(value: T, ...fns: Array<(v: T) => T>): T {
  return fns.reduce((v, fn) => fn(v), value)
}

// ── Plugins ─────────────────────────────────────────────────

/** Auto-advance — drives the script programmatically (--auto mode). */
export async function autoAdvance(chat: ChatModel, script: ScriptEntry[], opts: { fast: boolean }): Promise<void> {
  for (const entry of script) {
    if (chat.done.value) break

    if (entry.role === "user") {
      if (!opts.fast) {
        for (let i = 0; i <= entry.content.length; i++) {
          chat.autoTypingText.value = entry.content.slice(0, i)
          await delay(30)
        }
        await delay(300)
        chat.autoTypingText.value = null
      }
      chat.addExchange({ role: "user", content: entry.content, tokens: entry.tokens })
    } else {
      for await (const _ of chat.respond(entry)) {
        /* drain */
      }
    }

    if (!opts.fast) await delay(400)
  }

  chat.done.value = true
}

/** Idle auto-submit — submits the next hint after idle delay (interactive demo). */
export function idleAutoSubmit(chat: ChatModel, delayMs = 10_000): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  const schedule = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (chat.done.value || chat.compacting.value || chat.phase.value !== "idle") return
    const hint = chat.getNextHint()
    if (!hint) return
    timer = setTimeout(() => invoke({ command: chat.commands.submit, args: { text: hint } }), delayMs)
  }

  const unsubs = [chat.phase.subscribe(schedule), chat.done.subscribe(schedule), chat.exchanges.subscribe(schedule)]
  schedule()

  return () => {
    if (timer) clearTimeout(timer)
    for (const fn of unsubs) fn()
  }
}
