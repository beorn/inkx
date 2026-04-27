/**
 * Silvercode Storybook — story registry.
 *
 * Static registry pattern (mirrors `vendor/silvery/examples/bin/registry.ts`):
 * every story is imported here by name. No filesystem discovery, no dynamic
 * imports — one place to see the full surface, plays well with bundlers,
 * easy to enumerate in tests.
 *
 * To add a story:
 *   1. Create `stories/<Component>.<variant>.story.tsx` exporting a `Story`.
 *   2. Import it here and append to `STORIES`.
 *   3. Tests in `tests/registry.test.ts` will pick it up automatically.
 *
 * Bead: km-silvercode.acp-storybook
 */

import type { Story } from "./types.ts"

import { activityIndicatorThinking } from "./stories/ActivityIndicator.thinking.story.tsx"
import { requestPermissionInboxOnePending } from "./stories/RequestPermissionInbox.one-pending.story.tsx"
import { availableCommandsPaletteOpen } from "./stories/AvailableCommandsPalette.open.story.tsx"
import { toolCallRead } from "./stories/ToolCall.read.story.tsx"
import { toolCallEdit } from "./stories/ToolCall.edit.story.tsx"
import { toolCallExecute } from "./stories/ToolCall.execute.story.tsx"
import { toolCallFailed } from "./stories/ToolCall.failed.story.tsx"
import { toolCallBashSummary } from "./stories/ToolCall.bash-summary.story.tsx"
import { toolCallSummary } from "./stories/ToolCallSummary.story.tsx"
import { applyPatch, applyPatchMulti } from "./stories/ApplyPatch.story.tsx"
import { sessionUpdateListEmpty } from "./stories/SessionUpdateList.empty.story.tsx"
import { sessionUpdateListMultiTurn } from "./stories/SessionUpdateList.multi-turn.story.tsx"
import { welcomeBasic } from "./stories/Welcome.basic.story.tsx"
// Wave B — ACP component family stories
import { sessionPromptComposerEmpty } from "./stories/SessionPromptComposer.empty.story.tsx"
import { sessionPromptComposerWithText } from "./stories/SessionPromptComposer.with-text.story.tsx"
import { sessionPromptComposerWithQueue } from "./stories/SessionPromptComposer.with-queue.story.tsx"
import { sessionPromptHistoryEntries } from "./stories/SessionPromptHistory.entries.story.tsx"
import { usageMeterFull } from "./stories/UsageMeter.full.story.tsx"
import { sessionExchangeDividerBetweenExchanges } from "./stories/SessionExchangeDivider.between-exchanges.story.tsx"
import { sessionRetryFailedExchange } from "./stories/SessionRetry.failed-exchange.story.tsx"
import { subAgentExchangeCollapsed } from "./stories/SubAgentExchange.collapsed.story.tsx"
import { ambientEventRowAllSources, ambientEventRowInlineSequence } from "./stories/AmbientEventRow.story.tsx"
import { allTogether } from "./stories/All.story.tsx"

/**
 * Canonical, ordered list of stories. Order is the runner's display order;
 * group by component, then by variant complexity (simple → complex).
 */
export const STORIES: readonly Story[] = [
  // The "everything" tour — every component pieced together as one
  // representative conversation. Useful for surveying the surface in a
  // single pane and for screenshot-driven design review.
  allTogether,
  // Welcome surface
  welcomeBasic,
  // Activity / status
  activityIndicatorThinking,
  // Tool calls — ACP-named ToolCall family (kind/status variants on the canonical
  // <ToolCall> renderer plus the aggregate <ToolCallSummary> and the
  // Aider-style <ApplyPatch>). See `hub/silvercode/future/ai-terminal/acp-naming.md`.
  toolCallRead,
  toolCallEdit,
  toolCallExecute,
  toolCallFailed,
  toolCallBashSummary,
  toolCallSummary,
  applyPatch,
  applyPatchMulti,
  // Higher-order: full conversation via SessionUpdateList
  sessionUpdateListEmpty,
  sessionUpdateListMultiTurn,
  // Conversation structure
  sessionExchangeDividerBetweenExchanges,
  sessionRetryFailedExchange,
  subAgentExchangeCollapsed,
  // Ambient observations (Phase 6.a — inline AmbientEventRow)
  ambientEventRowAllSources,
  ambientEventRowInlineSequence,
  // Prompt composer (Wave B — acp-session-prompt)
  sessionPromptComposerEmpty,
  sessionPromptComposerWithText,
  sessionPromptComposerWithQueue,
  sessionPromptHistoryEntries,
  // Usage / cost (Wave B — acp-usage-and-permission)
  usageMeterFull,
  // Dialogs
  availableCommandsPaletteOpen,
  requestPermissionInboxOnePending,
]

/** Look up a story by id. Returns null if unknown. */
export function findStory(id: string): Story | null {
  return STORIES.find((s) => s.id === id) ?? null
}

/** Group stories by component for the runner UI. */
export function groupByComponent(): ReadonlyMap<string, readonly Story[]> {
  const map = new Map<string, Story[]>()
  for (const s of STORIES) {
    const list = map.get(s.component) ?? []
    list.push(s)
    map.set(s.component, list)
  }
  return map
}
