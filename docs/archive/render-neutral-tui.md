# Render-Neutral TUI — ARCHIVED 2026-04-17

> **Silvery already owns multi-target rendering** (terminal, canvas, DOM — see silvery.dev). This km-side speculative design doc is redundant. Pull back into `docs/future/` only if a km-specific renderer-selection policy needs its own design.

# Render-Neutral TUI: Terminal + Canvas from Shared Components

## Problem

km-canvas.tsx reimplements ~250 LOC of simplified versions of things the TUI already does (navigation, card rendering, editing, keybindings). The TUI has 8,000+ LOC of battle-tested interactive logic. Adding features (search, help, hover tooltips, full keybindings) means either reimplementing them or making the components render-neutral.

**The primary problem is not rendering** — canvas already renders 1,013 nodes in 35ms. **The primary problem is platform coupling in app composition and interaction services.**

## Current State

| Layer | Terminal | Canvas | Shared? |
|-------|----------|--------|---------|
| Data (core, storage, tree) | via Repo | via RemoteRepo (WebSocket) | ✅ same interfaces |
| Column derivation (useColumns) | ✅ | ✅ | ✅ shared hook |
| Card rendering | CardColumn+TreeNode (1,943 LOC) | CardRow (60 LOC simplified) | ❌ reimplemented |
| Navigation | board-actions (2,672 LOC) | inline if/else (60 LOC) | ❌ reimplemented |
| Editing | board-actions-edit (1,061 LOC) | inline (40 LOC) | ❌ reimplemented |
| Dialogs (search, help) | SearchDialog+HelpOverlay (660 LOC) | not implemented | ❌ missing |
| Commands (@km/commands) | full command system | not used | ❌ unused |

## silvery Capability Matrix

38 of 40 silvery UI components are canvas-safe (only ScrollbackList and ScrollbackView require terminal).

| Category | Terminal | Canvas | Completeness | km Needs It? |
|----------|----------|--------|--------------|--------------|
| Core rendering (Box, Text) | 100% | 100% | ✅ Identical | Yes |
| Layout & rects | 100% | 100% | ✅ Identical | Yes |
| Focus management | 100% | 100% | ✅ Identical | Yes |
| Theme | 100% | 100% | ✅ Identical | Yes |
| Virtualization | 100% | 100% | ✅ Identical | Yes |
| Keyboard input (useInput) | 100% | 85% | ⚠️ No Kitty protocol, key release | Yes (85% enough) |
| Mouse input | 100% | 100% | ✅ Via CanvasMouseEvent | Yes |
| useApp (store) | 100% | Partial | ⚠️ No pause/resume | Yes |
| RuntimeContext events | 100% | 60% | ⚠️ No emit, no custom events | Yes |
| InputLayerProvider (modal input) | 100% | ❌ | ❌ Not available | Yes (for dialogs) |
| useWindowSize (reactive) | 100% | Static | ⚠️ No resize events | Nice-to-have |
| useTerm() | 100% | ❌ | ❌ Not available | Partial (dims only) |
| useStdout/useStderr | 100% | ❌ | ❌ Not available | No |
| useScrollback | 100% | ❌ | ❌ Not available | No |
| Terminal caps detection | 100% | ❌ | ❌ Not available | No |
| pause/resume (screen switch) | 100% | ❌ | ❌ Not available | No |
| Component re-exports | 40 via silvery/ui | 38 via canvas | ✅ Done (Phase 1) | Yes |

## km-tui Component Audit

### Canvas-Ready (17 files) — no changes needed
Pure render components (EmptyPaneWelcome, NodeView, OverflowIndicator, PaneBar, SyncPane, ToastStack, TopBar, VerticalScrollIndicator, WorkspaceView, tree-node-helpers) + pure action handlers (board-actions-edit, nav, find, search-replace, zoom) + utility modules (position-resolver, ui-reducer).

### Needs Adapter (28 files) — runtime/service injection
Container components (Board, CardColumn, ColumnsView, DetailView, ListView, TabsView, etc.) use `useApp`/`useAppShallow` for Zustand store integration. Dialog components (CommandBox, SearchDialog, HelpOverlay, etc.) use `useEditContext`, `useFocusManager`, `ModalDialog`. These need the same store + focus system provided on canvas.

### Blocked (4 files) — filesystem/spawn
- `board-actions.ts` — `spawn()`, `node:fs` for date-template auto-creation
- `config-persist.ts` — read/write config.json
- `workspace-persist.ts` — load/save workspace layout
- `ignored.ts` — read/write .kmignore patterns

## Architecture: PlatformServices

The cleanest adaptation point is **not** per-component wrappers but a **runtime/services boundary**. Refactor `createApp()` to accept injected platform services:

```typescript
type PlatformServices = {
  repo: Repo
  persistence: Persistence          // fs | localStorage | IndexedDB | no-op
  clipboard?: ClipboardService      // terminal | navigator.clipboard
  opener?: (url: string) => void    // Bun.spawn("open") | window.open
  spawn?: (cmd: string[]) => void   // Bun.spawn | no-op
  textInput?: TextInputService      // terminal readline | DOM overlay
  rectRegistry: RectRegistry        // shared hit testing + spatial nav
  target: "terminal" | "canvas"
  capabilities: {
    pointer: boolean                // canvas: true, terminal: depends
    clipboard: boolean
    ime: boolean                    // canvas: true (via DOM), terminal: no
    scrollback: boolean             // terminal: true, canvas: no
  }
}

const app = createApp({ services, commands, keymaps })
```

Both targets supply different services. Components use the same hooks (`useApp`, `useAppShallow`). Commands are the write path. Selectors/hooks remain shared.

