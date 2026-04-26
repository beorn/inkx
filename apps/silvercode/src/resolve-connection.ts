/**
 * Connection resolution — turn a flag (`--agent <X>`) and a loaded config
 * into a concrete `ResolvedConnection` the controller can spawn.
 *
 * Resolution order when `--agent X` is given:
 *   1. registry connection label (`ai.acp.<X>` exists in config) → use it
 *   2. connection-string (X contains `?` or `=` or `://`)        → parse via the kind
 *   3. built-in agent id (X is in BUILTIN_AGENTS keys)            → bare connection
 *   4. error with actionable message
 *
 * Resolution order when `--agent` is omitted:
 *   1. SILVERCODE_AGENT or KM_AGENT env var (SILVERCODE_AGENT wins)
 *   2. ai.acp.default from config (resolved as a label)
 *   3. built-in fallback connection: `claude-code`
 *
 * The result is a flat object; the index.tsx adapter maps it onto the
 * existing `<App>` props (account / model / agent / bare) so the
 * controller contract stays unchanged.
 */

import type { Config } from "@silvery/config"
import { AcpEntryKind, BUILTIN_AGENTS, isBuiltinAgentId, type AcpEntry } from "./config-schema.ts"

export type ResolvedConnection = {
  /** Connection entry — same shape as the `ai.acp.<name>` schema. */
  readonly entry: AcpEntry
  /** Where the entry came from — used for diagnostics. */
  readonly source: "registry-label" | "connection-string" | "builtin" | "default-builtin" | "registry-default"
  /** The label name when source === "registry-label" / "registry-default". */
  readonly label?: string
}

const ACP_PREFIX = "ai.acp"

/**
 * Resolve `--agent <input>` (or env-var fallback) against the config. The
 * resulting `ResolvedConnection.entry` is the exact value that should be
 * passed to the controller — call-site just maps fields onto its existing
 * `<App>` props.
 *
 * Throws a descriptive `Error` when the input doesn't match any of the
 * three resolution paths. The error is shaped for direct stderr printing
 * — multi-line, listing what was tried + what's available.
 */
export function resolveConnection(input: string | undefined, config: Config): ResolvedConnection {
  // Branch A — explicit input.
  if (input !== undefined && input.length > 0) {
    return resolveExplicit(input, config)
  }

  // Branch B — no input. Env > config.default > built-in fallback.
  const envInput = process.env.SILVERCODE_AGENT ?? process.env.KM_AGENT
  if (envInput && envInput.length > 0) {
    // Env-var path is identical to explicit `--agent <X>`. Reusing the
    // explicit resolver means the same error formatting applies (so a
    // typo in `SILVERCODE_AGENT` surfaces a real diagnostic rather than
    // a cryptic spawn failure later).
    return resolveExplicit(envInput, config)
  }

  // Try `ai.acp.default`. Stored as a string label; we do NOT rely on
  // the registry's signal-based default reader because that one parses
  // the entry — we want the bare label so we can attribute the source.
  const defaultLabel = config.get<string>(`${ACP_PREFIX}.default`)
  if (typeof defaultLabel === "string" && defaultLabel.length > 0) {
    const reg = config.registry(ACP_PREFIX, AcpEntryKind)
    const entry = reg.get(defaultLabel)
    if (entry) return { entry, source: "registry-default", label: defaultLabel }
    // Default points at a missing entry — surface this loudly instead
    // of falling through to the built-in. Stale defaults are a real
    // hazard after a `silvercode config acp rm <name>` that forgot to
    // clear the default key.
    throw new Error(
      `silvercode: ai.acp.default = "${defaultLabel}" but no matching entry under ai.acp.\n` +
        `Available labels: ${listLabels(config).join(", ") || "(none)"}\n` +
        `Fix with: silvercode config acp default <name>  (or  silvercode config --unset ai.acp.default)`,
    )
  }

  // Built-in fallback — claude-code is the silvercode default.
  return {
    entry: builtinEntry("claude-code"),
    source: "default-builtin",
  }
}

function resolveExplicit(input: string, config: Config): ResolvedConnection {
  // Step 1 — registry label. Only consider it a label when the input has
  // no connection-string syntax; bare names like `claude-work` always
  // hit the registry first, even if they happen to coincide with a
  // built-in id. User intent: "I named this preset, use it."
  if (!looksLikeConnectionString(input)) {
    const reg = config.registry(ACP_PREFIX, AcpEntryKind)
    const entry = reg.get(input)
    if (entry) return { entry, source: "registry-label", label: input }
  }

  // Step 2 — connection string. Anything containing `?`, `=`, or `://`
  // is unambiguously meant as a string per `@silvery/config` grammar.
  if (looksLikeConnectionString(input)) {
    const reg = config.registry(ACP_PREFIX, AcpEntryKind)
    const parsed = reg.resolve(input)
    if (parsed) return { entry: parsed, source: "connection-string" }
    // resolve() only returns null for missing labels; a parse error
    // throws, which falls through to the catch-all below.
  }

  // Step 3 — built-in agent id.
  if (isBuiltinAgentId(input)) {
    return { entry: builtinEntry(input), source: "builtin" }
  }

  // Step 4 — fail with a helpful message. List every avenue we tried.
  const labels = listLabels(config)
  throw new Error(
    [
      `silvercode: --agent "${input}" did not match any known connection.`,
      "",
      "Tried:",
      `  1. registry label  ai.acp.${input}            (not found)`,
      `  2. connection-string parse                    (no '?', '=', or '://')`,
      `  3. built-in agent id                          (not in: ${Object.keys(BUILTIN_AGENTS).join(", ")})`,
      "",
      labels.length > 0
        ? `Configured connections: ${labels.join(", ")}`
        : "No connections configured. Add one with: silvercode config acp add <name>=<connection-string>",
      "",
      "Examples:",
      "  silvercode --agent claude-code",
      "  silvercode --agent 'codex?model=gpt-5-mini'",
      "  silvercode --agent claude-work        # named preset",
    ].join("\n"),
  )
}

/**
 * Produce a connection entry from a built-in agent id. Auto-fills `model`
 * with the agent's `defaultModel` when one is documented; account / bare
 * are left undefined so env-var auto-discovery and `--bare` (if/when we
 * re-add a flag) drive them.
 *
 * Caller must have already verified `id` via `isBuiltinAgentId`. The
 * lookup is double-checked so a programming error throws instead of
 * silently returning a malformed entry.
 */
function builtinEntry(id: string): AcpEntry {
  const builtin = BUILTIN_AGENTS[id]
  if (!builtin) {
    throw new Error(`silvercode: no built-in agent for "${id}"`)
  }
  const entry: AcpEntry = {
    agent: builtin.id,
  }
  if (builtin.defaultModel) (entry as { model?: string }).model = builtin.defaultModel
  if (builtin.transport === "spawn") (entry as { transport?: string }).transport = "spawn"
  return entry
}

function looksLikeConnectionString(input: string): boolean {
  return input.includes("?") || input.includes("=") || input.includes("://")
}

function listLabels(config: Config): string[] {
  const reg = config.registry(ACP_PREFIX, AcpEntryKind)
  return reg.entries().map((e) => e.name)
}
