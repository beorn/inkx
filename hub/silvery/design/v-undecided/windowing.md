# Windowing

_Status: draft (2026-03-15, revised 2026-03-16). Focus, tabs, panes, windows, and overlays as one coherent system._

_See also: [architecture-overview.md](../../archive/pre-era2/architecture-overview.md) (concepts, op spectrum), [app.md](../v15-tea/app.md) (plugins, op()), [commands.md](../v15-tea/commands.md) (keymaps, dispatch), [composability.md](../v10-terminal/composability.md) (universal rendering)._

## The Problem

Silvery has the pieces: `SplitView` + `pane-manager` (splits), `Tabs` (tabs), `ModalDialog` (dialogs), `Toast` (notifications), `FocusManager` (focus scopes). Each manages its own lifecycle, focus, and input routing independently. None of them know about each other.

km built ~1,000 lines of pane management on top — `WorkspaceView.tsx`, `layout-helpers.ts`, `workspace-persist.ts`, `dialog-guard.ts`, `PaneBar.tsx`, `pane-context.tsx` — because silvery doesn't connect its own primitives.

## Six Sips

Six steps from focus scopes to cross-platform windowing. Each step adds one concept. Nothing rewrites.

### Sip 1: Focus graph

Every interactive container has a focus scope. Focus walks up through scopes. That's it.

```typescript
// A "view" is just a focus scope with identity and metadata
interface View {
  id: string
  parentId: string | null
  focusScope: string // scope ID for FocusManager
  inputContext: string // for keymap `when` predicates
}

// FocusManager owns element focus. focusedViewId is derived from it.
// When FocusManager.activeElement changes scope:
//   → runtime walks up to nearest view focusScope
//   → dispatches internal action: { type: "focus.changed", viewId }
//   → store updates focusedViewId

interface ViewState {
  views: Map<string, View>
  focusedViewId: string | null // derived from FocusManager
}

// Commands walk up the focus chain for resolution:
// Tab → TabGroup → Pane → Workspace → Window → App
// Ctrl+W means "close tab" when focused in a tab, "close pane" when in a pane.
```

**What this replaces in km:** `focusedPaneId` + `previousFocusedPaneId` in store, `syncFocusScope()` manual sync, per-command focus routing in `board-actions.ts`.

**Focus rules:**

1. Focus lives on an element within a view. The view is the scope boundary.
2. Command `when` predicates walk from focused view up through the hierarchy.
3. Focus memory per scope — `FocusManager.activateScope()` restores the previously focused element.
4. Selection ≠ Focus — which item is selected vs which view receives keyboard input are independent.

### Sip 2: Splits

A split tree with focus-scoped panes. Split/close/resize/zoom commands. Persistence.

```typescript
// State grows — add layout tree
interface ViewState {
  views: Map<string, View>
  layout: LayoutNode              // split topology: orientation, ratios, nesting
  focusedViewId: string | null
}

// LayoutNode is a binary tree
type LayoutNode =
  | { type: "leaf"; viewId: string }
  | { type: "split"; orientation: "h" | "v"; ratio: number;
      children: [LayoutNode, LayoutNode] }

// Commands — all route through op() → apply()
workspace.splitRight({ paneId? })
workspace.splitDown({ paneId? })
workspace.close({ paneId? })
workspace.resize({ delta, axis, separatorId? })
workspace.equalize()
workspace.zoom({ paneId? })
workspace.swap({ direction })
```

```tsx
// Component reads layout from store — it's a projection, not the owner
const layout = useLayout()

<SplitWorkspace
  layout={layout}
  renderPane={(paneId) => <BoardView paneId={paneId} />}
  separator="│"
  dimUnfocused={true}
/>
```

**Focus on view removal** — deterministic fallback:

1. **Sibling**: adjacent pane in same workspace (prefer same direction)
2. **Parent**: workspace defaults
3. **Scope memory**: `FocusManager.scopeMemory[parentScope]`
4. **Window default**: first focusable element

