/**
 * AI Chat v2 — Era 2 composition.
 *
 * signals → commands → keymap → surface
 *
 * Flags: --auto (auto-advance) --fast (skip animation) --stress (200 exchanges)
 */

import React from "react"
import { run } from "@silvery/term/runtime"
import { signal } from "./signal.js"
import { useChat } from "./model.js"
import { keymap, when, doublePress, autoAdvance } from "./app.js"
import { ChatView } from "./view.js"
import { SCRIPT, generateStressScript } from "../../../silvery/examples/interactive/aichat/script.js"

async function main() {
  const args = process.argv.slice(2)
  const fast = args.includes("--fast")
  const auto = args.includes("--auto")
  const script = args.includes("--stress") ? generateStressScript() : SCRIPT
  const mode = args.includes("--fullscreen") ? "fullscreen" : "inline"

  // 1. Model
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
  using handle = await run(<ChatView autoStart={auto} keys={keys} ctrlDPending={ctrlD.pending} />, {
    mode: mode as "inline" | "fullscreen",
    focusReporting: true,
  })

  // 4. Auto-advance (composed externally, not embedded in state machine)
  if (auto) autoAdvance(chat, script, { fast }).catch(console.error)

  await handle.waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
