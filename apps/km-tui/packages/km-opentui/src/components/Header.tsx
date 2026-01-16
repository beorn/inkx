/**
 * Header Component
 *
 * Top bar showing board path, view mode, and search query.
 * Styled as full-width inverted bar (white background, black text) to match TUI1.
 */

interface HeaderProps {
  rootPath: string | null;
  searchQuery: string;
  searchMode: boolean;
  width?: number;
}

export function Header({
  rootPath,
  searchQuery,
  searchMode,
  width,
}: HeaderProps) {
  // TUI1 style: full-width inverted bar with white background
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

export default Header;