**Resize target resolution:** `workspace.resize` finds the nearest ancestor split on the requested axis. Panes have a configurable minimum size (default: 10 cols / 3 rows). Resize clamps; collapse is a separate action.

**Persistence** — versioned JSON:

```typescript
interface PersistedViewState {
  version: 1
  layout: SerializedLayoutNode
  panes: Array<{
    id: string
    role?: WorkspaceRole
    tabGroupId: string
    meta: Record<string, unknown>
  }>
  focusedPaneId: string | null
}
```

Reconstruction on load: parse layout → look up panes → rebuild view tree → validate invariants → drop invalid entries with warnings.

### Sip 3: Overlays

Dialog = modal + focus trap + inert background. Popover = floating + light dismiss. State grows by one field.

```typescript
interface ViewState {
  views: Map<string, View>
  layout: LayoutNode
  overlayStack: string[]          // dialog/popover ordering (top = last)
  focusedViewId: string | null
}

// Abstract layers — not z-index values. Each platform implements differently.
type Layer = "content" | "floating" | "modal" | "notification"

// Overlay state is data-only. No closures — renderer registry maps descriptors to components.
type DialogDescriptor = { type: string; props?: Record<string, unknown> }

// Commands
dialog.open({ content: { type: "settings", props: { section: "general" } } })
dialog.close()
popover.open({ anchorId, content: PopoverDescriptor })
popover.close({ id? })   // by ID, or topmost if omitted
```

**What happens on dialog open:**

1. ViewStore adds dialog view with `layer: "modal"`
2. Background views become `inert` (dimmed, no input)
3. Focus scope pushed; focus moves to first focusable in Dialog
4. Escape bound to `dialog.close`

**What happens on close:** remove view, un-inert background, pop focus scope, restore previous focus.

|            | Dialog                      | Popover                               |
| ---------- | --------------------------- | ------------------------------------- |
| Layer      | modal                       | floating                              |
| Focus      | Traps (Tab cycles within)   | Contains but doesn't trap             |
| Dismiss    | Explicit (Escape, button)   | Light-dismiss (outside click, Escape) |
| Background | Inert (dimmed)              | Normal                                |
| Anchor     | Centered or window-attached | Anchored to trigger element           |

**Popover anchoring** uses element-level `anchorId` (the specific button/row that triggered it), not just `anchorViewId` (the containing view). `<Popover.Trigger>` assigns a stable ID. If the anchor unmounts, the popover auto-closes.

**v1 scope:** one Dialog per window, one Popover at a time.

**Serialization:** Overlay descriptors are pure data (`{ type: "settings" }`). A registry maps types to components. Replay/undo/AI work because the store contains no closures.

**What this replaces in km:** `dialog-guard.ts` (59 lines), `dialogTargetRef` threading.

### Sip 4: Tabs

Tab groups within panes. Active tab, ordering, close. State grows by one field.

```typescript
interface ViewState {
  views: Map<string, View>
  layout: LayoutNode
  overlayStack: string[]
  tabGroups: Map<string, TabGroupState>   // tab ordering + active selection
  focusedViewId: string | null
}

interface TabGroupState {
  activeTabId: string
  tabOrder: string[]
}

// Commands
tab.add({ tabGroupId, meta? })
tab.close({ tabId? })
tab.select({ tabId })
tab.next()
tab.prev()
tab.goto({ n })   // Ctrl+1-9
```

```tsx
// Store-backed: reads tab state from ViewStore
const { activeTabId, tabOrder } = useTabGroup(tabGroupId)

<TabGroup tabGroupId={tabGroupId}>
  {tabOrder.map(tabId => (
    <Tab key={tabId} tabId={tabId} title={tabMeta(tabId).title} closable>
      <Editor file={tabMeta(tabId).file} />
    </Tab>
  ))}
</TabGroup>
```

**Tab close focus:** next tab, or previous if last. If no tabs remain, tab group removed, pane gets focus.

