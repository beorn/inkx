/**
 * Shim for @silvery/commands.
 * Production: command types, keymap composition, dispatch.
 */

import { signal, type WritableSignal } from "./signals.js"
import type { Scope } from "./scope.js"

// ── Types ───────────────────────────────────────────────────────

export interface Command {
  fn: (...args: any[]) => any
  args?: { parse(input: any): any }
}

export interface Invocation {
  command: Command
  args?: Record<string, unknown>
}

export type Mapping<E> = (event: E) => Invocation | null

interface Binding {
  key: string
  command: Command
  args?: Record<string, unknown>
  when?: () => boolean
}

// ── Keymap API ──────────────────────────────────────────────────

/**
 * Era 2 pattern: returns per-binding descriptors carrying a predicate.
 * Object spread produces descriptors: { key: { when, command } }
 * app.keymap() inspects each value — if it has a `when` property, the binding is conditional.
 */
export function when(
  predicate: () => boolean,
  bindings: Record<string, Command>,
): Record<string, { when: () => boolean; command: Command }> {
  const result: Record<string, { when: () => boolean; command: Command }> = {}
  for (const [key, command] of Object.entries(bindings)) {
    result[key] = { when: predicate, command }
  }
  return result
}

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
      if (b.when && !b.when()) continue
      if (b.key === event) return { command: b.command, args: b.args }
    }
    return null
  }
}

// ── Dispatch ────────────────────────────────────────────────────

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
