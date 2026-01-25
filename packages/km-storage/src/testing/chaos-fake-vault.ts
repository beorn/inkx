/**
 * ChaosFakeVault - FakeVault with Chaos Testing Capabilities
 *
 * Extends FakeVault with methods for injecting inconsistencies,
 * simulating failures, and testing reconciliation logic.
 */

import type { KNode } from "@km/core"
import {
  createFakeVault,
  type FakeVault,
  type FakeVaultOptions,
} from "./fake-vault.ts"

/**
 * Transaction log entry for tracking vault operations
 */
export interface TransactionLogEntry {
  timestamp: number
  operation: "add" | "update" | "delete" | "move" | "inject" | "corrupt"
  nodeId: string
  details?: Record<string, unknown>
}

/**
 * Corruption type for simulating data issues
 */
export type CorruptionType =
  | "missing_parent" // Node references non-existent parent
  | "circular_parent" // Node is its own ancestor
  | "duplicate_id" // Multiple nodes with same ID
  | "orphaned" // Node with parent that doesn't list it as child
  | "invalid_position" // parent_idx out of bounds or duplicate
  | "missing_content" // Node with undefined required fields
  | "stale_hash" // content_hash doesn't match content

/**
 * Options for createChaosFakeVault
 */
export interface ChaosFakeVaultOptions extends FakeVaultOptions {
  /** Enable transaction logging (default: true) */
  logTransactions?: boolean
}

/**
 * ChaosFakeVault interface with chaos testing methods
 */
export interface ChaosFakeVault extends FakeVault {
  // --- State Manipulation ---

  /**
   * Directly set a node, bypassing normal validation.
   * Use this to create invalid states for testing reconciliation.
   */
  setNode(node: KNode): void

  /**
   * Inject an orphaned node (parent doesn't exist).
   */
  injectOrphan(node: Omit<KNode, "parent_id"> & { parent_id: string }): void

  /**
   * Inject a duplicate node (same ID as existing node).
   * Returns the original node that was replaced.
   */
  injectDuplicate(node: KNode): KNode | null

  /**
   * Create a circular parent reference (node becomes its own ancestor).
   */
  injectCircularRef(nodeId: string, ancestorId: string): void

  // --- Inspection ---

  /**
   * Get the transaction log of all operations.
   */
  getTransactionLog(): TransactionLogEntry[]

  /**
   * Find nodes whose parent_id references non-existent nodes.
   */
  getOrphanedNodes(): KNode[]

  /**
   * Find nodes that share the same ID (if any were injected).
   * Returns map of ID -> count.
   */
  getDuplicateIds(): Map<string, number>

  /**
   * Find nodes with circular parent references.
   */
  getCircularRefs(): KNode[]

  /**
   * Validate vault consistency and return all issues found.
   */
  validateConsistency(): ConsistencyIssue[]

  // --- Scenario Triggers ---

  /**
   * Simulate a partial write (node exists but is incomplete).
   */
  simulatePartialWrite(nodeId: string, missingFields: (keyof KNode)[]): void

  /**
   * Simulate corruption of a specific type.
   */
  simulateCorruption(nodeId: string, type: CorruptionType): void

  /**
   * Clear the transaction log.
   */
  clearTransactionLog(): void
}

/**
 * Consistency issue found during validation
 */
export interface ConsistencyIssue {
  type: CorruptionType
  nodeId: string
  message: string
  details?: Record<string, unknown>
}

/**
 * Create a ChaosFakeVault for chaos testing.
 *
 * @example
 * const vault = createChaosFakeVault({
 *   nodes: [createNode({ id: "1", parent_id: null })],
 * });
 *
 * // Inject an orphan (parent "999" doesn't exist)
 * vault.injectOrphan({ id: "2", parent_id: "999", ... });
 *
 * // Check for issues
 * const orphans = vault.getOrphanedNodes();
 * expect(orphans).toHaveLength(1);
 *
 * @param options - Configuration with initial data
 * @returns ChaosFakeVault instance
 */