**ARIA:** Tab trigger (`role="tab"`, arrow-key navigable in tab bar) and tab panel (`role="tabpanel"`) are modeled separately internally, even though the public API is ergonomic.

**Persistence** extends sip 2:

```typescript
// Added to PersistedViewState
tabGroups: Array<{
  id: string
  paneId: string
  activeTabId: string
  tabs: Array<{ id: string; meta: Record<string, unknown> }>
}>
```

### Sip 5: Adaptive layout

Size classes, NavigationWorkspace, sidebar collapse. Builds on sips 2-4.

```typescript
// Size classes (Apple's model, adapted for terminals)
type SizeClass = "compact" | "regular" | "expanded"

// Workspace roles — metadata on pane views, not view kinds
type WorkspaceRole = "sidebar" | "content" | "detail" | "inspector"
```

| Size Class | Width                    | Layout                                                                                |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------- |
| Compact    | < 80 cols / 600px        | Single column. Sidebar hidden (togglable via command). Detail becomes overlay dialog. |
| Regular    | 80-160 cols / 600-1200px | Two columns. Sidebar + Content. Detail as overlay.                                    |
| Expanded   | > 160 cols / 1200px      | Three columns. Sidebar + Content + Detail all visible.                                |

```tsx
// NavigationWorkspace: store-backed, adaptive
// Slot children declare WHAT goes where. Store owns structure and collapse state.
<NavigationWorkspace>
  <Sidebar width={30}>
    <FileTree />
  </Sidebar>
  <Content>
    <Editor />
  </Content>
  <Detail>
    <Inspector />
  </Detail>
</NavigationWorkspace>
```

**Two layers of workspace:**

- **`<SplitWorkspace>`** — generic recursive split manager (arbitrary binary tree). km uses this.
- **`<NavigationWorkspace>`** — adaptive multi-column with named slots. Built on `<SplitWorkspace>`. A code editor might use this.

**Focus on sidebar collapse:** if sidebar had focus, it moves to content pane. Sidebar's focus state preserved in scope memory for when it reappears.

**Roles map to ARIA landmarks:** sidebar → `navigation`, content → `main`, detail/inspector → `complementary`. F6 / Shift+F6 cycles between landmarks (desktop application convention, not ARIA mandate).

### Sip 6: Platform mapping

How each piece maps to terminal, web, and native. These are **behavioral analogues**, not one-to-one widget identities.

| Concept   | Terminal                        | Web                          | macOS (analogue)             | iOS (analogue)                |
| --------- | ------------------------------- | ---------------------------- | ---------------------------- | ----------------------------- |
| Window    | Terminal session                | Browser window               | NSWindow                     | UIWindow                      |
| Workspace | Flexbox splits with `│`         | CSS flexbox + resize handles | NSSplitViewController        | Single column                 |
| Pane      | Flex child                      | CSS flex child               | Split view item              | —                             |
| Sidebar   | Left pane, collapsible          | `<nav>`                      | NavigationSplitView .sidebar | Tab bar / hamburger           |
| Tab Group | `[tab1] [tab2]` bar             | `<div role="tablist">`       | NSTabViewController          | Segmented control             |
| Dialog    | Centered overlay, double border | `<dialog>.showModal()`       | Sheet / Alert                | Sheet / Alert                 |
| Popover   | Floating box near anchor        | Popover API                  | NSPopover                    | Falls back to sheet on iPhone |
| Toast     | Bottom-right stack              | Fixed-position portal        | Notification banner          | Banner                        |

**Web note:** The browser's top layer (used by `<dialog>.showModal()` and Popover API) has its own stacking rules outside normal z-index. On terminal, silvery manages its own ordered overlay stack.

**Terminal keyboard defaults use Ctrl/Alt/Shift** — the universally portable modifier set. Web/macOS defaults remap Ctrl → Cmd. Enhanced keyboard protocols (Kitty) are progressive enhancement, not the baseline.

## The View Model (Full)

