/**
 * Header Component
 *
 * Top bar showing board path, view mode, and search query.
 */

import type { ViewMode } from "../types.ts";

interface HeaderProps {
  rootPath: string | null;
  viewMode: ViewMode;
  searchQuery: string;
  searchMode: boolean;
}

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  cards: "Cards",
  list: "List",
  columns: "Columns",
  tabs: "Tabs",
};

export function Header({
  rootPath,
  viewMode,
  searchQuery,
  searchMode,
}: HeaderProps) {
  return (
    <box paddingLeft={1}>
      <text bold>{rootPath || "/"}</text>
      <text color="gray"> | </text>
      <text color="cyan">{VIEW_MODE_LABELS[viewMode]}</text>
      {searchMode && (
        <>
          <text color="gray"> | Search: </text>
          <text color="yellow">{searchQuery || "_"}</text>
        </>
      )}
      <text color="gray"> | q:quit v:view ?:help</text>
    </box>
  );
}

export default Header;
