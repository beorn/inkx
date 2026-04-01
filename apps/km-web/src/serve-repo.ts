/**
 * serveRepo — WebSocket server wrapping a Repo
 *
 * Exposes a Repo over WebSocket for browser clients. Protocol:
 *
 * Server → Client:
 *   { type: "snapshot", nodes: KNode[] }     — full tree on connect / fallback
 *   { type: "delta", updates: KNode[], removals: string[] } — incremental update
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

interface MutationContext {
  method: string
  nodeId: string | null
  parentId: string | null
  oldParentId: string | null
  removedIds: string[]
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

        // Per-connection mutation context for delta tracking
        const wsData = ws as unknown as {
          _unsub: () => void
          _mutation: MutationContext | null
        }
        wsData._mutation = null

        // Send initial snapshot — all nodes in the repo
        const t0 = performance.now()
        const nodes = collectAllNodes(repo)
        const elapsed = (performance.now() - t0).toFixed(1)
        log.info?.(`snapshot: ${nodes.length} nodes in ${elapsed}ms`)

        ws.send(JSON.stringify({ type: "snapshot", nodes }))

        // Subscribe to mutations — send delta when context available, snapshot otherwise
        const unsub = repo.subscribe(() => {
          const mut = wsData._mutation
          wsData._mutation = null

          if (mut) {
            // Build targeted delta from mutation context
            const updates: KNode[] = []
            const removals: string[] = [...mut.removedIds]

            // Collect affected node (if not removed)
            if (mut.nodeId && !removals.includes(mut.nodeId)) {
              const node = repo.getNode(mut.nodeId)
              if (node) updates.push(node)
            }

            // Collect children of affected parents to catch reordering
            const parentIds = new Set<string | null>()
            if (mut.parentId) parentIds.add(mut.parentId)
            if (mut.oldParentId && mut.oldParentId !== mut.parentId) parentIds.add(mut.oldParentId)

            for (const pid of parentIds) {
              const children = repo.getChildren(pid)
              for (const child of children) {
                if (!updates.some((u) => u.id === child.id)) {
                  updates.push(child)
                }
              }
            }

            log.info?.(`delta: ${updates.length} updates, ${removals.length} removals (${mut.method})`)
            ws.send(JSON.stringify({ type: "delta", updates, removals }))
          } else {
            // No mutation context (e.g., file watcher) — full snapshot
            const updated = collectAllNodes(repo)
            ws.send(JSON.stringify({ type: "snapshot", nodes: updated }))
          }
        })

        wsData._unsub = unsub
      },

      message(ws, data) {
        const text = typeof data === "string" ? data : new TextDecoder().decode(data as unknown as ArrayBuffer)

        let msg: { id: number; method: string; args: unknown[] } = { id: 0, method: "", args: [] }
        try {
          msg = JSON.parse(text) as typeof msg
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
          const fn = (repo as unknown as Record<string, unknown>)[method]
          if (typeof fn !== "function") {
            ws.send(JSON.stringify({ id, error: `Method not found: ${method}` }))
            return
          }

          // Track mutation context for delta generation
          const wsData = ws as unknown as { _mutation: MutationContext | null }
          const MUTATION_METHODS = new Set(["updateNode", "moveNode", "deleteNode", "addNode"])

          if (MUTATION_METHODS.has(method)) {
            const mut: MutationContext = {
              method,
              nodeId: null,
              parentId: null,
              oldParentId: null,
              removedIds: [],
            }

            if (method === "updateNode") {
              mut.nodeId = args[0] as string
              const existing = repo.getNode(mut.nodeId)
              mut.parentId = existing?.parent_id ?? null
            } else if (method === "moveNode") {
              mut.nodeId = args[0] as string
              const existing = repo.getNode(mut.nodeId)
              mut.oldParentId = existing?.parent_id ?? null
              mut.parentId = args[1] as string
            } else if (method === "deleteNode") {
              mut.nodeId = args[0] as string
              const existing = repo.getNode(mut.nodeId)
              mut.parentId = existing?.parent_id ?? null
              // Collect subtree IDs before deletion
              const subtree = repo.getSubtree(mut.nodeId)
              mut.removedIds = subtree.map((n) => n.id)
            } else if (method === "addNode") {
              mut.parentId = args[0] as string
            }

            wsData._mutation = mut
          }

          const result = fn.apply(repo, args as unknown[])

          // For addNode, capture the returned nodeId
          if (method === "addNode" && wsData._mutation) {
            wsData._mutation.nodeId = result as string
          }

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
