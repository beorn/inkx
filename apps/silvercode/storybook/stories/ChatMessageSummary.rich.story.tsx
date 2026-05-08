import React from "react"
import { Screen, Text } from "silvery"
import type { Story } from "../types.ts"

function summaryStory(id: string, variant: string, label: string): Story {
  return {
    id: `ChatMessageSummary/${id}`,
    component: "ChatMessageSummary",
    variant,
    description: label,
    render() {
      return (
        <Screen flexDirection="column">
          <Text>{label}</Text>
        </Screen>
      )
    },
  }
}

export const chatMessageSummaryRich = summaryStory("rich", "rich", "Grouped activity summary")
export const chatMessageSummaryActivityRich = summaryStory(
  "activity-rich",
  "activity-rich",
  "Expanded activity details",
)
