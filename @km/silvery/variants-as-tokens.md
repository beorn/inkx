---
mentions:
  - km
  - Bjørn
id: "@km/silvery/variants-as-tokens"
aliases:
  - km-silvery.variants-as-tokens
  - km-silvery-variants-as-tokens
created_by: Bjørn Stabell
created_at: 2026-04-18T17:45:10Z
closed_at: 2026-04-18T19:18:53Z
close_reason: Shipped at silvery commit dd96be99 + km bump 921c00eec. <Text
  variant='h1'> resolves theme.variants[name] as defaults, caller props win.
  ThemeProvider deep-merges variants. 15 new tests in
  vendor/silvery/tests/features/variants.test.tsx pass at SILVERY_STRICT=2.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-silvery.variants-as-tokens
    depends_on_id: km-silvery.theme-system-v2
    type: parent-child
    created_at: 2026-04-18T10:45:12Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.theme-system-v2
---

# [x] <Text variant='h1'> — typography presets as theme tokens @km/silvery #task #P3 @Bjørn Stabell

blocks:: [[@km/silvery/theme-system-v2]]

Typography presets (H1, H2, Small, Strong, Em, …) become first-class theme tokens. <Text variant='h1'> resolves to { color: $primary, bold: true } at render time.\n\nVariants (part of Theme):\n- h1/h2/h3/body/body-muted/fine-print/strong/em/link/key/code/kbd\n- Apps extend via tokens={{ variants: { hero: {…} } }}\n\nExisting <H1>/<Small>/etc React components stay, become thin wrappers over <Text variant=…>. Backwards-compatible.\n\nDepends on: tokens-prop-provider\nSpec: hub/silvery/design/v10-terminal/theme-system-v2-plan.md#p5

