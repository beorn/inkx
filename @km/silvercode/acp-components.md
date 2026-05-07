---
mentions:
  - km
  - claude
id: "@km/silvercode/acp-components"
aliases:
  - km-silvercode.acp-components
  - km-silvercode-acp-components
created_by: claude:cd034ca4
created_at: 2026-04-26T08:42:24Z
closed_at: 2026-04-26T09:34:42Z
close_reason: "Plan complete (research/plan bead, not implementation). Component
  parity plan: hub/silvery/future/ai-terminal/component-parity-plan.md. Proposes
  12 follow-up beads in 4 tiers, ~9,000-13,700 LOC total. Force-closed:
  dependency on km-silvercode.acp-session is a blocker for implementation, not
  for the plan doc itself — implementation beads will inherit that dependency
  naturally."
started_at: 2026-04-26T09:27:53Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-components
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T01:42:24Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-components
    depends_on_id: km-silvercode.acp-session
    type: blocks
    created_at: 2026-04-26T01:42:24Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode.acp
      - type: link
        target: km-silvercode.acp-session
---

# [x] Component parity with opencode + silvery primitives parity with OpenTUI @km/silvercode #feature #P2 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-session]]

Reconciled component inventory based on 2026-04-26 research. opencode is silvercode's visual-parity target (now SolidJS desktop, ~95 components). OpenTUI is silvery's framework-primitive comparable (Zig native core, 10.5k stars).

## silvery framework primitives to add (parity with OpenTUI)

- <Diff> unified-diff renderable
- <Code> tree-sitter syntax-highlighted code block (TS/JS/MD/Zig WASM grammars bundled)
- 
  <Textarea> production multi-line editor (selection, undo-redo, paste, wrap, highlights)
  
- <LineNumber> gutter
- 
  <Link> first-class hyperlink with OSC-8
- <ASCIIFont> figlet/banner with bundled fonts
- <Slider> numeric slider
- <TabSelect> tab row
- <Timeline> + post-FX (color matrices, grayscale, transparency)
- TimeToFirstDraw instrumentation
- <Accordion>/<Collapsible>/<StickyAccordionHeader>
- <Tooltip>/<Popover>/<HoverCard>/<DropdownMenu>/<ContextMenu>
- <ProgressCircle>, <Tag>, <Switch>, <RadioGroup>
- <TextShimmer>/<TextReveal>/<Typewriter>/<AnimatedNumber>
- Theme JSON system + ~30 community themes (Catppuccin, Tokyo Night, Gruvbox, Dracula, Solarized…)
- Plugin/slot registry at framework level
- Tree-sitter pipeline as optional package

## silvercode-specific components (parity with opencode chat UI)

- <SessionTurn> with retry/reveal animations + sub-agent nesting
- <MessageDivider>, <SessionRetry>
- <AgentPart> (sub-agent spawn, nested turn-within-turn)
- <BasicTool>/<GenericTool> (parity-grade ToolCallBlock)
- <ToolStatusTitle> (animated 'Reading file…' → 'Read 3 files' morph)
- <ToolCountSummary> + <ToolCountLabel> (rolling-digit counters)
- 
  <ToolErrorCard>
- <ApplyPatchFile> (Aider-style search/replace blocks)
- <LineComment> + <LineCommentAnnotations> (PR-review-style inline diff comments)
- <PromptInput> suite: slash-popover, @-mention context-items, image attachments, drag-overlay, paste, history, placeholder, rich editor model
- <DockPrompt>/<DockSurface>
- Workspace shell: sidebar (workspace/project/items), titlebar + history, side panel, file tabs, sortable session/terminal tabs
- <TerminalPanel> using pipeBackend at v0
- <SessionContextUsage> + breakdown (token meter)
- Provider/model marketplace: 5 dialogs (connect-provider, custom-provider, manage-models, select-model, select-provider) + <ModelTooltip> + provider-icon set
- <DialogSelectMcp> / <DialogSelectServer>
- 5 settings panels + <Keybind> display component
- <DialogFork>, <DialogReleaseNotes>, <StatusPopover>
- <QuestionInput>/<AnswerWidget> (mid-turn structured input)

## Net

opencode ships ~95 components. ACP-derived inventory is ~25-30. Parity needs ~30 more silvercode components and ~15 silvery framework primitives. Most are 10-50 LOC given silvery's existing primitives.

## Reference

- hub/silvery/future/ai-terminal/10-agent-router-landscape.md § Component reconciliation — opencode and OpenTUI
- opencode source: github.com/sst/opencode (dev branch, SolidJS pivot)
- OpenTUI source: github.com/anomalyco/opentui

