import React, { useState } from "react"
import type { Story } from "@silvery/storybook"
import {
  Box,
  Muted,
  Small,
  SplitPane,
  Text,
  resolveSplitPaneLayout,
  type SplitPaneDirection,
} from "silvery"

const NATURAL_PRIMARY = { width: 80, height: 12 } as const
const NATURAL_SECONDARY = { width: 72, height: 12 } as const

interface SplitPaneStoryProps {
  direction?: SplitPaneDirection
  initialRatio?: number
  minPrimarySize?: number
  minSecondarySize?: number
  secondaryCollapsed?: boolean
  status: string
}

function pane(label: string, backgroundColor: string): React.ReactElement {
  return (
    <Box flexGrow={1} paddingX={1} backgroundColor={backgroundColor}>
      <Text>{label}</Text>
    </Box>
  )
}

function SplitPaneStory({
  direction = "row",
  initialRatio = 0.55,
  minPrimarySize = 12,
  minSecondarySize = 12,
  secondaryCollapsed = false,
  status,
}: SplitPaneStoryProps): React.ReactElement {
  const [ratio, setRatio] = useState(initialRatio)
  return (
    <Box flexDirection="column" width="100%" height={8}>
      <Box gap={1}>
        <Small>{status}</Small>
        <Muted>ratio {ratio.toFixed(2)}</Muted>
      </Box>
      <SplitPane
        direction={direction}
        ratio={ratio}
        onRatioChange={setRatio}
        minPrimarySize={minPrimarySize}
        minSecondarySize={minSecondarySize}
        secondaryCollapsed={secondaryCollapsed}
        primary={pane("Timeline", "$bg-surface-subtle")}
        secondary={pane("Detail", "$bg-muted")}
      />
    </Box>
  )
}

function NaturalFitLadderStory(): React.ReactElement {
  const examples = [
    { label: "wide", availableWidth: 153, availableHeight: 24 },
    { label: "medium", availableWidth: 100, availableHeight: 25 },
    { label: "compact", availableWidth: 80, availableHeight: 24 },
  ] as const

  return (
    <Box flexDirection="column" width="100%">
      {examples.map((example) => {
        const layout = resolveSplitPaneLayout({
          ...example,
          primary: NATURAL_PRIMARY,
          secondary: NATURAL_SECONDARY,
          dividerSize: 1,
          preferredDirection: "row",
        })
        return (
          <Box key={example.label} gap={1}>
            <Text>{example.label}</Text>
            <Muted>→ {layout}</Muted>
          </Box>
        )
      })}
    </Box>
  )
}

export const SPLIT_PANE_STORIES: readonly Story[] = [
  {
    id: "SplitPane/row-resizable",
    component: "SplitPane",
    variant: "row-resizable",
    description: "Primary and secondary panes side by side with a draggable vertical sash.",
    expectedTokens: ["row resizable", "Timeline", "Detail"],
    render: () => <SplitPaneStory status="row resizable" />,
  },
  {
    id: "SplitPane/column-resizable",
    component: "SplitPane",
    variant: "column-resizable",
    description: "Primary above secondary with a draggable horizontal sash.",
    expectedTokens: ["column resizable", "Timeline", "Detail"],
    render: () => <SplitPaneStory direction="column" status="column resizable" />,
  },
  {
    id: "SplitPane/min-clamped",
    component: "SplitPane",
    variant: "min-clamped",
    description: "An out-of-range controlled ratio resolves to explicit cell minimums.",
    expectedTokens: ["minimum 12 cells", "Timeline", "Detail"],
    render: () => <SplitPaneStory initialRatio={0.05} status="minimum 12 cells" />,
  },
  {
    id: "SplitPane/collapsed",
    component: "SplitPane",
    variant: "collapsed",
    description: "The secondary subtree stays mounted while its layout and sash are hidden.",
    expectedTokens: ["secondary collapsed", "Timeline"],
    render: () => <SplitPaneStory secondaryCollapsed status="secondary collapsed" />,
  },
  {
    id: "SplitPane/restored",
    component: "SplitPane",
    variant: "restored",
    description: "A restored secondary pane returns at the caller's preserved ratio.",
    expectedTokens: ["secondary restored", "Timeline", "Detail"],
    render: () => <SplitPaneStory initialRatio={0.68} status="secondary restored" />,
  },
  {
    id: "SplitPane/natural-fit-ladder",
    component: "SplitPane",
    variant: "natural-fit-ladder",
    description: "Caller-known natural sizes resolve row, column, then single-pane drill-in.",
    expectedTokens: ["wide", "row", "medium", "column", "compact", "single"],
    render: () => <NaturalFitLadderStory />,
  },
]
