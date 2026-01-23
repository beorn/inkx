/**
 * FakeVault - Test Double for Vault
 *
 * In-memory Vault implementation for unit tests that don't need
 * real SQLite or file parsing. Uses canned data.
 */

import type { KNode, TaskStatus } from "@km/core";
import type { Vault, VaultStats, LoadError } from "../vault.ts";
import type { Link } from "../db.ts";

/**
 * Options for createFakeVault
 */
export interface FakeVaultOptions {
  /** Path to report (default: "/fake/vault") */
  path?: string;

  /** Initial nodes (can also add via addNode) */
  nodes?: KNode[];

  /** Initial links (for backlinks) */
  links?: Link[];

  /** Load errors to report */
  loadErrors?: LoadError[];

  /** Stats to report */
  stats?: Partial<VaultStats>;
}

/**
 * Extended Vault interface with test helpers
 */
export interface FakeVault extends Vault {
  /** Get all nodes (for test assertions) */
  getAllNodes(): KNode[];

  /** Get all links (for test assertions) */
  getAllLinks(): Link[];

  /** Reset to initial state */
  reset(): void;
}

/**
 * Create a FakeVault for testing.
 *
 * @example
 * // With canned data
 * const vault = createFakeVault({
 *   nodes: [
 *     { id: "1", type: "section", content: "Tasks", parentId: null, ... },
 *     { id: "2", type: "task", content: "Do something", parentId: "1", ... },
 *   ],
 * });
 *
 * // Empty vault
 * const vault = createFakeVault();
 * vault.addNode(null, { type: "section", content: "New section" });
 *
 * @param options - Configuration with initial data
 * @returns FakeVault instance
 */
