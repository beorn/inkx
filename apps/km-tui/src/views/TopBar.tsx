/**
 * TopBar component - wrapper for storybook compatibility
 *
 * The production Board.tsx uses renderTopBarContent() directly inline.
 * This component exists for storybook demonstrations.
 */
import React from "react"
import { Box, Text } from "@silvery/ag-react"
import { renderTopBarContent } from "./board-top-bar.ts"
import type { PathSegment } from "../layout/index.ts"

interface TopBarProps {
  segments: PathSegment[]
  width: number
  isBoardSelected?: boolean
}

export function TopBar({ segments, width, isBoardSelected = true }: TopBarProps): React.ReactElement {
  return (
    <Box width={width} paddingLeft={1} paddingRight={1} flexShrink={0}>
      <Text>{renderTopBarContent(segments, isBoardSelected)}</Text>
    </Box>
  )
}
