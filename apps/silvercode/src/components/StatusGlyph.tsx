import React from "react"
import { Text, TextShimmer } from "silvery"

export function StatusGlyph({
  glyph,
  active = false,
  color = "$muted",
}: {
  glyph: string
  active?: boolean
  color?: string
}): React.ReactElement {
  if (active) {
    return (
      <TextShimmer active highColor={color} lowColor="$muted">
        {glyph}
      </TextShimmer>
    )
  }
  return <Text color={color}>{glyph}</Text>
}
