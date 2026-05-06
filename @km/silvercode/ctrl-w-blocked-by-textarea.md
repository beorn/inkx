---
mentions:
  - km
  - claude
projects:
  - W
id: "@km/silvercode/ctrl-w-blocked-by-textarea"
aliases:
  - km-silvercode.ctrl-w-blocked-by-textarea
  - km-silvercode-ctrl-w-blocked-by-textarea
created_by: claude:2405c72e
created_at: 2026-04-26T11:22:10Z
closed_at: 2026-04-26T12:12:17Z
close_reason: "Shipped: 2e7bf52ad. Rebound pane chord prefix from Ctrl+W to
  Ctrl+G (BEL, no readline conflict). 4 tests. Session: km-session.0425-evening"
started_at: 2026-04-26T11:33:20Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
---

# [x] Ctrl+W chord prefix blocked by TextArea word-delete binding @km/silvercode #bug #P2 @claude:2405c72e

Symptom: Ctrl+W (vim-window pane chord) does not enter chord mode when CommandBox/TextInput has focus. The next pressed key (e.g. v) is typed as text instead of resolving the chord.

Repro:

1. Launch silvercode (single pane)
2. Press Ctrl+W (CommandBox focused, default state)
3. Press v
Expected: split pane right
Actual: input shows "v"; no chord; no split

Root cause: silvery TextInput/useTextArea consumes Ctrl+W as readline word-delete-backwards (vendor/silvery/packages/ag-react/src/ui/components/useTextArea.ts:40, useReadline.ts:17, TextInput.tsx:22). The keystroke never reaches App.tsx App-level useInput at apps/silvercode/src/App.tsx:737.

Fix options:

1. CommandBox stops Ctrl+W from default text-area handling and re-emits it (preferred — keeps Ctrl+W chord working everywhere).
2. Use a different chord prefix (e.g. Ctrl+B like tmux). Worse UX.
3. Switch to a leader key approach with a non-readline-conflicting key.

Files:

- apps/silvercode/src/App.tsx (lines 203-740 around chord logic)
- apps/silvercode/src/components/CommandBox.tsx (focus/input handling)
- vendor/silvery/packages/ag-react/src/ui/components/useTextArea.ts:40 (the consumer)

Discovered in autonomous explore session 2026-04-26.

