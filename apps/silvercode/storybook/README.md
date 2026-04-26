# Silvercode Storybook

Fixture-driven design surface for silvercode components.

Each component renders in isolation against a deterministic fake
(`createFakeAcpSession({ manual: true })` for stream-driven components,
hand-rolled props for static ones). The runner is a two-pane TUI: story
list on the left, focused story preview on the right.

This is the SCAFFOLD bead (`km-silvercode.acp-storybook`). It ships the
runner, the registry, and ~12 reference stories proving the pattern.
The full backlog of ~30 silvercode components and ~15 silvery primitives
lives in
[`hub/silvery/future/ai-terminal/component-parity-plan.md`](../../../hub/silvery/future/ai-terminal/component-parity-plan.md).
Add stories there as those components ship.

## Run

```bash
bun storybook                          # interactive runner
bun storybook ToolCallBlock/bash       # open one story directly
```

Keys inside the runner:

- `j` / `k` — move story cursor
- `Tab` / `h` / `l` — switch focus between list and preview
- `?` — toggle help
- `q` / `Ctrl-C` — quit

## Structure

```
storybook/
  README.md                # you are here
  runner.tsx               # entry point; the two-pane TUI
  registry.ts              # static list of every story (add new ones here)
  types.ts                 # Story / Knob types
  stories/                 # one *.story.tsx per (component, variant)
  support/                 # shared fixtures and stubs
    fake-session-handle.ts # synthetic SessionHandle for components that need one
    sample-messages.ts     # MessageEntry[] fixtures for MessageList variants
  tests/
    registry.test.ts       # unique ids, knob defaults, etc.
    stories.test.tsx       # smoke-render every story
```

## Add a story

1. Create `stories/<Component>.<variant>.story.tsx`. Export a `Story`:

   ```tsx
   import React from "react"
   import { MyComponent } from "../../src/components/MyComponent.tsx"
   import type { Story } from "../types.ts"

   export const myComponentBasic: Story = {
     id: "MyComponent/basic",
     component: "MyComponent",
     variant: "basic",
     description: "What this variant demonstrates.",
     knobs: [
       {
         kind: "select",
         id: "size",
         label: "Size",
         options: ["small", "large"],
         default: "small",
       },
     ],
     render(knobs) {
       return <MyComponent size={knobs.size as "small" | "large"} />
     },
   }
   ```

2. Append it to `STORIES` in `registry.ts`. Both test files pick it up
   automatically — no further wiring.

## Drive a story from the ACP fake

For components that consume an `AcpSession` (signals from
`createAcpSession`) rather than plain props, build the session inside
`render()`:

```tsx
import { createFakeAcpSession, loadFixture } from "@km/agent-harness"
import { createAcpSession } from "@km/agent-harness"
import { createScope } from "@silvery/scope"

render() {
  const scope = createScope("story")
  const fake = createFakeAcpSession({
    script: loadFixture("streaming-text"),
    manual: true,
  })
  fake.drain()
  const acp = createAcpSession(scope, fake)
  return <MyComponent session={acp} />
}
```

The `manual: true` driver disables timers, and `drain()` fires every
scripted step synchronously — exactly what tape-recording and unit
tests want.

Available fixtures (in
`apps/silvercode/packages/agent-harness/src/fake-fixtures/`):

- `minimal-prompt.json`
- `streaming-text.json`
- `tool-call-with-permission.json`
- `multi-tool-with-fs.json`
- `rejection-flow.json`
- `error-flow.json`

## Use sample data without ACP

For higher-order components like `MessageList` that take post-aggregation
shapes (`MessageEntry[]`), prefer `support/sample-messages.ts`. It
contains hand-rolled message arrays — easier to iterate on than raw
event scripts when you're tuning row layouts.

## Smoke tests

`tests/stories.test.tsx` mounts every registered story via
`@silvery/test createRenderer` at 80×24 and asserts the render path
doesn't throw. It's the cheapest possible safety net for catching
"refactor broke a component on a story-only path." Run it with:

```bash
bun vitest run apps/silvercode/storybook/tests/
```

`tests/registry.test.ts` enforces structural rules: unique story ids,
declared knob types match defaults, etc.

## Tape recording (queued)

Visual-regression tape recording (mdspec / silvery's tape pattern) is
not wired up in this scaffold. The `stories.test.tsx` smoke harness is a
deliberate placeholder — once the component-parity-plan stories
stabilize, swap the no-op assertions for snapshot tape comparisons.
Pointer: `vendor/silvery/packages/mdspec/` and km-tui's
`apps/km-tui/tests/showcase.spec.ts` for the canonical assertion API.

## Why a custom runner instead of reusing silvery's storybook?

Silvery ships its own storybook
(`vendor/silvery/examples/apps/storybook/`), but it is purpose-built for
the design-system explorer (3-pane theme/scheme/token playground) — not
a generic story registry. Reusing its frame would force silvercode
stories into a theme-token-centric layout that doesn't fit chat /
session / dialog surfaces. The silvercode runner is ~100 LOC of glue
over the same `silvery` + `SelectList` primitives the silvery storybook
uses, so we get the same look-and-feel without the structural
assumptions.