export function createFakeVault(options: FakeVaultOptions = {}): FakeVault {
  const path = options.path ?? "/fake/vault";
  const initialNodes = options.nodes ?? [];
  const initialLinks = options.links ?? [];
  const loadErrors = options.loadErrors ?? [];
  const stats: VaultStats = {
    nodeCount: initialNodes.length,
    linkCount: initialLinks.length,
    duration: 0,
    ...options.stats,
  };

  // Internal state
  let nodes = new Map<string, KNode>();
  let links: Link[] = [];
  let nextId = 1;
  let closed = false;

  // Initialize with provided data
  reset();

  const vault: FakeVault = {
    get path() {
      return path;
    },

    get mode() {
      return "memory" as const;
    },

    get loadErrors() {
      return loadErrors;
    },

    get stats() {
      return { ...stats, nodeCount: nodes.size };
    },

    // --- Query operations ---

    getNode(id) {
      ensureNotClosed();
      return nodes.get(id) ?? null;
    },

    getChildren(parentId) {
      ensureNotClosed();
      return [...nodes.values()]
        .filter((n) => n.parent_id === parentId)
        .sort((a, b) => (a.parent_idx ?? 0) - (b.parent_idx ?? 0));
    },

    getSubtree(nodeId) {
      ensureNotClosed();
      const result: KNode[] = [];
      const queue = [nodeId];

      while (queue.length > 0) {
        const id = queue.shift()!;
        const node = nodes.get(id);
        if (node) {
          result.push(node);
          const children = this.getChildren(id);
          queue.push(...children.map((c) => c.id));
        }
      }

      return result;
    },

    getAncestors(nodeId) {
      ensureNotClosed();
      const result: KNode[] = [];
      let current = nodes.get(nodeId);

      while (current?.parent_id) {
        const parent = nodes.get(current.parent_id);
        if (parent) {
          result.unshift(parent);
          current = parent;
        } else {
          break;
        }
      }

      return result;
    },

    getAllTasks() {
      ensureNotClosed();
      return [...nodes.values()].filter((n) => n.type === "task");
    },

    getTasksByStatus(status) {
      ensureNotClosed();
      return [...nodes.values()].filter(
        (n) => n.type === "task" && n.task_status === status,
      );
    },

    search(query) {
      ensureNotClosed();
      const q = query.toLowerCase();
      return [...nodes.values()].filter(
        (n) =>
          n.content?.toLowerCase().includes(q) ||
          n.title?.toLowerCase().includes(q),
      );
    },

    query(_expression) {
      ensureNotClosed();
      // Simple implementation: return all tasks for basic tests
      // Full query language support is tested via real vault
      return this.getAllTasks();
    },

    getLinksTo(targetId) {
      ensureNotClosed();
      const linkingIds = links
        .filter((l) => l.target_id === targetId)
        .map((l) => l.source_id);
      return [...nodes.values()].filter((n) => linkingIds.includes(n.id));
    },

    getBacklinks(nodeId) {
      ensureNotClosed();
      return links.filter((l) => l.target_id === nodeId);
    },

    // --- Mutation operations ---

    updateNode(id, changes) {
      ensureNotClosed();
      const node = nodes.get(id);
      if (!node) {
        throw new Error(`Node ${id} not found`);
      }
      nodes.set(id, { ...node, ...changes, id });
    },

    moveNode(id, newParentId, position) {
      ensureNotClosed();
      const node = nodes.get(id);
      if (!node) {
        throw new Error(`Node ${id} not found`);
      }
      nodes.set(id, { ...node, parent_id: newParentId, parent_idx: position });
    },

    deleteNode(id) {
      ensureNotClosed();
      nodes.delete(id);
      // Remove any links from/to this node
      links = links.filter((l) => l.source_id !== id && l.target_id !== id);
    },

    addNode(parentId, nodeData) {
      ensureNotClosed();
      const id = `fake-${nextId++}`;
      const siblings = this.getChildren(parentId);
      const position = siblings.length;
      const now = Date.now();

      const node: KNode = {
        id,
        parent_id: parentId,
        parent_idx: position,
        link_to: null,
        data: {},
        created_at: now,
        updated_at: now,
        version: "fake-0",
        task_status:
          nodeData.type === "task" ? ("todo" as TaskStatus) : undefined,
        ...nodeData,
      };

      nodes.set(id, node);
      return id;
    },

    cloneTask(sourceId, changes) {
      ensureNotClosed();
      const source = nodes.get(sourceId);
      if (!source || source.type !== "task") return null;

      const id = `fake-${nextId++}`;
      const now = Date.now();

      const cloned: KNode = {
        ...source,
        id,
        task_status: changes.task_status ?? "todo",
        task_mark: changes.task_mark ?? " ",
        content: changes.content ?? source.content,
        due_date: changes.due_date ?? source.due_date,
        scheduled_date: changes.scheduled_date ?? source.scheduled_date,
        parent_idx: (source.parent_idx ?? 0) + 0.001,
        data: { ...source.data, ...changes.data, recur_prev: sourceId },
        created_at: now,
        updated_at: now,
        ...changes,
      };

      nodes.set(id, cloned);
      return id;
    },

    appendTaskToFile(_filePath, _content, _options) {
      ensureNotClosed();
      // No-op in fake vault - filesystem operations not supported
    },

    pathExists(_relativePath) {
      ensureNotClosed();
      // Always return false in fake vault
      return false;
    },

    // --- Lifecycle ---

    watch() {
      ensureNotClosed();
      throw new Error("FakeVault does not support watching");
    },

    refresh() {
      ensureNotClosed();
      // No-op for fake vault
    },

    close() {
      closed = true;
    },

    [Symbol.dispose]() {
      this.close();
    },

    // --- Test helpers ---

    getAllNodes() {
      return [...nodes.values()];
    },

    getAllLinks() {
      return [...links];
    },

    reset() {
      reset();
    },
  };

  return vault;

  function reset() {
    nodes = new Map();
    links = [...initialLinks];
    nextId = 1;
    closed = false;

    for (const node of initialNodes) {
      nodes.set(node.id, { ...node });
    }
  }

  function ensureNotClosed() {
    if (closed) {
      throw new Error("Vault is closed");
    }
  }
}
