/**
 * km-task-mark — Micromark tokenizer extension for km task marks
 *
 * Replaces the GFM task list item tokenizer with a km-specific version that
 * accepts ALL km task marks: space (unchecked), x/X (checked), / (wip),
 * - (dropped), ! (blocked).
 *
 * Token names use the `km` prefix to avoid collisions with GFM:
 * - kmTaskListCheck
 * - kmTaskListCheckMarker
 * - kmTaskListCheckValueUnchecked
 * - kmTaskListCheckValueChecked
 * - kmTaskListCheckValueCustom
 */

/* oxlint-disable typescript-eslint/no-unsafe-call, typescript-eslint/no-unsafe-member-access, typescript-eslint/no-unsafe-return, typescript-eslint/no-unsafe-assignment, typescript-eslint/no-explicit-any, typescript-eslint/no-this-alias -- Micromark tokenizer API is inherently untyped */

// Augment micromark's TokenTypeMap with km-specific token types
declare module "micromark-util-types" {
  interface TokenTypeMap {
    kmTaskListCheck: "kmTaskListCheck"
    kmTaskListCheckMarker: "kmTaskListCheckMarker"
    kmTaskListCheckValueUnchecked: "kmTaskListCheckValueUnchecked"
    kmTaskListCheckValueChecked: "kmTaskListCheckValueChecked"
    kmTaskListCheckValueCustom: "kmTaskListCheckValueCustom"
  }
}

import { factorySpace } from "micromark-factory-space"
import { markdownLineEnding, markdownLineEndingOrSpace, markdownSpace } from "micromark-util-character"
import { codes, types } from "micromark-util-symbol"
import type { Extension } from "micromark-util-types"
import type { Extension as FromMarkdownExtension } from "mdast-util-from-markdown"
import type { Token } from "micromark-util-types"

// -- Micromark syntax extension -----------------------------------------------

const tasklistCheck = { name: "kmTasklistCheck", tokenize: tokenizeTasklistCheck }

/**
 * Create a micromark syntax extension for km task marks.
 *
 * Recognizes `[ ]`, `[x]`, `[X]`, `[/]`, `[-]`, `[!]` at the start of
 * list item content.
 */
export function kmTaskMark(): Extension {
  return {
    text: { [codes.leftSquareBracket]: tasklistCheck },
  }
}

/** @this {import('micromark-util-types').TokenizeContext} */
function tokenizeTasklistCheck(
  this: { previous: number | null; _gfmTasklistFirstContentOfListItem?: boolean },
  effects: Parameters<import("micromark-util-types").Tokenizer>[0],
  ok: Parameters<import("micromark-util-types").Tokenizer>[1],
  nok: Parameters<import("micromark-util-types").Tokenizer>[2],
) {
  const self = this
  return open

  function open(code: number | null) {
    if (
      // Exit if there's stuff before
      self.previous !== codes.eof ||
      // Exit if not in the first content of a list item
      !self._gfmTasklistFirstContentOfListItem
    ) {
      return nok(code)
    }

    effects.enter("kmTaskListCheck")
    effects.enter("kmTaskListCheckMarker")
    effects.consume(code)
    effects.exit("kmTaskListCheckMarker")
    return inside
  }

  function inside(code: number | null) {
    // Space/tab/newline → unchecked
    if (markdownLineEndingOrSpace(code)) {
      effects.enter("kmTaskListCheckValueUnchecked")
      effects.consume(code)
      effects.exit("kmTaskListCheckValueUnchecked")
      return close
    }

    // x/X → checked
    if (code === codes.uppercaseX || code === codes.lowercaseX) {
      effects.enter("kmTaskListCheckValueChecked")
      effects.consume(code)
      effects.exit("kmTaskListCheckValueChecked")
      return close
    }

    // / → wip, - → dropped, ! → blocked
    if (code === codes.slash || code === codes.dash || code === codes.exclamationMark) {
      effects.enter("kmTaskListCheckValueCustom")
      effects.consume(code)
      effects.exit("kmTaskListCheckValueCustom")
      return close
    }

    return nok(code)
  }

  function close(code: number | null) {
    if (code === codes.rightSquareBracket) {
      effects.enter("kmTaskListCheckMarker")
      effects.consume(code)
      effects.exit("kmTaskListCheckMarker")
      effects.exit("kmTaskListCheck")
      return after
    }

    return nok(code)
  }

  function after(code: number | null) {
    // EOL in paragraph means there must be something else after it
    if (markdownLineEnding(code)) {
      return ok(code)
    }

    // Space or tab? Check what comes after.
    if (markdownSpace(code)) {
      return effects.check({ tokenize: spaceThenNonSpace }, ok, nok)(code)
    }

    // EOF, or non-whitespace, both wrong
    return nok(code)
  }
}

function spaceThenNonSpace(
  effects: Parameters<import("micromark-util-types").Tokenizer>[0],
  ok: Parameters<import("micromark-util-types").Tokenizer>[1],
  nok: Parameters<import("micromark-util-types").Tokenizer>[2],
) {
  return factorySpace(effects, after, types.whitespace)

  function after(code: number | null) {
    return code === codes.eof ? nok(code) : ok(code)
  }
}

// -- mdast fromMarkdown extension ---------------------------------------------

/**
 * Create an mdast fromMarkdown extension for km task marks.
 *
 * Sets `listItem.checked` (GFM-compatible) and `listItem.data.taskMark`
 * for all recognised marks.
 */
export function kmTaskMarkFromMarkdown(): FromMarkdownExtension {
  return {
    exit: {
      kmTaskListCheckValueChecked: exitCheck,
      kmTaskListCheckValueUnchecked: exitCheck,
      kmTaskListCheckValueCustom: exitCheck,
      paragraph: exitParagraphWithTaskListItem,
    },
  }
}

function exitCheck(this: any, token: Token) {
  // We're always in a paragraph, in a list item.
  const node = this.stack[this.stack.length - 2]
  const mark = (this as { sliceSerialize(t: Token): string }).sliceSerialize(token)

  // GFM-compatible checked: true for x/X, false for space/tab/newline, null for custom
  if (token.type === "kmTaskListCheckValueChecked") {
    node.checked = true
  } else if (token.type === "kmTaskListCheckValueUnchecked") {
    node.checked = false
  } else {
    node.checked = null
  }

  node.data = node.data || {}
  node.data.taskMark = mark
}

function exitParagraphWithTaskListItem(this: any, token: Token) {
  const parent = this.stack[this.stack.length - 2]

  if (parent?.type === "listItem" && parent.data?.taskMark !== undefined) {
    const node = this.stack[this.stack.length - 1]
    const head = node.children[0]

    if (head?.type === "text") {
      const siblings = parent.children
      let index = -1
      let firstParagraph: any

      while (++index < siblings.length) {
        const sibling = siblings[index]
        if (sibling.type === "paragraph") {
          firstParagraph = sibling
          break
        }
      }

      if (firstParagraph === node) {
        // Strip leading whitespace (the space after `]`)
        head.value = head.value.slice(1)

        if (head.value.length === 0) {
          node.children.shift()
        } else if (node.position && head.position && typeof head.position.start.offset === "number") {
          head.position.start.column++
          head.position.start.offset++
          node.position.start = Object.assign({}, head.position.start)
        }
      }
    }
  }

  this.exit(token)
}