The sips above introduce concepts incrementally. Here's the full model for reference.

### View Type

```typescript
// Open interfaces — apps extend via module augmentation
interface PaneMeta {
  role?: WorkspaceRole
}
interface TabMeta {
  closable?: boolean
}
interface DialogMeta {}
interface PopoverMeta {
  anchorId: string
  anchorViewId: string
  placement: PopoverPlacement
}
interface ToastMeta {
  variant: ToastVariant
  duration: number
}

// Union built from open interfaces
type ViewMeta =
  | ({ kind: "pane" } & PaneMeta)
  | ({ kind: "tab" } & TabMeta)
  | ({ kind: "dialog" } & DialogMeta)
  | ({ kind: "popover" } & PopoverMeta)
  | ({ kind: "toast" } & ToastMeta)
  | ({ kind: "workspace" } & WorkspaceMeta)
  | ({ kind: "window" } & WindowMeta)
  | ({ kind: "tab-group" } & TabGroupMeta)

type PopoverPlacement = "top" | "bottom" | "left" | "right" | "top-start" | "top-end" | "bottom-start" | "bottom-end"

interface View<K extends ViewKind = ViewKind> {
  readonly id: string
  readonly kind: K
  readonly parentId: string | null
  readonly focusScope: string
  readonly inputContext: string
  readonly layer: Layer
  readonly modal: boolean
  readonly role: AriaRole
  readonly label: string
  readonly state: "active" | "inactive" | "inert"
  readonly meta: Extract<ViewMeta, { kind: K }> // generic constraint prevents impossible states
}

type ViewKind = "window" | "workspace" | "pane" | "tab-group" | "tab" | "dialog" | "popover" | "toast"
```

**App-level extension** via module augmentation:

```typescript
declare module "@silvery/views" {
  interface PaneMeta {
    rootId: string
    viewMode: "cards" | "list" | "columns" | "tabs"
    cursorNodeId: string | null
  }
}
// pane views now carry { kind: "pane", role?, rootId, viewMode, cursorNodeId }
```

### Full State Shape

```typescript
interface ViewState {
  // Co-canonical submodels — each owns state not derivable from the others.
  views: Map<string, View> // identity, kind, metadata, parent
  layout: LayoutNode // split topology
  tabGroups: Map<string, TabGroupState> // tab ordering + active selection
  overlayStack: string[] // dialog/popover ordering
  toastQueue: string[] // toast ordering (FIFO)

  // Derived from FocusManager
  focusedViewId: string | null
}
```

### State Invariants

Every reducer action updates all affected submodels atomically.

**Cross-submodel:**

1. Every leaf ID in `layout` exists in `views` with `kind: "pane"`
2. Every tab ID in `tabGroups[*].tabOrder` exists in `views` with `kind: "tab"`
3. Every ID in `overlayStack` exists in `views` with `kind: "dialog" | "popover"`
4. Every ID in `toastQueue` exists in `views` with `kind: "toast"`
5. Every key in `tabGroups` exists in `views` with `kind: "tab-group"`
6. Every pane references exactly one tab-group child (1:1)

**Per-submodel:** 7. `focusedViewId` is `null` or references a view with `state: "active"` 8. At most one Dialog in `overlayStack` (v1) 9. All views have a valid `parentId` (except root window) 10. `view.kind === view.meta.kind` (enforced by generic `View<K>`) 11. Removing a view removes it from ALL submodels atomically

**Allowed parent/child kinds:**

| Parent    | Children                          |
| --------- | --------------------------------- |
| window    | workspace, dialog, popover, toast |
| workspace | pane (via layout)                 |
| pane      | tab-group (exactly one)           |
| tab-group | tab                               |

`validateState(state): string[]` checks all invariants. Used in tests and dev mode.

### Effects

