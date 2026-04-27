# Component parity plan — silvercode vs opencode + silvery vs OpenTUI

**Status**: 2026-04-26 — research/plan output of bead `km-silvercode.acp-components`. This is a **plan**, not implementation. Implementation is split across follow-up beads (Section C).

**Source of the punch list**: [10-agent-router-landscape.md § Component reconciliation — opencode and OpenTUI](10-agent-router-landscape.md#component-reconciliation--opencode-and-opentui).

**Method**: walked every existing silvercode component and every existing silvery primitive, mapped each punch-list item to a row in two tables, scored by priority + estimated LOC, then grouped the gaps into bead-sized clusters.

---

## Snapshot — what exists today

**silvercode** ships **21 components** (~4,000 LOC total) at `apps/silvercode/src/components/*.tsx`:

- Chat surface: `MessageList`, `AssistantBlock`, `UserMessageBlock`, `ToolCallBlock`, `ToolResultBlock`, `Welcome`, `MarkdownView`, `LinkifiedText`, `SyntaxHighlighter`, `DiffRenderer`, `ActivityIndicator`
- Input + dialogs: `CommandBox`, `SlashCommandPalette`, `HistoryDialog`, `PermissionInbox`, `Notifications`
- Workspace shell: `PaneGrid` (770 LOC, the heaviest), `SessionCard`, `SidePanel` (812 LOC), `PaneHeader`, `BackgroundPane`

**silvery** (the framework) ships ~50 components across `vendor/silvery/packages/ag-react/src/{components,ui/components,ui/input,ui/display,ui/react,ui/animation,ui/progress,ui/wrappers}/`:

- Layout & core: `Box`, `Fill`, `Spacer`, `Static`, `Newline`, `Transform`, `Text`, `Link`, `Popover`
- Form & input: `TextInput`, `TextArea`, `Select`, `useReadline`, `useTextArea`, `Toggle`
- Pickers & lists: `SelectList`, `ListView`, `PickerList`, `PickerDialog`, `CommandPalette`, `SearchBar`, `HorizontalVirtualList`, `TreeView`
- Surfaces: `ModalDialog`, `Backdrop`, `Toast`, `Alert`, `InlineAlert`, `Banner`, `Tooltip`, `Breadcrumb`
- Feedback: `Spinner`, `ProgressBar`, `Skeleton`, `Tasks`, `Heading`, `Badge`, `Button`, `Divider`
- Data: `Table` (×2, components/ + display/), `Prose`, `Form`, `GridCell`, `Tabs`, `SplitView`, `CursorLine`, `Image`
- Animation: `useAnimation`, `useInterval`, `useTimeout`, `useTransition`, `easing`
- Theming & infra: `ThemeProvider`, `ReactiveThemeProvider`, `ScopeProvider`, `Screen`, `ErrorBoundary`, `Console`, `Typography`, `EditContextDisplay`

**Net gap**: punch list calls for **~30 silvercode components** + **~15 silvery primitives** beyond what exists. Most are 10-50 LOC because the silvery primitives are already there.

---

## A. silvery framework primitives (parity with OpenTUI)

Components silvery should add. These are cross-app — useful for km, silvercode, future demos. Path column lists where it would land (`vendor/silvery/packages/ag-react/src/ui/components/<Name>.tsx` unless noted).

| Primitive | Exists in silvery? | Maps to silvercode use case | Priority | Est. LOC |
|---|---|---|---|---|
| `<Diff>` | No (silvercode has `DiffRenderer.tsx` ad-hoc; silvery has nothing) | Edit/Write/MultiEdit tool diffs; `<ApplyPatchFile>` | **P1** | 200-300 (extract from silvercode `DiffRenderer.tsx` + generalize to side-by-side mode) |
| `<Code>` (tree-sitter) | No (silvercode has `SyntaxHighlighter.tsx` keyword-based stub) | Code blocks in markdown, tool args, results | **P1** | 400-600 (tree-sitter pipeline + WASM grammar bundling) — biggest single primitive |
| `<TextArea>` (production) | **Yes** — `ag-react/src/ui/components/TextArea.tsx` + `useTextArea.ts` | Multi-line composer in `CommandBox` (already used) | — | already shipped |
| `<LineNumber>` gutter | No | Code blocks, diffs, line-comment annotations | **P2** | 50-80 |
| `<Link>` (OSC-8) | **Yes** — `ag-react/src/components/Link.tsx` (used by `LinkifiedText`) | Hyperlinks in markdown, tool output, file paths | — | verify OSC-8 path; ~20 LOC if missing |
| `<ASCIIFont>` | No | Welcome banner brand moment, `silvery showcase` demo | P3 | 100-150 (figlet bundle + renderer) |
| `<Slider>` | No | Settings panels (font size, line height, model temperature) | P3 | 80-120 |
| `<TabSelect>` (segmented) | Partial — silvery has `Tabs.tsx` (full panel switcher); a thinner segmented-control primitive is missing | Settings panel groups, mode switcher | P2 | 60-100 (or extend `Tabs`) |
| `<Timeline>` + post-FX | No | Streaming-text effects, tool morph animations, brand moments | P3 | 300-500 (timeline primitive + filter layer) |
| `TimeToFirstDraw` instr. | No (silvery has `SILVERY_INSTRUMENT` envvar but no first-draw component) | Perf budget enforcement, dashboard | P2 | 80-120 |
| `<Accordion>` / `<Collapsible>` | No (silvercode `ToolCallBlock` rolls its own; silvery has `Popover` but no disclosure primitive) | Tool blocks, settings sections, sidebar groups | **P1** | 150-200 |
| `<StickyAccordionHeader>` | No | Long-scroll session history with tool group headers staying pinned | P3 | 80-120 (compose `Accordion` + sticky scroll layer) |
| `<Tooltip>` | **Yes** — `ag-react/src/ui/components/Tooltip.tsx` | Help text on hover (titlebar status, sidebar items) | — | shipped |
| `<Popover>` | **Yes** — `ag-react/src/components/Popover.tsx` | Status popovers, mode hints, model tooltips | — | shipped |
| `<HoverCard>` | No (Popover exists; HoverCard is "lazy popover with delay") | Contextual previews on file/link hover | P3 | 40-60 (compose `Popover` + delay) |
| `<DropdownMenu>` | No (silvery has `PickerDialog`/`CommandPalette` but no anchored menu) | Right-click menus on session tabs, file tabs | P2 | 120-180 |
| `<ContextMenu>` | No | Right-click menu on chat messages, file tabs | P2 | 80-120 (compose `DropdownMenu` + position-at-cursor) |
| `<ProgressCircle>` | No (silvery has `<ProgressBar>`) | Tool progress, model thinking spinner alternative | P3 | 60-100 |
| `<Tag>` / Pill | No (silvery has `<Badge>` — close enough to evaluate, may just rename/alias) | Mode pills, file-type tags, tool kind labels | P2 | 30-50 (likely just an alias of Badge with prop tweaks) |
| `<Switch>` | Partial — silvery has `<Toggle>` (functionally a switch but visually different) | Settings panels (boolean prefs) | P3 | 30-50 (alias `Toggle` or theme variant) |
| `<RadioGroup>` | No | Settings panels (mode, theme, model picker) | P2 | 80-120 |
| `<TextShimmer>` | No | Streaming assistant text effect | P3 | 60-100 |
| `<TextReveal>` | No | Mid-stream reveal animation | P3 | 60-100 |
| `<Typewriter>` | No | Welcome message, demo brand moment | P4 | 60-100 |
| `<AnimatedNumber>` | No | Token counter, tool count summary (rolling digits) | P2 | 80-120 |
| Theme JSON system | Partial — silvery has `<ThemeProvider>`/`<ReactiveThemeProvider>` with semantic tokens, but no published JSON Schema or community-theme bundle | Settings → Theme picker; brand differentiation | **P1** | 200-300 (schema + loader + 5-10 starter themes; community PRs bring 30+ later) |
| Plugin/slot registry | Partial — silvery has `apply()` chain ([app-composition.md](../../design/v10-terminal/app-composition.md)) but no named-slot registry exposed at framework level | Sidebar/titlebar/dock injection points for downstream apps | P2 | 200-300 |
| Tree-sitter pipeline pkg | No | Powers `<Code>`; Markdown code-fence highlighting | **P1** | bundled with `<Code>` above; counts once |

**Summary — silvery primitives**:
- **P1 (3)**: `<Diff>`, `<Code>`+tree-sitter, `<Accordion>`/`<Collapsible>`, theme JSON system → **~1,000-1,500 LOC**
- **P2 (8)**: `<LineNumber>`, `<TabSelect>`, `<TimeToFirstDraw>`, `<DropdownMenu>`, `<ContextMenu>`, `<Tag>`, `<RadioGroup>`, `<AnimatedNumber>`, plugin/slot registry → **~700-1,000 LOC**
- **P3 (8)**: `<ASCIIFont>`, `<Slider>`, `<Timeline>`+postFX, `<StickyAccordionHeader>`, `<HoverCard>`, `<ProgressCircle>`, `<Switch>` (alias), `<TextShimmer>`, `<TextReveal>` → **~700-1,200 LOC**
- **P4 (1)**: `<Typewriter>` → ~100 LOC

Total silvery effort: **~2,500-3,800 LOC** across ~20 primitives. P1 + P2 alone delivers 80% of parity-critical surface.

---

## B. silvercode-specific components (parity with opencode chat UI)

Components silvercode itself owns. Path column shows current state: `apps/silvercode/src/components/<Name>.tsx` if it exists, "(new)" if not.

### B.1 — Session-turn anatomy

| Component | Exists? | Should render | ACP/capability mapping | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|---|
| `<SessionTurn>` | No (closest: `MessageList` row layout) | Top-level turn container with retry/reveal animation, sub-agent nesting | Wraps `SessionUpdate` items grouped by turn boundary | **new** | **P1** | 200-300 |
| `<MessageDivider>` | No | Between-turn horizontal rule with optional label | n/a (visual) | **new** | P2 | 30-50 |
| `<SessionRetry>` | No | Inline retry-on-error widget below a failed turn | Adapter: re-emit user prompt | **new** | P2 | 80-120 |
| `<AgentPart>` | No | Nested turn-within-turn (sub-agent spawn) | Maps to ACP `Task` tool result with sub-stream | **new** | P3 | 150-250 |

### B.2 — Tool rendering

| Component | Exists? | Should render | ACP/capability mapping | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|---|
| `<BasicTool>` / `<GenericTool>` | Partial — `ToolCallBlock.tsx` (143 LOC, basic collapse) | Animated collapsible header+body card; status morph | `SessionUpdate.tool_call` + `tool_call_update` | **extend** `ToolCallBlock` | **P1** | +150-250 over existing |
| `<ToolStatusTitle>` | No | Animated title morph "Reading file…" → "Read 3 files" | Driven by `tool_call.status` transitions | **new** (uses silvery `<AnimatedNumber>` + `<TextReveal>`) | P2 | 80-120 |
| `<ToolCountSummary>` | No | Rolling-digit aggregate "Read **12** files" with breakdown popover | Aggregates over the session's `tool_call`s | **new** (uses `<AnimatedNumber>` + `<Popover>`) | P3 | 100-150 |
| `<ToolCountLabel>` | No | Single label with count "**3** files read" | Component of `<ToolCountSummary>` | **new** | P3 | 30-50 |
| `<ToolErrorCard>` | Partial — `ToolResultBlock.tsx` has `isError` flag | Distinct error envelope with red border, stack trace, retry button | `tool_call_update.status: "failed"` | **extend** `ToolResultBlock` or **split** | P2 | 80-120 |
| `<ApplyPatchFile>` | No (closest: `DiffRenderer.tsx`) | Aider-style search/replace blocks (distinct from regular diff view) | `Edit`/`MultiEdit`/`Write` tool variants | **new** (parallel to `<Diff>`) | P2 | 200-300 |

### B.3 — Diff annotations

| Component | Exists? | Should render | ACP/capability mapping | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|---|
| `<LineComment>` | No | PR-review-style inline comment on a diff line | Custom (not ACP-defined; silvercode extension) | **new** | P3 | 100-150 |
| `<LineCommentAnnotations>` | No | Sidebar/gutter rendering of all comments on a diff | Custom | **new** | P3 | 80-120 |

### B.4 — PromptInput suite (composer)

| Component | Exists? | Should render | ACP/capability mapping | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|---|
| `<PromptInput>` (suite) | Partial — `CommandBox.tsx` (270 LOC, multi-region) | Rich composer with slash, mention, paste, image, history | Drives `session/prompt` requests | **extend** `CommandBox` heavily | **P1** | +400-600 over existing |
| `<SlashPopover>` | Yes — `SlashCommandPalette.tsx` (61 LOC) | Inline popover above input when starts with `/` | Slash command UX | **rename** to fit suite + theme | quick win | <50 |
| `<ContextItems>` (@-mentions) | No | Inline @-mention picker (files, sessions, agents) | `available_commands` extended; `fs/read_text_file` for file refs | **new** | P2 | 200-300 |
| `<ImageAttachments>` | No | Pasted/dropped image thumbnails in composer | `ContentBlock.image` outbound | **new** | P3 | 150-200 |
| `<DragOverlay>` | No | Visual feedback when dragging file/image over composer | n/a (UX) | **new** | P4 | 80-120 |
| `<PromptHistory>` | Partial — `HistoryDialog.tsx` (87 LOC) | Up/down arrow scrollback through prior prompts | n/a (local state) | **rename + integrate** with composer | quick win | <50 |
| `<DockPrompt>` / `<DockSurface>` | No | Bottom-docked composer surface (vs inline) | n/a (layout) | **new** | P3 | 200-300 |

### B.5 — Workspace shell

| Component | Exists? | Should render | ACP/capability mapping | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|---|
| `<SidebarShell>` | Partial — `SidePanel.tsx` (812 LOC, right-side) | Left + right sidebar containers | n/a | **extract** from PaneGrid+SidePanel | P2 | 200-300 |
| `<SidebarWorkspace>` | No | Workspace-level navigation (multi-project) | Above sessions in hierarchy | **new** | P3 | 100-150 |
| `<SidebarProject>` | No | Project tree navigation | n/a (filesystem-driven) | **new** | P3 | 150-200 |
| `<SidebarItems>` | No | Generic sidebar list with sortable items | n/a | **new** (uses `<ListView>`) | P2 | 100-150 |
| `<Titlebar>` | No (chrome-minimal v1) | App-level top bar with status | n/a | **new** | P2 | 100-150 |
| `<TitlebarHistory>` | No | Inline session-history dropdown in titlebar | n/a | **new** (uses `<DropdownMenu>` + history dialog) | P3 | 80-120 |
| `<SessionSidePanel>` | Yes — `SidePanel.tsx` | Per-session info (todos, agents, mode) | n/a | already shipped | — |
| `<FileTabs>` + `<FileTabScroll>` | No | Open-files horizontal tab strip with overflow scroll | `fs/read_text_file` opens populate tabs | **new** (uses `<HorizontalVirtualList>`) | P2 | 200-300 |
| `<SessionSortableTab>` | Partial — `PaneGrid.tsx` has split logic, no tabs | Drag-reorderable session tab | n/a (UI layout) | **new** | P3 | 150-250 |
| `<SessionSortableTerminalTab>` | No | Drag-reorderable terminal tab | n/a | **new** (sibling of session tab) | P4 | 100-150 |

### B.6 — Terminal-as-tab

| Component | Exists? | Should render | ACP/capability mapping | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|---|
| `<TerminalPanel>` | No | Embedded xterm-style terminal as a session tab | Backed by `pipeBackend` at v0; `Bash` tool live attach later | **new** | P2 | 300-500 (depends on vt100/vterm integration) |
| `<TerminalLabel>` | No | Tab label rendering for terminal tabs | n/a | **new** | P4 | 30-50 |

### B.7 — Token budget

| Component | Exists? | Should render | ACP/capability mapping | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|---|
| `<SessionContextUsage>` | No | Token meter showing used/total context | `SessionUpdate.usage` (if extension) or computed from history | **new** | P2 | 100-150 |
| `<SessionContextBreakdown>` | No | Popover with per-message/tool/system token breakdown | Same source, drilldown view | **new** | P3 | 150-200 |
| `<SessionContextMetrics>` | No | Inline metrics chip (cost, latency) | Extension data | **new** | P3 | 80-120 |

### B.8 — Provider/model marketplace

| Component | Exists? | Should render | ACP/capability mapping | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|---|
| `<DialogConnectProvider>` | No | First-run wizard: paste API key, OAuth flow | n/a (config UI) | **new** | P3 | 200-300 |
| `<DialogCustomProvider>` | No | Custom provider config (base URL, headers) | n/a | **new** | P3 | 200-300 |
| `<DialogManageModels>` | No | Per-provider model toggles | n/a | **new** | P3 | 150-250 |
| `<DialogSelectModel>` | No | Picker triggered from titlebar/composer | `session/set_model` (if ACP supports) | **new** | P2 | 150-200 |
| `<DialogSelectProvider>` | No | Picker for switching active provider | n/a | **new** | P2 | 100-150 |
| `<ModelTooltip>` | No | Hover-card with model details (cost, context, speed) | n/a | **new** (uses `<HoverCard>`) | P3 | 80-120 |
| Provider-icon set (~20) | No | SVG/ANSI icon per provider (Claude, GPT, Gemini, …) | n/a (asset) | **new** (asset bundle) | P3 | 200-400 (mostly assets) |

### B.9 — MCP UX

| Component | Exists? | Should render | ACP/capability mapping | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|---|
| `<DialogSelectMcp>` | No | Picker for MCP servers to enable per session | Bridges to ACP `mcpServers` config | **new** | P2 | 150-200 |
| `<DialogSelectServer>` | No | Generic JSON-RPC server picker | n/a | **new** | P3 | 100-150 |

### B.10 — Settings panels

| Component | Exists? | Should render | ACP/capability mapping | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|---|
| `<SettingsGeneral>` | No | App-wide preferences | n/a | **new** | P2 | 200-300 |
| `<SettingsKeybinds>` | No | Keybinding editor + reset | n/a | **new** | P3 | 250-350 |
| `<SettingsList>` | No | Generic two-pane settings shell | n/a | **new** | P2 | 150-200 |
| `<SettingsModels>` | No | Model preferences | n/a | **new** | P3 | 200-300 |
| `<SettingsProviders>` | No | Provider preferences | n/a | **new** | P3 | 200-300 |
| `<Keybind>` (display) | No | Render a single keybind as styled chips ("Ctrl + Shift + K") | n/a (visual) | **new** | P2 | 50-80 |

### B.11 — Session lifecycle

| Component | Exists? | Should render | ACP/capability mapping | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|---|
| `<DialogFork>` | No | Fork session from a specific turn | `session/fork` (if exposed) | **new** | P3 | 150-200 |
| `<DialogReleaseNotes>` | No | In-app changelog viewer | n/a | **new** | P4 | 100-150 |
| `<SessionHistory>` (dropdown) | Partial — `HistoryDialog.tsx` is the dialog form | Compact dropdown variant for titlebar | n/a | **adapt** existing | quick win | <50 |
| `<DialogSelectDirectory>` | No | Filesystem dir picker | `fs/read_text_file` paths via picker | **new** | P3 | 150-250 |
| `<DialogSelectFile>` | No | Filesystem file picker | Same | **new** | P3 | 150-250 |

### B.12 — Status indicators

| Component | Exists? | Should render | ACP/capability mapping | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|---|
| `<StatusPopover>` | No (closest: `Notifications.tsx`) | Pill in titlebar with status detail in popover | n/a | **new** | P2 | 100-150 |
| `<StatusPopoverBody>` | No | Body of status popover | n/a | **new** (sibling) | P2 | 80-120 |

### B.13 — Mid-turn input

| Component | Exists? | Should render | ACP/capability mapping | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|---|
| `<QuestionInput>` | Partial — `PermissionInbox.tsx` (93 LOC, permission requests) | Inline structured form widget for mid-turn questions | Maps to extended `RequestPermission` + structured prompts | **extend** PermissionInbox or **new** | **P1** | 150-250 |
| `<AnswerWidget>` | No | The user's answer rendered back inline as part of the turn | Same | **new** | P2 | 80-120 |

### B.14 — Streaming-text effects (silvercode-side)

| Component | Exists? | Should render | ACP/capability mapping | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|---|
| `<TextStrikethrough>` | No | Strike-through during edit revisions | n/a (visual) | **new** (uses silvery `<Transform>`) | P4 | 30-50 |

### B.15 — Stories / showcase

| Component | Exists? | Should render | Gap | Priority | Est. LOC |
|---|---|---|---|---|---|
| Storybook host | Partial — `km-silvercode.acp-storybook` bead in flight | Visual showcase consuming silvercode types via fake | done in `acp-storybook` bead | tracked separately | n/a |
| Per-component `*.stories.tsx` | None today | One story file per component above | wave-by-wave alongside each cluster bead | tracked per-cluster | ~50 LOC × N stories |

**Summary — silvercode components**:
- **P1 (5)**: `<SessionTurn>`, extended `<BasicTool>`, extended `<PromptInput>` suite, theme integration, extended `<QuestionInput>` → **~1,200-1,800 LOC**
- **P2 (~16)**: divider/retry, status title, error card, apply-patch, context-items, sidebar-shell extraction, titlebar, file-tabs, terminal-panel, context-usage, dialog-select-model/provider, dialog-select-mcp, settings shell, status-popover, answer-widget → **~2,500-3,800 LOC**
- **P3 (~17)**: agent-part, count summary/label, line-comments, image-attachments, dock-prompt, sidebar workspace/project/items, titlebar-history, session-sortable-tab, terminal-label, settings panels, marketplace dialogs, model-tooltip, dialog-select-server, dialog-fork, dialog-select-dir/file, drag-overlay → **~2,500-3,800 LOC**
- **P4 (4)**: drag-overlay, terminal-tab variants, release-notes, text-strikethrough → ~300-500 LOC

Total silvercode effort: **~6,500-9,900 LOC** across ~42 components/subcomponents. Quick wins (Section D) cover ~5-10 of these for <50 LOC each.

---

## C. Proposed bead splits

Group the gaps into ~9 follow-up beads. **Each bead is sized to be one focused session (3-8 components, ~500-1,500 LOC).** Dependencies noted in parens.

### Tier 0 — silvery foundation (must land first; unblocks the rest)

1. **`km-silvery.diff-code-accordion`** (P1) — silvery primitives the chat surface needs
   - `<Diff>`, `<Code>` + tree-sitter pipeline, `<Accordion>` / `<Collapsible>`, `<LineNumber>`
   - **~1,200-1,800 LOC**. Blocks: B.2 tool rendering, B.3 line-comments, A's tree-sitter package.
   - Depends on: nothing.

2. **`km-silvery.theme-json-system`** (P1) — published theme JSON Schema + 5-10 starter themes (Catppuccin, Tokyo Night, Gruvbox, Dracula, Solarized, …)
   - JSON Schema, loader, extends existing `<ThemeProvider>`. Community PRs bring 30+ later.
   - **~200-400 LOC** + theme files.
   - Depends on: nothing. Can run parallel with bead 1.

3. **`km-silvery.overlay-vocabulary`** (P2) — `<DropdownMenu>`, `<ContextMenu>`, `<HoverCard>`, `<Tag>` (alias of Badge), `<RadioGroup>`, `<Switch>` (alias of Toggle), `<TabSelect>` (segmented variant)
   - **~600-900 LOC**. Blocks: B.5 file-tabs, B.8 model-tooltip, B.10 settings, B.11 dialog-fork, B.12 status-popover.
   - Depends on: nothing.

4. **`km-silvery.animation-counters`** (P2) — `<AnimatedNumber>`, `<TextShimmer>`, `<TextReveal>`, `<TimeToFirstDraw>`
   - **~400-600 LOC**. Blocks: B.2 tool-status-title, B.2 tool-count-summary, B.7 context-usage.
   - Depends on: nothing.

### Tier 1 — silvercode chat-surface parity (depends on Tier 0)

5. **`km-silvercode.acp-comp-tool-cluster`** (P1, P2) — tool rendering parity
   - Extend `ToolCallBlock` → `<BasicTool>`/`<GenericTool>`, add `<ToolStatusTitle>`, `<ToolErrorCard>` (split from `ToolResultBlock`), `<ApplyPatchFile>`, `<ToolCountSummary>` + `<ToolCountLabel>`
   - **~700-1,100 LOC**. Depends on: bead 1 (`<Diff>`, `<Accordion>`), bead 4 (`<AnimatedNumber>`).

6. **`km-silvercode.acp-comp-turn-anatomy`** (P1, P2) — turn structure
   - `<SessionTurn>`, `<MessageDivider>`, `<SessionRetry>`, `<AgentPart>`
   - **~500-800 LOC**. Depends on: bead 1 (animations + accordion).

7. **`km-silvercode.acp-comp-composer-suite`** (P1, P2, P3) — PromptInput parity
   - Extend `CommandBox` → full `<PromptInput>` suite: rename `SlashCommandPalette` → `<SlashPopover>`, add `<ContextItems>`, `<ImageAttachments>`, `<DragOverlay>`, integrate `HistoryDialog` as `<PromptHistory>`, add `<DockPrompt>`/`<DockSurface>`
   - **~800-1,200 LOC**. Depends on: bead 3 (overlays), bead 1 (`<Code>` for code-mention rendering).

### Tier 2 — workspace shell (parallel to Tier 1)

8. **`km-silvercode.acp-comp-workspace-shell`** (P2, P3) — sidebars + titlebar + tabs
   - Extract `<SidebarShell>` from existing PaneGrid/SidePanel; add `<SidebarWorkspace>`, `<SidebarProject>`, `<SidebarItems>`, `<Titlebar>`, `<TitlebarHistory>`, `<FileTabs>` + `<FileTabScroll>`, `<SessionSortableTab>`, `<SessionSortableTerminalTab>`, `<StatusPopover>` + body
   - **~1,500-2,200 LOC** (the heaviest bead). Depends on: bead 3 (`<DropdownMenu>`).

9. **`km-silvercode.acp-comp-terminal-panel`** (P2, P4) — terminal as tab
   - `<TerminalPanel>` with `pipeBackend` at v0, `<TerminalLabel>`
   - **~400-600 LOC**. Depends on: bead 8 (file-tabs / sortable-tab pattern). Likely vt100/vterm integration spike — could split off a vendor-eval sub-bead.

### Tier 3 — settings + marketplace + budget (depend on Tier 0 + Tier 2)

10. **`km-silvercode.acp-comp-settings-panels`** (P2, P3) — settings shell
    - `<SettingsList>` shell + `<SettingsGeneral>`, `<SettingsKeybinds>`, `<SettingsModels>`, `<SettingsProviders>`, `<Keybind>` chip
    - **~900-1,300 LOC**. Depends on: bead 3 (`<RadioGroup>`, `<Switch>`).

11. **`km-silvercode.acp-comp-marketplace-dialogs`** (P2, P3) — provider/model + MCP pickers
    - `<DialogSelectModel>`, `<DialogSelectProvider>`, `<DialogConnectProvider>`, `<DialogCustomProvider>`, `<DialogManageModels>`, `<ModelTooltip>`, provider-icon set, `<DialogSelectMcp>`, `<DialogSelectServer>`
    - **~1,300-2,000 LOC** (mostly dialog scaffolding + assets). Depends on: bead 3 (`<HoverCard>` for tooltip).

12. **`km-silvercode.acp-comp-context-budget-and-mid-turn`** (P1, P2, P3) — token meter + structured Q&A
    - `<SessionContextUsage>`, `<SessionContextBreakdown>`, `<SessionContextMetrics>`, extend `PermissionInbox` → `<QuestionInput>`, add `<AnswerWidget>`, `<DialogFork>`, `<DialogReleaseNotes>`, `<DialogSelectDirectory>`, `<DialogSelectFile>`, `<LineComment>` + `<LineCommentAnnotations>`
    - **~1,000-1,500 LOC**. Depends on: bead 1 (`<Diff>`, `<Accordion>`), bead 4 (`<AnimatedNumber>` for token roll).

### Dependency graph (textual)

```
bead-1 (silvery diff/code/accordion) ──┐
bead-2 (silvery theme JSON)           ├── independent ── Tier 0
bead-3 (silvery overlays)             │
bead-4 (silvery animation/counters) ──┘

Tier 0 ─→ bead-5 (tool cluster)
Tier 0 ─→ bead-6 (turn anatomy)
Tier 0 ─→ bead-7 (composer suite)
Tier 0 ─→ bead-8 (workspace shell) ─→ bead-9 (terminal panel)
Tier 0 ─→ bead-10 (settings panels)
Tier 0 ─→ bead-11 (marketplace dialogs)
Tier 0 ─→ bead-12 (context/mid-turn/diff annotations)
```

**Total bead count**: 12 (4 silvery + 8 silvercode). Tier 0 is the unblocker — landing it opens parallel work on Tier 1-3.

**12 beads × est. ~800-1,400 LOC each ≈ 9,000-15,000 LOC** total. Matches the ~9,000-13,700 LOC summed in Sections A+B above.

---

## D. Quick wins (<50 LOC each, do now)

These exist already and need a tiny rename/extend to fit the parity vocabulary. Knock these off in a single sub-bead `km-silvercode.acp-comp-quick-wins`.

| # | Component | Action | Why it's quick |
|---|---|---|---|
| 1 | `SlashCommandPalette` → `<SlashPopover>` | Rename + minor restyle to fit PromptInput suite | Same logic, new name |
| 2 | `HistoryDialog` → `<PromptHistory>` (dialog) + dropdown variant | Add a compact `<SessionHistory>` dropdown variant; keep dialog for Cmd-Shift-O | One file split into two |
| 3 | `<Tag>` → alias of silvery `<Badge>` | Add `Tag = Badge` re-export with default `kind="neutral"` | Tag is what the punch list calls Badge |
| 4 | `<Switch>` → alias of silvery `<Toggle>` | Add `Switch = Toggle` re-export with switch-shape variant | Visually different, semantically same |
| 5 | `<Link>` OSC-8 verification | Confirm silvery `<Link>` emits OSC-8; add if missing | Already exists |
| 6 | `<TabSelect>` (segmented) extension of `<Tabs>` | Add `variant="segmented"` to existing `<Tabs>` | Style variant only |
| 7 | `<Keybind>` chip | Style chip (small Box + Text with bordered theme tokens) | One small component |
| 8 | `<MessageDivider>` | New 30-LOC component (Divider with optional label) | Compose existing `<Divider>` + `<Text>` |
| 9 | `ToolResultBlock` `isError` → `<ToolErrorCard>` rename | Promote the `isError` branch to its own component | Pure refactor |
| 10 | `<TextStrikethrough>` | Wrap silvery `<Transform>` with style preset | One-liner |

**Total**: ~10 quick wins, ~300-400 LOC combined. Do this bead **first**; it pulls the inventory closer to the parity vocabulary at almost zero cost.

---

## E. opencode-specific risks (deprioritize / out-of-scope)

opencode pivoted to **SolidJS desktop/web (Electron-shelled)** on the `dev` branch. Several of its components don't translate cleanly to silvery's terminal-first target. Flag these and move on:

| Risk area | opencode component(s) | Why it's deprioritized |
|---|---|---|
| **Drag-and-drop UX** | `<DragOverlay>`, drag-reorder on tabs, image-paste-from-OS-clipboard | Terminal has no native drag events. Mouse events exist (silvery has them) but drag affordances are bespoke. Ship a degraded version; the desktop expectation doesn't carry. |
| **Image rendering** | `<ImageAttachments>`, `<ImagePreview>`, `<Avatar>`, provider icons | Terminal image support is fragmented (Kitty/iTerm2/sixel). silvery has `<Image>` but coverage is partial. Ship as ASCII/box fallback for non-graphics terminals; full image support is a P3. |
| **Electron-only chrome** | App icon, Electron `Menubar`, native title-bar integration | Doesn't apply. silvery's `<Titlebar>` is in-app chrome only. |
| **DOM contenteditable composer** (`editor-dom`) | Rich-text composer with inline mentions | Terminal cells can't host contenteditable. Ship a flatter token-stream composer (silvery `<TextArea>` + token rendering) — visually inferior to opencode's, semantically equivalent. |
| **Framer-motion springs** | `motion-spring`, accordion entrance, dock entrance | Terminal frame budget can't always do 60fps tweens. silvery's animation primitives work but won't reproduce DOM compositor smoothness. Use sparingly; lean on `<TextReveal>`/`<TextShimmer>` for streaming, not on chrome animations. |
| **Resize-handle DOM dragging** | `<ResizeHandle>` | km already has working pane-resize via mouse drag in `PaneGrid` — keep that, don't port opencode's DOM-drag impl. |
| **CSS-driven typography** (`<Font>` as theme primitive) | Per-theme font selection | Terminal can't change font via OSC; user picks terminal font. Ship typography presets at the silvery-tokens level (already done) and don't expose `<Font>`. |
| **WebGPU/canvas brand demos** | Sprite/physics, shaders | Out-of-scope for silvercode. Belongs to silvery's v2.0/v3.0 horizons — track separately, don't import opencode's stack. |
| **37 themes ported wholesale** | Catppuccin, Tokyo Night, Gruvbox, Dracula × 9 variants each | Ship 5-10 starter themes; community PRs bring the rest. Don't let "match opencode's count" gate the JSON-system release. |

**Net**: ~9 punch-list items relegated to "ship a degraded variant or punt." The remaining ~95% of the parity inventory translates cleanly because silvercode's target is a terminal-first agent workspace, and opencode's underlying vocabulary (chat-turn anatomy, tool blocks, composer suite, sidebar/titlebar shell, settings) is medium-agnostic.

---

## Counts summary (for the bead notes)

- **Existing silvercode components**: 21 (~4,000 LOC)
- **Existing silvery components**: ~50 (across 7 sub-dirs)
- **Silvery primitive gaps**: ~20 (P1: 4, P2: 8, P3: 8, P4: 1) → **~2,500-3,800 LOC**
- **Silvercode component gaps**: ~42 (P1: 5, P2: 16, P3: 17, P4: 4) → **~6,500-9,900 LOC**
- **Total estimated effort**: **~9,000-13,700 LOC** across **12 follow-up beads** in 4 tiers
- **Quick wins available now**: ~10 (~300-400 LOC) — knock off in `km-silvercode.acp-comp-quick-wins`
- **Critical path**: Tier 0 (4 silvery beads, ~2,500 LOC) unblocks all Tier 1-3 work
