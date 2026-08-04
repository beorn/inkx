/**
 * Built-in border character presets shared by every rendering target.
 *
 * This module is adapter-agnostic by design: terminal, canvas, DOM, and the
 * legacy render pipeline all consume the same immutable objects, so adding a
 * style cannot leave one target behind.
 */

export interface BorderPreset {
  readonly topLeft: string
  readonly topRight: string
  readonly bottomLeft: string
  readonly bottomRight: string
  readonly horizontal: string
  readonly vertical: string
}

export const BUILT_IN_BORDER_PRESETS = {
  single: {
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "─",
    vertical: "│",
  },
  double: {
    topLeft: "╔",
    topRight: "╗",
    bottomLeft: "╚",
    bottomRight: "╝",
    horizontal: "═",
    vertical: "║",
  },
  round: {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
  },
  bold: {
    topLeft: "┏",
    topRight: "┓",
    bottomLeft: "┗",
    bottomRight: "┛",
    horizontal: "━",
    vertical: "┃",
  },
  singleDouble: {
    topLeft: "╓",
    topRight: "╖",
    bottomLeft: "╙",
    bottomRight: "╜",
    horizontal: "─",
    vertical: "║",
  },
  doubleSingle: {
    topLeft: "╒",
    topRight: "╕",
    bottomLeft: "╘",
    bottomRight: "╛",
    horizontal: "═",
    vertical: "│",
  },
  classic: {
    topLeft: "+",
    topRight: "+",
    bottomLeft: "+",
    bottomRight: "+",
    horizontal: "-",
    vertical: "|",
  },
  hairline: {
    topLeft: "▏",
    topRight: "▏",
    bottomLeft: "▏",
    bottomRight: "▏",
    horizontal: "▔",
    vertical: "▏",
  },
} as const satisfies Record<string, BorderPreset>

export type BuiltInBorderStyle = keyof typeof BUILT_IN_BORDER_PRESETS

export function builtInBorderPreset(style: string | null | undefined): BorderPreset {
  return style && style in BUILT_IN_BORDER_PRESETS
    ? BUILT_IN_BORDER_PRESETS[style as BuiltInBorderStyle]
    : BUILT_IN_BORDER_PRESETS.single
}
