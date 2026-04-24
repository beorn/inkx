#!/usr/bin/env bun
/**
 * km-mcp-server binary — stdin MCP, stdout responses, stderr logs.
 *
 * Agent harnesses register this via `.claude/settings.json` (or
 * CLAUDE_CONFIG_DIR per-session for silvercode) so every spawned session
 * sees km tools automatically. This binary opens the km state.db read-only
 * and wires the @km/storage query functions into a KmContext.
 *
 * DB path resolution (first match wins):
 *   1. $KM_DB_PATH env var
 *   2. <cwd>/.km/state.db
 *   3. bail (print config hint to stderr)
 *
 * We open the DB read-only — v1 tools are all reads. Mutation tools (v2)
 * will need their own bin that opens read-write with proper locking.
 */

import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import { getAllNodes, getNode, search } from "@km/storage"
import { createKmContextFromStorage } from "./adapter.ts"
import { runStdioServer } from "./transport.ts"

function resolveDbPath(): string | null {
  const env = process.env.KM_DB_PATH
  if (env && env.length > 0) return resolve(env)
  const cwdCandidate = resolve(process.cwd(), ".km", "state.db")
  if (existsSync(cwdCandidate)) return cwdCandidate
  return null
}

function getTopLevelNodes(db: Database): KNode[] {
  // A "board" here = every node whose parent is null. @km/storage doesn't
  // expose this directly, so we filter getAllNodes. Fine for the read-only
  // tool surface; if this becomes a perf bottleneck on large vaults we can
  // add a dedicated query.
  return getAllNodes(db).filter((n) => n.parent_id === null)
}

function renderPath(db: Database, id: string): string[] {
  // Walk parent_id chain, collecting titles root→…→node. Bounded to 64 hops
  // as a cycle guard; km trees are shallow in practice.
  const trail: string[] = []
  let current: KNode | null = getNode(db, id)
  const seen = new Set<string>()
  let hops = 0
  while (current && !seen.has(current.id) && hops < 64) {
    seen.add(current.id)
    hops += 1
    trail.push(current.title ?? current.name ?? current.id)
    if (current.parent_id === null) break
    current = getNode(db, current.parent_id)
  }
  return trail.reverse()
}

const dbPath = resolveDbPath()
let ctx: ReturnType<typeof createKmContextFromStorage>
if (dbPath) {
  const db = new Database(dbPath, { readonly: true })
  ctx = createKmContextFromStorage(db, {
    search,
    getNode: (d, id) => getNode(d, id),
    getTopLevelNodes,
    renderPath,
  })
} else {
  // No db in cwd → MCP still registers + serves empty results. We CANNOT
  // throw here: claude's --strict-mcp-config refuses to start the session
  // if any declared MCP server fails to initialize. A running-but-empty
  // server is strictly better than blocking session spawn. Warn to stderr
  // so it's visible in a log tail.
  process.stderr.write(
    "km-mcp-server: no km database found. Tools will return empty results.\n" +
      "  Set KM_DB_PATH=/path/to/.km/state.db or run from a km vault dir to enable.\n",
  )
  ctx = {
    async search(): Promise<KNode[]> {
      return []
    },
    async getNode(): Promise<KNode | null> {
      return null
    },
    async getBoard(): Promise<KNode[]> {
      return []
    },
    async renderPath(): Promise<string[]> {
      return []
    },
  }
}

await runStdioServer(ctx)
