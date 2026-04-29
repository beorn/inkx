---
id: "@km/_orphan/hcef"
aliases:
  - km-hcef
created_at: 2026-01-19T14:37:31Z
closed_at: 2026-01-19T15:08:10Z
---

# [x] Rename inkz→inkx and add pluggable flexx layout engine @km/_orphan #epic #P2

## Summary

Rename `inkz` to `inkx` and make the layout engine pluggable so `flexx` (pure JS) can be used as an alternative to Yoga WASM.

## Scope

### 1. Rename inkz → inkx

**Code changes:**
- [ ] Rename `vendor/beorn-inkz/` → `vendor/beorn-inkx/`
- [ ] Update package.json: `@beorn/inkz` → `@beorn/inkx`
- [ ] Update all internal imports and references
- [ ] Update workspace references in root package.json
- [ ] Update tsconfig paths if any

**Documentation:**
- [ ] Update all docs/ references to inkz
- [ ] Update CLAUDE.md references
- [ ] Update any README files

**Beads:**
- [ ] Update any beads referencing inkz

**External:**
- [ ] Create GitHub repo `beorn/inkx` (or update existing `beorn/inkz`)
- [ ] Update npm package name (if published)
- [ ] Redirect/deprecate old names if needed

### 2. Make layout engine pluggable

**Architecture:**
- [ ] Define `LayoutEngine` interface in inkx that abstracts Yoga API
- [ ] Keep Yoga WASM as the default (production) backend
- [ ] Allow flexx as an alternative backend for non-WASM environments
- [ ] `setLayoutEngine(engine)` or similar API to switch backends

**Interface (minimal):**
```typescript
interface LayoutEngine {
  Node: {
    create(): LayoutNode;
  };
  // Constants
  FLEX_DIRECTION_ROW: number;
  FLEX_DIRECTION_COLUMN: number;
  // ... etc
}
```

### 3. Create flexx (separate bead: flexx-base)

The flexx layout engine is tracked in flexx-base.

### 4. Validation

- [ ] inkx works with Yoga (default, no changes to behavior)
- [ ] inkx works with flexx when explicitly configured
- [ ] All @km/tui views render identically with both backends
- [ ] All existing tests pass

## Dependencies

- Depends on: flexx-base (flexx implementation)

## Success Criteria

1. `@beorn/inkx` package works as drop-in replacement for `@beorn/inkz`
2. Layout engine is pluggable (Yoga default, flexx optional)
3. All documentation updated consistently
4. GitHub repos created/renamed
5. Zero breaking changes to @km/tui consumers