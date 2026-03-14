/**
 * AI Chat v2 — Entry point.
 *
 * Demonstrates Era 2 composition: factory → createModel → bind → run.
 *
 * Flags: --auto (auto-advance) --fast (skip animation) --stress (200 exchanges)
 *
 * Compare with the current entry point (index.tsx: 208 lines):
 * - No useMemo for update function creation
 * - No useTea hook
 * - No footerControlRef pattern
 * - No <Provider> wrapping — useChat.bind() initializes the singleton
 * - Model lives outside React — created once, accessed via useChat.get()
 */

import React from "react"
import { run } from "@silvery/term/runtime"
import { useChat } from "./model.js"
import { autoAdvance } from "./app.js"
import { ChatView } from "./view.js"
import { SCRIPT, generateStressScript } from "../../../silvery/examples/interactive/aichat/script.js"

async function main() {
  const args = process.argv.slice(2)
  const fast = args.includes("--fast")
  const auto = args.includes("--auto")
  const script = args.includes("--stress") ? generateStressScript() : SCRIPT
  const mode = args.includes("--fullscreen") ? "fullscreen" : "inline"

  // ── Era 2 composition (aspirational) ────────────────────────
  // const commands = chat.commands
  // const isNormal = derived(() => true) // simplified — no modes in this demo
  // const keys = keymap(
  //   when(isNormal, { enter: commands.submit, "ctrl+l": commands.compact }),
  //   { escape: commands.exit },
  // )
  // using app = withTerminal({ view: <ChatView autoStart={auto} />, keys })

  // 1. Initialize model — bind factory args, singleton ready for useChat.get()
  const chat = useChat.bind(script, { fast })

  // 2. Run — no Provider wrapping needed
  using handle = await run(<ChatView autoStart={auto} />, {
    mode: mode as "inline" | "fullscreen",
    focusReporting: true,
  })

  // 3. Auto-advance drives the script externally (clean separation)
  if (auto) {
    autoAdvance(chat, script, { fast }).catch(console.error)
  }

  await handle.waitUntilExit()
  chat.dispose()
}

if (import.meta.main) {
  main().catch(console.error)
}