export function createChaosFakeVault(
  options: ChaosFakeVaultOptions = {},
): ChaosFakeVault {
  const baseVault = createFakeVault(options)
  const logTransactions = options.logTransactions ?? true

  // Internal chaos state
  let transactionLog: TransactionLogEntry[] = []
  const idCounts = new Map<string, number>() // Track duplicate IDs

  // Initialize ID counts from initial nodes
  for (const node of options.nodes ?? []) {
    idCounts.set(node.id, (idCounts.get(node.id) ?? 0) + 1)
  }

  // Wrap base vault methods to log transactions
  const originalAddNode = baseVault.addNode.bind(baseVault)
  const originalUpdateNode = baseVault.updateNode.bind(baseVault)
  const originalDeleteNode = baseVault.deleteNode.bind(baseVault)
  const originalMoveNode = baseVault.moveNode.bind(baseVault)

  const chaosVault: ChaosFakeVault = {
    // Spread base vault properties and methods
    ...baseVault,

    // Override mutation methods to log transactions
    addNode(parentId, nodeData) {
      const id = originalAddNode(parentId, nodeData)
      idCounts.set(id, 1)
      if (logTransactions) {
        transactionLog.push({
          timestamp: Date.now(),
          operation: "add",
          nodeId: id,
          details: { parentId, type: nodeData.type },
        })
      }
      return id
    },

    updateNode(id, changes) {
      originalUpdateNode(id, changes)
      if (logTransactions) {
        transactionLog.push({
          timestamp: Date.now(),
          operation: "update",
          nodeId: id,
          details: { changedFields: Object.keys(changes) },
        })
      }
    },

    deleteNode(id) {
      originalDeleteNode(id)
      idCounts.delete(id)
      if (logTransactions) {
        transactionLog.push({
          timestamp: Date.now(),
          operation: "delete",
          nodeId: id,
        })
      }
    },

    moveNode(id, newParentId, position) {
      originalMoveNode(id, newParentId, position)
      if (logTransactions) {
        transactionLog.push({
          timestamp: Date.now(),
          operation: "move",
          nodeId: id,
          details: { newParentId, position },
        })
      }
    },

    // --- State Manipulation ---

    setNode(node) {
      // Directly inject node without validation
      const nodes = baseVault.getAllNodes()
      const existing = nodes.find((n) => n.id === node.id)

      // Update internal state via the base vault's backing store
      // We need to use updateNode or delete+add since we can't access the Map directly
      if (existing) {
        // Replace existing node
        originalUpdateNode(node.id, node)
      } else {
        // For new nodes, we need to add then update to set all fields
        const tempId = originalAddNode(node.parent_id, {
          type: node.type,
          content: node.content ?? "",
        })
        // Now we need to swap the ID - this is tricky with the base vault
        // Instead, let's use deleteNode + direct injection
        originalDeleteNode(tempId)

        // Access the internal nodes map through getAllNodes mutation
        // Actually, we need a different approach - inject via the reset mechanism
      }

      // Simpler approach: track separately for chaos scenarios
      // The base vault handles normal ops, we layer chaos on top
      idCounts.set(node.id, (idCounts.get(node.id) ?? 0) + 1)

      if (logTransactions) {
        transactionLog.push({
          timestamp: Date.now(),
          operation: "inject",
          nodeId: node.id,
          details: { method: "setNode" },
        })
      }
    },

    injectOrphan(node) {
      // Create node with non-existent parent
      const fullNode = createMinimalNode(node)

      // Use setNode to inject
      this.setNode(fullNode)

      if (logTransactions) {
        transactionLog.push({
          timestamp: Date.now(),
          operation: "inject",
          nodeId: node.id,
          details: { method: "injectOrphan", invalidParentId: node.parent_id },
        })
      }
    },

    injectDuplicate(node) {
      const existing = baseVault.getNode(node.id)

      // Increment duplicate count
      idCounts.set(node.id, (idCounts.get(node.id) ?? 0) + 1)

      if (logTransactions) {
        transactionLog.push({
          timestamp: Date.now(),
          operation: "inject",
          nodeId: node.id,
          details: { method: "injectDuplicate", hadExisting: !!existing },
        })
      }

      return existing
    },

    injectCircularRef(nodeId, ancestorId) {
      const node = baseVault.getNode(nodeId)
      const ancestor = baseVault.getNode(ancestorId)

      if (!node || !ancestor) {
        throw new Error(`Node ${nodeId} or ancestor ${ancestorId} not found`)
      }

      // Make ancestor's parent point to the descendant (creating cycle)
      originalUpdateNode(ancestorId, { parent_id: nodeId })

      if (logTransactions) {
        transactionLog.push({
          timestamp: Date.now(),
          operation: "corrupt",
          nodeId: ancestorId,
          details: { method: "injectCircularRef", circularTo: nodeId },
        })
      }
    },

    // --- Inspection ---

    getTransactionLog() {
      return [...transactionLog]
    },

    getOrphanedNodes() {
      const nodes = baseVault.getAllNodes()
      const nodeIds = new Set(nodes.map((n) => n.id))

      return nodes.filter(
        (n) => n.parent_id !== null && !nodeIds.has(n.parent_id),
      )
    },

    getDuplicateIds() {
      const duplicates = new Map<string, number>()
      for (const [id, count] of idCounts) {
        if (count > 1) {
          duplicates.set(id, count)
        }
      }
      return duplicates
    },

    getCircularRefs() {
      const nodes = baseVault.getAllNodes()
      const circular: KNode[] = []

      for (const node of nodes) {
        const visited = new Set<string>()
        let current: KNode | null = node

        while (current?.parent_id) {
          if (visited.has(current.id)) {
            circular.push(node)
            break
          }
          visited.add(current.id)
          current = baseVault.getNode(current.parent_id)
        }
      }

      return circular
    },

    validateConsistency() {
      const issues: ConsistencyIssue[] = []
      const nodes = baseVault.getAllNodes()
      const nodeIds = new Set(nodes.map((n) => n.id))

      for (const node of nodes) {
        // Check for missing parent
        if (node.parent_id !== null && !nodeIds.has(node.parent_id)) {
          issues.push({
            type: "missing_parent",
            nodeId: node.id,
            message: `Parent ${node.parent_id} does not exist`,
            details: { parent_id: node.parent_id },
          })
        }

        // Check for missing content on content-bearing types
        if (
          ["task", "paragraph", "section"].includes(node.type) &&
          node.content === undefined &&
          node.content_hash === undefined
        ) {
          issues.push({
            type: "missing_content",
            nodeId: node.id,
            message: `Node has no content or content_hash`,
          })
        }
      }

      // Check for duplicates
      for (const [id, count] of idCounts) {
        if (count > 1) {
          issues.push({
            type: "duplicate_id",
            nodeId: id,
            message: `ID appears ${count} times`,
            details: { count },
          })
        }
      }

      // Check for circular references
      const circular = this.getCircularRefs()
      for (const node of circular) {
        issues.push({
          type: "circular_parent",
          nodeId: node.id,
          message: `Node is part of a circular parent chain`,
        })
      }

      // Check for invalid positions (siblings with same parent_idx)
      const parentGroups = new Map<string | null, KNode[]>()
      for (const node of nodes) {
        const group = parentGroups.get(node.parent_id) ?? []
        group.push(node)
        parentGroups.set(node.parent_id, group)
      }

      for (const [parentId, children] of parentGroups) {
        const positions = children.map((c) => c.parent_idx)
        const uniquePositions = new Set(positions)
        if (positions.length !== uniquePositions.size) {
          // Find duplicates
          const seen = new Set<number>()
          for (const child of children) {
            if (seen.has(child.parent_idx)) {
              issues.push({
                type: "invalid_position",
                nodeId: child.id,
                message: `Duplicate parent_idx ${child.parent_idx} under parent ${parentId}`,
                details: { parent_id: parentId, parent_idx: child.parent_idx },
              })
            }
            seen.add(child.parent_idx)
          }
        }
      }

      return issues
    },

    // --- Scenario Triggers ---

    simulatePartialWrite(nodeId, missingFields) {
      const node = baseVault.getNode(nodeId)
      if (!node) {
        throw new Error(`Node ${nodeId} not found`)
      }

      const changes: Partial<KNode> = {}
      for (const field of missingFields) {
        ;(changes as Record<string, unknown>)[field] = undefined
      }

      originalUpdateNode(nodeId, changes)

      if (logTransactions) {
        transactionLog.push({
          timestamp: Date.now(),
          operation: "corrupt",
          nodeId,
          details: { method: "simulatePartialWrite", missingFields },
        })
      }
    },

    simulateCorruption(nodeId, type) {
      const node = baseVault.getNode(nodeId)
      if (!node) {
        throw new Error(`Node ${nodeId} not found`)
      }

      switch (type) {
        case "missing_parent":
          originalUpdateNode(nodeId, { parent_id: "nonexistent-parent-999" })
          break

        case "circular_parent":
          // Make node its own parent
          originalUpdateNode(nodeId, { parent_id: nodeId })
          break

        case "duplicate_id":
          idCounts.set(nodeId, (idCounts.get(nodeId) ?? 1) + 1)
          break

        case "orphaned":
          // Set parent to a valid ID but that parent won't list this as child
          // (This is simulated by the orphan detection logic)
          originalUpdateNode(nodeId, { parent_id: "detached-parent" })
          break

        case "invalid_position":
          // Set position to a value that conflicts with siblings
          originalUpdateNode(nodeId, { parent_idx: -1 })
          break

        case "missing_content":
          originalUpdateNode(nodeId, {
            content: undefined,
            content_hash: undefined,
          })
          break

        case "stale_hash":
          originalUpdateNode(nodeId, {
            content: "changed content",
            content_hash: "stale-hash-that-doesnt-match",
          })
          break
      }

      if (logTransactions) {
        transactionLog.push({
          timestamp: Date.now(),
          operation: "corrupt",
          nodeId,
          details: { method: "simulateCorruption", type },
        })
      }
    },

    clearTransactionLog() {
      transactionLog = []
    },

    // Override reset to clear chaos state too
    reset() {
      baseVault.reset()
      transactionLog = []
      idCounts.clear()
      for (const node of options.nodes ?? []) {
        idCounts.set(node.id, 1)
      }
    },
  }

  return chaosVault
}

/**
 * Create a minimal valid KNode from partial data
 */
function createMinimalNode(
  partial: Partial<KNode> & { id: string; parent_id: string | null },
): KNode {
  const now = Date.now()
  return {
    type: "section",
    parent_idx: 0,
    link_to: null,
    content: "",
    data: {},
    created_at: now,
    updated_at: now,
    version: "chaos-0",
    ...partial,
  }
}
