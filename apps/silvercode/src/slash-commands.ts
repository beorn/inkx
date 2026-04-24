/**
 * Slash-command registry.
 *
 * Three sources feed the palette:
 *   1. Silvercode-local commands (/handoff, /inbox, /fork, /spawn, /history,
 *      /todos, /mode) — intercepted by the App before the message reaches
 *      the subprocess. `local: true`.
 *   2. Well-known Claude-native commands (/compact, /clear, /agents, /mcp,
 *      /help, /context, /usage) — passed through verbatim; `local: false`.
 *   3. Discovered commands from the session-init event's `slashCommands`
 *      list (claude plugins, user-defined ~/.claude/commands/*.md, built-in
 *      slash commands the spawned agent reports) — pass-through, surfaced
 *      dynamically via `mergeRemoteCommands` at render time.
 */

export type SlashCommand = {
  name: string
  description: string
  /** If true, the command is handled inside silvercode (not sent to Claude). */
  local: boolean
}

/** Fixed commands shipped with silvercode (local + well-known Claude-native). */
export const STATIC_COMMANDS: SlashCommand[] = [
  // Silvercode-local — intercepted.
  { name: "/handoff", description: "Handoff task + context to another session", local: true },
  { name: "/inbox", description: "Open the cross-session permission inbox", local: true },
  { name: "/fork", description: "Fork current session into a new card", local: true },
  { name: "/spawn", description: "Spawn a new session on this workspace", local: true },
  { name: "/history", description: "Open the history view", local: true },
  { name: "/todos", description: "Toggle the todos panel", local: true },
  { name: "/mode", description: "Cycle permission mode (plan / accept-edits / auto / bypass)", local: true },
  // Thinking-tier slash commands are silvercode-local — Claude Code activates
  // extended thinking via MAGIC KEYWORDS in the user message body
  // (`think` / `think hard` / `ultrathink`), not via slash commands. The
  // palette entries below set the local tier; silvercode prepends the
  // matching keyword to the next user message.
  { name: "/think", description: "Set thinking tier: 4K (silvercode injects `think` keyword)", local: true },
  { name: "/think_hard", description: "Set thinking tier: 16K (silvercode injects `think hard` keyword)", local: true },
  { name: "/ultrathink", description: "Set thinking tier: 32K (silvercode injects `ultrathink` keyword)", local: true },
  // Well-known Claude-native — passed through.
  { name: "/compact", description: "Compact the conversation (Claude)", local: false },
  { name: "/clear", description: "Clear session state (Claude)", local: false },
  { name: "/agents", description: "Manage Claude sub-agents", local: false },
  { name: "/mcp", description: "Manage MCP servers", local: false },
  { name: "/help", description: "Claude's own help", local: false },
  { name: "/context", description: "Show current context details", local: false },
  { name: "/usage", description: "Show usage + quota", local: false },
]

/** Back-compat alias for older callers. */
export const COMMANDS: SlashCommand[] = STATIC_COMMANDS

/**
 * Merge the static list with commands discovered from the agent's session-init
 * event. Remote commands arrive without descriptions — the palette will still
 * filter and surface them; users see just the name + a generic "discovered"
 * label. Static entries always win on name collision (silvercode wording is
 * more precise than "from plugin X").
 */
export function mergeRemoteCommands(remote: readonly string[]): SlashCommand[] {
  const known = new Set(STATIC_COMMANDS.map((c) => c.name))
  const extras: SlashCommand[] = []
  for (const raw of remote) {
    if (typeof raw !== "string" || raw.length === 0) continue
    const name = raw.startsWith("/") ? raw : `/${raw}`
    if (known.has(name)) continue
    known.add(name)
    extras.push({
      name,
      description: "discovered from claude (plugin / user / built-in)",
      local: false,
    })
  }
  return [...STATIC_COMMANDS, ...extras.sort((a, b) => a.name.localeCompare(b.name))]
}

/** Fuzzy-ish filter used by the palette. Case-insensitive substring match. */
export function filterCommands(query: string, commands: readonly SlashCommand[] = STATIC_COMMANDS): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return [...commands]
  return commands.filter((c) => c.name.toLowerCase().includes(q))
}

/** Whether a command is silvercode-local (intercepted). */
export function isLocal(cmd: string, commands: readonly SlashCommand[] = STATIC_COMMANDS): boolean {
  const name = cmd.split(/\s+/)[0] ?? ""
  const def = commands.find((c) => c.name === name)
  return def?.local ?? false
}
