/**
 * App composition — plugins, auto-advance driver.
 *
 * This file demonstrates the Era 2 API shape:
 * - `pipe()` for plugin composition
 * - `withAutoAdvance()` as a behavioral plugin
 * - Models accessed via `useChat.get()` (no React context, no prop drilling)
 *
 * In production, `createApp`, `pipe`, `keymap`, `withTerminal` would
 * come from `@silvery/tea`. This prototype provides minimal working versions.
 */

import { delay } from "./model.js"
import type { ChatModel } from "./model.js"
import type { ScriptEntry } from "./types.js"

// ── pipe() ──────────────────────────────────────────────────────

/** Compose functions left-to-right. Standard FP pipe. */
export function pipe<T>(value: T, ...fns: Array<(v: T) => T>): T {
  return fns.reduce((v, fn) => fn(v), value)
}

// ── Auto-advance Plugin ─────────────────────────────────────────

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

// ── Era 2 API Shape ─────────────────────────────────────────────
//
// Types:
//   type Command = { fn: (...args: any[]) => any; args?: { parse(input: any): any } }
//   type Invocation = { command: Command; args?: Record<string, unknown> }
//   type Mapping<E> = (event: E) => Invocation | null
//
// invoke():
//   function invoke({ command, args }: Invocation) {
//     if (command.args) {
//       const resolved = command.args.parse(args ?? {})
//       return command.fn(resolved)
//     }
//     return command.fn()
//   }
//
// keymap():
//   function keymap(...groups): Mapping<KeyStroke> {
//     const bindings = flatten(groups)
//     return (e: KeyStroke) => {
//       for (const b of bindings) {
//         if (b.when && !b.when.value) continue
//         if (matches(b.key, e)) return { command: b.command }
//       }
//       return null
//     }
//   }
//
// withTerminal():
//   function withTerminal({ view, keys }: {
//     view: JSX.Element
//     keys?: Mapping<KeyStroke>
//   }): Disposable {
//     const term = enterAlternateScreen(stdout)
//     const renderer = createRenderer(term)
//     renderer.render(view)
//     const scope = createScope()
//     scope.run(async () => {
//       for await (const e of termKeySource(stdin)) {
//         const inv = keys?.(e)
//         if (inv) invoke(inv)
//       }
//     })
//     return {
//       [Symbol.dispose]() {
//         scope.cancel()
//         renderer.unmount()
//         term.restore()
//       }
//     }
//   }
//
// Full composition:
//   const keys = keymap(
//     when(isNormal, { enter: commands.submit, "ctrl+l": commands.compact }),
//     { escape: commands.exit },
//   )
//   using app = withTerminal({ view: <ChatView />, keys })
