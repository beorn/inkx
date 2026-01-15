# Visual Testing Reference

Specifications and verification checklists for TUI visual testing.

**See also**:

- `/fix-tui` command for debugging workflow
- `.claude/skills/visual-test.md` for capture methods

## Architecture Layers

```
Layer 1: Text Rendering
├── rich.ts      → renderRich(), stripInlineFields(), styleWikiLinks()
└── icons.ts     → getStatusIcon(), getTypeIcon(), colorize()

Layer 2: Layout
├── truncate.ts  → truncateText(), displayLength()
├── wrap.ts      → wrapText()
├── constrain.ts → constrainText(), padText()
└── path.ts      → renderPath(), renderParentPath()

Layer 3: Components
├── TreeNode.tsx    → Task rendering, selection, fold state
├── ListView.tsx    → Full-width hierarchical view
├── ColumnsView.tsx → Multi-column tree view
├── TabsView.tsx    → Tabbed single-column view
└── Board.tsx       → Main board container, top bar
```

## Rendering Specifications

### Layer 1: Rich Text (`renderRich()`)

| Input                     | Output                 |
| ------------------------- | ---------------------- |
| `[field:: value]`         | (removed)              |
| `[[note]]`                | dim underlined "note"  |
| `[[path/to/note\|Title]]` | dim underlined "Title" |
| `**bold**`                | **bold**               |
| `*italic*`                | _italic_               |
| `` `code` ``              | cyan monospace         |
| `~~strike~~`              | ~~strikethrough~~      |

### Layer 1: Status Icons (`getStatusIcon()`)

| Marker | Status   | Icon | Color   |
| ------ | -------- | ---- | ------- |
| `[ ]`  | todo     | ○    | gray    |
| `[x]`  | done     | ✓    | green   |
| `[/]`  | wip      | ◐    | yellow  |
| `[!]`  | blocked  | ⊘    | red     |
| `[-]`  | dropped  | ∅    | gray    |
| `[?]`  | (custom) | ?    | inverse |
| (null) | (error)  | ⚠    | red     |

### Layer 1: Type Icons (`getTypeIcon()`)

| Type      | Icon    |
| --------- | ------- |
| folder    | 📁      |
| file      | 📄      |
| section   | #       |
| paragraph | (empty) |
| code      | (empty) |
| quote     | (empty) |
| list-item | ·       |

### Layer 1: Board Pill Colors

| Board    | Color                   |
| -------- | ----------------------- |
| inbox    | white                   |
| next     | cyan                    |
| waiting  | yellow                  |
| someday  | magenta                 |
| done     | green                   |
| blocked  | red                     |
| (custom) | from `color=` attribute |

### Layer 2: Text Constraints

| Function                               | Purpose                  |
| -------------------------------------- | ------------------------ |
| `displayLength(text)`                  | ANSI-aware string length |
| `truncateText(text, width)`            | Truncate with `…`        |
| `wrapText(text, width)`                | Word-wrap to lines       |
| `constrainText(text, width, maxLines)` | Wrap + truncate + limit  |
| `padText(text, width)`                 | Pad to fixed width       |

### Layer 2: Path Rendering

| Function                        | Purpose                          |
| ------------------------------- | -------------------------------- |
| `renderPath(segments, width)`   | Breadcrumb with smart truncation |
| `renderParentPath(path, width)` | Right-aligned, left-truncated    |

Path segments have `isWithinBoard` flag:

- Outside board: black text, gray `/` separator
- Inside board: blue text, blue `>` separator

### Layer 3: TreeNode States

| State          | Visual              |
| -------------- | ------------------- |
| Normal         | Default colors      |
| Selected       | Blue background     |
| Multi-selected | Cyan background     |
| Done           | Strikethrough + dim |
| Dropped        | Strikethrough + dim |
| Folded         | ▶ prefix            |
| Expanded       | ▼ prefix            |

### Layer 3: Views

| View    | Key | Layout                     |
| ------- | --- | -------------------------- |
| Cards   | `1` | Kanban cards in columns    |
| Columns | `2` | Tree outline in columns    |
| Tabs    | `3` | Single column with tab bar |
| List    | `4` | Full-width hierarchical    |

## Verification Checklists

### Text Rendering

- [ ] Inline fields `[key:: value]` stripped (not visible)
- [ ] Wiki links `[[link]]` dim + underlined
- [ ] Wiki link aliases `[[path\|title]]` show title only
- [ ] Bold `**text**` renders bold
- [ ] Italic `*text*` renders italic
- [ ] Code `` `text` `` renders cyan
- [ ] Strikethrough `~~text~~` renders struck

### Status Icons

- [ ] Todo `[ ]` → gray ○
- [ ] Done `[x]` → green ✓
- [ ] WIP `[/]` → yellow ◐
- [ ] Blocked `[!]` → red ⊘
- [ ] Dropped `[-]` → gray ∅
- [ ] Custom markers show first char inverted
- [ ] Missing status shows red ⚠

### Layout

- [ ] No text overlap between columns
- [ ] Text truncates with `…` when too long
- [ ] Lines padded to full width (no ragged edges)
- [ ] Column borders aligned vertically
- [ ] Proper indentation for nested items

### Selection & State

- [ ] Selected item has blue background
- [ ] Multi-selected items have cyan background
- [ ] Done tasks: strikethrough + dim
- [ ] Dropped tasks: strikethrough + dim
- [ ] Folded indicator: ▶
- [ ] Expanded indicator: ▼

### Views