```typescript
type ViewEffect =
  | { type: "focus.activate"; scopeId: string }
  | { type: "focus.restore"; scopeId: string }
  | { type: "inert.set"; viewIds: string[] }
  | { type: "inert.clear"; viewIds: string[] }
  | { type: "layout.changed"; layout: LayoutNode }
  | { type: "toast.startTimer"; viewId: string; durationMs: number }
  | { type: "toast.expired"; viewId: string }
```

### React Hooks

```typescript
function useView(viewId: string): View | undefined
function useViews(filter?: (v: View) => boolean): View[]
function useActiveView(): View | undefined
function useLayout(): LayoutNode
function useTabGroup(tabGroupId: string): TabGroupState
```

## Plugin: `withViews()`

```typescript
const app = pipe(
  createApp(),
  withViews(),        // ViewStore + FocusManager + commands + keybindings
  withTerminal(...),
)
```

Provides: ViewStore on `app.model.views`, FocusManager integration (view focus changes sync via `focus.changed`), all commands routing through `op()` → `apply()`, modal inertness management, focus restoration.

### Default Keybindings

```
view.focus.next          → F6
view.focus.prev          → Shift+F6

workspace.split.right    → Ctrl+D
workspace.split.down     → Ctrl+Shift+D
workspace.close          → Ctrl+W (when no tabs)
workspace.resize.grow    → Ctrl+Shift+Right/Down
workspace.resize.shrink  → Ctrl+Shift+Left/Up
workspace.equalize       → Ctrl+Shift+=
workspace.zoom           → Ctrl+Shift+Enter

tab.new                  → Ctrl+T
tab.close                → Ctrl+W
tab.next                 → Ctrl+Tab
tab.prev                 → Ctrl+Shift+Tab
tab.goto(n)              → Ctrl+1-9

dialog.close             → Escape
popover.close            → Escape
```

## Component Summary

All components are **store-backed projections** — they read ViewStore state and render from it. Structural mutations go through commands.

| Component                                  | Sip | What It Does                                                                    |
| ------------------------------------------ | --- | ------------------------------------------------------------------------------- |
| `<SplitWorkspace>`                         | 2   | Generic recursive split manager. Reads `useLayout()`.                           |
| `<Dialog.Root>` / `.Content` / `.Title`    | 3   | Modal overlay. Reads overlay state from ViewStore. Radix-style compound API.    |
| `<Popover.Root>` / `.Trigger` / `.Content` | 3   | Light-dismiss overlay. Trigger registers anchor ID.                             |
| `<TabGroup>` / `<Tab>`                     | 4   | Tabs within a pane. Reads `useTabGroup()`. ARIA tab/tabpanel internally.        |
| `<NavigationWorkspace>`                    | 5   | Adaptive multi-column. Sidebar/Content/Detail slots. Built on SplitWorkspace.   |
| `<Inspector>`                              | 5   | Toggleable right panel. Falls back to Dialog on narrow.                         |
| `<View>`                                   | 1   | Low-level primitive. Focus scope + layer + role. Everything else built on this. |

## What Already Exists

| Existing                                      | Becomes                | Changes                                                         |
| --------------------------------------------- | ---------------------- | --------------------------------------------------------------- |
| `SplitView` (@silvery/platter-react)          | `<SplitWorkspace>`     | Gains focus scoping, separator customization, unfocused dimming |
| `pane-manager` (@silvery/platter-term)        | ViewStore internals    | Core layout ops stay; ViewStore calls into them                 |
| `Tabs` (@silvery/platter-react)               | `<TabGroup>` / `<Tab>` | Gains view lifecycle, focus integration, closable tabs          |
| `ModalDialog` (@silvery/platter-react)        | `<Dialog>`             | Gains focus trap, inert background, focus restoration           |
| `Toast` + `useToast` (@silvery/platter-react) | Toast commands         | Gains view registration, queue, expiry effects                  |
| `FocusManager` (@silvery/tea)                 | Unchanged API          | ViewStore subscribes to it for `focus.changed`                  |

### km Migration

