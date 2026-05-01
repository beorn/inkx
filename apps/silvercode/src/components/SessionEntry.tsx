import React from "react"
import { Box, Text } from "silvery"

export function SessionEntry({
  children,
  marker = " ",
  markerColor,
  gap = 1,
  width = "90%",
}: {
  children: React.ReactNode
  marker?: React.ReactNode
  markerColor?: string
  gap?: number
  width?: number | `${number}%`
}): React.ReactElement {
  const markerNode = React.isValidElement(marker) ? marker : <Text color={markerColor}>{marker}</Text>
  return (
    <Box flexDirection="row" gap={gap} width={width} maxWidth={width} flexShrink={0} minWidth={0}>
      <Box width={1} flexShrink={0}>
        {markerNode}
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        {children}
      </Box>
    </Box>
  )
}
