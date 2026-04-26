#!/usr/bin/env node
/**
 * `silvercode-claude-acp` — bin entry point.
 *
 * Spins up the standalone ACP server over stdio. ACP clients (Zed, Neovim
 * via `coc-acp`, OpenACP, silvercode, etc.) launch this command as a child
 * process and speak ndJSON-RPC over its stdin/stdout.
 *
 * Subscription-auth env vars (CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY)
 * are inherited from the parent process — no flags needed; the spawned
 * `claude` binary handles its own auth gate.
 */

import { runClaudeAcpServer } from "../src/index.ts"

runClaudeAcpServer().catch((err) => {
  // Diagnostics go to stderr so they don't corrupt the JSON-RPC frames on
  // stdout. ACP clients typically forward stderr to a debug pane.
  process.stderr.write(`silvercode-claude-acp: fatal: ${err?.stack ?? err}\n`)
  process.exit(1)
})
