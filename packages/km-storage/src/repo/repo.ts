/**
 * Repo - Composed Domain Object
 *
 * Repo is the composed whole, analogous to git's repository concept.
 * It combines:
 * - DataStore: Indexed tree of nodes (fast queries)
 * - FileTree: Human-editable files (optional, for sync)
 * - Config: Repo configuration
 *
 * Key insight from ADR-002: FileTree and DataStore are NOT peers.
 * FileTree is a human-editable representation that syncs with DataStore.
 * Sync is translation between formats, not a generic store-to-store operation.
 *
 * See: docs/00-principles.md
 */

import { Database, SQLiteError } from "bun:sqlite"
import { createLogger } from "loggily"
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync } from "fs"
import { basename, dirname, join } from "path"

import type { Change, KNode, TaskStatus } from "@km/core"
import { composeItem } from "../item-helpers.ts"
import type { Config } from "../config-object.ts"
import { loadConfigObject } from "../config-object.ts"
import type { DataStore, HasDatabase } from "../data-store.ts"
import { createDBDataStore } from "../data-store.ts"
import {
  getBacklinks as dbGetBacklinks,
  getOutgoingLinks as dbGetOutgoingLinks,
  updateTargetName as dbUpdateTargetName,
  type Link,
} from "../db/links.ts"
import {
  resolveNode as dbResolveNode,
  resolveByName as dbResolveByName,
  clearNameIndex,
  clearResolveCache,
} from "../db/queries/smart-resolver.ts"
import {
  getAllTasks as dbGetAllTasks,
  getLinksTo as dbGetLinksTo,
  getTasksByStatus as dbGetTasksByStatus,
} from "../db/queries/task-queries.ts"
import {
  getAncestors as dbGetAncestors,
  getChildCountsBatch as dbGetChildCountsBatch,
  getSubtree as dbGetSubtree,
  getSubtreeShallow as dbGetSubtreeShallow,
} from "../db/queries/tree-traversal.ts"
import { createEmitter, type Emitter, type EmitOptions } from "../emitter.ts"
import type { FileTree } from "../fs/file-tree.ts"
import { createDiskFileTree } from "../fs/file-tree.ts"
import { executeQuery, parseQuery } from "../query.ts"
import { type MutationContext, type RepoHooks } from "./hooks.ts"
import { loadRepo, type DeferredFile, type LoadError, type PendingLink, type StepYield } from "./loader.ts"
import { type UnexploredDir } from "../discovery.ts"
import { getIgnorePatterns, shouldIgnore } from "../fs/ignore.ts"
import { generatePathBasedId } from "../fs/id-utils.ts"
import { toRelativeFsPath } from "../fs/path-utils.ts"
import { parseMarkdownWithLinks, parsePlainTextToNodes, normalizeNodeName } from "@km/markdown"
import { resolveLinksAsync as resolveLinksAsyncImpl } from "../markdown/link-resolution.ts"
import { INSERT_NODE_SQL } from "../db/insert.ts"
import { SCHEMA, migrateSchema, migrateData, rebuildFtsIndex } from "../db/schema.ts"
import { createWatcher, type Watcher, type WatcherOptions } from "../watcher.ts"
import { withFsWriter } from "../watch/fs-writer.ts"

const log = createLogger("km:storage:repo")

// =============================================================================
// Shared Method Factories
// =============================================================================

/** Per-node children cache with surgical invalidation */
interface ChildrenCache {
  get(parentId: string | null): KNode[]
  bust(parentId: string | null): void
  clear(): void
  /** Check if children for a given parentId are already cached */
  has(parentId: string | null): boolean
  /** Set cache entry only if not already present (for batch preloading) */
  warmIfMissing(parentId: string | null, children: KNode[]): void
  /** Validate all cached entries against the DB. Throws on mismatch. */
  validate(): void
}

const cacheLog = createLogger("km:storage:cache")
const strictCache = process.env.KM_STRICT_CACHE === "1"

function createChildrenCache(dataStore: DataStore): ChildrenCache {
  const cache = new Map<string | null, KNode[]>()
  return {
    get(parentId) {
      const cached = cache.get(parentId)
      if (cached) {
        cacheLog.debug?.(`hit parent=${parentId ?? "null"} n=${cached.length}`)
        return cached
      }
      const result = dataStore.getChildren(parentId)
      cache.set(parentId, result)
      cacheLog.debug?.(`miss parent=${parentId ?? "null"} n=${result.length}`)
      return result
    },
    bust(parentId) {
      cache.delete(parentId)
      cacheLog.debug?.(`bust parent=${parentId ?? "null"}`)
    },
    clear() {
      cache.clear()
      cacheLog.debug?.("clear")
    },
    has(parentId) {
      return cache.has(parentId)
    },
    warmIfMissing(parentId, children) {
      if (!cache.has(parentId)) {
        if (strictCache) {
          // Validate against DB — detect partial cache entries
          const actual = dataStore.getChildren(parentId)
          if (children.length !== actual.length) {
            const actualIds = new Set(actual.map((n) => n.id))
            const missing = [...actualIds].filter((id) => !children.some((c) => c.id === id))
            throw new Error(
              `Children cache poisoning detected: warmIfMissing(${parentId ?? "null"}) ` +
                `has ${children.length} children but DB has ${actual.length}. ` +
                `Missing: [${missing.join(", ")}]`,
            )
          }
        }
        cache.set(parentId, children)
        cacheLog.debug?.(`warm parent=${parentId ?? "null"} n=${children.length}`)
      }
    },
    validate() {
      for (const [parentId, cached] of cache) {
        const actual = dataStore.getChildren(parentId)
        if (cached.length !== actual.length) {
          const actualIds = new Set(actual.map((n) => n.id))
          const cachedIds = new Set(cached.map((n) => n.id))
          const missing = [...actualIds].filter((id) => !cachedIds.has(id))
          throw new Error(
            `Cache validation failed for parent=${parentId ?? "null"}: ` +
              `cached ${cached.length} but DB has ${actual.length}. ` +
              `Missing: [${missing.join(", ")}]`,
          )
        }
      }
    },
  }
}

/** Dependencies for creating repo methods */
interface RepoMethodDeps {
  db: Database
  dataStore: DataStore
  hooks?: RepoHooks
  childrenCache: ChildrenCache
  rootPath: string
}

