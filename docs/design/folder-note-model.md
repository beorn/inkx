# Folder-note model

**Status**: parked — design discussion, not implementing yet.
**Tracking bead**: `km-tui.folder-note-model` (to be created)
**Date parked**: 2026-04-14

Related fixes landed this week (which the refined model would partially revert):
- `27db42fcf` — `fix(board): zoom stack overflow + folder-note column expansion`
- `efb1db1ff` — `fix(tui): preserve inline formatting + bullets in body blocks`
- `74b466b2` (silvery) — eventLoop error dump that caught the zoom recursion

## Problem

When a folder contains a file with the same name (`tst2/tst2.md`, `_index.md`, `.md`), km treats that file as the folder's "index" / "folder-note". The current implementation merges the file into the folder at view time, which produces two classes of bugs (`km-tui.zoom-stack-overflow`, `km-tui.folder-note-same-name`) and makes the DB tree shape diverge from the view tree shape. The question: what's the right merge model?

## Current architecture — hybrid DB + view

**DB layer** (`packages/km-storage/src/watch/handlers/update-handler.ts:228` `syncIndexFileToFolder`):
- **Title promotion**: `folder.content = index.title` at DB level whenever the index file is parsed. The folder node carries the index file's H1 as its display title.
- **Child ordering**: folder children are reordered based on `![[./name]]` slot references in the index file. The index file acts as a curator of sibling order.
- **Index file remains a real child of the folder in the DB** — it's not absorbed. The DB tree is clean.

**View layer** (`packages/km-board/src/view-lens.ts`):
- `getRootChildIds` → `expandIndexFile` (when the folder is the board root)
- `computeColumnChildren` (when the folder is a column — patched in `27db42fcf` to match root path)
- Both **filter the index file out** of the folder's children and **splice in the index file's sections** as the folder's cards. Body paragraphs become a virtual `body-column` card. Other folder children (sibling files/folders) are appended.

The view layer lies about tree shape: in the DB, `tst2` has one child (`tst2.md` with sections). In the view, `tst2` "contains" the sections directly and `tst2.md` is invisible.

## User's refined position (the one we're parking)

**Keep the folder-file as a subitem of the folder**, but:
- DO merge **title** (already at DB level — keep)
- DO merge **body content** (file's body paragraphs render at the top of the folder column)
- DO merge **subitem ordering via slot references** (`![[./child]]` controls folder child order)
- If the folder-file has its OWN subitems (non-slot H2/H3 sections), **keep them as the file's subitems** — don't hoist them into the folder

### Concrete cases

**Case A — pure dashboard folder-file** (`+taxes/+taxes.md` contains only `![[./+taxomatic]]` + `![[./drafts]]`):
- Slots expand to folder children in order
- No non-slot sections → folder-file has no own content to preserve
- File becomes invisible (fully merged — matches current behavior)

**Case B — dashboard + own content** (folder-file has `![[./child]]` slots AND `## My Section`):
- Slots expand to folder children
- Body paragraphs render as folder body
- The `## My Section` and its subitems **stay inside the file**
- File is visible as a subitem of the folder (position: after slot-referenced children, or as a body card — TBD)

**Case C — plain content folder-file** (`tst2/tst2.md` has `# A test project` + `## Sub-section` with no slots):
- Title promoted (already done at DB level)
- Body paragraphs render as folder body
- The `## Sub-section` stays inside the file
- File is visible as a regular child of the folder
- Zooming into the folder shows body + the file as a card
- Zooming into the file shows its sections

## Options considered

| # | Option | Description |
|---|---|---|
| A | Full no-merge, title only | Cleanest code. Biggest UX regression for folders-as-dashboards. Extra zoom for `+taxes` |
| B | No merge + detail pane shows content | Code simplicity of (A), no navigation regression — content visible via detail pane |
| C | Auto-merge only for single-child folders | Semantic feel shifts as siblings are added/removed |
| D | Opt-in via frontmatter/rules | Two modes = more to learn |
| E | Merge only when slot refs present | Slot refs are the explicit curation signal; zero implicit magic |
| **User's refined** | **Merge title+body+slot ordering, keep non-slot sections in file** | **Most surgical — preserves dashboards, avoids surprise hoisting** |

## Pros/cons of user's refined position vs current

| Dimension | Current (full merge) | User's refined (partial merge) |
|---|---|---|
| Code complexity | Dual paths, virtual body-column, view lies | Simpler per-case branching, still has title/body/slot promotion |
| Mental model | "Folder IS its index file" (magic) | "Folder has title/body from file; file keeps its own structure" |
| Slot references | Work (control folder order) | Still work |
| Navigation depth | Zoom once to see sections | Zoom twice to see non-slot sections in a plain-content folder-file |
| Viewing folder-file content | Body visible at top of column | Body visible at top + file visible as child |
| Multi-file folders | Index file invisible, ambiguous "which file does this card come from?" | Clear — file is a regular sibling |
| Single-file folders | Feels like "folder IS the file" — zero friction | File visible as extra container level — fine for non-dashboard use |
| Alignment with fs tools (Finder, VSCode, Obsidian) | Diverges | Matches |
| Folder-note as project dashboard | Perfect fit (view = dashboard) | Preserved when slot refs present |
| Bug count | High — 2 bugs fixed this session originate from the merge | Lower — tree shape matches DB more closely |

## Implementation sketch (when unblocked)

1. Add a helper `hasNonSlotSections(indexFile, children)` that returns true when the index file has any H2+ subitems that are NOT pure slot references. Uses existing `extractSlotTargets`.
2. In `expandIndexFile` + `computeColumnChildren` in `view-lens.ts`:
   - Always merge: title (DB-level, unchanged), body paragraphs, slot-referenced children.
   - When `hasNonSlotSections(indexFile)`: keep the index file as a visible subitem of the folder. Position: probably after slot-referenced children. Open question: is it a card (with the non-slot sections as its own cards on zoom-in), or a body card at the bottom of the column?
3. Update view-lens tests in `packages/km-board/tests/view-lens.test.ts` — add cases for (a) pure dashboard folder-file, (b) dashboard + own content, (c) plain content.
4. Verify `km-tui.slow-folder-discovery` symptom — may resolve if less view recomputation is needed under the refined model. Separate investigation path: look at storage parsing (~1400 files → 10s is not obviously O(n)-bad, may be fine).

## Open questions

1. Where does the visible folder-file sit among the folder's children? After the slot-referenced children? As a body card? Always last?
2. Does title promotion stay? (Yes — it's at the DB level and orthogonal to view merging.)
3. How does fold/unfold work on a folder-file that has non-slot sections — folding the folder hides everything including the file?
4. What about the rare case of a folder whose index file has ONLY non-slot sections (no slots, no body) — is the file visible as the only child?
5. Does the virtual `body-column` still make sense when the file is also visible as a child? Could the file itself be the body (first) and also the subitem container (later)? Or is that double representation?

## Decision

Parked. Current fix (full merge in `computeColumnChildren`) stays in place until this is revisited. The zoom crash + empty-column bugs are resolved and the user's immediate workflow is unblocked.
