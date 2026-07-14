/**
 * ComponentPreview — middle pane.
 *
 * Live preview of silvery's canonical components under the currently selected
 * scheme. Everything here reads semantic $tokens; no hex values in JSX.
 *
 * Eats its own dogfood — every section uses real silvery primitives:
 * <Banner>, <Alert>, <TextInput>, <TextArea>, <SelectList>, <Toggle>,
 * <Spinner>, <ProgressBar>, <Badge>, <Blockquote>, <CodeBlock>, <UL>,
 * <OL>, <Code>. No locally-drawn approximations.
 *
 * All components sit inside an outer `<ThemeProvider theme={legacyTheme}>`
 * at the App root — swapping schemes there re-renders the whole tree.
 */

import React, { useState } from "react"
import {
  Box,
  Text,
  Muted,
  Small,
  Kbd,
  Divider,
  H1,
  H2,
  H3,
  P,
  Blockquote,
  CodeBlock,
  Code,
  UL,
  OL,
  Badge,
  Banner,
  Alert,
  Button,
  SelectList,
  Spinner,
  ProgressBar,
  TextInput,
  TextArea,
  Toggle,
  useKineticScroll,
  type SelectOption,
} from "silvery"
import { IntentDemo } from "./IntentDemo.tsx"
import { SPLIT_PANE_STORIES } from "./stories/SplitPane.story.tsx"
import { UrgencyDemo } from "./UrgencyDemo.tsx"

// Sample data kept tiny so the pane always fits.
const SELECT_ITEMS: SelectOption[] = [
  { label: "TypeScript", value: "ts" },
  { label: "Rust", value: "rs" },
  { label: "Python", value: "py" },
  { label: "Elixir", value: "ex" },
]

export interface ComponentPreviewProps {
  schemeName: string
  mode: "light" | "dark"
}

