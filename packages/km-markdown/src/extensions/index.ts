/**
 * Combined km micromark + mdast extensions.
 *
 * Replaces the monolithic `gfm()` / `gfmFromMarkdown()` with individual GFM
 * sub-extensions plus km-specific tokenizers and transforms.
 *
 * Usage:
 *   fromMarkdown(content, {
 *     extensions: [km()],
 *     mdastExtensions: kmFromMarkdown(),
 *   })
 */

import { gfmAutolinkLiteral } from "micromark-extension-gfm-autolink-literal"
// NOTE: gfmFootnote is intentionally NOT loaded. The parser has no handler for
// footnoteReference/footnoteDefinition nodes, so enabling the extension would
// silently drop footnote content during the AST-to-KNode conversion.
// Re-enable when full footnote roundtrip support is implemented.
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough"
import { gfmTable } from "micromark-extension-gfm-table"
import { combineExtensions } from "micromark-util-combine-extensions"
import type { Extension } from "micromark-util-types"

import { gfmAutolinkLiteralFromMarkdown } from "mdast-util-gfm-autolink-literal"
// NOTE: gfmFootnoteFromMarkdown intentionally not loaded — see comment above.
import { gfmStrikethroughFromMarkdown } from "mdast-util-gfm-strikethrough"
import { gfmTableFromMarkdown } from "mdast-util-gfm-table"
import type { Extension as FromMarkdownExtension } from "mdast-util-from-markdown"

import { kmTaskMark, kmTaskMarkFromMarkdown } from "./km-task-mark.ts"
import { kmWikilink, kmWikilinkFromMarkdown } from "./km-wikilink.ts"
import { kmBlockIdTransform } from "./km-block-id.ts"
import { kmHeadingTaskMarkTransform } from "./km-heading-task-mark.ts"
import { kmInlinePropTransform } from "./km-inline-prop.ts"
import { kmRefsTransform } from "./km-refs.ts"

/**
 * Combined micromark syntax extension: GFM (minus task list item) + km extensions.
 * Replaces `gfm()` — uses km's task mark tokenizer instead of the GFM one.
 */
export function km(): Extension {
  return combineExtensions([gfmAutolinkLiteral(), gfmStrikethrough(), gfmTable(), kmTaskMark(), kmWikilink()])
}

/**
 * Combined mdast fromMarkdown extensions: GFM handlers + km handlers + km transforms.
 *
 * Transform ordering matters:
 * 1. block-id — modifies text (strips ` ^blockId` suffix)
 * 2. heading-task-mark — modifies text (strips `[x] ` prefix from headings)
 * 3. inline-prop — reads text (extracts `key:: value` pairs)
 * 4. refs — reads remaining text (extracts #tag @mention +project)
 */
export function kmFromMarkdown(): FromMarkdownExtension[] {
  return [
    gfmAutolinkLiteralFromMarkdown(),
    gfmStrikethroughFromMarkdown(),
    gfmTableFromMarkdown(),
    kmTaskMarkFromMarkdown(),
    kmWikilinkFromMarkdown(),
    { transforms: [kmBlockIdTransform, kmHeadingTaskMarkTransform, kmInlinePropTransform, kmRefsTransform] },
  ]
}

// Re-export individual extensions for direct use
export { kmTaskMark, kmTaskMarkFromMarkdown } from "./km-task-mark.ts"
export { kmWikilink, kmWikilinkFromMarkdown } from "./km-wikilink.ts"
export { kmBlockIdTransform } from "./km-block-id.ts"
export { kmHeadingTaskMarkTransform } from "./km-heading-task-mark.ts"
export { kmInlinePropTransform } from "./km-inline-prop.ts"
export { kmRefsTransform } from "./km-refs.ts"
