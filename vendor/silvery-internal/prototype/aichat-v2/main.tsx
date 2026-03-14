/**
 * AI Chat v2 — Entry point.
 *
 * Demonstrates Era 2 composition:
 *   signals → commands → keymap → surface
 *
 * Flags: --auto (auto-advance) --fast (skip animation) --stress (200 exchanges)
 */

import React from "react"
import { run } from "@silvery/term/runtime"
import { signal } from "./signal.js"
import { useChat } from "./model.js"
import { keymap, when, autoAdvance } from "./app.js"
import { ChatView } from "./view.js"
import { SCRIPT, generateStressScript } from "../../../silvery/examples/interactive/aichat/script.js"

async function main() {
  const args = process.argv.slice(2)
  const fast = args.includes("--fast")
  const auto = args.includes("--auto")
  const script = args.includes("--stress") ? generateStressScript() : SCRIPT
  const mode = args.includes("--fullscreen") ? "fullscreen" : "inline"

  // 1. Initialize model
  const chat = useChat.bind(script, { fast })

  // 2. Compose keymap (Era 2 — declarative key→command mapping)
  const isActive = signal(true) // simplified — no modal modes in this demo
  const keys = keymap(
    when(isActive, {
      "ctrl+l": chat.commands.compact,
    }),
    { escape: chat.commands.exit },
  )

  // 3. Run — surface owns the renderer + dispatch loop
  using handle = await run(<ChatView autoStart={auto} keys={keys} />, {
    mode: mode as "inline" | "fullscreen",
    focusReporting: true,
  })

  // 4. Auto-advance drives the script externally (clean separation)
  if (auto) {
    autoAdvance(chat, script, { fast }).catch(console.error)
  }

  await handle.waitUntilExit()
  chat.dispose()
}

if (import.meta.main) {
  main().catch(console.error)
}
