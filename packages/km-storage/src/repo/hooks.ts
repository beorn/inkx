/**
 * Repo Mutation Hooks
 *
 * Lifecycle hooks for intercepting and modifying repo operations.
 * Extracted from repo.ts for better organization.
 */

import type { KNode } from "@km/core"

/** Type of mutation operation */
export type MutationType = "add" | "update" | "delete" | "move"

/** Context passed to mutation hooks */
export interface MutationContext {
  type: MutationType
  nodeId: string
  changes?: Partial<KNode>
  newParentId?: string
  position?: number
  node?: Partial<KNode>
}

/** Result from beforeMutation hook */
export interface BeforeMutationResult {
  /** Cancel the mutation */
  cancel?: boolean
  /** Modified context to use instead */
  context?: MutationContext
}

/** Lifecycle hooks for repo operations */
export interface RepoHooks {
  /** Called before a mutation. Can cancel or modify the mutation. */
  beforeMutation?(ctx: MutationContext): BeforeMutationResult | void
  /** Called after a successful mutation. */
  afterMutation?(ctx: MutationContext): void
  /** Called after a query operation. */
  afterQuery?(treeop: string, result: unknown): void
  /** Called when repo is closed. */
  onClose?(): void
}
