/**
 * Node ID Map
 *
 * O(1) node lookup by ID using a cached Map.
 * Inspired by Decker's IdEditor pattern: ed.$(id) for instant lookups.
 *
 * The map is built lazily and cached. When nodes change (REFRESH, ZOOM_IN, etc.),
 * the cache is invalidated and rebuilt on next lookup.
 *
 * Usage:
 *   const nodeMap = createNodeMap(state.nodes);
 *   const node = nodeMap.get(id);  // O(1) lookup
 *   const node = nodeMap.getOrNull(id);  // O(1) lookup, returns null if not found
 */

import type { TNode, TPath } from "./board-types.ts";

/**
 * Entry in the node map containing both the node and its path.
 */
export interface NodeMapEntry {
  node: TNode;
  path: TPath;
}

/**
 * Node lookup map with O(1) access by ID.
 */
export interface NodeMap {
  /** Get node by ID, throws if not found */
  get(id: string): TNode;
  /** Get node by ID, returns null if not found */
  getOrNull(id: string): TNode | null;
  /** Get node and path by ID, returns null if not found */
  getEntry(id: string): NodeMapEntry | null;
  /** Check if node exists */
  has(id: string): boolean;
  /** Get all node IDs */
  keys(): string[];
  /** Get node count */
  size: number;
}

/**
 * Build ID-to-node map from tree.
 */
function buildMap(nodes: TNode[]): Map<string, NodeMapEntry> {
  const map = new Map<string, NodeMapEntry>();

  function traverse(nodeList: TNode[], basePath: TPath): void {
    for (let i = 0; i < nodeList.length; i++) {
      const node = nodeList[i];
      if (!node) continue;
      const path = [...basePath, i];
      map.set(node.id, { node, path });
      if (node.children.length > 0) {
        traverse(node.children, path);
      }
    }
  }

  traverse(nodes, []);
  return map;
}

/**
 * Create a node map for O(1) lookups by ID.
 *
 * @param nodes - The tree of nodes to index
 * @returns NodeMap interface for lookups
 */
export function createNodeMap(nodes: TNode[]): NodeMap {
  const map = buildMap(nodes);

  return {
    get(id: string): TNode {
      const entry = map.get(id);
      if (!entry) {
        throw new Error(`Node not found: ${id}`);
      }
      return entry.node;
    },

    getOrNull(id: string): TNode | null {
      return map.get(id)?.node ?? null;
    },

    getEntry(id: string): NodeMapEntry | null {
      return map.get(id) ?? null;
    },

    has(id: string): boolean {
      return map.has(id);
    },

    keys(): string[] {
      return Array.from(map.keys());
    },

    get size(): number {
      return map.size;
    },
  };
}

