import React from "react"
import {
  Box,
  InputBoundary,
  Prose,
  Screen,
  Strong,
  Text,
  useFocusManager,
  type BoxProps,
} from "@silvery/ag-react"
import { useStorybookHostInjection } from "./host-injection.tsx"

export const STORYBOOK_CHROME_BG = "#102124"
export const STORYBOOK_CHROME_FG = "#8fcfca"
export const STORYBOOK_CHROME_MUTED_FG = "#5f9893"
export const STORYBOOK_CHROME_ACTIVE_FG = "#ffffff"
export const STORYBOOK_CHROME_HOVER_BG = "#13282b"
export const STORYBOOK_CHROME_SELECTED_BG = "#173033"

export type StoryLane = "full" | "none" | "prose"
export type StoryPadding = "none" | "standard"

const STORY_SECTION_BODY_PADDING_X = 2
const STORY_SECTION_BODY_PADDING_Y = 1
const STORY_SECTION_OUTLINE_GUTTER = 1
const STORY_SECTION_FOCUS_INSET_X = 1
const STORY_SECTION_FRAME_PADDING_X = STORY_SECTION_OUTLINE_GUTTER + STORY_SECTION_FOCUS_INSET_X
const STORY_TITLE_PADDING_X = 2
const StorySectionBodyContext = React.createContext(false)

function FocusFrame({
  active,
  backgroundColor = "$bg-surface-default",
  children,
  ...props
}: BoxProps & {
  active: boolean
}): React.ReactElement {
  return (
    <Box
      {...props}
      backgroundColor={backgroundColor}
      outlineColor={active ? STORYBOOK_CHROME_ACTIVE_FG : undefined}
      outlineStyle={active ? "bold" : undefined}
    >
      {children}
    </Box>
  )
}

export function StoryScreen({
  children,
  description,
  title,
  ...props
}: Omit<BoxProps, "title"> & {
  description?: string
  title: string
}): React.ReactElement {
  return (
    <Box
      {...props}
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      backgroundColor={STORYBOOK_CHROME_BG}
      color="$fg"
    >
      <StoryTitleBand description={description} level="top" title={title} />
      {children}
    </Box>
  )
}

