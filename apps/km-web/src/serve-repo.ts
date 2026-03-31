/**
 * serveRepo — WebSocket server wrapping a Repo
 *
 * Exposes a Repo over WebSocket for browser clients. Protocol:
 *
 * Server → Client:
 *   { type: "snapshot", nodes: KNode[] }     — full tree on connect
 *   { type: "version", v: number }           — mutation notification
 *
 * Client → Server:
 *   { id: number, method: string, args: any[] }  — RPC call
 *
 * Server → Client (RPC response):
 *   { id: number, result: any }              — success
 *   { id: number, error: string }            — failure
 */

import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"
import { createLogger } from "loggily"
import { serializeResult } from "./serialize.ts"

const log = createLogger("km:web:serve")

export interface ServeRepoOptions {
  port: number
  staticDir?: string
}

/** Whitelisted Repo methods that can be called via RPC */
const ALLOWED_METHODS = new Set([
  // Read-only queries
  "getNode",
  "getNodesBatch",
  "getChildren",
  "getSubtree",
  "getAncestors",
  "getAllTasks",
  "getTasksByStatus",
  "search",
  "query",
  "queryTasks",
  "getLinksTo",
  "getOutgoingLinks",
  "getBacklinks",
  "getRenameImpact",
  "getChildCounts",
  "getRepoRootNode",
  "resolveNode",
  "resolveByName",
  "preloadSubtree",
  // Mutations
  "updateNode",
  "moveNode",
  "deleteNode",
  "addNode",
])

/** Collect all nodes under root (null = repo root) via BFS */
function collectAllNodes(repo: Repo): KNode[] {
  const result: KNode[] = []
  const queue: (string | null)[] = [null]

  while (queue.length > 0) {
    const parentId = queue.shift() ?? null
    const children = repo.getChildren(parentId)
    for (const child of children) {
      result.push(child)
      queue.push(child.id)
    }
  }

  return result
}

export function serveRepo(repo: Repo, opts: ServeRepoOptions) {
  const { port } = opts

  const server = Bun.serve({
    port,

    fetch(req, server) {
      const url = new URL(req.url)

      // WebSocket upgrade
      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req)
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 400 })
        }
        return undefined
      }

      // Health check
      if (url.pathname === "/health") {
        return Response.json({
          status: "ok",
          version: repo.version,
          stats: repo.stats,
        })
      }

      return new Response("km-web server. Connect via WebSocket at /ws", {
        status: 200,
      })
    },

    websocket: {
      open(ws) {
        log.info?.("client connected")

        // Send initial snapshot — all nodes in the repo
        const t0 = performance.now()
        const nodes = collectAllNodes(repo)
        const elapsed = (performance.now() - t0).toFixed(1)
        log.info?.(`snapshot: ${nodes.length} nodes in ${elapsed}ms`)

        ws.send(JSON.stringify({ type: "snapshot", nodes }))

        // Subscribe to mutations — re-send full snapshot
        // Simple for prototype; optimize with incremental updates later
        const unsub = repo.subscribe(() => {
          const updated = collectAllNodes(repo)
          ws.send(JSON.stringify({ type: "snapshot", nodes: updated }))
        })

        // Store unsubscribe for cleanup
        ;(ws as unknown as { _unsub: () => void })._unsub = unsub
      },

      message(ws, data) {
        const text = typeof data === "string" ? data : new TextDecoder().decode(data as ArrayBuffer)

        let msg: { id: number; method: string; args: unknown[] }
        try {
          msg = JSON.parse(text)
        } catch {
          ws.send(JSON.stringify({ error: "Invalid JSON" }))
          return
        }

        const { id, method, args } = msg

        // Security: only allow whitelisted methods
        if (!ALLOWED_METHODS.has(method)) {
          ws.send(JSON.stringify({ id, error: `Method not allowed: ${method}` }))
          return
        }

        try {
          const fn = (repo as Record<string, unknown>)[method]
          if (typeof fn !== "function") {
            ws.send(JSON.stringify({ id, error: `Method not found: ${method}` }))
            return
          }

          const result = fn.apply(repo, args as unknown[])
          const serialized = serializeResult(method, result)
          ws.send(JSON.stringify({ id, result: serialized }))
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          log.warn?.(`RPC error: ${method} — ${message}`)
          ws.send(JSON.stringify({ id, error: message }))
        }
      },

      close(ws) {
        log.info?.("client disconnected")
        const unsub = (ws as unknown as { _unsub?: () => void })._unsub
        unsub?.()
      },
    },
  })

  log.info?.(`km-web server listening on http://localhost:${port}`)
  log.info?.(`WebSocket endpoint: ws://localhost:${port}/ws`)

  return server
}
