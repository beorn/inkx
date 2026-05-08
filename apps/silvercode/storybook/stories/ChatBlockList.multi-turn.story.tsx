import React from "react"
import { Screen, Text } from "silvery"
import type { Story } from "../types.ts"

export const chatBlockListMultiTurn: Story = {
  id: "ChatBlockList/multi-turn",
  component: "ChatBlockList",
  variant: "multi-turn",
  description: "Projected chat leaves with messages, tools, and notifications.",
  ownsScroll: true,
  render() {
    return (
      <Screen flexDirection="column">
        <Text>Projected leaves: user, assistant, tool, notification.</Text>
      </Screen>
    )
  },
}