function StoryTitleBand({
  actions,
  description,
  focused = false,
  level = "nested",
  title,
}: {
  /** Optional right-aligned controls (e.g. corpus fold/unfold buttons). */
  actions?: React.ReactNode
  description?: string
  focused?: boolean
  level?: "top" | "nested"
  title: string
}): React.ReactElement {
  const titleColor = focused || level === "top" ? STORYBOOK_CHROME_ACTIVE_FG : STORYBOOK_CHROME_FG
  const paddingLeft =
    level === "top"
      ? STORY_SECTION_OUTLINE_GUTTER + STORY_TITLE_PADDING_X
      : Math.max(0, STORY_TITLE_PADDING_X - STORY_SECTION_FOCUS_INSET_X)
  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      width="100%"
      minWidth={0}
      paddingLeft={paddingLeft}
      paddingRight={STORY_TITLE_PADDING_X}
      paddingTop={level === "top" ? 1 : 0}
      paddingBottom={level === "top" ? 0 : 1}
      backgroundColor={focused ? STORYBOOK_CHROME_SELECTED_BG : STORYBOOK_CHROME_BG}
      color={STORYBOOK_CHROME_FG}
    >
      <Box flexDirection="row" width="100%" minWidth={0}>
        <Box flexGrow={1} flexBasis={0} minWidth={0}>
          <Strong color={titleColor} wrap="truncate">
            {title}
            {description ? (
              <Text color={STORYBOOK_CHROME_MUTED_FG} bold={false}>
                {`. ${description}`}
              </Text>
            ) : null}
          </Strong>
        </Box>
        {actions ? (
          <Box flexShrink={0} marginLeft={1}>
            {actions}
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

export function Story({
  children,
  fill = false,
  lane = "prose",
  minHeight,
  padding,
}: {
  children: React.ReactNode
  fill?: boolean
  lane?: StoryLane
  minHeight?: number
  padding?: StoryPadding
}): React.ReactElement {
  const inSectionBody = React.useContext(StorySectionBodyContext)
  const { proseLaneWrapper } = useStorybookHostInjection()
  if (lane === "none") {
    return <>{children}</>
  }
  const effectivePadding = padding ?? (inSectionBody ? "none" : "standard")
  const body = (
    <Box
      flexDirection="column"
      flexGrow={fill ? 1 : 0}
      flexShrink={fill ? 1 : 0}
      minWidth={0}
      minHeight={minHeight ?? (fill ? 0 : undefined)}
      paddingX={effectivePadding === "standard" ? STORY_SECTION_BODY_PADDING_X : undefined}
      paddingY={effectivePadding === "standard" ? STORY_SECTION_BODY_PADDING_Y : undefined}
      backgroundColor="$bg-surface-default"
      color="$fg"
    >
      {children}
    </Box>
  )
  if (lane === "full") return body
  return proseLaneWrapper ? (
    proseLaneWrapper(body)
  ) : (
    <Prose backgroundColor="$bg-surface-default">{body}</Prose>
  )
}

export function unwrapStoryScreen(
  node: React.ReactElement,
  { fill = false }: { fill?: boolean } = {},
): React.ReactNode {
  if (!React.isValidElement(node) || node.type !== Screen) return node
  const props = node.props as {
    children?: React.ReactNode
    flexDirection?: "row" | "column" | "row-reverse" | "column-reverse"
  }
  return (
    <Box
      flexDirection={props.flexDirection ?? "column"}
      flexGrow={fill ? 1 : 0}
      minWidth={0}
      minHeight={0}
    >
      {props.children}
    </Box>
  )
}

export function storyBlockTestId(title: string): string {
  return `storybook-block-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")}`
}

export function StorySection({
  actions,
  children,
  allowUnfocusedInput = false,
  description,
  minHeight,
  title,
}: {
  /** Optional right-aligned title-band controls (e.g. corpus fold/unfold). */
  actions?: React.ReactNode
  children: React.ReactNode
  allowUnfocusedInput?: boolean
  description?: string
  minHeight?: number
  title: string
}): React.ReactElement {
  const testID = storyBlockTestId(title)
  const { activeId } = useFocusManager()
  const focused = activeId === testID
  const body = (
    <Box
      flexDirection="column"
      flexGrow={0}
      flexShrink={0}
      minWidth={0}
      minHeight={0}
      paddingX={Math.max(0, STORY_SECTION_BODY_PADDING_X - STORY_SECTION_FOCUS_INSET_X)}
      paddingTop={STORY_SECTION_BODY_PADDING_Y}
      paddingBottom={STORY_SECTION_BODY_PADDING_Y}
      backgroundColor="$bg-surface-default"
      color="$fg"
      onClick={allowUnfocusedInput ? (event) => event.stopPropagation() : undefined}
    >
      <StorySectionBodyContext.Provider value>{children}</StorySectionBodyContext.Provider>
    </Box>
  )
  return (
    <Box
      flexDirection="column"
      flexGrow={0}
      flexShrink={0}
      minWidth={0}
      paddingTop={STORY_SECTION_OUTLINE_GUTTER}
      paddingX={STORY_SECTION_FRAME_PADDING_X}
      backgroundColor={STORYBOOK_CHROME_BG}
    >
      <FocusFrame
        active={focused}
        testID={testID}
        focusable
        flexDirection="column"
        flexGrow={0}
        flexShrink={0}
        width="100%"
        minWidth={0}
        minHeight={minHeight}
        backgroundColor={STORYBOOK_CHROME_BG}
      >
        <StoryTitleBand
          actions={actions}
          description={description}
          focused={focused}
          title={title}
        />
        {allowUnfocusedInput ? body : <InputBoundary active={focused}>{body}</InputBoundary>}
      </FocusFrame>
    </Box>
  )
}
