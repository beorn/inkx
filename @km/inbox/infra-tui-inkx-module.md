---
mentions:
  - km
id: "@km/inbox/infra-tui-inkx-module"
aliases:
  - km-infra-tui-inkx-module
  - "@km/_orphan/infra-tui-inkx-module"
created_at: 2026-01-28T13:46:09Z
closed_at: 2026-01-28T14:33:01Z
---

# [x] TUI/INKX module resolution causes separate instances @km/_orphan #bug #P2

When importing from @beorn/tui, the re-exported inkx components (Box, Text, renderSync, etc.) are different instances than when importing directly from @beorn/inkx. This causes issues like:

1. Layout engine set via tui.setLayoutEngine() doesn't affect inkx's state
2. React components from tui and inkx don't share context properly
3. renderString() in tui fails to render content

Root cause: vendor/beorn-tui/node_modules/inkx is a symlink to the bun-cached module, creating a different module identity than direct imports from vendor/beorn-inkx.

**Resolution approach changed:** Instead of absorbing inkx into tui, we're removing tui's dependency on inkx entirely (@km/term-2/5-remove-cross-dependencies-tui-term-must-not-depend). tui will have its own implementation.

Workaround: Import render functions directly from beorn-inkx instead of through beorn-tui.

