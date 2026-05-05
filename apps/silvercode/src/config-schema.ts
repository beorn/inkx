/**
 * silvercode @silvery/config schema — `ai.acp.*` and `ai.mcp.*` registries
 * plus the BUILTIN_AGENTS map used for zero-config first-run.
 *
 * The two registry kinds projected onto `~/.km/config.yaml`:
 *
 *   ai:
 *     acp:
 *       default: claude-work
 *       claude-work: "claude?account=bjorn@stabell.org&model=opus-4.7&bare"
 *       codex: "codex?model=gpt-5-mini"
 *     mcp:
 *       km:
 *         command: bun
 *         args: ["run", "apps/silvercode/packages/km-mcp-server/src/bin.ts"]
 *
 * Reserved keys: `default` (for both kinds — `ai.acp.default` names the
 * active connection; `ai.mcp.default` is unused but still forbidden as an
 * entry name to keep the registry surface uniform).
 *
 * `BUILTIN_AGENTS` provides connection defaults so silvercode can be
 * launched with zero config — `silvercode --agent codex` or just
 * `silvercode` (which falls back to `claude`) Just Works as long as
 * the credentials are reachable via env or the agent's documented config
 * dir.
 */

import { defineKind } from "@silvery/config"
import { z } from "zod"
import {
  type AgentCapabilities,
  assertCapabilities,
  CLAUDE_CAPABILITIES,
  CODEX_CAPABILITIES,
} from "./agent-capabilities.ts"

// ---------------------------------------------------------------------------
// ai.acp.<name> — connection registry kind
// ---------------------------------------------------------------------------

/**
 * One ACP connection entry. Matches the "object form" YAML shape; the
 * "string form" (e.g. `"claude?model=opus-4.7&bare"`) is parsed via
 * the kind's connection-string grammar (see `@silvery/config`).
 *
 * Field semantics:
 * - `agent`     — required. The path-segment of the connection string;
 *                 either a built-in agent id (`claude`, `codex`,
 *                 `gemini`, `copilot`) or a free-form id used by a
 *                 custom transport. Coerced via `pathField: "agent"`.
 * - `transport` — optional override. Most connections leave this unset
 *                 (the agent's default ACP transport is used). Set to
 *                 `spawn` for the legacy stream-json claude path.
 * - `account`   — optional Anthropic account name. Resolves via
 *                 `accounts.ts` to `~/.config/claude-profiles/<name>/`.
 * - `model`     — optional model id; passed through to the agent.
 * - `bare`      — optional. Spawns claude with `--bare` (deterministic
 *                 mode, no hooks/plugins/skills/CLAUDE.md). Boolean-coerced.
 * - `label`     — optional human-readable name for the SidePanel.
 * - `color`     — optional CSS-style hex (e.g. `#a0d8a0`) for the pane chip.
 * - `options`   — escape hatch for agent-specific extras.
 * - `base`      — hybrid form: parse as a connection string, sibling
 *                 fields override. Handled inside `@silvery/config`.
 * - `mcp_servers` — list of `ai.mcp.*` entry names to mount for sessions
 *                   spawned through this connection. Empty/undefined means
 *                   the controller's default set is used.
 */
const AcpEntrySchema = z.object({
  transport: z.string().optional(),
  agent: z.string(),
  account: z.string().optional(),
  model: z.string().optional(),
  bare: z.boolean().optional(),
  label: z.string().optional(),
  color: z.string().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
  base: z.string().optional(),
  mcp_servers: z.array(z.string()).optional(),
})

export type AcpEntry = z.infer<typeof AcpEntrySchema>

export const AcpEntryKind = defineKind({
  name: "acp",
  schema: AcpEntrySchema,
  pathField: "agent",
  reservedKeys: ["default"],
  // Coercion hints for connection-string parsing — without these, the
  // grammar treats every value as a string.
  //   bare           → boolean (also flag-style: `?bare` / `?!bare`)
  //   temp / top_p   → number  (sampling params, common across agents)
  coerce: {
    bare: "boolean",
    temp: "number",
    top_p: "number",
    mcp_servers: "array",
  },
})

// ---------------------------------------------------------------------------
// ai.mcp.<name> — MCP server registry kind
// ---------------------------------------------------------------------------

const McpEntrySchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
})

export type McpEntry = z.infer<typeof McpEntrySchema>

export const McpKind = defineKind({
  name: "mcp",
  schema: McpEntrySchema,
  pathField: "command",
  reservedKeys: ["default"],
})

// ---------------------------------------------------------------------------
// BUILTIN_AGENTS — zero-config first-run defaults
// ---------------------------------------------------------------------------

