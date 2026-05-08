import React from "react"
import { Screen, Text } from "silvery"
import type { Story } from "../types.ts"

export const allTogether: Story = {
  id: "All/together",
  component: "All",
  variant: "together",
  description: "Representative Silvercode surface assembled from canonical components.",
  ownsScroll: true,
  render() {
    return (
      <Screen flexDirection="column">
        <Text>Projected chat, tools, notifications, and composer chrome.</Text>
      </Screen>
    )
  },
}
