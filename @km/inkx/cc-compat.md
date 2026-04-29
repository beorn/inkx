---
id: "@km/inkx/cc-compat"
aliases:
  - km-inkx.cc-compat
  - km-inkx-cc-compat
created_by: claude:ee8efc0f
created_at: 2026-02-22T23:29:41Z
closed_at: 2026-02-22T23:55:05Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] CC compatibility: Transform component + useFocus shim @km/inkx #task #P2 @claude:ee8efc0f

Make inkx easier to adopt for Claude Code by adding missing API compatibility:

1. Transform component (10 uses in CC): ink component that applies a string transform function to rendered output. ~30 lines to implement — wraps children, captures rendered text, applies transform function.

2. useFocus/useFocusManager compatibility: CC uses ink's useFocus (1 use) and useFocusManager (1 use). inkx has useFocusable and createFocusManager with different APIs. Either: (a) add thin useFocus/useFocusManager shims that delegate to inkx equivalents, or (b) document migration path if inkx API is more ergonomic.

3. measureElement → useContentRect: CC uses measureElement(ref) which returns {width,height} synchronously. inkx's useContentRect is a hook (more powerful but different pattern). Document migration.

4. ink-progress: CC uses ink-progress (2 refs). Trivial to implement as a Box with fractional width.

Goal: minimize CC migration effort. If inkx API is strictly better, document the migration; if roughly equivalent, provide compat shims.