/**
 * One row of the built-in agent table. Used only when the user hasn't
 * defined the matching `ai.acp.<name>` entry in their config — provides
 * sensible defaults so `silvercode --agent codex` Just Works.
 *
 * `cred_env` lists env vars that, when present, count as "this agent is
 * usable without further configuration". `cred_dir` (when set) is checked
 * for existence as a fallback (e.g. `~/.claude/auth.json` for Pro/Max
 * subscription auth that doesn't surface in env).
 *
 * `default_model` seeds the connection's `model` when the user hasn't
 * passed `--model` and the config doesn't override it. Optional —
 * agents that pick a model server-side leave this undefined.
 */
export type BuiltinAgent = {
  /** Connection-string sugar — same value as `agent` field. */
  readonly id: string
  /** Default transport. `acp` for ACP-spawned agents; `spawn` for
   *  the legacy stream-json claude path. */
  readonly transport: "acp" | "spawn"
  /** Env vars that count as "credentials present". */
  readonly credEnv: ReadonlyArray<string>
  /** Optional credential directory (checked for existence). */
  readonly credDir?: string
  /** Default model id used when nothing overrides it. */
  readonly defaultModel?: string
  /** One-line description for `silvercode config acp list` etc. */
  readonly description: string
  /**
   * Per-agent UI capability descriptors (thinking / planning menus).
   * Optional — agents without exposed knobs (e.g. copilot today) leave
   * this undefined and the SidePanel hides the corresponding rows. See
   * `agent-capabilities.ts` for the option shape and Claude's reference
   * implementation.
   */
  readonly capabilities?: AgentCapabilities
}

export const BUILTIN_AGENTS: Readonly<Record<string, BuiltinAgent>> = {
  claude: {
    id: "claude",
    transport: "acp",
    credEnv: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"],
    credDir: "~/.claude",
    defaultModel: "claude-opus-4-7",
    description: "Claude (ACP) — Pro/Max OAuth or ANTHROPIC_API_KEY",
    capabilities: CLAUDE_CAPABILITIES,
  },
  "claude-code-spawn": {
    id: "claude-code-spawn",
    transport: "spawn",
    credEnv: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"],
    credDir: "~/.claude",
    defaultModel: "claude-opus-4-7",
    description: "Claude Code (legacy stream-json spawn)",
    capabilities: CLAUDE_CAPABILITIES,
  },
  "claude-code-sdk": {
    id: "claude-code-sdk",
    transport: "spawn",
    credEnv: ["ANTHROPIC_API_KEY"],
    defaultModel: "claude-opus-4-7",
    description: "Claude Code (in-process Anthropic SDK)",
    capabilities: CLAUDE_CAPABILITIES,
  },
  codex: {
    id: "codex",
    transport: "acp",
    credEnv: ["OPENAI_API_KEY"],
    defaultModel: "gpt-5-codex",
    description: "OpenAI Codex (ACP) — ChatGPT subscription",
    capabilities: CODEX_CAPABILITIES,
  },
  "codex-spawn": {
    id: "codex-spawn",
    transport: "spawn",
    credEnv: ["OPENAI_API_KEY"],
    defaultModel: "gpt-5-codex",
    description: "OpenAI Codex (legacy stream-json spawn)",
    capabilities: CODEX_CAPABILITIES,
  },
  gemini: {
    id: "gemini",
    transport: "acp",
    credEnv: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    description: "Google Gemini (ACP) — Sign in with Google",
  },
  "github-copilot-cli": {
    id: "github-copilot-cli",
    transport: "acp",
    credEnv: ["GITHUB_TOKEN"],
    description: "GitHub Copilot (ACP) — Copilot subscription",
  },
}

const AGENT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "claude-code": "claude",
})

// Validate every agent's capability arrays at module load. Catches typos
// (duplicate ids, multiple defaults, malformed ids) at silvercode startup
// rather than "first time the user clicks the menu."
assertCapabilities(BUILTIN_AGENTS)

/**
 * True when `id` is a known built-in agent key.
 *
 * Returns a plain boolean (not a type predicate) on purpose: a `id is keyof
 * typeof BUILTIN_AGENTS` predicate would narrow the call-site's `input:
 * string` to `never` in the surrounding `else` branches, which then breaks
 * `restrict-template-expressions` when we want to include the original
 * input in error messages.
 */
export function isBuiltinAgentId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTIN_AGENTS, canonicalAgentId(id))
}

/** Normalize user-facing aliases to the canonical backend id. */
export function canonicalAgentId(id: string): string {
  return AGENT_ALIASES[id] ?? id
}

/** Short prefix for outward-facing resume ids. */
export function displayAgentId(id: string): string {
  return canonicalAgentId(id)
}
