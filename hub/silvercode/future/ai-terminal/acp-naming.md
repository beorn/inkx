# ACP naming convention — silvercode

**Rule**: silvercode standardizes on ACP vocabulary across components, types, variables, and concepts. When ACP defines a concept, use ACP's name. When ACP doesn't, use silvercode-coined names that fit ACP's naming style — and document them as silvercode extensions, not aliases pretending to be ACP.

**Why**: silvercode positions as *the* ACP session client. The protocol is the canonical vocabulary. Drift between ACP wire names and silvercode internal names is friction users pay forever.

## Canonical mapping

### Stream events (`SessionUpdate` discriminated union)

| ACP wire field | silvercode component | Renders |
|---|---|---|
| `agent_message_chunk` | `<AgentMessageChunk>` | Streaming assistant text segment |
| `agent_thought_chunk` | `<AgentThoughtChunk>` | Streaming assistant thinking segment |
| `user_message_chunk` | `<UserMessageChunk>` | User text turn |
| `tool_call` | `<ToolCall>` | Tool invocation card |
| `tool_call_update` | `<ToolCallUpdate>` | Mutation merged into existing `<ToolCall>` |
| `plan` | `<Plan>` | Plan list (TodoWrite-equivalent) |
| `available_commands_update` | `<AvailableCommands>` | Slash-command palette source |
| `current_mode_update` | `<CurrentMode>` | Active mode pill |
| `usage_update` | `<UsageUpdate>` | Token/cost meter |

### Tool-call structure

| ACP type | silvercode component | Notes |
|---|---|---|
| `ToolKind` (read/edit/delete/move/search/execute/think/fetch/other) | (variant on `<ToolCall>`) | One component, kind-driven layout |
| `ToolCallStatus` (pending/in_progress/completed/failed) | (variant on `<ToolCall>`) | Status-driven styling |
| `ToolCallContent` text variant | `<TextContent>` | Plain text body |
| `ToolCallContent` diff variant | `<Diff>` | Unified or side-by-side |
| `ToolCallContent` terminal variant | `<TerminalContent>` | Embedded terminal output |
| `ToolCallLocation` | (in `<ToolCall>` header) | Path + line range chip |

### Permissions

| ACP type | silvercode component |
|---|---|
| `RequestPermission` request | `<RequestPermission>` |
| `PermissionOption` | `<PermissionOption>` |

### Content blocks (`ContentBlock` union)

| ACP variant | silvercode component |
|---|---|
| `TextContent` | `<TextContent>` |
| `ImageContent` | `<ImageContent>` |
| `AudioContent` | `<AudioContent>` |
| `ResourceLink` | `<ResourceLink>` |
| `EmbeddedResource` | `<EmbeddedResource>` |

### Session lifecycle

| ACP method | silvercode component |
|---|---|
| `session/prompt` | `<SessionPromptComposer>` (the input box driving prompt requests) |
| `session/cancel` | `<SessionCancelButton>` |
| `session/load` | `<SessionLoadDialog>` |

### Variables and concepts

| ACP wire / concept | silvercode variable / concept |
|---|---|
| session id | `sessionId` (camelCase brand `SessionId`) |
| tool call id | `toolCallId` (`ToolCallId`) |
| permission request id | `permissionRequestId` (`PermissionRequestId`) |
| `_meta.ambient` (channels) | `ambient: true` (ambient context vs prompt) |
| stop_reason | `stopReason` |

## silvercode extensions (NOT ACP-defined)

Where silvercode needs concepts ACP doesn't speak, coin names that fit ACP's naming style and clearly mark them as silvercode-only. Do not pretend they're ACP.

| silvercode concept | ACP-style name | Why it's not in ACP |
|---|---|---|
| Channel pipeline (tribe/lore/recall) | `<AmbientResource>` | ACP has `EmbeddedResource` with `_meta.ambient`; the pipeline that *populates* ambient resources is silvercode-side |
| Cross-agent state | `<CrossAgentSnapshot>` | ACP is one-client/one-agent — silvercode adds orchestration |
| Mid-turn structured Q&A | `<StructuredQuestion>` / `<StructuredAnswer>` | Extension on top of `RequestPermission` semantics |
| Storybook host | `<StorybookHost>` | Internal dev tool, no ACP concept |

## Things explicitly OUT of ACP scope (deferred)