| km Code                     | Lines | After                                 |
| --------------------------- | ----- | ------------------------------------- |
| `WorkspaceView.tsx`         | 234   | ~0 (replaced by `<SplitWorkspace>`)   |
| `layout-helpers.ts`         | 343   | ~50 (km-specific adapters)            |
| `workspace-persist.ts`      | 311   | ~100 (domain-specific path mapping)   |
| `dialog-guard.ts`           | 59    | 0 (replaced by `<Dialog>` focus trap) |
| `PaneBar.tsx`               | 47    | 0                                     |
| `pane-context.tsx`          | 41    | 0                                     |
| Pane ops in board-app-store | ~300  | ~50 (command invocations)             |

**~1,000 lines → ~200 lines.**

## Lessons from Cross-Platform Systems

What can we learn from how others solved this?

### Per-Component Insights

**Splits:** VS Code's `SerializableGrid` uses one layout mechanism for everything (sidebar, editor, panel). GTK4 separates raw primitive (`GtkPaned`) from opinionated pattern (`AdwNavigationSplitView`). No TUI framework has interactive resizable splits — only tmux.

**Tabs:** VS Code is the gold standard for document tabs (closable, reorderable, dirty state, preview, pin, drag between groups). Apple treats document tabs as a window concern, not a view concern. No TUI framework has the full document-tab experience.

**Focus:** Flutter's focus tree is the gold standard (scopes, restoration, spatial navigation). Compose has elegant directional exit hooks. No TUI framework has scopes or spatial navigation — silvery's FocusManager already does.

**Overlays:** Apple's biggest mistakes — boolean bindings (`.sheet(isPresented:)`), single-sheet constraint, hierarchy coupling (`.sheet()` must be on a View), platform-specific naming. Silvery avoids all of these: item-based state, overlay stack, command-driven (invocable from anywhere), universal terminology.

**Command palette:** Only VS Code and Textual have one. Silvery's command system is the perfect foundation.

### Design Principles (Derived)

1. **Semantic intent, adaptive presentation.** Define WHAT (modal dialog, sidebar, document tab). Platform decides HOW.
2. **Command-driven, not hierarchy-coupled.** Splitting, closing, opening — all commands. Invocable from anywhere.
3. **Item-based state, not boolean triggers.** No `isDialogOpen: boolean`.
4. **Two layers per component.** Raw primitive + opinionated pattern.
5. **One layout mechanism for everything.**
6. **Adaptive by default, overridable always.**

### The Big TUI Gaps (Silvery's Opportunity)

1. **Focus management** — no TUI framework has scopes, spatial navigation, or restoration
2. **Interactive resizable splits** — no TUI framework has keyboard-resizable separators
3. **Document tabs** — no TUI framework has closable, reorderable, dirty state, overflow
4. **Command palette** — only Textual has one
5. **Adaptive layout** — no TUI framework collapses sidebars on narrow terminals

## Prior Art

### Terminology

| Silvery   | macOS / SwiftUI       | Web                    | VS Code      | ARIA             | tmux    |
| --------- | --------------------- | ---------------------- | ------------ | ---------------- | ------- |
| Window    | Window / Scene        | Window                 | Window       | —                | Session |
| Workspace | NSSplitViewController | —                      | Workbench    | —                | Window  |
| Pane      | Split view item       | —                      | Editor group | region           | Pane    |
| Tab Group | NSTabViewController   | `<div role="tablist">` | Editor group | tablist          | —       |
| Dialog    | Sheet / Alert         | `<dialog>`             | —            | dialog           | —       |
| Popover   | NSPopover             | `<div popover>`        | Quick Pick   | _(from content)_ | —       |
| Toast     | Notification          | `<div role="status">`  | Notification | status           | —       |

### Apple's Actual Platform Model

Apple does NOT have a unified presentation model. Each platform renders differently:

