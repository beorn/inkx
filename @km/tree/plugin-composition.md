---
id: "@km/tree/plugin-composition"
aliases:
  - km-tree.plugin-composition
  - km-tree-plugin-composition
created_by: Bjørn Stabell
created_at: 2026-04-03T03:56:07Z
closed_at: 2026-04-03T04:23:11Z
close_reason: Shipped 7e3a1896. withHistory op-based undo/redo.
---

# [x] Phase 6: Plugin composition — withHistory, withNormalization, withVim decorators @km/tree #task #P3

SlateJS: withHistory(withReact(createEditor()))
km (today): withSync(config)(repo) — same decorator pattern, but only for sync.

Formalize: all tree/editor behaviors as decorator plugins.
- withHistory(editor) — op-based undo/redo (depends on Phase 4 operation model)
- withNormalization(editor) — auto-normalize after ops (depends on Phase 3)
- withVim(editor) — vim keybinding layer
- withSync(repo) — already done
- withFsWriter(repo) — already done

Plugin protocol: wrap editor.apply() to intercept operations.
Effects model (TEA) for side channels — more powerful than SlateJS's decorator-only model.

era2 alignment: plugins declare Provides/Requires, compose via pipe().