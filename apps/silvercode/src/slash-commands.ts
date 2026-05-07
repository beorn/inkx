/**
 * Slash-command registry.
 *
 * Three sources feed the palette:
 *   1. Silvercode-local commands (/handoff, /fork, /spawn, /history,
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
  /**
   * If true, the command is hidden from the empty-query palette listing.
   * Typing the name (or any substring of it) still surfaces it via filter,
   * so power users can find it; it just doesn't clutter the discoverability
   * surface for new users.
   */
  hidden?: boolean
}

/** Fixed commands shipped with silvercode (local + well-known Claude-native). */
export const STATIC_COMMANDS: SlashCommand[] = [
  // Silvercode-local — intercepted.
  // Toggle the debug view: inline each user message's `additionalContext`
  // (system-reminders, hook output, isMeta auto-prompts) below the visible
  // prompt. Resumed sessions surface what the model actually received.
  // Hidden from the empty-query palette so it doesn't clutter discovery
  // for casual users — power users still surface it by typing "/de".
  // Bead: km-silvercode.resume-show-everything-collapsed.
  {
    name: "/debug",
    description: "Toggle debug view: inline hidden context (system-reminders, isMeta) on user messages",
    local: true,
    hidden: true,
  },
  { name: "/handoff", description: "Handoff task + context to another session", local: true },
  { name: "/fork", description: "Fork current session into a new pane", local: true },
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
  // Channel-injection commands — drain queued notification events from the
  // channel-queue (see `channel-queue.ts` + `prompt-assembly.ts`) and
  // prepend them to the next user prompt as typed EmbeddedResource
  // blocks. Default for notification channels is UI-first / user-mediated;
  // these commands are the user's "I want this context now" lever.
  {
    name: "/inject-tribe",
    description: "Inject queued tribe messages as notification resources on next prompt",
    local: true,
  },
  { name: "/inject-recent", description: "Inject all queued notification channel events on next prompt", local: true },
  { name: "/inject-ci", description: "Inject queued CI status events on next prompt", local: true },
  { name: "/inject-lore", description: "Inject queued lore deltas on next prompt", local: true },
  { name: "/inject-telegram", description: "Inject queued telegram messages on next prompt", local: true },
  { name: "/inject-subagent", description: "Inject queued sub-agent updates on next prompt", local: true },
  {
    name: "/clear-channels",
    description: "Drop all queued notification channel events without injecting",
    local: true,
  },
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

/**
 * Fuzzy-ish filter used by the palette. Case-insensitive substring match.
 *
 * When the query is empty, hidden commands are omitted from the listing —
 * only "discoverable" commands surface. As soon as the user types anything,
 * hidden commands compete on substring match like everything else (so /debug
 * shows up the moment "/de" is typed).
 */
export function filterCommands(query: string, commands: readonly SlashCommand[] = STATIC_COMMANDS): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return commands.filter((c) => !c.hidden)
  return commands.filter((c) => c.name.toLowerCase().includes(q))
}

/** Whether a command is silvercode-local (intercepted). */
export function isLocal(cmd: string, commands: readonly SlashCommand[] = STATIC_COMMANDS): boolean {
  const name = cmd.split(/\s+/)[0] ?? ""
  const def = commands.find((c) => c.name === name)
  return def?.local ?? false
}

/**
 * Outcome of dispatching a `/inject-*` or `/clear-channels` command.
 *
 *   - `kind: "inject"` — drain the queue (filtered to `sources` if set,
 *     all sources if `sources === undefined`) and feed the events as
 *     typed EmbeddedResource blocks to the next prompt via
 *     `assembleAcpPrompt({ autoInject: true, sources })`.
 *   - `kind: "clear"` — drop the queue without injecting.
 *   - `kind: "none"` — the command is not a channel command (caller
 *     falls through to its normal slash dispatch).
 */
export type ChannelCommandOutcome =
  | { kind: "inject"; sources?: ReadonlySet<string> }
  | { kind: "clear" }
  | { kind: "none" }

/**
 * Map a `/inject-*` or `/clear-channels` command to the channel-queue
 * action it represents. Only the first whitespace-delimited token is
 * inspected — `/inject-tribe extra args` returns the same outcome as
 * `/inject-tribe`.
 */
export function classifyChannelCommand(cmd: string): ChannelCommandOutcome {
  const name = cmd.trim().split(/\s+/)[0] ?? ""
  switch (name) {
    case "/inject-tribe":
      return { kind: "inject", sources: new Set(["tribe"]) }
    case "/inject-ci":
      return { kind: "inject", sources: new Set(["ci"]) }
    case "/inject-lore":
      return { kind: "inject", sources: new Set(["lore"]) }
    case "/inject-telegram":
      return { kind: "inject", sources: new Set(["telegram"]) }
    case "/inject-subagent":
      return { kind: "inject", sources: new Set(["subagent"]) }
    case "/inject-recent":
      return { kind: "inject" }
    case "/clear-channels":
      return { kind: "clear" }
    default:
      return { kind: "none" }
  }
}
