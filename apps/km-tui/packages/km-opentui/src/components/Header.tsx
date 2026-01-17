/**
 * Header Component
 *
 * Top bar showing breadcrumb path from board root to selected item.
 * Styled as full-width inverted bar (white background, black text) to match TUI1.
 *
 * Breadcrumb format:
 * - Board path: black text, gray separators (/)
 * - Item path: blue text, # separator at board boundary
 * Example: "Visual Test Board # Todo / Short task"
 */

export interface BreadcrumbSegment {
  id: string;
  title: string;
  isWithinBoard: boolean; // true for items within the board (columns/cards)
}

interface HeaderProps {
  rootPath: string | null;
  breadcrumbs: BreadcrumbSegment[];
  searchQuery: string;
  searchMode: boolean;
  width?: number;
}

export function Header({
  rootPath,
  breadcrumbs,
  searchQuery,
  searchMode,
  width,
}: HeaderProps) {
  // TUI1 style: full-width inverted bar with white background
  // Build path from rootPath + breadcrumbs

  // If we have breadcrumbs, show them; otherwise just show rootPath
  if (breadcrumbs.length === 0) {
    return (
      <box width={width || "100%"} backgroundColor="white">
        <text backgroundColor="white" color="black" bold>
          {" "}
          {rootPath || "/"}
        </text>
        {searchMode && (
          <>
            <text backgroundColor="white" color="gray">
              {" "}
              /{" "}
            </text>
            <text backgroundColor="white" color="blue" bold>
              {searchQuery || "_"}
            </text>
          </>
        )}
      </box>
    );
  }

  // Render breadcrumb path with styled separators
  // Build path string: "Board # Column / Card"
  // Use inverse styling (white text becomes black on white bg in inverse mode)
  // This works around OpenTUI color rendering issues

  // Build the full breadcrumb string
  const pathParts: string[] = [];
  if (rootPath) {
    pathParts.push(rootPath);
  }
  breadcrumbs.forEach((seg, idx) => {
    const separator = idx === 0 ? " # " : " / ";
    pathParts.push(separator + seg.title);
  });
  if (searchMode) {
    pathParts.push(" / " + (searchQuery || "_"));
  }
  const fullPath = " " + pathParts.join("") + " ";

  // Pad to full width
  const padding = width ? " ".repeat(Math.max(0, width - fullPath.length)) : "";

  return (
    <box width={width || "100%"}>
      <text inverse>
        {fullPath}
        {padding}
      </text>
    </box>
  );
}

export default Header;
