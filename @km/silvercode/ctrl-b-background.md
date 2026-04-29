---
id: "@km/silvercode/ctrl-b-background"
aliases:
  - km-silvercode.ctrl-b-background
  - km-silvercode-ctrl-b-background
created_by: claude:2405c72e
created_at: 2026-04-25T05:29:47Z
closed_at: 2026-04-26T00:52:59Z
close_reason: Implemented in 1f248bcd8 (2026-04-24 23:22). Ctrl-B backgrounds
  active turn; SidePanel indicator shows count; on-completion output surfaces
  back into conversation. Bead was left in_progress when the session bead
  km-silvercode.ctrl-b-background got rolled into the bulk session-close commit
  (0ce2dbc66) but this feature bead missed the close. Housekeeping.
---

# [x] Ctrl-B to background long-running commands @km/silvercode #feature #P2 @claude:2405c72e

blocks:: [[@km/silvercode]]

Implement Ctrl-B (or equivalent) to background long-running commands the way Claude Code does it — push the in-flight turn / shell / agent into the background so the UI is freed up to start a new turn while the previous one keeps running.

## Motivation

Claude Code lets the user press Ctrl-B mid-turn to "background" the current request: the command/agent keeps running, output is captured, and the user can continue interacting (queue new prompts, switch context). When the backgrounded task finishes, output is surfaced back into the conversation.

silvercode currently lacks this. Long shell/agent turns block the UI flow — you can queue (Option B queue) but you can't keep iterating on the conversation while the previous turn is still computing.

## What to build

- Keybinding: Ctrl-B in the command region while a turn is in flight → background the active turn
- State: per-session "background tasks" list (turnId → status, started, output buffer)
- UI: indicator in SidePanel ("Background: 1 running") + reveal pane showing list with status
- Output handling: backgrounded turn's output continues streaming into a buffer; on completion, surface as a "background result" message in the conversation
- Resume: a way to re-foreground a background task (or just let it complete and inject the result)
- Cancel: Ctrl-C on a backgrounded task cancels it

## References

- Claude Code's Ctrl-B behavior — observe and document the exact UX before building
- apps/silvercode controller (turn lifecycle): apps/silvercode/src/controllers/
- apps/silvercode SidePanel: apps/silvercode/src/components/SidePanel.tsx (already shows Agents/Shells counts — extend with Background count)
- agent-harness session API for turn cancellation/streaming

## Acceptance

- Ctrl-B during a running turn moves it to background without losing output
- New turn can start immediately after backgrounding
- SidePanel shows accurate background count
- Backgrounded result surfaces in conversation when complete
- Cancel works (no zombie turns)