import React from "react"
import { Screen, Text } from "silvery"
import type { Story } from "../types.ts"

export const chatBlockBoundaryBetweenExchanges: Story = {
  id: "ChatBlockBoundary/between-exchanges",
  component: "ChatBlockBoundary",
  variant: "between-exchanges",
  description: "A quiet boundary between projected turns.",
  render() {
    return (
      <Screen flexDirection="column">
        <Text>First turn complete.</Text>
        <Text>------------------------</Text>
        <Text>Next turn begins.</Text>
      </Screen>
    )
  },
}
