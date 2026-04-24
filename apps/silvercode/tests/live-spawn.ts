#!/usr/bin/env bun
/**
 * Live harness dogfood — spawns an actual `claude --bare -p` subprocess and
 * verifies the event pipeline works end-to-end against the real CLI.
 *
 * Not a vitest test (requires a real claude binary + quota); invoked manually
 * via: `bun apps/silvercode/tests/live-spawn.ts "what are you?"`.
 */

import { createSessionStore, spawnClaude } from "@km/agent-harness"

const prompt = process.argv.slice(2).join(" ") || "Say hi in one short sentence."

const session = spawnClaude({ cwd: process.cwd() })
const store = createSessionStore()
store.bind(session)

const unsubscribe = session.subscribe((event) => {
  if (event.kind === "session-init") {
    console.log(`[init] session=${event.sessionId} model=${event.model} mode=${event.mode}`)
  } else if (event.kind === "turn-start") {
    console.log(`[turn-start] ${event.role} ${event.turnId}`)
  } else if (event.kind === "text-delta") {
    process.stdout.write(event.text)
  } else if (event.kind === "tool-use") {
    console.log(`\n[tool-use] ${event.name}(${JSON.stringify(event.input)})`)
  } else if (event.kind === "tool-result") {
    const s = typeof event.output === "string" ? event.output : JSON.stringify(event.output)
    console.log(`[tool-result] ${s.slice(0, 120)}`)
  } else if (event.kind === "turn-end") {
    console.log(`\n[turn-end] stop=${event.stopReason ?? "?"}`)
  } else if (event.kind === "session-end") {
    console.log(`[session-end] cost=$${event.costUsd?.toFixed(4) ?? "?"} dur=${event.durationMs ?? "?"}ms`)
  } else if (event.kind === "error") {
    console.error(`[error] ${event.message}`)
  }
})

session.send(prompt)

// Wait until the session ends.
await new Promise<void>((resolve) => {
  const tick = setInterval(() => {
    if (session.closed || store.state.get().status === "ended") {
      clearInterval(tick)
      resolve()
    }
  }, 100)
})

unsubscribe()
await session.close()
const final = store.state.get()
console.log(
  `\n\n=== session summary ===\nmessages=${final.messages.length} tools_called=${final.messages.reduce((acc, m) => acc + m.toolCalls.length, 0)} cost=$${final.cost.usd.toFixed(4)}`,
)
process.exit(0)
