/**
 * Storybook host — the two-pane runner.
 *
 * Story list on the left, focused story on the right. j/k navigate the list,
 * h/l switch pane focus, q quits, ? toggles help.
 *
 * The runner is intentionally minimal: stories are the design surface; the
 * runner is just a way to flip between them. Each story owns its render
 * (including knob defaults) so there is no knob UI baked in. Stories with knobs
 * document them for future expansion; opening a story directly and the test
 * suite both bypass the runner anyway.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import {
  Box,
  InputLayerProvider,
  ListView,
  Muted,
  PopoverProvider,
  Screen,
  Scrollbar,
  Strong,
  Text,
  useApp,
  useFocusManager,
  useHover,
  useInput,
  useScrollController,
  useTerm,
  type Key,
  type ListViewHandle,
} from "@silvery/ag-react"
import { run } from "@silvery/ag-term/runtime"
import {
  StorybookHostInjectionProvider,
  useStorybookHostInjection,
  type StorybookHostInjection,
} from "./host-injection.tsx"
import {
  STORYBOOK_CHROME_ACTIVE_FG,
  STORYBOOK_CHROME_BG,
  STORYBOOK_CHROME_FG,
  STORYBOOK_CHROME_HOVER_BG,
  STORYBOOK_CHROME_MUTED_FG,
  STORYBOOK_CHROME_SELECTED_BG,
  Story,
  StoryScreen,
  type StoryLane,
  unwrapStoryScreen,
} from "./StorybookChrome.tsx"
import { resolveKnobs, type Story as StoryDef } from "./types.ts"

type Focus = "list" | "preview"

const LIST_PANE_WIDTH = 28
const LIST_LABEL_WIDTH = LIST_PANE_WIDTH - 4
const PREVIEW_SCROLLBAR_GUTTER = 5
const STORYBOOK_NAV_FOCUS_ID = "storybook-nav"
const STORYBOOK_PREVIEW_FOCUS_ID = "storybook-preview"

interface StoryListItem {
  label: string
  value: string
}

function StoryNavRow({
  label,
  onClick,
  selected,
}: {
  label: string
  onClick: () => void
  selected: boolean
}): React.ReactElement {
  const hover = useHover()
  return (
    <Box
      width="100%"
      backgroundColor={
        selected
          ? STORYBOOK_CHROME_SELECTED_BG
          : hover.isHovered
            ? STORYBOOK_CHROME_HOVER_BG
            : undefined
      }
      onClick={onClick}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      <Text
        color={selected ? STORYBOOK_CHROME_ACTIVE_FG : STORYBOOK_CHROME_FG}
        bold={selected}
        wrap="truncate"
      >
        {label}
      </Text>
    </Box>
  )
}

function truncateLabel(label: string, width: number): string {
  if (label.length <= width) return label
  if (width <= 1) return "…"
  return `${label.slice(0, width - 1)}…`
}

export interface AppProps {
  /** Optional: open this story id directly (skip the list cursor). */
  initialStoryId?: string
  /** Replaceable story list, used by the hot-reload runtime and tests. */
  stories?: readonly StoryDef[]
}

