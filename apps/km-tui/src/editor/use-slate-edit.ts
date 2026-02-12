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
import type { BlockEditTarget } from "../block-edit-target.ts"
import { blockEditTargetRef } from "../block-edit-target.ts"
import { textToDescendants } from "./schema.ts"
import {
  createKmEditor,
  getEditorText,
  getCursorOffset,
  type KmEditorOptions,
} from "./create-km-editor.ts"
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
        Transforms.move(editor, { distance: 1, reverse: true })
        forceRender()
      },
      cursorRight() {
        Transforms.move(editor, { distance: 1 })
        forceRender()
      },
      cursorStart() {
        Transforms.select(editor, Editor.start(editor, []))
        forceRender()
      },
      cursorEnd() {
        Transforms.select(editor, Editor.end(editor, []))
        forceRender()
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
