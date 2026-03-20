/**
 * AI Chat v2 — Era 2 composition.
 *
 * scope → model(ctx) → commands → keymap → withTerminal({ view, keys })
 *
 * Everything behavioral is composed here. The view is pure rendering.
 * The root scope owns all timers — `using` ensures cleanup.
 * Scope is passed explicitly via ModelContext — no ambient lookup.
 *
 * In production, the imports would come from:
 * - signal()                  → `@silvery/signals` (optional)
 * - createScope/InstantScope  → `@silvery/scope`
 * - useChat (createModel)     → `@silvery/model` (optional)
 * - keymap, when, doublePress → `@silvery/commands`
 * - withTerminal              → `@silvery/ag-term` (surface adapter)
 * - autoAdvance, idleAutoSubmit → app-specific plugins (not in a silvery package)
 * - pipe                      → `@silvery/create`
 *
 * `--fast` creates an instant scope — all sleeps resolve immediately,
 * so animations run at zero delay. The model doesn't know about fast.
 *
 * Flags: --auto (auto-advance) --fast (instant scope) --stress (200 messages)
 */

import React from "react"
import { signal } from "./signal.js"
import { createScope, createInstantScope } from "./scope.js"
import { useChat } from "./model.js"
import { keymap, when, doublePress, withTerminal, autoAdvance, idleAutoSubmit } from "./app.js"
import { ChatView } from "./view.js"
import { SCRIPT, generateStressScript } from "../../../silvery/examples/interactive/aichat/script.js"

async function main() {
  const args = process.argv.slice(2)
  const fast = args.includes("--fast")
  const auto = args.includes("--auto")
  const script = args.includes("--stress") ? generateStressScript() : SCRIPT
  const mode = args.includes("--fullscreen") ? "fullscreen" : "inline"

  // 0. Scope — owns all timers, passed explicitly via ModelContext
  //    --fast: instant scope skips all animation delays
  using scope = fast ? createInstantScope() : createScope()

  // 1. Model — receives scope via ModelContext (no ambient lookup)
  const chat = useChat.bind({ scope }, script)

  // 2. Keymap — all key dispatch is declarative
  //    when() takes () => boolean predicates (Decision 30).
  //    A signal IS () => T (callable accessor), so it satisfies the predicate type naturally.
  const isActive = signal(true)
  const ctrlD = doublePress(scope, "ctrl+d", chat.commands.exit)
  const keys = keymap(
    when(isActive, { "ctrl+l": chat.commands.compact }),
    { escape: chat.commands.exit },
    ctrlD.bindings,
  )

  // 3. Surface — withTerminal owns the input loop (outside React)
  //    Keys flow: stdin → focus tree (TextArea) → term:key → keymap → invoke
  using handle = await withTerminal({
    view: <ChatView ctrlDPending={ctrlD.pending} />,
    keys,
    mode: mode as "inline" | "fullscreen",
  })

  // 4. Plugins — all behavioral concerns composed externally
  chat.advance()
  if (auto) {
    autoAdvance(scope, chat, script).catch(console.error)
  } else {
    idleAutoSubmit(scope, chat)
  }

  // 5. Exit — react to done signal (callable accessor pattern: chat.done() to read)
  chat.done.subscribe(() => {
    if (chat.done()) scope.timeout(auto ? 1000 : 0, () => handle.unmount())
  })

  await handle.waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
