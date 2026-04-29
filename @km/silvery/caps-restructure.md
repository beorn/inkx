---
id: "@km/silvery/caps-restructure"
aliases:
  - km-silvery.caps-restructure
  - km-silvery-caps-restructure
created_by: claude:c6244087
created_at: 2026-04-23T17:27:24Z
closed_at: 2026-04-23T18:03:59Z
close_reason: Closed
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.caps-restructure
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T10:27:24Z
    created_by: claude:c6244087
    metadata: "{}"
---

# [x] [epic] Phase 7: split TerminalCaps into identity+heuristics+caps (Pro verdict) @km/silvery #epic #P1 @claude:c6244087

blocks:: [[@km/silvery]]

Per dual-pro review (GPT-5.4 Pro + Kimi K2.6 converged) 2026-04-23. Split flat 22-field TerminalCaps into three layers on TerminalProfile: {identity: {program, version, term}, heuristics: {darkBackground, nerdfont, textEmojiWide}, caps: {hard protocol flags}}. Also: underlineStyles boolean → UnderlineStyle[] (supports array gradation), delete hasCursor/hasInput/hasColor/hasUnicode legacy methods (redundant with caps), rename caps.term → termName (avoid Term type shadow), caps.colorLevel → colorTier (match hasColor return type), caps.textSizingSupported → textSizing (drop verbose suffix). Pro review verdict: keep createTerminalProfile as canonical, add protocol objects (clipboard/graphics/notifications) — LATTER DEFERRED to future phase. Scope: structure + renames + legacy-method deletion only.