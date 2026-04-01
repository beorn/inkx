/**
 * kmast type extensions — extends mdast with km-specific semantics.
 *
 * Uses the standard unist module augmentation pattern: existing mdast node
 * `Data` interfaces gain km-specific fields, and one new phrasing content
 * type (`KmWikilink`) is registered.
 */

import type { Node, Data } from "mdast"
import type { PropertyValue } from "../parser.ts"
import type { ItemData } from "@km/core"

// =============================================================================
// Module augmentation — extends existing mdast node Data interfaces
// =============================================================================

declare module "mdast" {
  interface Data {
    /** Block ID from ` ^blockId` suffix (stripped from text) */
    blockId?: string

    /** Task mark character: '/', '-', '!', ' ', 'x', 'X' (from km-task-mark / km-heading-task-mark) */
    taskMark?: string

    /** Parsed inline property values (key:: value syntax) */
    props?: Record<string, PropertyValue>
    /** Raw inline property strings for round-trip preservation */
    propsRaw?: Record<string, string>
    /** Text with all key:: value pairs stripped */
    cleanText?: string

    /** #tag references extracted from text */
    tags?: string[]
    /** @mention references extracted from text */
    mentions?: string[]
    /** +project references extracted from text */
    projects?: string[]
  }

  interface ListItemData extends Data {
    /** Task mark character: '/', '-', '!', ' ', 'x', 'X' (from km-task-mark) */
    taskMark?: string
  }

  interface HeadingData extends Data {
    /** Task mark character: '/', '-', '!', ' ', 'x', 'X' (from km-heading-task-mark) */
    taskMark?: string
  }

  // Register KmWikilink as valid phrasing/root content
  interface PhrasingContentMap {
    kmWikilink: KmWikilink
  }
  interface RootContentMap {
    kmWikilink: KmWikilink
  }
}

// =============================================================================
// New node type: KmWikilink
// =============================================================================

export interface KmWikilink extends Node {
  type: "kmWikilink"
  /** Path/target before # or | (empty string for same-file refs like [[#heading]]) */
  target: string
  /** Section after # before ^ */
  section?: string
  /** Block reference after ^ */
  blockRef?: string
  /** Display alias after | */
  alias?: string
  /** True for ![[...]] embeds, false for [[...]] links */
  embedded: boolean
  /** True for ./target relative references (structural child slots) */
  relative?: boolean
  data?: Data
}