export function StorybookApp({ initialStoryId, stories = [] }: AppProps): React.ReactElement {
  const runtime = getHotStorybookRuntime()
  const { previewWrap } = useStorybookHostInjection()
  const { exit } = useApp()
  const focusManager = useFocusManager()
  const [focus, setFocusState] = useState<Focus>(() => runtime.viewState.focus)
  const restoredFocusRef = useRef(false)
  const [selectedStoryId, setSelectedStoryIdState] = useState<string | null>(() => {
    if (initialStoryId && stories.some((s) => s.id === initialStoryId)) return initialStoryId
    if (
      runtime.viewState.selectedStoryId &&
      stories.some((s) => s.id === runtime.viewState.selectedStoryId)
    ) {
      return runtime.viewState.selectedStoryId
    }
    return stories[0]?.id ?? null
  })
  const [showHelp, setShowHelp] = useState(false)

  const setFocus = useCallback(
    (next: Focus | ((prev: Focus) => Focus)) => {
      setFocusState((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next
        runtime.viewState.focus = resolved
        return resolved
      })
    },
    [runtime],
  )
  const setSelectedStoryId = useCallback(
    (next: string | null) => {
      runtime.viewState.selectedStoryId = next
      setSelectedStoryIdState(next)
    },
    [runtime],
  )
  const selectStoryFromPointer = useCallback(
    (next: string) => {
      setSelectedStoryId(next)
      setFocus("list")
      focusManager.focus(STORYBOOK_NAV_FOCUS_ID)
    },
    [focusManager, setFocus, setSelectedStoryId],
  )
  const ignoreListPointerCursor = useCallback(() => {}, [])

  useEffect(() => {
    if (restoredFocusRef.current) return
    restoredFocusRef.current = true
    focusManager.focus(focus === "list" ? STORYBOOK_NAV_FOCUS_ID : STORYBOOK_PREVIEW_FOCUS_ID)
  }, [focus, focusManager])

  const selectedIndex = selectedStoryId ? stories.findIndex((s) => s.id === selectedStoryId) : -1
  const cursor = selectedIndex >= 0 ? selectedIndex : 0
  const story: StoryDef | null = stories[cursor] ?? null
  const storyItems = useMemo(
    () => stories.map((s) => ({ label: truncateLabel(s.id, LIST_LABEL_WIDTH), value: s.id })),
    [stories],
  )
  const storyCountLabel = `${stories.length} ${stories.length === 1 ? "story" : "stories"}`
  const termCols = useTerm((term) => term.size.cols())
  const previewPaneCols = Math.max(1, termCols - LIST_PANE_WIDTH - PREVIEW_SCROLLBAR_GUTTER)

  useEffect(() => {
    if (stories.length === 0) {
      if (selectedStoryId !== null) setSelectedStoryId(null)
      return
    }
    if (selectedStoryId === story?.id) return
    const firstStory = stories[0]
    setSelectedStoryId(story?.id ?? firstStory?.id ?? null)
  }, [selectedStoryId, setSelectedStoryId, stories, story])

  // The runner owns only global keys (quit / help / focus switch). Story
  // navigation (j/k, arrows, PgUp/PgDn, Home/End, G) belongs entirely to the
  // <SelectList> below — it handles those keys whenever `isActive` is true.
  // Handling arrows here too double-dispatched every press (once via this
  // setCursor, once via SelectList's onCursor), moving the cursor by 2.
  useInput((input: string, key: Key) => {
    if (showHelp) {
      setShowHelp(false)
      return
    }
    if (input === "q" || (key.ctrl && input === "c")) return exit()
    if (input === "?") return setShowHelp(true)

    if (input === "h") {
      setFocus("list")
      focusManager.focus(STORYBOOK_NAV_FOCUS_ID)
      return
    }
    if (input === "l") {
      setFocus("preview")
      focusManager.focus(STORYBOOK_PREVIEW_FOCUS_ID)
      return
    }
  })

  if (showHelp) {
    return (
      <InputLayerProvider>
        <PopoverProvider>
          <Screen flexDirection="column">
            <Box flexDirection="column" paddingY={1}>
              <Strong>Storybook — keys</Strong>
              <Box flexDirection="column">
                <Text>j / k or ↓ / ↑ — move story cursor</Text>
                <Text>Tab / Shift-Tab — move focus through nav, preview, and story blocks</Text>
                <Text>h / l — jump pane focus (nav / preview)</Text>
                <Text>? — toggle this help</Text>
                <Text>q / Ctrl-C — quit</Text>
              </Box>
              <Box>
                <Muted>Press any key to dismiss.</Muted>
              </Box>
            </Box>
          </Screen>
        </PopoverProvider>
      </InputLayerProvider>
    )
  }

  const previewBody = story ? (
    <StoryFrame story={story} />
  ) : (
    <Text color={STORYBOOK_CHROME_MUTED_FG}>No stories registered.</Text>
  )
  const preview = previewWrap ? previewWrap(previewBody, previewPaneCols) : previewBody

  return (
    <InputLayerProvider>
      <PopoverProvider>
        <Screen flexDirection="column">
          <Box
            flexDirection="row"
            flexGrow={1}
            minWidth={0}
            minHeight={0}
            backgroundColor={STORYBOOK_CHROME_BG}
          >
            <Box
              id="storybook-list-pane"
              testID={STORYBOOK_NAV_FOCUS_ID}
              focusable
              autoFocus={focus === "list"}
              flexDirection="column"
              width={LIST_PANE_WIDTH}
              flexGrow={0}
              flexShrink={0}
              minWidth={LIST_PANE_WIDTH}
              maxWidth={LIST_PANE_WIDTH}
              overflow="hidden"
              backgroundColor={STORYBOOK_CHROME_BG}
              color={STORYBOOK_CHROME_FG}
              paddingTop={1}
              paddingBottom={0}
              paddingX={2}
              userSelect="contain"
              onFocus={() => setFocus("list")}
            >
              <Box flexDirection="column" paddingBottom={1}>
                <Strong color={STORYBOOK_CHROME_FG}>STORYBOOK</Strong>
                <Text color={STORYBOOK_CHROME_MUTED_FG}>{storyCountLabel}</Text>
              </Box>
              <Box flexDirection="column" flexGrow={1} minHeight={0}>
                <ListView<StoryListItem>
                  items={storyItems}
                  height={20}
                  estimateHeight={1}
                  nav
                  scrollbar={false}
                  overflowIndicator={false}
                  active={focus === "list"}
                  cursorKey={cursor}
                  onCursor={(index) => setSelectedStoryId(stories[index]?.id ?? null)}
                  onSelect={(index) => setSelectedStoryId(stories[index]?.id ?? null)}
                  onItemHover={ignoreListPointerCursor}
                  onItemClick={ignoreListPointerCursor}
                  getKey={(item) => item.value}
                  renderItem={(item, _index, meta) => (
                    <StoryNavRow
                      key={item.value}
                      label={item.label}
                      selected={meta.isCursor}
                      onClick={() => selectStoryFromPointer(item.value)}
                    />
                  )}
                />
              </Box>
            </Box>
            <Box
              id="storybook-preview-pane"
              testID={STORYBOOK_PREVIEW_FOCUS_ID}
              focusable
              autoFocus={focus === "preview"}
              flexDirection="column"
              flexGrow={1}
              flexShrink={1}
              minWidth={0}
              minHeight={0}
              overflow="hidden"
              paddingY={1}
              paddingLeft={0}
              paddingRight={0}
              backgroundColor={STORYBOOK_CHROME_BG}
              userSelect="contain"
              onFocus={() => setFocus("preview")}
            >
              {preview}
            </Box>
          </Box>
        </Screen>
      </PopoverProvider>
    </InputLayerProvider>
  )
}

