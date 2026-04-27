/**
 * Agent capabilities — declarative descriptors of the per-agent knobs
 * silvercode exposes in the SidePanel.
 *
 * Each agent backend has its own conventions for "thinking intensity"
 * and "planning / permission mode":
 *
 *   - claude-code:  think_hard / ultrathink slash commands; ask / plan /
 *                   accept-edits / auto / bypass permission modes.
 *   - codex:        reasoning_effort low/medium/high; sandbox levels.
 *   - gemini:       per-model intensity (Flash vs Pro); single permission mode.
 *   - copilot:      no exposed knobs (yet).
 *
 * Rather than hard-code Claude's vocabulary into App.tsx + SidePanel
 * (six parallel maps for icons / colors / labels / keywords + bespoke
 * `cycleThinking` / `cycleMode` callbacks), each agent declares what it
 * supports as a list of `CapabilityOption` descriptors. The UI reads
 * the descriptors, renders them generically, and calls
 * `option.activate(ctx)` when the user picks one.
 *
 * Agents that lack a capability simply omit the field. The UI hides
 * the row.
 *
 * The `color` on each option is the agent's OWN convention for that
 * mode — not a universal risk→color mapping. Claude's "bypass" is red
 * because Claude Code calls bypass red; codex's "high reasoning" should
 * be whatever color codex uses for "max". Each agent owns its visual
 * identity here.
 */

import type { Controller } from "./controller.ts"

/** Runtime context handed to `option.activate`. */
export type CapabilityContext = {
  controller: Controller
  /** Active session id (silvercode-internal handle id, e.g. "session-1"). */
  sessionId: string
  /** Set the local thinking selection (App-state setter). */
  setThinking: (next: string) => void
  /** Set the local planning / permission-mode selection (App-state setter). */
  setMode: (next: string) => void
}

/**
 * One entry in a capability menu (thinking tier, planning mode, …).
 *
 * `id` is the canonical key — stable across renames, used as the
 * selection state, settings persistence, keymaps. `name` is display
 * (may be i18n'd later).
 */
export type CapabilityOption = {
  /** Stable canonical key. Lowercase + underscores/hyphens. */
  readonly id: string
  /** Display name. */
  readonly name: string
  /** Single-cell icon glyph. */
  readonly icon: string
  /**
   * Theme token (`$muted`, `$success`, `$error`, etc.). Per-agent — set
   * to whatever convention the agent itself uses for this mode. Optional;
   * caller falls back to `$muted`.
   */
  readonly color?: string
  /** One-line help text shown in popover / tooltip. */
  readonly description: string
  /** True for the option that's selected at session start. Exactly one per array. */
  readonly default?: boolean
  /** Activate this option. Runs in App-render context — keep cheap and idempotent. */
  activate(ctx: CapabilityContext): void | Promise<void>
}

