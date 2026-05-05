import React from "react"
import { Text, TextShimmer } from "silvery"

export function StatusGlyph({
  glyph,
  active = false,
  color = "$muted",
  period,
  backgroundColor,
}: {
  glyph: string
  active?: boolean
  color?: string
  period?: number
  backgroundColor?: string
}): React.ReactElement {
  if (active) {
    return (
      <TextShimmer active highColor={color} lowColor="$muted" period={period} backgroundColor={backgroundColor}>
        {glyph}
      </TextShimmer>
    )
  }
  return (
    <Text color={color} backgroundColor={backgroundColor}>
      {glyph}
    </Text>
  )
}