/** Create query methods shared by createRepo and createBareRepo */
function createQueryMethods(deps: RepoMethodDeps) {
  const { db, dataStore, childrenCache, rootPath } = deps
  const backlinksCache = new Map<string, Link[]>()
  return {
    getNode(id: string) {
      return dataStore.getNode(id)
    },
    getNodesBatch(ids: string[]) {
      return dataStore.getNodesBatch(ids)
    },
    getChildren(parentId: string | null) {
      return childrenCache.get(parentId)
    },
    getChildIds(parentId: string | null): readonly string[] {
      return childrenCache.get(parentId).map((n) => n.id)
    },
    getSubtree(nodeId: string) {
      return dbGetSubtree(db, nodeId)
    },
    preloadSubtree(rootId: string | null, maxDepth: number) {
      // Skip the expensive recursive CTE if the root's children are already cached.
      // This means a prior preload or getChildren already warmed this subtree.
      // Cache is busted on mutations, so stale data isn't a concern.
      if (childrenCache.has(rootId)) return

      const nodes = dbGetSubtreeShallow(db, rootId, maxDepth)

      // The CTE includes the root node itself (depth 0). Its parent_id points
      // to the root's PARENT — but we only have ONE of that parent's children,
      // not all of them. Caching this partial list poisons the parent's cache
      // entry (e.g., zooming into folder A caches parent's children as [A],
      // hiding siblings B and C). Find the root's parent_id so we can skip it.
      const rootNode = rootId ? nodes.find((n) => n.id === rootId) : null
      const rootParentId = rootNode ? (rootNode.parent_id === "." ? null : rootNode.parent_id) : undefined

      // Group by parent_id and warm the children cache
      const byParent = new Map<string | null, KNode[]>()
      for (const node of nodes) {
        const pid = node.parent_id === "." ? null : node.parent_id
        let arr = byParent.get(pid)
        if (!arr) {
          arr = []
          byParent.set(pid, arr)
        }
        arr.push(node)
      }
      // Warm the cache — only set if not already cached (avoid overwriting fresher data).
      // Skip the root's parent — we only have a partial list of its children.
      for (const [pid, children] of byParent) {
        if (rootParentId !== undefined && pid === rootParentId) continue
        childrenCache.warmIfMissing(pid, children)
      }
    },
    validateCache() {
      childrenCache.validate()
    },
    getAncestors(nodeId: string) {
      return dbGetAncestors(db, nodeId)
    },
    getAllTasks() {
      return dbGetAllTasks(db)
    },
    getTasksByStatus(status: TaskStatus) {
      return dbGetTasksByStatus(db, status)
    },
    search(queryStr: string) {
      return dataStore.search(queryStr)
    },
    query(expression: string) {
      const ast = parseQuery(expression)
      return executeQuery(db, ast)
    },
    queryTasks(expression: string) {
      const ast = parseQuery(expression)
      return executeQuery(db, ast, undefined, { requireTaskStatus: true })
    },
    getLinksTo(targetId: string) {
      return dbGetLinksTo(db, targetId)
    },
    getOutgoingLinks(sourceId: string): Link[] {
      return dbGetOutgoingLinks(db, sourceId)
    },
    getBacklinks(nodeId: string): Link[] {
      const cached = backlinksCache.get(nodeId)
      if (cached) return cached
      const result = dbGetBacklinks(db, nodeId)
      backlinksCache.set(nodeId, result)
      return result
    },
    getRenameImpact(nodeId: string) {
      const node = dataStore.getNode(nodeId)
      const backlinks = dbGetBacklinks(db, nodeId)
      const children = dataStore.getChildren(nodeId)
      const oldName = node?.name ?? ""

      // Count rule references and blocked-by references
      let ruleRefs = 0
      let propRefs = 0

      if (oldName) {
        const allNodes = dataStore.getAllNodes()
        for (const n of allNodes) {
          // Check rules for path references
          if (n.rules?.add) {
            const queries = Array.isArray(n.rules.add) ? n.rules.add : [n.rules.add]
            for (const q of queries) {
              if (replacePathInQuery(q, oldName, "___test___") !== q) {
                ruleRefs++
                break
              }
            }
          }
          if (n.rules?.sync && replacePathInQuery(n.rules.sync, oldName, "___test___") !== n.rules.sync) {
            ruleRefs++
          }

          // Check blocked-by properties
          const props = n.data?.props as Record<string, { type: string; target?: string }> | undefined
          if (
            props?.["blocked-by"]?.type === "link" &&
            props["blocked-by"].target?.toLowerCase() === oldName.toLowerCase()
          ) {
            propRefs++
          }
        }
      }

      return { backlinks, childCount: children.length, ruleRefs, propRefs }
    },
    resolveNode(queryStr: string, typeOrOptions?: string | { type?: string; taskOnly?: boolean }) {
      const baseOpts = typeof typeOrOptions === "string" ? { type: typeOrOptions } : (typeOrOptions ?? {})
      return dbResolveNode(db, queryStr, { ...baseOpts, repoRoot: rootPath })
    },
    resolveByName(name: string) {
      return dbResolveByName(db, name)
    },
    getRepoRootNode() {
      const row = db
        .prepare("SELECT * FROM nodes WHERE id = '.' AND type = 'h' AND item = 1 AND fstype = 'folder'")
        .get() as Record<string, unknown> | undefined
      if (!row) return null
      return {
        id: row.id as string,
        type: row.type as string,
        item: composeItem(
          row.item,
          row.list_marker as string | null,
          row.task_marker as string | null,
          row.task_status as string | null,
        ),
        fstype: row.fstype as string | null,
        parent_id: row.parent_id as string | null,
        parent_idx: row.parent_idx as number,
        fs_path: row.fs_path as string | null,
        name: row.name as string | null,
        content: row.content as string | null,
        data: row.data ? (JSON.parse(row.data as string) as KNode["data"]) : {},
      } as KNode
    },
    getChildCounts(parentIds: string[]) {
      return dbGetChildCountsBatch(db, parentIds)
    },
    rawQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
      const stmt = db.prepare(sql)
      return (params ? stmt.all(...(params as Parameters<typeof stmt.all>)) : stmt.all()) as T[]
    },
  }
}

/** Summarize KNode changes for logging (avoid logging entire node objects) */
function summarizeChanges(changes: Partial<KNode>): Record<string, unknown> {
  const summary: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(changes)) {
    if (key === "content" && typeof value === "string") {
      summary[key] = value.length > 80 ? value.slice(0, 80) + "…" : value
    } else if (key === "data" && typeof value === "object") {
      summary[key] = "{…}"
    } else {
      summary[key] = value
    }
  }
  return summary
}

/** Create mutation methods shared by createRepo and createBareRepo */
function createMutationMethods(deps: RepoMethodDeps, state: { version: number; notify(): void }) {
  const { dataStore, hooks, childrenCache } = deps

  /** Run a mutation with before/after hooks, version bump, and notification. */
  function runWithHooks<T>(ctx: MutationContext, fn: (ctx: MutationContext) => T): T {
    if (hooks?.beforeMutation) {
      const result = hooks.beforeMutation(ctx)
      if (result?.cancel) throw new Error("Mutation cancelled by hook")
      if (result?.context) ctx = result.context
    }
    const retval = fn(ctx)
    state.version++
    hooks?.afterMutation?.(ctx)
    state.notify()
    return retval
  }

  const mutations = {
    updateNode(id: string, changes: Partial<KNode>) {
      // Auto-derive title from content if not explicitly set.
      // This is the Repo-level invariant: content and title must stay in sync.
      // Catches all code paths (effect runner, direct calls, undo replay).
      if (changes.content !== undefined && changes.title === undefined) {
        changes = { ...changes, title: changes.content }
      }
      runWithHooks({ type: "update", nodeId: id, changes }, (ctx) => {
        const node = dataStore.getNode(ctx.nodeId)
        const parentId = node?.parent_id ?? null
        dataStore.updateNode(ctx.nodeId, ctx.changes ?? {})
        childrenCache.bust(parentId)
        // Bust ancestor chain so the lens invalidates on deep edits.
        // Children caches are keyed on childrenRef — without busting ancestors,
        // edits to deeply nested nodes (sub-sub-items) would show stale content.
        let bustId = parentId
        for (let i = 0; i < 4 && bustId; i++) {
          const bustNode = dataStore.getNode(bustId)
          bustId = bustNode?.parent_id ?? null
          if (bustId) childrenCache.bust(bustId)
        }
        clearNameIndex()
        clearResolveCache()
      })
      log.info?.(`mutation: update ${id}`, {
        changes: summarizeChanges(changes),
      })
    },
    moveNode(id: string, newParentId: string, position: number) {
      runWithHooks({ type: "move", nodeId: id, newParentId, position }, (ctx) => {
        const oldParentId = dataStore.getNode(ctx.nodeId)?.parent_id ?? null
        dataStore.moveNode(ctx.nodeId, ctx.newParentId ?? newParentId, ctx.position ?? position)
        childrenCache.bust(oldParentId)
        childrenCache.bust(ctx.newParentId ?? newParentId)
        clearNameIndex()
        clearResolveCache()
      })
      log.info?.(`mutation: move ${id} → parent=${newParentId} pos=${position}`)
    },
    deleteNode(id: string) {
      runWithHooks({ type: "delete", nodeId: id }, (ctx) => {
        const deletedParentId = dataStore.getNode(ctx.nodeId)?.parent_id ?? null
        dataStore.deleteNode(ctx.nodeId)
        childrenCache.bust(deletedParentId)
        clearNameIndex()
        clearResolveCache()
      })
      log.info?.(`mutation: delete ${id}`)
    },
    addNode(parentId: string | null, node: Partial<KNode>) {
      const newId = runWithHooks({ type: "add", nodeId: "", node }, (ctx) => {
        const id = dataStore.addNode(parentId, ctx.node ?? node)
        ctx.nodeId = id
        childrenCache.bust(parentId)
        clearNameIndex()
        clearResolveCache()
        return id
      })
      log.info?.(`mutation: add ${newId} parent=${parentId}`, {
        type: node.type,
        content: node.content?.slice(0, 80),
      })
      return newId
    },
    cloneTask(sourceId: string, changes: Partial<KNode>) {
      const source = dataStore.getNode(sourceId)
      if (!source?.item?.task) return null

      const newItem = changes.item ?? source.item
      const clonedNode: Partial<KNode> & { content: string } = {
        type: source.type,
        content: changes.content ?? source.content ?? "",
        parent_id: changes.parent_id ?? source.parent_id,
        parent_idx: changes.parent_idx ?? (source.parent_idx ?? 0) + 0.001,
        item: {
          ...newItem,
          task: {
            marker: newItem?.task?.marker ?? "[ ]",
            status: newItem?.task?.status ?? "todo",
          },
        },
        assigned_to: changes.assigned_to ?? source.assigned_to,
        due_at: changes.due_at ?? source.due_at,
        start_at: changes.start_at ?? source.start_at,
        priority: changes.priority ?? source.priority,
        data: {
          ...source.data,
          ...changes.data,
          recur_prev: sourceId,
        },
      }

      const cloneParentId = clonedNode.parent_id ?? null
      const id = dataStore.addNode(cloneParentId, clonedNode)
      childrenCache.bust(cloneParentId)
      clearNameIndex()
      clearResolveCache()
      return id
    },
    renameNode(id: string, newContent: string, onProgress?: (info: { updated: number; total: number }) => void) {
      const node = dataStore.getNode(id)
      if (!node) throw new Error(`Node not found: ${id}`)
      const oldName = node.name ?? ""

      // Derive new name from content using shared normalization (preserves sigils)
      const newName = normalizeNodeName(newContent)

      if (oldName && oldName === newName) {
        // Name didn't change — only update content
        if (node.content !== newContent) {
          // Use this.updateNode so undo proxy can intercept when wrapped
          this.updateNode(id, { content: newContent, title: newContent })
        }
        return
      }

      // 1. Rename the node itself (update content, name, title, and data.name).
      // data.name (the frontmatter title override) takes priority in
      // getNodeDisplayName, so leaving it stale would make the column header
      // keep showing the old label after a successful rename.
      // Use this.updateNode (not mutations.updateNode) so undo proxy intercepts.
      const nextData =
        node.data && typeof node.data === "object" && "name" in (node.data as Record<string, unknown>)
          ? { ...(node.data as Record<string, unknown>), name: newName }
          : node.data
      this.updateNode(id, { content: newContent, name: newName, title: newContent, data: nextData })

      // 2. Update backlinks in source nodes
      const backlinks = dbGetBacklinks(deps.db, id)
      const total = backlinks.length
      const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const pattern = new RegExp(`(\\!?\\[\\[)${escapedOld}(\\|[^\\]]+)?(\\]\\])`, "gi")

      let updated = 0
      for (const link of backlinks) {
        const sourceNode = dataStore.getNode(link.source_id)
        if (!sourceNode?.content) continue

        const updatedContent = sourceNode.content.replace(pattern, `$1${newName}$2$3`)
        if (updatedContent !== sourceNode.content) {
          this.updateNode(link.source_id, { content: updatedContent })
        }
        updated++
        onProgress?.({ updated, total })
      }

      // 3. Update target_name in links table (scoped to this node's links only)
      dbUpdateTargetName(deps.db, oldName, newName, id)

      // 4. Update path references in rules and blocked-by property targets
      // Pass this (not mutations) so undo proxy intercepts through the proxy chain
      updateRenameReferences(dataStore, this, oldName, newName)
    },
  }

  return mutations
}

