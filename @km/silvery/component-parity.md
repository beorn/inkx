---
id: "@km/silvery/component-parity"
aliases:
  - km-silvery.component-parity
  - km-silvery-component-parity
created_by: claude:e8fd4b92
created_at: 2026-03-10T21:21:22Z
---

# [ ] Component parity: adopt shadcn-level features across all input/form components @km/silvery #task #P2

Audit all silvery UI components against shadcn/ui and adopt missing standard features.

## Already done
- TextInput: `borderStyle`/`borderColor`/`focusBorderColor` — auto focus ring
- `$token` semantic colors throughout showcases

## Missing features to add

### TextInput & TextArea (shared)
- **Focus ring** (border that changes on focus) — done for TextInput, add to TextArea
- **Disabled state styling** — dim text + muted border when disabled
- **Error/validation state** — `error?: boolean` or `variant="error"` → `$error` border
- **Size variants** — `size="compact" | "default" | "spacious"` for density
- **Character counter** — `showCount` with `maxLength` → "3/100" display
- **Integrated label** — `label` prop wraps in FormField automatically
- **Placeholder color** — use `$muted` token (currently uses `dimColor`)

### TextArea only
- **Auto-resize** — grows to fit content (no fixed height required)

### All components
- **Default `$token` colors everywhere** — no component should require manual color props for standard usage
- **Focus system defaults** — components should look right out of the box with focus/unfocus states
- **Consistent disabled styling** — dim + muted border + no interaction

## Approach
Extract shared input features (border, focus ring, disabled, error, label) into a shared utility/wrapper that both TextInput and TextArea use. Don't duplicate.

## Reference
- shadcn/ui Input: focus ring-2, disabled opacity-50, file: variants
- shadcn/ui Textarea: same + auto-resize via CSS (we use scroll tracking)
- silvery FormField: already has label + error + description