function StoryFrame({ story }: { story: StoryDef }): React.ReactElement {
  const runtime = getHotStorybookRuntime()
  const knobs = useMemo(() => resolveKnobs(story), [story])
  const scroll = useScrollController()
  const ownedScrollListRef = useRef<ListViewHandle | null>(null)
  const restoredScrollStoryRef = useRef<string | null>(null)
  const registerOwnedScrollList = useCallback(
    (_sessionId: string, handle: ListViewHandle | null) => {
      ownedScrollListRef.current = handle
    },
    [],
  )
  const handleOwnedWheel = useCallback((event: { deltaY: number; preventDefault?: () => void }) => {
    const list = ownedScrollListRef.current
    const delta = event.deltaY
    if (!list || delta === 0) return
    event.preventDefault?.()
    const rows = delta > 0 ? Math.max(1, Math.round(delta)) : Math.min(-1, Math.round(delta))
    list.scrollBy(rows)
  }, [])
  const renderedStory = unwrapStoryScreen(
    story.render(knobs, {
      registerScrollList: story.ownsScroll ? registerOwnedScrollList : undefined,
    }),
    { fill: true },
  )
  const storyLane: StoryLane =
    story.contentPadding === "none" ? "none" : (story.contentLane ?? "prose")
  const body = (
    <Story fill={story.ownsScroll} lane={storyLane}>
      {renderedStory}
    </Story>
  )

  useEffect(() => {
    if (story.ownsScroll) return
    if (restoredScrollStoryRef.current === story.id) return
    restoredScrollStoryRef.current = story.id
    scroll.setScrollOffset(runtime.viewState.previewScrollByStory[story.id] ?? 0)
  }, [runtime, scroll, story.id, story.ownsScroll])

  useEffect(() => {
    if (story.ownsScroll) return
    runtime.viewState.previewScrollByStory[story.id] = scroll.scrollOffset
  }, [runtime, scroll.scrollOffset, story.id, story.ownsScroll])

  return (
    <StoryScreen
      description={story.description}
      title={story.id}
      onWheel={story.ownsScroll ? handleOwnedWheel : scroll.onWheel}
    >
      {(story.knobs ?? []).length > 0 && (
        <Box flexDirection="row" gap={1} paddingX={2} backgroundColor="$bg-surface-default">
          <Muted>knobs:</Muted>
          {(story.knobs ?? []).map((k) => (
            <Muted key={k.id}>
              {k.label}={String(knobs[k.id])}
            </Muted>
          ))}
        </Box>
      )}
      {story.ownsScroll ? (
        <Box
          flexDirection="column"
          flexGrow={1}
          flexShrink={1}
          minWidth={0}
          minHeight={0}
          paddingRight={2}
          backgroundColor={STORYBOOK_CHROME_BG}
        >
          {body}
        </Box>
      ) : (
        <Box
          flexDirection="column"
          flexGrow={1}
          flexShrink={1}
          minWidth={0}
          minHeight={0}
          position="relative"
          backgroundColor={STORYBOOK_CHROME_BG}
          userSelect="contain"
        >
          <Box
            flexDirection="column"
            flexGrow={1}
            flexShrink={1}
            minWidth={0}
            minHeight={0}
            overflow="scroll"
            backgroundColor={STORYBOOK_CHROME_BG}
            scrollOffset={scroll.scrollOffset}
            onLayout={(rect) => scroll.setViewportHeight(rect.height)}
          >
            <Box
              flexDirection="column"
              flexShrink={0}
              minWidth={0}
              paddingRight={3}
              backgroundColor={STORYBOOK_CHROME_BG}
              onLayout={(rect) => scroll.setContentHeight(rect.height)}
            >
              {body}
            </Box>
          </Box>
          {scroll.viewportHeight > 0 ? (
            <Scrollbar
              trackHeight={scroll.viewportHeight}
              scrollableRows={scroll.maxScroll}
              scrollOffset={scroll.scrollOffset}
              onScrollOffsetChange={scroll.setScrollOffset}
            />
          ) : null}
        </Box>
      )}
    </StoryScreen>
  )
}