// =============================================================================
// Rename Reference Helpers
// =============================================================================

interface MutationMethods {
  updateNode(id: string, changes: Partial<KNode>): void
}

/**
 * Replace a path segment in a rule query string.
 * E.g., "./inbox/** status:todo" → "./tasks/** status:todo" when renaming "inbox" → "tasks"
 */
function replacePathInQuery(query: string, oldName: string, newName: string): string {
  // Match the old name as a path segment: preceded by ./ or / and followed by / or ** or $ or end
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pathPattern = new RegExp(`((?:^|\\s)(?:\\.?/)?)${escaped}(/|\\*\\*|$)`, "gi")
  return query.replace(pathPattern, `$1${newName}$2`)
}

/** Replace path in a rule field (string or string[]), returning updated value and whether it changed. */
function replacePathInRuleField(
  field: string | string[] | undefined,
  oldName: string,
  newName: string,
): { value: string | string[] | undefined; changed: boolean } {
  if (!field) return { value: field, changed: false }
  if (Array.isArray(field)) {
    const updated = field.map((q) => replacePathInQuery(q, oldName, newName))
    const changed = updated.some((q, i) => q !== field[i])
    return { value: changed ? updated : field, changed }
  }
  const updated = replacePathInQuery(field, oldName, newName)
  return { value: updated, changed: updated !== field }
}

/**
 * Update path references in rules (add=, sync=) and blocked-by property targets
 * when a node is renamed. Single pass over all nodes.
 */
function updateRenameReferences(
  dataStore: DataStore,
  mutations: MutationMethods,
  oldName: string,
  newName: string,
): void {
  const allNodes = dataStore.getAllNodes()

  for (const node of allNodes) {
    let newData: typeof node.data | undefined
    let updatedContent: string | null | undefined

    // Check rules for path references
    if (node.rules) {
      const newRules = { ...node.rules }
      let rulesChanged = false

      const addResult = replacePathInRuleField(newRules.add, oldName, newName)
      if (addResult.changed) {
        newRules.add = addResult.value as typeof newRules.add
        rulesChanged = true
      }

      const syncResult = replacePathInRuleField(newRules.sync, oldName, newName)
      if (syncResult.changed) {
        newRules.sync = syncResult.value as string
        rulesChanged = true
      }

      if (rulesChanged) {
        newData = { ...node.data, rules: newRules }
        updatedContent = node.content
          ? node.content.replace(new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), newName)
          : node.content
      }
    }

    // Check blocked-by property targets
    const props = node.data?.props as Record<string, { type: string; target?: string }> | undefined
    if (props) {
      const blockedBy = props["blocked-by"]
      if (blockedBy?.type === "link" && blockedBy.target?.toLowerCase() === oldName.toLowerCase()) {
        const newProps = { ...props, "blocked-by": { ...blockedBy, target: newName } }
        newData = { ...(newData ?? node.data), props: newProps }
      }
    }

    if (newData) {
      const changes: Partial<KNode> = { data: JSON.stringify(newData) as unknown as Record<string, unknown> }
      if (updatedContent !== undefined) changes.content = updatedContent ?? undefined
      mutations.updateNode(node.id, changes)
    }
  }
}

/** Check if a repo at rootPath needs rebuild (disk mode helper) */
function checkNeedsRebuild(rootPath: string, db: Database): boolean {
  const kmDir = join(rootPath, ".km")
  const dbPath = join(kmDir, "state.db")
  const changesPath = join(kmDir, "changes.jsonl")

  if (!existsSync(dbPath)) {
    log.debug?.("needsRebuild: yes (no state.db)")
    return true
  }

  if (!existsSync(changesPath)) {
    log.debug?.("needsRebuild: no (no changes.jsonl)")
    return false
  }

  // Check if there are unapplied events
  const lastApplied = db.prepare("SELECT value FROM meta WHERE key = ?").get("last_event") as
    | { value: string }
    | undefined

  const lastAppliedId = lastApplied?.value
  if (!lastAppliedId) {
    const content = existsSync(changesPath) ? readFileSync(changesPath, "utf-8") : ""
    const hasEvents = content.trim().length > 0
    log.debug?.(`needsRebuild result=${hasEvents ? "yes" : "no"} reason=no last_event`)
    return hasEvents
  }

  // Check if events file has newer events
  const content = readFileSync(changesPath, "utf-8")
  const lines = content.split("\n").filter((l: string) => l.trim())
  if (lines.length === 0) {
    log.debug?.("needsRebuild: no (no events)")
    return false
  }

  const lastLine = lines.at(-1)
  if (!lastLine) {
    log.debug?.("needsRebuild: no (empty last line)")
    return false
  }

  try {
    const lastEvent = JSON.parse(lastLine) as { id: string }
    const needs = lastEvent.id > lastAppliedId
    log.debug?.(
      `needsRebuild result=${needs ? "yes" : "no"} last=${lastEvent.id.slice(-8)} applied=${(lastAppliedId as string).slice(-8)}`,
    )
    return needs
  } catch {
    log.debug?.("needsRebuild: yes (malformed events)")
    return true
  }
}

// =============================================================================
// Core Interface
// =============================================================================

/**
 * Stats from loading a Repo.
 */
export interface RepoStats {
  /** Number of nodes loaded */
  nodeCount: number
  /** Number of links resolved */
  linkCount: number
  /** Time to load in milliseconds */
  duration: number
}

/** Result from expanding a single unexplored directory */
export interface ExpandResult {
  /** Number of nodes added */
  nodeCount: number
  /** Number of links resolved */
  linkCount: number
  /** Nested unexplored directories found during expansion */
  newUnexploredDirs: UnexploredDir[]
}

/** Progress from expandAll() */
export interface ExpandProgress {
  /** Directory path just expanded */
  dirPath: string
  /** Nodes added in this directory */
  nodeCount: number
  /** Remaining unexplored directories */
  remaining: number
}

/**
 * SyncResult from one-shot sync operation.
 */
export interface SyncResult {
  /** Number of changes applied from files to data */
  fromFiles: number
  /** Number of changes applied from data to files */
  fromData: number
  /** Conflicts encountered during sync */
  conflicts: SyncConflict[]
}

/**
 * Conflict during sync.
 */
export interface SyncConflict {
  /** Node ID involved in conflict */
  nodeId: string
  /** Path of conflicting file */
  path: string
  /** How the conflict was resolved */
  resolution: "files_wins" | "data_wins" | "manual"
}

