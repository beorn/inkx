/**
 * Normalization Plugins — auto-derive fields on mutation effects.
 *
 * SlateJS-style: plugins intercept BoardEffect[] before the runtime executes them.
 * Each plugin can modify effects (e.g., add derived fields to REPO_UPDATE_NODE).
 *
 * This eliminates the class of bugs where callers set `content` but forget `title`.
 * See /why analysis: commit dff82084.
 */

import { KNode } from "@km/core"
import type { BoardEffect } from "./board-reducer.ts"

// =============================================================================
// Plugin type
// =============================================================================

/**
 * A normalization plugin transforms effects before execution.
 * Receives the full effect list, returns a (possibly modified) effect list.
 */
export type NormalizePlugin = (effects: BoardEffect[], getNode?: (id: string) => KNode | null) => BoardEffect[]

// =============================================================================
// withTitle — auto-derive title from content
// =============================================================================

/**
 * When content changes, auto-set title = content.
 *
 * Title is a materialized display field. The parser sets it at parse time,
 * but runtime edits must keep it in sync. Without this plugin, every caller
 * of REPO_UPDATE_NODE must remember to include title — and they forget.
 */
export function withTitle(effects: BoardEffect[]): BoardEffect[] {
  return effects.map((effect) => {
    if (effect.type !== "REPO_UPDATE_NODE") return effect
    if (effect.updates.content === undefined) return effect
    // Don't override if caller explicitly set title to something different
    if (effect.updates.title !== undefined) return effect
    // Content is always clean text (no task marker — that's in item.task).
    // Title = content. The parser does the same (ast2nodes.ts: title = cleanText).
    return {
      ...effect,
      updates: { ...effect.updates, title: effect.updates.content },
    }
  })
}

// =============================================================================
// withName — auto-derive name from content for outline nodes
// =============================================================================

/**
 * When content changes on an outline node, auto-set name = content (stripped of task marker).
 *
 * Name is the slug used for filesystem sync and wikilink resolution.
 * Without this, renaming a heading in the TUI leaves the old name,
 * causing filesystem sync to create new files instead of renaming.
 */
export function withName(effects: BoardEffect[], getNode?: (id: string) => KNode | null): BoardEffect[] {
  if (!getNode) return effects
  return effects.map((effect) => {
    if (effect.type !== "REPO_UPDATE_NODE") return effect
    if (effect.updates.content === undefined) return effect
    // Don't override if caller explicitly set name
    if (effect.updates.name !== undefined) return effect
    // Only for outline nodes (headings/sections)
    const node = getNode(effect.nodeId)
    if (!node || !KNode.isOutline(node)) return effect
    return {
      ...effect,
      updates: {
        ...effect.updates,
        name: effect.updates.content.replace(/^- \[.\]\s*/, ""),
      },
    }
  })
}

// =============================================================================
// Compose — chain multiple plugins
// =============================================================================

/**
 * Compose multiple normalization plugins into one.
 * Plugins are applied left to right (first plugin's output feeds into second).
 */
export function composePlugins(...plugins: NormalizePlugin[]): NormalizePlugin {
  return (effects, getNode) => {
    let result = effects
    for (const plugin of plugins) {
      result = plugin(result, getNode)
    }
    return result
  }
}

// =============================================================================
// Default pipeline
// =============================================================================

/** The standard normalization pipeline: withTitle + withName. */
export const defaultNormalize = composePlugins(withTitle, withName)

// =============================================================================
// Invariant validation (development-time assertions)
// =============================================================================

/**
 * Validate invariants on effects AFTER normalization.
 * Throws if any invariant is violated — catch bugs at mutation time, not render time.
 *
 * Run in development/test only (controlled by caller).
 */
export function validateEffects(effects: BoardEffect[], getNode?: (id: string) => KNode | null): void {
  for (const effect of effects) {
    if (effect.type === "REPO_UPDATE_NODE") {
      validateUpdateNode(effect, getNode)
    }
  }
}

function validateUpdateNode(
  effect: Extract<BoardEffect, { type: "REPO_UPDATE_NODE" }>,
  getNode?: (id: string) => KNode | null,
): void {
  const { updates } = effect

  // Invariant 1: If content is set, title must also be set
  if (updates.content !== undefined && updates.title === undefined) {
    throw new Error(
      `INVARIANT: REPO_UPDATE_NODE for ${effect.nodeId} sets content without title. ` +
        `This will cause view/edit divergence. Use the normalization pipeline or set title explicitly.`,
    )
  }

  // Invariant 2: If content is set on an outline node, name must also be set
  if (updates.content !== undefined && updates.name === undefined && getNode) {
    const node = getNode(effect.nodeId)
    if (node && KNode.isOutline(node)) {
      throw new Error(
        `INVARIANT: REPO_UPDATE_NODE for outline node ${effect.nodeId} sets content without name. ` +
          `This will cause filesystem sync to create new files instead of renaming.`,
      )
    }
  }

  // Invariant 3: title and content should match when both are set
  if (updates.content !== undefined && updates.title !== undefined && updates.title !== updates.content) {
    // This is a warning, not an error — there may be legitimate cases (e.g., display-only title)
    // For now, just log. Upgrade to throw if we confirm no legitimate cases exist.
  }
}
