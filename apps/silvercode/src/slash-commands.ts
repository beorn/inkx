/**
 * Slash-command registry — both Claude-native (/compact, /clear, /agents,
 * /mcp) and silvercode-added (/handoff, /inbox, /fork, /spawn).
 *
 * Silvercode-added commands are *intercepted* before the message hits the
 * agent's stdin; Claude-native ones pass through verbatim so Claude Code
 * interprets them in its own command handler.
 */

export type SlashCommand = {
  name: string
  description: string
  /** If true, the command is handled inside silvercode (not sent to Claude). */
  local: boolean
}

export const COMMANDS: SlashCommand[] = [
  { name: "/compact", description: "Compact the conversation (Claude)", local: false },
  { name: "/clear", description: "Clear session state (Claude)", local: false },
  { name: "/agents", description: "List Claude sub-agents", local: false },
  { name: "/mcp", description: "List MCP servers", local: false },
  { name: "/handoff", description: "Handoff task + context to another session", local: true },
  { name: "/inbox", description: "Open the cross-session permission inbox", local: true },
  { name: "/fork", description: "Fork current session into a new card", local: true },
  { name: "/spawn", description: "Spawn a new session on this workspace", local: true },
  { name: "/history", description: "Open the history view", local: true },
  { name: "/todos", description: "Toggle the todos panel", local: true },
]

/** Fuzzy prefix filter. */
export function filterCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return COMMANDS
  return COMMANDS.filter((c) => c.name.toLowerCase().includes(q))
}

export function isLocal(cmd: string): boolean {
  const name = cmd.split(/\s+/)[0] ?? ""
  const def = COMMANDS.find((c) => c.name === name)
  return def?.local ?? false
}
