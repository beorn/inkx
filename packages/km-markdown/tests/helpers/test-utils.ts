/**
 * Shared test utilities for km-markdown tests
 */

import type { KNode } from "@km/core"
import { parseMarkdownToNodes } from "../../src/ast2nodes.ts"
import { nodesToMarkdown } from "../../src/nodes2md.ts"

/** Parse markdown and serialize back */
export function roundtrip(md: string): string {
  const nodes = parseMarkdownToNodes(md, "test.md")
  return nodesToMarkdown(nodes)
}

/** Parse markdown and return nodes */
export function parse(md: string): KNode[] {
  return parseMarkdownToNodes(md, "test.md")
}

/** Create a test KNode with defaults */
export function makeTestNode(overrides: Partial<KNode>): KNode {
  return {
    id: `test-${Math.random().toString(36).slice(2)}`,
    type: "p",
    parent_id: null,
    parent_idx: 0,
    content: "",
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "",
    ...overrides,
  } as KNode
}

/**
 * Helper to normalize whitespace for comparison
 * - Trims trailing whitespace from lines
 * - Collapses multiple blank lines to single blank line
 * - Trims leading/trailing whitespace from document
 */
export function normalizeMarkdown(md: string): string {
  return md
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
