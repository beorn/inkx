---
id: "@km/silvery/rest-pattern"
aliases:
  - km-silvery.rest-pattern
  - km-silvery-rest-pattern
created_by: claude:656602a3
created_at: 2026-03-16T21:10:46Z
closed_at: 2026-03-16T21:29:13Z
close_reason: "Applied ...rest prop forwarding to 16 components: Badge, Spinner,
  Button, Toggle, H1-HR (12 Typography). Tests: 1827 pass."
---

# [x] Apply ...rest prop forwarding pattern across silvery components @km/silvery #task #P2

Components like Link manually list props instead of extending their underlying component's props and forwarding ...rest. Pattern: `interface FooProps extends Omit<TextProps, 'children'> { ... }` + `function Foo({ specific, ...rest }: FooProps)` → `<Text {...rest}>`. Link is being updated as part of the hover effects plan. Audit remaining components (Button, Badge, etc.) and apply the same pattern where applicable.