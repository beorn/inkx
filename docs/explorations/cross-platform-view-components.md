# Cross-Platform View-Level Components: Framework Survey

Research into how major UI frameworks handle view-level components -- splits, tabs, sidebars, focus, commands, menus, status bars, and window management.

## Table of Contents

1. [Split Views / Panes](#1-split-views--panes)
2. [Tab Systems](#2-tab-systems)
3. [Sidebar / Navigation](#3-sidebar--navigation)
4. [Inspector / Detail Panels](#4-inspector--detail-panels)
5. [Focus Management](#5-focus-management)
6. [Command Palettes / Search Bars](#6-command-palettes--search-bars)
7. [Status Bars / Toolbars](#7-status-bars--toolbars)
8. [Menus](#8-menus)
9. [Window Management](#9-window-management)
10. [Key Takeaways for Silvery](#10-key-takeaways-for-silvery)

---

## 1. Split Views / Panes

### VS Code / Electron

VS Code's editor area uses a **SerializableGrid** -- a recursive binary tree of splits. `EditorPart` manages a grid of `EditorGroupView` instances. Each group holds tabs + an active editor. The grid supports arbitrary 2D splitting (vertical, horizontal, grid patterns like 2x2).

**Resize**: Draggable "sash" handles between all parts. The sash is a thin visual divider that fires resize events. The entire workbench (sidebar, editor, panel, auxiliary bar) is laid out via the same `SerializableGrid` from `vs/base/browser/ui/grid`.

**Persistence**: Layout state serializes to disk and restores on restart -- part visibility, editor group structure, active group, editor open state, panel/sidebar positions.

**Key insight**: The workbench is just one big grid. Sidebar, editor, panel, auxiliary bar -- they're all "parts" in the same `SerializableGrid`. The `Layout` class (implementing `IWorkbenchLayoutService`) orchestrates positioning, visibility toggling, and size calculations. This means sidebar resize, panel resize, and editor group resize all use the same underlying mechanism.

### SwiftUI / AppKit / UIKit

**NavigationSplitView** provides 2-column or 3-column layouts (sidebar + content, or sidebar + content + detail). The framework handles platform adaptation automatically:
- macOS: Translucent sidebar, side-by-side columns
- iPadOS landscape: Side-by-side columns
- iPadOS portrait / iPhone: Collapses to NavigationStack (push/pop)
- visionOS: Glass material, hierarchical structure

**Sizing**: Uses `sidebar-width-fraction`, `min-sidebar-width`, `max-sidebar-width` properties. The user can drag to resize the sidebar divider on macOS/iPadOS.

**Key insight**: SwiftUI doesn't expose a general-purpose binary-tree split. It provides opinionated 2-column and 3-column layouts where selections in leading columns control presentations in subsequent columns. This is master-detail, not arbitrary splits.

### Flutter

No built-in split view widget. Developers create responsive splits by changing layout at breakpoints:
```dart
if (width > 600) {
  return Row(children: [sidebar, Expanded(child: content)]);
} else {
  return content; // with drawer for sidebar
}
```

Microsoft's **TwoPane** widget (for dual-screen devices) provides side-by-side or stacked panes with proportional sizing and pane priority.

**Key insight**: Flutter's approach is "build it yourself with constraints." The framework provides the primitives (Row, Column, Expanded, LayoutBuilder) but not opinionated split components.

### GTK4 / Libadwaita

**GtkPaned**: The classic split view. Two children, horizontal or vertical, with a draggable handle. Keyboard accessible -- F8 cycles focus to the handle, arrow keys resize.

**AdwNavigationSplitView**: Two panes (sidebar + content). When collapsed, transforms into an `AdwNavigationView` (push/pop stack). Uses `AdwBreakpoint` to trigger collapse at a width threshold.

**AdwOverlaySplitView**: Similar, but when collapsed the sidebar overlays the content rather than transforming into a stack.

**Triple-pane**: Nest an `AdwNavigationSplitView` inside an `AdwOverlaySplitView`'s content. Breakpoints can collapse outer and inner views independently.

**Key insight**: GTK4 separates the raw split primitive (`GtkPaned`) from the adaptive navigation split (`AdwNavigationSplitView`). The former is a general-purpose resizable container; the latter is an opinionated sidebar pattern with automatic collapse behavior.

### Compose Multiplatform

**ListDetailPaneScaffold**: Up to 3 panes (list, detail, extra). Adapts based on window size class -- side-by-side on expanded, stacked on compact/medium.

**SupportingPaneScaffold**: Up to 3 panes (main, supporting, extra). Similar adaptive behavior.

Both use a `ThreePaneScaffoldNavigator` for controlling which pane is visible and how transitions work. The `PaneScaffoldDirective` controls sizes and pane count.

**Key insight**: Like SwiftUI, Compose provides opinionated multi-pane scaffolds rather than a general-purpose binary-tree split. Navigation is integrated -- you don't just resize panes, you navigate between them.

### React Native

No built-in split view. `react-native-navigation` (Wix) has iOS-only `SplitView` wrapping `UISplitViewController`. `react-navigation` has only a feature request for tablet dual-pane support.

**Workaround**: Detect width via `onLayout` (not `Dimensions`, which doesn't update for iPad split screen) and conditionally render side-by-side vs stacked layouts. Some libraries (e.g., `react-native-split-screen`) provide this as a component.

**Pain point**: React Native's `Dimensions` API doesn't respond to iPad Split View or Slide Over, always returning full-screen dimensions. You must use `onLayout` on a root view.

### Web Platform

No native split-pane component. Libraries fill the gap:
- **react-resizable-panels** (bvaughn): Declarative `<PanelGroup>` + `<Panel>` + `<PanelResizeHandle>`. Supports min/max constraints, collapsible panels, persistence, keyboard resize.
- **allotment**: React component for VS Code-style resizable split views. Snap-to-collapse, min/max constraints.
- **Split.js**: Framework-agnostic, pure CSS for resizing, minimal JS for drag handling.
- **Shoelace `<sl-split-panel>`**: Web component with position (percentage or pixels), snap, min/max, keyboard accessible.

CSS `resize` property exists but only works on overflow-able elements and provides a tiny handle -- not suitable for split panes.

**Key insight**: The web has no built-in split pane. Every IDE-like app re-implements it. `react-resizable-panels` is closest to a standard -- it handles drag, keyboard, persistence, and constraints.

### Terminal TUI Frameworks

**tmux**: The gold standard for terminal splits. Sessions > Windows > Panes. `%` splits horizontal, `"` splits vertical. Arrow keys navigate between panes, `Ctrl+arrows` resize in 1-cell steps, `Alt+arrows` in 5-cell steps. Mouse drag on dividers for interactive resize. Each pane is a separate pseudo-terminal.

**Ratatui (Rust)**: No split-pane widget per se. Uses `Layout` with constraints (`Length`, `Percentage`, `Ratio`, `Min`, `Max`, `Fill`) to divide space. Layouts nest for complex UIs. Uses the **Cassowary** constraint solver algorithm. Developers manually manage focus between panes.

**Textual (Python)**: CSS-based layout with `horizontal`, `vertical`, and `grid` layouts. Docking fixes widgets to edges (sticky headers/sidebars). No built-in resizable split -- you set sizes via CSS `width`/`height` with `fr` units or percentages.

**Bubbletea (Go)**: No layout engine. View functions return strings; developers manually construct layout by concatenating strings with `lipgloss` for styling. `tea.WindowSizeMsg` provides terminal dimensions. Split layouts are manually calculated.

**Blessed (Node.js)**: CSS-like absolute positioning. Elements can be sized with percentages relative to parent. No built-in split-pane widget, but the positioning system makes it straightforward. `stmux` (built on Blessed) provides tmux-like splits with directional focus switching.

**Key insight for TUIs**: Only tmux provides true interactive resizable splits. TUI frameworks generally provide layout primitives (constraints, CSS) but leave interactive resize and pane management to the developer. This is a major gap -- most TUI apps that need splits end up with hardcoded ratios or re-implementing tmux-like behavior.

---

## 2. Tab Systems

### Document Tabs vs Navigation Tabs

Two fundamentally different patterns:
- **Document tabs** (VS Code, browser, editor): Closable, reorderable, represent open documents. Overflow requires scrolling or dropdown. Can have dirty state indicators.
- **Navigation tabs** (iOS tab bar, Android bottom nav): Fixed set of top-level destinations. Not closable. Often have badges. Usually 3-5 items.

### VS Code / Electron

Each `EditorGroupView` has a tab bar. Tabs support:
- Drag reordering within and between groups
- Close (middle-click, X button, Ctrl+W)
- Pin (locks position, smaller appearance)
- Preview mode (italicized tab, replaced when opening another file)
- Dirty state (dot indicator)
- Tab overflow: Scrollable tab bar with chevron dropdown to show all open editors

**Locked editor groups**: An entire group can be locked so new opens go to a different group (useful for keeping a reference file visible).

### SwiftUI / AppKit / UIKit

**TabView**: Navigation tabs (not document tabs). On iOS, renders as a tab bar at the bottom. On macOS, renders as a segmented control or sidebar depending on style.

SwiftUI has no built-in document-tab component. macOS apps use `WindowGroup` which provides native window tabbing (Cmd+T to merge windows into tabs), but this is window-level, not view-level.

**Key insight**: Apple treats document tabs as a window management concern (native window tabbing), not a view component. This works for document-based apps but not for IDE-like interfaces.

### Flutter

**TabBar + TabBarView + TabController**: Material Design tabs. Supports scrollable tab bars for overflow. No built-in closable/reorderable tabs -- those require custom implementation.

**BottomNavigationBar** / **NavigationBar** (Material 3): Navigation tabs. Fixed destinations, badges, adaptive behavior.

Each tab maintains separate state and navigation stacks (important for preserving scroll position when switching).

### GTK4

**GtkNotebook**: Classic tabbed container. Tabs can be reorderable, closable (via custom close buttons), and scrollable when they overflow. Supports drag-and-drop of tabs between notebooks.

### Compose Multiplatform

**TabRow** (fixed) and **ScrollableTabRow** (scrollable): Material Design tabs. No built-in closable/reorderable. Navigation tabs use `NavigationBar` (bottom) or `NavigationRail` (side).

### React Native

**createBottomTabNavigator** / **createMaterialTopTabNavigator** (react-navigation): Navigation tabs. Lazy rendering -- screens mount on first focus. `react-native-tab-view` provides gesture-based swipeable tabs with pager. No built-in document tabs.

### Web Platform

No native tab component (though `<role="tablist">` + `<role="tab">` + `<role="tabpanel">` provides ARIA semantics). Every framework implements its own. Key patterns from ARIA APG:
- Arrow keys navigate between tabs
- Home/End jump to first/last tab
- Tab key moves focus into the tab panel content
- Automatic vs manual activation (focus vs Enter to switch)

### Terminal TUI Frameworks

**Ratatui**: Has a `Tabs` widget for rendering tab headers. Purely visual -- no built-in tab panel management, focus switching, or close buttons. Developers wire up state manually.

**Textual**: Has a `Tabs` widget with `TabbedContent` container. Tabs can be docked to edges via CSS. Supports adding tabs dynamically. No built-in reordering or close buttons.

**Bubbletea**: Example `tabs` in the repo shows manual tab implementation -- model tracks active tab index, View renders tab headers and switches content. Everything manual.

**Blessed**: No built-in tab widget. Implemented manually or via community extensions.

**Key insight for TUIs**: Tab headers are easy. The hard parts are: (a) content management (lazy mounting, state preservation), (b) overflow handling, (c) close/reorder interactions, and (d) keyboard navigation between tabs and tab content. No TUI framework provides all of these out of the box.

---

## 3. Sidebar / Navigation

### VS Code / Electron

The workbench has **three** sidebar-like areas:
1. **Activity Bar** (far left): Icon strip for switching between views (Explorer, Search, Source Control, Extensions, etc.). Two sizes: default and compact.
2. **Primary Sidebar** (left): Shows the active view's content. Collapsible.
3. **Auxiliary Bar / Secondary Sidebar** (right): Additional views. Collapsible.

Views can be dragged between sidebars and the panel area. The Activity Bar can be moved to the top or hidden entirely.

**Key insight**: VS Code separates the *navigation* (Activity Bar icons) from the *content* (Sidebar views). This allows the Activity Bar to be repositioned independently.

### SwiftUI

`NavigationSplitView` provides the sidebar pattern natively. On macOS, the sidebar has a translucent material background and a standard list style. On compact widths, it collapses to a stack.

The sidebar column is special -- it gets platform-native styling (translucent on macOS, sheet on iOS) without developer intervention.

### GTK4 / Libadwaita

`AdwNavigationSplitView` handles sidebar + content with automatic collapse. `AdwSidebar` is a companion widget that transforms into different presentations when the split view collapses. `AdwViewSwitcherSidebar` provides mode switching between sidebar items.

### Flutter

**Drawer** (Material): Slide-out sidebar for navigation, typically on mobile. **NavigationRail** (Material): Persistent narrow sidebar with icons, for tablet/desktop. Developers manually switch between Drawer (narrow) and NavigationRail + content (wide) at breakpoints.

### Compose Multiplatform

**NavigationRail**: Side navigation for tablets/desktop. **NavigationDrawer**: Modal or permanent drawer. Adaptive selection typically done via `WindowSizeClass` checks.

### React Native

**DrawerNavigator** (react-navigation): Swipeable sidebar drawer. No built-in persistent sidebar for tablets -- developers conditionally render drawer vs side-by-side at breakpoints.

### Terminal TUI Frameworks

TUI apps commonly implement sidebars as a fixed-width left pane in a horizontal layout. Examples:
- File tree (left) + editor (right) -- like `helix`, `lazygit`
- List (left) + detail (right) -- the classic master-detail

No TUI framework provides a sidebar-specific component. It's always a layout primitive (fixed-width box on the left).

**Collapsible sidebars** in TUIs are typically toggled with a keybinding (e.g., `Ctrl+B` in many editors) -- the sidebar is either fully visible or fully hidden. Animated slide-in/out is rare in terminals.

---

## 4. Inspector / Detail Panels

### SwiftUI

The `.inspector()` modifier adds a trailing column to a view. When applied to a `NavigationSplitView`'s detail column, the detail shrinks to accommodate the inspector. The system controls width automatically. Toggleable via `isPresented` binding.

**Key insight**: The inspector is a *modifier* on existing views, not a separate container. This makes it compositional -- any view can have an inspector.

### VS Code / Electron

The **Auxiliary Bar** (secondary sidebar on the right) serves as the inspector area. It hosts view containers like Outline, Timeline, and extension-contributed views. Toggled via `workbench.action.toggleAuxiliaryBar`.

On narrow widths, VS Code doesn't auto-collapse the auxiliary bar -- the user must toggle it manually. The workbench trusts the user to manage space.

### GTK4 / Libadwaita

No dedicated inspector widget. Developers use `AdwOverlaySplitView` with the sidebar on the right, or a simple `GtkPaned` with the detail pane on the right.

### Flutter / Compose / React Native

No built-in inspector component. Implemented as a conditional right-side pane in the layout, shown/hidden based on state and available width.

### Terminal TUI Frameworks

Inspector/detail panels in TUIs are typically a right-side pane showing details of the selected item. Lazygit's diff view, Atuin's command detail view, k9s's resource detail -- all manually implemented as split layouts.

**Key insight**: The inspector pattern is essentially "conditional right pane." Only SwiftUI has made it a first-class concept (`.inspector()` modifier). Everyone else implements it as layout logic.

---

## 5. Focus Management

This is the hardest cross-platform problem. Every framework has a different model.

### Flutter (Most Comprehensive)

Flutter has the most fully realized focus system:

**Focus Tree**: A sparse mirror of the widget tree. `FocusNode` objects are long-lived (persist across rebuilds). The tree has `FocusNode` (leaf) and `FocusScopeNode` (group) nodes.

**Focus Scopes** (`FocusScopeNode` / `FocusScope` widget):
- Group focus nodes into navigable subtrees
- Track currently focused node within the scope
- Maintain focus history for **restoration** -- when a scope regains focus, it restores to the previously focused child
- Limit traversal to within the scope (unless explicitly focused outside)

**Focus Traversal**:
- `ReadingOrderTraversalPolicy` (default): Spatial positioning + reading order
- `OrderedTraversalPolicy`: Explicit numeric or lexical ordering
- `FocusTraversalGroup` widget groups items for traversal and applies custom ordering
- Directional navigation: `FocusNode.focusInDirection(TraversalDirection.down)` for spatial arrow-key navigation

**Focus Restoration**: `FocusScopeNode` remembers the last focused child. When focus returns to the scope, it restores to that child. `unfocus(disposition: UnfocusDisposition.previouslyFocusedChild)` explicitly triggers restoration.

**Key API**:
- `canRequestFocus`: Whether a node can receive focus
- `skipTraversal`: Skip in tab order but still focusable programmatically
- `descendantsAreFocusable`: Block entire subtree from receiving focus
- `autofocus`: Request focus on first scope activation

**Key insight**: Flutter's focus system is the gold standard for cross-platform focus management. The tree structure, scope-based grouping, traversal policies, and restoration history cover essentially every use case.

### SwiftUI

**@FocusState**: Property wrapper for tracking focus. Boolean for single-field, enum for multi-field.

**focusScope(_:)**: Creates a focus scope limiting default focus preferences within a view subset.

**focusable()** modifier: Makes arbitrary views keyboard-focusable (since iPadOS 17).

**prefersDefaultFocus**: Declares which view should receive focus first within a scope.

Focus is more implicit than Flutter -- SwiftUI manages the focus tree automatically based on view hierarchy and modifiers.

**Limitation**: No built-in spatial navigation API. Arrow-key navigation between arbitrary views requires manual implementation. Tab navigation works automatically for standard controls.

### Compose Multiplatform

**FocusRequester**: Programmatic focus requests via `requestFocus()`.

**focusGroup()**: Groups composables for sequential navigation (all items in group get focus before moving on).

**focusProperties**: Controls entry/exit behavior with directional overrides:
```kotlin
Modifier.focusProperties {
    exit = { direction ->
        when (direction) {
            Right -> Cancel  // Trap focus
            Down -> otherComposable  // Redirect
            else -> Default
        }
    }
}
```

**Focus capture**: `captureFocus()` / `freeFocus()` for trapping focus (e.g., validation).

**LocalFocusManager**: `moveFocus(FocusDirection.Next/Previous/Up/Down/Left/Right)` for spatial navigation.

**Key insight**: Compose's focus system is powerful but lower-level than Flutter's. The `focusProperties` exit/enter hooks are particularly expressive -- you can implement complex focus routing declaratively.

### Web Platform

**Tab navigation**: Built into the platform via `tabindex`. Sequential focus order.

**Spatial navigation**: The `focusgroup` attribute (proposed, in development) standardizes arrow-key navigation:
- `focusgroup="inline"`: Left/right arrows only
- `focusgroup="block"`: Up/down arrows only
- `focusgroup="grid"`: 2D navigation
- **Focus memory**: Re-entering a focusgroup restores to last-focused item
- **Wrapping**: `wrap`, `flow` options for cycling at boundaries
- **Grid navigation**: `grid`, `manual-grid` for 2D grids with `grid-row` and `grid-cell`

**Focus trapping**: `<dialog>` with `showModal()` traps focus and makes outside content `inert`. Popovers (via `popover` attribute) do NOT trap focus.

**inert attribute**: Makes an element and all descendants non-interactive and unfocusable.

**Key insight**: The web is finally getting declarative focus group navigation with the `focusgroup` proposal. The design is excellent -- memory, wrapping, grid, and directional constraints. Worth studying for any focus system design.

### GTK4

`GtkPaned` has `cycle-handle-focus` and `toggle-handle-focus` signals for keyboard resize. F8 cycles focus between children and the handle. Standard GTK focus follows the widget tree with Tab/Shift+Tab.

### React Native

Focus management is platform-dependent. On iOS, relies on UIKit's focus system (VoiceOver-driven). On Android, relies on Android's accessibility focus. On TV platforms (tvOS, Android TV), uses spatial navigation. The `focusable` prop exists but behavior varies by platform. Libraries like `react-native-tvos` provide spatial navigation for TV.

**Pain point**: No unified cross-platform focus model. TV focus works differently from mobile focus works differently from web focus.

### Terminal TUI Frameworks

**Textual**: `focus_next()` / `focus_previous()` with optional CSS selector filtering. `can_focus` property on widgets. Focus follows a flat linear order with CSS selector scoping. No spatial navigation.

**Ratatui + rat-focus**: `FocusFlag` on each widget state. `FocusBuilder` collects widgets into an ordered list. `Focus` object provides `next`, `prev`, `focus_at`. Tab/BackTab for sequential navigation. Mouse clicks set focus on widget area. No spatial navigation.

**Bubbletea**: No built-in focus system. Developers track focus state in the model and route key events manually. `BubbleZone` provides mouse-based focus zones by wrapping components in zero-width identifiers and tracking their screen positions.

**Blessed**: `sendFocus` for focus events. Supports hover and focus styles. No structured focus tree or traversal system.

**Key insight for TUIs**: Focus management in TUI frameworks is primitive. Most provide linear Tab/Shift+Tab traversal at best. Spatial navigation (arrow keys between components) is universally absent. This is a major opportunity for silvery -- Flutter's focus tree model adapted for terminals would be genuinely novel.

---

## 6. Command Palettes / Search Bars

### VS Code / Electron

Two variants sharing the same UI component:
- **Command Palette** (Ctrl+Shift+P): Commands with `>` prefix. Sorted alphabetically (not by relevance) to keep the list stable and memorable. Recent commands shown at top.
- **Quick Open** (Ctrl+P): File search. Fuzzy matching against file/symbol names.

Architecture: `QuickPick` is a generic UI component. Extensions register commands via contribution points. The `QuickPick` API supports single selection, multi-selection, and freeform text input. Events fire for filter text changes, active item changes, and acceptance.

**Fuzzy matching**: Matches non-consecutive characters. "odks" matches "Open Default Keyboard Shortcuts". Scoring ranks results by match quality.

**Key insight**: VS Code separates the *UI component* (QuickPick) from the *command registry*. Extensions contribute commands; the palette is just a filtered view. The same QuickPick component powers file search, symbol search, and settings search -- just with different providers.

### Textual (Python)

Built-in command palette (Ctrl+P) with the most complete TUI implementation:

**Provider architecture**: `command.Provider` subclass with async lifecycle:
- `startup()`: Called when palette opens (e.g., scan files)
- `search(query)`: Yields `Hit` objects with scores
- `discover()`: Yields `DiscoveryHit` for empty-query suggestions
- `shutdown()`: Cleanup

**Fuzzy matching**: Built-in `matcher` object. Score of 0 = no match, 1 = exact match, between = partial. Provides `highlight()` for visual feedback.

**Screen-specific commands**: Screens can define their own `COMMANDS`, active only when that screen is displayed.

**Error isolation**: Provider errors don't crash the palette -- they're logged to the developer console.

**Key insight**: Textual's command palette is the most complete TUI implementation. The async provider architecture, screen-specific commands, and error isolation are all worth emulating. The `discover()` method for showing suggestions on empty input is a nice touch.

### Other Frameworks

No other framework has a built-in command palette:
- **SwiftUI**: Uses the native menu system + Cmd+Shift+P for Help menu search (macOS only)
- **Flutter / Compose / React Native**: Must be built from scratch
- **GTK4**: No built-in command palette
- **Ratatui / Bubbletea / Blessed**: No built-in command palette

The command palette is essentially a VS Code innovation that has become a UX standard. Everyone expects it, but only Textual has built it into a TUI framework.

---

## 7. Status Bars / Toolbars

### VS Code / Electron

**Status Bar** (bottom): Fixed strip with left-aligned and right-aligned items. Items contributed by extensions via `StatusBarItem` API. Items can be clickable (triggering commands), show menus, or display text/icons.

The status bar shows contextual information: current language, encoding, line/column, git branch, errors/warnings count.

### SwiftUI

**toolbar** modifier: Adds items to the toolbar area. Placement options: `.navigation`, `.primaryAction`, `.secondaryAction`, `.status`, `.bottomBar`, `.keyboard`. Platform-adaptive -- toolbar items render differently on macOS (titlebar), iOS (navigation bar), watchOS, etc.

### Flutter

**AppBar** / **SliverAppBar**: Top bar with title, actions, leading widget. **BottomAppBar**: Bottom bar with optional FAB notch. Material 3's top app bar types: center-aligned, small, medium, large.

### GTK4

**GtkHeaderBar**: Combined title bar + toolbar. Replaces the system title bar on Linux. Children placed at start or end. Integrates with GNOME's design guidelines.

### Compose Multiplatform

**TopAppBar** (small, center-aligned, medium, large), **BottomAppBar**: Material 3 app bars. Desktop variants inherit Compose for Desktop's window chrome integration.

### Terminal TUI Frameworks

**Textual**: Header and Footer widgets that dock to top/bottom via CSS. `Header` shows app title, `Footer` shows key bindings.

**Ratatui**: rat-widget provides a `StatusBar` widget. Otherwise, developers render text in a fixed-height bottom area.

**Bubbletea**: Manually rendered as the last line(s) of the View output.

**Blessed**: No built-in status bar. Implemented as a box docked to the bottom.

**Key insight**: Status bars are universally present but architecturally boring -- they're just a fixed strip with contributed items. The interesting design decision is how items are contributed (API vs declarative vs manual) and how they're positioned (left vs right vs center zones).

---

## 8. Menus

### SwiftUI

**CommandGroup** and **CommandMenu**: Declarative menu bar modification. `CommandGroup(before: .saveItem)` inserts before system items. `CommandGroup(replacing: .undoRedo)` replaces system items.

**keyboardShortcut** modifier: Attaches keyboard shortcuts to any SwiftUI control. `keyboardShortcut("s", modifiers: [.command])`.

**contextMenu** modifier: Right-click / long-press menus on any view.

**Key insight**: SwiftUI's declarative command system -- where you modify system-provided menus with before/after/replacing -- is elegant. You don't build the entire menu from scratch; you compose with the platform's defaults.

### VS Code / Electron

Extension-contributed menus via contribution points in `package.json`. Menus include: editor context menu, explorer context menu, editor title, status bar, command palette. Each menu item specifies a command, group (for separator placement), and optional `when` clause for conditional visibility.

Electron provides native menus via `Menu` and `MenuItem` classes, but VS Code overlays its own HTML-based menus for consistency and extensibility.

### GTK4

**GtkMenuButton** + **GMenu**: Model-based menus. The menu structure is defined as a data model (`GMenu`), and the UI is generated from it. Actions connect menus to behavior. This model/view separation allows the same menu definition to render as a menu bar, popover menu, or context menu.

### Flutter

**PopupMenuButton**: Material popup menu. **MenuBar** (Material 3): Desktop-style menu bar with keyboard navigation. **DropdownMenu** (Material 3): Dropdown with search.

### Web Platform

**`<menu>` element**: Largely unused / deprecated for context menus. Context menus in web apps are custom HTML overlays positioned with CSS anchor positioning or manual calculation.

**Popover API**: `popover` attribute provides top-layer rendering, light-dismiss behavior, and declarative open/close. Combined with CSS anchor positioning, enables positioned menus without JavaScript positioning logic.

### Terminal TUI Frameworks

**Ratatui**: rat-widget provides `MenuBar` + sub-menus with built-in focus handling.

**Textual**: No built-in menu bar. Context menus not available (no right-click semantics in terminals without mouse mode).

**Bubbletea**: No built-in menu system. Developers render menu items as styled text and handle selection manually.

**Key insight for TUIs**: Terminal menus face a fundamental challenge -- right-click context menus require mouse mode, and menu bars consume precious vertical space. Most TUI apps prefer command palettes over menu bars. When menus are needed, they're typically modal overlays (like vim's command-line mode or lazygit's action menus).

---

## 9. Window Management

### SwiftUI

**Scene types**: `WindowGroup` (data-driven windows), `Window` (single unique window), `DocumentGroup` (document-based), `Settings` (macOS settings), `MenuBarExtra` (menu bar icon).

**Multi-window**: `openWindow(value:)` opens windows bound to data values. SwiftUI ensures one-window-per-value -- opening for the same value brings the existing window forward.

**Window tabbing**: macOS `WindowGroup` windows can be merged into native tabs (Cmd+T).

**Key insight**: SwiftUI's data-bound windows (one window per unique data value) prevent duplicate windows for the same content. This is an elegant solution to the "don't open the same file twice" problem.

### Electron

Each `BrowserWindow` runs its own renderer process. Multi-window apps use a Set (not array) to track windows. Window state persistence (size, position, maximized state) via `electron-window-state` or similar libraries that save to JSON on close events and restore on creation.

**Key insight**: Electron's process-per-window model provides isolation but at high memory cost. Window state persistence is not built in -- it requires third-party libraries.

### Flutter

Multi-window support varies by platform. On desktop (Windows, macOS, Linux), Flutter supports multiple windows via platform channels. On mobile, it's single-window. No unified multi-window API.

### GTK4

`GtkApplicationWindow` instances managed by `GtkApplication`. The application tracks all windows and handles lifecycle. Session state persistence via `GtkWindowGroup`.

### Terminal TUI Frameworks

Multi-window doesn't exist in TUI frameworks in the native sense. The terminal is one "window." Approaches:
- **tmux**: Multiple "windows" (full-screen views) in a session, switched with `Ctrl+B n/p/number`
- **Textual**: Multiple `Screen` objects that can be pushed/popped as a modal stack
- **Blessed**: Multiple `Screen` objects (one per terminal), but typically one screen

**Key insight**: TUI apps have a single canvas. What other frameworks call "windows" maps to either screens/views (modal stack) or tabs in TUI land. The concept of floating, overlapping windows doesn't translate well to terminals (though some TUI apps like `mc` simulate it with bordered overlays).

---

## 10. Key Takeaways for Silvery

### The Big Gaps in TUI Frameworks

1. **No structured focus management**: Every TUI framework has at most linear Tab/Shift+Tab traversal. None have Flutter-style focus trees, focus scopes, traversal policies, or focus restoration. This is the single biggest architectural gap.

2. **No interactive resizable splits**: tmux has it, but no TUI *framework* provides it as a component. Developers hardcode ratios or re-implement resize handling.

3. **No document tabs**: Tab headers exist (ratatui, textual) but the full document-tab experience (closable, reorderable, dirty state, overflow handling, lazy content management) doesn't exist as a component.

4. **No command palette** (except Textual): VS Code made it a standard UX pattern. Only Textual has built it into a TUI framework.

5. **No menu system** (except ratatui's rat-widget): Menu bars and context menus are rare in TUI frameworks.

### Design Patterns Worth Adopting

1. **VS Code's SerializableGrid**: One unified grid for the entire workbench. Sidebar, editor, panel -- all the same mechanism. Serializable for persistence. This is more flexible than SwiftUI's opinionated 2/3-column splits.

2. **Flutter's Focus Tree**: FocusNode + FocusScopeNode with traversal policies and restoration history. The most complete focus system across any framework. The `focusgroup` web proposal is also excellent -- its memory, wrapping, and grid support cover additional edge cases.

3. **Textual's Command Palette Architecture**: Async providers with startup/search/discover/shutdown lifecycle. Screen-specific commands. Error isolation. Fuzzy matching with scoring and highlighting.

4. **SwiftUI's Adaptive Collapse**: NavigationSplitView automatically transforms between side-by-side and push/pop based on available width. This pattern translates to terminals -- a sidebar could collapse into a modal overlay on narrow terminals.

5. **Compose's Focus Properties**: The `exit`/`enter` hooks for directional focus routing are elegant. You can declaratively say "when focus exits right, go to this other component" or "when focus exits right, trap it."

6. **GTK's Model-Based Menus**: Defining menus as data (GMenu) and rendering them in different presentations (bar, popover, context) from the same model. Good separation of concerns.

7. **Web Focusgroup's Grid Navigation**: 2D arrow-key navigation with row-wrap, col-wrap, row-flow, col-flow options. Essential for any grid-like UI (kanban boards, file grids, settings panels).

### Architectural Recommendations

**Focus System**: Build a focus tree (like Flutter) with scopes (like Flutter/web focusgroup) and directional navigation (like Compose focusProperties + web focusgroup grid). This would be genuinely novel for TUI frameworks. Key features:
- Focus scopes for grouping (panels, dialogs, sidebars)
- Focus restoration within scopes (re-entering a panel restores to last-focused item)
- Directional traversal policies (reading order, explicit order, spatial)
- Focus trapping for modals/dialogs
- `inert` equivalent for non-interactive regions

**Split/Pane System**: A resizable split component with:
- Horizontal and vertical orientation
- Constraint-based sizing (min, max, ratio, fixed)
- Keyboard resize (arrow keys when handle focused)
- Collapse/snap to zero
- Nestable for binary-tree splits (VS Code-style)
- Serializable state for persistence

**Tab System**: A complete document-tab component with:
- Closable tabs with dirty state
- Keyboard navigation (Ctrl+Tab, Ctrl+W)
- Overflow handling (scroll or dropdown)
- Lazy content mounting
- Tab-to-panel-content focus transition (Tab key enters content, Escape returns to tabs)

**Command Palette**: Textual's architecture is the template:
- Provider-based command sources
- Async search with fuzzy matching and scoring
- Screen/context-specific providers
- Discovery mode for empty input
- Error isolation

---

## Sources

### VS Code / Electron
- [VS Code Custom Layout](https://code.visualstudio.com/docs/configure/custom-layout)
- [VS Code Extending Workbench](https://code.visualstudio.com/api/extension-capabilities/extending-workbench)
- [VS Code User Interface](https://code.visualstudio.com/docs/getstarted/userinterface)
- [VS Code Layout System - DeepWiki](https://deepwiki.com/microsoft/vscode/3.2-editor-features-and-contributions)
- [VS Code Workbench Layer](https://microsoft-vscode-15.mintlify.app/architecture/workbench-layer)
- [VS Code Quick Picks API](https://code.visualstudio.com/api/ux-guidelines/quick-picks)

### SwiftUI / Apple
- [NavigationSplitView Documentation](https://developer.apple.com/documentation/swiftui/navigationsplitview)
- [Mastering NavigationSplitView](https://swiftwithmajid.com/2022/10/18/mastering-navigationsplitview-in-swiftui/)
- [SwiftUI Focus Management](https://swiftwithmajid.com/2020/12/02/focus-management-in-swiftui/)
- [focusScope Documentation](https://developer.apple.com/documentation/swiftui/view/focusscope(_:))
- [SwiftUI Cookbook for Focus - WWDC23](https://developer.apple.com/videos/play/wwdc2023/10162/)
- [SwiftUI Commands](https://swiftwithmajid.com/2020/11/24/commands-in-swiftui/)
- [SwiftUI Keyboard Shortcuts](https://sarunw.com/posts/swiftui-keyboard-shortcuts/)
- [WindowGroup Documentation](https://developer.apple.com/documentation/swiftui/windowgroup)
- [Window Management in SwiftUI](https://swiftwithmajid.com/2022/11/02/window-management-in-swiftui/)

### Flutter
- [Flutter Responsive Split View](https://codewithandrea.com/articles/flutter-responsive-layouts-split-view-drawer-navigation/)
- [Flutter Tabs Cookbook](https://docs.flutter.dev/cookbook/design/tabs)
- [Flutter Focus System](https://docs.flutter.dev/ui/interactivity/focus)
- [FocusScope Class](https://api.flutter.dev/flutter/widgets/FocusScope-class.html)

### GTK4 / Libadwaita
- [GtkPaned Documentation](https://docs.gtk.org/gtk4/class.Paned.html)
- [Libadwaita Adaptive Layouts](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/1.5/adaptive-layouts.html)
- [AdwOverlaySplitView](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/1.4/class.OverlaySplitView.html)
- [AdwNavigationSplitView](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/class.NavigationSplitView.html)

### Compose Multiplatform
- [Compose Desktop Components](https://www.jetbrains.com/help/kotlin-multiplatform-dev/compose-desktop-components.html)
- [Adaptive Layouts in Compose Multiplatform](https://touchlab.co/adaptive-layouts-cmp)
- [Compose Tab Navigation Tutorial](https://github.com/JetBrains/compose-multiplatform/blob/master/tutorials/Tab_Navigation/README.md)
- [Compose Adaptive Layouts](https://developer.android.com/develop/ui/compose/build-adaptive-apps)
- [ListDetailPaneScaffold](https://developer.android.com/develop/ui/compose/layouts/adaptive/list-detail)
- [Change Focus Behavior in Compose](https://developer.android.com/develop/ui/compose/touch-input/focus/change-focus-behavior)

### React Native
- [React Native Tab View](https://reactnavigation.org/docs/tab-view/)
- [Bottom Tab Navigator](https://reactnavigation.org/docs/bottom-tab-navigator/)
- [SplitView - React Native Navigation](https://wix.github.io/react-native-navigation/api/layout-splitView/)
- [Managing Focus in React Native](https://dev.to/amazonappdev/5-ways-of-managing-focus-in-react-native-3kfd)

### Web Platform
- [Focusgroup Explainer - Open UI](https://open-ui.org/components/focusgroup.explainer/)
- [W3C Keyboard Interface Practices](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
- [WICG Spatial Navigation](https://github.com/WICG/spatial-navigation)
- [Chrome Focusgroup RFC](https://developer.chrome.com/blog/focusgroup-rfc)
- [Popover and Dialog - web.dev](https://web.dev/learn/css/popover-and-dialog)
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)
- [allotment](https://github.com/johnwalley/allotment)

### Terminal TUI Frameworks
- [Ratatui Layout](https://ratatui.rs/concepts/layout/)
- [Ratatui Popup Example](https://ratatui.rs/examples/apps/popup/)
- [rat-focus](https://crates.io/crates/rat-focus)
- [rat-widget](https://github.com/thscharler/rat-widget)
- [Textual Layout Guide](https://textual.textualize.io/guide/layout/)
- [Textual Command Palette](https://textual.textualize.io/guide/command_palette/)
- [Textual Tabs Widget](https://textual.textualize.io/widgets/tabs/)
- [Bubbletea GitHub](https://github.com/charmbracelet/bubbletea)
- [BubbleZone](https://github.com/lrstanley/bubblezone)
- [Tips for Building Bubble Tea Programs](https://leg100.github.io/en/posts/building-bubbletea-programs/)
- [Blessed GitHub](https://github.com/chjj/blessed)
- [stmux](https://github.com/rse/stmux)
- [tmux Cheat Sheet](https://tmuxcheatsheet.com/)