/** Bundle of capability arrays per agent. Missing fields → UI hides the row. */
export type AgentCapabilities = {
  /**
   * "Think harder" intensity tiers. Cycle button + popover in SidePanel.
   * Claude: think / think_hard / ultrathink.
   * Codex: reasoning_effort low/medium/high.
   */
  readonly thinking?: ReadonlyArray<CapabilityOption>
  /**
   * Planning / permission modes. Cycle button + popover in SidePanel.
   * Claude: ask / plan / accept-edits / auto / bypass.
   * Codex: sandbox levels (read-only / write / dangerous).
   */
  readonly planning?: ReadonlyArray<CapabilityOption>
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Walk every BuiltinAgent's capabilities and assert structural invariants:
 *
 *  - At most ONE option per array marked `default: true` (multiple defaults
 *    is ambiguous).
 *  - All `id`s within an array are unique.
 *  - Every `id` matches the agent-id-shape regex (lowercase, kebab/snake).
 *
 * Throws on first violation with the agent + capability + bad option in the
 * message. Intended to run at module load — catches typos at silvercode
 * startup, not "first time the user clicks the menu."
 */
const ID_RE = /^[a-z][a-z0-9_-]*$/

export function assertCapabilities(agents: Readonly<Record<string, { capabilities?: AgentCapabilities }>>): void {
  for (const [agentId, agent] of Object.entries(agents)) {
    const caps = agent.capabilities
    if (!caps) continue
    for (const kind of ["thinking", "planning"] as const) {
      const arr = caps[kind]
      if (!arr) continue
      const seen = new Set<string>()
      let defaultCount = 0
      for (const option of arr) {
        if (!ID_RE.test(option.id)) {
          throw new Error(
            `agent-capabilities: ${agentId}.${kind} option id "${option.id}" must match /^[a-z][a-z0-9_-]*$/`,
          )
        }
        if (seen.has(option.id)) {
          throw new Error(`agent-capabilities: ${agentId}.${kind} has duplicate option id "${option.id}"`)
        }
        seen.add(option.id)
        if (option.default === true) defaultCount++
      }
      if (defaultCount > 1) {
        throw new Error(
          `agent-capabilities: ${agentId}.${kind} has ${defaultCount} options marked default — exactly one allowed`,
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Claude Code capabilities
// ---------------------------------------------------------------------------

/**
 * Claude's thinking tiers — extended-thinking budget magic keywords.
 * Activation: send the matching slash command so the budget applies on
 * the next turn. Empty string represents "normal" (unboosted baseline);
 * the SidePanel cycler treats "normal" as the default.
 *
 * Colors: neutral grey (`$muted`) — Claude's own UI doesn't tint think
 * tiers. The intensity climbs visually via filled-circle progression
 * (○ → ◔ → ◐ → ●) instead of color.
 */
const CLAUDE_THINKING: ReadonlyArray<CapabilityOption> = [
  {
    id: "normal",
    name: "think normal",
    icon: "○",
    color: "$muted",
    description: "Claude's baseline budget — no extended thinking.",
    default: true,
    activate: ({ setThinking }) => setThinking(""),
  },
  {
    id: "think",
    name: "think med",
    icon: "◔",
    color: "$muted",
    description: "≈ 4K extended-thinking tokens.",
    activate: ({ controller, sessionId, setThinking }) => {
      controller.runSlashCommand(sessionId, "/think")
      setThinking("think")
    },
  },
  {
    id: "think_hard",
    name: "think hard",
    icon: "◐",
    color: "$muted",
    description: "≈ 16K extended-thinking tokens.",
    activate: ({ controller, sessionId, setThinking }) => {
      controller.runSlashCommand(sessionId, "/think_hard")
      setThinking("think_hard")
    },
  },
  {
    id: "ultrathink",
    name: "think ultra",
    icon: "●",
    color: "$muted",
    description: "≈ 32K extended-thinking tokens.",
    activate: ({ controller, sessionId, setThinking }) => {
      controller.runSlashCommand(sessionId, "/ultrathink")
      setThinking("ultrathink")
    },
  },
]

/**
 * Claude's permission modes — what tool calls are allowed without
 * prompting. Activation: pure App-state setter (mode is consumed by
 * `prompt-assembly` to gate tool-use approvals on the next turn).
 *
 * Colors: Claude Code's own conventions:
 *   - $muted (grey) for ask — most conservative, every tool prompts
 *   - $info  (blue)  for plan  — non-edit-y, advisory
 *   - $purple        for accept-edits — Claude Code's distinctive purple
 *   - $warning (yellow) for auto   — most permissive default
 *   - $error  (red)  for bypass   — skips ALL approvals; danger
 */
const CLAUDE_PLANNING: ReadonlyArray<CapabilityOption> = [
  {
    id: "ask",
    name: "always ask",
    icon: "?",
    color: "$muted",
    description: "Every tool prompts. Most conservative.",
    activate: ({ setMode }) => setMode("ask"),
  },
  {
    id: "plan",
    name: "plan mode on",
    icon: "⏸︎",
    color: "$info",
    description: "Plan first, no edits. Switch to accept-edits to execute.",
    activate: ({ setMode }) => setMode("plan"),
  },
  {
    id: "accept-edits",
    name: "accept edits on",
    icon: "»",
    color: "$purple",
    description: "Auto-accept file edits; still prompt for everything else.",
    activate: ({ setMode }) => setMode("accept-edits"),
  },
  {
    id: "auto",
    name: "auto mode on",
    icon: "»",
    color: "$warning",
    description: "Auto-accept everything Claude considers safe.",
    default: true,
    activate: ({ setMode }) => setMode("auto"),
  },
  {
    id: "bypass",
    name: "dangerously bypass on",
    icon: "!",
    color: "$error",
    description: "Skip ALL approvals — including destructive ops. Audit your prompt.",
    activate: ({ setMode }) => setMode("bypass"),
  },
]

export const CLAUDE_CAPABILITIES: AgentCapabilities = {
  thinking: CLAUDE_THINKING,
  planning: CLAUDE_PLANNING,
}

// ---------------------------------------------------------------------------
// Future agents — leave fields undefined until we research the convention.
//
// For codex / gemini / copilot we'd add their own thinking/planning arrays
// here once we've decided how their UI maps to silvercode's cyclers.
// Until then those agents render neither row.
// ---------------------------------------------------------------------------