/**
 * Repo - the composed domain object.
 *
 * Combines DataStore (indexed storage) + optional FileTree (human-editable files)
 * + Config. Provides sync operations when files are present.
 *
 * @example
 * ```typescript
 * // Full repo with files (most common)
 * using repo = createRepo("/path/to/repo")
 * const tasks = repo.data.getAllNodes().filter(n => n.item?.task != null)
 *
 * // Bare repo - no files (daemon, API server)
 * const data = createMemDataStore()
 * using repo = createBareRepo(data)
 * ```
 */
export interface Repo extends Disposable {
  /** Root path of the repository */
  readonly path: string

  /** Storage mode: 'memory' (ephemeral) or 'disk' (persistent) */
  readonly mode: "memory" | "disk"

  /** Indexed storage - always present */
  readonly data: DataStore

  /** Human-editable files - optional (null for bare repos) */
  readonly files: FileTree | null

  /** Configuration */
  readonly config: Config

  /** Raw database access (for infrastructure code) */
  readonly database: Database

  /** Errors encountered during file loading (empty if loadFiles was false) */
  readonly loadErrors: LoadError[]

  /** Loading statistics (zeroed if loadFiles was false) */
  readonly stats: RepoStats

  /** Mutation counter — incremented on every updateNode/moveNode/deleteNode/addNode.
   *  Note: implemented as getter/setter (not plain property) because mutation
   *  methods share state via a versionHolder closure — see createRepo comment. */
  version: number

  /**
   * Subscribe to mutation events. Callback is invoked after each mutation.
   * Returns an unsubscribe function. Use with React's useSyncExternalStore.
   */
  subscribe(callback: () => void): () => void

  /** Returns current version — stable reference for useSyncExternalStore. */
  getSnapshot(): number

  /** Bump version and notify subscribers. Use after bulk DB writes that bypass
   *  the mutation API (e.g., background link resolution, rule evaluation). */
  touch(): void

  /** Files pending deferred parsing (for discoverOnly mode) */
  readonly deferredFiles: DeferredFile[]

  /** Directories not yet explored due to preloadDepth limit */
  unexploredDirs: UnexploredDir[]

  /** Expand a single unexplored directory, adding its contents to the database */
  expandDirectory(dirPath: string): Promise<ExpandResult>

  /** Load all remaining unexplored directories (for background indexing) */
  expandAll(): AsyncGenerator<ExpandProgress>

  /** Change emitter for this repo (owns kmDir, changeHub, fsSync) */
  readonly emitter: Emitter

  /**
   * Apply a change to the system (DB + journal + broadcast + FS sync).
   * Delegates to emitter.apply(). Prefer this over emitter.apply() directly.
   */
  apply(change: Omit<Change, "id" | "ts">, options?: EmitOptions): Change

  /**
   * Commit a change to DB + journal + broadcast (no FS sync).
   * Use for FS-origin changes where projecting back to FS would cause echo loops.
   * Delegates to emitter.commit().
   */
  commit(change: Omit<Change, "id" | "ts">, options?: EmitOptions): Change

  // ===========================================================================
  // Repo-compatible query methods (proxies to data store)
  // ===========================================================================

  /** Get a single node by ID */
  getNode(id: string): KNode | null

  /** Get multiple nodes by ID in a single query */
  getNodesBatch(ids: string[]): Map<string, KNode>

  /** Get children of a node (null for root) */
  getChildren(parentId: string | null): KNode[]

  /** Get child IDs of a node (null for root) — structural read without full node hydration */
  getChildIds(parentId: string | null): readonly string[]

  /** Get full subtree under a node */
  getSubtree(nodeId: string): KNode[]

  /**
   * Preload a depth-limited subtree into the children cache.
   * Uses a single recursive CTE query instead of N individual getChildren calls.
   * Call before operations that will walk the tree (e.g., computeDefaultFoldDepths).
   * @param rootId - Root node ID (null for repo root)
   * @param maxDepth - Maximum depth to preload (0 = root only, 4 = root + 4 levels)
   */
  preloadSubtree(rootId: string | null, maxDepth: number): void

  /** Validate children cache against DB. Throws on mismatch. For testing. */
  validateCache(): void

  /** Get ancestors of a node (from root to parent) */
  getAncestors(nodeId: string): KNode[]

  /** Get all tasks */
  getAllTasks(): KNode[]

  /** Get tasks by status */
  getTasksByStatus(status: TaskStatus): KNode[]

  /** Full-text search */
  search(query: string): KNode[]

  /** Execute query language expression */
  query(expression: string): KNode[]

  /** Execute query language expression, returning only tasks */
  queryTasks(expression: string): KNode[]

  /** Get nodes linking to a target */
  getLinksTo(targetId: string): KNode[]

  /** Get outgoing links from a node */
  getOutgoingLinks(sourceId: string): Link[]

  /** Get backlinks (link records pointing to this node) */
  getBacklinks(nodeId: string): Link[]

  /** Get rename impact: backlinks, child count, rule references, and property references */
  getRenameImpact(nodeId: string): { backlinks: Link[]; childCount: number; ruleRefs: number; propRefs: number }

  /** Rename a node and update all backlinks referencing it */
  renameNode(id: string, newContent: string, onProgress?: (info: { updated: number; total: number }) => void): void

  /**
   * Smart node resolver - finds a node by various identifiers.
   * @param query - ID, path, or filename to search for
   * @param typeOrOptions - Optional type filter
   */
  resolveNode(query: string, typeOrOptions?: string | { type?: string; taskOnly?: boolean }): KNode | null

  /** Fast name-based resolution using pre-built in-memory index. O(1) lookup.
   * Use for render-time wikilink resolution instead of resolveNode. */
  resolveByName(name: string): KNode | null

  /** Batch get child counts for multiple parent IDs */
  getChildCounts(parentIds: string[]): Map<string, number>

  /** Get the repo root folder node (the virtual parent of all top-level files) */
  getRepoRootNode(): KNode | null

  // ===========================================================================
  // Repo-compatible mutation methods (proxies to data store)
  // ===========================================================================

  /** Update a node's properties */
  updateNode(id: string, changes: Partial<KNode>): void

  /** Move a node to a new parent with new sort order */
  moveNode(id: string, newParentId: string, position: number): void

  /** Delete a node */
  deleteNode(id: string): void

  /** Add a new node */
  addNode(parentId: string | null, node: Partial<KNode>): string

  /**
   * Clone a task with modifications (e.g., for recurring tasks).
   * @param sourceId - ID of the task to clone
   * @param changes - Changes to apply to the clone
   * @returns ID of the new task, or null if source not found
   */
  cloneTask(sourceId: string, changes: Partial<KNode>): string | null

  /**
   * Append a task line to a markdown file.
   * @param filePath - Relative or absolute path to the file
   * @param content - Content to append
   * @param options.ensure - Create file/directory if not exists
   * @throws Error if repo has no files (bare repo)
   */
  appendTaskToFile(filePath: string, content: string, options?: { ensure?: boolean }): void

  /**
   * Check if a path exists relative to repo root.
   * @param relativePath - Path relative to repo root
   */
  pathExists(relativePath: string): boolean

  /**
   * Execute a raw SQL query on the database.
   * @param sql - SQL query string
   * @param params - Query parameters
   * @returns Query results as array of objects
   */
  rawQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]

  // ===========================================================================
  // Batch mutation helpers
  // ===========================================================================

  /**
   * Run a function with FS sync paused.
   * Mutations inside `fn` write to DB/changes.jsonl but skip FS regeneration.
   * After `fn` completes, call `syncToFs(nodeId)` to regenerate affected files.
   */
  withDeferredFs<T>(fn: () => T): T

  /**
   * Regenerate the .md file that contains `nodeId`.
   * Walks up the parent chain to find the file node, then writes its subtree.
   * No-op if the node has no file ancestor or if there's no FS writer configured.
   */
  syncToFs(nodeId: string): void

  // ===========================================================================
  // Sync and lifecycle
  // ===========================================================================

  /**
   * One-shot sync between files and data.
   *
   * Reconciles the current state of files with the current state of data.
   * Only meaningful when files is present.
   *
   * @throws Error if repo has no files (bare repo)
   */
  sync(): Promise<SyncResult>

  /**
   * Create a Watcher for continuous sync.
   *
   * The watcher implements the Service interface with start/stop lifecycle.
   * Only available when files is present.
   *
   * @throws Error if repo has no files (bare repo)
   */
  watch(options?: Partial<WatcherOptions>): Watcher

  /**
   * Close and release all resources.
   */
  close(): void

  // ===========================================================================
  // Rebuild helpers
  // ===========================================================================

  /**
   * Check if state.db needs rebuild.
   * Returns true if:
   * - Disk mode: state.db doesn't exist or has unapplied events
   * - Memory mode: always returns false (ephemeral, no persistence)
   *
   * @throws Error if called on bare repo
   */
  needsRebuild(): boolean

  /**
   * Refresh the repo state.
   * - Memory mode: re-scan filesystem
   * - Disk mode: re-apply unapplied changes
   *
   * This is a generator that yields progress info during refresh.
   * Use runGenerator() for silent refresh, or iterate for progress.
   *
   * @throws Error if called on bare repo
   */
  refresh(): Generator<StepYield, void, unknown>
}

