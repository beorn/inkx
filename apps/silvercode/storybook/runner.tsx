/**
 * Silvercode Storybook — runner.
 *
 * Two-pane TUI: story list on the left, focused story on the right.
 * j/k navigate the list, h/l switch focus, q quits, ? toggles help.
 *
 * Why the runner is intentionally minimal: stories are the design
 * surface; the runner is just a way to flip between them. Each story
 * owns its render (including knob defaults) so we don't bake a knob UI
 * into v1. Stories with knobs document them for future expansion;
 * `--story=<id>` and the test suite both bypass the runner anyway.
 *
 * Bead: km-silvercode.acp-storybook
 */

import React, { useMemo, useState } from "react"
import { Box, Divider, Muted, Screen, SelectList, Strong, Text, useApp, useInput, type Key } from "silvery"
// `Divider` here renders the horizontal rule under the story header. The
// vertical separator between panes is the implicit layout boundary.
import { createTerm } from "silvery"
import { run } from "silvery/runtime"
import { STORIES, findStory } from "./registry.ts"
import { resolveKnobs, type Story } from "./types.ts"

type Focus = "list" | "preview"

const LIST_PANE_WIDTH = 34
const LIST_LABEL_WIDTH = LIST_PANE_WIDTH - 4

function truncateLabel(label: string, width: number): string {
  if (label.length <= width) return label
  if (width <= 1) return "…"
  return `${label.slice(0, width - 1)}…`
}

interface AppProps {
  /** Optional: open this story id directly (skip the list cursor). */
  initialStoryId?: string
}

export function StorybookApp({ initialStoryId }: AppProps): React.ReactElement {
  const { exit } = useApp()
  const [focus, setFocus] = useState<Focus>("list")
  const [cursor, setCursor] = useState(() => {
    if (!initialStoryId) return 0
    const idx = STORIES.findIndex((s) => s.id === initialStoryId)
    return idx < 0 ? 0 : idx
  })
  const [showHelp, setShowHelp] = useState(false)

  const story: Story | null = STORIES[cursor] ?? null

  useInput((input: string, key: Key) => {
    if (showHelp) {
      setShowHelp(false)
      return
    }
    if (input === "q" || (key.ctrl && input === "c")) return exit()
    if (input === "?") return setShowHelp(true)

    if (key.tab || input === "h" || input === "l") {
      setFocus((f) => (f === "list" ? "preview" : "list"))
      return
    }
    if (focus === "list") {
      if (input === "j" || key.downArrow) setCursor((c) => Math.min(STORIES.length - 1, c + 1))
      else if (input === "k" || key.upArrow) setCursor((c) => Math.max(0, c - 1))
    }
  })

  if (showHelp) {
    return (
      <Screen flexDirection="column">
        <Box flexDirection="column" paddingY={1}>
          <Strong>Silvercode Storybook — keys</Strong>
          <Box flexDirection="column">
            <Text>j / k or ↓ / ↑ — move story cursor</Text>
            <Text>Tab / h / l — switch focus (list / preview)</Text>
            <Text>? — toggle this help</Text>
            <Text>q / Ctrl-C — quit</Text>
          </Box>
          <Box>
            <Muted>Press any key to dismiss.</Muted>
          </Box>
        </Box>
      </Screen>
    )
  }

  return (
    <Screen flexDirection="row">
      <Box
        id="storybook-list-pane"
        flexDirection="column"
        width={LIST_PANE_WIDTH}
        flexGrow={0}
        flexShrink={0}
        minWidth={LIST_PANE_WIDTH}
        maxWidth={LIST_PANE_WIDTH}
        overflow="hidden"
        backgroundColor="$bg-surface-subtle"
        paddingY={1}
        userSelect="contain"
      >
        <Box flexDirection="row" gap={1} paddingBottom={1}>
          <Strong>Stories</Strong>
          <Muted>{STORIES.length}</Muted>
        </Box>
        <Box flexDirection="column" flexGrow={1} minHeight={0}>
          <SelectList
            items={STORIES.map((s) => ({ label: truncateLabel(s.id, LIST_LABEL_WIDTH), value: s.id }))}
            highlightedIndex={cursor}
            onHighlight={setCursor}
            onSelect={(opt) => {
              const idx = STORIES.findIndex((s) => s.id === opt.value)
              if (idx >= 0) setCursor(idx)
            }}
            isActive={focus === "list"}
            maxVisible={20}
          />
        </Box>
        <Box>
          <Muted>{focus === "list" ? "list" : "preview"} focus</Muted>
        </Box>
      </Box>
      <Box flexDirection="column" width={1} flexGrow={0} flexShrink={0} backgroundColor="$border" />
      <Box
        id="storybook-preview-pane"
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        minHeight={0}
        overflow="hidden"
        paddingY={1}
        userSelect="contain"
      >
        {story ? <StoryFrame story={story} /> : <Muted>No stories registered.</Muted>}
      </Box>
    </Screen>
  )
}

function StoryFrame({ story }: { story: Story }): React.ReactElement {
  const knobs = useMemo(() => resolveKnobs(story), [story])
  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0}>
      <Box flexDirection="row" gap={1}>
        <Strong>{story.id}</Strong>
        <Muted>— {story.description}</Muted>
      </Box>
      {(story.knobs ?? []).length > 0 && (
        <Box flexDirection="row" gap={1}>
          <Muted>knobs:</Muted>
          {(story.knobs ?? []).map((k) => (
            <Muted key={k.id}>
              {k.label}={String(knobs[k.id])}
            </Muted>
          ))}
        </Box>
      )}
      <Divider />
      {/* Story render area — `overflow="scroll"` so wheel events scroll
          the content vertically when it overflows the pane. The story
          itself owns horizontal scroll if any. `userSelect="contain"`
          (already set on the surrounding pane) scopes selection drags
          to this pane so a drag here can't extend into the list pane. */}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} overflow="scroll">
        {story.render(knobs)}
      </Box>
    </Box>
  )
}

/**
 * Entry point. Run via `bun apps/silvercode/storybook/runner.tsx` or the
 * `bun storybook` script. Optional first argv: a story id to open directly
 * (e.g. `bun storybook ToolCall/read`).
 */
export async function main(): Promise<void> {
  const initial = process.argv[2]
  if (initial && !findStory(initial)) {
    process.stderr.write(`unknown story: ${initial}\n`)
    process.stderr.write(`available: ${STORIES.map((s) => s.id).join(", ")}\n`)
    process.exitCode = 1
    return
  }
  using term = createTerm()
  const handle = await run(<StorybookApp initialStoryId={initial} />, term)
  await handle.waitUntilExit()
}

if (import.meta.main) {
  await main()
}
