/**
 * km Slate Editor Factory
 *
 * Creates a Slate editor instance configured for km's per-item editing.
 * Includes history (undo/redo) and km-specific normalizations.
 */

import { createEditor, type Descendant, Editor, Transforms } from "slate"
import { withHistory } from "slate-history"
import type { KmEditor } from "./schema.ts"

export interface KmEditorOptions {
  /** Initial content for the editor */
  initialValue?: Descendant[]
  /** Called when Enter is pressed at a boundary that requires a tree op */
  onSplitAtBoundary?: (offset: number) => void
  /** Called when Backspace is pressed at position 0 (tree-level merge) */
  onMergeBackward?: () => void
}

/**
 * Create a Slate editor for editing a single km item.
 *
 * The editor handles:
 * - Text insertion/deletion
 * - Paragraph split/merge within the item (Enter within body)
 * - Undo/redo via slate-history
 * - Cursor movement
 *
 * Tree-level operations (split item, merge with sibling) are
 * delegated via callbacks to the TUI layer.
 */
export function createKmEditor(options: KmEditorOptions = {}): KmEditor {
  const editor = withHistory(createEditor()) as KmEditor

  // Override insertBreak to handle Enter key
  const { insertBreak, deleteBackward } = editor

  editor.insertBreak = () => {
    const { selection } = editor
    if (!selection) return insertBreak()

    // Check if we're in a single-paragraph document at the end
    // If so, this is a boundary Enter that should create a new tree node
    const isAtEnd = Editor.isEnd(editor, selection.anchor, [])
    const isAtStart = Editor.isStart(editor, selection.anchor, [])
    const paragraphCount = editor.children.length

    if (paragraphCount === 1 && isAtEnd && options.onSplitAtBoundary) {
      // Single paragraph, cursor at end -> new sibling node
      const text = Editor.string(editor, [0])
      options.onSplitAtBoundary(text.length)
      return
    }

    if (paragraphCount === 1 && isAtStart && options.onSplitAtBoundary) {
      // Single paragraph, cursor at start -> new sibling before
      options.onSplitAtBoundary(0)
      return
    }

    // Multi-paragraph or mid-paragraph: standard Slate paragraph split
    insertBreak()
  }

  // Override deleteBackward to handle Backspace at start
  editor.deleteBackward = (unit) => {
    const { selection } = editor
    if (!selection) return deleteBackward(unit)

    // If at the very start of the editor, delegate to tree merge
    const isAtStart = Editor.isStart(editor, selection.anchor, [])
    if (isAtStart && options.onMergeBackward) {
      options.onMergeBackward()
      return
    }

    // Check if at start of a non-first paragraph -> merge paragraphs
    const [, path] = Editor.node(editor, selection.anchor)
    if (
      path.length >= 2 &&
      path[path.length - 1] === 0 &&
      Editor.isStart(editor, selection.anchor, path.slice(0, -1))
    ) {
      // At start of a paragraph text node: Slate's default merge handles this
      deleteBackward(unit)
      return
    }

    deleteBackward(unit)
  }

  // Set initial value if provided
  if (options.initialValue) {
    editor.children = options.initialValue
    // Normalize to ensure valid state
    Editor.normalize(editor, { force: true })
    // Set initial cursor at end (matches useLineEdit behavior: cursor = initialValue.length)
    Transforms.select(editor, Editor.end(editor, []))
  }

  return editor
}

/**
 * Get the full text content of a Slate editor as a single string.
 * Paragraphs are joined with newlines.
 */
export function getEditorText(editor: KmEditor): string {
  return editor.children
    .map((node) => {
      if ("children" in node) {
        return (node.children as Array<{ text: string }>).map((t) => t.text).join("")
      }
      return ""
    })
    .join("\n")
}

/**
 * Get the cursor offset as a character position in the full text.
 * Accounts for paragraph boundaries (newlines).
 */
export function getCursorOffset(editor: KmEditor): number {
  const { selection } = editor
  if (!selection) return 0

  const { anchor } = selection
  let offset = 0

  // Sum up text lengths of all paragraphs before the current one
  const paragraphIndex = anchor.path[0] ?? 0
  for (let i = 0; i < paragraphIndex; i++) {
    const node = editor.children[i]
    if (node && "children" in node) {
      offset += (node.children as Array<{ text: string }>).map((t) => t.text).join("").length + 1 // +1 for newline between paragraphs
    }
  }

  // Add offset within current paragraph
  const currentParagraph = editor.children[paragraphIndex]
  if (currentParagraph && "children" in currentParagraph) {
    const texts = currentParagraph.children as Array<{ text: string }>
    // Sum text nodes before current text node
    for (let i = 0; i < (anchor.path[1] ?? 0); i++) {
      offset += texts[i]?.text.length ?? 0
    }
    offset += anchor.offset
  }

  return offset
}

/**
 * Set the cursor to a character offset in the full text.
 */
export function setCursorOffset(editor: KmEditor, offset: number): void {
  let remaining = offset
  for (let pIdx = 0; pIdx < editor.children.length; pIdx++) {
    const para = editor.children[pIdx]
    if (!para || !("children" in para)) continue

    const texts = para.children as Array<{ text: string }>
    for (let tIdx = 0; tIdx < texts.length; tIdx++) {
      // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- tIdx within bounds of texts array
      const textLen = texts[tIdx]!.text.length
      if (remaining <= textLen) {
        Transforms.select(editor, {
          anchor: { path: [pIdx, tIdx], offset: remaining },
          focus: { path: [pIdx, tIdx], offset: remaining },
        })
        return
      }
      remaining -= textLen
    }
    remaining -= 1 // paragraph break = newline
  }

  // If offset exceeds content, place at end
  Transforms.select(editor, Editor.end(editor, []))
}
