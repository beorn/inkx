# TUI Design System

Visual language specification for the km terminal UI.

## Core Principles

### Terminal Color Constraints

The TUI targets **256-color terminals** as the baseline. All core features work with the standard 256-color palette (ANSI 0-255).

- **256 colors**: Required for full functionality
- **True color** (24-bit RGB): Optional enhancement for due date underlines
- **16 colors**: Not officially supported (may work but not tested)

### Visual Hierarchy

1. **Selection**: Cursor and selected items (cyan background)
2. **Active context**: Current panel/card (bright border)
3. **Standard content**: Default colors
4. **De-emphasized**: Completed tasks, inactive regions (dimmed)

### Accessibility

- Selection states use high-contrast background colors
- Status icons combine color AND shape (colorblind-safe)
- Dim styling reduces visual noise without hiding content

---

## Color Palette

### Selection Colors

| Color                  | Usage                   | Rationale                          |
| ---------------------- | ----------------------- | ---------------------------------- |
| `cyan` bg + `black` fg | **Selection (all)**     | Cursor, focused item, multi-select |
| `cyanBright` border    | **Active panel/card**   | Draws eye to focused region        |
| `blackBright` border   | **Inactive panel/card** | Present but de-emphasized          |

### Header Colors

| Color                  | Usage                        | Rationale                             |
| ---------------------- | ---------------------------- | ------------------------------------- |
| `yellow` + bold        | **Selected column header**   | Stands out, indicates current context |
| `yellowBright` + dim   | **Unselected column header** | Visible but clearly secondary         |
| `cyan` bg + `black` fg | **Header at cursor level**   | Consistent with item selection        |

### Status Icon Colors

| Color    | Status  | Icon | Meaning        |
| -------- | ------- | ---- | -------------- |
| `gray`   | todo    | ○    | Not started    |
| `yellow` | wip     | ◐    | In progress    |
| `red`    | blocked | ⊘    | Cannot proceed |
| `green`  | done    | ✓    | Completed      |
| `gray`   | dropped | ∅    | Abandoned      |

### Tag/Board Colors (User-Assignable)

Users can assign colors to boards and tags using the `color=` attribute. Available colors:

| Color     | ANSI | Suggested Use                                  |
| --------- | ---- | ---------------------------------------------- |
| `white`   | 7    | Default, neutral                               |
| `blue`    | 4    | Information, reference                         |
| `magenta` | 5    | Special, highlight                             |
| `yellow`  | 3    | Warning, attention (avoid - used by WIP icon)  |
| `red`     | 1    | Urgent, blocked (avoid - used by blocked icon) |
| `green`   | 2    | Success, done (avoid - used by done icon)      |

**Avoid for tags**: `cyan` (reserved for selection), `gray` (used for dimming/chrome).

**Note**: The app does not assign default colors to GTD boards (inbox, next, etc). Users can customize via `color=` attribute in headings.

### UI Chrome Colors

| Element           | Color                  | Usage                           |
| ----------------- | ---------------------- | ------------------------------- |
| Separators        | `gray`                 | Column dividers, borders        |
| Scroll indicators | `gray` bg + `white` fg | Show more content available     |
| Hints/metadata    | `dimColor`             | Secondary information           |
| Embedded context  | `dimColor` + `italic`  | Parent path for symlinked tasks |

---

## Reserved Colors

These colors have specific semantic meanings and **MUST NOT** be reused for other purposes:

| Color             | Reserved For                  | Why                                          |
| ----------------- | ----------------------------- | -------------------------------------------- |
| `cyan` background | **Selection only**            | Users must instantly identify where they are |
| `inverse` video   | **Input cursor, mode badges** | Text input focus indicator                   |

### Anti-patterns

- Using cyan background for status indication or general emphasis
- Using inverse for general emphasis

---

## Selection States

### Item-Level Selection

| State    | Background | Foreground | Modifiers                   |
| -------- | ---------- | ---------- | --------------------------- |
| Normal   | -          | default    | -                           |
| Selected | `cyan`     | `black`    | -                           |
| Done     | -          | -          | `dimColor`, `strikethrough` |
| Dropped  | -          | -          | `dimColor`, `strikethrough` |

### Panel-Level Focus

| State          | Border Color  | Header Style               |
| -------------- | ------------- | -------------------------- |
| Active panel   | `cyanBright`  | `yellow`, `bold`           |
| Inactive panel | `blackBright` | `yellowBright`, `dimColor` |

### Input Fields

| State                   | Style                       |
| ----------------------- | --------------------------- |
| Text cursor position    | `inverse` (single space)    |
| Selected item in picker | `cyan` bg, arrow prefix `▸` |
| Unselected item         | no prefix indent            |

---

## Component Guidelines

### TreeNode

Renders individual tasks with:

- Status icon (colored by state)
- Content text (rich text rendered)
- Optional board pills
- Selection highlighting (cyan background)

```
isSelected=true  → backgroundColor="cyan", color="black"
isDoneOrDropped  → dimColor={true}, strikethrough applied
```

### Column Headers

```
isSelected       → color="yellow", bold={true}
!isSelected      → color="yellowBright", dimColor={true}
```

Custom board colors override the yellow default when present.

### Card Borders (Cards View)

```
isSelected       → borderColor="cyanBright"
!isSelected      → borderColor="blackBright"
```

### Top Bar / Breadcrumb

- Board path: `black` text on `white` background
- Item path (within board): `blue` text on `white` background
- Boundary separator: `blue` bold

### Dialogs and Pickers

- Dialog border: `cyan`
- Input cursor: `inverse` video
- Selected option: `cyan` background
- Confirmation buttons: standard colors

---

## Due Date Urgency

Due dates use colored underlines to indicate urgency without changing text color:

| Urgency        | Underline Style | Color (RGB)              |
| -------------- | --------------- | ------------------------ |
| Overdue        | curly           | `[255, 80, 80]` (red)    |
| Today/Tomorrow | curly           | `[255, 165, 0]` (orange) |
| Within 7 days  | single          | `[255, 255, 0]` (yellow) |
| Beyond 7 days  | none            | -                        |

These use true color (24-bit RGB) and may not render in all terminals.

---

## Code References

| Component            | File                      | Key Lines |
| -------------------- | ------------------------- | --------- |
| Item selection       | `views/TreeNode.tsx`      | 208-215   |
| Done/dropped dimming | `views/TreeNode.tsx`      | 219-225   |
| Card borders         | `views/Board.tsx`         | 213       |
| Column headers       | `views/ColumnsView.tsx`   | 115-126   |
| Tab highlighting     | `views/TabsView.tsx`      | 105-117   |
| Input cursor         | `views/ProjectPicker.tsx` | 283-329   |
| Picker selection     | `views/ProjectPicker.tsx` | 307-312   |
| Mode badges          | `views/Board.tsx`         | 2630      |
| Due date underlines  | `views/TreeNode.tsx`      | 150-159   |
| GTD colors           | `text/colors.ts`          | 14-22     |
| Status icons         | `text/icons.ts`           | 12-52     |

---

## Extending the Design System

When adding new visual elements:

1. **Check reserved colors first** - don't reuse cyan bg or inverse
2. **Use semantic color mapping** - pick colors that match the meaning
3. **Stick to 256-color palette** - avoid true color for core features
4. **Update this document** - keep the design system current
5. **Add to storybook** - visual regression testing