These belong to IDE-shell, not the ACP session client. Tracked under `km-silvercode.ide-shell` (P4). When the IDE-shell scope is revisited, names below are the canonical map — clearly silvercode-coined, never faux-ACP.

### IDE-shell naming (non-ACP, silvercode-only)

Prefix everything with `Silvercode` or `Workspace` to make it obvious this is *outside* the protocol vocabulary.

| Concept | silvercode name | Component(s) |
|---|---|---|
| App-level chrome | `Silvercode*` prefix | `<SilvercodeApp>`, `<SilvercodeTitlebar>` |
| Multi-session container | `Workspace*` | `<Workspace>`, `<WorkspaceSidebar>`, `<WorkspaceProject>`, `<WorkspaceSidebarItems>` |
| Session-tab bar | `SessionTab*` | `<SessionTabBar>`, `<SessionTab>`, `<SessionTabSortable>`, `<TerminalTab>`, `<TerminalTabSortable>` |
| File tabs (open files) | `FileTab*` | `<FileTabBar>`, `<FileTab>`, `<FileTabScroll>` |
| Status popovers | `StatusPopover*` | `<StatusPopover>`, `<StatusPopoverBody>` |
| Settings UI | `Settings*` | `<SettingsShell>`, `<SettingsGeneral>`, `<SettingsKeybinds>`, `<SettingsModels>`, `<SettingsProviders>`, `<KeybindChip>` |
| Marketplace dialogs | `Dialog*` | `<DialogSelectModel>`, `<DialogSelectProvider>`, `<DialogConnectProvider>`, `<DialogCustomProvider>`, `<DialogManageModels>`, `<DialogSelectMcp>`, `<DialogSelectServer>` |
| Provider metadata | `Provider*` | `<ProviderIcon>`, `<ProviderTooltip>` (alias of `<ModelHoverCard>` once HoverCard wrapper exists) |
| Standalone terminal pane | `TerminalPanel*` | `<TerminalPanel>` (NOT ACP `Terminal` — that lives inside `ToolCallContent`), `<TerminalPanelLabel>` |
| Session lifecycle (non-ACP) | `Session*` (silvercode-extended) | `<DialogForkSession>`, `<DialogReleaseNotes>`, `<DialogSelectDirectory>`, `<DialogSelectFile>` |
| File-system primitives (UI-only) | `FileBrowser*` | `<FileBrowserDir>`, `<FileBrowserFile>` |

### Naming rule for IDE-shell

When ACP defines a concept (`Terminal`, `RequestPermission`, `ToolCall`), use ACP's name even if it appears inside a Silvercode-prefixed shell. When ACP has no concept (workspace, file tabs, settings shell), use `Silvercode*` / `Workspace*` / `Dialog*` prefixes — never coin a faux-ACP name like `SessionTabUpdate` or `WorkspaceSessionUpdate`.

### Why prefix at all

A reader scanning `apps/silvercode/src/components/` should be able to tell at a glance which components implement protocol concepts (`<ToolCall>`, `<RequestPermission>`, `<UsageMeter>`) versus client-side chrome (`<SilvercodeTitlebar>`, `<WorkspaceSidebar>`, `<DialogSelectModel>`). The prefix makes the protocol/chrome boundary visible in the file tree.

If silvercode later pivots toward an IDE shape, those names get coined under `<SilvercodeIde*>` or similar — never as faux-ACP names.

## Migration of existing components

Existing silvercode component names that drift from ACP — and their target names — are tracked in bead `km-silvercode.acp-naming` (refactor).

```
ToolCallBlock.tsx       → ToolCall.tsx
ToolResultBlock.tsx     → ToolCallContent.tsx (or merge into ToolCall)
PermissionInbox.tsx     → RequestPermissionInbox.tsx (or RequestPermissionList)
SlashCommandPalette.tsx → AvailableCommandsPalette.tsx
MessageList.tsx         → SessionUpdateList.tsx
UserMessageBlock.tsx    → UserMessageChunk.tsx
AssistantBlock.tsx      → AgentMessageChunk.tsx
DiffRenderer.tsx        → Diff.tsx
CommandBox.tsx          → SessionPromptComposer.tsx
HistoryDialog.tsx       → SessionHistoryDialog.tsx
```

Per /refactor lessons: rename in one session, no backwards-compat re-exports, sweep all 7 layers (data, types, functions, files, comments, docs, tests) before closing.
