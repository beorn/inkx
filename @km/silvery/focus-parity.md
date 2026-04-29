---
id: "@km/silvery/focus-parity"
aliases:
  - km-silvery.focus-parity
  - km-silvery-focus-parity
created_by: Bjørn Stabell
created_at: 2026-04-09T14:38:33Z
closed_at: 2026-04-09T15:35:01Z
close_reason: "Design done
  (vendor/internal/silvery/design/v-undecided/focus-parity.md). Implementation
  shipped as part of km-silvery.focus-unify. Remaining: InkFocusContext deletion
  tracked in km-silvery.focus epic."
---

# [x] Review silvery focus vs Ink's useFocus — API parity check @km/silvery #task #P1 @Bjørn Stabell

Ink 7.0 has useFocus and useFocusManager. Silvery has withFocus() provider with FocusManager. Review for API parity and migration friendliness.

## Investigation

### Ink's API
- node_modules/ink/build/hooks/use-focus.d.ts
- node_modules/ink/build/hooks/use-focus-manager.d.ts

Ink patterns:
\`\`\`tsx
const { isFocused } = useFocus({ autoFocus: true, id: 'my-input' })
const { focus, focusNext, focusPrevious } = useFocusManager()
\`\`\`

### Silvery's API
- vendor/silvery/packages/ag-term/src/features/focus/ (FocusManager)
- withFocus() provider activates it
- Tab/Shift+Tab navigation, scope support

### Compare
1. Hook names and signatures
2. autoFocus behavior
3. id vs testID semantics
4. focus navigation APIs
5. Scope/group management (silvery has scopes, Ink doesn't?)

## Decisions

1. **Does silvery expose a useFocus hook?** If not, add one (matches Ink's API)
2. **useFocusManager** — does silvery have an equivalent? What does it return?
3. **Should we add autoFocus prop support?** Ink has this.
4. **Migration guide**: how does a user port from Ink's useFocus to silvery?

## Keep silvery's unique features
- Focus scopes (withFocus activate/deactivate)
- Focus features like Ctrl+F find, Esc+v copy mode
- InputLayerProvider integration
- These go BEYOND Ink's focus management — preserve them

## Output
- Decision: add useFocus/useFocusManager hooks or not
- API diff document
- PR if changes needed
- Migration guide entry