- [ ] Cards view: bordered cards in columns
- [ ] Columns view: tree with column headers
- [ ] Tabs view: tab bar with active indicator
- [ ] List view: full-width with sections
- [ ] Column headers are yellow
- [ ] Selected column border is blue

### Top Bar

- [ ] Board path: black text on white background
- [ ] Item path: blue text on white background
- [ ] Separator at boundary is blue
- [ ] Path truncates from left when needed

## Test Fixtures

Location: `apps/km-cli/tests/fixtures/tui-test-vault/`

```
tui-test-vault/
├── @next.md              # Main board with varied task states
├── Inbox.md              # Additional tasks
├── Projects/
│   ├── API Refactor.md   # Nested project tasks
│   └── Website Redesign.md
├── Areas/
│   ├── Finance.md
│   └── Health.md
├── Resources/
│   ├── API Guidelines.md
│   └── Design System.md
└── Daily/
    └── 2025-01-14.md
```

### @next.md Coverage

The main test file includes:

- All status types: todo, wip, blocked, done, dropped
- Wiki links with and without aliases
- Inline fields (should be stripped)
- Multiple columns: Work, Personal, Finance, Design, Docs, Done, Dropped
- Nested tasks (subtasks under parent)
- Rich text: priorities, dates, tags

## Source File Reference

| Layer | File                            | Key Functions                                    |
| ----- | ------------------------------- | ------------------------------------------------ |
| 1     | `src/text/rich.ts`              | `renderRich()`, `stripInlineFields()`            |
| 1     | `src/text/icons.ts`             | `getStatusIcon()`, `getTypeIcon()`, `colorize()` |
| 2     | `src/tui/layout/truncate.ts`    | `truncateText()`, `displayLength()`              |
| 2     | `src/tui/layout/wrap.ts`        | `wrapText()`                                     |
| 2     | `src/tui/layout/constrain.ts`   | `constrainText()`, `padText()`                   |
| 2     | `src/tui/layout/path.ts`        | `renderPath()`, `renderParentPath()`             |
| 3     | `src/tui/views/TreeNode.tsx`    | Task node rendering                              |
| 3     | `src/tui/views/ListView.tsx`    | List view                                        |
| 3     | `src/tui/views/ColumnsView.tsx` | Columns view                                     |
| 3     | `src/tui/views/TabsView.tsx`    | Tabs view                                        |
| 3     | `src/tui/views/Board.tsx`       | Main board, top bar                              |
| -     | `src/tui/render.ts`             | Static chalk rendering                           |

## Storybook

The storybook (`apps/km-cli/tests/tui/storybook.tsx`) renders all layers:

```bash
bun storybook
```

Sections:

1. Layer 1: Rich Text Rendering - inline fields, wiki links, markdown
2. Layer 1: Board Pills - GTD colors, custom colors
3. Layer 1: Status & Type Icons - all markers and types
4. Layer 2: Layout Functions - wrap, truncate, pad, constrain, path
5. Layer 3: TreeNode Component - different states
6. Layer 3: All View Modes - Cards, Columns, Tabs, List

## Bug Patterns

### Adding Tests for Bugs

1. Write failing unit test that reproduces the bug
2. Fix the bug
3. Test passes
4. Run `bun fix` and `bun test`

### Common Bug Causes

| Symptom               | Likely Cause                                       |
| --------------------- | -------------------------------------------------- |
| Text overlap          | `displayLength()` not handling ANSI                |
| Wrong truncation      | Using `string.length` instead of `displayLength()` |
| Missing strikethrough | `isDoneOrDropped` logic wrong                      |
| Wrong icon color      | Status string not matching in `getStatusIcon()`    |
| Inline fields visible | Regex in `stripInlineFields()` not matching        |
| Wiki link not styled  | Regex in `styleWikiLinks()` not matching           |

## Known Issues & Debugging Tips

### Storybook vs Live TUI Differences

**Key difference**: Storybook uses `ink-testing-library` (no height constraint), while live TUI uses `withFullScreen` (height constrained to terminal).

**Debugging approach**:

1. If storybook works but live TUI doesn't → issue is with height/overflow handling in Ink
2. If both fail → issue is in text rendering code (Layers 1-2)
3. Use `bun storybook` first to isolate whether rendering code is correct

### Ink Flexbox Height Constraints

When Ink's Box has explicit `height` + `overflowY="hidden"`:

- Content that doesn't fit may be clipped
- Clipping can show BOTTOM of content instead of TOP (unexpected behavior)
- This causes text to show last words instead of first words

**Symptoms**: Cards showing `@alice` instead of `Code review for PR #123 @alice`

**Files involved**:

- `Board.tsx` lines 329-336: Column outer Box with `height` and `overflowY="hidden"`
- `Board.tsx` line 388: Content Box with `height={contentHeight}` and `overflowY="hidden"`

**Investigation approach**:

1. Compare storybook CardsViewDemo (no height constraints) with live Column component
2. Check if removing explicit height from inner content Box fixes the issue
3. Try `flexShrink={0}` on cards to prevent compression
4. Try `alignItems="flex-start"` to ensure content aligns to top

### Quick Diagnostic Commands

```bash
# Test rendering code in isolation (no height constraints)
bun storybook

# Test live TUI with height constraints
bun km view -r /tmp/tui-test-vault @next.md

# Capture screenshots for comparison
ttyd -W -p 7681 bun km view -r /tmp/tui-test-vault @next.md &
bun x playwright screenshot --viewport-size=1400,900 http://localhost:7681 /tmp/tui.png
```
