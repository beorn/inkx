/**
 * AI Chat v2 — Era 2 composition.
 *
 * scope → signals → commands → keymap → surface → plugins
 *
 * Everything behavioral is composed here. The view is pure rendering.
 * The root scope owns all timers — `using` ensures cleanup.
 * Scope is ambient via AsyncLocalStorage — no threading through args.
 *
 * Flags: --auto (auto-advance) --fast (skip animation) --stress (200 exchanges)
 */

import React from "react"
import { run } from "@silvery/term/runtime"
import { signal } from "./signal.js"
import { createScope, runInScope } from "./scope.js"
import { useChat } from "./model.js"
import { keymap, when, doublePress, autoAdvance, idleAutoSubmit } from "./app.js"
import { ChatView } from "./view.js"
import { SCRIPT, generateStressScript } from "../../../silvery/examples/interactive/aichat/script.js"

async function main() {
  const args = process.argv.slice(2)
  const fast = args.includes("--fast")
  const auto = args.includes("--auto")
  const script = args.includes("--stress") ? generateStressScript() : SCRIPT
  const mode = args.includes("--fullscreen") ? "fullscreen" : "inline"

  // 0. Scope — owns all timers, ambient via ALS
  using scope = createScope()

  await runInScope(scope, async () => {
    // 1. Model — useScope() retrieves the ambient scope
    const chat = useChat.bind(script, { fast })

    // 2. Keymap — all key dispatch is declarative
    const isActive = signal(true)
    const ctrlD = doublePress("ctrl+d", chat.commands.exit)
    const keys = keymap(
      when(isActive, { "ctrl+l": chat.commands.compact }),
      { escape: chat.commands.exit },
      ctrlD.bindings,
    )

    // 3. Surface
    // Era 2: withTerminal({ view, keys }) — surface owns the input source loop
    using handle = await run(<ChatView keys={keys} ctrlDPending={ctrlD.pending} />, {
      mode: mode as "inline" | "fullscreen",
      focusReporting: true,
    })

    // 4. Plugins — all behavioral concerns composed externally
    chat.advance()
    if (auto) {
      autoAdvance(chat, script, { fast }).catch(console.error)
    } else {
      idleAutoSubmit(chat)
    }

    // 5. Exit — react to done signal
    chat.done.subscribe(() => {
      if (chat.done.value) scope.timeout(auto ? 1000 : 0, () => handle.unmount())
    })

    await handle.waitUntilExit()
  })
}

if (import.meta.main) {
  main().catch(console.error)
}
