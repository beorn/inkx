/**
 * Per-Item Slate Editor for km
 *
 * Uses slate core (not slate-react) as an item-level editing engine.
 * Each card being edited gets a Slate editor instance.
 *
 * Slate owns: content within one item (paragraphs, inline formatting,
 *   cursor/selection, undo/redo via slate-history)
 * km owns: tree between items (parent_id, parent_idx, move/reparent,
 *   indent/outdent)
 */

// Schema types
export type {
  ParagraphElement,
  FormattedText,
  KmElement,
  KmText,
  KmEditor,
} from "./schema.ts"
export {
  createParagraph,
  createEmptyDocument,
  descendantsToText,
  textToDescendants,
} from "./schema.ts"

// Hydration layer
export { hydrateNode, dehydrateNode } from "./hydrate.ts"

// Editor factory
export {
  createKmEditor,
  getEditorText,
  getCursorOffset,
  setCursorOffset,
  type KmEditorOptions,
} from "./create-km-editor.ts"

// React hook
export { useSlateEdit, type UseSlateEditOptions, type UseSlateEditResult } from "./use-slate-edit.ts"
