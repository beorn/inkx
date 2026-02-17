/**
 * useSlateEdit Hook
 *
 * Implements BlockEditTarget using a Slate editor.
 * Drop-in replacement for useLineEdit that provides:
 * - Rich text editing with inline formatting
 * - Multi-paragraph support
 * - Undo/redo via slate-history
 * - Same BlockEditTarget interface (insertChar, deleteBackward, etc.)
 */

import { useState, useCallback, useLayoutEffect, useMemo, useRef } from "react"
import { Editor, Transforms } from "slate"
import stringWidth from "string-width"
import type { BlockEditTarget } from "../block-edit-target.ts"
import { blockEditTargetRef } from "../block-edit-target.ts"
import { textToDescendants } from "./schema.ts"
import { createKmEditor, getEditorText, getCursorOffset, setCursorOffset, type KmEditorOptions } from "./create-km-editor.ts"
import type { KmEditor } from "./schema.ts"

export interface UseSlateEditOptions {
  /** Initial text value (will be hydrated to Slate elements) */
  initialValue?: string
  /** Called when value changes */
  onChange?: (value: string) => void
  /** Called when Enter is pressed (text.confirm command) */
  onConfirm?: (value: string) => void
  /** Called when exiting edit mode (Escape) */
  onCancel?: () => void
  /** Called when save() is invoked (auto-save on block navigate) */
  onSave?: (value: string) => void
  /** Called when Enter creates a new tree node (split at boundary) */
  onSplitAtBoundary?: (offset: number) => void
  /** Called when Backspace at start needs a tree merge */
  onMergeBackward?: () => void
  /** Available width for visual line wrapping (cursor up/down navigation) */
  lineWidth?: number
}

export interface UseSlateEditResult {
  /** Current text value (plain text, paragraphs joined with newlines) */
  value: string
  /** Cursor position (character offset in plain text) */
  cursor: number
  /** Text before cursor (for rendering) */
  beforeCursor: string
  /** Text after cursor (for rendering) */
  afterCursor: string
  /** Clear the input */
  clear: () => void
  /** Set value programmatically */
  setValue: (value: string) => void
  /** The Slate editor instance (for advanced usage) */
  editor: KmEditor
}

/**
 * Hook for Slate-based item editing.
 *
 * Implements the same BlockEditTarget interface as useLineEdit,
 * so it's a drop-in replacement for the command system.
 *
 * Key differences from useLineEdit:
 * - Backed by Slate (undo/redo, paragraph structure)
 * - Enter within body splits paragraphs (Slate internal)
 * - Enter at boundary triggers onSplitAtBoundary (tree op)
 * - Backspace at start triggers onMergeBackward (tree op)
 */
