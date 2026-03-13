/**
 * App composition — plugins, auto-advance driver.
 *
 * This file demonstrates the Era 2 API shape:
 * - `pipe()` for plugin composition
 * - `withAutoAdvance()` as a behavioral plugin
 * - Models accessed via `useChat.get()` (no React context, no prop drilling)
 *
 * In production, `createApp`, `pipe`, `withCommands`, `withKeybindings` would
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

// ── Aspirational API Shape ──────────────────────────────────────
//
// The full Era 2 API would compose like this:
//
//   // Models — module-level, no Provider ceremony
//   const useChat = createModel(createChat)
//
//   // Initialize with deps at startup
//   useChat.bind(script, { fast, delay: fx.delay })
//
//   const app = pipe(
//     createApp(<ChatView />, { providers }),
//     withCommands({
//       "chat.submit": { name: "Send Message", action: () => useChat.get().submit({ text }) },
//       "chat.compact": { name: "Compact Context", action: () => useChat.get().compact() },
//       "app.exit": { name: "Exit", action: () => exit() },
//     }),
//     withKeybindings({ enter: "chat.submit", "ctrl+l": "chat.compact", escape: "app.exit" }),
//     args.auto ? withAutoAdvance(SCRIPT) : identity,
//   )
//
//   await app.run()
