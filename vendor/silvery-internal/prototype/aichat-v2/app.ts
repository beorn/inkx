/**
 * Era 2 input system + composition helpers.
 *
 * Implements the core primitives from @silvery/input:
 * - Command, Invocation, Mapping<E> — the shapes
 * - invoke() — single dispatch point
 * - keymap(), when() — declarative key→command mapping
 * - doublePress() — chord-like stateful binding
 * - autoAdvance(), idleAutoSubmit() — behavioral plugins
 *
 * All timers go through the ambient scope (via useScope() / ALS).
 */

import { signal } from "./signal.js"
import { useScope } from "./scope.js"
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
 * Timer lifecycle is owned by the ambient scope — cancelled on dispose.
 */
export function doublePress(
  key: string,
  command: Command,
  opts?: { timeout?: number },
): { bindings: Binding[]; pending: Signal<boolean> } {
  const scope = useScope()
  const timeoutMs = opts?.timeout ?? 2000
  const pending = signal(false)
  let cancelTimer: (() => void) | null = null

  const wrapper: Command = {
    fn() {
      if (pending.value) {
        pending.value = false
        if (cancelTimer) {
          cancelTimer()
          cancelTimer = null
        }
        command.fn()
      } else {
        pending.value = true
        cancelTimer = scope.timeout(timeoutMs, () => {
          pending.value = false
          cancelTimer = null
        })
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
  const scope = useScope()

  for (const entry of script) {
    if (chat.done.value || scope.cancelled) break

    if (entry.role === "user") {
      if (!opts.fast) {
        for (let i = 0; i <= entry.content.length; i++) {
          chat.autoTypingText.value = entry.content.slice(0, i)
          await scope.sleep(30)
          if (scope.cancelled) return
        }
        await scope.sleep(300)
        chat.autoTypingText.value = null
      }
      chat.addExchange({ role: "user", content: entry.content, tokens: entry.tokens })
    } else {
      for await (const _ of chat.respond(entry)) {
        /* drain */
      }
    }

    if (!opts.fast) await scope.sleep(400)
  }

  chat.done.value = true
}

/** Idle auto-submit — submits the next hint after idle delay (interactive demo). */
export function idleAutoSubmit(chat: ChatModel, opts?: { delay?: number }): void {
  const scope = useScope()
  const delayMs = opts?.delay ?? 10_000
  let cancelTimer: (() => void) | null = null

  const schedule = () => {
    if (cancelTimer) {
      cancelTimer()
      cancelTimer = null
    }
    if (scope.cancelled || chat.done.value || chat.compacting.value || chat.phase.value !== "idle") return
    const hint = chat.getNextHint()
    if (!hint) return
    cancelTimer = scope.timeout(delayMs, () => {
      invoke({ command: chat.commands.submit, args: { text: hint } })
    })
  }

  const unsubs = [chat.phase.subscribe(schedule), chat.done.subscribe(schedule), chat.exchanges.subscribe(schedule)]
  scope.onDispose(() => {
    for (const fn of unsubs) fn()
  })
  schedule()
}
