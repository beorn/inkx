---
id: "@km/silvery/terminal-protocols"
aliases:
  - km-silvery.terminal-protocols
  - km-silvery-terminal-protocols
created_by: Bjørn Stabell
created_at: 2026-04-06T08:34:52Z
---

# [ ] Adopt terminal protocols discovered via terminfo.dev radar @km/silvery #task #P2

Terminal protocols from terminfo.dev radar — review what's NEW vs what silvery already has.

ALREADY FULLY IMPLEMENTED in silvery:
1. Synchronized output (mode 2026) — ag-term/src/output.ts, used in every render
2. SGR mouse tracking (mode 1006) — ag-term/src/mouse.ts, full parser
3. Bracketed paste (mode 2004) — ag-term/src/bracketed-paste.ts
4. Focus reporting (mode 1004) — ag-term/src/focus-reporting.ts
5. Terminal detection (DA1/DA2/DA3/XTVERSION) — ag-term/src/device-attrs.ts
6. OSC 52 clipboard (read + write) — ag-term/src/clipboard.ts (has query support)
7. Kitty keyboard protocol (CSI u) — ag-term/src/kitty-manager.ts (auto/enabled/disabled modes, flag configuration)
8. OSC 133 semantic prompts — ag-term/src/osc-markers.ts (full A/B/C/D markers)
9. OSC 8 hyperlinks — ag-react/src pipeline + ink sanitizer preserves OSC 8
10. Image support — ag-react/src/ui/image/ (Kitty graphics + Sixel encoder)
11. Dark/light mode detection — ansi/src/detection.ts (macOS AppleInterfaceStyle)

GENUINELY NEW (not yet in silvery):
1. Mode 2031 color scheme reporting — cross-platform dark/light detection via terminal query (currently macOS-only). Would work on Linux, Windows Terminal, SSH sessions.
2. DEC modes 1020-1023 (xterm patch #407) — terminal self-reports UTF-8/CJK-width/emoji-width/private-width settings. Silvery currently guesses these.
3. OSC 66 (kitty text sizing) — variable text sizes in terminal cells. Novel rendering capability.
4. OSC 5522 (kitty advanced clipboard) — richer clipboard protocol extending OSC 52 with MIME types, large payloads, paste events.

IMPLICATIONS for silvery:
- Mode 2031 would improve theme auto-detection for non-macOS users (low effort, high value)
- DEC modes 1020-1023 would let silvery query wcwidth/emoji behavior instead of guessing (medium effort, solves hard unicode width bugs)
- OSC 66 text sizing could enable heading/small-print in TUI apps (high effort, novel feature)
- OSC 5522 would enable rich clipboard (structured paste, images) (medium effort)