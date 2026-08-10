import { useMemo } from "react"
import { type FileBrowserIcons, fileBrowserIcons } from "../ui/icons"
import { useTerm } from "./useTerm"

/**
 * The file-browser glyph pair for the terminal this app is running in.
 *
 * Reads `caps.maybeNerdFont` and resolves through {@link fileBrowserIcons}, so
 * a patched-font terminal gets the single-width line art and everything else
 * gets emoji that render without a special font.
 *
 * Defaults to the portable pair when there is no Term in scope — a non-terminal
 * target has no Nerd Font to detect, and tofu is the worse of the two failures.
 *
 * @example
 * ```tsx
 * const icons = useFileBrowserIcons()
 * return <Text>{isDirectory ? icons.directory : icons.file}</Text>
 * ```
 */
export function useFileBrowserIcons(): FileBrowserIcons {
  const term = useTerm()
  const maybeNerdFont = term?.caps.maybeNerdFont ?? false
  return useMemo(() => fileBrowserIcons(maybeNerdFont), [maybeNerdFont])
}
