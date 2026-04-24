#!/usr/bin/env bun
/**
 * km-mcp-server binary — stdin MCP, stdout responses, stderr logs.
 *
 * Agent harnesses register this via `.claude/settings.json` (or
 * CLAUDE_CONFIG_DIR per-session for silvercode) so every spawned session
 * sees km tools automatically. Wiring to the real @km/storage queries lives
 * in the consuming app; this bin keeps a generic KmContext slot.
 */

import { runStdioServer } from "./transport.ts"
import type { KmContext } from "./tools.ts"

/**
 * A minimal empty KmContext so the server starts even without a database
 * attached. Real deployments replace this by injecting a backed context
 * (see apps/silvercode/src/controller.ts → createKmContextFromStorage).
 */
const emptyContext: KmContext = {
  async search(): Promise<[]> {
    return []
  },
  async getNode(): Promise<null> {
    return null
  },
  async getBoard(): Promise<[]> {
    return []
  },
  async renderPath(): Promise<[]> {
    return []
  },
}

await runStdioServer(emptyContext)
