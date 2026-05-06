---
mentions:
  - km
---

# [x] Phase 6: Plugin composition — withHistory, withNormalization, withVim decorators @km/storage/tree #task #P3

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