| SwiftUI API             | iPhone                  | iPad             | macOS                  | visionOS      |
| ----------------------- | ----------------------- | ---------------- | ---------------------- | ------------- |
| `.sheet()`              | Slides up, detents      | Same             | Slides from title bar  | Modal overlay |
| `.alert()`              | Centered overlay        | Centered         | NSPanel, **app-modal** | Centered      |
| `.confirmationDialog()` | Bottom action sheet     | **Popover**      | **Modal alert**        | —             |
| `.popover()`            | **Falls back to sheet** | Floating balloon | Floating balloon       | Floating      |
| `.inspector()`          | **Falls back to sheet** | Trailing sidebar | Trailing sidebar       | —             |

**What silvery takes:** The semantic approach is right. But use universal terminology (Dialog, not Sheet) and make adaptation overridable.

### Headless UI (Radix pattern)

| Radix                                   | Silvery                                |
| --------------------------------------- | -------------------------------------- |
| Dialog.Root / Overlay / Content / Title | Dialog.Root / Content / Title / Footer |
| Popover.Root / Trigger / Content        | Popover.Root / Trigger / Content       |
| Tabs.Root / List / Trigger / Content    | TabGroup / Tab Bar / Tab               |

## Tradeoffs

**Terminal ↔ web visual parity.** Fixed-width cells vs proportional fonts. The model defines behavior (focus, stacking, modality) independently of visual treatment. Design for terminal first; enhance on web.

**Multi-window.** Requires IPC for shared state. Deferred. The command-based API is compatible with future IPC serialization.

**Accessibility.** ARIA roles are hard to retrofit. View model includes `role` and `label` by design. Accessible splitters deferred to post-v1.

**Model-first complexity.** More upfront work than render-first. Payoff: persistence, undo, replay, AI control, testability without rendering. Mitigated by phased implementation — start with splits (where km already has a model-first store), add overlays second.

## Implementation Phases

### Phase 1: Foundation (Sip 1)

- Add `inert` prop to Box
- Enhance FocusManager with scope memory for view IDs
- Add `layer` concept to rendering pipeline

### Phase 2: ViewStore + SplitWorkspace (Sip 2)

- Implement ViewStore state machine with invariant validation
- Build `<SplitWorkspace>` on existing SplitView + pane-manager
- Wire ViewStore to FocusManager via `focus.changed`
- Persistence with versioned schema

### Phase 3: Dialog + Popover (Sip 3)

- Build `<Dialog>` compound component
- Overlay stack with automatic inert management
- Build `<Popover>` with element-level anchoring
- v1: one Dialog, one Popover

### Phase 4: Tabs (Sip 4)

- Build `<TabGroup>` / `<Tab>` with store-backed state
- Tab ordering, close, active selection
- Persistence integration

### Phase 5: withViews() Plugin

- Bundle ViewStore + commands + keybindings
- Route all commands through `op()` → `apply()`
- Default keybindings (Ctrl-based for terminal)
- `when` predicates for context-sensitive bindings

### Phase 6: km Migration

- Replace `WorkspaceView.tsx` → `<SplitWorkspace>`
- Replace `dialog-guard.ts` → `<Dialog>`
- Migrate pane operations to ViewStore commands
- Delete `pane-context.tsx`, `PaneBar.tsx`
- Adapt persistence to ViewStore serialization
- **Target: ~800 lines deleted**

### Phase 7: Adaptive (Sip 5)

- `<NavigationWorkspace>` with Sidebar/Content/Detail/Inspector
- Size class detection
- Adaptive column collapse

### Phase 8: Web + Native (Sip 6)

- @silvery/web: CSS flexbox, `<dialog>`, Popover API, ResizeObserver
- macOS: NSSplitViewController, sheet presentation, NSPopover
- iOS: sheet with detents, popover-to-sheet adaptation

---

_See also: [architecture-overview.md](../../archive/pre-era2/architecture-overview.md), [composability.md](../v10-terminal/composability.md), [packaging.md](../../archive/era2-drafts/packaging.md), [commands.md](../v15-tea/commands.md), [app.md](../v15-tea/app.md)._
