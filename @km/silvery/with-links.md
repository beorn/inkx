---
mentions:
  - km
  - claude
id: "@km/silvery/with-links"
aliases:
  - km-silvery.with-links
  - km-silvery-with-links
created_by: claude:656602a3
created_at: 2026-03-17T06:17:32Z
closed_at: 2026-03-17T07:37:24Z
close_reason: "Created withLinks plugin in
  vendor/silvery/packages/tea/src/with-links.ts. Follows
  withCommands/withKeybindings pattern: dual calling convention (direct +
  curried for pipe), LinkEventBus interface, runtime-swappable handler, dispose
  cleanup. Exported from @silvery/tea."
owner: bjorn@stabell.org
assignee: claude:656602a3
---

# [x] withLinks plugin: link activation, navigation, and open effects @km/silvery #feature #P2 @claude:656602a3

Link interaction should be a silvery plugin (like withCommands, withKeybindings):

```tsx
const app = withLinks(run(<Board />), {
  onOpen: (href) => Bun.spawn(['open', href]),
  onNavigate: (href) => dispatch({ type: 'NAVIGATE', href }),
})
```

The plugin would:

- Subscribe to 'link:open' events from Link components
- Route external URLs (http/https) to onOpen handler
- Route internal URLs (km://, app://) to onNavigate handler
- Expose modifier state (Cmd held) as part of the link activation context
- Handle link preview on hover (status bar shows URL)

Current approach: useLinkOpen hook in BoardApp + Bun.spawn. This works but couples the app to the runtime and doesn't compose well.

TEA vision: Link clicks produce effects, not side effects. The withLinks plugin converts 'link:open' events into dispatched actions that flow through the TEA update loop. See docs/design/tea-state-machines.md.

Key insight: mouse events + modifier state + link activation = three systems that need to compose. The withLinks plugin is the composition point.

