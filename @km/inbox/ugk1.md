---
id: "@km/_orphan/ugk1"
aliases:
  - km-ugk1
created_at: 2026-01-20T07:45:05Z
closed_at: 2026-01-20T12:58:19Z
---

# [x] InkX: Document layout engine API @km/_orphan #task #P3

## Problem
Layout engine management functions are exported but undocumented:
- setLayoutEngine()
- isLayoutEngineInitialized()
- createYogaEngine()
- createFlexxEngine()
- YogaLayoutEngine, FlexxLayoutEngine types

Users don't know when/how to use these.

## Solution
Add documentation explaining:
- When to use each engine (Yoga for native, Flexx for pure JS)
- How to initialize and switch engines
- Performance implications