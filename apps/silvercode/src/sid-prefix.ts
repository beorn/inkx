/**
 * Session-id prefix scheme — `<agentId>:<bareSid>`.
 *
 * Each agent backend mints session ids in its own private scheme:
 *   - claude-code  → UUID-shaped (`abc-123-...`)
 *   - codex        → `codex-1714...`
 *   - gemini       → its own UUIDs
 *   - copilot      → opaque
 *
 * They are mutually unintelligible — handing claude-code a codex sid via
 * `--resume` produces a confusing "session not found" failure. Worse, the
 * tool-call format inside a resumed session is agent-specific (Anthropic's
 * `tool_use` blocks ≠ OpenAI's `function_call`), so even if the receiving
 * agent loaded the sid it would misinterpret prior turns.
 *
 * Silvercode prefixes every outward-facing sid with the agent that minted
 * it. The prefix is silvercode-layer only — when we hand the sid back to
 * an agent backend (e.g. for `loadSession`), we strip the prefix first.
 *
 * Round-trip:
 *   1. agent emits session-init with bare sid `abc123`
 *   2. silvercode prefixes for display / resume hint:  `codex:abc123`
 *   3. user runs `silvercode --resume codex:abc123`
 *   4. parseSid() pulls out `agent=codex`, `bareSid=abc123`
 *   5. silvercode passes `bareSid` into the codex spawn
 *
 * Why a regex on the prefix and not just split-on-colon:
 *
 *   Some agents may use colons in their internal ids (rare but possible —
 *   e.g. `"sess:abc"`). The regex below accepts only canonical agent-id
 *   shapes (`/^[a-z][a-z0-9-]*$/`), so a bare sid that happens to contain
 *   a colon parses cleanly without a false-prefix match.
 */

/**
 * Agent ids are kebab-case lowercase with optional digits. Matches every
 * BUILTIN_AGENTS key + the free-form `agent:` field on `ai.acp.<name>`
 * entries. UUIDs (which contain hex + colons in some formats) don't match.
 */
const AGENT_PREFIX_RE = /^[a-z][a-z0-9-]*$/

/** Single character separator. Picked colon for shell-friendliness. */
const SEP = ":"

/**
 * Apply `<agentId>:<bareSid>` prefix to a session id.
 *
 * Idempotent — if the input already has the same prefix, returns it
 * unchanged. Empty bare sid returns empty (caller should already filter
 * pending placeholder ids).
 */
export function prefixSid(agentId: string, bareSid: string): string {
  if (!bareSid) return ""
  const wanted = `${agentId}${SEP}`
  if (bareSid.startsWith(wanted)) return bareSid
  return `${agentId}${SEP}${bareSid}`
}

/**
 * Parse a sid for `<agentId>:<bareSid>` shape.
 *
 * Returns `{ agent, bareSid }`. `agent` is null when the input has no
 * recognizable prefix (the input is then returned verbatim as `bareSid`).
 */
export function parseSid(input: string): { agent: string | null; bareSid: string } {
  const colon = input.indexOf(SEP)
  if (colon < 0) return { agent: null, bareSid: input }
  const candidate = input.slice(0, colon)
  if (!AGENT_PREFIX_RE.test(candidate)) return { agent: null, bareSid: input }
  return { agent: candidate, bareSid: input.slice(colon + 1) }
}

/**
 * Extract the bare sid from a possibly-prefixed input. Convenience wrapper
 * for call sites that don't care about the agent component.
 */
export function bareSid(input: string): string {
  return parseSid(input).bareSid
}
