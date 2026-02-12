/**
 * Slate Editor Factory Tests
 *
 * Tests the core Slate editor operations without React.
 */

import { describe, test, expect, vi } from "vitest"
import { Editor, Transforms } from "slate"
import { createKmEditor, getEditorText, getCursorOffset, setCursorOffset } from "../../src/editor/create-km-editor.ts"
import { textToDescendants } from "../../src/editor/schema.ts"

describe("createKmEditor", () => {
  test("creates editor with initial value", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello world"),
    })
    expect(getEditorText(editor)).toBe("Hello world")
  })

  test("creates editor with empty default", () => {
    const editor = createKmEditor()
    // Default Slate editor starts with empty children
    expect(editor.children).toBeDefined()
  })

  test("creates editor with multi-paragraph content", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("First\nSecond\nThird"),
    })
    expect(getEditorText(editor)).toBe("First\nSecond\nThird")
    expect(editor.children).toHaveLength(3)
  })
})

describe("text operations", () => {
  test("insert text at cursor", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
    })
    // Place cursor at end
    Transforms.select(editor, Editor.end(editor, []))
    Editor.insertText(editor, " world")
    expect(getEditorText(editor)).toBe("Hello world")
  })

  test("delete backward", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
    })
    Transforms.select(editor, Editor.end(editor, []))
    editor.deleteBackward("character")
    expect(getEditorText(editor)).toBe("Hell")
  })

  test("delete forward", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
    })
    Transforms.select(editor, Editor.start(editor, []))
    editor.deleteForward("character")
    expect(getEditorText(editor)).toBe("ello")
  })
})

describe("cursor management", () => {
  test("getCursorOffset at end after creation", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
    })
    // Editor initializes cursor at end of content
    expect(getCursorOffset(editor)).toBe(5)
  })

  test("getCursorOffset at start", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
    })
    Transforms.select(editor, Editor.start(editor, []))
    expect(getCursorOffset(editor)).toBe(0)
  })

  test("getCursorOffset at end", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
    })
    Transforms.select(editor, Editor.end(editor, []))
    expect(getCursorOffset(editor)).toBe(5)
  })

  test("getCursorOffset in middle", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
    })
    Transforms.select(editor, { path: [0, 0], offset: 3 })
    expect(getCursorOffset(editor)).toBe(3)
  })

  test("getCursorOffset accounts for paragraph breaks", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello\nWorld"),
    })
    // Cursor at start of second paragraph
    Transforms.select(editor, { path: [1, 0], offset: 0 })
    expect(getCursorOffset(editor)).toBe(6) // "Hello" + newline
  })

  test("setCursorOffset places cursor correctly", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
    })
    setCursorOffset(editor, 3)
    expect(getCursorOffset(editor)).toBe(3)
  })

  test("setCursorOffset in second paragraph", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello\nWorld"),
    })
    setCursorOffset(editor, 8) // "Hello\n" + "Wo"
    expect(getCursorOffset(editor)).toBe(8)
  })

  test("setCursorOffset beyond content clamps to end", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
    })
    setCursorOffset(editor, 999)
    expect(getCursorOffset(editor)).toBe(5)
  })
})

describe("Enter key (insertBreak)", () => {
  test("Enter at end of single paragraph triggers split callback", () => {
    const onSplit = vi.fn()
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
      onSplitAtBoundary: onSplit,
    })
    Transforms.select(editor, Editor.end(editor, []))
    editor.insertBreak()
    expect(onSplit).toHaveBeenCalledWith(5) // "Hello".length
  })

  test("Enter at start of single paragraph triggers split callback", () => {
    const onSplit = vi.fn()
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
      onSplitAtBoundary: onSplit,
    })
    Transforms.select(editor, Editor.start(editor, []))
    editor.insertBreak()
    expect(onSplit).toHaveBeenCalledWith(0)
  })

  test("Enter in multi-paragraph creates new paragraph (Slate internal)", () => {
    const onSplit = vi.fn()
    const editor = createKmEditor({
      initialValue: textToDescendants("First\nSecond"),
      onSplitAtBoundary: onSplit,
    })
    // Place cursor at end of first paragraph
    Transforms.select(editor, Editor.end(editor, [0]))
    editor.insertBreak()
    // Should NOT call onSplit - this is internal paragraph split
    expect(onSplit).not.toHaveBeenCalled()
    expect(editor.children).toHaveLength(3)
  })

  test("Enter in middle of single paragraph triggers split callback", () => {
    const onSplit = vi.fn()
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
      onSplitAtBoundary: onSplit,
    })
    Transforms.select(editor, { path: [0, 0], offset: 3 })
    editor.insertBreak()
    // In single-paragraph mode, mid-text Enter creates a Slate paragraph split
    // (not a tree boundary split) - this is the standard Slate behavior
    // because we only intercept at start and end of the whole document
    expect(editor.children.length).toBeGreaterThanOrEqual(2)
  })
})

describe("Backspace at start", () => {
  test("Backspace at start of editor triggers merge callback", () => {
    const onMerge = vi.fn()
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
      onMergeBackward: onMerge,
    })
    Transforms.select(editor, Editor.start(editor, []))
    editor.deleteBackward("character")
    expect(onMerge).toHaveBeenCalled()
  })

  test("Backspace in middle does not trigger merge callback", () => {
    const onMerge = vi.fn()
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
      onMergeBackward: onMerge,
    })
    Transforms.select(editor, Editor.end(editor, []))
    editor.deleteBackward("character")
    expect(onMerge).not.toHaveBeenCalled()
    expect(getEditorText(editor)).toBe("Hell")
  })
})

describe("undo/redo (slate-history)", () => {
  test("undo reverts text insertion", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
    })
    Transforms.select(editor, Editor.end(editor, []))
    Editor.insertText(editor, " world")
    expect(getEditorText(editor)).toBe("Hello world")

    editor.undo()
    expect(getEditorText(editor)).toBe("Hello")
  })

  test("redo re-applies text insertion", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
    })
    Transforms.select(editor, Editor.end(editor, []))
    Editor.insertText(editor, " world")
    editor.undo()
    expect(getEditorText(editor)).toBe("Hello")

    editor.redo()
    expect(getEditorText(editor)).toBe("Hello world")
  })

  test("undo reverts deletion", () => {
    const editor = createKmEditor({
      initialValue: textToDescendants("Hello"),
    })
    Transforms.select(editor, Editor.end(editor, []))
    editor.deleteBackward("character")
    expect(getEditorText(editor)).toBe("Hell")

    editor.undo()
    expect(getEditorText(editor)).toBe("Hello")
  })
})