interface HotStorybookStore {
  stories: readonly StoryDef[]
  listeners: Set<() => void>
  subscribe(listener: () => void): () => void
  publish(stories: readonly StoryDef[]): void
}

interface HotStorybookViewState {
  selectedStoryId: string | null
  focus: Focus
  previewScrollByStory: Record<string, number>
}

export interface HotStorybookRuntime {
  store: HotStorybookStore
  viewState: HotStorybookViewState
  handle?: Awaited<ReturnType<typeof run>>
  runToken?: symbol
  stopping?: Promise<void>
}

declare global {
  // Bun --hot re-evaluates modules while preserving globalThis. Keeping the
  // mounted runtime here lets story/module edits refresh the preview without
  // restarting the TUI or dropping list/scroll state.
  // eslint-disable-next-line no-var
  var __SILVERY_STORYBOOK_RUNTIME__: HotStorybookRuntime | undefined
}

function createHotStorybookStore(initialStories: readonly StoryDef[]): HotStorybookStore {
  return {
    stories: initialStories,
    listeners: new Set(),
    subscribe(listener) {
      this.listeners.add(listener)
      return () => this.listeners.delete(listener)
    },
    publish(stories) {
      this.stories = stories
      for (const listener of this.listeners) listener()
    },
  }
}

export function getHotStorybookRuntime(): HotStorybookRuntime {
  return (globalThis.__SILVERY_STORYBOOK_RUNTIME__ ??= {
    store: createHotStorybookStore([]),
    viewState: {
      selectedStoryId: null,
      focus: "list",
      previewScrollByStory: {},
    },
  })
}