// =============================================================================
// Health Check: detect incomplete .km databases
// =============================================================================

/** Thrown when .km/state.db is corrupt or incomplete. */
export class IncompleteDatabase extends Error {
  constructor(reason: string, kmDir: string) {
    const repoPath = dirname(kmDir)
    super(
      `Incomplete database detected\n` +
        `  Reason: ${reason}\n` +
        `  Path:   ${kmDir}\n\n` +
        `  To rebuild the database:\n` +
        `    km doctor rebuild ${repoPath}`,
    )
    this.name = "IncompleteDatabase"
  }
}

/** SQLite error codes that indicate the on-disk file is corrupt/unusable. */
const CORRUPT_SQLITE_CODES = new Set(["SQLITE_CORRUPT", "SQLITE_NOTADB", "SQLITE_IOERR_SHORT_READ", "SQLITE_CANTOPEN"])

/** True if the error looks like on-disk corruption (vs. a logic error). */
function isCorruptionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err instanceof SQLiteError) {
    if (err.code && CORRUPT_SQLITE_CODES.has(err.code)) return true
  }
  const msg = err.message.toLowerCase()
  return (
    msg.includes("malformed") ||
    msg.includes("not a database") ||
    msg.includes("database disk image") ||
    msg.includes("file is not a database")
  )
}

/** Performance pragmas for disk-mode SQLite (WAL, cache, mmap). Throws SQLiteError on corrupt DB. */
function configurePragmas(db: Database): void {
  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA synchronous = NORMAL")
  db.run("PRAGMA temp_store = MEMORY")
  db.run("PRAGMA cache_size = -200000")
  db.run("PRAGMA mmap_size = 268435456")
  db.run("PRAGMA wal_autocheckpoint = 10000")
}

/**
 * Move a corrupt state.db (and its WAL/SHM sidecars) aside so a fresh one can be created.
 * The corrupt files are renamed with a timestamp suffix and a brief diagnostic log is emitted.
 * Returns the quarantine directory path used for the moved files.
 */
function quarantineCorruptDb(dbPath: string, reason: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const suffix = `.corrupt-${timestamp}`
  const moved: string[] = []
  for (const sidecar of ["", "-wal", "-shm"]) {
    const src = dbPath + sidecar
    if (existsSync(src)) {
      const dest = src + suffix
      try {
        renameSync(src, dest)
        moved.push(dest)
      } catch (renameErr) {
        log.debug?.(`quarantineCorruptDb: failed to rename ${src}: ${String(renameErr)}`)
      }
    }
  }
  log.debug?.(`quarantineCorruptDb: reason=${reason} moved=${moved.length} files (${moved.join(", ")})`)
  return moved[0] ?? dbPath + suffix
}

/**
 * Open a disk-mode SQLite database with corruption recovery.
 *
 * If opening or configuring the database fails with a corruption error, the corrupt
 * state.db (and its -wal/-shm sidecars) is moved aside with a timestamped suffix and
 * a fresh database is created at the original path. Callers are responsible for
 * replaying changes.jsonl into the fresh database afterwards (loadRepo does this).
 */
function openDiskDatabase(dbPath: string): Database {
  try {
    const db = new Database(dbPath)
    configurePragmas(db)
    // Sanity probe: a corrupt file may only fail when actually read.
    db.run("SELECT 1")
    return db
  } catch (err) {
    if (!isCorruptionError(err)) throw err
    const reason = err instanceof Error ? err.message : String(err)
    log.debug?.(`openDiskDatabase: corrupt DB detected at ${dbPath}, moving aside and rebuilding`)
    quarantineCorruptDb(dbPath, reason)
    const db = new Database(dbPath)
    configurePragmas(db)
    return db
  }
}

/**
 * Detect absolute fs_path values in the database.
 * These indicate a pre-migration database that must be rebuilt.
 *
 * Returns a descriptive string if absolute paths found, or null if OK.
 */
function detectAbsolutePaths(db: Database): string | null {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM nodes WHERE fs_path LIKE '/%'").get() as { cnt: number }
  if (row.cnt === 0) return null
  return (
    `database contains ${row.cnt} node(s) with absolute fs_path values. ` +
    `Since v0.x, fs_path must be relative to the repo root`
  )
}

/**
 * Check if a disk-mode database is incomplete/stale.
 *
 * Returns a descriptive string if incomplete, or null if OK.
 * Checks:
 * 1. Events.jsonl has content (fresh init with no events is not corrupt)
 * 2. Root node has no structural children (file/folder) despite filesystem having entries
 * 3. Database has very few nodes overall (<=1, original check)
 */
function isDatabaseIncomplete(db: Database, rootPath: string, kmDir: string): string | null {
  // Fresh init: missing or empty changes.jsonl means sync hasn't run yet — not corrupt
  const changesPath = join(kmDir, "changes.jsonl")
  if (!existsSync(changesPath)) return null
  const eventsContent = readFileSync(changesPath, "utf-8").trim()
  if (eventsContent.length === 0) return null

  // Count filesystem entries that should be indexed
  if (!existsSync(rootPath)) return null
  const fsEntries = readdirSync(rootPath).filter(
    (f) => f.endsWith(".md") || (statSync(join(rootPath, f)).isDirectory() && !f.startsWith(".")),
  )
  if (fsEntries.length === 0) return null // Empty vault, nothing to check

  // Count total nodes
  const totalNodes = (db.prepare("SELECT COUNT(*) as cnt FROM nodes").get() as { cnt: number }).cnt
  if (totalNodes <= 1) {
    return `database has ${totalNodes} node(s) but filesystem has ${fsEntries.length} entries`
  }

  // Check root's structural children (files and folders that should map to fs entries)
  const rootStructural = (
    db
      .prepare("SELECT COUNT(*) as cnt FROM nodes WHERE parent_id = '.' AND id != '.' AND type = 'h' AND item = 1")
      .get() as {
      cnt: number
    }
  ).cnt

  if (rootStructural === 0 && fsEntries.length > 0) {
    return (
      `root has 0 file/folder children but filesystem has ${fsEntries.length} entries ` +
      `(${totalNodes} total nodes in database, likely stale)`
    )
  }

  return null
}

// =============================================================================
// Directory Expansion (for preloadDepth)
// =============================================================================

/** Internal result from expandUnexploredDirectory */
interface ExpandInternalResult {
  nodeCount: number
  pendingLinks: PendingLink[]
  newUnexploredDirs: UnexploredDir[]
}

/**
 * Expand a single unexplored directory by scanning it and inserting nodes into the database.
 * Uses the original repoRoot for consistent ID generation and relative paths.
 *
 * This is intentionally simpler than the full discoverFiles() pipeline:
 * - No progress yielding (runs synchronously)
 * - No file counting step
 * - Respects preloadDepth for nested directories
 */
