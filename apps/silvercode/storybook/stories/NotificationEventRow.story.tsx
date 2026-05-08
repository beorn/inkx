import React from "react"
import { Screen, Text } from "silvery"
import type { Story } from "../types.ts"

function notificationStory(id: string, variant: string, label: string): Story {
  return {
    id: `NotificationEventRow/${id}`,
    component: "NotificationEventRow",
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

export const notificationEventRowAllSources = notificationStory("all-sources", "all-sources", "One row per source")
export const notificationEventRowTribeConcise = notificationStory("tribe-concise", "tribe-concise", "Concise Tribe rows")
export const notificationEventRowInlineSequence = notificationStory("inline-sequence", "inline-sequence", "Inline notification sequence")
