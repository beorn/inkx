#!/usr/bin/env bun
/**
 * Probe: same as live-spawn but with the exact mcpServers config silvercode
 * uses. If live-spawn works but this hangs, the mcp-config + --strict
 * combination is the issue.
 */
import { createSessionStore, spawnClaude } from "@km/agent-harness"

const session = spawnClaude({
  cwd: "/tmp",
  mcpServers: [
    {
      name: "tribe",
      command: "bun",
      args: ["run", "/Users/beorn/Code/pim/km/apps/silvercode/packages/tribe-mcp/src/bin.ts"],
      env: { TRIBE_SESSION_NAME: "probe" },
    },
  ],
})
const store = createSessionStore()
session.subscribe((e) => {
  store.apply(e)
  console.log(`[event] ${e.kind}`)
  if (e.kind === "session-init") console.log(`[init] model=${e.model} tools=${e.tools.length} mcp=${e.mcp_servers.join(",")}`)
  if (e.kind === "error") console.log(`[error] ${e.message.slice(0, 160)}`)
})
// Don't send — see if session-init fires without any user input (silvercode
// doesn't send anything until the user types). If it doesn't fire, claude
// is waiting for stdin before emitting init — that's the spawn-hang bug.
await new Promise<void>((r) => {
  const t = setInterval(() => {
    if (session.closed || store.state.get().status === "ended") {
      clearInterval(t)
      r()
    }
  }, 100)
  setTimeout(() => {
    clearInterval(t)
    console.log(`[timeout] status=${store.state.get().status} messages=${store.state.get().messages.length}`)
    r()
  }, 20000)
})
await session.close()
process.exit(0)