function useHotStorybookStories(): readonly StoryDef[] {
  const runtime = getHotStorybookRuntime()
  return useSyncExternalStore(
    runtime.store.subscribe.bind(runtime.store),
    () => runtime.store.stories,
    () => runtime.store.stories,
  )
}

export function HotStorybookApp({
  initialStoryId,
  injection,
}: {
  initialStoryId?: string
  injection?: StorybookHostInjection
}): React.ReactElement {
  const stories = useHotStorybookStories()
  return (
    <StorybookHostInjectionProvider value={injection ?? {}}>
      <StorybookApp initialStoryId={initialStoryId} stories={stories} />
    </StorybookHostInjectionProvider>
  )
}

export async function startHotStorybookRuntime(
  initialStoryId?: string,
  injection?: StorybookHostInjection,
): Promise<"exited" | "replaced"> {
  const runtime = getHotStorybookRuntime()
  const runToken = Symbol("storybook-run")
  runtime.runToken = runToken
  const handle = await run(
    <HotStorybookApp initialStoryId={initialStoryId} injection={injection} />,
  )
  runtime.handle = handle
  let endedCurrentRun = false
  try {
    await handle.waitUntilExit()
    endedCurrentRun = runtime.runToken === runToken
  } finally {
    if (runtime.handle === handle) runtime.handle = undefined
    if (runtime.runToken === runToken) runtime.runToken = undefined
  }
  return endedCurrentRun ? "exited" : "replaced"
}

export async function stopHotStorybookRuntime(runtime: HotStorybookRuntime): Promise<void> {
  if (runtime.stopping) {
    await runtime.stopping
    return
  }
  const handle = runtime.handle
  if (!handle) return

  runtime.handle = undefined
  runtime.runToken = undefined
  const stoppingState: { promise?: Promise<void> } = {}
  const stopping: Promise<void> = (async () => {
    try {
      handle.unmount()
      await handle.waitUntilExit()
    } catch {
      // The old runtime may already be tearing itself down during a Bun hot
      // reload. Either way, the important invariant is that we don't publish
      // new React component functions into that old reconciler tree.
    } finally {
      if (runtime.stopping === stoppingState.promise) runtime.stopping = undefined
    }
  })()
  stoppingState.promise = stopping
  runtime.stopping = stopping
  await stopping
}

export interface RunStorybookOptions {
  /**
   * Open this story id on launch. Falls back to the persisted selection (across
   * a Bun `--hot` reload), then to the first registered story.
   */
  initialStoryId?: string
  /**
   * Consumer host injection — prose-lane and preview-pane responsive wrappers.
   * Defaults to plain silvery layout when omitted.
   */
  injection?: StorybookHostInjection
}

/**
 * Mount the two-pane storybook runner over a story list.
 *
 * Run via `bun --hot <entry>` so story-module edits refresh the preview in
 * place (list cursor, focus, and preview scroll are preserved). Stops any prior
 * hot runtime, publishes `stories`, starts a fresh run, and exits the process
 * on a clean quit.
 */
export async function runStorybook(
  stories: readonly StoryDef[],
  options: RunStorybookOptions = {},
): Promise<void> {
  const runtime = getHotStorybookRuntime()
  await stopHotStorybookRuntime(runtime)
  runtime.store.publish(stories)
  const initial = options.initialStoryId ?? runtime.viewState.selectedStoryId ?? undefined
  const result = await startHotStorybookRuntime(initial, options.injection)
  if (result === "exited") process.exit(0)
}
