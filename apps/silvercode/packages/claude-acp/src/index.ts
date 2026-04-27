/**
 * `@km/claude-acp` — standalone ACP server wrapping the Claude Code binary.
 *
 * Subscription-compatible: spawning the `claude` binary directly inherits
 * Claude Code's full auth gate (CLAUDE_CODE_OAUTH_TOKEN → ANTHROPIC_API_KEY
 * → ~/.claude/auth.json fallback), so Pro/Max users can use this server
 * without the auth-block that Anthropic's official `claude-agent-acp` enforces.
 *
 * # Usage
 *
 * ```ts
 * import { runClaudeAcpServer } from "@km/claude-acp"
 * await runClaudeAcpServer()
 * ```
 *
 * Or via the bin entry: `npx @km/claude-acp` (or installed globally:
 * `silvercode-claude-acp`).
 *
 * # Reference
 *
 * - silvercode internal adapter: `apps/silvercode/packages/agent-harness/src/acp-adapter-claude.ts`
 * - architecture: `hub/silvercode/future/ai-terminal/10-agent-router-landscape.md`
 *   § "Recommended path — internal-first, extract later"
 * - bead: `km-silvercode.acp-claude-server`
 */

export { runClaudeAcpServer } from "./server.ts"
export type { RunClaudeAcpServerOpts } from "./server.ts"
export { attachWire } from "./wire.ts"
export type { WireHandle, PromptResolution } from "./wire.ts"