export function ComponentPreview({ schemeName, mode }: ComponentPreviewProps): React.ReactElement {
  const [selectIdx, setSelectIdx] = useState(0)
  const [searchValue, setSearchValue] = useState("")
  const [projectValue, setProjectValue] = useState("km-tui")
  const [notesValue, setNotesValue] = useState(
    "Multi-line notes go here…\nWord-wrap, scroll, kill-ring all built in.",
  )
  const [darkMode, setDarkMode] = useState(true)
  const [autosave, setAutosave] = useState(false)
  // Wheel over the preview pane scrolls its viewport with iOS-style kinetic
  // momentum. The layout phase clamps `scrollOffset` to a valid range so we
  // don't need to know content height up-front.
  const { scrollOffset, onWheel } = useKineticScroll()

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor="$border-default"
      overflow="scroll"
      overflowIndicator
      userSelect="contain"
      scrollOffset={scrollOffset}
      onWheel={onWheel}
    >
      <Box paddingX={1} gap={1}>
        <Text bold color="$fg-accent">
          COMPONENTS
        </Text>
        <Muted>·</Muted>
        <Muted>{schemeName}</Muted>
        <Muted>·</Muted>
        <Muted>{mode}</Muted>
      </Box>
      <Divider />
      <Box flexDirection="column" paddingX={1} gap={0}>
        {/* Typography ramp — H1..H3, paragraph, blockquote, lists, code blocks */}
        <H1>Sterling Storybook</H1>
        <H2>Semantic tokens, one theme</H2>
        <H3>Heading three</H3>
        <P>
          A paragraph of body text under the active scheme. Inline{" "}
          <Text color="$fg-accent">accent</Text>, <Text color="$fg-info">info</Text>,{" "}
          <Text color="$fg-success">success</Text>, <Text color="$fg-warning">warning</Text>, and{" "}
          <Text color="$fg-error">error</Text>. Inline <Code>monospace</Code> renders with the muted
          background.
        </P>
        <Muted>Muted secondary text</Muted>

        <Blockquote>
          The right palette is the one that disappears — readers see the content, not the colors.
        </Blockquote>

        <Box flexDirection="row" gap={2} flexWrap="wrap">
          <Box flexDirection="column">
            <Small>
              <Muted>UNORDERED</Muted>
            </Small>
            <UL>
              <Text>First item</Text>
              <Text>Second item</Text>
              <Text>Third item</Text>
            </UL>
          </Box>
          <Box flexDirection="column">
            <Small>
              <Muted>ORDERED</Muted>
            </Small>
            <OL>
              <Text>Pick a scheme</Text>
              <Text>Inspect tokens</Text>
              <Text>Ship the theme</Text>
            </OL>
          </Box>
        </Box>

        <CodeBlock>{`import { ThemeProvider } from "silvery"\n\n<ThemeProvider theme={sterling}>\n  <App />\n</ThemeProvider>`}</CodeBlock>

        <Divider />

        {/* Badges */}
        <Box flexDirection="column" gap={0}>
          <Small>
            <Muted>BADGES</Muted>
          </Small>
          <Box gap={1} flexWrap="wrap">
            <Badge label="default" variant="default" />
            <Badge label="primary" variant="primary" />
            <Badge label="success" variant="success" />
            <Badge label="warning" variant="warning" />
            <Badge label="error" variant="error" />
          </Box>
        </Box>

        <Divider />

        {/* Alert demos — real silvery <Banner> for each status variant.
            Two columns at typical widths; flexWrap collapses to one column on narrow terms. */}
        <Box flexDirection="column" gap={0}>
          <Small>
            <Muted>ALERTS</Muted>
          </Small>
          <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="flex-start">
            <Box flexDirection="column" gap={0} width={38}>
              <Banner variant="error">
                Build failed — type-check caught 2 errors in src/app.ts
              </Banner>
              <Banner variant="warning">Deprecated API — useInput migrate to useKey</Banner>
            </Box>
            <Box flexDirection="column" gap={0} width={38}>
              <Banner variant="success">Tests passed — 143 specs green in 2.4s</Banner>
              <Banner variant="info">Press ? for keyboard shortcuts</Banner>
            </Box>
          </Box>
        </Box>

        <Divider />

        {/* Surface hierarchy */}
        <Box flexDirection="column" gap={0}>
          <Small>
            <Muted>SURFACES</Muted>
          </Small>
          <Box gap={0} flexDirection="column">
            <Box backgroundColor="$bg" paddingX={2}>
              <Text>surface.default ($bg)</Text>
            </Box>
            <Box backgroundColor="$bg-surface-subtle" paddingX={2}>
              <Text>surface.subtle</Text>
            </Box>
            <Box backgroundColor="$bg-surface-hover" paddingX={2}>
              <Text>surface.hover</Text>
            </Box>
            <Box backgroundColor="$bg-muted" paddingX={2}>
              <Text>muted.bg</Text>
            </Box>
          </Box>
        </Box>

        <Divider />

        {/* Input + list — real silvery TextInput + SelectList. */}
        <Box flexDirection="column" gap={0}>
          <Small>
            <Muted>INPUT · LIST</Muted>
          </Small>
          <Box flexDirection="row" gap={2} flexWrap="wrap" alignItems="flex-start">
            <Box flexDirection="column" minWidth={20}>
              <Muted>focused input</Muted>
              <Box borderStyle="single" borderColor="$fg-accent" paddingX={1} width={28}>
                <TextInput
                  value={searchValue}
                  onChange={setSearchValue}
                  placeholder="Type to filter..."
                  isActive={true}
                />
              </Box>
            </Box>
            <Box flexDirection="column" minWidth={20}>
              <Muted>blurred input</Muted>
              <Box borderStyle="single" borderColor="$border-default" paddingX={1} width={28}>
                <TextInput value={projectValue} onChange={setProjectValue} isActive={false} />
              </Box>
            </Box>
            <Box flexDirection="column" minWidth={20}>
              <Muted>select list</Muted>
              <Box borderStyle="single" borderColor="$border-default" paddingX={1}>
                <SelectList
                  items={SELECT_ITEMS}
                  highlightedIndex={selectIdx}
                  onHighlight={setSelectIdx}
                  isActive={false}
                  indicator="▸ "
                />
              </Box>
            </Box>
          </Box>

          {/* Multi-line input + toggles — close the input-component gap. */}
          <Box flexDirection="row" gap={2} flexWrap="wrap" alignItems="flex-start">
            <Box flexDirection="column" minWidth={28}>
              <Muted>text area</Muted>
              <Box borderStyle="single" borderColor="$border-default" paddingX={1} width={40}>
                <TextArea
                  value={notesValue}
                  onChange={setNotesValue}
                  isActive={false}
                  minRows={3}
                  maxRows={5}
                />
              </Box>
            </Box>
            <Box flexDirection="column" gap={0} minWidth={20}>
              <Muted>toggles (Switch alias)</Muted>
              <Toggle value={darkMode} onChange={setDarkMode} label="Dark mode" isActive={false} />
              <Toggle value={autosave} onChange={setAutosave} label="Autosave" isActive={false} />
            </Box>
          </Box>
        </Box>

        <Divider />

        {/* Indicators */}
        <Box flexDirection="column" gap={0}>
          <Small>
            <Muted>INDICATORS</Muted>
          </Small>
          <Box gap={2}>
            <Box gap={1}>
              <Spinner />
              <Text>Loading…</Text>
            </Box>
            <Box gap={1}>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
              <Muted>open palette</Muted>
            </Box>
          </Box>
          <Box width={40}>
            <ProgressBar value={0.68} />
          </Box>
        </Box>

        <Divider />

        {/* SplitPane — one registered story per public layout state. */}
        <Box flexDirection="column" gap={1}>
          <Small>
            <Muted>SPLIT PANE</Muted>
          </Small>
          {SPLIT_PANE_STORIES.map((story) => (
            <Box key={story.id} flexDirection="column" gap={0}>
              <Muted>{story.id}</Muted>
              {story.render({})}
            </Box>
          ))}
        </Box>

        <Divider />

        {/* Modal — real silvery <Alert> with composed Title/Body/Actions.
            Inline-rendered via `open` so it composes in the pane (not a floating overlay). */}
        <Box flexDirection="column" gap={0}>
          <Small>
            <Muted>MODAL DIALOG</Muted>
          </Small>
          <Alert variant="error" open onClose={() => {}} width={52}>
            <Alert.Title>Confirm destructive action</Alert.Title>
            <Alert.Body>Delete 3 items — this cannot be undone.</Alert.Body>
            <Alert.Actions>
              <Button label="Delete" variant="destructive" onPress={() => {}} />
              <Button label="Cancel" variant="accent" onPress={() => {}} />
            </Alert.Actions>
          </Alert>
        </Box>

        <Divider />

        {/* Feature 3 — Intent vs role (Sterling preflight decision D1) */}
        <IntentDemo />

        <Divider />

        {/* Feature 4 — Urgency is not a token */}
        <UrgencyDemo />
      </Box>
    </Box>
  )
}
