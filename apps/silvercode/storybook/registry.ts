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
import { assistantBlockBasic } from "./stories/AssistantBlock.basic.story.tsx"
import { assistantBlockCode } from "./stories/AssistantBlock.code.story.tsx"
import { messageListEmpty } from "./stories/MessageList.empty.story.tsx"
import { messageListMultiTurn } from "./stories/MessageList.multi-turn.story.tsx"
import { permissionInboxOnePending } from "./stories/PermissionInbox.one-pending.story.tsx"
import { slashCommandPaletteOpen } from "./stories/SlashCommandPalette.open.story.tsx"
import { toolCallBlockBash } from "./stories/ToolCallBlock.bash.story.tsx"
import { toolCallBlockEdit } from "./stories/ToolCallBlock.edit.story.tsx"
import { toolCallBlockRunning } from "./stories/ToolCallBlock.running.story.tsx"
import { userMessageBlockShort } from "./stories/UserMessageBlock.short.story.tsx"
import { welcomeBasic } from "./stories/Welcome.basic.story.tsx"

/**
 * Canonical, ordered list of stories. Order is the runner's display order;
 * group by component, then by variant complexity (simple → complex).
 */
export const STORIES: readonly Story[] = [
  // Welcome surface
  welcomeBasic,
  // Message types
  userMessageBlockShort,
  assistantBlockBasic,
  assistantBlockCode,
  // Activity / status
  activityIndicatorThinking,
  // Tool calls — most varied surface
  toolCallBlockBash,
  toolCallBlockEdit,
  toolCallBlockRunning,
  // Higher-order: full conversation
  messageListEmpty,
  messageListMultiTurn,
  // Dialogs
  slashCommandPaletteOpen,
  permissionInboxOnePending,
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