## Rect Registry & Hit Testing

First-class shared system for both targets — terminal uses it for spatial navigation, canvas for click/hover:

```typescript
interface HitRegion {
  id: string
  role: "card" | "column" | "header" | "editor" | "button"
  rect: Rect
  z: number
  meta?: Record<string, unknown>
}

interface RectRegistry {
  register(region: HitRegion): void
  unregister(id: string): void
  hitTest(x: number, y: number): HitRegion | null
  visibleRegions(role?: string): HitRegion[]
}
```

**Same registry powers both behaviors:**
- Keyboard spatial nav: `visibleRegions("card")` for j/k/h/l
- Click-to-select: `hitTest(x, y)` for mouse
- Hover: `hitTest(x, y)` on mousemove
- DOM overlay positioning: `visibleRegions("editor")` for text input placement

## Text Editing Strategy

**Recommended: DOM overlay for browser editing** (not pure canvas text editing).

For browser text input, position a hidden/visible HTML `<input>` or `<textarea>` over the card being edited, using rect registry coordinates. This gives:
- IME/composition handling (free from browser)
- Clipboard integration (Ctrl+C/V work natively)
- Selection semantics
- Accessibility
- No custom text editing engine needed

Terminal keeps its existing readline-based editing. The edit *actions* (save, cancel, what-changed) are shared; the input *mechanism* differs by target.

## Persistence Strategy

| Scope | MVP | Later |
|-------|-----|-------|
| UX preferences (theme, zoom, collapsed panels) | `localStorage` | `localStorage` |
| Workspace state (panel layout, last board) | Skip | `IndexedDB` |
| Config (keybindings, settings) | Skip | `IndexedDB` |
| Vault data | Remote Repo (always) | Remote Repo |

All persistence behind the `Persistence` interface from PlatformServices. Namespace by vault/workspace. Include schema version for migration.

## Phased Plan

### Phase 0: Vertical Slice (prove the architecture)
Pick one end-to-end flow and prove it works on both targets with shared code:
- Board render with real CardColumn/TreeNode
- Card selection (keyboard + click)
- One shared store, one command path, one rect model
- **Success criteria**: same user-visible behavior on terminal and canvas

This prevents "parity" from becoming an endless framework project.

### Phase 1: Required silvery Parity Only
Only what the vertical slice needs:
- ✅ Component re-exports (done — 38/40)
- useApp parity (store access without terminal deps)
- Input layer/modal input parity (for dialogs)
- Rect registration via shared RectRegistry
- Focus/edit context parity

**Not** full terminal API parity — skip useTerm(), useStdout(), useScrollback().

### Phase 2: App/Runtime Seam
- Extract PlatformServices from `createApp()`
- Commands become the official mutation path
- Shared selectors/hooks remain shared
- Terminal and canvas supply different service implementations
- Ban new direct target checks in shared components

### Phase 3: Port Components Incrementally
Start with highest value:
1. Board + CardColumn + TreeNode (card rendering)
2. Selection + focus (keyboard + pointer)
3. SearchDialog + HelpOverlay (dialogs)
4. Edit entry points (DOM overlay for canvas)
5. km-canvas.tsx shrinks to ~200 LOC (mount + remote-repo wiring)

### Phase 4: Browser-Specific
- localStorage for UX prefs
- IndexedDB for workspace state (if needed)
- Feature-gate spawn/filesystem ops
- Reconnection UX for WebSocket
- Loading states, auth (future)

## Risk Mitigation

**Biggest risk: interactive divergence** — looks similar but behaves differently under real interaction. Focus ownership, modal input, text editing, cursor placement, scroll/reveal behavior, hit testing under resize/virtualization.

**Mitigations:**
- Cross-target conformance test harness: replay same event script on both targets, assert same final state
- Define shared/public app API before building adapters
- Use commands for writes from day 1
- Time-box the thin adapter phase (don't let it become permanent)
- Font metrics parity: verify text measurement matches between Pretext (canvas) and terminal cell assumptions

## What Stays Different

| Concern | Terminal | Canvas |
|---------|----------|--------|
| Entry point | tui.tsx | km-canvas.tsx (~200 LOC) |
| Repo | createRepo (local SQLite) | createRemoteRepo (WebSocket) |
| Persistence | filesystem | localStorage / IndexedDB |
| External actions | Bun.spawn / open | window.open / no-op |
| Text editing input | Terminal readline | DOM overlay |
| Scrollback | Terminal scrollback buffer | CSS overflow |
| Capabilities | Full Kitty protocol | Standard browser events |

Everything else — components, commands, store, hooks, layout, theme, focus, virtualization — is shared.

## silvery Package Organization

Canvas should be a **first-class silvery target** with capability parity for portable app code, not fake 1:1 parity with terminal-only APIs:

- `silvery` / `@silvery/ag-react` — portable components, hooks, types (core)
- `silvery/runtime` / `@silvery/ag-term` — terminal-specific runtime
- `silvery/ui/canvas` / `@silvery/ag-react/ui/canvas` — canvas-specific runtime
- Terminal-only APIs (`useTerm`, `useStdout`, `useScrollback`) stay in `@silvery/ag-term`
- Portable APIs (Box, Text, focus, layout, theme, virtualization) in core

## References

- GPT 5.4 Pro design review: `/tmp/llm-manual-design-review-render-neutral-tui-tgmt.txt`
- Bead: `km-silvery.ag-canvas` (tracking epic)
- Bead: `km-silvery.ag-canvas.shared-components` (this work)
- TEA state machines vision: `docs/design/tea-state-machines.md`
- Era2b commands: `km-silvery.tea` epic