function expandUnexploredDirectory(
  db: Database,
  repoRoot: string,
  dir: UnexploredDir,
  options: { parseMode: "stub" | "full"; preloadDepth?: number },
): ExpandInternalResult {
  const fullPath = join(repoRoot, dir.path)
  if (!existsSync(fullPath)) return { nodeCount: 0, pendingLinks: [], newUnexploredDirs: [] }

  const ignorePatterns = getIgnorePatterns(repoRoot)
  const preloadDepth = options.preloadDepth ?? Infinity
  const now = Date.now()
  const changes: Change[] = []
  const pendingLinks: PendingLink[] = []
  const newUnexploredDirs: UnexploredDir[] = []
  const visitedDirs = new Set<string>()

  // Track the current dir's realpath to prevent cycles
  try {
    visitedDirs.add(realpathSync(fullPath))
  } catch {
    return { nodeCount: 0, pendingLinks: [], newUnexploredDirs: [] }
  }

  // Scan starting at depth 0 relative to this directory
  scanDir(fullPath, dir.id, 0)

  // Apply changes to database
  if (changes.length > 0) {
    db.run("BEGIN IMMEDIATE")
    try {
      const insertStmt = db.prepare(INSERT_NODE_SQL)
      for (const change of changes) {
        if (change.type === "node_created") {
          const data = change.data as Record<string, unknown>
          insertStmt.run(
            data.id as string,
            data.type as string,
            (data.fstype as string) ?? null,
            (data.parent_id as string) ?? ".",
            data.item ? 1 : 0,
            (data.embed_of as string) ?? null,
            (data.parent_idx as number) ?? 0,
            (data.fs_path as string) ?? null,
            (data.fs_ino as number) ?? null,
            (data.fs_mtime as number) ?? null,
            (data.name as string) ?? null,
            (data.block_id as string) ?? null,
            (data.title as string) ?? null,
            (data.md_pos as number) ?? null,
            (data.md_line as number) ?? null,
            (data.list_marker as string) ?? null,
            (data.task_marker as string) ?? null,
            (data.task_status as string) ?? null,
            (data.assigned_to as string) ?? null,
            (data.due_at as string) ?? null,
            (data.start_at as string) ?? null,
            (data.priority as string) ?? null,
            (data.content as string) ?? null,
            (data.content_hash as string) ?? null,
            JSON.stringify(data.data ?? {}),
            change.ts,
            change.ts,
            change.id,
          )
        }
      }
      db.run("COMMIT")
    } catch (error) {
      db.run("ROLLBACK")
      throw error
    }
  }

  return { nodeCount: changes.length, pendingLinks, newUnexploredDirs }

  function scanDir(dirPath: string, parentId: string, depth: number): void {
    let entries
    try {
      entries = readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    let order = 0
    for (const entry of entries) {
      const entryPath = join(dirPath, entry.name)
      if (shouldIgnore(entryPath, ignorePatterns, repoRoot)) continue

      if (entry.isSymbolicLink()) {
        let targetStat
        try {
          targetStat = statSync(entryPath)
        } catch {
          continue // broken symlink
        }
        if (targetStat.isDirectory()) {
          let real: string
          try {
            real = realpathSync(entryPath)
          } catch {
            continue
          }
          if (visitedDirs.has(real)) continue
          visitedDirs.add(real)
          handleDir(entryPath, parentId, order++, entry.name, depth)
        } else if (targetStat.isFile()) {
          handleFile(entryPath, parentId, order++, entry.name)
        }
        continue
      }

      if (entry.isDirectory()) {
        let real: string
        try {
          real = realpathSync(entryPath)
        } catch {
          continue
        }
        if (visitedDirs.has(real)) continue
        visitedDirs.add(real)
        handleDir(entryPath, parentId, order++, entry.name, depth)
        continue
      }

      if (entry.isFile()) {
        handleFile(entryPath, parentId, order++, entry.name)
      }
    }
  }

  function handleDir(dirPath: string, parentId: string, order: number, name: string, depth: number): void {
    const folderId = generatePathBasedId(repoRoot, dirPath)
    const relPath = toRelativeFsPath(repoRoot, dirPath)
    changes.push({
      id: folderId,
      type: "node_created",
      actor: "fs-expand",
      ts: now,
      data: {
        id: folderId,
        type: "h",
        item: {},
        fstype: "folder",
        parent_id: parentId,
        parent_idx: order,
        fs_path: relPath,
        name,
        content: name,
      },
    })

    if (depth >= preloadDepth) {
      // Record as unexplored
      let childCount = 0
      try {
        const entries = readdirSync(dirPath)
        childCount = entries.filter((n) => !shouldIgnore(join(dirPath, n), ignorePatterns, repoRoot)).length
      } catch {
        // ignore
      }
      newUnexploredDirs.push({ id: folderId, path: relPath, parentId, childCount })
    } else {
      scanDir(dirPath, folderId, depth + 1)
    }
  }

  function handleFile(filePath: string, parentId: string, order: number, entryName: string): void {
    const fileId = generatePathBasedId(repoRoot, filePath)
    const relPath = toRelativeFsPath(repoRoot, filePath)
    const isMd = entryName.endsWith(".md")
    const isTxt = entryName.endsWith(".txt")

    if (!isMd && !isTxt) {
      // Non-markdown file
      changes.push({
        id: fileId,
        type: "node_created",
        actor: "fs-expand",
        ts: now,
        data: {
          id: fileId,
          type: "h",
          item: {},
          fstype: "file",
          parent_id: parentId,
          parent_idx: order,
          fs_path: relPath,
          content: entryName,
        },
      })
      return
    }

    if (options.parseMode === "stub") {
      const ext = isTxt ? /\.txt$/i : /\.md$/i
      const name = entryName.replace(ext, "")
      changes.push({
        id: fileId,
        type: "node_created",
        actor: "fs-expand",
        ts: now,
        data: {
          id: fileId,
          type: "h",
          item: {},
          fstype: isTxt ? "txtfile" : "mdfile",
          parent_id: parentId,
          parent_idx: order,
          fs_path: relPath,
          name,
          title: name,
          data: { _stub: true },
        },
      })
    } else {
      // Full parse mode
      try {
        const content = readFileSync(filePath, "utf-8")
        const { nodes, wikilinks } = isTxt
          ? parsePlainTextToNodes(content, filePath)
          : parseMarkdownWithLinks(content, filePath)

        const fileNode = nodes[0]
        if (fileNode?.type === "h" && fileNode?.item && (fileNode.fstype === "file" || fileNode.fstype === "mdfile")) {
          fileNode.parent_id = parentId
          fileNode.parent_idx = order
          fileNode.fs_path = relPath
        }

        for (const node of nodes) {
          const nodeId = node.id ?? generatePathBasedId(repoRoot, filePath, node.md_line)
          changes.push({
            id: nodeId,
            type: "node_created",
            actor: "fs-expand",
            ts: now,
            data: { ...node, id: nodeId },
          })
        }

        for (const wikilink of wikilinks) {
          pendingLinks.push(wikilink)
        }
      } catch {
        // Skip files we can't read
      }
    }
  }
}

// =============================================================================
// Factory: createRepo
// =============================================================================

/** Result from repo initialization helpers */
interface RepoInitResult {
  db: Database
  mode: "memory" | "disk"
  emitter: Emitter
  dataStore: DataStore & HasDatabase
  loadErrors: LoadError[]
  stats: RepoStats
  deferredFiles: DeferredFile[]
  unexploredDirs: UnexploredDir[]
}

/**
 * Initialize repo by loading and parsing markdown files into the database.
 * ADR-002: Creates its own db instead of relying on singleton.
 *
 * @param rootPath - Path to the repo root directory
 * @param kmDir - Path to the .km directory
 * @param options - Creation options
 * @yields Progress info delegated from loadRepo
 * @returns Initialization result with db, dataStore, and loading stats
 */
function* initWithFileLoading(
  rootPath: string,
  kmDir: string,
  options: CreateRepoOptions,
): Generator<StepYield, RepoInitResult, unknown> {
  // Detect mode and create database BEFORE calling loadRepo
  const hasKmDir = existsSync(kmDir) && !options.forceMemory
  const mode = hasKmDir ? "disk" : "memory"

  // Create emitter early - needed for disk mode DataStore
  const emitter = createEmitter({ kmDir })

  let db: Database
  if (mode === "disk") {
    if (!existsSync(kmDir)) {
      mkdirSync(kmDir, { recursive: true })
    }
    const dbPath = join(kmDir, "state.db")
    db = openDiskDatabase(dbPath)
    const migrateResult = migrateSchema(db)
    // Data migration: run BEFORE SCHEMA (same as migrateSchema) so that
    // readDataVersion sees the pre-SCHEMA meta state — fresh DBs have no
    // meta table yet → returns DATA_VERSION (no migration needed).
    const dataResult = migrateData(db)
    db.run(SCHEMA)
    if (migrateResult.ftsDropped) rebuildFtsIndex(db)
    if (dataResult.needsRebuild) {
      log.debug?.("Data version upgrade — rebuilding database from source files...")
    }
  } else {
    db = new Database(":memory:")
    db.run(SCHEMA)
  }

  // Now call loadRepo with OUR db (avoids singleton)
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Internal use of loadRepo is acceptable here
  const loadResult = yield* loadRepo(rootPath, {
    searchAncestors: false, // rootPath is already the repo root
    skipLinkResolution: options.skipLinkResolution,
    discoverOnly: options.discoverOnly,
    preloadDepth: options.preloadDepth,
    mode, // Pass our mode decision to loadRepo
    db, // ADR-002: pass db to avoid singleton
  })

  // Create DataStore - pass emitter for disk mode only
  const dataStore = createDBDataStore(db, mode === "disk" ? { emitter } : undefined)

  // Capture loading results
  const loadErrors = loadResult.errors
  const stats: RepoStats = {
    nodeCount: loadResult.nodeCount,
    linkCount: loadResult.linkCount,
    duration: loadResult.duration,
  }
  const deferredFiles = loadResult.deferredFiles ?? []
  const unexploredDirs = loadResult.unexploredDirs ?? []

  // Health checks for disk mode
  if (mode === "disk") {
    // Detect absolute fs_path values (pre-migration database)
    const hasAbsolute = detectAbsolutePaths(db)
    if (hasAbsolute) {
      db.close()
      throw new IncompleteDatabase(hasAbsolute, kmDir)
    }

    // Detect incomplete .km database (interrupted init/sync)
    const isIncomplete = isDatabaseIncomplete(db, rootPath, kmDir)
    if (isIncomplete) {
      db.close()
      throw new IncompleteDatabase(isIncomplete, kmDir)
    }
  }

  log.debug?.(`loaded files: ${stats.nodeCount} nodes, ${stats.linkCount} links, ${loadErrors.length} errors`)

  return { db, mode, emitter, dataStore, loadErrors, stats, deferredFiles, unexploredDirs }
}

/**
 * Initialize repo with an empty database (no file loading).
 * Yields progress steps for UI feedback.
 *
 * @param kmDir - Path to the .km directory
 * @param options - Creation options
 * @yields Progress step declarations and step names
 * @returns Initialization result with db, dataStore, and empty stats
 */
function* initEmptyDb(kmDir: string, options: CreateRepoOptions): Generator<StepYield, RepoInitResult, unknown> {
  // Declare all sub-steps upfront so they appear as pending
  yield {
    declare: ["Detecting mode", "Initializing database", "Scanning files"],
  }

  // Step 1: Detect mode
  yield "Detecting mode"
  const hasKmDir = existsSync(kmDir) && !options.forceMemory
  const mode = hasKmDir ? "disk" : "memory"

  // Create emitter early - needed for disk mode DataStore
  const emitter = createEmitter({ kmDir })

  log.debug?.(`detected mode: ${mode} (hasKmDir=${hasKmDir})`)

  // Step 2: Initialize database
  yield "Initializing database"

  let db: Database
  let dataStore: DataStore & HasDatabase
  if (mode === "disk") {
    // Ensure .km directory exists
    if (!existsSync(kmDir)) {
      mkdirSync(kmDir, { recursive: true })
    }

    const dbPath = join(kmDir, "state.db")
    db = openDiskDatabase(dbPath)
    const migrateResult = migrateSchema(db)
    const dataResult = migrateData(db)
    db.run(SCHEMA)
    if (migrateResult.ftsDropped) rebuildFtsIndex(db)
    if (dataResult.needsRebuild) {
      log.debug?.("Data version upgrade — rebuilding database from source files...")
    }
    dataStore = createDBDataStore(db, { emitter })
  } else {
    // Memory mode - ephemeral (no emitter = direct SQL)
    db = new Database(":memory:")
    db.run(SCHEMA)
    dataStore = createDBDataStore(db)
  }

  // Step 3: Scan files (for full repo)
  yield "Scanning files"

  return {
    db,
    mode,
    emitter,
    dataStore,
    loadErrors: [],
    stats: { nodeCount: 0, linkCount: 0, duration: 0 },
    deferredFiles: [],
    unexploredDirs: [],
  }
}

/** Options for createRepo */
export interface CreateRepoOptions {
  /** Force memory mode even if .km/ exists */
  forceMemory?: boolean
  /** Skip initial file scan (for faster startup) */
  lazy?: boolean
  /** Custom config path */
  configPath?: string
  /**
   * Load and parse markdown files into the database.
   * When true, discovers files, parses markdown, and populates the database.
   * Default: false (database starts empty, use sync() to populate)
   */
  loadFiles?: boolean
  /** Skip link resolution for faster startup (only when loadFiles is true) */
  skipLinkResolution?: boolean
  /**
   * Discover-only mode for instant render (only when loadFiles is true).
   * Creates stub nodes without parsing - call parseDeferredAsync() afterward.
   */
  discoverOnly?: boolean
  /**
   * Maximum directory depth to eagerly load at startup.
   * Directories beyond this depth are recorded as unexplored and can be
   * loaded on demand via expandDirectory() or expandAll().
   * Default: Infinity (load everything).
   */
  preloadDepth?: number
  /** Lifecycle hooks for mutation interception */
  hooks?: RepoHooks
}

/**
 * Create a full Repo with DataStore + FileTree + Config.
 *
 * This is the most common way to create a Repo. It:
 * - Detects .km/ directory to determine persistence mode
 * - Creates DataStore (disk or memory based on mode)
 * - Creates FileTree for the repo root
 * - Loads config from cosmiconfig
 *
 * This is a generator that yields progress info during loading.
 * Use runGenerator() for silent loading, or iterate for progress.
 *
 * @example
 * ```typescript
 * // Silent loading
 * using repo = runGenerator(createRepo("/path/to/repo"))
 *
 * // With progress
 * for (const progress of createRepo(path)) {
 *   spinner.update(`${progress}`);
 * }
 *
 * // Query nodes
 * const node = repo.data.getNode("abc123")
 *
 * // Read/write files
 * const content = repo.files?.read("inbox.md")
 *
 * // Start watching for changes
 * const watcher = repo.watch()
 * await watcher.start()
 * ```
 *
 * @param rootPath - Path to the repo root directory
 * @param options - Creation options
 * @yields Progress info for each loading phase
 * @returns Repo domain object
 */
export function* createRepo(
  rootPath: string = process.cwd(),
  options: CreateRepoOptions = {},
): Generator<StepYield, Repo, unknown> {
  log.debug?.(`createRepo rootPath=${rootPath}`)

  // kmDir is used for emitter and disk mode detection
  const kmDir = join(rootPath, ".km")

  // Delegate to the appropriate initialization helper
  const { db, mode, emitter, dataStore, loadErrors, stats, deferredFiles, unexploredDirs } = options.loadFiles
    ? yield* initWithFileLoading(rootPath, kmDir, options)
    : yield* initEmptyDb(kmDir, options)

  // Mutable list of unexplored directories (shrinks as dirs are expanded)
  const remainingUnexplored = [...unexploredDirs]

  // Register lightweight FS writer for disk-mode repos (CLI write-back).
  // The TUI replaces this with withSync() which wraps emitter.apply().
  // Must happen before repo construction so syncToFs can reference applyChangeToFs.
  let fsApplyChangeToFs: ((change: Change) => void) | null = null
  if (mode === "disk") {
    const result = withFsWriter({
      database: db,
      path: rootPath,
      emitter,
      apply: (change, options?) => emitter.apply(change, options),
      commit: (change, options?) => emitter.commit(change, options),
    })
    fsApplyChangeToFs = result.applyChangeToFs
  }

  // Create FileTree for the repo root
  const fileTree = createDiskFileTree(rootPath)

  // Load config
  const config = loadConfigObject(rootPath)

  // Capture hooks from options
  const hooks = options.hooks

  let closed = false
  function ensureOpen() {
    if (closed) throw new Error("Repo is closed")
  }

  // Create shared methods using factories
  const childrenCache = createChildrenCache(dataStore)
  const methodDeps: RepoMethodDeps = {
    db,
    dataStore,
    hooks,
    childrenCache,
    rootPath,
  }
  const queryMethods = createQueryMethods(methodDeps)
  // Version holder — shared between mutation methods and the repo object.
  // Getter/setter needed: mutation methods are created before `repo` exists,
  // so they increment state.version via closure. The getter aliases
  // repo.version → state.version to keep them in sync.
  const listeners = new Set<() => void>()
  const state = {
    version: 0,
    notify() {
      for (const cb of listeners) cb()
    },
  }
  const mutationMethods = createMutationMethods(methodDeps, state)

  const repo: Repo = {
    path: rootPath,
    mode,
    get version() {
      return state.version
    },
    set version(v: number) {
      state.version = v
    },
    subscribe(callback: () => void) {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },
    getSnapshot() {
      return state.version
    },
    touch() {
      childrenCache.clear()
      state.version++
      state.notify()
    },
    get data() {
      ensureOpen()
      return dataStore
    },
    get files() {
      ensureOpen()
      return fileTree
    },
    get config() {
      ensureOpen()
      return config
    },
    get database() {
      ensureOpen()
      return db
    },
    loadErrors,
    stats,
    deferredFiles,
    get unexploredDirs() {
      return remainingUnexplored
    },
    set unexploredDirs(dirs: UnexploredDir[]) {
      remainingUnexplored.length = 0
      remainingUnexplored.push(...dirs)
    },

    async expandDirectory(dirPath: string): Promise<ExpandResult> {
      ensureOpen()

      // Find and remove the directory from unexplored list
      const idx = remainingUnexplored.findIndex((d) => d.path === dirPath)
      if (idx === -1) {
        throw new Error(`Directory not in unexplored list: ${dirPath}`)
      }
      const dir = remainingUnexplored.splice(idx, 1)[0]! // eslint-disable-line @typescript-eslint/no-non-null-assertion -- idx bounds-checked above

      // Run a targeted discovery on just this directory, using the original
      // repo root for consistent ID generation and relative paths.
      const result = expandUnexploredDirectory(db, rootPath, dir, {
        parseMode: options.discoverOnly ? "stub" : "full",
        preloadDepth: options.preloadDepth,
      })

      // Add any newly discovered unexplored dirs to the remaining list
      remainingUnexplored.push(...result.newUnexploredDirs)

      // Resolve links if we have them
      let linkCount = 0
      if (result.pendingLinks.length > 0) {
        linkCount = await resolveLinksAsyncImpl(db, result.pendingLinks)
      }

      // Bust all caches and bump version so TUI re-renders
      childrenCache.clear()
      clearNameIndex()
      clearResolveCache()
      state.version++
      state.notify()

      return {
        nodeCount: result.nodeCount,
        linkCount,
        newUnexploredDirs: result.newUnexploredDirs,
      }
    },

    async *expandAll(): AsyncGenerator<ExpandProgress> {
      ensureOpen()

      while (remainingUnexplored.length > 0) {
        const dir = remainingUnexplored[0]! // eslint-disable-line @typescript-eslint/no-non-null-assertion -- length > 0 checked in while
        const result = await this.expandDirectory(dir.path)
        yield {
          dirPath: dir.path,
          nodeCount: result.nodeCount,
          remaining: remainingUnexplored.length,
        }
      }
    },

    emitter,

    // Change application (delegates to emitter)
    apply(change, options?) {
      return emitter.apply(change, options)
    },
    commit(change, options?) {
      return emitter.commit(change, options)
    },

    // Spread shared query and mutation methods
    ...queryMethods,
    ...mutationMethods,

    // Batch mutation helpers
    withDeferredFs(fn) {
      // Temporarily swap emitter.apply to skip FS projection.
      // The FS decorator wraps emitter.apply; replacing it with commit
      // bypasses the wrapper so mutations only hit DB + journal + broadcast.
      const wrapped = emitter.apply
      emitter.apply = emitter.commit.bind(emitter) as typeof emitter.apply
      try {
        return fn()
      } finally {
        emitter.apply = wrapped
      }
    },

    syncToFs(nodeId) {
      if (!fsApplyChangeToFs) return
      const node = dataStore.getNode(nodeId)
      if (!node) return
      // Synthesize a node_updated change to trigger file regeneration.
      // Calls the FS handler directly — no DB, no journal, no broadcast.
      fsApplyChangeToFs({
        id: "sync",
        ts: Date.now(),
        type: "node_updated",
        actor: "user",
        target: nodeId,
        data: {},
      } as Change)
    },

    // Full-repo specific methods
    appendTaskToFile(filePath, content, opts) {
      const relativePath = filePath.startsWith("/") ? filePath.slice(rootPath.length + 1) : filePath

      if (opts?.ensure) {
        const dir = dirname(relativePath)
        if (dir && dir !== "." && !fileTree.exists(dir)) {
          const baseName = basename(relativePath).replace(/\.md$/, "")
          fileTree.write(relativePath, `---\ntitle: ${baseName}\n---\n\n`)
        }
        if (!fileTree.exists(relativePath)) {
          const baseName = basename(relativePath).replace(/\.md$/, "")
          fileTree.write(relativePath, `---\ntitle: ${baseName}\n---\n\n`)
        }
      }

      const existing = fileTree.read(relativePath)
      fileTree.write(relativePath, existing + content)
    },

    pathExists(relativePath) {
      return fileTree.exists(relativePath)
    },

    sync() {
      log.debug?.("sync() called - not yet implemented")
      return Promise.resolve({ fromFiles: 0, fromData: 0, conflicts: [] })
    },

    watch(watchOptions = {}) {
      return createWatcher(rootPath, { db, ...watchOptions })
    },

    needsRebuild() {
      if (mode === "memory") {
        log.debug?.("needsRebuild: no (memory mode)")
        return false
      }
      return checkNeedsRebuild(rootPath, db)
    },

    *refresh() {
      log.debug?.("refresh not yet implemented")
      yield "Refreshing"
    },

    close() {
      if (closed) return
      closed = true
      log.debug?.("closing repo")
      hooks?.onClose?.()
      emitter.close()
      fileTree.close()
      dataStore.close()
      db.close()
    },

    [Symbol.dispose]() {
      this.close()
    },
  }

  return repo
}

// =============================================================================
// Factory: createBareRepo
// =============================================================================

/** Options for createBareRepo */
export interface CreateBareRepoOptions {
  /** Configuration (uses defaults if not provided) */
  config?: Config
  /** Root path for config loading (default: cwd) */
  configPath?: string
  /** Lifecycle hooks for mutation interception */
  hooks?: RepoHooks
  /** Pre-created emitter (if not provided, one is created) */
  emitter?: Emitter
  /** Skip persisting events to changes.jsonl (useful for tests) */
  skipPersist?: boolean
}

/**
 * Create a bare Repo with DataStore only (no files).
 *
 * Use this for:
 * - Daemon processes that only need database access
 * - API servers that don't need file sync
 * - Database-only operations (imports, exports, migrations)
 *
 * @example
 * ```typescript
 * // Bare repo with in-memory data
 * const data = createMemDataStore()
 * using repo = createBareRepo(data)
 *
 * // Query nodes
 * const node = repo.data.getNode("abc123")
 *
 * // files is null - no sync available
 * repo.sync()  // throws Error
 * ```
 *
 * @param data - DataStore instance (caller manages lifecycle)
 * @param options - Creation options
 * @returns Bare Repo domain object
 */
export function createBareRepo(dataStore: DataStore & HasDatabase, options: CreateBareRepoOptions = {}): Repo {
  log.debug?.("createBareRepo")

  const config = options.config ?? loadConfigObject(options.configPath)
  const db = dataStore.database
  const repoPath = options.configPath ?? process.cwd()
  const kmDir = join(repoPath, ".km")
  const emitter = options.emitter ?? createEmitter({ kmDir, db, skipPersist: options.skipPersist })
  const hooks = options.hooks

  let closed = false
  function ensureOpen() {
    if (closed) throw new Error("Repo is closed")
  }

  // Create shared methods using factories
  const childrenCache = createChildrenCache(dataStore)
  const methodDeps: RepoMethodDeps = {
    db,
    dataStore,
    hooks,
    childrenCache,
    rootPath: repoPath,
  }
  const queryMethods = createQueryMethods(methodDeps)
  // See comment in createRepo for why getter/setter is needed here
  const listeners = new Set<() => void>()
  const state = {
    version: 0,
    notify() {
      for (const cb of listeners) cb()
    },
  }
  const mutationMethods = createMutationMethods(methodDeps, state)

  const repo: Repo = {
    path: repoPath,
    mode: "memory" as const,
    get version() {
      return state.version
    },
    set version(v: number) {
      state.version = v
    },
    subscribe(callback: () => void) {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },
    getSnapshot() {
      return state.version
    },
    touch() {
      childrenCache.clear()
      state.version++
      state.notify()
    },
    get data() {
      ensureOpen()
      return dataStore
    },
    files: null,
    get config() {
      ensureOpen()
      return config
    },
    get database() {
      ensureOpen()
      return db
    },
    loadErrors: [],
    stats: { nodeCount: 0, linkCount: 0, duration: 0 },
    deferredFiles: [],
    unexploredDirs: [],
    async expandDirectory(_dirPath: string): Promise<ExpandResult> {
      return { nodeCount: 0, linkCount: 0, newUnexploredDirs: [] }
    },
    async *expandAll(): AsyncGenerator<ExpandProgress> {
      // No-op: bare repos have no unexplored directories
    },
    get emitter() {
      ensureOpen()
      return emitter
    },

    // Change application (delegates to emitter)
    apply(change, options?) {
      return emitter.apply(change, options)
    },
    commit(change, options?) {
      return emitter.commit(change, options)
    },

    // Spread shared query and mutation methods
    ...queryMethods,
    ...mutationMethods,

    // Batch mutation helpers (no-op for bare repos — no FS)
    withDeferredFs(fn) {
      return fn()
    },
    syncToFs() {
      // No-op: bare repos have no filesystem
    },

    // Bare repo specific methods (throw on file operations)
    appendTaskToFile() {
      throw new Error("Cannot appendTaskToFile: bare repo has no files")
    },
    pathExists(relativePath) {
      return existsSync(join(repoPath, relativePath))
    },
    sync() {
      return Promise.reject(new Error("Cannot sync: bare repo has no files"))
    },
    watch() {
      throw new Error("Cannot watch: bare repo has no files")
    },
    needsRebuild() {
      throw new Error("Cannot check needsRebuild: bare repo has no files")
    },
    *refresh() {
      throw new Error("Cannot refresh: bare repo has no files")
    },
    close() {
      if (closed) return
      closed = true
      log.debug?.("closing bare repo")
      hooks?.onClose?.()
      emitter.close()
      // Note: caller manages DataStore lifecycle for bare repos
    },
    [Symbol.dispose]() {
      this.close()
    },
  }

  return repo
}

// =============================================================================
// Re-export test factories from repo-test.ts
// =============================================================================

export { createTestEnvRepo, createTestRepo, type CreateTestEnvRepoOptions, type TestEnvRepoResult } from "./test.ts"

// =============================================================================
// Re-export hook types from repo-hooks.ts
// =============================================================================

export { type BeforeMutationResult, type MutationContext, type RepoHooks } from "./hooks.ts"
