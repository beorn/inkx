---
mentions:
  - km
id: "@km/silvery/vt-demo"
aliases:
  - km-silvery.vt-demo
  - km-silvery-vt-demo
created_by: Bjørn Stabell
created_at: 2026-04-02T22:39:14Z
closed_at: 2026-04-03T00:00:06Z
close_reason: Implemented. 220-line demo showing ChatApp in 3 modes. Committed 02e9c5d.
owner: bjorn@stabell.org
---

# [x] Virtual terminal demo — same app in inline vs vterm vs fullscreen @km/silvery #task #P1

Create a demo that shows the SAME app running in all three modes, proving the mode-agnostic story.

## The demo

A simple chat/log viewer app that uses:

```tsx
<ListView items={messages} cache nav search renderItem={...} />
```

Run it three ways:

- bun examples/apps/vterm-demo --mode=inline    → items cache to terminal scrollback
- bun examples/apps/vterm-demo --mode=fullscreen → items cache to in-memory buffer
- bun examples/apps/vterm-demo --mode=panes     → two panes, Tab focus, Ctrl+F

Same code, different modes. The mode flag flows into createApp() which selects the cache backend.

## Existing demo

The panes demo (examples/apps/panes/) already demonstrates the fullscreen/panes mode.
It needs updating to work with the new SearchProvider (SurfaceRegistry deleted).

## What this proves

- App code is identical across modes
- Cache backend auto-selected by mode
- Search works in all modes
- Nav works in all modes

## Depends on

- Phase 5 (cache system) — need TerminalCache and VirtualCache backends
- Phase 0c — examples cleanup

This is the killer showcase for the blog post story.