export function useSlateEdit({
  initialValue = "",
  onChange,
  onConfirm,
  onCancel,
  onSave,
  onSplitAtBoundary,
  onMergeBackward,
  lineWidth,
}: UseSlateEditOptions = {}): UseSlateEditResult {
  // Stable refs for callbacks (avoid stale closures)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onConfirmRef = useRef(onConfirm)
  onConfirmRef.current = onConfirm
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onSplitRef = useRef(onSplitAtBoundary)
  onSplitRef.current = onSplitAtBoundary

  // Create Slate editor (stable across renders)
  const editor = useMemo(() => {
    const editorOptions: KmEditorOptions = {
      initialValue: textToDescendants(initialValue),
      onSplitAtBoundary,
      onMergeBackward,
    }
    return createKmEditor(editorOptions)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intentionally stable

  // Track render state (Slate is the source of truth, React state triggers re-render)
  const [_version, setVersion] = useState(0)
  const forceRender = useCallback(() => setVersion((v) => v + 1), [])

  // Derive display values from Slate editor
  const text = getEditorText(editor)
  const cursorPos = getCursorOffset(editor)
  const beforeCursor = text.slice(0, cursorPos)
  const afterCursor = text.slice(cursorPos)

  // Track whether cancel was called
  const cancelledRef = useRef(false)
  const initialValueRef = useRef(initialValue)

  // Visual line navigation state
  const lineWidthRef = useRef(lineWidth ?? Infinity)
  lineWidthRef.current = lineWidth ?? Infinity
  const stickyXRef = useRef<number | null>(null)

  // Build BlockEditTarget
  const target: BlockEditTarget = useMemo(
    () => ({
      insertChar(char: string) {
        Editor.insertText(editor, char)
        onChangeRef.current?.(getEditorText(editor))
        forceRender()
      },
      deleteBackward() {
        editor.deleteBackward("character")
        onChangeRef.current?.(getEditorText(editor))
        forceRender()
      },
      deleteForward() {
        editor.deleteForward("character")
        onChangeRef.current?.(getEditorText(editor))
        forceRender()
      },
      cursorLeft() {
        stickyXRef.current = null
        Transforms.move(editor, { distance: 1, reverse: true })
        forceRender()
      },
      cursorRight() {
        stickyXRef.current = null
        Transforms.move(editor, { distance: 1 })
        forceRender()
      },
      cursorStart() {
        stickyXRef.current = null
        Transforms.select(editor, Editor.start(editor, []))
        forceRender()
      },
      cursorEnd() {
        stickyXRef.current = null
        Transforms.select(editor, Editor.end(editor, []))
        forceRender()
      },
      cursorUp(): boolean {
        const text = getEditorText(editor)
        const offset = getCursorOffset(editor)
        const w = lineWidthRef.current
        if (w === Infinity || w <= 0) return offset > 0 ? (Transforms.select(editor, Editor.start(editor, [])), forceRender(), true) : false
        const { line, col } = offsetToVisualPos(text, offset, w)
        if (line === 0) return false // at first visual line — boundary
        const targetX = stickyXRef.current ?? col
        stickyXRef.current = targetX
        const newOffset = visualPosToOffset(text, line - 1, targetX, w)
        setCursorOffset(editor, newOffset)
        forceRender()
        return true
      },
      cursorDown(): boolean {
        const text = getEditorText(editor)
        const offset = getCursorOffset(editor)
        const w = lineWidthRef.current
        if (w === Infinity || w <= 0) return offset < text.length ? (Transforms.select(editor, Editor.end(editor, [])), forceRender(), true) : false
        const { line, col, totalLines } = offsetToVisualPos(text, offset, w)
        if (line >= totalLines - 1) return false // at last visual line — boundary
        const targetX = stickyXRef.current ?? col
        stickyXRef.current = targetX
        const newOffset = visualPosToOffset(text, line + 1, targetX, w)
        setCursorOffset(editor, newOffset)
        forceRender()
        return true
      },
      deleteWord() {
        editor.deleteBackward("word")
        onChangeRef.current?.(getEditorText(editor))
        forceRender()
      },
      deleteToStart() {
        // Delete from cursor to start of current line (paragraph)
        const { selection } = editor
        if (selection) {
          const path = selection.anchor.path.slice(0, 1) // paragraph path
          const start = Editor.start(editor, path)
          Transforms.delete(editor, {
            at: { anchor: start, focus: selection.anchor },
          })
          onChangeRef.current?.(getEditorText(editor))
          forceRender()
        }
      },
      deleteToEnd() {
        // Delete from cursor to end of current line (paragraph)
        const { selection } = editor
        if (selection) {
          const path = selection.anchor.path.slice(0, 1) // paragraph path
          const end = Editor.end(editor, path)
          Transforms.delete(editor, {
            at: { anchor: selection.anchor, focus: end },
          })
          onChangeRef.current?.(getEditorText(editor))
          forceRender()
        }
      },
      confirm() {
        cancelledRef.current = true
        onConfirmRef.current?.(getEditorText(editor))
      },
      cancel() {
        cancelledRef.current = true
        onCancelRef.current?.()
      },
      save() {
        const fn = onSaveRef.current ?? onConfirmRef.current
        fn?.(getEditorText(editor))
        initialValueRef.current = getEditorText(editor)
      },
      getCursorOffset() {
        return getCursorOffset(editor)
      },
      getContent() {
        return getEditorText(editor)
      },
      insertBreak(): boolean {
        // Signal that this editor supports outliner-style Enter (split/new sibling).
        // The actual node creation is handled by TEXT_CONFIRM via handleAddNodeAfter.
        return !!onSplitRef.current
      },
    }),
    [editor, forceRender],
  )

  // Register as active block edit target
  useLayoutEffect(() => {
    blockEditTargetRef.current = target
    return () => {
      if (blockEditTargetRef.current === target) {
        blockEditTargetRef.current = null
      }
      // Auto-save on unmount if value was modified and not explicitly cancelled
      if (!cancelledRef.current) {
        const currentValue = getEditorText(editor)
        if (currentValue !== initialValueRef.current) {
          onConfirmRef.current?.(currentValue)
        }
      }
    }
  }, [target, editor])

  return {
    value: text,
    cursor: cursorPos,
    beforeCursor,
    afterCursor,
    clear: useCallback(() => {
      // Replace all content with empty
      Transforms.delete(editor, {
        at: {
          anchor: Editor.start(editor, []),
          focus: Editor.end(editor, []),
        },
      })
      onChangeRef.current?.("")
      forceRender()
    }, [editor, forceRender]),
    setValue: useCallback(
      (value: string) => {
        // Replace all content
        editor.children = textToDescendants(value)
        Editor.normalize(editor, { force: true })
        Transforms.select(editor, Editor.end(editor, []))
        onChangeRef.current?.(value)
        forceRender()
      },
      [editor, forceRender],
    ),
    editor,
  }
}

// =============================================================================
// Visual line calculation for cursor up/down
// =============================================================================

interface VisualPos {
  line: number
  col: number
  totalLines: number
}

/** Map a character offset to a visual line and column, given a line width. */
function offsetToVisualPos(text: string, offset: number, lineWidth: number): VisualPos {
  let line = 0
  let consumed = 0

  const segments = text.split("\n")
  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const lines = wrapSegment(segments[sIdx]!, lineWidth)
    for (let i = 0; i < lines.length; i++) {
      const lineLen = lines[i]!.length
      const lineEnd = consumed + lineLen
      // For non-last wrapped lines within a paragraph, offset at boundary
      // belongs to the NEXT visual line (start of next wrapped segment).
      // For the last wrapped line of a paragraph, offset at boundary is end-of-line.
      const isLastWrappedLine = i === lines.length - 1
      if (isLastWrappedLine ? offset <= lineEnd : offset < lineEnd) {
        return { line, col: offset - consumed, totalLines: countTotalLines(text, lineWidth) }
      }
      consumed = lineEnd
      line++
    }
    consumed++ // newline character
  }

  // Past end — return last position
  const total = countTotalLines(text, lineWidth)
  return { line: total - 1, col: 0, totalLines: total }
}

/** Map a visual line and column to a character offset. */
function visualPosToOffset(text: string, targetLine: number, targetCol: number, lineWidth: number): number {
  let line = 0
  let consumed = 0

  for (const segment of text.split("\n")) {
    const lines = wrapSegment(segment, lineWidth)
    for (let i = 0; i < lines.length; i++) {
      if (line === targetLine) {
        const lineLen = lines[i]!.length
        return consumed + Math.min(targetCol, lineLen)
      }
      consumed += lines[i]!.length
      line++
    }
    consumed++ // newline character
  }

  // Past total lines — return end
  return text.length
}

/** Count total visual lines. */
function countTotalLines(text: string, lineWidth: number): number {
  let total = 0
  for (const segment of text.split("\n")) {
    total += wrapSegment(segment, lineWidth).length
  }
  return total
}

/** Wrap a single paragraph into visual lines based on character width. */
function wrapSegment(text: string, lineWidth: number): string[] {
  if (lineWidth <= 0) return [text]
  if (stringWidth(text) <= lineWidth) return [text]

  const lines: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    // Find the longest prefix that fits within lineWidth
    let end = 0
    let width = 0
    for (const char of remaining) {
      const charW = stringWidth(char)
      if (width + charW > lineWidth && end > 0) break
      width += charW
      end += char.length
    }
    lines.push(remaining.slice(0, end))
    remaining = remaining.slice(end)
  }
  return lines.length > 0 ? lines : [""]
}
