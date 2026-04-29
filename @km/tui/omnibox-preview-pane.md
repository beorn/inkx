---
id: "@km/tui/omnibox-preview-pane"
aliases:
  - km-tui.omnibox-preview-pane
  - km-tui-omnibox-preview-pane
created_by: Bjørn Stabell
created_at: 2026-04-15T00:07:37Z
closed_at: 2026-04-28T22:29:25Z
close_reason: Telescope/Helm-style preview pane shipped. previewForRow pure
  derivation produces structured PreviewContent
  (title/lines/summary/hint/disabled) for command + node rows. UnifiedOmnibox
  PreviewPane renders bordered box with current row's detail + 'Enter runs X'
  summary. preview prop default off; bottom-left layout suppresses; connector
  enables on center layout with effectiveCommand threaded. 7 unit tests + 5
  render tests, all green.
started_at: 2026-04-28T22:12:43Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-tui.omnibox-preview-pane
    depends_on_id: km-tui.omnibox-unified
    type: parent-child
    created_at: 2026-04-14T17:08:01Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Preview-as-selection — live preview pane for current result @km/tui #feature #P1 @claude:2405c72e

blocks:: [[@km/tui/omnibox-unified]]

Telescope/Helm-style side-pane or below-list preview showing the currently selected result's detail. For nodes: content preview + parent breadcrumbs + key properties. For commands: description + keybinding + when-clause result + 'what Enter will do' summary. Shrinks the gulf of evaluation at scale (10k+ nodes) by turning the omnibox from 'guess and commit' into 'inspect and confirm'.

Layout: preview is an OmniboxProps flag ('preview: boolean'), default off for bottom-left layouts, on for center. Rendered below the result list in center layout, to the right on wider terminals. Keybinding toggle ('Cmd+P' or 'Ctrl+Y' — TBD based on conflict analysis).

Scope: Phase 5+ enhancement. Not ship-blocking for v1 but strongly recommended by /big research (GPT-5.4) as the #2 non-obvious improvement. Implementation is incremental over the base dialog component.

Acceptance: (a) preview pane renders for node results (content + breadcrumbs + metadata); (b) preview pane renders for command results (description + keybinding + when-eval); (c) toggle via keybinding + default-off flag; (d) doesn't interfere with bottom-left layout; (e) journey tests for each result type preview.