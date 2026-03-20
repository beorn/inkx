/**
 * Era 2 input system + composition helpers.
 *
 * In production, these would come from separate packages:
 * - Command, Invocation, Mapping<E>, invoke(), canInvoke()  → `@silvery/commands`
 * - keymap(), when()                                         → `@silvery/commands`
 * - pipe()                                                   → `@silvery/create`
 * - withTerminal()                                           → `@silvery/ag-term` (surface adapter)
 *
 * Key design points:
 * - Commands are plain objects { title, fn, args? } (Decision 4, 30)
 * - Commands are state-agnostic — closures capture whatever state they use
 * - when() takes () => boolean predicates, NOT signal accessors (Decision 30)
 * - pipe() and tea() live in @silvery/create (Decision 31)
 * - Signals are optional — commands work without them (Decision 34)
 *
 * This file inlines what would be @silvery/commands + @silvery/create + surface adapter
 * for prototype simplicity.
 *
 * All timers go through an explicitly passed scope — no ambient lookup.
 */

import type { ReactElement } from "react"
import { createApp, type Key, type AppHandle } from "@silvery/term/runtime"
import { signal, type WritableSignal } from "./signal.js"
import type { Scope } from "./scope.js"
import type { ChatModel } from "./model.js"
import type { ScriptEntry } from "./types.js"

// ── Shapes (from @silvery/commands) ──────────────────────────

export interface Command {
  fn: (...args: any[]) => any
  args?: { parse(input: any): any }
}

export interface Invocation {
  command: Command
  args?: Record<string, unknown>
}

export type Mapping<E> = (event: E) => Invocation | null

// ── Dispatch (from @silvery/commands) ────────────────────────

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

// ── Keymap (from @silvery/commands) ──────────────────────────

interface Binding {
  key: string
  command: Command
  args?: Record<string, unknown>
  /** () => boolean predicate — NOT a signal accessor (Decision 30).
   *  Commands are state-agnostic; when() uses plain functions. */
  when?: () => boolean
}

/**
 * when() — conditional bindings with () => boolean predicates.
 *
 * Decision 30: when() takes plain () => boolean predicates, NOT signal accessors.
 * This keeps @silvery/commands free of signal dependencies. For reactive availability
 * in toolbars/palettes, wrap with computed() from your signal library of choice.
 */
export function when(predicate: () => boolean, bindings: Record<string, Command>): Binding[] {
  return Object.entries(bindings).map(([key, command]) => ({ key, command, when: predicate }))
}

/**
 * doublePress() — chord-like binding requiring two presses within a timeout.
 *
 * State lives in the keymap closure as a signal (same primitive, narrower scope).
 * Timer lifecycle is owned by the passed scope — cancelled on dispose.
 *
 * Uses callable accessor pattern: pending() to read, pending(true) to write (Decision 29).
 */
export function doublePress(
  scope: Scope,
  key: string,
  command: Command,
  opts?: { timeout?: number },
): { bindings: Binding[]; pending: WritableSignal<boolean> } {
  const timeoutMs = opts?.timeout ?? 2000
  const pending = signal(false)
  let cancelTimer: (() => void) | null = null

  const wrapper: Command = {
    fn() {
      if (pending()) {
        pending(false)
        if (cancelTimer) {
          cancelTimer()
          cancelTimer = null
        }
        command.fn()
      } else {
        pending(true)
        cancelTimer = scope.timeout(timeoutMs, () => {
          pending(false)
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
      if (b.when && !b.when()) continue  // () => boolean predicate (Decision 30)
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

// ── Surface (from @silvery/ag-term) ─────────────────────────

/**
 * withTerminal() — Era 2 surface that owns the input loop.
 *
 * Production: this would be the surface adapter in @silvery/ag-term,
 * which converts platform-specific events (terminal escape sequences)
 * to normalized key strings before reaching the keymap.
 *
 * Wraps createApp() with a term:key handler that dispatches through
 * the keymap. Key events flow:
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

// ── Composition (from @silvery/create) ───────────────────────

export function pipe<T>(value: T, ...fns: Array<(v: T) => T>): T {
  return fns.reduce((v, fn) => fn(v), value)
}

// ── Plugins ─────────────────────────────────────────────────

/**
 * Auto-advance — drives the script programmatically (--auto mode).
 *
 * No `fast` flag needed — an instant scope makes all sleeps resolve
 * immediately, so the typing animation loop runs at zero delay.
 *
 * Uses callable accessor pattern: chat.done() to read, chat.done(true) to write (Decision 29).
 */
export async function autoAdvance(scope: Scope, chat: ChatModel, script: ScriptEntry[]): Promise<void> {
  for (const entry of script) {
    if (chat.done() || scope.cancelled) break

    if (entry.role === "user") {
      for (let i = 0; i <= entry.content.length; i++) {
        chat.autoTypingText(entry.content.slice(0, i))
        await scope.sleep(30)
        if (scope.cancelled) return
      }
      await scope.sleep(300)
      chat.autoTypingText(null)
      chat.addMessage({ role: "user", content: entry.content, tokens: entry.tokens })
    } else {
      for await (const _ of chat.respond(entry)) {
        /* drain */
      }
    }

    await scope.sleep(400)
  }

  chat.done(true)
}

/**
 * Idle auto-submit — submits the next hint after idle delay (interactive demo).
 *
 * Uses callable accessor pattern: chat.done() to read, chat.phase() to read (Decision 29).
 */
export function idleAutoSubmit(scope: Scope, chat: ChatModel, opts?: { delay?: number }): void {
  const delayMs = opts?.delay ?? 10_000
  let cancelTimer: (() => void) | null = null

  const schedule = () => {
    if (cancelTimer) {
      cancelTimer()
      cancelTimer = null
    }
    if (scope.cancelled || chat.done() || chat.compacting() || chat.phase() !== "idle") return
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
