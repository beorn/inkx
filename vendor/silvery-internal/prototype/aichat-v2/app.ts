/**
 * App composition — Era 2 input system + auto-advance plugin.
 *
 * This file implements the Era 2 API primitives:
 * - `invoke()` — resolve args via schema, call command fn
 * - `keymap()` + `when()` — declarative key→command mapping
 * - `pipe()` — standard FP left-to-right composition
 * - `autoAdvance()` — behavioral plugin driving scripted conversation
 *
 * In production, `invoke`, `keymap`, `when` come from `@silvery/input`.
 * This prototype provides minimal working versions.
 */

import { delay } from "./model.js"
import type { ChatModel } from "./model.js"
import type { ScriptEntry } from "./types.js"
import type { Signal } from "./signal.js"

// ── Era 2 Input System ───────────────────────────────────────

/** A command is a plain object: fn + optional args schema. */
export interface Command {
  fn: (...args: any[]) => any
  args?: { parse(input: any): any }
}

/** Output of a mapping — which command to invoke, with what args. */
export interface Invocation {
  command: Command
  args?: Record<string, unknown>
}

/** A mapping resolves an event to a command invocation (or null). */
export type Mapping<E> = (event: E) => Invocation | null

/**
 * invoke() — the single dispatch point.
 *
 * Merges event-provided args with signal defaults via schema.parse(),
 * then calls fn. Commands without args just call fn() directly.
 */
export function invoke({ command, args }: Invocation): unknown {
  if (command.args) {
    const resolved = command.args.parse(args ?? {})
    return command.fn(resolved)
  }
  return command.fn()
}

/** Check if a command can be invoked with the given args. */
export function canInvoke(command: Command, args?: Record<string, unknown>): boolean {
  if (!command.args) return true
  try {
    command.args.parse(args ?? {})
    return true
  } catch {
    return false
  }
}

/** Filter commands to those currently invocable. */
export function available(commands: Record<string, Command>, args?: Record<string, unknown>): Record<string, Command> {
  const result: Record<string, Command> = {}
  for (const [name, cmd] of Object.entries(commands)) {
    if (canInvoke(cmd, args)) result[name] = cmd
  }
  return result
}

// ── Keymap ───────────────────────────────────────────────────

interface Binding {
  key: string
  command: Command
  args?: Record<string, unknown>
  when?: Signal<boolean>
}

/**
 * when() — stamps a predicate on a group of bindings.
 *
 * Channel-specific (mode, modifier state), NOT on the command itself.
 * A CLI can invoke the same command regardless of TUI mode.
 */
export function when(predicate: Signal<boolean>, bindings: Record<string, Command>): Binding[] {
  return Object.entries(bindings).map(([key, command]) => ({
    key,
    command,
    when: predicate,
  }))
}

/**
 * keymap() — compose binding groups into a Mapping<string>.
 *
 * Takes any mix of:
 * - `when(signal, { key: command })` — conditional bindings
 * - `{ key: command }` — unconditional bindings
 *
 * Returns a mapping function: key string → Invocation | null.
 */
export function keymap(...groups: Array<Binding[] | Record<string, Command>>): Mapping<string> {
  const bindings: Binding[] = []

  for (const group of groups) {
    if (Array.isArray(group)) {
      bindings.push(...group)
    } else {
      // Plain record — unconditional bindings
      for (const [key, command] of Object.entries(group)) {
        bindings.push({ key, command })
      }
    }
  }

  return (event: string) => {
    for (const b of bindings) {
      if (b.when && !b.when.value) continue
      if (b.key === event) return { command: b.command, args: b.args }
    }
    return null
  }
}

// ── pipe() ───────────────────────────────────────────────────

/** Compose functions left-to-right. Standard FP pipe. */
export function pipe<T>(value: T, ...fns: Array<(v: T) => T>): T {
  return fns.reduce((v, fn) => fn(v), value)
}

// ── Auto-advance Plugin ─────────────────────────────────────

/**
 * Auto-advance plugin — drives the chat model through a scripted conversation.
 *
 * Replaces the auto-advance logic that was deeply embedded in the TEA state
 * machine (autoAdvance msg, autoTyping sub-state, typingTick timer, etc.)
 * with a clean external driver that composes at the app level.
 *
 * In production:
 *   pipe(createApp(...), args.auto ? withAutoAdvance(SCRIPT) : identity)
 */
export async function autoAdvance(chat: ChatModel, script: ScriptEntry[], opts: { fast: boolean }): Promise<void> {
  for (const entry of script) {
    if (chat.done.value) break

    if (entry.role === "user") {
      // Auto-type the user message character by character
      if (!opts.fast) {
        for (let i = 0; i <= entry.content.length; i++) {
          chat.autoTypingText.value = entry.content.slice(0, i)
          await delay(30)
        }
        await delay(300)
        chat.autoTypingText.value = null
      }
      // Add user exchange via model's addExchange (preserves nextId sequence)
      chat.addExchange({ role: "user", content: entry.content, tokens: entry.tokens })
    } else {
      // Drive agent response via async generator
      for await (const _ of chat.respond(entry)) {
      }
    }

    if (!opts.fast) await delay(400)
  }

  chat.done.value = true
}
