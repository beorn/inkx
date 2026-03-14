/**
 * Era 2 input system + composition helpers.
 *
 * Implements the core primitives from @silvery/input:
 * - Command, Invocation, Mapping<E> — the shapes
 * - invoke() — single dispatch point
 * - keymap(), when() — declarative key→command mapping
 * - doublePress() — chord-like stateful binding
 * - withTerminal() — surface that owns input dispatch outside React
 * - autoAdvance(), idleAutoSubmit() — behavioral plugins
 *
 * All timers go through an explicitly passed scope — no ambient lookup.
 */

import type { ReactElement } from "react"
import { createApp, type Key, type AppHandle } from "@silvery/term/runtime"
import { signal } from "./signal.js"
import type { Scope } from "./scope.js"
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
 * Timer lifecycle is owned by the passed scope — cancelled on dispose.
 */
export function doublePress(
  scope: Scope,
  key: string,
  command: Command,
  opts?: { timeout?: number },
): { bindings: Binding[]; pending: Signal<boolean> } {
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

// ── Key Normalization ────────────────────────────────────────

/** Normalize silvery's Key object to the string format keymaps expect. */
function normalizeKey(input: string, key: Key): string {
  if (key.escape) return "escape"
  if (key.ctrl) return `ctrl+${input}`
  return input
}

// ── Surface ─────────────────────────────────────────────────

/**
 * withTerminal() — Era 2 surface that owns the input loop.
 *
 * Wraps createApp() (Layer 3) with a term:key handler that dispatches
 * through the keymap. Key events flow:
 *
 *   stdin → parse → focus tree (TextArea consumes typing) → term:key → keymap → invoke
 *
 * The view is pure rendering — no onKeyDown, no useInput. All input
 * handling happens here, outside React.
 */
export async function withTerminal({
  view,
  keys,
  mode = "inline",
  focusReporting = true,
}: {
  view: ReactElement
  keys?: Mapping<string>
  mode?: "inline" | "fullscreen"
  focusReporting?: boolean
}): Promise<AppHandle<Record<string, unknown>>> {
  const app = createApp(() => () => ({}), {
    "term:key": (data) => {
      const { input, key } = data as { input: string; key: Key }
      const keyStr = normalizeKey(input, key)
      const inv = keys?.(keyStr)
      if (inv) invoke(inv)
    },
  })

  return app.run(view, { mode, focusReporting })
}

// ── Composition ──────────────────────────────────────────────

export function pipe<T>(value: T, ...fns: Array<(v: T) => T>): T {
  return fns.reduce((v, fn) => fn(v), value)
}

// ── Plugins ─────────────────────────────────────────────────

/**
 * Auto-advance — drives the script programmatically (--auto mode).
 *
 * No `fast` flag needed — an instant scope makes all sleeps resolve
 * immediately, so the typing animation loop runs at zero delay.
 */
export async function autoAdvance(scope: Scope, chat: ChatModel, script: ScriptEntry[]): Promise<void> {
  for (const entry of script) {
    if (chat.done.value || scope.cancelled) break

    if (entry.role === "user") {
      for (let i = 0; i <= entry.content.length; i++) {
        chat.autoTypingText.value = entry.content.slice(0, i)
        await scope.sleep(30)
        if (scope.cancelled) return
      }
      await scope.sleep(300)
      chat.autoTypingText.value = null
      chat.addMessage({ role: "user", content: entry.content, tokens: entry.tokens })
    } else {
      for await (const _ of chat.respond(entry)) {
        /* drain */
      }
    }

    await scope.sleep(400)
  }

  chat.done.value = true
}

/** Idle auto-submit — submits the next hint after idle delay (interactive demo). */
export function idleAutoSubmit(scope: Scope, chat: ChatModel, opts?: { delay?: number }): void {
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

  const unsubs = [chat.phase.subscribe(schedule), chat.done.subscribe(schedule), chat.messages.subscribe(schedule)]
  scope.onDispose(() => {
    for (const fn of unsubs) fn()
  })
  schedule()
}
